---
title: XR Origin & Spaces
---

# XR Origin & Spaces

`XROrigin` is the persistent local player origin. IWSDK creates it for every world, including browser-only worlds created with `xr: false`, and keeps `world.camera` parented under it. In XR, `XRInputManager` updates the head, ray, and grip spaces from the XR frame each tick. Outside XR, the origin is still useful as the coordinate space you can later hand to XR without rebuilding your scene graph.

For first-person browser movement, move `world.player` and leave `world.camera` as the viewer under that rig. For orbit, editor, product, cinematic, or third-person views, it is fine to keep `world.player` at the origin and drive `world.camera` locally. `world.camera.position` is local to `world.player`; call `world.camera.getWorldPosition(...)` when you need the viewer's world-space position.

## Spaces

- `head`: viewer pose (HMD). Use it as a tracking target; avoid parenting normal
  UI panels directly to it.
- `raySpaces.left/right`: target‑ray poses for pointing.
- `gripSpaces.left/right`: full grip poses for holding tools/objects.
- `secondaryRaySpaces.left/right`: additional spaces used when a non‑primary source is present.
- `secondaryGripSpaces.left/right`: likewise for grips.

Only `head`, primary `raySpaces`, and primary `gripSpaces` are added as children of the origin by default. Secondary spaces are updated but not parented for rendering since their visuals are hidden; you may parent or visualize them if needed.

## Lifecycle and updates

Each frame (`XRInputManager.update`):

1. For each detected `XRInputSource`, choose the appropriate target spaces (primary vs secondary) for that side.
2. Copy pose matrices from `XRFrame.getPose(...)` into the chosen `ray` and `grip` groups.
3. If the source lacks `gripSpace`, the adapter mirrors the ray transform into the grip.
4. Update the head from `getViewerPose`.
5. Call `xrOrigin.updateMatrixWorld(true)` before pointer updates.

## Orientation conventions

Each XR space contains both position and orientation. The local negative Z axis
of a target-ray space is its pointing direction. A controller grip uses the
device profile's physical holding pose, which is not necessarily parallel to
the pointing ray.

Parent a held model to a grip space, then adjust the model's local position and
rotation so its handle aligns with the controller. Do not copy only the grip
position or assume the ray and grip orientations are interchangeable. When an
input source has no `gripSpace`, IWSDK mirrors its ray pose into the matching
grip space.

## Using spaces in your app

Attach your own tools to the spaces to keep them aligned in XR.

```ts
// A laser sight attached to the right ray
const sight = new Mesh(new CylinderGeometry(0.001, 0.001, 0.2), mat);
world.input.xr.xrOrigin.raySpaces.right.add(sight);

// A held gadget anchored to the left grip
const gadget = new Object3D();
gadget.position.set(0, -0.02, 0.05);
world.input.xr.xrOrigin.gripSpaces.left.add(gadget);
```

If the model's authored axes do not match the controller handle, set its local
`rotation` or `quaternion` before attaching it. That alignment is specific to
the model; it is not a universal grip-space correction.

Exact view-aligned marker (limited use):

```ts
const marker = createSmallAimMarker();
marker.position.set(0, 0, -1);
world.input.xr.xrOrigin.head.add(marker);
```

Direct children inherit every head movement. Reserve this for small, transient
markers that require exact view alignment—not menus, text panels, or persistent
status UI. Prefer world-space placement for ordinary UI and a thresholded
`Follower` when compact global UI must remain discoverable. See
[HUD Placement](/concepts/spatial-ui/hud).

## Coordinate spaces and conversions

- `XROrigin` itself lives in world space and can be moved/rotated (e.g., for locomotion). Its children spaces receive poses relative to the XR reference space.
- To convert a world‑space point to origin‑local (for e.g., cursor placement), use Three.js helpers:

```ts
const pLocal = cursorWorld.clone();
world.input.xr.xrOrigin.worldToLocal(pLocal);
```

## Tips

- Keep long‑lived objects parented under the appropriate space to avoid per‑frame copying of transforms.
- If you show secondary sources in your app, consider adding `secondaryRaySpaces`/`secondaryGripSpaces` under the origin to make their transforms visible in the scene graph.
