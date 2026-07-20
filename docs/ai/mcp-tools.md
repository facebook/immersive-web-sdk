---
outline: [2, 4]
---

# MCP Tools Reference

The IWSDK MCP server exposes 58 tools across runtime, browser, managed
workspace, native scene composition, Three.js scene inspection, and ECS
categories. These tools give AI agents full control over the emulated XR
runtime, the managed workspace, the native scene composition editor, the
Three.js scene, and the ECS simulation.

If you change the runtime tool contract or CLI mappings, run `pnpm test:cli-mcp-parity`. If you change `@iwsdk/reference` CLI/MCP mappings, run `pnpm test:reference-cli-mcp-parity`. Run `pnpm test:mcp-parity` when a change touches both surfaces or when you want the full contract check before review.

## Session Management

### `xr_get_session_status`

Get the current XR session and device status. The response also includes managed-browser readiness metadata so agents can distinguish "runtime up but browser still connecting" from "browser connected".

**Parameters:** None

### `xr_accept_session`

Accept an offered XR session — equivalent to clicking the "Enter XR" button.

**Parameters:** None

### `xr_end_session`

End the current active XR session.

**Parameters:** None

## Transform Control

### `xr_get_transform`

Get the position and orientation of a tracked device.

| Parameter | Type     | Required | Description                                                                 |
| --------- | -------- | -------- | --------------------------------------------------------------------------- |
| `device`  | `string` | Yes      | `headset`, `controller-left`, `controller-right`, `hand-left`, `hand-right` |

### `xr_set_transform`

Set the position and/or orientation of a tracked device. Position is in meters, orientation can be a quaternion or euler angles in degrees.

| Parameter     | Type                              | Required | Description                                         |
| ------------- | --------------------------------- | -------- | --------------------------------------------------- |
| `device`      | `string`                          | Yes      | Device to move                                      |
| `position`    | `{x, y, z}`                       | No       | World position in meters. Y=1.6 is standing height. |
| `orientation` | `{x,y,z,w}` or `{pitch,yaw,roll}` | No       | Quaternion or euler angles (degrees)                |

### `xr_look_at`

Orient a device to look at a specific world position.

| Parameter        | Type        | Required | Description                                           |
| ---------------- | ----------- | -------- | ----------------------------------------------------- |
| `device`         | `string`    | Yes      | Device to orient                                      |
| `target`         | `{x, y, z}` | Yes      | World position to look at                             |
| `moveToDistance` | `number`    | No       | Also move the device to this distance from the target |

### `xr_animate_to`

Smoothly animate a device to a new position and/or orientation over time.

| Parameter     | Type                              | Required | Description                                  |
| ------------- | --------------------------------- | -------- | -------------------------------------------- |
| `device`      | `string`                          | Yes      | Device to animate                            |
| `position`    | `{x, y, z}`                       | No       | Target world position in meters              |
| `orientation` | `{x,y,z,w}` or `{pitch,yaw,roll}` | No       | Target rotation                              |
| `duration`    | `number`                          | No       | Animation duration in seconds (default: 0.5) |

## Input Mode

### `xr_set_input_mode`

Switch between controller and hand tracking input modes.

| Parameter | Type     | Required | Description            |
| --------- | -------- | -------- | ---------------------- |
| `mode`    | `string` | Yes      | `controller` or `hand` |

### `xr_set_connected`

Connect or disconnect an input device.

| Parameter   | Type      | Required | Description                                                      |
| ----------- | --------- | -------- | ---------------------------------------------------------------- |
| `device`    | `string`  | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |
| `connected` | `boolean` | Yes      | Whether the device should be connected                           |

## Select / Trigger

### `xr_get_select_value`

Get the current select (trigger/pinch) value for an input device.

| Parameter | Type     | Required | Description                                                      |
| --------- | -------- | -------- | ---------------------------------------------------------------- |
| `device`  | `string` | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |

### `xr_set_select_value`

Set the select (trigger/pinch) value. Use for grab-move-release patterns: set to 1.0 to grab, move the controller, then set to 0.0 to release.

| Parameter | Type     | Required | Description                                                      |
| --------- | -------- | -------- | ---------------------------------------------------------------- |
| `device`  | `string` | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |
| `value`   | `number` | Yes      | 0 (released) to 1 (fully pressed/pinched)                        |

### `xr_select`

Perform a complete select action (press and release). Dispatches `selectstart`, `select`, and `selectend` events.

| Parameter  | Type     | Required | Description                                                      |
| ---------- | -------- | -------- | ---------------------------------------------------------------- |
| `device`   | `string` | Yes      | `controller-left`, `controller-right`, `hand-left`, `hand-right` |
| `duration` | `number` | No       | How long to hold in seconds (default: 0.15)                      |

## Gamepad

Controllers only — not available for hand tracking.

### `xr_get_gamepad_state`

Get the full gamepad state including all buttons and axes.

Button indices: 0=trigger, 1=squeeze, 2=thumbstick press, 3=A/X, 4=B/Y, 5=thumbrest.

| Parameter | Type     | Required | Description                             |
| --------- | -------- | -------- | --------------------------------------- |
| `device`  | `string` | Yes      | `controller-left` or `controller-right` |

### `xr_set_gamepad_state`

Set gamepad button and axis values by index.

| Parameter | Type                         | Required | Description                                         |
| --------- | ---------------------------- | -------- | --------------------------------------------------- |
| `device`  | `string`                     | Yes      | `controller-left` or `controller-right`             |
| `buttons` | `[{index, value, touched?}]` | No       | Button states to set                                |
| `axes`    | `[{index, value}]`           | No       | Axis values to set (0=thumbstick X, 1=thumbstick Y) |

## Device State

### `xr_get_device_state`

Get comprehensive state of the XR device including headset position, controller/hand transforms, input mode, FOV, and stereo settings.

**Parameters:** None

### `xr_set_device_state`

Set device state. When called with no `state` parameter, resets everything to defaults.

| Parameter | Type     | Required | Description                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------ |
| `state`   | `object` | No       | Partial device state with `headset`, `inputMode`, `stereoEnabled`, `fov`, `controllers`, `hands` |

## Browser

### `browser_screenshot`

Capture a screenshot of a managed browser target. Returns the image as inline
base64 PNG.

| Parameter | Type     | Required | Description                         |
| --------- | -------- | -------- | ----------------------------------- |
| `target`  | `string` | No       | `runtime`, `editor`, or `workspace` |

### `browser_get_console_logs`

Get console logs from the browser with optional filtering. Excludes debug level by default.

| Parameter | Type                   | Required | Description                                              |
| --------- | ---------------------- | -------- | -------------------------------------------------------- |
| `count`   | `number`               | No       | Maximum number of logs to return (most recent N)         |
| `level`   | `string` or `string[]` | No       | Filter by level: `log`, `info`, `warn`, `error`, `debug` |
| `pattern` | `string`               | No       | Regex pattern to filter log messages                     |
| `since`   | `number`               | No       | Return logs since this timestamp (ms since epoch)        |

### `browser_reload_page`

Reload the browser page to reset application state.

**Parameters:** None

## Managed Workspace

These tools target the Playwright-managed IWSDK workspace. The workspace owns
runtime, editor, and split views. Normal browser tabs stay on the runtime app and
do not mount the editor.

### `workspace_get_state`

Get the managed workspace state, including current view, runtime readiness,
editor readiness, selected scene path, scene session id, and dirty state.

**Parameters:** None

### `workspace_set_view`

Set the visible managed workspace view. Tool routing remains semantic; this only
changes what the managed workspace shows.

| Parameter | Type     | Required | Description                     |
| --------- | -------- | -------- | ------------------------------- |
| `view`    | `string` | Yes      | `runtime`, `editor`, or `split` |

### `workspace_open_scene`

Open a scene file from `public/scenes/` in the managed workspace editor.

| Parameter | Type     | Required | Description                                               |
| --------- | -------- | -------- | --------------------------------------------------------- |
| `path`    | `string` | Yes      | Path under `public/scenes/` ending in `.iwsdk.scene.json` |

## Native Scene Composition

These tools target the native IWSDK scene editor inside the managed workspace.
Use them for declarative scene composition instead of editing
`.iwsdk.scene.json` files directly. They share the same scene session, history,
validation, WebGL viewport, and save path as the human editor.

For visual verification, use `scene_screenshot` or `scene_set_camera` with
multiple views before saving. Top views catch alignment and symmetry issues;
front/side views catch floating or penetrated objects; quarter/orbit views catch
overall composition. `scene_screenshot` supports `current`, `top`, `front`,
`back`, `left`, `right`, `quarter`, deterministic `orbit` steps, and explicit
`position`/`lookAt`/`fov` camera poses.

### `scene_list_files`

List IWSDK scene JSON files available under `public/scenes/`.

| Parameter | Type     | Required | Description                         |
| --------- | -------- | -------- | ----------------------------------- |
| `query`   | `string` | No       | Optional case-insensitive path text |

### `scene_open`

Open an existing IWSDK scene JSON file from `public/scenes/` in the managed
workspace editor.

| Parameter | Type     | Required | Description                                               |
| --------- | -------- | -------- | --------------------------------------------------------- |
| `path`    | `string` | Yes      | Path under `public/scenes/` ending in `.iwsdk.scene.json` |

### `scene_create`

Create a new IWSDK scene JSON file under `public/scenes/`. By default, the
managed workspace opens the new scene after creation.

| Parameter   | Type      | Required | Description                                               |
| ----------- | --------- | -------- | --------------------------------------------------------- |
| `path`      | `string`  | Yes      | Path under `public/scenes/` ending in `.iwsdk.scene.json` |
| `overwrite` | `boolean` | No       | Replace an existing scene file when true                  |
| `open`      | `boolean` | No       | Open the created scene; defaults to true                  |

### `scene_list_assets`

List assets available to the native scene editor, including ids, names, URIs,
and bounds metadata.

| Parameter | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| `query`   | `string` | No       | Optional case-insensitive asset id/name text |

### `scene_list_component_schemas`

List typed component schemas available to the native scene editor. Call this
before adding or editing component payloads so generated scene JSON uses typed
component props.

| Parameter | Type     | Required | Description                                      |
| --------- | -------- | -------- | ------------------------------------------------ |
| `query`   | `string` | No       | Optional case-insensitive component id/name text |

### `scene_get_document`

Get the current native IWSDK scene JSON document from the managed workspace
editor session.

**Parameters:** None

### `scene_get_hierarchy`

Get the current native IWSDK scene document hierarchy from the managed workspace
editor session.

| Parameter  | Type     | Required | Description                                   |
| ---------- | -------- | -------- | --------------------------------------------- |
| `parentId` | `string` | No       | Scene node id to start from; defaults to root |
| `maxDepth` | `number` | No       | Maximum traversal depth, default `5`          |

### `scene_get_selection`

Get the current native scene editor selection.

**Parameters:** None

### `scene_select`

Select one or more scene node ids in the native editor.

| Parameter | Type       | Required | Description                                  |
| --------- | ---------- | -------- | -------------------------------------------- |
| `nodeIds` | `string[]` | Yes      | Scene node ids to select; pass `[]` to clear |

### `scene_add_node`

Add a node to the native scene JSON document.

| Parameter  | Type     | Required | Description                                    |
| ---------- | -------- | -------- | ---------------------------------------------- |
| `node`     | `object` | Yes      | Scene node to add; must include `id`           |
| `parentId` | `string` | No       | Parent scene node id                           |
| `index`    | `number` | No       | Insertion index within root or parent children |

### `scene_remove_node`

Remove a node and its children from the native scene JSON document.

| Parameter | Type     | Required | Description             |
| --------- | -------- | -------- | ----------------------- |
| `nodeId`  | `string` | Yes      | Scene node id to remove |

### `scene_duplicate_node`

Duplicate a node and its children in the native scene editor.

| Parameter   | Type     | Required | Description                                     |
| ----------- | -------- | -------- | ----------------------------------------------- |
| `nodeId`    | `string` | Yes      | Scene node id to duplicate                      |
| `newNodeId` | `string` | No       | Optional id for the duplicated root node        |
| `parentId`  | `string` | No       | Optional parent id; defaults to original parent |

### `scene_set_transform`

Replace the transform for a native scene node. Prefer `scene_place_on` and
`scene_look_at` for deterministic placement/orientation helpers.

| Parameter   | Type     | Required | Description                               |
| ----------- | -------- | -------- | ----------------------------------------- |
| `nodeId`    | `string` | Yes      | Scene node id                             |
| `transform` | `object` | Yes      | `position`, `rotationDeg`, and/or `scale` |

### `scene_apply_patch`

Apply one native scene JSON patch operation with undo support. Prefer specific
tools for common edits.

| Parameter | Type     | Required | Description                                                                 |
| --------- | -------- | -------- | --------------------------------------------------------------------------- |
| `patch`   | `object` | Yes      | Patch such as `moveNode`, `reorderChildren`, `updateComponent`, or metadata |

### `scene_place_on`

Place a node on another node using scene asset bounds.

| Parameter   | Type     | Required | Description                  |
| ----------- | -------- | -------- | ---------------------------- |
| `nodeId`    | `string` | Yes      | Node being placed            |
| `targetId`  | `string` | Yes      | Support node id              |
| `clearance` | `number` | No       | Vertical clearance in meters |
| `align`     | `string` | No       | `center` or `preserve-xz`    |

### `scene_look_at`

Yaw a scene node so it faces a target point while preserving pitch and roll.

| Parameter | Type     | Required | Description        |
| --------- | -------- | -------- | ------------------ |
| `nodeId`  | `string` | Yes      | Node to orient     |
| `target`  | `Vec3`   | Yes      | Target world point |

### `scene_validate`

Validate the current native scene JSON document and return structured issues
with paths and suggested fixes where available.

**Parameters:** None

### `scene_save`

Save the current native scene JSON document from the managed workspace editor
session to disk.

**Parameters:** None

### `scene_undo`

Undo the most recent native scene editor command.

**Parameters:** None

### `scene_redo`

Redo the most recently undone native scene editor command.

**Parameters:** None

### `scene_get_logs`

Get native scene editor logs.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| `count`   | `number` | No       | Maximum number of recent logs |
| `level`   | `string` | No       | `info`, `warn`, or `error`    |

### `scene_set_camera`

Set the native scene editor camera to a named view or explicit pose.

| Parameter   | Type       | Required | Description                                                               |
| ----------- | ---------- | -------- | ------------------------------------------------------------------------- |
| `view`      | `string`   | No       | `current`, `top`, `front`, `back`, `left`, `right`, `quarter`, or `orbit` |
| `position`  | `number[]` | No       | Explicit camera position `[x, y, z]`                                      |
| `lookAt`    | `number[]` | No       | Explicit target `[x, y, z]`                                               |
| `fov`       | `number`   | No       | Perspective field of view                                                 |
| `orbitStep` | `number`   | No       | Deterministic orbit index for `view: "orbit"`                             |

### `scene_screenshot`

Capture a screenshot from the real native scene editor WebGL viewport.

| Parameter | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| `view`    | `string` | No       | Named view; defaults to current      |
| `width`   | `number` | No       | Optional screenshot width in pixels  |
| `height`  | `number` | No       | Optional screenshot height in pixels |

`scene_screenshot` also accepts the explicit camera fields from
`scene_set_camera`.

### `scene_compare_screenshots`

Capture two native scene editor screenshots and report whether the image
payloads match. Use this to prove named camera views or before/after edits
produce distinct visual evidence.

| Parameter | Type     | Required | Description                                     |
| --------- | -------- | -------- | ----------------------------------------------- |
| `first`   | `object` | Yes      | First camera request, same shape as screenshot  |
| `second`  | `object` | Yes      | Second camera request, same shape as screenshot |
| `width`   | `number` | No       | Optional screenshot width in pixels             |
| `height`  | `number` | No       | Optional screenshot height in pixels            |

## Scene Inspection

These tools require IWSDK's `MCPRuntime` (automatically available in IWSDK projects).

### `scene_get_hierarchy`

Get the Three.js scene hierarchy as a JSON tree. Returns object names, UUIDs, types, and entity indices where available.

| Parameter  | Type     | Required | Description                                                    |
| ---------- | -------- | -------- | -------------------------------------------------------------- |
| `parentId` | `string` | No       | UUID of parent Object3D to start from (defaults to scene root) |
| `maxDepth` | `number` | No       | Maximum depth to traverse (default: 5)                         |

### `scene_get_object_transform`

Get local and global transforms of an Object3D. Includes `positionRelativeToXROrigin` which can be used directly with `xr_look_at`.

| Parameter | Type     | Required | Description                                       |
| --------- | -------- | -------- | ------------------------------------------------- |
| `uuid`    | `string` | Yes      | UUID of the Object3D (from `scene_get_hierarchy`) |

## ECS Debugging

These tools require IWSDK's `MCPRuntime`.

### `ecs_pause`

Pause ECS system updates. The render loop continues (XR session stays alive, screenshots still work) but no systems tick.

**Parameters:** None

### `ecs_resume`

Resume ECS system updates after pausing. The first frame uses a capped delta to avoid physics explosions.

**Parameters:** None

### `ecs_step`

Advance N ECS frames with a fixed timestep while paused. Must call `ecs_pause` first.

| Parameter | Type     | Required | Description                                                            |
| --------- | -------- | -------- | ---------------------------------------------------------------------- |
| `count`   | `number` | No       | Number of frames to advance (1-120, default: 1)                        |
| `delta`   | `number` | No       | Fixed timestep in seconds (default: 1/72, matching Quest refresh rate) |

### `ecs_query_entity`

Get all component data for an entity.

| Parameter     | Type       | Required | Description                                                      |
| ------------- | ---------- | -------- | ---------------------------------------------------------------- |
| `entityIndex` | `number`   | Yes      | Entity index (from `scene_get_hierarchy` or `ecs_find_entities`) |
| `components`  | `string[]` | No       | Specific component IDs to include (defaults to all)              |

### `ecs_find_entities`

Find entities by component composition and/or name.

| Parameter           | Type       | Required | Description                                  |
| ------------------- | ---------- | -------- | -------------------------------------------- |
| `withComponents`    | `string[]` | No       | Component IDs entities must have (AND logic) |
| `withoutComponents` | `string[]` | No       | Component IDs entities must NOT have         |
| `namePattern`       | `string`   | No       | Regex to match against entity Object3D name  |
| `limit`             | `number`   | No       | Maximum results (1-50, default: 50)          |

### `ecs_list_systems`

List all registered ECS systems with name, priority, pause state, config keys, and query entity counts.

**Parameters:** None

### `ecs_list_components`

List all registered ECS components with their field schemas (type and default value).

**Parameters:** None

### `ecs_toggle_system`

Pause or resume a specific ECS system by name.

| Parameter | Type      | Required | Description                                         |
| --------- | --------- | -------- | --------------------------------------------------- |
| `name`    | `string`  | Yes      | System class name (e.g., `OrbSystem`)               |
| `paused`  | `boolean` | No       | `true` to pause, `false` to resume. Omit to toggle. |

### `ecs_set_component`

Set a component field value on an entity.

| Parameter     | Type     | Required | Description                                                                           |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| `entityIndex` | `number` | Yes      | Entity index                                                                          |
| `componentId` | `string` | Yes      | Component ID (e.g., `Orb`, `Transform`)                                               |
| `field`       | `string` | Yes      | Field name within the component                                                       |
| `value`       | `any`    | Yes      | New value. Scalars: number/string/boolean. Vectors: array (e.g., `[1,2,3]` for Vec3). |

### `ecs_snapshot`

Capture a snapshot of all ECS entity/component state. Stores up to 2 snapshots.

| Parameter | Type     | Required | Description                                         |
| --------- | -------- | -------- | --------------------------------------------------- |
| `label`   | `string` | No       | Label for this snapshot (auto-generated if omitted) |

### `ecs_diff`

Compare two ECS snapshots. Shows added/removed/changed entities and field-level diffs.

| Parameter | Type     | Required | Description                    |
| --------- | -------- | -------- | ------------------------------ |
| `from`    | `string` | Yes      | Label of the "before" snapshot |
| `to`      | `string` | Yes      | Label of the "after" snapshot  |
