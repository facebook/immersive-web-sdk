---
title: Slide Locomotion
---

# Slide (Analog Movement)

Slide provides continuous locomotion driven by the left thumbstick (or equivalent input). Motion is computed relative to the user’s head yaw, preserving orientation while keeping vertical motion under engine control (gravity, steps, slopes).

## How It Works

- Input → Vector
  - The left stick produces a 2D vector (x, y). IWSDK rotates this by the head’s world yaw to get a world‑space direction.
  - The vector is normalized and scaled by `maxSpeed` to produce a desired planar velocity.

- Engine Integration
  - `SlideSystem` calls `locomotor.slide(vec3)`. The locomotor’s `MovementController` applies acceleration/deceleration and reduced air control; collisions and ground constraints happen in the physics step.
  - When the stick returns to center, `slide(0,0,0)` is sent to actively decelerate.

- Jump
  - Press the configured `jumpButton` (default: A button) to trigger `locomotor.jump()`. Jump height and cooldown are configurable.

## Comfort Vignette

Sliding can induce vection. IWSDK includes a dynamic peripheral vignette to help:

- Behavior
  - A subtle cylinder mask is parented to the head and rendered last (transparent). Its alpha animates with input magnitude × `comfortAssist`.
  - At small inputs, the vignette is near invisible; at full tilt, it occludes more of the periphery.

- Tuning
  - `comfortAssist` in `SlideSystem` ranges [0..1]. Set to `0` to disable; `0.4–0.6` is a common default.
  - Keep `maxSpeed` reasonable (4–6 m/s) to minimize discomfort.

- Tips
  - Fade vignette quickly (lerp ~10 Hz) to avoid laggy sensation.
  - Consider enabling vignette only while moving, with a short fade‑out on stop.

## Configuration

```ts
world.registerSystem(SlideSystem, {
  configData: {
    locomotor, // shared Locomotor instance from LocomotionSystem
    maxSpeed: 5, // meters/second
    comfortAssist: 0.5, // 0 disables vignette
    jumpButton: 'a', // any InputComponent id
  },
});
```

Engine parameters affecting slide (surfaced via `LocomotionSystem → Locomotor.updateConfig`):

- `jumpHeight` — meters to apex (default 1.5).
- `jumpCooldown` — seconds between jumps (default 0.1).

## Best Practices

- Offer both teleport and slide; default to teleport + snap turn for new users.
- Use head‑relative direction; avoid rotating input by controller grip to reduce unintended strafing.
- Avoid applying manual vertical motion during slide; let physics handle gravity and slopes.
