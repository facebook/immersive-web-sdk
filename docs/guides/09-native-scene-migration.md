---
outline: [2, 4]
---

# Native Scene Migration

IWSDK's supported declarative authoring path is now native scene JSON plus the
native scene editor. Existing projects that were authored through Meta Spatial
Editor or consumed generated GLXF should move their committed source of truth to
`public/scenes/*.iwsdk.scene.json`.

Use this guide as a migration checklist. The old project files can remain in
history, but new examples, starters, and app code should load scene JSON.

## What Changes

| Old path                                        | New path                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Meta Spatial project directories                | `public/scenes/<name>.iwsdk.scene.json`                                       |
| Generated `public/glxf/Composition.glxf` output | Native scene JSON loaded by `World.create`                                    |
| Editor-specific project assets                  | Shared example asset catalog entries                                          |
| Manual visual checks from one app view          | Editor screenshots from top, front, side, quarter, orbit, or explicit cameras |
| Direct file edits by agents                     | `scene_*` composition tools through the editor target                         |

Runtime code remains supported. Use scene JSON for authored placement and code
for procedural behavior, systems, animation, and app logic.

## Convert The Scene Source

1. Create `public/scenes/<name>.iwsdk.scene.json`.
2. Add an `assets` section for every model, image, audio file, or shared catalog
   asset the scene uses.
3. Convert each authored object into a scene node with a stable `id`, `asset`,
   `transform`, optional `components`, and optional `children`.
4. Preserve parent-child relationships. Nested objects should stay nested in the
   scene JSON so runtime transforms resolve the same way.
5. Move component data into the `components` object on the node that owns that
   behavior.
6. Validate the scene with the native scene composition tools before deleting the
   old local authoring directory.

Prefer stable ids over display names. Tests, app code, and agent tools can then
select and verify the same node across edits.

## Replace GLXF Runtime Loading

Replace any generated GLXF level URL with the scene JSON URL:

```ts
import { SessionMode, World } from '@iwsdk/core';

const world = await World.create(document.getElementById('scene')!, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  level: '/scenes/main.iwsdk.scene.json',
});
```

If the app needs runtime-only behavior, keep that behavior in TypeScript or
JavaScript systems. The scene JSON should describe authored objects and default
component data, not replace imperative runtime logic.

## Move Assets To The Shared Catalog

When an example or starter uses common assets, reference the shared asset catalog
instead of committing another copy under an example-specific `public/gltf`
directory. The migrated scene should use the catalog URI convention exposed by
the project, such as `/iwsdk-assets/<asset-id>/<entry-file>`.

Catalog-backed assets should include bounds metadata when placement helpers need
to reason about surfaces. That lets `scene_place_on` position props on desks,
shelves, plinths, floors, and panels deterministically.

## Verify In The Native Editor

Start the dev server with a managed workspace mode enabled:

```bash
npm run dev
```

Use the Playwright-managed workspace at `/__iwsdk/workspace`; normal browser
tabs stay on the runtime app. In agent flows, call `scene_open` with the
migrated path under `public/scenes/`. Then verify:

- The hierarchy has the expected nodes and parent relationships.
- Asset requests resolve without 404s.
- Components attach to the expected entities.
- Top-view screenshots show alignment and symmetry.
- Front or side screenshots show objects resting on their intended surfaces.
- The app page reflects saved editor changes after reload.

## Use Agent Tools For Scene Cleanup

Agents should inspect and edit migrated scenes through the native tool surface
instead of hand-editing JSON. A typical cleanup pass is:

1. `scene_list_assets`
2. `scene_list_files` and `scene_open`
3. `scene_get_document`
4. `scene_get_hierarchy`
5. `scene_set_camera` or `scene_screenshot` for current, top, front, side,
   quarter, and orbit views
6. `scene_place_on` for objects that should rest on another object
7. `scene_look_at` for objects that should face a target
8. `scene_validate`
9. `scene_save`

Treat validation output as part of the migration review. Fix duplicate ids,
missing assets, invalid transforms, unknown component types, and floating
objects before considering the old source replaced.

## Remove The Old Integration

After the migrated scene renders and tests pass:

- Remove old project directories from the example or starter.
- Remove generated GLXF output from committed source.
- Remove old editor plugin imports from Vite config.
- Remove stale package dependencies.
- Update README and docs links to point to
  [Chapter 9: Native Scene Editor](./09-native-scene-editor.md).

The final project should build, run, and open the native editor without any old
editor binary, old editor project files, or generated GLXF build step.
