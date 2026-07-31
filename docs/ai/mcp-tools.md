# MCP Tools

IWSDK exposes browser, WebXR, scene-observation, and ECS tools through the managed
runtime. Tool schemas are canonical; inspect the installed contract rather than
guessing arguments:

```bash
npx iwsdk mcp inspect --tool scene_render_file
npx iwsdk scene render-file --help
```

## Scene Authoring Model

Scene JSON files are the authoring API. Agents create and edit
`public/scenes/*.iwsdk.scene.json` with normal filesystem tools. The managed editor
watches the open root and imported module files, validates changes, and swaps valid
documents atomically. Invalid files keep the previous valid render and expose
diagnostics. Unsaved human changes cause an explicit conflict instead of being
overwritten.

The public `scene_*` surface is exactly nine tools. Document mutation, creation,
composition, validation-only, review, proof, and publish tools are intentionally not
part of MCP.

### `scene_open`

Open an existing scene file in the managed editor. The file must already exist under
`public/scenes/` and end in `.iwsdk.scene.json`.

| Parameter | Type     | Required | Description                        |
| --------- | -------- | -------- | ---------------------------------- |
| `path`    | `string` | Yes      | Workspace-relative scene file path |

Opening changes the active document and reconnects the editor session. It never
creates a file.

### `scene_render_file`

Validate, recursively compose, materialize, and render a scene file without changing
the active editor document. This is the detached validation operation and renderer in
one call.

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| `path`    | `string` | Yes      | Existing root or module scene file               |
| `view`    | `string` | No       | Canonical view such as `front`, `top`, `quarter` |
| `viewId`  | `string` | No       | Exact saved authoring view                       |
| `width`   | `number` | No       | Output width in pixels                           |
| `height`  | `number` | No       | Output height in pixels                          |

A valid result includes source/composed/runtime hashes, resolved dependencies,
camera, render statistics, PNG image data, and its SHA-256. An invalid result includes
structured diagnostics and no PNG.

### `scene_get_state`

Get the current editor observation in one response:

- active root and imported dependency paths;
- selection;
- source, composed, and runtime hashes;
- validation status and file-reload diagnostics;
- dirty and external-file conflict state;
- runtime readiness and errors;
- renderer statistics and visible node IDs.

Hierarchy and resource data already live in the authored files and are not duplicated
through MCP.

### `scene_get_capabilities`

Get the active scene schema, supported resources/content/materials/geometries,
component schemas, safety limits, and canonical capability hash. The default response
is compact; pass `full: true` only when the complete schema payload is required.

### `scene_select`

Set live editor selection so an agent can inspect or act on the same context as a
human. Selection does not modify the scene document.

| Parameter | Type       | Required | Description                      |
| --------- | ---------- | -------- | -------------------------------- |
| `nodeIds` | `string[]` | Yes      | Existing composed scene node IDs |
| `mode`    | `string`   | No       | Replace, add, or remove mode     |

### `scene_set_camera`

Set the editor camera to a canonical or saved view. Canonical views include `top`,
`front`, `back`, `left`, `right`, `quarter`, and deterministic `orbit` steps. Exact
orthographic views use `projection: "orthographic"` and `orthographicHeight`.

### `scene_screenshot`

Capture the active scene. `captureMode: "render"` omits editor grid, selection,
transform, helper, and orientation overlays; `captureMode: "editor"` includes the UI
diagnostic state. Results include PNG data plus active file, hashes, camera, renderer
environment, visible node IDs, validation diagnostics, and render statistics.

### `scene_set_preview_visibility`

Apply temporary recursive `show`, `hide`, `solo`, `context`, `ghost`, or `lock`
arrangements. Preview visibility never changes document or runtime hashes and is not
persisted to the scene file.

### `scene_measure_image_regions`

Measure explicitly aligned image regions for semantic color, luma, highlight, or
shadow comparison. Use only when the source/render alignment and requested statistic
are meaningful. The hierarchy and authored geometry remain in the file.

## Modular Scenes

Scene roots may declare top-level imports:

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "imports": [
    {
      "id": "nook",
      "src": "./modules/nook.iwsdk.scene.json",
      "transform": { "position": [1.5, 0, 0] }
    }
  ],
  "resources": {},
  "nodes": []
}
```

Modules are valid standalone v1 documents. Resolution is recursive and deterministic.
Nodes/resources are namespaced as `<import-id>/<local-id>`, import transforms live on
wrapper groups, and relative asset URIs rebase from the module. The root owns global
metadata, environment, and authoring fields. Cycles and invalid modules fail before
rendering.

## Browser

### `browser_screenshot`

Capture the runtime, editor, or complete managed workspace surface. Use the `target`
parameter (`runtime`, `editor`, or `workspace`) instead of relying on the currently
visible tab.

### `browser_get_console_logs`

Read browser console logs with optional `count`, `level`, `pattern`, and `since`
filters.

### `browser_reload_page`

Reload the managed browser page when applying application-code changes or recovering
from an unrecoverable runtime state.

## WebXR Session

- `xr_get_session_status`
- `xr_accept_session`
- `xr_end_session`
- `xr_get_transform`
- `xr_set_transform`
- `xr_look_at`
- `xr_animate_to`
- `xr_set_input_mode`
- `xr_set_connected`
- `xr_get_select_value`
- `xr_set_select_value`
- `xr_select`
- `xr_get_gamepad_state`
- `xr_set_gamepad_state`
- `xr_get_device_state`
- `xr_set_device_state`

These tools operate on the emulated WebXR device, input sources, session, and poses.
Inspect each installed schema for device names, axes, timing, and optional fields.

## ECS Debugging

- `ecs_pause`, `ecs_resume`, `ecs_step`
- `ecs_query_entity`, `ecs_find_entities`
- `ecs_list_systems`, `ecs_list_components`
- `ecs_toggle_system`, `ecs_set_component`
- `ecs_snapshot`, `ecs_diff`

ECS tools observe or control the live application runtime. Scene hierarchy and scene
resources remain authored in JSON files; ECS tools are for runtime behavior and state,
not scene composition.

## Review Evidence

Review orchestration is performed outside the editor. Save screenshots, hashes,
camera states, measurements, comparisons, defect lists, and stopping decisions as
normal task artifacts. The editor provides authoritative raw observations but does
not own review lineage or publishing.
