---
'@iwsdk/core': minor
'@iwsdk/starter-assets': minor
'@iwsdk/reference-assets': patch
---

Load `.uikitml` source files directly at runtime with
`@drawcall/uikitml@0.1.8` and UIKit 1.0.74. Panel UI now parses styles and TTF
font declarations without generated JSON, and supports typed custom component
sets through `features.spatialUI`.

The `@iwsdk/vite-plugin-uikitml` package is removed. Starters and examples now
ship their UIKitML sources from `public/ui` as ordinary static assets.
