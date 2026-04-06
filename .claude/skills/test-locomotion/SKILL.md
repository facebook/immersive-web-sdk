---
name: test-locomotion
description: "Test IWSDK locomotion system covering slide, snap turn, teleport, and jump against the locomotion example via mcp-call.mjs WebSocket CLI. Use when testing VR movement systems, debugging player locomotion, validating teleport or snap turn behavior, or verifying locomotion controls in IWSDK."
argument-hint: '[--suite slide|turn|teleport|jump|all]'
---

# Locomotion System Test

Run 6 test suites covering slide movement, snap turn, teleport, jump, system registration, and stability.

All tool calls go through `scripts/mcp-call.mjs` via WebSocket — no MCP server, no permission prompts.

**Configuration:**

- EXAMPLE_DIR: /Users/felixz/Projects/immersive-web-sdk/examples/locomotion
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

- `<TOOL_NAME>` uses MCP-style names (e.g. `browser_reload_page`, `xr_accept_session`, `xr_set_gamepad_state`). The script handles translation internally.
- `<JSON_ARGS>` is a JSON object string. Omit `--args` if no arguments needed.
- Output is JSON on stdout. Parse it to check assertions.
- Use `--timeout 20000` for operations that may take longer (reload, accept_session, screenshot).
- Always append `2>/dev/null` to suppress TLS warnings.

**IMPORTANT**: Run each Bash command one at a time. Parse the JSON output and verify assertions before moving to the next command. Do NOT chain multiple mcp-call commands together.

**IMPORTANT**: When the instructions say "wait N seconds", use `sleep N` as a separate Bash command.

---

## Step 1: Install Dependencies

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/locomotion && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/locomotion && npm run dev
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

### Verify Locomotion Setup

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LocomotionEnvironment"]}' 2>/dev/null
```

Assert: At least 1 entity. Save as `<env>`.

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<env>,"components":["LocomotionEnvironment"]}' 2>/dev/null
```

Assert: `_initialized` = true, `_envHandle` > 0.

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- LocomotionSystem (priority -5)
- TurnSystem (priority 0)
- SlideSystem (priority 0)
- TeleportSystem (priority 0)

---

### Input Mapping Reference

| Action            | Controller | Input                    | Tool                                            |
| ----------------- | ---------- | ------------------------ | ----------------------------------------------- |
| Slide forward     | Left       | Thumbstick Y = -1        | `xr_set_gamepad_state` axes `[{0, 0}, {1, -1}]` |
| Slide backward    | Left       | Thumbstick Y = 1         | `xr_set_gamepad_state` axes `[{0, 0}, {1, 1}]`  |
| Snap turn right   | Right      | Thumbstick X = 1 (edge)  | `xr_set_gamepad_state` axes `[{0, 1}, {1, 0}]`  |
| Snap turn left    | Right      | Thumbstick X = -1 (edge) | `xr_set_gamepad_state` axes `[{0, -1}, {1, 0}]` |
| Teleport activate | Right      | Thumbstick Y = 1 (down)  | `xr_set_gamepad_state` axes `[{0, 0}, {1, 1}]`  |
| Jump              | Right      | A button (index 3)       | `xr_set_gamepad_state` buttons `[{3, 1, true}]` |

---

### Suite 1: Slide Movement (Left Thumbstick)

**Test 1.1: Slide Forward**

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Save as "before slide".

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","axes":[{"index":0,"value":0},{"index":1,"value":-1}]}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Save as "after slide".

Assert: Screenshots show scene moving closer (player moved forward).

**Test 1.2: Stop Sliding**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","axes":[{"index":0,"value":0},{"index":1,"value":0}]}' 2>/dev/null
```

Assert: Player stops moving (subsequent screenshots are identical).

**Test 1.3: Slide Backward**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","axes":[{"index":0,"value":0},{"index":1,"value":1}]}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Assert: Scene moves away (player retreated).

Release:

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-left","axes":[{"index":0,"value":0},{"index":1,"value":0}]}' 2>/dev/null
```

---

### Suite 2: Snap Turn (Right Thumbstick Left/Right)

**Test 2.1: Snap Turn Right**

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Save as "before turn".

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":1},{"index":1,"value":0}]}' 2>/dev/null
```

Then: `sleep 0.3`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Save as "after turn right".

Assert: View rotated ~45 degrees clockwise.

**Test 2.2: Release + Snap Turn Left**

**IMPORTANT**: Must release first for edge trigger reset.

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":0},{"index":1,"value":0}]}' 2>/dev/null
```

Then: `sleep 0.3`

Push left:

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":-1},{"index":1,"value":0}]}' 2>/dev/null
```

Then: `sleep 0.3`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Assert: View rotated ~45 degrees counter-clockwise (back to roughly original heading).

Release thumbstick:

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":0},{"index":1,"value":0}]}' 2>/dev/null
```

---

### Suite 3: Teleport (Right Thumbstick Down)

**Precondition**: The right controller must NOT be pointing at any interactable entity.

**Test 3.1: Setup — Point Controller at Floor**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":0.25,"y":1.5,"z":-0.3},"orientation":{"pitch":-45,"roll":0,"yaw":0}}' 2>/dev/null
```

**Test 3.2: Activate Teleport Arc**

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Save as "before teleport".

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":0},{"index":1,"value":1}]}' 2>/dev/null
```

Then: `sleep 1`

**Test 3.3: Release to Teleport**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","axes":[{"index":0,"value":0},{"index":1,"value":0}]}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Assert: Player position changed (view is from a different location).

---

### Suite 4: Jump (A Button on Right Controller)

**Test 4.1: Press A Button**

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":3,"value":1,"touched":true}]}' 2>/dev/null
```

Then: `sleep 0.3`

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

```bash
MCPCALL --tool xr_set_gamepad_state --args '{"device":"controller-right","buttons":[{"index":3,"value":0,"touched":false}]}' 2>/dev/null
```

Assert: View may show momentary elevation change.

---

### Suite 5: System Registration & Config

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- `LocomotionSystem` at priority -5
- `TurnSystem` at priority 0 with config keys: `turningMethod`, `turningAngle`, `turningSpeed`
- `SlideSystem` at priority 0 with config keys: `locomotor`, `maxSpeed`, `comfortAssist`, `jumpButton`, `enableJumping`
- `TeleportSystem` at priority 0 with config keys: `rayGravity`, `locomotor`

Verify `Elevator` component and `ElevatorSystem`:

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["Elevator"]}' 2>/dev/null
```

Assert: At least 1 entity (the oscillating platform).

---

### Suite 6: Stability

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
| Suite                     | Result    |
|---------------------------|-----------|
| 1. Slide Movement         | PASS/FAIL |
| 2. Snap Turn              | PASS/FAIL |
| 3. Teleport               | PASS/FAIL |
| 4. Jump                   | PASS/FAIL |
| 5. System Registration    | PASS/FAIL |
| 6. Stability              | PASS/FAIL |
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

### Locomotion moves XR origin, not headset

Headset position stays constant (relative to XR origin). Verify movement via screenshots.

### Teleport blocked by interactable hover

Position controller away from interactables before testing teleport.

### Snap turn is edge-triggered

Must reset to center between turns. Holding the stick only fires one turn.

### Thumbstick Y axis convention

Y = -1 is forward, Y = 1 is backward. For teleport, Y = 1 activates the arc.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
