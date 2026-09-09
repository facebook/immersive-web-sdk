---
'@iwsdk/core': patch
---

Pin standalone core installs to the supported super-three runtime instead of resolving an untested latest Three.js release.

Existing applications must use `"three": "npm:super-three@0.181.0"` and the
matching npm or pnpm override so IWSDK and application code share one Three.js
module instance.
