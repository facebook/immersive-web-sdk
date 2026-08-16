<!--
MIT License

Copyright (c) 2026 Sythos (https://www.sythos.net)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

SPDX-License-Identifier: MIT
-->

=> Three.js r181 to r185 migration
=> 2026-08-16 — Sythos fork, `main`, revision `084133a`

- Runtime target moved from `super-three@0.181.0` to `super-three@0.185.0`.
- `@types/three` pinned to `0.185.1`.
- Package manifests, examples, starter templates, workspace policy, and lockfile updated.
- Render loop moved from `Clock` to `Timer`.
- Legacy `pcf-soft` scenes now resolve to `PCFShadowMap`.
- Direct light matrix writes now set `matrixWorldNeedsUpdate`.
- GLTF, KTX2, and DRACO paths kept compatible; no WebGPU added.
- Migration checks collected in this folder: versions, APIs, licensing, formatting, lint, builds, standalone installs, typechecks, and focused tests.
- Standalone packing temporarily replaces `workspace:*` dependencies and restores manifests afterwards.
- Corepack 0.35.0 and pnpm 10.18.3 installed with writable local caches.
- Fork workflow remains manual: no automatic push, publish, release, or deploy; only local tests run automatically.
- New test files use full MIT/SPDX headers and Sythos attribution; original notices remain in modified upstream files.

Test results:

- 10/10 examples pass TypeScript checks.
- `@iwsdk/core`: 372 tests passed.
- `@iwsdk/scene-composition`: 74 tests passed.
- `@iwsdk/locomotor`: 10 tests passed.
- `@iwsdk/xr-input`: 7 tests passed.
- `@iwsdk/reference`: 20 tests passed.
- Full local migration workflow passed.

The optional reference-assets corpus was left unchanged because its generated
`data/` payload is not included in this checkout.
