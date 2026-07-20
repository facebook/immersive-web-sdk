# IWSDK Starter Template

This folder is a source template used by `scripts/generate-starters.mjs` to produce 4 runnable native scene variants:

- `starter-<vr|ar>-manual-<ts|js>`

Do not run this template directly. The generator will:

- Render the mode-specific `src/index.ts` from `src/index.template.ts`.
- Render the matching `vite.config.ts` from `vite.config.template.ts`.
- Keep the native scene JSON files under `public/scenes/`.
- Prune unused dev dependencies.

UI is defined in `ui/welcome.uikitml`; the Vite UIKitML plugin compiles it to `public/ui/welcome.json` during build in generated variants.
