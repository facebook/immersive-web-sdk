# @iwsdk/example-assets

Shared catalog and copy helpers for IWSDK example assets.

This package starts with the duplicated GLTF assets used across examples:
`environment-desk`, `robot`, and `plant-sansevieria`. Each catalog entry records
the source files, entry file, stable public path, and SHA-256 hashes so example
migrations can remove per-example duplicates without losing drift detection.

The source catalog lives in `src/catalog.json`; canonical files live under
`assets/`. `copyExampleAssets()` copies only requested entries into
`/iwsdk-assets/<asset-id>/...`, and the package tests serve that clean copied
output over HTTP to verify the public paths and hashes.

For examples that build with Vite, use `iwsdkExampleAssets()` from
`@iwsdk/example-assets/vite` to serve catalog assets in dev and copy them into
the build output.

That Vite path is temporary until consumers switch to the verified immutable
public distribution. `prepublishOnly` enforces catalog integrity and complete
first-party MIT provenance. [`PROVENANCE.md`](./PROVENANCE.md) records the
ownership, custody trail, license evidence, and approved distributable hashes.

After an approved exact version is published, run the named `Example Assets CDN
Release` workflow or, from a network-enabled checkout:

```bash
pnpm --filter @iwsdk/example-assets verify:cdn -- --version 0.4.2
```

The release check downloads every catalog file, enforces CORS and MIME types,
verifies byte sizes and SHA-256 hashes, validates all relative glTF resources,
and cold-loads every model with `GLTFLoader` in Chromium. Passing local copy or
tarball tests does not substitute for this post-publication check.

`verify:cdn-tooling` is the deterministic pre-publication counterpart: it runs
`npm pack`, extracts the resulting archive, serves only those packed asset
bytes, applies the same integrity checks, and cold-loads the models. The native
scene runtime and Create matrices additionally load CDN-shaped URLs through a
shared Playwright route backed by that packed archive.
