---
name: test-ui
description: "Test IWSDK UI system covering PanelUI and ScreenSpace components against the poke example via mcp-call.mjs WebSocket CLI. Use when testing UI panels, debugging ScreenSpace layouts, validating panel rendering, or verifying UI component behavior in IWSDK applications."
argument-hint: '[--suite panel|screenspace|follower|all]'
---

# UI System Test

Run 5 test suites covering panel loading, ScreenSpace, system registration, component registration, and stability.

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

- `<TOOL_NAME>` uses MCP-style names (e.g. `browser_reload_page`, `xr_accept_session`). The script handles translation internally.
- `<JSON_ARGS>` is a JSON object string. Omit `--args` if no arguments needed.
- Output is JSON on stdout. Parse it to check assertions.
- Use `--timeout 20000` for operations that may take longer (reload, accept_session, screenshot).
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

---

### Suite 1: Panel Loading

**Test 1.1: Find Panel Entity**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["PanelUI"]}' 2>/dev/null
```

Assert: At least 1 entity. Save its `entityIndex` as `<panel>`.

**Test 1.2: PanelDocument Added After Load**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["PanelUI","PanelDocument"]}' 2>/dev/null
```

Assert:

- `PanelUI.config` contains `welcome.json`
- `PanelUI.maxWidth` = `0.5`
- `PanelUI.maxHeight` = `0.4`
- `PanelDocument` component IS present (proves async panel loading succeeded)
- `PanelDocument.document` is an Object3D reference (loaded UIKitDocument)

**Test 1.3: PanelUISystem Query Counts**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- PanelUISystem: `unconfiguredPanels: 0` (all panels loaded)
- PanelUISystem: `configuredPanels: 1` (panel has PanelDocument)

---

### Suite 2: ScreenSpace

**Test 2.1: ScreenSpace Values**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<panel>,"components":["ScreenSpace"]}' 2>/dev/null
```

Assert:

- `height` = `"50%"` (CSS expression)
- `width` = `"auto"`
- `top` = `"20px"`
- `left` = `"20px"`
- `bottom` = `"auto"`
- `right` = `"auto"`
- `zOffset` = `0.2` (distance in front of camera near plane)

**Test 2.2: Panel Visible in Screenshot**

```bash
MCPCALL --tool browser_screenshot --timeout 20000 2>/dev/null
```

Assert: Returns a `screenshotPath` (PNG file saved to /tmp).

**Test 2.3: ScreenSpaceUISystem Active**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert: ScreenSpaceUISystem: `panels: 1`

---

### Suite 3: System Registration

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- `PanelUISystem` at priority 0, config: forwardHtmlEvents, kits, preferredColorScheme
- `ScreenSpaceUISystem` at priority 0
- `FollowSystem` at priority 0

---

### Suite 4: Component Registration

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert:

- `PanelUI`: config (String), maxWidth (Float32), maxHeight (Float32)
- `PanelDocument`: document (Object)
- `ScreenSpace`: height, width, top, bottom, left, right (all String), zOffset (Float32)

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
| Suite                  | Result    |
|------------------------|-----------|
| 1. Panel Loading       | PASS/FAIL |
| 2. ScreenSpace         | PASS/FAIL |
| 3. System Registration | PASS/FAIL |
| 4. Component Reg.      | PASS/FAIL |
| 5. Stability           | PASS/FAIL |
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

### PanelDocument loading is async

`PanelDocument` is added asynchronously after `fetch()` completes. If you query immediately after reload, the panel might not have loaded yet. Check that `unconfiguredPanels: 0` in PanelUISystem before asserting PanelDocument presence.

### ScreenSpace re-parenting in XR

When XR is presenting, `ScreenSpaceUISystem` re-parents the panel from the camera back to the entity's Object3D (world space). CSS positioning only applies outside XR.

### Panel interaction

The panel entity also has `RayInteractable` + `PokeInteractable`, so it participates in ray/touch interaction. The panel's `Hovered` component may be present if the default controller ray is pointing at it.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
