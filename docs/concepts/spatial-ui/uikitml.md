---
title: UIKitML (Authoring)
---

# UIKitML (Authoring Language)

UIKitML is a strict HTML/CSS-like language for spatial UI. IWSDK uses
`@drawcall/uikitml` to parse source text and instantiate live
`@pmndrs/uikit` components in the browser.

## Runtime API

`parse(source)` returns a discriminated result containing either a typed AST
or structured errors. `instantiate(ast)` creates the UIKit component tree.
IWSDK performs both operations when a UIKitML manifest asset is instantiated.

```ts
const settings = await world.assets.instantiate<UIKitMLAsset>('settings');
world.createTransformEntity(settings);
```

Store the file at `public/ui/settings.uikitml`; no compilation step or JSON
counterpart is required.

## Elements and Component Sets

The default IWSDK configuration includes:

- HTML-like elements such as `div`, `span`, `button`, `img`, `svg`, `video`,
  `input`, and `textarea`.
- Horizon components such as `Panel`, `Button`, and `ButtonIcon`.
- Lucide icons such as `LogIn`, `RectangleGoggles`, and `Settings`.

Names are case-sensitive. Unknown tags and unsupported properties are parser
errors rather than silently falling back to generic containers.

```html
<Panel class="panel-root">
  <h1>Settings</h1>
  <button id="save-button">
    <ButtonIcon><Settings /></ButtonIcon>
    Save
  </button>
</Panel>
```

## Styling

Use kebab-case CSS properties in inline styles or `<style>` blocks. Supported
selectors include `.class`, `#id`, and supported conditions such as `:hover`,
`:active`, `:focus`, and `:dark`.

```html
<style>
  .panel-root {
    flex-direction: column;
    gap: 8;
    padding: 16;
    background-color: #18181b;
  }

  .action:hover {
    background-color: #3f3f46;
  }
</style>

<div class="panel-root">
  <button id="save-button" class="action">Save</button>
</div>
```

UIKit dimensions use centimeters; `100` UIKit units equal one meter at entity
scale `1`.

Arbitrary `data-*` attributes are not component properties. Use stable IDs
and keep application values in TypeScript maps when an interaction needs
associated data.

## TTF Fonts

Declare one or more weights with CSS `@font-face`:

```html
<style>
  @font-face {
    font-family: 'Brand Sans';
    src: url('./fonts/BrandSans-Regular.ttf');
    font-weight: 400;
  }

  @font-face {
    font-family: 'Brand Sans';
    src: url('./fonts/BrandSans-Bold.ttf') format('truetype');
    font-weight: 700;
  }

  .title {
    font-family: 'Brand Sans';
    font-weight: 700;
  }
</style>

<h1 class="title">Launch ready</h1>
```

IWSDK resolves relative font URLs from the UIKitML file and UIKit loads the
needed TTF weight at runtime.

## Runtime Queries

Use the typed asset returned by the loader and fail early for required controls:

```ts
const settings = world.requireSceneObject<UIKitMLAsset>('settings-panel');
const saveButton = settings.requireElementById('save-button');

saveButton.addEventListener('click', saveSettings);
```

## Custom Components

For application-owned elements, create a typed component set compatible with
`@drawcall/uikitml` and pass it through:

```ts
World.create(container, {
  features: {
    spatialUI: {
      kit: 'horizon',
      componentSets: [applicationComponents],
    },
  },
});
```

The same component definitions are used for parser validation and runtime
instantiation.

## Best Practices

- Keep UIKitML under `public/ui` so development and production use the same
  URL.
- Prefer classes for reusable visual styles and IDs for runtime behavior.
- Treat parser errors as authoring errors; do not disable validation.
- Keep media and font URLs relative to the UIKitML asset when they belong to
  the same panel.
- Avoid deeply nested layouts; flat flex hierarchies are easier to maintain
  and render.

See also: [Flow](/concepts/spatial-ui/flow) and
[UIKitDocument](/concepts/spatial-ui/uikit-document).
