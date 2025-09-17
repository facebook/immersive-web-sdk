---
title: Locomotion Performance
---

# Performance & Architecture

This page explains how the locomotion stack stays fast at XR frame rates and what trade‑offs to consider when deploying.

## Worker vs Inline

- Worker Mode (default)
  - The locomotion engine runs inside a Web Worker at a fixed update rate (`updateFrequency`, default 60 Hz).
  - Each tick, the worker posts compact updates (position, grounded flag), and the main thread interpolates smoothly toward the new position.
  - Pros: isolates physics from render spikes, improves frame stability on the main thread, scales well when the scene is busy.
  - Cons: a small amount of control latency; interpolation hides most of it.

- Inline Mode
  - The engine runs on the main thread via `locomotor.update(delta)`. Use this when you need ultra‑responsive controls and can afford the CPU budget.
  - Pros: lowest input‑to‑motion delay.
  - Cons: competes with rendering; be cautious on lower‑end devices.

### Guidance

- Prefer worker mode for production XR; drop to inline only for specific cases (tight timing gameplay, heavy per‑frame coupling).
- Tune `updateFrequency` if needed; higher rates cost more CPU in the worker.
- The engine sleeps automatically when grounded on static geometry for a short timeout to reduce message traffic.

## BVH, Not Full Rigid‑Body Physics

Locomotion uses a focused set of physics operations designed for character movement rather than a full rigid‑body solver:

- Capsule vs Triangle Mesh
  - Collisions use a BVH shapecast against triangle meshes. This is fast, robust, and avoids complex contact solving.

- Grounding & Float
  - A spring‑damper targets a small stand‑off above the surface, smoothing micro‑bumps and preventing jitter.

- Parabolic Raycasts
  - Teleport and similar interactions raycast along an analytical parabolic trajectory. A broad‑phase AABB culls environments before segment tests.

Benefits:

- Deterministic, allocation‑free hot path (no per‑frame garbage), predictable CPU use.
- No physics step ordering problems with other rigid bodies.
- Easy to integrate kinematic platforms by streaming transforms; velocities are derived for inheritance.

## Environment Registration & Kinematic Platforms

- Static Environments
  - Walkable hierarchies are merged to a single geometry and indexed once. World scale is normalized to 1 at the root for stable math.

- Kinematic Environments
  - Mark moving platforms as kinematic. The SDK streams updated world matrices each frame; the engine computes delta position/rotation and a velocity vector that is added while grounded.
  - The BVH is refit only when motion occurs; small motions are cheap.

## Practical Tips

- Author level meshes with clean topology; avoid extremely thin features that can snag a capsule.
- Keep player collider assumptions in mind (≈1.8 m height, 0.5 m radius by default) when sizing stairs and doorways.
- For very large levels, segment into multiple environments so BVH bounds cull more aggressively.
- Avoid per‑frame environment rebuilds; use kinematic updates instead of re‑adding geometry.
