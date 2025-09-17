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

- Physical sizing in meters:
  - `setTargetDimensions(widthMeters, heightMeters)` computes a uniform scale from the component’s intrinsic cm size.
  - Keeps aspect ratio stable; ideal for XR where 1 unit = 1 meter.

- Lifecycle:
  - A `dispose()` method cleans up signals and components.

## Using with IWSDK Systems

- `PanelUISystem` loads JSON, interprets it, creates `UIKitDocument`, and attaches it to your entity’s `object3D`.
- `ScreenSpaceUISystem` re‑parents the document under the camera with CSS‑like positioning when XR is not presenting.
- Pointer events are forwarded (configurable) so UI elements receive hover/active/focus state.

## Examples

Querying by ID and class:

```ts
// Access the document from the entity’s PanelDocument component
const doc = entity.getValue(PanelDocument, 'document'); // UIKitDocument

const button = doc.getElementById('start');
const rows = doc.getElementsByClassName('row');

// Descendant query
const label = doc.querySelector('#menu .title');
```

Setting a physical target size (meters):

```ts
doc.setTargetDimensions(1.0, 0.6); // ~1m wide panel, height constrained to aspect
```

See also: [UIKit](/concepts/spatial-ui/uikit), [Screen‑space vs World‑space Flow](/concepts/spatial-ui/flow)

## How Sizing Works

- UIKit components report an intrinsic size in centimeters (via their `size` signal).
- `UIKitDocument` converts target meters to a uniform scale:
  - `uiWidthMeters = intrinsicWidthCm / 100`
  - `scale = min(targetWidth / uiWidthMeters, targetHeight / uiHeightMeters)`
- The scale is applied to the `Group` (document), not individual components, preserving internal layout.

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

- When removing a panel, call `dispose()` (done by `PanelUISystem.cleanupPanel`) to detach listeners and release resources.
- After disposal, references to components are invalid; re‑query after re‑creating the document.

## Debugging Tips

- Log `doc.toString()` to see element/class counts and computed sizes.
- Use IDs and class names consistently in `.uikitml` so selectors remain stable during iteration.
