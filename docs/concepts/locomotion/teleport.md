---
title: Teleportation
---

# Teleport

Teleport offers high‑comfort navigation using a parabolic guide and a validated landing marker. It works with controllers and (optionally) hand micro‑gestures.

## How It Works

- Activation
  - With the right controller, tilt/press the thumbstick downward to enter teleport mode.
  - With hands, you can enable a micro‑gesture mode (see below) that keeps teleport active until a confirm gesture.

- Parabolic Guide
  - A curve is sampled from the ray origin in the ray direction using a gravity parameter (`rayGravity`, typically negative). The guide updates each frame.
  - Hit testing is delegated to the shared Locomotor via `requestHitTest(origin, dir)` which performs a parabolic raycast against registered environments.

- Landing Marker & Validation
  - The marker follows the locomotor’s `hitTestTarget` and orients to the surface normal.
  - Targets are considered valid when the hit is present and the normal faces upward (e.g., `normal.y > 0.7`). The marker color and scale provide feedback.

- Commit
  - On teleport deactivation (thumbstick release or gesture confirm), if the last target is valid the system calls `locomotor.teleport(position)`.

## Configuration

```ts
world.registerSystem(TeleportSystem, {
  configData: {
    locomotor, // shared Locomotor
    rayGravity: -0.4, // downward acceleration for arc
    microGestureControlsEnabled: false,
  },
});
```

- `rayGravity`
  - More negative values produce a tighter curve; less negative extends further. This also applies to hit testing.
- `microGestureControlsEnabled`
  - When true and in hand‑tracking, teleport remains active until a confirm gesture (e.g., thumb tap). When false, teleport is controller‑only.

## Tips

- Keep the arc visible only when active; hide the marker when invalid.
- Use the same gravity value for both visual arc and locomotor raycast to avoid desync.
- Validate against walkable surfaces only; reject steep slopes by thresholding the Y component of the normal.
