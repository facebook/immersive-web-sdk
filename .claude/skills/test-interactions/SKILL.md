---
name: test-interactions
description: "Test XR interactions covering ray, poke/touch, dual-mode, audio, and UI panel behaviors against the poke example via mcp-call.mjs WebSocket CLI. Use when testing VR/AR interaction handlers, validating poke or ray input, debugging spatial interactions, or verifying XR input modes in IWSDK."
argument-hint: '[--suite ray|poke|dual|audio|ui|all]'
---

# XR Interaction Test

Test 12 suites covering XR interaction behaviors: entity discovery, ECS registration, ray interaction, poke/touch, dual-mode, cross-entity isolation, input mode switching, rapid poke cycles, audio, UI panel, and stability.

All tool calls go through `scripts/mcp-call.mjs` via WebSocket — no MCP server, no permission prompts.

**Configuration:**

- EXAMPLE_DIR: /Users/felixz/Projects/immersive-web-sdk/examples/poke
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
cd /Users/felixz/Projects/immersive-web-sdk/examples/poke && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/poke && npm run dev
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

1. Check `/tmp/iwsdk-dev-interactions.log` for errors
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

3. `MCPCALL --tool browser_get_console_logs --args '{"count":20,"level":["error"]}' 2>/dev/null`
   Assert: No error-level logs. Warnings about audio autoplay are acceptable.

---

### Suite 1: Entity Discovery

Discover all testable entities dynamically. These entity indices are used by all subsequent suites.

**Test 1.1: Find Robot Entity**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["Robot"]}' 2>/dev/null
```

Assert: Exactly 1 entity. Save its `entityIndex` as `<robot>`.

**Test 1.2: Find Panel Entity**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["PanelUI"]}' 2>/dev/null
```

Assert: Exactly 1 entity. Save its `entityIndex` as `<panel>`.

**Test 1.3: Get Robot World Position**

```bash
MCPCALL --tool scene_get_hierarchy --args '{"maxDepth":3}' 2>/dev/null
```

Find the robot's Object3D UUID (match `entityIndex` = `<robot>`).
Then:

```bash
MCPCALL --tool scene_get_object_transform --args '{"uuid":"<robot-uuid>"}' 2>/dev/null
```

Save `positionRelativeToXROrigin` as `<robot-pos>`. Expected near `(0, 0.95, -1.5)`.

**Test 1.4: Get Panel World Position**
Same approach — find panel's UUID from hierarchy, query transform.

```bash
MCPCALL --tool scene_get_object_transform --args '{"uuid":"<panel-uuid>"}' 2>/dev/null
```

Save `positionRelativeToXROrigin` as `<panel-pos>`. Expected near `(0, 1.5, -1.4)`.

---

### Suite 2: ECS Registration

**Test 2.1: List Systems**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert these systems are present: `RobotSystem`, `PanelSystem`, `InputSystem`, `AudioSystem`, `PanelUISystem`.

**Test 2.2: List Components**

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert these components are registered:

- `Robot`
- `PanelUI` (with fields: `config`, `maxWidth`, `maxHeight`)
- `AudioSource` (with fields: `src`, `loop`, `_loaded`, `_isPlaying`, `_playRequested`)
- `RayInteractable`
- `PokeInteractable`
- `ScreenSpace`

---

### Suite 3: Ray Interaction on Robot

**Test 3.1: Ray Hover**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<robot-pos.z>},"moveToDistance":1.0}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: `Hovered` present, `Pressed` absent.

**Test 3.2: Ray Select**

```bash
MCPCALL --tool xr_set_select_value --args '{"device":"controller-right","value":1}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: Both `Hovered` and `Pressed` present.

**Test 3.3: Ray Release**

```bash
MCPCALL --tool xr_set_select_value --args '{"device":"controller-right","value":0}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: `Hovered` present, `Pressed` absent.

**Test 3.4: Ray Unhover**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":5,"y":1.5,"z":0}}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` absent.

---

### Suite 4: Poke Interaction on Robot

The touch pointer uses a `SphereIntersector` with two thresholds:

- `hoverRadius: 0.2m` (20cm) — triggers hover
- `downRadius: 0.02m` (2cm) — triggers auto-select (pointerdown)

**Test 4.1: Position Near Robot**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<z+0.3>},"orientation":{"pitch":0,"yaw":180,"roll":0}}' 2>/dev/null
```

(where `<z+0.3>` = `<robot-pos.z> + 0.3`)

**Test 4.2: Slow Animate Through Robot**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<z-0.3>},"duration":2.5}' --timeout 20000 2>/dev/null
```

(where `<z-0.3>` = `<robot-pos.z> - 0.3`)
Then: `sleep 1.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: At least `Hovered` present. `Pressed` may also be present.

**Test 4.3: Pull Back**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":0.3,"y":1.5,"z":-0.3},"duration":0.3}' --timeout 20000 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: Neither `Hovered` nor `Pressed` present.

---

### Suite 5: Ray Interaction on Panel

**Test 5.1: Ray Hover**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":<panel-pos.x>,"y":<panel-pos.y>,"z":<panel-pos.z>},"moveToDistance":0.8}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` present.

**Test 5.2: Click**

```bash
MCPCALL --tool xr_select --args '{"device":"controller-right","duration":0.2}' 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` still present.

**Test 5.3: Unhover**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":5,"y":1.5,"z":0}}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` absent.

---

### Suite 6: Dual-Mode Interaction (Panel — Ray + Poke)

**Test 6.1: Ray Hover from Distance**

```bash
MCPCALL --tool xr_look_at --args '{"device":"controller-right","target":{"x":<panel-pos.x>,"y":<panel-pos.y>,"z":<panel-pos.z>},"moveToDistance":0.8}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` present.

**Test 6.2: Poke on Panel**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<panel-pos.x>,"y":<panel-pos.y>,"z":<pz+0.2>},"orientation":{"pitch":0,"roll":0,"yaw":0}}' 2>/dev/null
```

(where `<pz+0.2>` = `<panel-pos.z> + 0.2`)

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<panel-pos.x>,"y":<panel-pos.y>,"z":<pz-0.01>},"duration":3}' --timeout 20000 2>/dev/null
```

(where `<pz-0.01>` = `<panel-pos.z> - 0.01` — stop just past the panel surface, NOT far behind it)

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: Both `Hovered` and `Pressed` present.

**Test 6.3: Poke Release**

```bash
MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":0.3,"y":1.5,"z":-0.3},"duration":0.3}' --timeout 20000 2>/dev/null
```

Then: `sleep 0.5`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: Neither present.

---

### Suite 7: Cross-Entity Isolation

**Test 7.1: Only Target Entity Gets Hovered**

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<rx+0.1>,"y":<robot-pos.y>,"z":<rz+0.3>},"orientation":{"pitch":0,"roll":0,"yaw":180}}' 2>/dev/null
```

(where `<rx+0.1>` = `<robot-pos.x> + 0.1`, `<rz+0.3>` = `<robot-pos.z> + 0.3`)
Then: `sleep 1`

Check robot:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` present on robot.

Check panel:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["Hovered","Pressed"]}' 2>/dev/null
```

Assert: No interaction components on panel.

---

### Suite 8: Input Mode Switching

**Test 8.1: Hand Hover**

```bash
MCPCALL --tool xr_set_input_mode --args '{"mode":"hand"}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_transform --args '{"device":"hand-right","position":{"x":<rx+0.1>,"y":<robot-pos.y>,"z":<rz+0.3>}}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` present.

**Test 8.2: Switch Back to Controllers**

```bash
MCPCALL --tool xr_set_input_mode --args '{"mode":"controller"}' 2>/dev/null
```

```bash
MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":0.3,"y":1.5,"z":-0.3},"orientation":{"pitch":0,"roll":0,"yaw":0}}' 2>/dev/null
```

Then: `sleep 1`

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<robot>,"components":["Hovered"]}' 2>/dev/null
```

Assert: `Hovered` absent (clean transition).

---

### Suite 9: Rapid Poke Cycles (Regression)

Test that multiple poke-release cycles all clean up properly (no stuck Pressed).

For each of 3 cycles:

1. Position at `{x: <robot-pos.x>, y: <robot-pos.y>, z: <robot-pos.z> + 0.4}` with yaw 180:
   ```bash
   MCPCALL --tool xr_set_transform --args '{"device":"controller-right","position":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<rz+0.4>},"orientation":{"pitch":0,"yaw":180,"roll":0}}' 2>/dev/null
   ```
2. Animate through:
   ```bash
   MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<rz-0.3>},"duration":1.5}' --timeout 20000 2>/dev/null
   ```
3. `sleep 1.5`, then query `<robot>` for `["Hovered","Pressed"]`. Assert: at least `Hovered` or `Pressed` present.
4. Animate back:
   ```bash
   MCPCALL --tool xr_animate_to --args '{"device":"controller-right","position":{"x":<robot-pos.x>,"y":<robot-pos.y>,"z":<rz+0.5>},"duration":0.3}' --timeout 20000 2>/dev/null
   ```
5. `sleep 0.5`, then query `<robot>` for `["Hovered","Pressed"]`. Assert: neither present.

All 3 cycles must pass.

---

### Suite 10: Audio

**Test 10.1: Find Audio Entities**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["AudioSource"]}' 2>/dev/null
```

Assert: At least 1 entity found. Use the first as `<audio>`.

**Test 10.2: Verify Audio Loaded**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<audio>,"components":["AudioSource"]}' 2>/dev/null
```

Assert: `_loaded` = `true`, `src` contains `chime.mp3`.

**Test 10.3: Trigger Playback**

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<audio>,"componentId":"AudioSource","field":"loop","value":true}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<audio>,"componentId":"AudioSource","field":"_playRequested","value":true}' 2>/dev/null
```

Note: `_playRequested` is consumed within one frame.

**Test 10.4: Verify Playback State**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<audio>,"components":["AudioSource"]}' 2>/dev/null
```

Assert: `_isPlaying` = `true` (loop is on).

**Test 10.5: Stop Playback**

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<audio>,"componentId":"AudioSource","field":"_stopRequested","value":true}' 2>/dev/null
```

---

### Suite 11: UI Panel Verification

**Test 11.1: Panel Loading**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["PanelUI","PanelDocument","ScreenSpace"]}' 2>/dev/null
```

Assert:

- `PanelUI.config` contains `welcome.json`
- `PanelUI.maxWidth` approximately `0.5`, `PanelUI.maxHeight` approximately `0.4`
- `PanelDocument` component IS present (proves async panel loading succeeded)
- `ScreenSpace` component IS present

**Test 11.2: Visual Confirmation**

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Assert: returns a `screenshotPath` (PNG file saved to /tmp).

---

### Suite 12: Stability Check

```bash
MCPCALL --tool browser_get_console_logs --args '{"count":50,"level":["error","warn"]}' 2>/dev/null
```

Assert: No error-level logs. Warnings about `AudioContext` autoplay policy are acceptable. Pre-existing 404 resource errors from page load are acceptable.

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
| 1. Entity Discovery           | PASS/FAIL |
| 2. ECS Registration           | PASS/FAIL |
| 3. Ray Interaction (Robot)    | PASS/FAIL |
| 4. Poke Interaction (Robot)   | PASS/FAIL |
| 5. Ray Interaction (Panel)    | PASS/FAIL |
| 6. Dual-Mode (Panel)          | PASS/FAIL |
| 7. Cross-Entity Isolation     | PASS/FAIL |
| 8. Input Mode Switching       | PASS/FAIL |
| 9. Rapid Poke Cycles          | PASS/FAIL |
| 10. Audio                     | PASS/FAIL |
| 11. UI Panel                  | PASS/FAIL |
| 12. Stability                 | PASS/FAIL |
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

### Poke timing sensitivity

The slow animation in poke suites (2-2.5 seconds) is critical. The poke system uses a 2cm `downRadius` threshold — if the controller moves too fast, it can skip past the threshold between frames.

### Audio autoplay

Browsers block audio autoplay until user gesture. The `_playRequested` flag may silently fail. If `_isPlaying` is false, this is a browser policy issue, not a bug.

### One-shot flags consumed immediately

`_playRequested` and `_stopRequested` are processed and reset to `false` within a single frame.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.

### Touch pointer not enabled

`toggleSubPointer('touch', true)` must be called when entities are created, not just at init time.

### Pressed stuck after poke pull-back

Fixed: `processTouchLifecycle` now dispatches `pointer.up()` when intersection is lost in SELECT state.
