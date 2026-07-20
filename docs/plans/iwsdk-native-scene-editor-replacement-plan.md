# IWSDK Native 3D Scene Editor Replacement Plan

Status: implementation plan
Last updated: 2026-07-01
Owner surface: `immersive-web-sdk`
Primary objective: replace Meta Spatial Editor integration with an IWSDK-native,
IWSDK-powered 3D scene composition editor.

## Executive Summary

The current native editor path is not acceptable as a replacement-grade 3D scene
editor. It keeps useful document/session/tooling work, but its viewport is a 2D
canvas projection that draws a grid, dots, labels, and a fake transform marker.
That can be useful as a temporary control surface, but it does not prove that a
scene will render in IWSDK, does not exercise GLTF assets or components, and
cannot support real object manipulation.

The replacement must be a real 3D editor:

- The center viewport is an IWSDK `World` rendered through WebGL/Three, not a
  hand-drawn 2D canvas.
- The left side is a scene composition panel: hierarchy, asset browser,
  validation, logs, add/duplicate/delete, grouping, and placement helpers.
- The right side is a selected object/component inspector: transform, asset,
  metadata, component add/remove/edit, schema validation, and custom component
  fields.
- The viewport has real editor overlays: selection outline, bounds, grid,
  transform gizmo, snap indicators, light/camera helpers, and plugin overlays.
- The transform gizmo supports translate, rotate, and scale with object dragging,
  W/E/R shortcuts, local/world space, snapping, undo/redo, and one committed
  scene patch per completed drag.
- The navigation/orientation gizmo supports top/front/back/left/right/quarter
  views, camera orbit/pan/zoom, camera framing, and deterministic screenshots
  from named or explicit camera poses.
- Human UI and agent tools share the same scene session and patch path. Agents
  should not edit JSON files directly when composing scenes.
- The 2D placeholder must not remain as a passing fallback. If WebGL/IWSDK cannot
  initialize, the editor should show an explicit error and tests should fail.

The D107934202 stack is useful. It already contains many of the editor concepts
we need: authoring chrome, real 3D viewport substrate, transform gizmo,
navigation gizmo/navcube, selection outlines, schema inspector, plugin slots,
runtime overlays, command bus, editor state boundaries, and agent bridge ideas. The
right strategy is not a wholesale copy. Port the concepts and components that
fit, but make IWSDK scene JSON and IWSDK runtime the source of truth.

There is also a concrete reference implementation in
`https://github.com/felixtrz/glxf-aio`. That repo is smaller and more directly
useful for the first working slice: it already wires a real Three viewport,
floating panels, `@pmndrs/handle` transform handles, `three-viewport-gizmo`,
selection outlines, command history, hierarchy reparenting, asset thumbnails,
and transform/property panels. Use it as the tactical implementation reference
for viewport manipulation, while still replacing its local `SpatialEntity`/GLXF
source of truth with IWSDK scene JSON and IWSDK runtime.

## Non-Negotiable Product Requirements

1. Real IWSDK rendering
   - The editor viewport must instantiate or attach to a real IWSDK `World`.
   - Scene JSON must be loaded through the IWSDK runtime import path.
   - GLTF meshes, materials, textures, lights, and supported components must
     render in the viewport.
   - Tests must prove a WebGL context, IWSDK world ownership, mesh count, asset
     network loads, and renderer stats.

2. Workbench layout
   - Center: full-height 3D viewport.
   - Left floating/resizable panel: scene composition, hierarchy, assets,
     validation, logs, and scene actions.
   - Right floating/resizable panel: selected object inspector and component
     editor.
   - Top viewport toolbar: selection mode, move/rotate/scale, local/world, snap,
     undo/redo, save, and reload. Live play/preview transport is intentionally
     out of scope for this replacement slice.
   - Top-right viewport overlay: navigation/orientation gizmo.
   - Bottom status strip or bottom panel: scene path, dirty state, validation
     summary, console/events/assets tabs.

3. Complete viewport manipulation
   - Raycast selection against real meshes or bounds proxies.
   - Hover and selection highlight.
   - Selection outline/bounding box for selected objects.
   - Transform gizmo for translate, rotate, and scale.
   - Axis-constrained X/Y/Z manipulation.
   - Plane/free movement where appropriate.
   - Local/world transform space.
   - Snapping for grid, angle, scale, and surface placement.
   - Keyboard shortcuts for common editor operations.
   - Undo/redo with one history entry per completed manipulation.

4. Complete camera/navigation controls
   - Orbit, pan, zoom.
   - Frame selected object and frame scene.
   - Named views: current, top, front, back, left, right, quarter.
   - Deterministic orbit views for agent screenshot loops.
   - Explicit `{ position, lookAt, fov }` camera support.
   - Orientation gizmo/view cube that is clickable and synchronized with the
     editor camera.

5. Agentic scene composition
   - Preserve and strengthen the existing `scene_*` tool surface:
     `scene_list_assets`, `scene_get_document`, `scene_get_hierarchy`,
     `scene_get_selection`, `scene_select`, `scene_add_node`,
     `scene_remove_node`, `scene_duplicate_node`, `scene_set_transform`,
     `scene_apply_patch`, `scene_place_on`, `scene_look_at`, `scene_validate`,
     `scene_save`, `scene_undo`, `scene_redo`, `scene_get_logs`,
     `scene_set_camera`, `scene_screenshot`, and `scene_compare_screenshots`.
   - Screenshots must come from the real 3D viewport.
   - Agent tools must target the editor page/session, not race with app pages.
   - The tool contract in `@iwsdk/cli` must stay canonical and parity-checked
     against the browser editor implementation.

6. Meta Spatial removal
   - Meta Spatial Editor integration is deprecated from this version onward.
   - `@iwsdk/vite-plugin-metaspatial`, create flags, starter variants, docs,
     build scripts, example `.metaspatial` folders, and duplicated generated
     GLXF paths must be removed or converted.
   - Code remains a valid IWSDK authoring path for procedural behavior,
     animation, custom systems, and advanced interactions. The editor replaces
     Meta Spatial Editor, not user code.

## Current State And Gaps

### Current Useful Work

Keep these surfaces:

- `packages/scene-composition`
  - Scene JSON types, validation, serialization, patches, history, `lookAt`, and
    `placeOn`.
  - This package must remain browser/runtime independent.

- `packages/vite-plugin-dev/src/editor/scene-editor-session.ts`
  - Canonical scene session methods, selection, history, dirty state, logs,
    camera metadata, and tool dispatch.
  - This should become the shared command/session model for both human UI and
    agent tools.

- `packages/vite-plugin-dev`
  - `/__iwsdk/editor` route.
  - Safe scene document GET/PUT endpoint with path confinement.
  - Managed browser role/session routing.
  - MCP relay and stale-tab protection.

- `packages/cli/src/runtime-contract.ts`
  - Canonical tool definitions.
  - Contract parity verification scripts.

- `packages/core/src/level/*scene-json*`
  - Initial native scene JSON importer and runtime loading path.

### Current Critical Gap

The current editor viewport is a placeholder:

- It is generated as a large inline browser runtime string inside
  `packages/vite-plugin-dev/src/index.ts`.
- It renders `#scene-canvas` with `canvas.getContext('2d')`.
- It projects node transforms with hand-written math.
- It picks nodes through 2D hit targets.
- It captures screenshots from the 2D canvas.
- Existing E2E tests accept nonblank canvas pixels and base64 screenshot length,
  so they cannot distinguish a fake editor from a real IWSDK 3D editor.

This must be treated as a failing baseline, not as phase-1 product behavior.

## D107934202 Stack Salvage Plan

The stack is valuable as reference architecture and component source. Salvage
selectively, then adapt to IWSDK scene JSON and current package boundaries.

### D107934202: Plugin SDK And Workspace Foundation

Salvage:

- Slot vocabulary:
  - `toolbar.left`
  - `toolbar.center`
  - `toolbar.right`
  - `sidebar.top`
  - `sidebar.bottom`
  - `inspector.section`
  - `inspector.pinned`
  - `inspector.global`
  - `bottomPanel.tab`
  - `viewport.overlay`
- Plugin API shape for commands, scene access, widgets, schema fields, and
  contribution validation.
- Declarative widget/schema concepts for inspector panels.

Do not carry over:

- Workspace/package churn that is specific to the prototype stack.
- Meta Spatial project assumptions.

### D107934203: Authoring Chrome

Salvage:

- Editor layout structure: toolbar, left sidebar, center viewport, right
  inspector, bottom panel.
- Collapsible panel state and collapse tabs.
- Toolbar command grouping.
- Bottom panel tabs for assets, console, and events.
- Inspector sections, pinned sections, and collapsed-section preferences.
- Viewport overlay slot.

Adaptation:

- Make panels floating/resizable over the 3D viewport where product design calls
  for it. The diff stack mostly provides fixed collapsible chrome, so free
  floating behavior is an IWSDK implementation requirement, not already solved.

### D107934204: Runtime Substrate, Viewport, Gizmos, Preview

This is the highest-value salvage area.

Salvage:

- `EditorWorldProvider` pattern.
- `SceneViewport` pattern that mounts an IWSDK canvas.
- `TransformGizmo` concept.
- `NavigationGizmo`/navcube concept.
- `GizmoModePill` and keyboard mode switching.
- `SelectionOutline`.
- `editorGrid`.
- `cameraControl`.
- `OverlayLayer`.
- `EntityRegistry`.
- `ComponentRegistry`.
- Editor/runtime mode boundaries where still relevant.
- Single-window guard and lifecycle cleanup.

Adaptation:

- Replace the prototype demo store with IWSDK scene JSON document authority.
- Use the current IWSDK `World` and native scene importer, not prototype-specific
  scene population.
- The transform gizmo should use either the salvaged implementation or Three
  `TransformControls` as the initial production path, but the UX requirement is
  the same: translate, rotate, scale, snapping, local/world, undo/redo, and
  runtime/document parity.

### D107934206: Editor Runtime Systems And Lighting

Salvage:

- Editor/runtime system band model.
- Overlay-write-during-drag and command-on-release pattern.
- Selection events.
- Editor camera system concepts.
- Light system and light gizmo concepts.
- Runtime-safe systems and editor/runtime separation.

Treat as incomplete:

- Physics, audio, particle, and node graph pieces are mostly stubs or skeletons
  in this stack. Use them as interface hints, not finished implementations.

### D107934207: Plugin Loaders And Agent Bridge

Salvage:

- Builtin plugin loading pattern.
- Workspace plugin loading pattern if plugin support is still required.
- Declarative agent registration and validation ideas.
- Agent bridge panel concepts.

Adaptation:

- Keep security tighter than the prototype. Do not make JIT eval the main
  extension mechanism.
- Prioritize first-party scene tools before general plugin extensibility.

### D107934200: Scene Model And Plugin Host

Salvage:

- Command bus patterns.
- Schema-driven component editing.
- Plugin host registries.
- Builtin component schemas for Transform, light, physics, audio, and custom
  components.

Do not carry over as source of truth:

- Demo `Map` scene store.
- Fixture-first persistence.
- USD-centric authoring assumptions.

### D107934198, D107934199, D107934205

Salvage:

- Provider composition and Vite wiring ideas from the app shell.
- E2E scenarios for viewport, selection, gizmo, editor/runtime state, and save
  flows.
- Compact numeric/vector controls if they can be copied without unwanted UI
  framework coupling.

Avoid:

- Tauri and VSCode shell work unless a later product requirement asks for it.
- RLDS as a hard dependency unless IWSDK explicitly adopts it.

## glxf-aio Salvage Plan

Repository: `https://github.com/felixtrz/glxf-aio`

This repo is not the final architecture, but it is a strong implementation
reference for the editor mechanics the current IWSDK placeholder is missing.

### High-Value Pieces To Reuse Or Port

- `src/renderer/scene/scene-manager.ts`
  - Real Three `WebGLRenderer`.
  - `PerspectiveCamera`.
  - `OrbitControls`.
  - `GridHelper`.
  - `RoomEnvironment`/PMREM lighting.
  - `postprocessing` composer with FXAA.
  - `three-viewport-gizmo` camera orientation widget.
  - `@pmndrs/pointer-events` HTML/event forwarding.
  - scene/object map and render loop structure.

- `src/renderer/interaction/selection-manager.ts`
  - `postprocessing` `OutlineEffect` selection outline.
  - `@pmndrs/handle` `TransformHandles`.
  - `translate`, `rotate`, and `scale` modes.
  - local/world transform space.
  - disables orbit controls while dragging a transform handle.
  - captures transform start state on drag start.
  - adds a single undo history entry on drag end.
  - keeps transform handles attached to selected objects.
  - object click listeners that resolve child mesh clicks back to the owning
    spatial entity.

- `src/ui/editor/panels/controls.tsx`
  - Compact viewport toolbar for translate/rotate/scale and local/global mode.
  - Good first reference for the IWSDK mode pill/toolbar.

- `src/ui/editor/panels/composition.tsx`
  - Hierarchy panel with expansion state.
  - Drag/drop reparenting.
  - Circular-reference protection.
  - selection restoration after reparent.
  - scene-root drop target.

- `src/core/commands/*`
  - Command manager.
  - compound commands.
  - create/delete/transform/reparent commands.
  - undo/redo stacks.
  - history entries for actions that already mutated the live scene.
  - Browser-testable behavior in `tests/commands/*` that should be ported into
    IWSDK editor tests rather than revalidated only by screenshots.

- `src/core/commands/reparent-command.ts`
  - Uses `attach()` when preserving world transform and `add()` when preserving
    local transform. This is directly relevant for hierarchy editing in a 3D
    editor.

- `src/ui/editor/components/transformation.tsx` and `src/ui/common/vec/vec3.tsx`
  - Numeric transform field editing.
  - validation for numeric input.
  - synced vector/euler state.
  - transform history entry after a valid field edit.

- `src/core/assets/asset-manager.ts` and
  `src/core/formats/glxf/thumbnail-generator.ts`
  - Asset catalog state.
  - async thumbnail generation.
  - separate WebGL thumbnail renderer.
  - bounds-based camera framing for thumbnails.

- `src/ui/styles/index.css`
  - The layout already matches the desired direction better than the current
    IWSDK editor: full-screen 3D canvas, translucent/floating side panels,
    bottom asset strip, center control bar, and top-left orientation gizmo.

### Adaptation Required

Do not copy the repo as-is. The useful code needs to be translated into IWSDK
editor concepts:

- Replace `SceneManager` singleton with `ViewportRuntimeAdapter` scoped to one
  editor session/page.
- Replace `SpatialEntity` as source of truth with IWSDK scene JSON nodes and
  IWSDK runtime entity/Object3D mappings.
- Replace command objects that mutate `SpatialEntity` directly with
  `SceneEditorSession` commands that produce scene patches, then sync runtime.
- Replace GLXF import/export as the default document format with
  `.iwsdk.scene.json`.
- Keep GLXF import/export only as a migration or debug path if needed.
- Replace window-sized renderer assumptions with container-sized editor viewport
  support.
- Integrate with managed browser page role/session routing and MCP tools.
- Move object click registration to raycast/pointer handling that works across
  imported IWSDK runtime objects, not only `SpatialEntity` instances.
- Add deterministic screenshot tooling and test hooks; `glxf-aio` tests focus on
  commands and do not yet prove editor viewport quality.

### Dependencies To Evaluate For IWSDK

These are practical candidates for the initial native 3D editor:

- `@pmndrs/handle`
  - Strong candidate for translate/rotate/scale gizmos.
  - Already handles mode binding and camera-aware updates.
  - Must be wrapped so drag commits one IWSDK scene patch.

- `three-viewport-gizmo`
  - Strong candidate for the orientation/navigation gizmo.
  - Already attaches to `OrbitControls`.
  - Must expose named-view actions for agent screenshots and E2E tests.

- `@pmndrs/pointer-events`
  - Useful for pointer/click routing in a Three scene.
  - Must be tested against IWSDK app/runtime event handling so editor-only
    picking does not leak into authored scenes.

- `postprocessing`
  - Useful for selection outlines and FXAA.
  - Must be measured in editor performance tests and kept out of production app
    bundles unless already used.

### What glxf-aio Does Not Solve

- It is not IWSDK-powered.
- It is GLXF-centered.
- It uses a local `SpatialEntity` model.
- It has singleton managers that are not safe for multiple editor sessions.
- It does not provide the MCP/agent tool layer.
- It does not provide save/reload parity with an IWSDK app page.
- It does not contain strict render-proof E2E tests.
- It does not solve component schema parity for IWSDK ECS components.

The net: use `glxf-aio` as the concrete mechanics reference for the editor
viewport, panels, handles, commands, and thumbnails. Use the D107934202 stack as
the broader architecture/reference for IWSDK runtime/editor separation, plugin
slots, schema inspector, editor/runtime separation, and agent bridge.

### glxf-aio Tests To Port Into IWSDK

Port the intent of these tests to IWSDK scene JSON/session tests:

- `tests/commands/transform-command.spec.ts`
  - transform execute/undo changes runtime transform exactly
  - selected-object transform applies through the handle wrapper without
    corrupting local object coordinates
  - non-existent ids are no-throw failures with useful descriptions
- `tests/commands/reparent-command.spec.ts`
  - reparent with `attach()` preserves world transform
  - reparent with `add()` preserves local transform
  - reparent to scene root works
  - undo restores original parent and transform
- `tests/commands/command-manager-integration.spec.ts`
  - compound commands produce one undo entry
  - mixed transform/reparent command batches undo cleanly
  - history descriptions and canUndo/canRedo state update after every command

The IWSDK versions must assert three layers for every command: scene document
patch, runtime Object3D matrix/hierarchy, and saved/reloaded document parity.

## Target Architecture

### Package Boundaries

1. `@iwsdk/scene-composition`
   - Source of truth for scene document shape, validation, serialization,
     migrations, patch operations, undo/redo, and deterministic placement
     helpers.
   - No browser, Vite, Playwright, Three, or IWSDK runtime imports.

2. `@iwsdk/core`
   - Runtime owner.
   - Loads `.iwsdk.scene.json` into an IWSDK `World`.
   - Exposes enough editor support for node id metadata, world/entity/object
     lookup, container sizing, scene reload/sync, and runtime stats.
   - Does not own editor UI.

3. New `@iwsdk/scene-editor` package, or a clearly separated editor client
   module under `packages/vite-plugin-dev/src/editor/client`
   - Preferred long-term shape is a new package if this editor will grow.
   - Owns browser UI, viewport adapter, camera controller, selection controller,
     transform controller, asset placement controller, inspector model, panel
     shell, CSS, and test hooks.
   - Depends on `@iwsdk/scene-composition`, `@iwsdk/core`, `three`, and only the
     UI libraries we intentionally accept.

4. `@iwsdk/vite-plugin-dev`
   - Owns the internal route, document endpoint, managed browser page creation,
     MCP relay, page role metadata, and dev-only serving of the editor bundle.
   - Should stop embedding the whole editor as a giant generated string.

5. `@iwsdk/cli`
   - Owns canonical runtime/tool contract definitions.
   - Verifies parity between CLI-exposed tools and browser editor methods.

6. Shared example asset package
   - Owns reusable GLTF assets and starter scene assets.
   - Examples and starters reference shared assets instead of carrying duplicated
     Meta Spatial exports.

### Browser Data Flow

1. Developer opens the managed browser.
2. Vite plugin opens or serves `/__iwsdk/editor?scene=public/scenes/main.iwsdk.scene.json`.
3. Browser client announces role `editor`, page id, generation, and
   `sceneSessionId`.
4. Editor client fetches the scene document through the safe document endpoint.
5. `SceneEditorSession` parses and validates the document through
   `@iwsdk/scene-composition`.
6. Viewport adapter creates an IWSDK `World` with XR disabled and loads the same
   scene document through `@iwsdk/core`.
7. The editor builds a node id to entity/Object3D registry from the runtime load.
8. Human UI and agent tools both dispatch commands through the scene session.
9. The scene session applies a document patch, records undo/redo, and emits a
   revision event.
10. The viewport adapter updates the live runtime:
    - Transform-only patches update Object3D and ECS transform in place.
    - Add/remove/asset/component patches rebuild only the affected subtree when
      possible.
    - Full reload remains as a safe fallback, but not on every drag tick.
11. Save serializes through the document endpoint.
12. App page reload proves the saved scene works outside the
    editor page.

### Runtime Integration Requirements

Core changes likely required:

- Allow `World.create` or adjacent editor API to render into a supplied container
  or canvas instead of always sizing to `window.innerWidth/innerHeight`.
- Preserve editor page MCP runtime methods when `World.create` installs runtime
  methods. Use a composite runtime rather than letting core overwrite
  `window.FRAMEWORK_MCP_RUNTIME`.
- Add `object.userData.iwsdkSceneNodeId = node.id` or equivalent metadata during
  native scene import.
- Return or expose a scene load result containing node id to entity/Object3D
  mappings.
- Put editor helpers on separate Three layers so raycasting can include or ignore
  grid, gizmo, light helpers, bounds, and runtime meshes intentionally.
- Expose renderer stats and readiness markers for E2E proof.
- Define behavior for non-GLTF assets in the editor viewport: proxy icon,
  placeholder bounds, audio/source glyph, video/image plane, or explicit
  unsupported state.

### Editor Controllers

The editor client should be decomposed into controllers rather than a single
runtime string:

- `EditorDocumentStore`
  - Owns document snapshot, revision number, dirty state, save state, and
    undo/redo bridge to `SceneEditorSession`.

- `ViewportRuntimeAdapter`
  - Owns IWSDK `World`, renderer canvas, asset readiness, scene load/sync,
    screenshot capture, test hooks, and teardown.

- `CameraController`
  - Owns orbit/pan/zoom, named views, custom camera poses, frame selection, frame
    scene, and orientation gizmo integration.

- `SelectionController`
  - Owns raycasting, hover, selection, multi-selection, outline/bounds overlays,
    and outliner/viewport synchronization.

- `TransformController`
  - Owns transform controls, mode, local/world space, snap settings, drag start,
    live runtime mutation, drag cancel, and commit patch. The first production
    implementation should evaluate porting the `glxf-aio` `@pmndrs/handle`
    approach before writing custom gizmo math.

- `AssetPlacementController`
  - Owns add node, drag from asset browser, place on surface, duplicate, group,
    align, distribute, and initial camera-aware placement.

- `InspectorModel`
  - Owns schema-driven transform, asset, metadata, and component editors.

- `PanelShell`
  - Owns floating/resizable/collapsible left and right panels, bottom panel,
    toolbar, status strip, and viewport overlay slots. Use the `glxf-aio`
    full-screen canvas plus floating translucent panel layout as the tactical UI
    reference, then merge in D107934203 slot/collapse concepts where needed.

## User-Facing Feature Inventory

### Center 3D Viewport

Must include:

- IWSDK-rendered WebGL canvas.
- Real scene assets and components.
- Editor grid.
- Selection outline and bounding boxes.
- Transform gizmo.
- Orientation/navigation gizmo.
- Camera controls.
- Light/camera/audio helpers where relevant.
- Viewport overlay slot for built-in and future plugin overlays.
- Screenshot capture from current and named camera views.
- Explicit loading, empty, error, and degraded states.

### Left Scene Composition Panel

Must include:

- Scene hierarchy/outliner.
- Search/filter.
- Select, rename, duplicate, delete, reorder, parent/unparent.
- Asset catalog with preview metadata.
- Add node from catalog.
- Drag or click placement into viewport.
- Grouping and zone organization.
- Validation panel with actionable errors.
- Logs panel.
- Scene-level settings.
- Optional bottom tabs for assets/console/events if that matches final layout.

### Right Object And Component Inspector

Must include:

- Selected node identity as an inline-editable title. It should look like the
  title at rest, show a subtle editable affordance on hover/focus, commit on
  Enter/focus-out, and avoid a separate Identity section or manual Rename
  button.
- Asset reference and asset metadata.
- Transform fields:
  - position
  - rotation
  - scale
  - local/world display where applicable
  - reset controls
  - numeric steppers
- Component list.
- Component add/remove.
- Schema-driven component fields.
- Validation errors next to invalid fields.
- Custom component payload editing.
- Metadata/editor-only fields.
- Multi-select behavior for common transform/component fields.
- No visible Source JSON block in the inspector.
- No visible runtime/debug block in the inspector. Runtime facts remain available
  through proof hooks and diagnostics for tests and agents.

Initial component schemas to support in tests:

- `Transform`
- `PanelUI`
- `Visibility`
- `RayInteractable`
- `DistanceGrabbable`
- `OneHandGrabbable`
- `TwoHandsGrabbable`
- `AudioSource`
- `PhysicsBody`
- `PhysicsShape`
- `DomeGradient`
- `IBLGradient`
- one custom example component

`Interactable` is supported as a deprecated import/validation alias for
`RayInteractable`, but it is not exposed as a separate addable schema in new
authoring.

### Viewport Toolbar And Gizmos

Must include:

- Select/move/rotate/scale modes.
- W/E/R shortcuts for move/rotate/scale.
- Escape to cancel active transform.
- Delete/backspace to remove selected nodes.
- F to frame selection.
- Local/world space toggle.
- Grid/angle/scale snapping controls.
- Surface placement toggle.
- Undo/redo.
- Save/reload.
- No live play/preview transport controls in the editor surface for this scope.
- Orientation gizmo/view cube:
  - X/Y/Z axis affordances
  - top/front/back/left/right/quarter shortcuts
  - synchronized with camera orientation
  - screenshot-visible only when requested or masked in tests

## Implementation Phases

Each phase below has its own testing plan and acceptance criteria. A phase is not
done until the listed tests or equivalent CI checks pass. The tests are designed
to fail the current 2D placeholder.

## Phase 0: Baseline Audit And Failing 3D Editor Tests

### Scope

Lock down the product definition before more implementation lands. The first
change should make it impossible to mistake a 2D placeholder for a 3D editor.

### Implementation

- Add this plan to `docs/plans/`.
- Add a short migration ledger that maps:
  - existing native scene JSON work
  - existing editor session/tools
  - current 2D placeholder code
  - Meta Spatial removal work
  - D107934202 stack salvage areas
- Add failing E2E specs for the current implementation:
  - WebGL/IWSDK render proof
  - camera/orientation gizmo proof
  - transform gizmo proof
  - agent screenshot proof
  - save/reload runtime parity proof
- Add test utilities for:
  - viewport-only screenshot capture
  - decoded image diff
  - masked UI overlays
  - WebGL context proof
  - renderer/world proof
  - network asset proof

### Testing Plan

Add these tests even before implementation:

- `packages/vite-plugin-dev/test/editor-webgl-render-proof.e2e.test.ts`
- `packages/vite-plugin-dev/test/editor-camera-and-orientation-gizmo.e2e.test.ts`
- `packages/vite-plugin-dev/test/editor-transform-gizmo.e2e.test.ts`
- `packages/vite-plugin-dev/test/editor-agent-tools-render-proof.e2e.test.ts`
- `packages/vite-plugin-dev/test/editor-save-reload-runtime-parity.e2e.test.ts`

Commands:

```bash
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-webgl-render-proof.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-camera-and-orientation-gizmo.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-transform-gizmo.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-agent-tools-render-proof.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-save-reload-runtime-parity.e2e.test.ts
```

### End-To-End Gate

The tests must prove the current implementation fails for the right reasons:

- `#scene-canvas` is not initialized with WebGL.
- No IWSDK `World` is available from editor test hooks.
- No runtime mesh/object registry exists.
- Screenshots are from the 2D renderer.
- Transform controls are not real object controls.
- Orientation gizmo is absent or cosmetic.

### Acceptance Criteria

- Tests are committed as failing or skipped with an explicit TODO and failure
  explanation while implementation is in progress.
- Each test contains an assertion that would reject a `getContext('2d')`
  renderer, CSS/SVG mock viewport, synthetic base64 screenshot, or label-only
  camera change.
- The current placeholder gap is documented in the plan and in test comments.
- No production behavior is considered complete in this phase.

## Phase 1: Extract The Editor Client From The Inline Runtime

### Scope

Move from a giant generated string in `packages/vite-plugin-dev/src/index.ts` to
real editor client modules that can be maintained, tested, and expanded.

### Implementation

- Create an editor client module tree, either:
  - `packages/scene-editor/src/*`, preferred for long-term ownership, or
  - `packages/vite-plugin-dev/src/editor/client/*`, acceptable as a first step.
- Add a browser entry point that bootstraps:
  - session fetch
  - `SceneEditorSession`
  - editor shell
  - viewport adapter placeholder interface
  - MCP runtime registration
  - test hooks in dev/test only
- Keep the current document endpoint and path safety.
- Keep the existing `scene_*` session API stable.
- Move CSS out of inline template strings into editor CSS modules or an explicit
  stylesheet.
- Replace ad hoc global state with a typed editor store/controller model.
- Add an internal editor bundle path served by the Vite plugin.

### Testing Plan

- Unit tests for editor bootstrap without creating WebGL.
- Route tests for:
  - `/__iwsdk/editor`
  - document GET
  - document PUT
  - path confinement
  - missing scene document creation
- Contract tests to prove `SceneEditorSession` method names still match the CLI
  contract.

Commands:

```bash
pnpm --filter @iwsdk/vite-plugin-dev test
pnpm test:canonical-mcp-surface
pnpm format:check
```

### End-To-End Gate

Open `/__iwsdk/editor?scene=public/scenes/editor-smoke.iwsdk.scene.json` in the
managed browser and prove:

- editor bundle loads from source modules
- scene document loads through the endpoint
- `window.FRAMEWORK_MCP_RUNTIME` includes the `scene_*` tools
- role/session metadata is announced as `editor`
- save still writes the scene document to disk

### Acceptance Criteria

- `packages/vite-plugin-dev/src/index.ts` no longer contains the full editor UI
  and viewport implementation as a giant runtime string.
- Existing scene session unit tests still pass.
- Existing MCP routing tests still pass.
- The editor can load, save, and expose `scene_*` methods before the 3D viewport
  is wired.
- No new dependency is added to production app bundles.

## Phase 2: Core Runtime Support For Editor Viewports

### Scope

Make `@iwsdk/core` support editor-style embedded rendering and scene/object
lookup without turning core into an editor UI package.

### Implementation

- Add container or canvas sizing support for editor-created worlds.
- Add a safe way for an editor page to combine core runtime tools with editor
  `scene_*` tools without one overwriting the other.
- Add node id metadata to imported Object3Ds/entities:
  - `object.userData.iwsdkSceneNodeId`
  - entity metadata or registry entry
- Expose a scene load result or registry with:
  - node id
  - entity id
  - root Object3D
  - mesh count
  - component list
  - bounds
- Add readiness events for:
  - world initialized
  - scene document loaded
  - assets loaded
  - first stable render complete
- Add editor-safe reload/sync helpers:
  - update transform
  - rebuild subtree
  - full reload fallback
- Put editor helper objects on dedicated layers.

### Testing Plan

Add core tests for:

- container-sized renderer dimensions
- scene node id metadata on imported objects
- native scene JSON load result registry
- nested node transform parity
- component import parity for tested components
- runtime method composition behavior
- asset load readiness

Commands:

```bash
pnpm --filter @iwsdk/core test
pnpm --filter @iwsdk/core build
pnpm test:canonical-mcp-surface
```

### End-To-End Gate

Create a browser runtime fixture that loads
`public/scenes/runtime-smoke.iwsdk.scene.json` through `World.create({ level })`
and writes a proof artifact with:

- WebGL context type
- IWSDK package version
- renderer size
- draw calls if available
- entity count
- mesh count
- material count
- texture count
- component count by type
- node id to object/entity map
- asset network statuses

### Acceptance Criteria

- `World.create({ level: './scenes/main.iwsdk.scene.json' })` works in a browser
  fixture.
- The editor can create a world inside a viewport container without hijacking the
  whole window size.
- Imported runtime objects can be mapped back to scene JSON nodes.
- Runtime errors include scene node id and component name.
- Existing GLXF/native scene tests continue to pass while GLXF compatibility
  exists.

## Phase 3: Real IWSDK 3D Viewport MVP

### Scope

Replace the 2D editor viewport with a real IWSDK/Three viewport.

### Implementation

- Implement `ViewportRuntimeAdapter`.
- Create an IWSDK world with XR disabled.
- Load the active scene document into the world.
- Mount the renderer canvas in the center viewport.
- Add editor grid and basic lighting defaults.
- Add viewport resize handling.
- Add loading/error/empty states.
- Add screenshot capture from the WebGL canvas.
- Add test hooks:
  - `worldReady`
  - `sceneReady`
  - `cameraState`
  - `rendererStats`
  - `objectMap`
  - `captureViewport`
- Remove the 2D projected render path from the accepted runtime path. It can be
  temporarily kept only behind a clearly named debug flag that is never used in
  tests or product defaults.

### Testing Plan

Update and run:

```bash
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-webgl-render-proof.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev test
```

Assertions:

- `#scene-canvas` has `webgl2` or `webgl`.
- `window.IWSDK_SCENE_EDITOR_TEST_HOOKS.worldReady === true`.
- Runtime mesh count is greater than zero for the fixture.
- GLTF/texture network requests return 2xx.
- A viewport screenshot contains rendered object pixels in expected regions.
- A 2D-only canvas implementation fails the test.

### End-To-End Gate

Use a fixture with asymmetric real GLTF assets plus a known orientation/color
calibration asset. Capture:

- `editor-quarter.png`
- `proof.json`
- `network.json`
- `console.json`

The fixture should fail if assets are replaced by dots, labels, flat SVG, or
placeholder CSS.

### Acceptance Criteria

- The editor opens with a real 3D scene in the center viewport.
- The 2D canvas projection is not the default renderer and cannot satisfy E2E
  tests.
- Screenshots come from the WebGL viewport.
- Runtime proof artifacts are written in CI/test mode.
- Console and failed network requests are surfaced in the editor and fail tests
  unless explicitly allowlisted.

## Phase 4: Camera Controls And Orientation Gizmo

### Scope

Add real editor camera controls and a clickable navigation/orientation gizmo.

### Implementation

- Add `CameraController`.
- Integrate Three `OrbitControls` or the salvaged `cameraControl` pattern.
- Add:
  - orbit
  - pan
  - zoom
  - frame selection
  - frame scene
  - reset view
  - named camera views
  - explicit camera poses
- Add an orientation gizmo/view cube, using the salvaged `NavigationGizmo` concept
  from D107934204, `three-viewport-gizmo` from `glxf-aio`, or Three
  `ViewHelper` as the initial implementation. Prefer `three-viewport-gizmo` for
  the first slice if it integrates cleanly with IWSDK camera ownership.
- Synchronize orientation gizmo state with the active camera.
- Add `scene_set_camera` support for named/custom views.
- Add `scene_screenshot` support for:
  - `current`
  - `top`
  - `front`
  - `back`
  - `left`
  - `right`
  - `quarter`
  - deterministic `orbit` step
  - explicit `{ position, lookAt, fov }`

### Testing Plan

Run:

```bash
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-camera-and-orientation-gizmo.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-agent-tools-render-proof.e2e.test.ts
```

Assertions:

- Clicking top/front/right on the orientation gizmo changes camera pose.
- `scene_set_camera({ view: 'top' })` changes camera pose.
- `scene_screenshot({ view: 'top' })` and `scene_screenshot({ view: 'front' })`
  produce different viewport pixels for geometric reasons.
- UI overlays are masked or hidden before image comparison.
- Camera state is reported through test hooks and matches expected named-view
  vectors within tolerance.

### End-To-End Gate

For the same fixture scene, capture:

- `editor-top.png`
- `editor-front.png`
- `editor-right.png`
- `editor-quarter.png`
- `image-diff.json`
- `camera-states.json`

The diff must prove real viewpoint changes, not label or UI changes.

### Acceptance Criteria

- Agents and humans can inspect scenes from multiple angles.
- The orientation gizmo is visible, clickable, and synchronized.
- Named-view screenshots are deterministic and tool-addressable.
- The most important benchmark gap, single-view blindness, is closed at the tool
  level.

## Phase 5: Selection, Outliner, And Left Scene Composition Panel

### Scope

Make the editor a usable scene composition tool, not just a renderer.

### Implementation

- Add `SelectionController` with raycast picking against meshes/bounds proxies.
- Add hover highlighting.
- Add selection outline and bounding boxes.
- Add outliner synced with selection.
- Add hierarchy operations:
  - select
  - rename
  - duplicate
  - remove
  - reorder
  - parent/unparent
  - group/ungroup if supported by the scene document
- Add asset browser:
  - list catalog assets
  - show metadata and preview thumbnail/proxy
  - add node
  - drag/click placement
- Add validation/log tabs in the left panel.
- Keep all mutations routed through `SceneEditorSession`.

### Testing Plan

Add tests for:

- raycast selection from viewport
- outliner selection changes viewport outline
- asset browser add node
- duplicate/delete
- parent/unparent
- validation errors appear in the left panel
- no precomputed 2D hit target is used as the authoritative picker

Commands:

```bash
pnpm --filter @iwsdk/vite-plugin-dev test
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-webgl-render-proof.e2e.test.ts
```

### End-To-End Gate

Starting from an empty scene:

1. Add a real GLTF asset from the catalog.
2. Select it in the viewport by raycast.
3. Select it in the outliner.
4. Duplicate it.
5. Parent the duplicate under a group.
6. Save.
7. Reload editor.
8. Prove hierarchy and rendered object count match.

### Acceptance Criteria

- Viewport, outliner, and document selection are always in sync.
- Selection is based on runtime objects or bounds proxies, not 2D projected dots.
- Added assets render as real scene objects.
- Mutations create reversible scene patches.
- Save/reload preserves hierarchy and selection-relevant ids.

## Phase 6: Transform Gizmo, Snapping, And Object Manipulation

### Scope

Implement the object manipulation functionality expected from a 3D editor.

### Implementation

- Add `TransformController`.
- Use the `glxf-aio` `@pmndrs/handle` implementation pattern or the salvaged
  D107934204 `TransformGizmo` concept for the initial production implementation.
  Prefer the `@pmndrs/handle` path if it can be wrapped cleanly around IWSDK
  Object3Ds because it already provides translate/rotate/scale handles, mode
  binding, local/world space, camera-aware updates, and drag lifecycle hooks.
- Support modes:
  - translate
  - rotate
  - scale
- Support axis handles:
  - X
  - Y
  - Z
  - plane/free handles where appropriate
- Support:
  - W/E/R shortcuts
  - local/world space toggle
  - grid snapping
  - angle snapping
  - scale snapping
  - surface placement snapping
  - drag cancel
  - drag commit
  - undo/redo
- During drag:
  - update runtime Object3D live for responsive feedback
  - do not write every mousemove into scene history
  - commit one `scene_set_transform` or patch on pointer up
  - revert runtime object on cancel
- Reflect transform changes in:
  - scene JSON document
  - runtime Object3D matrix
  - inspector fields
  - screenshot pixels

### Testing Plan

Run:

```bash
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-transform-gizmo.e2e.test.ts
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-save-reload-runtime-parity.e2e.test.ts
```

Assertions:

- Dragging X translate changes only X within tolerance.
- Dragging Y translate changes only Y within tolerance.
- Dragging Z translate changes only Z within tolerance.
- Rotate mode changes rotation and rendered orientation.
- Scale mode changes scale and rendered size.
- Snap settings quantize transform output.
- Undo restores document transform, runtime transform, and pixels.
- Redo reapplies document transform, runtime transform, and pixels.
- A direct document-only change with no runtime matrix update fails.

### End-To-End Gate

The test fixture must:

1. Select a known asset.
2. Drag each transform mode.
3. Record `scene-before.json`, `scene-after.json`,
   `runtime-matrix-before.json`, `runtime-matrix-after.json`, and screenshots.
4. Save.
5. Reload editor and app.
6. Compare document/runtime/screenshot parity.

### Acceptance Criteria

- Real transform gizmo manipulation works in the viewport.
- Transform edits are durable and reversible.
- Runtime and document transforms cannot drift silently.
- The inspector, outliner, and viewport all reflect the same selected transform.
- Tests would fail on a fake 2D gizmo line renderer.

## Phase 7: Right Inspector And Component Editing

### Scope

Make selected object editing complete enough to replace the Meta Spatial Editor
workflow for IWSDK examples and starters.

### Implementation

- Add `InspectorModel`.
- Build schema-driven controls for:
  - transform
  - asset reference
  - node metadata
  - components
- Add component add/remove.
- Add component validation before save.
- Add compact vector/numeric controls, reusing D107934205 ideas if useful.
- Add multi-select common-field editing.
- Add object/component dirty indicators.
- Add inline error states and actionable validation text.
- Keep runtime proof fields available to tests and agent diagnostics, but do not
  expose them in the default human inspector:
  - bounds
  - mesh count
  - material count
  - component runtime status

### Testing Plan

Add tests for:

- transform field editing updates runtime and document
- invalid transform values are rejected
- component add/remove
- `PanelUI` schema editing
- `Visibility` editing
- `PhysicsBody` editing
- `PhysicsShape` editing
- custom component editing
- invalid component payload rejects save
- multi-select common transform editing

Commands:

```bash
pnpm --filter @iwsdk/vite-plugin-dev test
pnpm --filter @iwsdk/core test
```

### End-To-End Gate

Use the inspector to:

1. Select an object.
2. Edit transform fields.
3. Add a component.
4. Change component fields.
5. Trigger and clear a validation error.
6. Save.
7. Reload editor.
8. Reload app.
9. Prove the runtime component exists and behaves or is at least present in ECS.

### Acceptance Criteria

- The inspector is schema-driven, not a set of one-off fields.
- Invalid component payloads fail before save.
- Supported example components are editable enough to migrate examples.
- Deprecated `Interactable` payloads validate and import as `RayInteractable`.
- Component edits round-trip through scene JSON and runtime import.

## Phase 8: Agent Tools Backed By The 3D Editor

### Scope

Make agentic scene composition use the same 3D editor path humans use.

### Implementation

- Keep the existing `scene_*` method names.
- Update implementations to call the new controllers and session.
- Make `scene_screenshot` capture the real WebGL viewport.
- Make `scene_set_camera` use `CameraController`.
- Make `scene_select` update runtime selection and UI.
- Make `scene_set_transform`, `scene_place_on`, and `scene_look_at` update both
  document and runtime.
- Add `scene_get_runtime_summary` if needed for proof, but do not fragment the
  canonical tool surface unnecessarily.
- Add strict page/session targeting:
  - app page tools go to app role
  - scene composition tools go to editor role
  - stale editor tabs cannot win a response race
- Extend tool docs and preloaded agent instructions to mention:
  - multi-angle screenshots
  - camera movement
  - transform gizmo/manual verification
  - save/reload validation

### Testing Plan

Run:

```bash
pnpm --filter @iwsdk/vite-plugin-dev exec vitest run test/editor-agent-tools-render-proof.e2e.test.ts
pnpm test:canonical-mcp-surface
pnpm --filter @iwsdk/cli test
```

Assertions:

- Agent-style calls can compose a scene without direct filesystem edits.
- Tools target the editor page.
- Multi-angle screenshots come from WebGL.
- The hierarchy returned by tools matches runtime and outliner.
- `scene_save` writes to disk.
- Reloaded app sees the saved scene.

### End-To-End Gate

Run a scripted agent-flow test:

1. Open app and editor pages.
2. Use only `scene_*` tools to list assets.
3. Add three assets.
4. Place one on another with `scene_place_on`.
5. Orient one toward another with `scene_look_at`.
6. Capture top/front/quarter screenshots.
7. Validate.
8. Save.
9. Reload editor and app.
10. Prove document/runtime/screenshot parity.

### Acceptance Criteria

- Agents get the same visual feedback a human gets.
- Tooling closes the benchmark-identified single-camera gap.
- No direct JSON file edits are needed for normal agent scene composition.
- CLI contract, browser runtime, and tests remain in parity.

## Phase 9: Lighting, Helpers, Editor Boundaries, And Plugin Slots

### Scope

Bring over the remaining useful capabilities from the D107934202 stack once the
core editor is real.

### Implementation

- Add editor/runtime system bands:
  - edit-only overlays
  - authored-runtime systems
  - editor-only helper state
  - explicit absence of live play/preview transport controls
- Add light helpers and light gizmos.
- Add camera/audio/source helpers.
- Add bottom panel tabs:
  - console
  - events
  - validation
    Dedicated asset details live in the selected-node Asset inspector section,
    not as a bottom diagnostics tab.
- Add plugin slot support:
  - toolbar slots
  - sidebar slots
  - inspector sections
  - bottom panel tabs
  - viewport overlays
- Add declarative plugin/agent contribution validation before enabling general
  extension points.

### Testing Plan

Add tests for:

- live play/preview transport controls remain absent from the editor surface
- light helper selection and editing
- plugin slot rendering
- plugin contribution validation
- bottom panel console/event logs
- overlay layer picking exclusions

Commands:

```bash
pnpm --filter @iwsdk/vite-plugin-dev test
pnpm --filter @iwsdk/core test
```

### End-To-End Gate

Open a scene with lights and event-producing components:

1. Edit a light with gizmo/inspector.
2. Confirm no play/pause/reset/preview transport controls are exposed.
3. Confirm editor document remains unchanged unless explicitly edited.
4. Confirm console/events panels capture runtime activity.
5. Confirm plugin overlay renders without breaking selection or transforms.

### Acceptance Criteria

- Live play/preview transport remains out of scope and absent from the editor UI.
- Editor overlays do not become scene document content unless explicitly saved.
- Plugin slots are validated and bounded.
- Light/camera/helper gizmos work through the same selection/inspector path.

## Phase 10: Meta Spatial Removal And Example Migration

### Scope

Finish the broader replacement program. The native editor becomes the authored
scene path; Meta Spatial Editor integration leaves the supported surface.

### Implementation

- Remove or hard-deprecate create flags:
  - `--metaspatial`
  - `--no-metaspatial`
  - Meta Spatial template variants
- Remove Meta Spatial installer/detector flows.
- Remove or archive `@iwsdk/vite-plugin-metaspatial`.
- Remove Meta Spatial CLI wiring from examples and scripts.
- Convert examples to native scene JSON:
  - audio
  - grab
  - physics
  - starter VR
  - starter AR
- Extract duplicated GLTF assets into a shared package/catalog.
- Update docs:
  - setup guide
  - native scene editor guide
  - migration guide
  - ECS docs
  - grabbing docs
  - physics docs
  - troubleshooting
  - public agent docs
- Keep GLXF only as an explicit legacy reader until removal criteria are met.

### Testing Plan

Add or strengthen:

- `scripts/check-metaspatial-removal.mjs`
- `scripts/check-native-scene-examples.mjs`
- `scripts/check-native-scene-docs.mjs`
- `scripts/check-native-scene-render-proof.mjs`
- create flow E2E for generated starters
- generated starter app/editor evidence under
  `docs/test-evidence/native-scene-starters/current/`

Commands:

```bash
pnpm test:native-scene-example-runtime
pnpm test:native-scene-render-proof
pnpm test:create-flow-e2e
pnpm test:native-scene-starter-evidence
pnpm test:metaspatial-removal
pnpm format:check
pnpm lint
```

### End-To-End Gate

Run migrated examples in a browser:

- audio
- grab
- physics
- generated VR starter
- generated AR starter

For each, collect:

- app screenshot
- editor screenshot
- WebGL proof
- asset network proof
- runtime hierarchy
- component summary
- console/failure log

### Acceptance Criteria

- No supported example or starter requires Meta Spatial Editor.
- No supported build script downloads, invokes, or configures Meta Spatial
  Editor.
- Generated starters open the app and editor, render real IWSDK scenes, save a
  scene edit, and reload successfully.
- Docs no longer recommend the old Meta Spatial workflow.
- The removal audit has no non-allowlisted findings.

## Phase 11: Release Hardening And Evidence

### Scope

Make the editor shippable and hard to regress.

### Implementation

- Add release evidence generation under
  `docs/test-evidence/native-scene-editor/<run-id>/`.
- Add a machine verifier for the generated native editor evidence bundle.
- Add CI jobs for the new E2E tests.
- Add performance thresholds:
  - editor startup time
  - scene load time
  - screenshot capture time
  - transform drag responsiveness
- Add failure diagnostics:
  - renderer init failure
  - asset load failure
  - component import failure
  - save failure
  - MCP routing failure
- Add docs for:
  - human editor workflow
  - agent scene composition workflow
  - migration from Meta Spatial
  - scene JSON authoring format
  - troubleshooting WebGL/headless browser failures

### Testing Plan

Full release rehearsal:

```bash
pnpm format:check
pnpm lint
pnpm test
pnpm test:canonical-mcp-surface
pnpm test:native-scene-render-proof
pnpm test:native-scene-editor-evidence
pnpm test:native-scene-manual-smoke -- --evidence docs/test-evidence/native-scene-manual-smoke.json
pnpm test:create-flow-e2e
pnpm test:metaspatial-removal
node scripts/native-scene-release-rehearsal.mjs --require-manual-smoke --manual-smoke-evidence docs/test-evidence/native-scene-manual-smoke.json
```

### End-To-End Gate

Release evidence bundle must include:

- `proof.json`
- `network.json`
- `console.json`
- `scene-before.json`
- `scene-after.json`
- `hierarchy-before.json`
- `hierarchy-after.json`
- `editor-top.png`
- `editor-front.png`
- `editor-right.png`
- `editor-quarter.png`
- `app-after-reload.png`
- `image-diff.json`
- `performance.json`
- command logs
- browser/device versions
- package versions

### Acceptance Criteria

- All editor E2E tests pass in CI.
- Evidence artifacts prove real WebGL/IWSDK runtime behavior.
- The editor fails loudly when WebGL/runtime initialization fails.
- Manual smoke evidence is machine-checked, not checklist-only.
- The release notes clearly state that Meta Spatial Editor integration is
  deprecated/replaced by the native IWSDK 3D scene editor.

## Test Strategy Details

### Tests That Must Fail A 2D Placeholder

Every editor E2E should reject:

- `canvas.getContext('2d')` as the primary renderer.
- CSS/SVG mock scenes.
- Base64-only screenshot proof.
- Label-only camera changes.
- Fake colored dots instead of GLTF assets.
- Precomputed 2D hit circles instead of raycasting.
- Transform updates that change JSON but not runtime matrices.
- Transform updates that change runtime but not saved JSON.
- Save-only-in-memory behavior.
- App page screenshots used as editor viewport screenshots.
- Stale editor tab responses.

### Required Proof Artifacts

For each important E2E run, write artifacts under:

`docs/test-evidence/native-scene-editor/<run-id>/`

Minimum files:

- `proof.json`
  - browser
  - WebGL context type
  - renderer info where available
  - IWSDK package versions
  - entity count
  - mesh/material/texture counts
  - draw calls if available
- `network.json`
  - asset URLs
  - statuses
  - content types
  - hashes where practical
- `console.json`
  - console errors
  - page errors
  - failed requests
  - allowlisted warnings
- `scene-before.json`
- `scene-after.json`
- `hierarchy-before.json`
- `hierarchy-after.json`
- `editor-top.png`
- `editor-front.png`
- `editor-right.png`
- `editor-quarter.png`
- `app-after-reload.png`
- `image-diff.json`
- `performance.json`

### Minimum Fixture Requirements

Use asymmetric, visually distinguishable fixture scenes. A good fixture contains:

- one textured GLTF mesh with obvious orientation
- one known-color calibration object
- one nested transform
- one object elevated onto another
- one object that faces another
- one light
- one interactable component
- one physics component
- one audio component
- one custom component

This makes camera, orientation, selection, placement, component import, and
save/reload failures visible.

## Risks And Mitigations

1. `World.create` overwrites editor MCP runtime globals.
   - Mitigation: add a composite runtime registration path and a test that proves
     both core runtime tools and editor `scene_*` tools remain callable.

2. Full IWSDK core in the editor bundle increases dev-plugin surface area.
   - Mitigation: prefer `@iwsdk/scene-editor` as a browser package consumed by
     the Vite plugin; keep Node middleware and browser editor code separated.

3. Incremental scene sync is hard.
   - Mitigation: support transform patch sync first, subtree rebuild second, full
     reload fallback third. Never full-reload on every gizmo drag tick.

4. Component schemas can drift between scene JSON and runtime.
   - Mitigation: centralize schema metadata, add parity tests, and fail save on
     invalid payloads.

5. Headless WebGL can be flaky in CI.
   - Mitigation: collect renderer diagnostics, use deterministic fixtures, mask
     overlays during diffs, and keep failures actionable.

6. Plugin extensibility can consume the schedule.
   - Mitigation: ship first-party editor capabilities first; add validated plugin
     slots after viewport, gizmo, inspector, and agent tools are real.

7. Meta Spatial removal and editor construction can conflict.
   - Mitigation: keep migration phases explicit; examples can move to scene JSON
     before every editor feature is complete, but release cannot claim editor
     replacement until 3D viewport/gizmo/tool tests pass.

## Recommended First Implementation Slice

The fastest credible slice is:

1. Add failing WebGL/render-proof and transform-gizmo E2E tests.
2. Extract the editor runtime out of `index.ts`.
3. Add core node id metadata and container-sized editor world support.
4. Render the active scene JSON through IWSDK in the editor viewport.
5. Port the `glxf-aio` viewport shell mechanics: orbit controls, orientation
   gizmo, selection outline, and floating panels.
6. Add named camera views and WebGL-backed screenshots.
7. Add raycast selection.
8. Port or wrap the `glxf-aio` `@pmndrs/handle` transform flow, starting with
   translate-only document/runtime/save parity.
9. Expand to rotate/scale, inspector, and component editing.

This avoids spending more time improving the placeholder while still preserving
the useful scene session and agent tool work already done.
