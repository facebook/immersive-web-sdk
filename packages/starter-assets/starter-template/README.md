# IWSDK Starter Template

This folder is a source template used by `scripts/generate-starters.mjs` to produce 6 runnable native scene variants:

- `starter-<browser|vr|ar>-manual-<ts|js>`

Do not run this template directly. The generator will:

- Render the mode-specific `src/index.ts` from `src/index.template.ts`.
- Render the matching `vite.config.ts` from `vite.config.template.ts`.
- Keep the browser target neutral so authored scenes control content and camera.
- Keep the native scene JSON files under `public/scenes/`.
- Prune unused dev dependencies.

XR welcome UI is defined in `public/ui/welcome.uikitml`; browser variants omit it.
