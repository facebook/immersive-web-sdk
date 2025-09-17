# Release Guide (Changesets + pnpm)

This repository uses Changesets to version and publish all `@iwsdk/*` packages together at the same version. The config lives in `.changeset/config.json` and pins a single version line via `fixed: [["@iwsdk/*"]]`.

## Everyday Flow (Contributor)

1. Make your changes on a feature branch.
2. Add a changeset describing your change and bump type:
   - `pnpm changeset`
   - Select the relevant `@iwsdk/*` packages (you can select one; the fixed group will keep them in sync at versioning time).
   - Pick bump type (patch/minor/major) and write a brief summary.
   - This creates a file under `.changeset/` (do commit it).
3. Open a PR. Review as normal.

Notes

- You can create multiple changesets across PRs; they’ll be combined when we cut a release.

## Cutting a Release (Maintainer)

From the `main` branch after PRs are merged:

1. Version packages (applies all pending changesets):
   - `pnpm changeset version`
   - This updates versions across all `@iwsdk/*` (fixed group), writes changelogs, bumps inter‑dependencies, and commits.

2. Build all packages:
   - `pnpm -r build`

3. Publish to npm (public):
   - Option A (recommended): `pnpm changeset publish`
   - Option B (explicit): `pnpm -r publish --access public`

4. Push tags and changes:
   - `git push --follow-tags`

## CI (Optional)

Consider a GitHub Action that:

- Runs on `push` to `main`.
- Executes `pnpm install`, `pnpm -r build`, then `pnpm changeset publish` (with `NPM_TOKEN`).

## Local Testing Tarballs

`scripts/build-tgz.sh` builds and packs all packages and renames the tarballs to versionless aliases (e.g., `iwsdk-core.tgz`). It temporarily rewrites `@iwsdk/*` workspace deps to local `file:` tarballs for packing and restores them afterward.

## Bump Guidelines

- patch: bug fixes, docs, build only, or safe internal changes.
- minor: backward‑compatible features.
- major: breaking changes (API removal/rename, behavior changes). Coordinate across packages since versions are fixed.

## Troubleshooting

- “No releases found”: Ensure there are pending files under `.changeset/` before running `changeset version`.
- “Tarball integrity mismatch” locally: delete lockfiles in generated starters; we already prune locks in starter scaffolds.
- Publishing failures: verify `NPM_TOKEN` with publish rights and `package.json` `publishConfig.access` is `public` (default for our packages).
