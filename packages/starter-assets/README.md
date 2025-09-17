# @iwsdk/starter-assets

CDN-ready starter assets and Chef recipes for IWSDK. This package publishes a `dist/` folder containing:

- Assets under `dist/assets/<id>/{public|metaspatial}/...` where `<id>` is one of
  - `vr-manual-js`, `vr-manual-ts`, `vr-metaspatial-js`, `vr-metaspatial-ts`
  - `ar-manual-js`, `ar-manual-ts`, `ar-metaspatial-js`, `ar-metaspatial-ts`
- `recipes/index.json` and one `recipes/<id>.json` per variant (Chef-only format).

CDN example paths:

- Base: `https://cdn.jsdelivr.net/npm/@iwsdk/starter-assets@<version>/dist`
- Example asset: `.../assets/vr-manual-ts/public/gltf/robot/robot.gltf`
- Recipes index: `.../recipes/index.json`

## Recipe Format (Chef)

Each `recipes/<id>.json` is a pure Chef recipe with fields:

- `name`: human-readable variant name (e.g., `VR Manual (TS)`).
- `version`: this package version.
- `edits`: map of file paths to operations. Text files use `{ set: <contents> }`; binary/static assets use `{ url: <absolute-cdn-url> }`.

There are no extra fields like `files`, `remotes`, or `baseUrl` in the recipe files.

## Build

- Generate variants from `starter-template/` and stage assets + Chef recipes into `dist/`:

pnpm --filter @iwsdk/starter-assets build

This runs:

- `starter:sync` → writes variants to `packages/starter-assets/variants-src/*`
- `scripts/build-assets.mjs` → emits `dist/assets/<id>/{public|metaspatial}/...` and `dist/recipes/*.json`, then removes `variants-src/`

## Publish

- The published tarball includes `dist/` and `README.md`. The template and scripts are excluded.
- Consumers should load the recipe JSON and pass it to Chef with `{ allowUrl: true }` so Chef fetches binary assets.

## Local Template

- The generator looks for `starter-template/` in two places:
  1. `packages/starter-assets/starter-template/` (preferred)
  2. `<repo-root>/starter-template/` (fallback)

Move the template into this package later to fully encapsulate assets.
