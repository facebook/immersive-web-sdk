---
outline: [2, 4]
---

# Workflows

Practical agent workflows for the canonical IWSDK CLI/MCP surface.

## Runtime First

```bash
npx iwsdk dev status
npx iwsdk dev up
npx iwsdk mcp inspect --tool scene_render_file
```

The workspace-local CLI is the stable front door. MCP adapters point to
`iwsdk mcp stdio`; they do not bind themselves to ephemeral dev-server ports.

Common equivalents:

```text
xr_get_session_status  <-> iwsdk xr status
xr_accept_session      <-> iwsdk xr enter
browser_screenshot     <-> iwsdk browser screenshot
scene_render_file      <-> iwsdk scene render-file
scene_get_state        <-> iwsdk scene state
ecs_diff               <-> iwsdk ecs diff
```

## File-First Scene Authoring

```text
1. scene_get_capabilities
2. Create or edit public/scenes/*.iwsdk.scene.json directly
3. scene_render_file on every changed module
4. scene_render_file on the composed root
5. scene_open for live collaboration
6. scene_get_state
7. scene_set_camera + scene_screenshot for exact review views
8. Verify the application runtime and console
```

`scene_render_file` validates, resolves imports, materializes, and renders. Invalid
files return diagnostics and no PNG. Opening is not required for validation.

The editor watches the active root and its transitive imports. Valid changes replace
the preview atomically; invalid changes preserve the last valid render; unsaved human
changes produce a conflict.

## Parallel Modules

Use one file per independently owned semantic group:

```text
public/scenes/room.iwsdk.scene.json
public/scenes/modules/architecture.iwsdk.scene.json
public/scenes/modules/reading-nook.iwsdk.scene.json
public/scenes/modules/decor.iwsdk.scene.json
```

Give each worker a local origin, size envelope, attachment points, palette, and
required views. Workers must not share files. Render each module independently, then
compose them through root `imports` and fix cross-module scale/contact/lighting in the
root or owning module.

## Screenshot-Driven Development

For application code:

```text
1. npx iwsdk dev status
2. Modify code
3. browser_reload_page
4. browser_get_console_logs
5. browser_screenshot (always captures the application runtime)
6. Compare the visible result against the requirement
```

For authored scenes use `scene_screenshot`, which includes exact camera, active file,
hashes, validation diagnostics, and render statistics. Use `captureMode: "render"`
for scene evidence and `captureMode: "editor"` for UI diagnostics.

## Selected-Object Collaboration

When a user asks about the selected object:

```text
1. scene_get_state -> read selection and active file
2. Read the owning node/module from disk
3. Edit that file directly
4. scene_render_file on the owner and root
5. scene_get_state -> verify clean hashes/diagnostics
```

Use `scene_select` only to establish or synchronize live editor context. Selection is
not document mutation.

## Visual Isolation

```text
1. scene_set_preview_visibility -> solo or context mode
2. scene_set_camera -> exact required view
3. scene_screenshot
4. scene_set_preview_visibility -> restore
```

Preview visibility never changes scene hashes. Keep required context objects visible
when judging support contact, relative scale, occlusion, or material response.

## Image Reconstruction

```text
1. Record source regions and camera assumptions
2. Author coarse stage, light, and hero camera
3. Build and render identity-critical modules one at a time
4. Compose the root
5. Capture source-aligned hero and alternate views
6. scene_measure_image_regions only for meaningful aligned regions
7. Fix the largest measured or visual defect
```

Compare source and render at the same aspect ratio. Treat class recognition as
insufficient evidence: inspect silhouette, proportions, parts, negative space,
contacts, and material response.

## Runtime Entity Debugging

Scene hierarchy is authored in files. For live behavioral state use ECS tools:

```text
1. ecs_find_entities
2. ecs_query_entity
3. ecs_pause
4. ecs_snapshot(label="before")
5. Trigger an XR action or ecs_step
6. ecs_snapshot(label="after")
7. ecs_diff(from="before", to="after")
8. ecs_resume
```

Use `ecs_list_components` before reading or writing component fields, and
`ecs_list_systems` before toggling a system.

## XR Interaction

```text
1. xr_get_session_status
2. xr_accept_session when needed
3. xr_set_input_mode
4. xr_set_connected
5. xr_set_transform or xr_animate_to
6. xr_select or xr_set_select_value
7. browser_screenshot + ECS observation
```

Do not use XR availability as a dev-server or editor-readiness signal.

## Final Review

Keep evidence outside the editor:

```text
1. Record source/composed/runtime/capability hashes
2. Capture layout, geometry, and final views
3. Store measurements and concrete visual observations
4. Verify editor state is clean and conflict-free
5. Verify the live application loads the expected runtime hash
6. Run the application build
```

The editor supplies raw observations; review lineage, defect prioritization, stopping,
and release decisions are ordinary task artifacts rather than MCP workflow tools.
