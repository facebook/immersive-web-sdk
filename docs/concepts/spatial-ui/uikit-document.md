---
title: UIKitDocument (DOM-like API)
---

# UIKitDocument

`UIKitDocument` wraps the interpreted UIKit component tree in a `THREE.Group` and exposes DOM‑like query helpers and sizing utilities.

## What It Provides

- DOM‑like queries:
  - `getElementById(id)`
  - `getElementsByClassName(name)`
  - `querySelector(selector)` / `querySelectorAll(selector)`
  - Simple selectors supported: `#id`, `.class`, and descendant combinators like `#parent .child`.

- Direct required lookup with `requireElementById(id)`, which throws a
  source-oriented error when a required control is missing.
- Intrinsic physical sizing: 100 UIKit units equal one meter at entity scale 1.

- Lifecycle:
  - A `dispose()` method cleans up signals and components.

## Using with IWSDK Systems

- `UIKitMLAsset` owns the loaded `UIKitDocument` and is the object returned by
  manifest asset instantiation.
- `PanelUISystem` advances every live UIKit document, whether it came from a
  manifest asset or the legacy `PanelUI` adapter.
- `ScreenSpaceUISystem` re‑parents the document under the camera with CSS‑like positioning when XR is not presenting.
- Pointer events are forwarded (configurable) so UI elements receive hover/active/focus state.

## Examples

Querying by ID and class:

```ts
const panel = world.requireSceneObject<UIKitMLAsset>('main-menu');
const doc = panel.document;

const button = doc.requireElementById('start');
const rows = doc.getElementsByClassName('row');

// Descendant query
const label = doc.querySelector('#menu .title');
```

Setting world-space size with the entity transform:

```ts
entity.object3D.scale.setScalar(0.25);
```

See also: [UIKit](/concepts/spatial-ui/uikit), [Screen‑space vs World‑space Flow](/concepts/spatial-ui/flow)

## How Sizing Works

- UIKit components report an intrinsic size in centimeters through their
  `size` signal.
- World-space size is controlled by the ordinary entity transform, just like
  a glTF or procedural object.
- `ScreenSpaceUISystem` temporarily applies camera-local target dimensions for
  CSS layout and clears them when returning to XR world space.

## Selectors and Limitations

- Supported: `#id`, `.class`, descendant combinators (e.g., `#menu .row .button`).
- Not supported: attribute selectors, pseudo‑classes beyond UIKit state (`hover`, `active`, `focus`).
- Performance: cache query results you reuse in systems; avoid repeated deep queries inside per‑frame loops.

## Integrating Interactions

- Pointer events forwarded by IWSDK will toggle `hover/active/focus` state on elements, which in turn applies conditional styles.
- For custom behavior, subscribe to your ECS input/pointer systems and call methods or set properties on matched components.

```ts
const start = doc.getElementById('start');
// Example: toggle a class on app state change
if (isLocked) start?.classList.add('disabled');
else start?.classList.remove('disabled');
```

## Lifecycle and Cleanup

- Manifest asset instances are disposed when their owning entity is destroyed.
  Direct `loadUIKitMLAsset()` users can call `dispose()` explicitly.
- The legacy `PanelUI` adapter requires a transform-backed host. Create its
  entity with `world.createTransformEntity()` before adding `PanelUI`; a plain
  `world.createEntity()` is rejected before a document is loaded.
- Outside XR, `ScreenSpaceUISystem` temporarily reparents the document (not the
  host entity) under `world.camera`. The host transform and visibility do not
  control the document while it is screen-space. Entering XR restores the
  document to the host object.
- After disposal, references to components are invalid; re‑query after re‑creating the document.

## Debugging Tips

- Log `doc.toString()` to see element/class counts and computed sizes.
- Use IDs and class names consistently in `.uikitml` so selectors remain stable during iteration.
