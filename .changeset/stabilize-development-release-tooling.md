---
'@iwsdk/cli': patch
'@iwsdk/create': patch
'@iwsdk/example-assets': patch
'@iwsdk/reference-assets': patch
'@iwsdk/vite-plugin-dev': patch
---

Canonicalize aliased workspace paths for browser scripts and HMR, retain the
UIKitML default Inter font, and make hidden-editor runtime reloads deterministic.

Install missing managed Chromium builds through the plugin-owned Playwright CLI,
stabilize managed test-server readiness, and compare CLI/MCP screenshots by valid
PNG metadata instead of timing-sensitive compressed size.

Keep generated Claude guidance aligned with the canonical AGENTS.md source
instead of shipping a second, drifting copy.

Keep package lifecycle scripts portable when pnpm is installed without a global
Corepack command.
