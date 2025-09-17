---
title: Pointers (Ray & Grab)
---

# Pointers (Ray & Grab)

The input stack includes a `MultiPointer` per hand that aggregates a ray pointer (far interactions) and a grab pointer (near interactions), powered by `@pmndrs/pointer-events`.

## Concepts

- `CombinedPointer` routes events to whichever sub‑pointer is “active”.
- Built‑ins:
  - `RayPointer` — uses the XR target ray to raycast your scene. Visualizes a beam and a 2D cursor that aligns to surface normals.
  - `GrabPointer` — anchored at the grip space for near interactions (e.g., grabbing widgets at your hand).
- Event mapping from `StatefulGamepad`:
  - `select` → ray pointer (button 0)
  - `squeeze` → grab pointer (button 2)

## Using the multipointer

```ts
const mpLeft = xrInput.multiPointers.left;
const mpRight = xrInput.multiPointers.right;

// Toggle built‑ins
mpLeft.toggleSubPointer('ray', true);
mpLeft.toggleSubPointer('grab', true);

// Make grab the default target for generic events
mpLeft.setDefault('grab');

// Check if ray is currently targeting something
if (mpRight.getRayBusy()) {
  // show a tooltip, etc.
}
```

You normally don’t need to call `update` — the `XRInputManager` drives both multipointers each frame, enabling them only when a gamepad is present on the primary source.

## Making objects interactive

`@pmndrs/pointer-events` augments Three.js with pointer events. Assign handlers to your meshes/materials; the ray/ grab pointers will dispatch to them.

```ts
import { Mesh, MeshStandardMaterial, BoxGeometry } from 'three';

const button = new Mesh(
  new BoxGeometry(0.1, 0.02, 0.1),
  new MeshStandardMaterial({ color: '#3355ff' }),
);
button.position.set(0, 1.4, -0.6);

// Handlers use the pointer-events event model
(button as any).onPointerEnter = () =>
  (button.material as any).emissive?.set('#2233aa');
(button as any).onPointerLeave = () =>
  (button.material as any).emissive?.set('#000000');
(button as any).onClick = () => console.log('Clicked by XR ray');
scene.add(button);
```

The `RayPointer` uses an optimized raycaster (`firstHitOnly = true`) for BVH‑accelerated scenes.

## Visual policy (ray + cursor)

The ray visual follows a simple policy:

- If the ray pointer has capture → show ray, hide cursor.
- If any non‑ray pointer has capture → hide ray and cursor.
- Otherwise → show both when intersecting.

This reduces clutter when, e.g., your grab pointer is manipulating something.

## Custom pointers

You can build and register your own `Pointer` (from `@pmndrs/pointer-events`). Register with `CombinedPointer.register(pointer, isDefault)` and keep a reference to unregister later.

```ts
import { CombinedPointer, createPointer } from '@pmndrs/pointer-events';

const myPointer = createPointer(/* your spatial transform source */);
const unregister = (xrInput as any).multiPointers.left['combined'].register(
  myPointer,
  false,
);
// later
unregister();
```

Tip: Mirror how `RayPointer` constructs its pointer — it supplies a camera getter and a `{ current: Group }` for the space whose world transform you want to use.

## Troubleshooting

- No click events: ensure the primary input source on that side has a gamepad (some hand‑tracking runtimes don’t). The multipointer enables only when connected.
- Cursor misaligned on slanted surfaces: confirm surface normals make sense in object space; the ray visual converts them to world space via the normal matrix.
