---
'@iwsdk/cli': patch
'@iwsdk/create': patch
'@iwsdk/vite-plugin-dev': patch
'@iwsdk/reference': patch
---

Generate npm- and pnpm-installable projects with deterministic local tarball
overrides and pnpm 10/11 lifecycle policy, including deferred bundle installs.

Pin the compatible Sharp 0.35.4 release, refresh dependency security overrides,
use project-local TypeScript commands, and migrate Quest tooling guidance from
the legacy HzDB package to the owned `@meta-quest/metavr` package.
