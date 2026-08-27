---
title: HUD Placement
---

# HUD Placement

"HUD" is often used for several different placement behaviors. In immersive
XR, default to UI placed in the world or attached to the object it controls.
That gives the interface a stable spatial reference and lets the viewer look
away from it. Use viewer-following UI only when information must remain easy to
find, and avoid rigid head attachment for ordinary panels.

## Choose the behavior

| Priority                   | Use                                                          | IWSDK mechanism                           |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Recommended XR default     | Panels and controls that belong to a place or object         | Authored world transform or object parent |
| Optional leashed XR UI     | Compact global UI that must remain discoverable              | `Follower` targeting `world.player.head`  |
| Browser-only overlay       | Menus or status UI outside immersive XR                      | `ScreenSpace`                             |
| Exceptional head-locked UI | Tiny, transient indicators that require exact view alignment | Parent to `world.playerHeadEntity`        |

`ScreenSpace` is not an in-XR head-locked HUD. Outside XR it temporarily
parents the UIKit document to the camera and applies CSS-like placement. When
XR starts, the document returns to its authored world transform.

## World-space UI: the XR default

Place normal panels in the scene, or parent contextual controls to the object
they affect. World-space UI remains stable as the viewer moves their head,
does not continuously occupy the same part of the view, and preserves the
spatial relationship between a control and its target.

Use the scene editor or an authored transform for placement. Check that the
panel is readable, reachable, and does not require excessive head or neck
movement on the target headset.

## Browser-only viewport overlay

```ts
import { ScreenSpace } from '@iwsdk/core';

hudEntity.addComponent(ScreenSpace, {
  width: '360px',
  height: '160px',
  top: '24px',
  right: '24px',
  zOffset: 0.2,
});
```

Use CSS strings for size and edge placement. Author a useful world transform as
well, because that transform becomes active during XR.

## Leashed in-XR UI

```ts
import { FollowBehavior, Follower, UIKitMLAsset } from '@iwsdk/core';

const panel = await world.assets.instantiate<UIKitMLAsset>('hud-panel');
const hudEntity = world.createTransformEntity(panel, { persistent: true });

hudEntity.addComponent(Follower, {
  target: world.player.head,
  offsetPosition: [0, 0, -1],
  behavior: FollowBehavior.PivotY,
  speed: 1,
  tolerance: 0.4,
  maxAngle: 30,
});
```

Use `Follower` for compact global UI that must remain available after the viewer
turns or moves. Its tolerance and angle thresholds create a dead zone, and its
speed smooths movement toward a new target instead of copying every head pose.
`PivotY` follows horizontal turns without applying head pitch or roll to the
placement target.

This is a fallback for discoverability, not the default for every panel. Moving
UI can still distract the viewer, so tune its distance, tolerance, angle, and
speed in a headset. There is no CSS-style `top` or `right` edge in immersive
space.

For corner-like placement, adjust the local X and Y values in
`offsetPosition`. Judge readability by angular size, not pixels: a panel with
world width `w` at distance `d` spans
`2 * atan(w / (2 * d))` radians. Measure the rendered panel and verify the
result on a headset rather than treating one distance as universal.

## Avoid rigid head attachment for panels

```ts
const marker = await world.assets.instantiate<UIKitMLAsset>('aim-marker');
const markerEntity = world.createTransformEntity(marker, {
  parent: world.playerHeadEntity,
});

markerEntity.object3D?.position.set(0, 0, -1);
```

An entity parented to `world.playerHeadEntity` inherits every viewer pose. That
1:1 motion can cause discomfort, obstruct the scene, and prevent the viewer
from looking away. Do not use it for menus, reading surfaces, or persistent
status panels.

Reserve direct head attachment for a small, transient, non-interactive marker
whose purpose requires exact view alignment, such as an aiming indicator. If a
reticle represents a world-space target, prefer placing it at the hit point or
focus depth instead. Verify any head-locked element on a headset and provide a
way to hide it when it is not needed.
