# Project Manifest Migration Baseline

Captured on 2026-07-30 from commit `9ef13268` before the project-manifest
migration. The source stack is preserved in Git, and the two uncommitted plan
documents are additionally preserved in `stash@{0}` (`backup before project
manifest implementation 2026-07-30`).

## Toolchain

- Node.js: `v24.16.0`
- pnpm: `10.18.3`
- generator: `@iwsdk/starter-assets@0.4.2 starter:sync`

## Materialized Starter Outputs

| Variant                     | Files |  Bytes |
| --------------------------- | ----: | -----: |
| `starter-ar-manual-js`      |    17 | 365225 |
| `starter-ar-manual-ts`      |    18 | 365745 |
| `starter-browser-manual-js` |    11 |   7739 |
| `starter-browser-manual-ts` |    12 |   8372 |
| `starter-vr-manual-js`      |    17 | 365458 |
| `starter-vr-manual-ts`      |    18 | 365978 |

`starter-variants.sha256` records all 93 generated files relative to
`packages/starter-assets/variants-src/`.

## Packed Package Sizes

| Tarball                       |   Bytes |
| ----------------------------- | ------: |
| `iwsdk-cli.tgz`               |  972185 |
| `iwsdk-core.tgz`              | 1468107 |
| `iwsdk-create.tgz`            |  126702 |
| `iwsdk-example-assets.tgz`    | 9209102 |
| `iwsdk-locomotor.tgz`         |   92051 |
| `iwsdk-reference.tgz`         |  390942 |
| `iwsdk-scene-composition.tgz` |  119587 |
| `iwsdk-vite-plugin-dev.tgz`   | 1794184 |
| `iwsdk-xr-input.tgz`          |   89463 |

`packages.sha256` records the corresponding tarball hashes.

## Baseline Commands

```text
corepack pnpm@10.18.3 --filter @iwsdk/starter-assets run starter:sync
corepack pnpm@10.18.3 test:native-scene-examples
corepack pnpm@10.18.3 test:create-flow-e2e
```

Results and live runtime/editor evidence are appended as each baseline command
completes. This directory is intentionally outside every `current/` evidence
directory so later regeneration cannot overwrite it.

## Results

- `test:native-scene-examples`: **PASS** — 12 source scene files, 3 generated
  starter scene files, and 9 shared asset configs validated.
- packed Create E2E: **PASS** — 12/12 tests in 146.60 seconds, with
  install/build/runtime/editor proof recorded for VR, AR, and Browser.

The VR proof observed 8 successful responses for environment-desk resources,
8 for plant resources, and 12 for robot resources in both runtime and editor.
AR observed 8 plant and 12 robot resource responses in each surface. Browser
requested no stock model resources. There were no failed or non-200 asset
requests.

## Pre-existing Baseline Defects

- The generated Browser starter runtime is visually blank: both runtime
  screenshots contain one sampled color, even though the scene hierarchy and
  managed editor are available. This is evidence for the plan's required
  Desktop scene/camera bring-up, not an acceptable post-migration visual
  baseline.
- The generated Browser starter includes `src/mouselook.ts` but does not import
  or register it.
- Every generated target's runtime proof contains one accepted 404 console
  message. Editor proof is clean. Release verification must identify and remove
  the missing request rather than carrying the allowlist forward blindly.
- The depth-occlusion example loads `DepthOccludable` scene entities before
  registering `DepthSensingSystem`; its qualify subscription does not request
  `replayExisting`, so those initial entities can miss setup.
