# IWSDK Starter Template

This folder is a source template used by `scripts/generate-starters.cjs` to produce 8 runnable variants:

- `starter-<vr|ar>-<manual|metaspatial>-<ts|js>`

Do not run this template directly. The generator will:

- Copy a variant-specific `src/index.ts` (see `src/index-*.ts`).
- Install the matching Vite config from `configs/`.
- Keep only the required metaspatial folder (renamed to `metaspatial`).
- Prune unused assets and dev dependencies.

UI is defined in `ui/welcome.uikitml`; the Vite UIKitML plugin compiles it to `public/ui/welcome.json` during build in generated variants.
