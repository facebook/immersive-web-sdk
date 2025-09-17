---
title: Author → Compile → Interpret → Interact
---

# End‑to‑End Flow

This is how spatial UI moves from source files to live, interactive 3D panels.

## 1) Author in UIKitML

- Create files under `ui/*.uikitml` using HTML/CSS‑like syntax.
- Use IDs/classes for runtime querying, and conditional style blocks (`hover`, `active`, `focus`, `sm..2xl`).

## 2) Compile to JSON (Vite Plugin)

- `@iwsdk/vite-plugin-uikitml` watches your source directory (default `ui`) and writes JSON to `public/ui` in dev.
- On production builds, it compiles once at `buildStart` and prints a summary.
- Output is the raw result of `parse(text)` from `@pmndrs/uikitml`.

Minimal plugin config (defaults shown):

```ts
// vite.config.ts
import UIKitML from '@iwsdk/vite-plugin-uikitml';

export default {
  plugins: [
    UIKitML({
      sourceDir: 'ui', // where .uikitml lives
      outputDir: 'public/ui', // where .json is written
      watch: true,
      verbose: false,
      include: /\.uikitml$/, // files to compile
    }),
  ],
};
```

## 3) Ship JSON

- The JSON files are static assets (ideal for CDNs and caching).
- Each UI panel typically corresponds to a single JSON file, but you can compose within UIKitML as you prefer.

## 4) Interpret at Runtime (SDK)

- In code, point a `PanelUI` component at the JSON path and add it to an entity.

```ts
entity.addComponent(PanelUI, {
  config: '/ui/menu.json', // served from public/ui
  maxWidth: 1.0, // meters (world‑space cap)
  maxHeight: 0.6,
});
```

- `PanelUISystem` will:
  - `fetch(config)` → load JSON
  - `interpret(parseResult)` → build a UIKit root component
  - wrap it in a `UIKitDocument` and attach to your entity’s `object3D`
  - set stable transparent sorting for readability
  - forward pointer events (configurable) so hover/click/drag work via XR rays and hands
  - call the UIKit root’s `update()` each frame (animation/tween support)

## 5) Size and Placement

- World‑space: system applies target dimensions based on `PanelUI.maxWidth/maxHeight` and the entity’s world scale.
- Screen‑space: add `ScreenSpace` to place the panel relative to the camera using CSS‑like strings:

```ts
entity.addComponent(ScreenSpace, {
  width: '40vw',
  height: 'auto',
  bottom: '24px',
  right: '24px',
  zOffset: 0.25,
});
```

When XR starts, panels automatically return to world space; when XR stops, they return to screen space.

## 6) Interact and Query

- Use `UIKitDocument` from `PanelDocument` to reach into the UI tree:

```ts
const doc = entity.getValue(PanelDocument, 'document');
const startBtn = doc?.getElementById('start');
```

- Pointer events (via IWSDK’s input stack) drive hover/active/focus conditionals in your UI, and you can wire custom behaviors to element interactions.

See also: [UIKit](/concepts/spatial-ui/uikit), [UIKitML](/concepts/spatial-ui/uikitml), [UIKitDocument](/concepts/spatial-ui/uikit-document)

## Dev and Build Behavior (Detailed)

- Dev server:
  - On `vite serve`, the plugin compiles all `ui/*.uikitml` to `public/ui/*.json` and starts a watcher.
  - Edits to `.uikitml` trigger regeneration; your app can `fetch('/ui/file.json')` without manual steps.
  - Enable `verbose: true` for detailed logs and parse diagnostics.

- Production build:
  - On `vite build`, compilation runs once at the start; a summary lists generated files and any failures.
  - JSON assets are emitted to your `public/ui` path for static serving.

- File mapping:
  - `ui/menu.uikitml` → `public/ui/menu.json` (same relative structure under subfolders).

## Caching & Delivery

- JSON is static and cacheable; you can version files by path if needed.
- Prefetch JSON for critical panels to avoid hitches on first open.

## Error Handling

- If `fetch(config)` fails, `PanelUISystem` throws an error with status details.
- Parse errors during compilation are printed by the plugin; fix authoring issues and let the watcher regenerate.

## Screen‑space Math (How it Works)

- The system evaluates CSS size/position using hidden DOM nodes to compute pixel dimensions.
- Pixels are mapped to meters at a camera‑relative plane `zOffset` meters in front of the near plane:
  - `worldHeightAtZ = 2 * tan(fov/2) * zOffset`
  - `worldPerPixel = worldHeightAtZ / canvasHeight`
  - `targetWorldWidth = pixelWidth * worldPerPixel`
  - `targetWorldHeight = pixelHeight * worldPerPixel`
- The `UIKitDocument` then scales uniformly to fit those target meters.

## Input Integration

- IWSDK forwards pointer events from controllers/hands to the 3D UI.
- UI state (`hover`, `active`, `focus`) is reflected in styles automatically.
- Combine with your ECS input systems for gameplay logic.

## Advanced Patterns

- Multiple panels:
  - Attach several `PanelUI` documents to different entities; each can be world‑ or screen‑space independently.
- Dynamic themes:
  - Toggle classes on root elements to switch palettes or layouts without rebuilding.
- Custom components:
  - Provide a “kit” to `interpret(parseResult, kit)` to map custom tags to specialized UIKit components.
