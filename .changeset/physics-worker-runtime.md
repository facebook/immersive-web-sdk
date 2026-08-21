---
'@iwsdk/core': minor
'@iwsdk/create': patch
'@iwsdk/vite-plugin-dev': patch
---

Existing `physics: true` projects now run Havok in a Web Worker at a fixed 60
Hz by default, using transferable ArrayBuffer exchanges and render
interpolation. Add a shared main-thread mode for debugging and compatibility,
plus debugger pause/step synchronization across both execution modes.
