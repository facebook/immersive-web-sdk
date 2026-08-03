---
outline: [2, 4]
---

# Native Scene Migration

Use this checklist to move generated or procedural level content into native
`iwsdk.scene.v1` files under `public/scenes/`.

For a complete `0.4.x` to `0.5.0` agent workflow, download the
[IWSDK 0.5 migration skill](/skills/iwsdk-migrate-0-5/SKILL.md). Release
migration skills are documentation artifacts and are intentionally not copied
into newly scaffolded applications.

## 1. Establish One Runtime Entry Point

Create `iwsdk.config.json`, bind its `scene` field to one project-root-relative
scene source, and pass `virtual:iwsdk-project` to the existing `World.create`
bootstrap. Do not create a second World or renderer for authored content.

## 2. Inventory Declarative Content

Move static models, primitives, materials, lights, hierarchy, transforms, environment,
and typed components into scene JSON. Keep runtime behavior, animation, networking,
and systems in code.

Use exact project-public asset URIs. Supply meter-space bounds for models when the
asset cannot provide them reliably.

## 3. Split Independent Modules

Create valid standalone modules for independent semantic groups, then add them
to the root with top-level `imports`. Give each import a safe ID and optional wrapper
transform. Avoid shared-file authoring when groups can be owned independently.

Render every module with `scene_render_file`, then render the composed root. Fix
module-local defects in the module and cross-module placement/camera defects in the
root.

## 4. Preserve Runtime Components

Translate existing declarative component data into the node `components` map using
the exact component schemas returned by `scene_get_capabilities`. Do not guess field
names or encode application systems into scene metadata.

## 5. Validate Through The File Boundary

Create and edit files directly. Use:

1. `scene_get_capabilities`
2. `scene_render_file` for each module
3. `scene_render_file` for the root
4. `scene_open` for live collaboration
5. `scene_get_state` for hashes, validation, conflict, and runtime readiness
6. exact `scene_set_camera` and `scene_screenshot` views

The editor automatically reloads valid root/module changes. Invalid files retain the
last valid viewport and expose diagnostics.

## 6. Verify Runtime Parity

Check that the application loads the intended root and expected runtime hash. Inspect
console, shader, WebGL, material, and resource errors. Compare representative editor
and runtime screenshots at the same camera/aspect ratio.

Remove obsolete generated-level files only after the application build and runtime
verification pass. Preserve unrelated user-authored code and assets.
