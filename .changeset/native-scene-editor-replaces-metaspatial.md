---
'@iwsdk/cli': minor
'@iwsdk/core': minor
'@iwsdk/create': minor
'@iwsdk/example-assets': minor
'@iwsdk/scene-composition': minor
'@iwsdk/starter-assets': minor
'@iwsdk/vite-plugin-dev': minor
---

Replace the Meta Spatial Editor integration path with the native IWSDK 3D scene
editor and native scene JSON workflow.

Meta Spatial Editor integration is deprecated from this release onward. New and
migrated projects should use `public/scenes/*.iwsdk.scene.json`, the
`/__iwsdk/editor` route, and the `scene_*` agent tools for visual scene
composition. Code remains supported for procedural behavior, systems,
animation, and advanced app logic.

The replacement includes WebGL/IWSDK editor rendering, real scene asset loading,
camera and orientation controls, transform gizmos, scene hierarchy editing,
schema-driven component editing, agent screenshots from the editor viewport,
migrated examples/starters, Meta Spatial removal audits, and automated app plus
editor render-proof evidence.
