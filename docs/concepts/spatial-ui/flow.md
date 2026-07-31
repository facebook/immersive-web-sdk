---
title: Author → Parse → Instantiate → Interact
---

# End-to-End Flow

IWSDK loads UIKitML source files directly. There is no generated JSON or
UIKitML-specific build plugin between authoring and runtime.

## 1) Author a Public UIKitML Asset

Create `.uikitml` files under `public/ui` so Vite serves them in development
and copies them unchanged into production builds:

```text
public/
└── ui/
    └── menu.uikitml
```

Use IDs for runtime queries and classes for reusable styles. UIKitML is
strict: component names and properties must be supported by the selected
component set.

## 2) Register and Instantiate the Asset

```ts
const assets = {
  menu: {
    type: AssetType.UIKitML,
    url: '/ui/menu.uikitml',
  },
} satisfies AssetManifest;

const world = await World.create(container, {
  assets,
  features: { spatialUI: true },
});

const menu = await world.assets.instantiate<UIKitMLAsset>('menu');
const entity = world.createTransformEntity(menu);
```

The asset pipeline performs the complete runtime flow:

1. Fetch the `.uikitml` file as text.
2. Parse it with `@drawcall/uikitml`.
3. Resolve relative `@font-face` TTF URLs against the UIKitML file URL.
4. Install its stylesheet and instantiate a live UIKit component tree.
5. Wrap the root in `UIKitDocument` and return a `UIKitMLAsset` object.

Scene documents use the same asset entry as glTF:

```json
{
  "id": "settings-panel",
  "content": { "type": "asset", "asset": "menu" },
  "transform": { "position": [0, 1.4, -1.5], "scale": 0.25 }
}
```

The Horizon and Lucide component sets are available by default. Plain HTML
elements such as `div`, `span`, `button`, `img`, and `input` are also
supported.

## 3) Use Runtime TTF Fonts

Declare TTF assets directly in a UIKitML style block:

```html
<style>
  @font-face {
    font-family: 'Brand Sans';
    src: url('./fonts/BrandSans-Regular.ttf');
    font-weight: 400;
  }

  .title {
    font-family: 'Brand Sans';
    font-weight: 400;
  }
</style>

<h1 class="title">Launch ready</h1>
```

Here the font is loaded from `public/ui/fonts/BrandSans-Regular.ttf`. Absolute
URLs and root-relative public URLs work as well.

## 4) Size and Placement

In world space, UIKit dimensions are centimeters and the entity transform is
the single scale authority. For example, a `width: 100` root is one meter wide
at entity scale `1`; use `entity.object3D.scale` or a scene transform to resize
the whole panel. Add `ScreenSpace` to position the same document relative to
the camera outside XR:

```ts
entity.addComponent(ScreenSpace, {
  width: '40vw',
  height: 'auto',
  bottom: '24px',
  right: '24px',
  zOffset: 0.25,
});
```

When XR starts, screen-space panels return to world space. When XR ends, they
return to the configured screen-space position.

## 5) Interact and Query

Keep the result when creating a panel in code:

```ts
const startButton = menu.requireElementById('start');

startButton.addEventListener('click', () => {
  // Update application state.
});
```

For a scene-authored panel, locate the asset by stable node ID:

```ts
const menu = world.requireSceneObject<UIKitMLAsset>('settings-panel');
const startButton = menu.requireElementById('start');

startButton.addEventListener('click', () => {
  // Update application state.
});
```

Use an application-owned marker component when a system needs semantic ECS
discovery. Do not query `PanelUI.config` or use an asset ID as application
behavior. `PanelUI` and `PanelDocument` remain available only as a compatibility
adapter for raw URL panels that have not moved into the asset manifest.

IWSDK's pointer stack drives hover, active, focus, and pointer events for XR
and browser input.

## Dev, Build, and Caching

- Edit `public/ui/*.uikitml`; Vite serves the changed source directly.
- `vite build` copies the same files into `dist/ui`.
- UIKitML files and referenced fonts are ordinary static assets and can use
  normal CDN cache/versioning rules.
- No generated `public/ui/*.json` files need to be cleaned or synchronized.

## Error Handling

- Fetch failures include the UIKitML URL and HTTP status.
- Parser errors are reported at runtime with their source line and column.
- A failed asset rejects `instantiate()` or scene loading with its asset ID and
  source error.

## Custom Component Sets

Applications can pass additional `UIKitMLComponentSet` definitions through
`features.spatialUI.componentSets`. The built-in collection can be selected
with `features.spatialUI.kit` (`'horizon'` by default, or `'default'`).

See also: [UIKit](/concepts/spatial-ui/uikit),
[UIKitML](/concepts/spatial-ui/uikitml), and
[UIKitDocument](/concepts/spatial-ui/uikit-document).
