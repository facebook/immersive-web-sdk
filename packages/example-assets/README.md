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
