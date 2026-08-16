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

=> pnpm 10 to 11 migration
=> 2026-08-16 — version bump

- Workspace pin moved from pnpm 10.18.3 to pnpm 11.22.0.
- Corepack 0.35.0 is checked in the test workflow.
- pnpm overrides moved to the workspace config for pnpm 11 compatibility.
- Active package scripts, helpers, CI pins, and docs now use pnpm 11.22.0.
- npm stays available for examples and bootstrap paths, but is not part of this bump.
- No packages.md file was present in the checkout.
- Version checks live here and run automatically in CI.
- The lockfile was regenerated with pnpm 11.22.0 and the local version check passes.
- Frozen install reached lockfile validation; package downloads were blocked by the local network sandbox.
- Windows hook setup remains a separate follow-up because the prepare step calls chmod.
- Push, publish, release, and deploy stay manual.
