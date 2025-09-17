---
title: XR Origin & Spaces
---

# XR Origin & Spaces

`XROrigin` is the transform root for input. It contains Groups for the user’s head, ray spaces, and grip spaces. `XRInputManager` updates these from the XR frame each tick.

## Spaces

- `head`: viewer pose (HMD). Parent head‑attached UI here.
- `raySpaces.left/right`: target‑ray spaces for pointing.
- `gripSpaces.left/right`: grip spaces for holding tools/objects.
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

## Using spaces in your app

Attach your own tools to the spaces to keep them aligned in XR.

```ts
// A laser sight attached to the right ray
const sight = new Mesh(new CylinderGeometry(0.001, 0.001, 0.2), mat);
xrInput.xrOrigin.raySpaces.right.add(sight);

// A held gadget anchored to the left grip
const gadget = new Object3D();
gadget.position.set(0, -0.02, 0.05);
xrInput.xrOrigin.gripSpaces.left.add(gadget);
```

Head‑locked UI:

```ts
const hud = createReticleOrHUD();
hud.position.set(0, 0, -0.6);
xrInput.xrOrigin.head.add(hud);
```

## Coordinate spaces and conversions

- `XROrigin` itself lives in world space and can be moved/rotated (e.g., for locomotion). Its children spaces receive poses relative to the XR reference space.
- To convert a world‑space point to origin‑local (for e.g., cursor placement), use Three.js helpers:

```ts
const pLocal = cursorWorld.clone();
xrInput.xrOrigin.worldToLocal(pLocal);
```

## Tips

- Keep long‑lived objects parented under the appropriate space to avoid per‑frame copying of transforms.
- If you show secondary sources in your app, consider adding `secondaryRaySpaces`/`secondaryGripSpaces` under the origin to make their transforms visible in the scene graph.
