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
migrated projects should use `public/scenes/*.iwsdk.scene.json`, the clean managed
origin workspace, and direct file authoring with the compact `scene_*` observation
tools. Code remains supported for procedural behavior, systems,
animation, and advanced app logic.

The replacement includes WebGL/IWSDK editor rendering, real scene asset loading,
camera and orientation controls, transform gizmos, scene hierarchy editing,
schema-driven component editing, agent screenshots from the editor viewport,
migrated examples/starters, Meta Spatial removal audits, and automated app plus
editor render-proof evidence.

The legacy `@iwsdk/glxf` package and fallback level importer are removed.
`World.loadLevel()` now accepts native `.iwsdk.scene.json` and `.scene.json`
documents only.

Native scene documents use one manifest-backed `asset` content kind plus groups,
lights, prefabs, deterministic patterns, components, and constraints. glTF assets,
procedural Three.js geometry, PBR materials, and custom shaders live in a dedicated
application asset manifest imported independently by the runtime and editor. The
editor exposes one unified asset catalog with manifest-derived bounds while keeping
geometry and material authoring in code.

The editor and runtime share lowering and expose scene metadata for parity checks.
Generated Claude and Codex projects include the `iwsdk-scene-composer` skill for
text, image, and hybrid static scene composition through direct files and the native
editor. Scene roots can recursively import standalone modules with deterministic
namespaces, and the managed editor watches root and module changes while preserving
the last valid render on invalid edits.
