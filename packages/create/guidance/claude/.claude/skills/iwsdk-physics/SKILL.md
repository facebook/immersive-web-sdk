---
name: iwsdk-physics
description: Guide for implementing physics in IWSDK projects. Use when adding physics simulation, configuring rigid bodies, collision shapes, applying forces, creating grabbable physics objects, or troubleshooting physics behavior.
---

# IWSDK Physics System Guide

This skill provides the complete reference and workflow for implementing Havok-powered physics simulation in IWSDK applications. Physics is built on three ECS components (`PhysicsBody`, `PhysicsShape`, `PhysicsManipulation`) orchestrated by the `PhysicsSystem`.

## Enabling Physics

Enable physics in `iwsdk.config.json` with the `physics` feature flag:

```jsonc
{
  "scene": "./public/scenes/physics.iwsdk.scene.json",
  "world": {
    "xr": { "mode": "vr" },
    "features": {
      "physics": true,
      "grabbing": true,
      "locomotion": true
    }
  }
}
```

Setting `physics: true` automatically registers `PhysicsBody`, `PhysicsShape`, `PhysicsManipulation` components and the `PhysicsSystem` at priority `-2`.

**Only enable physics when needed.** If no objects require dynamic simulation, omit it to avoid overhead.


## Reference files

Read the one the task needs; each is complete on its own.

- **Component fields, enums and shape dimensions** → [references/component-reference.md](references/component-reference.md)
- **Workflows** — dynamic bodies, static colliders, kinematic platforms, grabbables, forces, custom systems, a full playground example → [references/workflows.md](references/workflows.md)
- **Material tuning, system priority, `PhysicsSystem` config, scene JSON** → [references/tuning-and-config.md](references/tuning-and-config.md)

## Troubleshooting

**Objects fall through the floor:**

- Ensure the floor entity has both `PhysicsShape` and `PhysicsBody` with `state: PhysicsState.Static`
- Verify the shape type and dimensions match the visual geometry
- If the `Auto` or `ConvexHull` is selected for the PhysicsShape of static objects, try to change into `TriMesh`
- Check that `physics: true` is set in `iwsdk.config.json` world features

**Objects don't move:**

- Confirm `state` is `PhysicsState.Dynamic` (not Static or Kinematic)
- Check `gravityFactor` is > 0
- Verify both `PhysicsShape` and `PhysicsBody` are added (both are required)

**Objects are too bouncy or slide too much:**

- Lower `restitution` to reduce bouncing (0 = no bounce)
- Increase `friction` to reduce sliding (0.8+ for grippy surfaces)

**Objects move too slowly or feel sluggish:**

- Reduce `linearDamping` (0 = no air resistance)
- Check `density` is not too high (high density = heavy = resists force)

**Poor frame rate with many physics objects:**

- Use simpler shape types (Sphere/Box instead of ConvexHull/TriMesh)
- Use `TriMesh` only for static objects
- Explicitly set shape types instead of `Auto` to avoid detection overhead
- Reduce the number of dynamic bodies; make non-essential objects static

**Grabbed object doesn't follow hand:**

- Ensure `grabbing: true` in features
- Verify the entity has `RayInteractable` and a grabbable component (`OneHandGrabbable`, `TwoHandsGrabbable`, or `DistanceGrabbable`)

**PhysicsManipulation has no effect:**

- The entity must have a `PhysicsBody` with an active engine body (`_engineBody != 0`)
- The component is auto-removed after one frame; re-add it for sustained effects
- Force values may need to be larger; they are scaled by frame delta time

## Performance Tips

1. **Use primitive shapes** (Sphere, Box, Cylinder) over ConvexHull/TriMesh whenever acceptable
2. **Use `PhysicsState.Static`** for all non-moving objects; static bodies have zero simulation cost
3. **Explicitly set shape types** in production; avoid `Auto` detection overhead
4. **Minimize dynamic body count** -- each dynamic body requires per-frame transform sync
5. **Use damping** to settle objects faster and reduce ongoing simulation work
6. **TriMesh is for static only** -- it is computationally expensive and should never be used on dynamic bodies
