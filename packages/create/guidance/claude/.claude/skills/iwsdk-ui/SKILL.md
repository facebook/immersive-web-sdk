---
name: iwsdk-ui
description: Create, place, preview, debug, and connect manifest-backed IWSDK UIKitML assets. Use for spatial panels, browser HUDs, UIKitML layout, fonts, editor previews, or runtime element behavior.
argument-hint: '[panel-name or description of changes]'
---

# UIKitML Asset Workflow

Treat UIKitML as a first-class renderable asset. Use the managed editor's isolated
renderer for layout, the scene editor for placement, and the application runtime for
behavior. Do not change the scene, camera, or component model merely to inspect a
panel.

User request is in `$ARGUMENTS`.

## 1. Find the three stable identities

Every scene-authored panel has three different identities:

1. the manifest asset ID, which names the reusable UIKitML definition;
2. the scene node ID, which names one placed instance;
3. element `id` attributes, which name fields and controls inside the document.

Find or add the manifest entry in `src/assets.ts` and keep the source under
`public/ui/`:

```ts
import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export default defineAssets({
  'welcome-panel': {
    name: 'Welcome panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
});
```

A file under `public/ui/` is not placeable until it is registered. The `.uikitml`
file is the runtime source of truth; never generate an intermediate JSON file.

## 2. Reuse the managed editor

Run commands from the application directory. Reuse a command-ready session instead
of starting a second server or browser:

```bash
npx iwsdk dev status
npx iwsdk dev up --timeout 60000
npx iwsdk ui assets --raw
```

`dev up` owns the managed headed browser. Do not launch a second Playwright browser,
enable Vite's independent opener, or implement a custom UIKit renderer.

## 3. Render the panel in isolation

Use the editor-backed isolated renderer before debugging scene placement:

```bash
npx iwsdk ui render-preview \
  --input-json '{"assetId":"welcome-panel","width":800,"height":600}' \
  --output-file artifacts/welcome-panel.png
```

This renders the real manifest entry through the real UIKitML parser, fonts, layout,
and WebGL path on a neutral background. It waits for UIKit render and resource
signals; do not add fixed frame delays. Re-run the command after every layout change.
Same-URL sources are reloaded without restarting the server.

## 4. Place and inspect it in the scene editor

For a human-authored placement, open the scene and add the UIKitML asset from the
asset drawer. For file authoring, use the same asset-only node contract:

```json
{
  "id": "welcome-panel-instance",
  "name": "Welcome panel",
  "content": { "type": "asset", "asset": "welcome-panel" },
  "transform": {
    "position": [0, 1.4, -1.5],
    "rotationDeg": [0, 180, 0],
    "scale": 0.5
  }
}
```

```bash
npx iwsdk scene render-file \
  --input-json '{"path":"public/scenes/main.iwsdk.scene.json","view":"quarter"}' \
  --output-file artifacts/main-editor.png
npx iwsdk scene open \
  --input-json '{"path":"public/scenes/main.iwsdk.scene.json"}' --raw
```

UIKitML surfaces are single-sided. If the isolated preview works but the placed panel
is invisible, inspect its rotation first. Size a world-space panel with its ordinary
entity transform scale. There is no `maxWidth`/`maxHeight` fitting layer and no
editor-visible legacy `PanelUI` component to configure.

Use `scene screenshot` for editor/scene evidence. `browser screenshot` is intentionally
runtime-only and switches the managed workspace to runtime before capturing.

## 5. Edit UIKitML

UIKitML is HTML/CSS-shaped, but it is not a browser engine. Before assuming browser
behavior, use `npx iwsdk reference search` or the connected IWSDK reference tools to
confirm supported elements and properties.

Key rules:

- numeric UIKit sizes are centimeters (`100` = 100 cm = 1 m);
- use stable `id` attributes for elements application code must manipulate;
- prefer explicit supported declarations over CSS shorthand;
- parser errors include source locations;
- relative and remote font URLs are supported, but font completion can change layout;
- the managed preview settles from UIKit render/font/texture signals, so inspect logs
  instead of compensating with arbitrary waits.

### Reuse built-in kits, icons, and remote fonts

IWSDK bundles the UIKitML Horizon component kit and Lucide icon set. Select the
Horizon kit explicitly in `iwsdk.config.json` so the choice is visible to both the
runtime and editor:

```json
{
  "world": {
    "features": {
      "spatialUI": { "kit": "horizon" }
    }
  }
}
```

Horizon tags such as `<Panel>`, `<Button>`, `<ButtonIcon>`, and `<ButtonLabel>`
can then be combined directly with Lucide tags such as `<RectangleGoggles>` or
`<LogIn>`. Do not install or register either component set in application code.

UIKitML also accepts remote TTF declarations. The starter's
`public/ui/welcome.uikitml` demonstrates multiple DM Sans weights loaded from
`fonts.gstatic.com` with `@font-face`; apply the declared family to a root class so
all descendants inherit it. Keep a local font under `public/` when offline or
cross-origin availability is a product requirement.

After each edit:

1. rerender with `ui render-preview` and inspect the image;
2. rerender the scene when placement or scale matters;
3. inspect `browser logs` for parser, font, texture, or runtime failures.

## 6. Connect runtime behavior

For a code-owned instance, keep the `UIKitMLAsset` returned by the asset manager:

```ts
import { UIKitMLAsset } from '@iwsdk/core';

const panel = await world.assets.instantiate<UIKitMLAsset>('welcome-panel');
const entity = world.createTransformEntity(panel);
const button = panel.requireElementById('xr-button');
button.addEventListener('click', () => world.launchXR());
```

For a scene-authored instance, resolve it by stable scene node ID after the level has
loaded:

```ts
const panel = world.requireSceneObject<UIKitMLAsset>('welcome-panel-instance');
const button = panel.requireElementById('xr-button');
button.setProperties({ display: 'none' });
```

Do not locate a panel by transient ECS index, manifest URL, or a scan for an internal
`PanelDocument`. Use the scene node ID and element IDs.

## ScreenSpace is product behavior

Add `ScreenSpace` only when the experience genuinely needs a browser-camera HUD:

```ts
entity.addComponent(ScreenSpace, {
  width: '420px',
  height: '240px',
  top: '20px',
  right: '20px',
  zOffset: 0.2,
});
```

Position and size values are CSS strings. In immersive mode the document returns to
its authored world transform. Do not add `ScreenSpace`, a backdrop, or a temporary
camera pose merely to make a panel easier to inspect—the editor already provides the
correct isolated and in-scene render paths.

## Completion checklist

- Manifest ID resolves and `ui assets` lists it.
- Isolated preview is nonblank, correctly laid out, and uses the intended fonts.
- Scene preview has correct facing, transform scale, and lighting-independent color.
- Runtime behavior resolves the placed node and required element IDs.
- Browser logs contain no UIKitML parser, resource, or font errors.
- No generated UI JSON, temporary ScreenSpace component, backdrop, or camera hack
  remains.
