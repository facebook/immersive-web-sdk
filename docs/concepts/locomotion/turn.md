---
title: Turning
---

# Turn (Snap and Smooth)

Turning rotates the player rig around the vertical axis. IWSDK supports snap turns (instant yaw steps) and smooth turns (continuous yaw), controlled with the right thumbstick or optional hand micro‑gestures.

## Modes

- Snap Turn
  - Press left/right on the right thumbstick to rotate by a fixed angle (e.g., 45°).
  - In hand‑tracking with micro‑gestures enabled, quick directional gestures can trigger left/right snaps. Visual indicators appear next to the right ray.
  - Best default for comfort.

- Smooth Turn
  - Apply a continuous yaw while the right thumbstick is deflected left/right.
  - Configure degrees/second to tune sensitivity.
  - Preferred by experienced users; pair with teleport for comfort.

## Configuration

```ts
import { TurnSystem, TurningMethod } from '@iwsdk/core/locomotion';

world.registerSystem(TurnSystem, {
  configData: {
    turningMethod: TurningMethod.SnapTurn,
    turningAngle: 45, // degrees per snap
    turningSpeed: 180, // degrees/second for smooth mode
    microGestureControlsEnabled: false,
  },
});
```

## UX Notes

- Provide both options and let the user choose; persist the preference.
- Avoid mixing head‑based yaw while the user is physically turning to reduce motion conflict.
- Snap turn indicators should face the head and give brief visual feedback when triggered.
