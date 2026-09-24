---
'@iwsdk/core': patch
'@iwsdk/locomotor': patch
'@iwsdk/vite-plugin-dev': patch
'@iwsdk/xr-input': patch
---

Embed TypeScript sources in the published source maps for the runtime packages,
and pre-bundle the elics dependency of `@iwsdk/core` in development. The Vite
development server no longer warns that source maps point to missing source
files, and browser devtools can show SDK source when stepping into it.
