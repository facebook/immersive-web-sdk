---
title: World
---

# World

World owns the ECS runtime, Three.js scene + renderer, input, player rig, and is the gateway to XR. IWSDK extends the base elics World with WebXR‑specific facilities.

## World as Coordinator (Mental Model)

The World is the bridge between:

- ECS data (entities/components)
- 3D rendering (Three.js scene/camera/renderer)
- XR interaction (WebXR session via WebGLRenderer.xr)
- Content pipeline (asset manager, GLXF levels)

```text
Components ←→ Systems ←→ World ←→ Three.js/XR
                       └→ Assets/Levels
```

## Creating a World

```ts
import { World, SessionMode } from '@iwsdk/core';

const container = document.getElementById('scene') as HTMLDivElement;
const world = await World.create(container, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { enableLocomotion: true, enableGrabbing: true },
  level: '/glxf/Composition.glxf',
});
```

## Scene and Level Roots

- `getActiveRoot()` returns the current level root or scene root if no level.
- `getPersistentRoot()` always returns the global scene root.

Use these roots when you attach Three.js nodes outside ECS.

## Creating Entities

```ts
const e = world.createEntity(); // bare entity (no object3D, no Transform)
const t = world.createTransformEntity(); // entity + object3D + Transform
```

`createTransformEntity(object?, parentOrOptions?)` accepts:

- an existing `Object3D`
- `{ parent?: Entity; persistent?: boolean }` to choose the scene vs level parent

## Systems and Components

```ts
world.registerComponent(MyComponent);
world.registerSystem(MySystem);
```

IWSDK registers core systems for you (Input, Audio, UI). Optional features like Locomotion/Grabbing are enabled via `World.create(..., { features })`.

## XR Helpers

- `launchXR(overrides?)` – explicitly request a session using defaults set at creation; pass partial overrides per-launch.
- `exitXR()` – end the active session.
- `visibilityState: Signal<'non-immersive'|'hidden'|'visible'|'visible-blurred'>`

Offering sessions (navigator.xr.offerSession) is managed by `World.create` via the `xr.offer` option:

```ts
World.create(container, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    // 'none' | 'once' | 'always'
    offer: 'once',
  },
});
```

IWSDK vs elics: IWSDK adds XR helpers, scene ownership, and level wiring on top of elics’ ECS core.

## Update ordering and render loop

Each frame:

```text
update visibilityState → world.update(delta,time) → renderer.render(scene,camera)
```

Within `world.update`, systems run by ascending priority. Use negative priorities for input/physics that must precede visual updates.

## Levels

```ts
await world.loadLevel('/glxf/Cave.glxf');
```

The LevelSystem listens for requests and handles the load; when complete the world’s `activeLevel` signal updates.
