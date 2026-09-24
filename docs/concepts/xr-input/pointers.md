---
title: Pointers (Canvas, Ray, Grab & Gaze)
---

# Pointers (Canvas, Ray, Grab & Gaze)

IWSDK uses pointer events as the common interaction path for browser canvas
input and XR input. Browser mouse/touch events are forwarded from the renderer
canvas when `input.canvasPointerEvents` is enabled. XR uses a `MultiPointer` per
hand for ray and grab interactions, plus one session-wide `GazePointer` when
gaze tracking is requested. Every path dispatches Three/Object3D pointer events
and drives ECS `Hovered` / `Pressed` tags for interactable entities.

## Concepts

- `CombinedPointer` routes events to whichever sub‑pointer is “active”.
- `CanvasPointerSystem` forwards DOM pointer events into the Three scene for browser 3D apps.
- Built‑ins:
  - `RayPointer` — uses the XR target ray to raycast your scene. Visualizes a beam and a 2D cursor that aligns to surface normals.
  - `GrabPointer` — anchored at the grip space for near interactions (e.g., grabbing widgets at your hand).
  - `GazePointer` — targets through a filtered gaze ray and selection cone;
    either hand's pinch supplies the select action.
- Event mapping from `StatefulGamepad`:
  - `select` → ray pointer (button 0)
  - `squeeze` → grab pointer (button 2)

## Using the multipointer

```ts
const mpLeft = world.input.xr.multiPointers.left;
const mpRight = world.input.xr.multiPointers.right;

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

You normally don’t need to call `update` — `world.input.xr` drives both multipointers each frame, enabling them only when a gamepad is present on the primary source.

## Making objects interactive

`@pmndrs/pointer-events` augments Three.js with pointer events. Assign handlers to your meshes/materials; browser canvas pointers and XR ray/grab pointers will dispatch to them.

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
(button as any).onClick = () => console.log('Clicked by pointer');
scene.add(button);
```

The `RayPointer` uses an optimized raycaster (`firstHitOnly = true`) for BVH‑accelerated scenes. Browser canvas events use the same interactable target lists maintained by `InputSystem`, so `RayInteractable` means "selectable by a pointer/ray" rather than "XR only."

Pointers treat objects whose Three.js `visible` property is `false` as transparent to hit testing, including descendants hidden by an ancestor, so a pointer reaches whatever sits behind the hidden object instead of stopping on it. UIKit components use UIKit's semantic visibility signal instead of the raw Three.js flag, so a renderless UIKit component can remain interactive while a hidden UIKit component is excluded. Only the built-in pointers set `filter: isObjectTreeVisible` in their pointer options by default. To get the same behavior on a custom pointer, import `isObjectTreeVisible` from `@iwsdk/xr-input` and pass it as the `filter` option.

## Browser canvas pointers

Canvas pointer forwarding is enabled by default:

```ts
const world = await World.create(container, {
  xr: false,
  input: {
    canvasPointerEvents: true,
  },
});
```

Use `canvasPointerEvents: { activeDuringXR: true }` only when you intentionally want mouse/touch events on the mirror canvas during an immersive session. The default is to pause browser canvas forwarding while XR is active so it does not interfere with controller or hand input.

## Visual policy (ray + cursor)

The ray visual follows a simple policy:

- If the ray pointer has capture → show ray, hide cursor.
- If any non‑ray pointer has capture → hide ray and cursor.
- Otherwise → show both when intersecting.

This reduces clutter when, e.g., your grab pointer is manipulating something.

The gaze pointer has no production cursor by default. While valid gaze is
available, it owns far targeting and suppresses controller/hand ray pointers.
An active near touch or grab takes priority over gaze. See
[Gaze and Pinch](/concepts/xr-input/gaze) for configuration, fallback behavior,
and test workflows.

## Custom pointers

You can build and register your own `Pointer` (from `@pmndrs/pointer-events`). Register with `CombinedPointer.register(pointer, isDefault)` and keep a reference to unregister later.

```ts
import { CombinedPointer, createPointer } from '@pmndrs/pointer-events';

const myPointer = createPointer(/* your spatial transform source */);
const unregister = (world.input.xr as any).multiPointers.left[
  'combined'
].register(myPointer, false);
// later
unregister();
```

Tip: Mirror how `RayPointer` constructs its pointer — it supplies a camera getter and a `{ current: Group }` for the space whose world transform you want to use.

## Troubleshooting

- No browser click events: confirm `input.canvasPointerEvents` is enabled and the object has an interactable component.
- No XR click events: ensure the primary input source on that side has a gamepad (some hand‑tracking runtimes don’t). The multipointer enables only when connected.
- Cursor misaligned on slanted surfaces: confirm surface normals make sense in object space; the ray visual converts them to world space via the normal matrix.
