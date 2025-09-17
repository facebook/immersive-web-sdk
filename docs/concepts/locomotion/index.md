---
title: Locomotion Overview
---

# Locomotion in XR

Comfortable, predictable movement is foundational to XR apps. IWSDK provides a modular locomotion stack that covers the three most common styles:

- Slide — analog stick walking with optional comfort vignette and jump.
- Teleport — arc‑based targeting with surface validation.
- Turn — snap or smooth yaw rotation.

Under the hood, these are powered by a lightweight physics engine (`@iwsdk/locomotor`) that runs either on the main thread or in a Web Worker for stability at XR frame rates. Environments are registered once, collision is accelerated by BVH, and kinematic platforms are supported.

## Why Locomotion Is Hard (and Important)

Locomotion is one of the trickiest parts of XR because it directly affects comfort, presence, and user trust. A small change in timings, acceleration, collision response, or visual feedback can be the difference between “it feels natural” and motion sickness.

- Competing motion cues
  - Your vestibular system expects physical movement; artificial translation without inner‑ear acceleration can cause discomfort (vection). Design mitigations like teleport, snap turn, or vignettes are essential.

- Frame‑rate pressure
  - XR targets 72–120 Hz and stereo rendering. Any stutter or physics hitch is amplified. Running locomotion off the main thread and avoiding allocations helps maintain steady motion.

- Scene complexity vs. collision fidelity
  - Real levels are heavy (instancing, skinned props, moving platforms). You need fast collision queries without a full rigid‑body stack. Our BVH shapecast approach provides reliable capsule collisions with low CPU overhead.

- Input diversity
  - Controllers and hand tracking demand different activation patterns and feedback (thumbsticks vs. micro‑gestures), yet should produce consistent motion semantics.

Because locomotion underpins everything else, we bias toward predictability and comfort out of the box (teleport + snap turn), while still letting you enable more advanced options (slide, smooth turn, jump) for users who want them.

## What You Get

- A shared Locomotor engine that computes grounded motion, collisions, gravity, jumping, and parabolic ray hits.
- ECS systems that map user input to movement:
  - [Slide](/concepts/locomotion/slide) — reads left thumbstick; emits motion vectors; optional vignette.
  - [Teleport](/concepts/locomotion/teleport) — draws a parabolic guide; validates targets; executes teleport.
  - [Turn](/concepts/locomotion/turn) — snap or smooth yaw with controller or hand micro‑gestures.
- An environment component to mark level geometry as walkable (static or kinematic).

## Core Ideas

- Player Collider — A capsule (0.5 m radius) with floating spring‑damper keeps you slightly above ground while respecting slopes and steps.
- Worker or Inline — By default, physics runs off the main thread and sends compact position updates; inline mode is available for very low‑latency control.
- Environments — You opt‑in meshes as walkable via a component; static ones are merged and indexed; kinematic ones stream transforms each frame.
- Parabolic Hit‑Tests — Teleport and other arc interactions raycast along a simulated trajectory with per‑frame culling for performance.

## Design Goals

- Comfort first
  - Ship sensible defaults (teleport + snap turn; moderate slide speeds; optional vignette) and let users opt into more intense modes.

- Deterministic, stable motion
  - Allocation‑free updates, worker execution by default, and interpolation on the main thread reduce micro‑stutters and jitter.

- Clear separation of concerns
  - Input systems decide “what the user wants to do”; the locomotor decides “how to move safely” (gravity, grounding, collisions).

- Explicit environment opt‑in
  - You choose which meshes are walkable and whether they’re static or kinematic. The engine never mutates your scene graph or builds physics from everything by default.

## Quick Start

```ts
import { World } from '@iwsdk/core';
import {
  LocomotionSystem,
  LocomotionEnvironment,
} from '@iwsdk/core/locomotion';
import { EnvironmentType } from '@iwsdk/locomotor';

// 1) Enable locomotion systems
world.registerSystem(LocomotionSystem, {
  configData: {
    slidingSpeed: 5,
    turningMethod: 1, // Snap
    turningAngle: 45,
    rayGravity: -0.4,
    useWorker: true,
  },
});

// 2) Mark your level as walkable
const level = world.createTransformEntity(gltf.scene);
level.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

// Optional: moving platform
const platform = world.createTransformEntity(platformMesh);
platform.addComponent(LocomotionEnvironment, {
  type: EnvironmentType.KINEMATIC,
});
```

## When to Use Which

- Slide
  - For continuous movement and exploration; add vignette if users report discomfort.
  - Set a reasonable max speed (4–6 m/s) and allow jump sparingly.

- Teleport
  - For comfort‑first navigation, room‑to‑room traversal, and quick vertical moves.
  - Combine with snap turn for broad accessibility.

- Smooth Turn
  - For experienced users; expose speed (deg/s) and provide a snap alternative.

Most apps ship both teleport + snap turn, and optionally enable sliding for users who prefer it.

### Comfort Checklist

- Offer a mode switcher (Teleport/Snap Turn/Smooth Turn/Slide) and remember the choice.
- Keep slide speeds moderate (4–6 m/s) and add a vignette with a quick ease in/out.
- Use upward‑normal validation for teleport (reject steep slopes or small ledges).
- Avoid sudden camera height changes; use the floating stand‑off and gentle step handling.
- Test on real devices at target refresh rates; a desktop browser tab is not a good proxy.

## How It Works (High Level)

```
Input (controllers/hands)
  ├─ SlideSystem → desired planar velocity → Locomotor.slide()
  ├─ TeleportSystem → arc + hit test → Locomotor.teleport()
  └─ TurnSystem → player yaw (no physics)

Locomotor (worker or inline)
  ├─ Ground detection (slope aware)
  ├─ Capsule collisions via BVH shapecast
  ├─ Gravity + floating spring‑damper
  └─ Parabolic raycast for hit tests

Player rig ← LocomotionSystem copies Locomotor.position each frame
```

## Next Steps

- [Slide](/concepts/locomotion/slide)
- [Teleport](/concepts/locomotion/teleport)
- [Turn](/concepts/locomotion/turn)
- [Performance](/concepts/locomotion/performance)
