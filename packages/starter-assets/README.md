# @iwsdk/starter-assets

CDN-hosted native scene starter templates and assets for the IWSDK project scaffolding CLI. This package provides the recipes and assets used by `@iwsdk/create`.

> **Note**: This is an internal package used by `@iwsdk/create`. You typically don't need to install it directly.

## What's Included

- **Recipes** - Chef-compatible project templates for all IWSDK variants
- **Assets** - GLTF models, textures, and other starter content
- **Templates** - Pre-configured Vite projects for desktop, VR, and AR development

## Template Variants

| ID                  | Description                                 |
| ------------------- | ------------------------------------------- |
| `vr-manual-ts`      | VR + TypeScript + native scene JSON         |
| `vr-manual-js`      | VR + JavaScript + native scene JSON         |
| `ar-manual-ts`      | AR + TypeScript + native scene JSON         |
| `ar-manual-js`      | AR + JavaScript + native scene JSON         |
| `browser-manual-ts` | Desktop 3D + TypeScript + native scene JSON |
| `browser-manual-js` | Desktop 3D + JavaScript + native scene JSON |

Desktop variants run with `xr: false`, canvas pointer input, browser locomotion,
and pointer-lock mouse look. Their dev config keeps IWER injection disabled.

## CDN URLs

Assets are served via jsDelivr:

```
Base: https://cdn.jsdelivr.net/npm/@iwsdk/starter-assets@<version>/dist
Recipes: .../recipes/index.json
Assets: .../assets/<variant-id>/public/...
```

## How It Works

1. `@iwsdk/create` fetches `recipes/index.json` to get available templates
2. User selects a variant through interactive prompts
3. The CLI fetches the recipe JSON for that variant
4. [@pmndrs/chef](https://github.com/pmndrs/chef) applies the recipe to scaffold the project
5. Binary assets (GLTF, images) are fetched from CDN URLs in the recipe

## Building (for contributors)

```bash
# Generate variants from starter-template and build assets
pnpm --filter @iwsdk/starter-assets build
```

This runs:

- `starter:sync` - Generates the desktop, VR, and AR TypeScript/JavaScript variants
- `build-assets.mjs` - Creates `dist/assets/` and `dist/recipes/`

## License

MIT © Meta Platforms, Inc.
