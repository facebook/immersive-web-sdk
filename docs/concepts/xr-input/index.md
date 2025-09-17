---
title: XR Input Overview
---

# XR Input with IWSDK

This section explains how IWSDK’s XR input stack works and how to use it in your Three.js + WebXR apps. It covers controller/hand visuals, gamepad state, ray/grab pointers, and the XR origin rig (spaces for head, ray, and grip).

- If you want to jump to focused topics, see:
  - [Input Visuals](/concepts/xr-input/input-visuals)
  - [Stateful Gamepad](/concepts/xr-input/stateful-gamepad)
  - [Pointers](/concepts/xr-input/pointers)
  - [XR Origin](/concepts/xr-input/xr-origin)

## When to Use What (Guidance)

A quick decision guide to pick the right layer for input. The rule of thumb is separation of concerns: visuals render input; behaviors respond to events; advanced logic reads the gamepad; attachments live on XR spaces.

- Input Visuals — presentation only
  - Use to show controllers/hands and animate them from live input.
  - Do not implement game behavior in a visual’s `update` — keep it strictly render‑oriented (posing meshes, materials, effects). Launching projectiles, grabbing objects, etc. should live elsewhere.
  - If you need a specialized representation (e.g., a tool with custom meshes), create a custom visual implementation and swap it in at runtime.

- Pointer Events — default for interactions
  - Use for “click, hover, drag” style interactions that work across input modalities (controllers and hand tracking). The same handlers are driven by rays or near‑grabs.
  - Recommended first choice: reactively trigger app behavior from pointer events (`onClick`, `onPointerDown`, `onPointerMove`, …) rather than polling buttons.
  - Benefits: capture/cancel semantics, works with both ray and grab, and integrates cleanly with the scene graph.

- Stateful Gamepad — advanced/custom input
  - Use when you need logic that can’t be expressed as pointer events: combos, long‑press thresholds, two‑stick gestures, analog values, or non‑ray inputs.
  - Mapping‑aware: built on WebXR Input Profiles, so you can query by component id (e.g., `'xr-standard-squeeze'`) instead of device‑specific indices.
  - Combine with pointer events: e.g., use axes for locomotion and pointer events for UI.

- XR Origin Spaces — attaching objects
  - Use `xrOrigin.raySpaces.left/right` to attach tools aligned with the pointing ray.
  - Use `xrOrigin.gripSpaces.left/right` to attach held items (flashlights, gadgets).
  - Spaces are persistent; the system handles connect/disconnect and mapping to the current XR input source. You don’t need to listen for source changes.

Typical stack:

```
Visuals (render only)
    ↓
Pointers (primary interactions across modalities)
    ↓
Stateful Gamepad (advanced input & axes)
    ↓
XR Origin Spaces (where to attach tools)
```

## What the input system provides

- A rig of XR spaces (head, ray, grip) updated from the XR frame each tick.
- Visual adapters for controllers and hands that load GLTF models (WebXR Input Profiles) and animate them from live input.
- A `StatefulGamepad` helper that exposes edge‑triggered button events, 2D axes magnitudes, and per‑direction transitions.
- A `MultiPointer` that aggregates built‑in ray + grab pointers using `@pmndrs/pointer-events`.

## Quick Start

```ts
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { XRInputManager } from '@iwsdk/xr-input';

const scene = new Scene();
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
const renderer = new WebGLRenderer({ antialias: true });
renderer.xr.enabled = true;

// 1) Create input manager
const xrInput = new XRInputManager({ scene, camera });
scene.add(xrInput.xrOrigin); // parent the rig

// 2) Optional: react to the primary adapter (left/right)
xrInput.visualAdapters.left.subscribe((adapter) => {
  console.log('Left primary is now', adapter?.constructor.name);
});

// 3) In your frame loop
renderer.setAnimationLoop((timeMs) => {
  const time = timeMs / 1000;
  const delta = renderer.clock.getDelta();
  xrInput.update(renderer.xr, delta, time);
  renderer.render(scene, camera);
});
```

### Example: cross‑modal button using pointer events

```ts
const button = new Mesh(
  new BoxGeometry(0.12, 0.02, 0.12),
  new MeshStandardMaterial(),
);
(button as any).onClick = () => spawnProjectile(); // works with controllers & hands
scene.add(button);
```

### Example: advanced logic with StatefulGamepad

```ts
const pad = xrInput.gamepads.right;
if (pad?.getButtonDown('xr-standard-trigger')) spawnProjectile();
if (pad?.getAxesEnteringLeft('xr-standard-thumbstick')) snapTurn(-30);
```

### Example: attaching tools to spaces

```ts
const gizmo = new Object3D();
gizmo.position.set(0, -0.02, 0.05);
xrInput.xrOrigin.gripSpaces.left.add(gizmo);
```

## How the pieces fit together

```
XRSession → XRFrame → update poses
             │
             ├─ XROrigin (head, ray L/R, grip L/R)
             │
             ├─ Visual Adapters
             │    • Controller (GLTF, animated via input profile)
             │    • Hand (skinned, outline, pinch helper)
             │
             └─ MultiPointer (ray + grab via @pmndrs/pointer-events)
                   • select → ray pointer
                   • squeeze → grab pointer
                   • edge events from StatefulGamepad
```

## When to use which piece

- Use [XR Origin](/concepts/xr-input/xr-origin) to attach your own tools to ray/grip spaces.
- Use [Input Visuals](/concepts/xr-input/input-visuals) to show hands/controllers and customize assets.
- Use [Stateful Gamepad](/concepts/xr-input/stateful-gamepad) to read buttons/axes with edge triggers.
- Use [Pointers](/concepts/xr-input/pointers) for ray selections and near grabbing against your Three.js scene.

## Requirements

- Three.js r160+ (peer dependency).
- A WebXR‑capable browser/runtime; controllers expose `inputSource.gamepad`.
- For ray/grab hit‑testing in your scene, your objects should be visible to the pointer‑events intersector (defaults to standard meshes).
