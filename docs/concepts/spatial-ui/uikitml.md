---
title: UIKitML (Authoring)
---

# UIKitML (Authoring Language)

UIKitML lets you author spatial UI with familiar HTML/CSS‑like syntax. The toolchain provides:

- `parse(text)` → JSON suitable for transport
- `interpret(parseResult)` → live UIKit components in the scene
- `generate(...)` → optional HTML/Style output for tools/round‑trip

## Language Highlights

- Elements map to UIKit components:
  - `<container>`, `<text>`, `<image>`, `<video>`, `<svg>`, and `<input>`.
- Classes and IDs:
  - `class="foo bar"`, `id="menu"`; selectors are available at runtime via `UIKitDocument`.
- Conditional styles:
  - Pseudo‑like keys: `hover`, `active`, `focus`, and responsive groups: `sm`, `md`, `lg`, `xl`, `2xl`.
- Data attributes:
  - `data-*` are preserved onto the component’s `userData` (e.g., `data-foo` → `userData.foo`).
- Custom elements:
  - Unknown tags become `custom` and can be mapped to actual components by providing a “kit” (constructor map) to `interpret`.

## Parsing and JSON

`parse(text, { onError })` returns an object like:

```ts
{
  element: /* ElementJson or string */, // the root element tree
  classes: { [className]: { origin?: string, content: Record<string, any> } },
  ranges:  { [uid]: { start: { line, column }, end: { line, column } } }
}
```

This JSON is compact and safe to ship as a static file. IWSDK’s Vite plugin writes it to `public/ui/*.json`.

## Interpreting at Runtime

`interpret(parseResult, kit?)` produces a UIKit component tree. IWSDK wraps this in a `UIKitDocument` and attaches it to your entity.

```ts
import { interpret } from '@pmndrs/uikitml';
const rootComponent = interpret(parseResult); // -> UIKit component
```

## Example

```html
<container id="menu" class="panel" style="padding: 12; gap: 8">
  <text class="title" style="fontSize: 24">Settings</text>
  <container class="row" style="flexDirection: row; gap: 6">
    <text>Music</text>
    <input id="music" />
  </container>
</container>
```

With a class block:

```css
.panel {
  backgroundcolor: rgba(0, 0, 0, 0.6);
  sm: {
    padding: 8;
  }
}
.title {
  hover: {
    color: #fff;
  }
}
```

See also: [Flow](/concepts/spatial-ui/flow), [UIKitDocument](/concepts/spatial-ui/uikit-document)

## Authoring Details

- Inline `style` vs class blocks:
  - Inline `style` is merged with class styles; conditionals under `style` (e.g., `hover`, `sm`) are supported and serialized separately.
- `<style>` blocks in UIKitML:
  - The parser extracts `.class` and `#id` rules from `<style>` tags and merges them into `classes` with `origin` metadata.
- Property names are camelCase (e.g., `backgroundColor`, `fontSize`) to align with JavaScript style objects.
- Strings vs numbers:
  - Numeric values are in UIKit units (cm). Colors accept CSS‑like strings (e.g., `#fff`, `rgba(...)`).

## Conditional Precedence

- Base styles apply first, then conditional groups are layered at runtime:
  - Order of application: base → responsive group (`sm..2xl`) → interactive (`hover`, `focus`, `active`).
- Use class composition to avoid deep inline conditionals when multiple states combine.

## Custom Components with a Kit

You can map unknown tags to custom UIKit components using a kit:

```ts
import { interpret } from '@pmndrs/uikitml';
import { Component } from '@pmndrs/uikit';

class Gauge extends Component {
  /* ... */
}

const kit = { gauge: Gauge }; // tag <gauge> maps to Gauge
const root = interpret(parseResult, kit);
```

Unknown tags without a kit entry fall back to `Container` and store `userData.customElement` for inspection.

## Debugging & Tooling

- `ranges` link elements to source lines/columns (useful for editor overlays and inspector panels).
- The parser injects `data-uid` attributes for stable identification during authoring; the generator strips them for clean output if you round‑trip.
- The Vite plugin will log parse errors with filenames and minimal context; turn on `verbose: true` for more detail.

## Best Practices

- Prefer classes for reusable styling; use IDs for unique elements you’ll query at runtime.
- Keep media references (`src`) relative to your public assets; the interpreter preserves them into UIKit properties.
- Avoid overly deep nesting; flat, flex‑oriented hierarchies layout faster and are easier to animate.
