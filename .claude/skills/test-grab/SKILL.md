---
name: test-grab
description: "Test IWSDK grab system covering distance grab, one-hand grab, and two-hand grab against the grab example via mcp-call.mjs WebSocket CLI. Use when testing VR/XR grab interactions, validating hand tracking mechanics, debugging grab behavior, or verifying object pickup in IWSDK applications."
argument-hint: '[--suite distance|onehand|twohand|all]'
---

# Grab System Test

Run 5 test suites covering distance grab, one-hand grab, two-hand grab, system/component registration, and stability.

All tool calls go through `scripts/mcp-call.mjs` via WebSocket — no MCP server, no permission prompts.

**Configuration:**

- EXAMPLE_DIR: /Users/felixz/Projects/immersive-web-sdk/examples/grab
- ROOT: /Users/felixz/Projects/immersive-web-sdk

**SHORTHAND**: Throughout this document, `MCPCALL` means:

```
node /Users/felixz/Projects/immersive-web-sdk/scripts/mcp-call.mjs --port <PORT>
```

where `<PORT>` is the port number discovered in Step 2.

**Tool calling pattern**: Every tool call is a Bash command using the MCPCALL shorthand:

```
MCPCALL --tool <TOOL_NAME> --args '<JSON_ARGS>' 2>/dev/null
```

- `<TOOL_NAME>` uses MCP-style names (e.g. `browser_reload_page`, `xr_accept_session`, `xr_look_at`). The script handles translation internally.
- `<JSON_ARGS>` is a JSON object string. Omit `--args` if no arguments needed.
- Output is JSON on stdout. Parse it to check assertions.
- Use `--timeout 20000` for operations that may take longer (reload, accept_session, animate_to, screenshot).
- Always append `2>/dev/null` to suppress TLS warnings.

**IMPORTANT**: Run each Bash command one at a time. Parse the JSON output and verify assertions before moving to the next command. Do NOT chain multiple mcp-call commands together.

**IMPORTANT**: When the instructions say "wait N seconds", use `sleep N` as a separate Bash command.

---

## Step 1: Install Dependencies

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/grab && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/grab && npm run dev
```

**IMPORTANT**: This command MUST be run with `run_in_background: true` on the Bash tool — do NOT append `&` to the command itself.

Once the background task is launched, poll the output for Vite's ready message (up to 60s). Read the task output or use `tail` to watch for a line containing `Local:`. The output will contain a URL like `https://localhost:5173/`. Extract the port number from this URL and save it as `<PORT>`. All subsequent `MCPCALL` commands use this port.

If the server fails to start within 60 seconds, report FAIL for all suites and skip to Step 5.

---

## Step 3: Verify Connectivity

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

This must return JSON with a list of systems. If it fails:

1. Check the dev server output for errors
2. Try killing and restarting the server (Step 2)
3. If it still fails, report FAIL for all suites and skip to Step 5

---

## Step 4: Run Test Suites

### Pre-test Setup

Run these commands in order:

1. `MCPCALL --tool browser_reload_page --timeout 20000 2>/dev/null`
   Then: `sleep 3`

2. `MCPCALL --tool xr_accept_session --timeout 20000 2>/dev/null`
   Then: `sleep 2`

3. `MCPCALL --tool browser_get_console_logs --args '{"count":20,"level":["error","warn"]}' 2>/dev/null`
   Assert: No error-level logs.

### Entity Discovery

Discover all grab entities dynamically:

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["DistanceGrabbable"]}' 2>/dev/null
```

Assert: At least 1 entity. Save first as `<distance>`.

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["OneHandGrabbable"]}' 2>/dev/null
```

Assert: At least 1 entity. Save first as `<onehand>`.

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["TwoHandsGrabbable"]}' 2>/dev/null
```

Assert: At least 1 entity. Save first as `<twohand>`.

Get entity positions via scene hierarchy:

```bash
MCPCALL --tool scene_get_hierarchy --args '{"maxDepth":3}' 2>/dev/null
```

Find Object3D UUIDs for each grab entity, then query their transforms:

```bash
MCPCALL --tool scene_get_object_transform --args '{"uuid":"<entity-uuid>"}' 2>/dev/null
```

Save `positionRelativeToXROrigin` as `<distance-pos>`, `<onehand-pos>`, `<twohand-pos>`.

Verify GrabSystem is active:

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert: GrabSystem at priority -3.

---

### Component Reference

| Component           | Pointer Type          | Activation                                  |
| ------------------- | --------------------- | ------------------------------------------- |
| `DistanceGrabbable` | Ray (trigger)         | `xr_set_select_value`                       |
| `OneHandGrabbable`  | Grip sphere (squeeze) | `xr_set_gamepad_state` button 1             |
| `TwoHandsGrabbable` | Grip sphere (squeeze) | `xr_set_gamepad_state` button 1, both hands |

**Critical Distinction**: Distance grab uses **trigger** (`xr_set_select_value`). One-hand and two-hand grab use **squeeze** (`xr_set_gamepad_state` button index 1). Wrong button silently fails.

---

### Suite 1: Distance Grab (Ray + Trigger)

**Test 1.1: Ray Hover**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":<distance-pos.x>,"y":<distance-pos.y>,"z":<distance-pos.z>},"moveToDistance":0.8}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<distance>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` present.

**Test 1.2: Trigger to Grab**

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"before-grab"}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_select_value --args '{"device":"controller-right","value":1}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<distance>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: Both `Hovered` and `Pressed` present.

**Test 1.3: Move While Grabbed**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":0.5,"y":1.5,"z":-1.0},"duration":1.0}' --timeout 20000 2>/dev/null
```

Then: `sleep 1.5`

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"after-move"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_diff --args '{"from":"before-grab","to":"after-move"}' 2>/dev/null
```

Assert: Entity's Transform.position must differ from initial.

**Test 1.4: Release Trigger**

```bash
MCPCALL --tool xr_set_select_value --args '{"device":"controller-right","value":0}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<distance>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: `Pressed` removed. `Handle` persists (it's permanent).

**Test 1.5: Point Away — Clean State**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":0,"y":1.6,"z":-5}}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<distance>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` removed.

---

### Suite 2: One-Hand Grab (Squeeze)

**Test 2.1: Ray Isolation — Ray Cannot Interact**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":<onehand-pos.x>,"y":<onehand-pos.y>,"z":<onehand-pos.z>},"moveToDistance":0.5}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<onehand>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: No `Hovered` or `Pressed` on entity (ray is denied by `pointerEventsType`).

**Test 2.2: Position Controller at Object + Squeeze**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<onehand-pos.x>,"y":<onehand-pos.y>,"z":<onehand-pos.z>},"orientation":{"pitch":0,"roll":0,"yaw":0}}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":1,"value":1,"touched":true}]}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"before-onehand"}' 2>/dev/null
```

**Test 2.3: Move While Squeezing**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<onehand-pos.x>,"y":<onehand-pos.y + 0.3>,"z":<onehand-pos.z + 0.3>},"duration":1.0}' --timeout 20000 2>/dev/null
```

Then: `sleep 1.5`

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"after-onehand-move"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_diff --args '{"from":"before-onehand","to":"after-onehand-move"}' 2>/dev/null
```

Assert: Entity's Transform.position must have changed to follow the controller.

**Test 2.4: Release Squeeze**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":1,"value":0,"touched":false}]}' 2>/dev/null
```

Assert: Entity stops moving (Transform remains at released position).

---

### Suite 3: Two-Hand Grab (Both Controllers Squeeze)

**Test 3.1: Position Both Controllers Near Object**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-left","position":{"x":<twohand-pos.x - 0.15>,"y":<twohand-pos.y>,"z":<twohand-pos.z>},"orientation":{"pitch":0,"roll":0,"yaw":0}}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<twohand-pos.x + 0.15>,"y":<twohand-pos.y>,"z":<twohand-pos.z>},"orientation":{"pitch":0,"roll":0,"yaw":0}}' 2>/dev/null
```

**Test 3.2: Both Squeeze + Snapshot**

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"before-twohand"}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","buttons":[{"index":1,"value":1,"touched":true}]}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":1,"value":1,"touched":true}]}' 2>/dev/null
```

Then: `sleep 0.5`

**Test 3.3: Spread Hands — Scale Up**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-left","position":{"x":<twohand-pos.x - 0.5>,"y":<twohand-pos.y>,"z":<twohand-pos.z>},"duration":1.0}' --timeout 20000 2>/dev/null
```

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<twohand-pos.x + 0.5>,"y":<twohand-pos.y>,"z":<twohand-pos.z>},"duration":1.0}' --timeout 20000 2>/dev/null
```

Then: `sleep 1.5`

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"after-twohand-scale"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_diff --args '{"from":"before-twohand","to":"after-twohand-scale"}' 2>/dev/null
```

Assert: Entity Transform.scale should be larger than initial.

**Test 3.4: Release Both**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","buttons":[{"index":1,"value":0,"touched":false}]}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":1,"value":0,"touched":false}]}' 2>/dev/null
```

---

### Suite 4: System & Component Registration

**Test 4.1: GrabSystem at Correct Priority**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert: GrabSystem present at priority -3.

**Test 4.2: Components Registered**

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert: Must include: `OneHandGrabbable`, `TwoHandsGrabbable`, `DistanceGrabbable`, `Handle`.

---

### Suite 5: Stability

```bash
MCPCALL --tool browser_get_console_logs --args '{"count":30,"level":["error","warn"]}' 2>/dev/null
```

Assert: No application-level errors or warnings. Pre-existing 404 resource errors from page load are acceptable.

---

## Step 5: Cleanup & Results

Kill the dev server:

```bash
kill $(lsof -t -i :<PORT>) 2>/dev/null
```

Output a summary table:

```
| Suite                         | Result    |
|-------------------------------|-----------|
| 1. Distance Grab              | PASS/FAIL |
| 2. One-Hand Grab              | PASS/FAIL |
| 3. Two-Hand Grab              | PASS/FAIL |
| 4. System/Component Reg.      | PASS/FAIL |
| 5. Stability                  | PASS/FAIL |
```

If any suite fails, include which assertion failed and actual vs expected values.

---

## Recovery

If at any point a transient error occurs (server crash, WebSocket timeout, connection refused, etc.) that is NOT caused by a source code bug:

1. Kill the dev server: `kill $(lsof -t -i :<PORT>) 2>/dev/null`
2. Restart: re-run Step 2 to start a fresh dev server (port may change)
3. Re-run the Pre-test Setup (reload, accept session)
4. Retry the failed suite

Only give up after one retry attempt per suite. If the same suite fails twice, mark it FAIL and continue to the next suite.

---

## Known Issues & Workarounds

### No Hovered/Pressed for near-field grabs

OneHandGrabbable and TwoHandsGrabbable entities do NOT get `Hovered` or `Pressed` tags. Only distance grab (via ray) gets these tags. Use `ecs_snapshot`/`ecs_diff` to verify near-field grabs.

### Handle component is permanent

`Handle` is added by `GrabSystem` at init time and never removed. Grab state is tracked inside `Handle.instance.outputState`.

### Trigger vs Squeeze confusion

Distance grab uses **trigger** (`set_select_value`), not squeeze. One-hand and two-hand grab use **squeeze** (`set_gamepad_state` button index 1). Wrong button silently fails.

### Grab sphere radius is 0.07m

The grab sphere intersector has a default radius of 7cm. Position the controller at the object's center for reliable detection.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
