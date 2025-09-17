---
title: UIKit (3D UI Runtime)
---

# UIKit (Three.js + Yoga)

UIKit is a native 3D UI runtime built on Three.js with Yoga (Flexbox) layout. It targets XR‑grade performance and predictable, web‑like layout semantics.

## Core Ideas

- Web‑aligned layout: Yoga implements Flexbox. Properties map closely to CSS (e.g., `flexDirection`, `gap`, `padding`).
- Crisp text: MSDF text rendering with instancing for thousands of glyphs efficiently.
- Batching and instancing: Panels and glyphs are grouped to minimize draw calls.
- Event‑ready components: Works with pointer events (hover/active/focus conditionals).

## Units and Sizing

- UIKit component intrinsic sizes are in centimeters (cm).
- IWSDK’s `UIKitDocument` takes target width/height in meters and computes a uniform scale so your UI fits the desired physical size in XR.

## Key Components

- `Container` — generic layout node (flex)
- `Text` — MSDF text with wrapping
- `Image` / `Video` / `Svg` — media and vector content
- `Input` / `Textarea` — basic UI controls

## Performance Characteristics

- Panels are instanced; materials and meshes are reused where possible.
- Glyphs are batched; updates run in the main animation loop with minimal allocations.
- Transparent sorting should be set to a stable painter order for readability. IWSDK’s `PanelUISystem` configures `reversePainterSortStable` for you.

## Using UIKit Directly (Three.js)

Most IWSDK apps won’t use UIKit directly; they will use UIKitML + SDK systems. For reference, raw UIKit usage looks like:

```ts
import { Root, Container, Text, reversePainterSortStable } from '@pmndrs/uikit';

const root = new Root(camera, renderer, {
  width: 1000,
  height: 500,
  padding: 10,
});
scene.add(root);

const panel = new Container({ flexDirection: 'row', gap: 8 });
panel.add(new Text({ text: 'Hello XR' }));
root.add(panel);

renderer.setTransparentSort(reversePainterSortStable);
renderer.setAnimationLoop((t) => root.update(t));
```

## In IWSDK

- You typically don’t construct `Root` yourself.
- Author UI in `.uikitml`; the SDK interprets it into UIKit components at runtime, wraps it in a `UIKitDocument`, and manages size and placement.
- Pointer events are bridged automatically (configurable).

See also: [Flow](/concepts/spatial-ui/flow)

## Layout Mapping (CSS → Yoga)

- Common properties supported in styles:
  - `flexDirection`, `justifyContent`, `alignItems`, `gap`, `padding`, `margin`, `flexGrow`, `flexShrink`, `flexBasis`, `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`.
- Measurement:
  - Numbers map to UIKit units (cm). For world‑space results in meters, use `UIKitDocument.setTargetDimensions(...)`.
- Conditional variants:
  - UIKit supports conditional style groups (`hover`, `active`, `focus`, `sm..2xl`) that toggle based on state and media hints.

## Text System Details

- MSDF text preserves edge sharpness across scales and distances.
- Wrapping options: word‑wrap and break‑all wrappers are available.
- Font management: use `@pmndrs/msdfonts`; glyphs are instanced for performance.

## Interactivity Model

- Elements track state: `hover`, `active`, `focus` influence styles declaratively.
- Pointer events are delivered via IWSDK’s input bridge; you can also subscribe to component signals if needed.
- Best practice: keep visual state in UI styles; run gameplay logic in ECS systems responding to events.

## Clipping, Scrolling, and Layers

- Panels support local clipping for nested scroll regions.
- Layering is handled via a stable painter’s algorithm (`reversePainterSortStable`).
- For overlapping translucent UI, prefer fewer material variants and consistent z‑ordering to reduce flicker risk.

## Theming and Class Lists

- Components expose a `classList`. Toggle classes to switch visual states or themes at runtime.

```ts
const doc = entity.getValue(PanelDocument, 'document');
const card = doc?.querySelector('.card');
card?.classList.add('selected');
```

## Performance Tips

- Avoid per‑frame allocation in event handlers; reuse objects and precompute selectors.
- Keep image/video resolutions reasonable for intended panel size.
- Prefer style/class changes over rebuilding component subtrees.
