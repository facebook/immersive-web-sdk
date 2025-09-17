# @iwsdk/create

Interactive CLI to scaffold Immersive Web SDK starter apps. Intended to be invoked via:

- `npm create @iwsdk@latest`
- `pnpm dlx @iwsdk/create@latest`

This package is CLI-only: no programmatic API exports. TypeScript sources live in `src/` and are bundled to `dist/` with Rollup.

The CLI uses @pmndrs/chef to apply recipes fetched from the CDN (no local fallback). Recipes live at:

- `${ASSETS_BASE}/recipes/index.json` (default base: `https://iwsdk-assets.pages.dev`)
- `${ASSETS_BASE}/recipes/<variant>.recipe.json`

## Usage (local dev)

- Build once: `pnpm --filter @iwsdk/create build`
- Watch mode: `pnpm --filter @iwsdk/create dev`

The CLI fetches recipes and assets from a public CDN by default: `https://iwsdk-assets.pages.dev`. Override with:

- `--assets-base <url>` or env `IWSDK_ASSET_BASE` (e.g., your own CDN root that serves `/recipes` and `/assets`)

Notes:

- Network required during scaffold; Chef downloads binary assets from the CDN.
- Local fallback recipes and the `run-recipe` dev helper have been removed in favor of Chef-only execution.

## Module Layout

- `src/cli.ts` — entrypoint: parses flags, runs prompts, selects recipe, applies edits, scaffolds the project, optionally installs deps, and prints next steps.
- `src/prompts.ts` — all interactive questions and defaults.
- `src/recipes.ts` — tiny fetch helpers (`DEFAULT_ASSETS_BASE`, `fetchRecipesIndex`, `fetchRecipeByFileName`). Internal use only.
- `src/scaffold.ts` — wraps Chef’s `buildProject` and writes files to disk with status spinners.
- `src/installer.ts` — installs dependencies with npm and prints next steps.
- `src/types.ts` — shared types (`VariantId`, `TriState`, `PromptResult`).

There is no `index.ts` and no exported library API.

## Publishing

This package is public under the `@iwsdk` scope. Ensure the version is bumped and `pnpm -r build` passes before publishing. Recipes and heavy assets are not bundled here; they live in `@iwsdk/starter-assets`.
