---
name: iwsdk-scene-composer
description: Compose editable static IWSDK scenes from text, images, or hybrid references using a shared application asset manifest, v1 scene JSON, modular scene files, and the managed editor's validation and rendering tools. Use for 3D environments, props, architecture, staged scenes, procedural Three.js assets, custom PBR or shader materials, glTF assets, prefabs, patterns, lighting, camera matching, or visual review.
---

# IWSDK Scene Composer

Author native IWSDK assets and scene files. Application code owns geometry and
materials; scene JSON owns composition; the managed editor provides visual feedback
and human transform/component adjustment.

Read these references when relevant:

- [scene-format.md](references/scene-format.md) before editing scene JSON;
- [asset-authoring.md](references/asset-authoring.md) before creating or changing
  glTF or procedural assets;
- [text-intake.md](references/text-intake.md) for text-only requests;
- [image-intake.md](references/image-intake.md) for image or hybrid requests;
- [composition-patterns.md](references/composition-patterns.md) for decomposition
  and repetition strategies;
- [review-and-stop.md](references/review-and-stop.md) before final review.

## Fixed Boundaries

- Use only `iwsdk.scene.v1`. There is no compatibility schema.
- Scene files are the composition source of truth. Create and edit them with normal
  filesystem tools under `public/scenes/`.
- Scene JSON has one renderable content kind: `asset`. It does not define models,
  primitive geometry, material resources, or material overrides.
- The default export of the configured application asset manifest is the asset source
  of truth. It may contain URL-backed glTF and UIKitML entries plus parentless
  `Object3D` prototypes with arbitrary Three.js geometry and materials.
- The application runtime and editor import the same manifest module independently.
  Never depend on shared object identity, iframe messaging, DOM state, or a live
  runtime world when defining assets.
- Humans use the editor for selection, hierarchy, transforms, components, root
  lighting, and preview visibility. They do not edit geometry or materials there.
- Agents may edit asset TypeScript and scene JSON, then use the editor to validate and
  render the result.

The public scene MCP surface is intentionally small:

```text
scene_open
scene_render_file
scene_flatten_file
scene_get_state
scene_get_capabilities
scene_screenshot
scene_select
scene_set_camera
scene_set_preview_visibility
scene_measure_image_regions
```

Document creation and mutation happen through direct file edits. Do not look for MCP
create/add/update/remove/patch/save/compose/review/publish tools.

When MCP is unavailable, use the CLI equivalents:

```bash
npx iwsdk dev status
npx iwsdk dev up
npx iwsdk scene capabilities --raw
npx iwsdk scene render-file \
  --input-json '{"path":"public/scenes/room.iwsdk.scene.json","viewId":"hero"}' \
  --output-file artifacts/room.png
npx iwsdk scene flatten \
  --input-json '{"path":"public/scenes/room.composition.iwsdk.scene.json","outputPath":"public/scenes/room.iwsdk.scene.json"}' --raw
npx iwsdk scene open \
  --input-json '{"path":"public/scenes/room.iwsdk.scene.json"}' --raw
npx iwsdk scene state --raw
```

`iwsdk dev up` starts the server in the background, launches the configured
managed editor browser, and waits for the command bridge. Do not edit
`vite.config.ts` to change browser mode as an ad hoc startup workaround.

`scene_render_file` renders a file without replacing the editor's active document,
but it still uses the managed editor browser for manifest evaluation and WebGL.
If startup reports `dev_browser_not_ready`, inspect `iwsdk dev status` and
`iwsdk dev logs --tail 100`. Retry only when the diagnostics indicate a transient
startup failure. Do not invent a custom CPU or Playwright renderer and present it as
authoritative editor evidence. Preserve the structured failure, continue
type/schema/build checks that remain meaningful, and report the visual-verification
gate as blocked.

Camera parameters are intentionally distinct: `view` accepts only the built-in
presets (`current`, `top`, `front`, `back`, `left`, `right`, `quarter`, `orbit`),
while `viewId` selects an exact camera declared in `authoring.views`. Outside
immersive XR, a loaded level's saved hero view owns runtime framing and
supersedes the initial `World.create({ render: { camera } })` pose. In XR, the
tracked player rig owns the camera, so the player-spawn view is a separate
required framing check.

## Workflow

### 1. Specify

Turn the request into a compact implementation brief:

- required and optional features;
- source evidence regions for image input;
- silhouette, proportions, parts, negative space, contacts, and material response;
- hero and diagnostic views;
- measurable acceptance criteria;
- assumptions, uncertainty, and fidelity ceiling.

A single image proves visible composition, not hidden geometry. Do not silently invent
occluded detail or lower requested fidelity.

### 2. Plan Assets And Modules

Call `scene_get_capabilities` once. Inspect `src/assets.ts` and existing asset modules.

Choose an external asset source deliberately:

- Use the configured MetaVR asset search, or
  `npx @meta-quest/metavr --json asset search "<query>"`, for ready-made static
  props and background dressing. Results provide previews plus GLB/FBX downloads,
  but do not promise semantic subparts, rigging, articulation, or independently
  editable pieces. Inspect the downloaded hierarchy, and copy selected files into
  project-owned storage instead of persisting a returned CDN URL.
- Use `npx @drawcall/market skill` and `npx @drawcall/market types`, then search a
  concrete need with `npx @drawcall/market search "<query>" --type <type> --limit 3`,
  when an installable reusable asset, template, or provider-generated result is a
  better starting point. Preview finalists and install the exact printed
  `name@version`; trust the install output for consumer paths.
- Drawcall Market is a marketplace/install/generation CLI, not a universal
  procedural-geometry engine. When the request depends on controllable parts,
  parametric dimensions, articulation, or code-driven variation and no suitable
  code-backed template exists, author a deterministic Three.js `Object3D` prototype.

For every visible form, choose one of:

1. reuse an existing manifest asset;
2. add a glTF entry to the manifest;
3. register a UIKitML file with `AssetType.UIKitML`;
4. create a deterministic parentless `Object3D` prototype in code and register it;
5. assemble existing assets with a scene prefab or module.

Create custom geometry and materials in asset code, not JSON. Prefer separate
`*.scene-asset.ts` modules for substantial procedural assets and import their
prototypes into `src/assets.ts`.

For initial construction, plan independent semantic groups as standalone scratch
scene modules. Give each module a local origin, size envelope, attachment points,
required views, and asset IDs. Asset and component IDs are application-global;
imported node and prefab IDs are namespaced. Imports are an authoring-only assembly
mechanism, never a runtime or editable-project format.

### 3. Build

Author assets first, then scene JSON. Build in dependency order:

1. support/stage and representative lighting;
2. large composition masses;
3. identity-critical groups;
4. repeated secondary detail;
5. hero camera and final environment.

Use meters, stable descriptive IDs, deterministic ordering, and explicit transforms.
Groups supply hierarchy, never visible mass. Use `castShadow` and `receiveShadow` on
asset nodes only when needed. Use prefabs and patterns for repetition; keep repeated
asset prototypes resource-sharing friendly.

### 4. Validate And Materialize

With the managed editor command-ready, call `scene_render_file` on every changed
scratch module, then the composition root. It resolves imports for authoring preview,
validates schema and manifest references, lowers the scene, and returns a PNG plus
diagnostics without changing the active document. Fix failures in the owning asset or
scratch file.

After the composition root passes, run `scene_flatten_file` / `iwsdk scene flatten`
once to materialize an import-free final scene. The command preserves import wrapper
groups, validates the output, and refuses to write if its runtime hash differs from
the composed source. This is a one-way publication boundary: the flat file becomes
the sole source of truth, and later scratch-module changes must not be re-flattened
over human edits.

Call `scene_open` only on the flattened file for live collaboration. Import-bearing
files remain renderable composition previews but are never opened as editable scenes
and never load in the application runtime.

Use `scene_get_state` for selection, hashes, diagnostics, dirty/conflict state, runtime
readiness, and render statistics. Use camera, screenshot, selection, and preview
visibility tools only when their live-editor context is useful.

### 5. Review And Refine

Review in three passes:

1. **Layout**: hierarchy, scale, support contacts, and arrangement.
2. **Geometry**: silhouette, proportions, parts, negative space, and alternate views.
3. **Final**: material response, color, lighting, environment, and hero framing.

Keep review orchestration and evidence outside the editor. The editor supplies
authoritative screenshots, hashes, camera state, diagnostics, and render measurements.
Derive comparisons, defect lists, lineage, and stop decisions in ordinary task files.

Fix the highest-impact defect in its owning asset or scene module, rerender that file,
then rerender the root. Default to two focused correction rounds. Stop earlier on a
repeated defect, oscillation, plateau, missing input/asset, or representation ceiling.

### 6. Finish

Finish only when:

- every scratch module and the composition root validates and renders;
- the final editable scene is flattened and contains no `imports`;
- the active editor state is clean and conflict-free;
- required views are nonblank and correctly framed;
- required features pass measurable and visual checks;
- manifest asset IDs resolve in both editor and application runtime;
- the application build and selected scene load without blocking errors.

If a required gate is unavailable, finish with an explicit blocked or
accepted-with-gaps result. Passing a local schema check, production build, or custom
diagnostic image does not substitute for authoritative editor renders and state.

## Modular Composition

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "imports": [
    {
      "id": "reading-nook",
      "src": "./modules/reading-nook.iwsdk.scene.json",
      "transform": { "position": [1.8, 0, -0.6] }
    }
  ],
  "resources": {},
  "nodes": []
}
```

Each scratch module must be valid by itself. Imports resolve recursively in
declaration order. The import entry becomes a transform group. The composition root
owns global components, environment, metadata, and authoring settings. Cycles, unsafe
IDs, missing files, duplicate namespaced IDs, and invalid modules fail composition.

For parallel initial construction, assign one scratch module file per worker. Never
let two workers edit one file. Render modules independently, import only passing
modules, correct cross-module scale, contact, occlusion, lighting, and framing at the
composition root, then flatten exactly once. Parallel module iteration ends at that
boundary; continue all later edits in the flat file.

## Regeneration And Provenance

Preserve stable IDs when revising the flat file. Never overwrite unrelated
human-authored files or re-flatten over editor changes. Record the skill/runtime
versions, input hashes, composition/final/module paths, capability hash,
source/composed/runtime hashes, assumptions, and fidelity ceiling in authoring
metadata or adjacent task evidence.
