---
'@iwsdk/create': patch
'@iwsdk/vite-plugin-dev': patch
---

Pre-optimize the application-owned Three.js entry in generated projects and
development servers so the runtime and UIKit dependencies share one Three.js
module instance.
