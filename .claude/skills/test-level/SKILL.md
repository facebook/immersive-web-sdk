---
name: test-level
description: "Test IWSDK level system covering LevelRoot, LevelTag, default lighting, and scene hierarchy against the poke example via mcp-call.mjs WebSocket CLI. Use when testing game levels, validating scene hierarchies, debugging level configurations, or verifying lighting setup in IWSDK applications."
argument-hint: '[--suite root|tags|lighting|hierarchy|all]'
---

# Level System Test

Run 5 test suites covering LevelRoot, LevelTag membership, default lighting, scene hierarchy, and stability.

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

### Suite 1: LevelRoot

**Test 1.1: Find LevelRoot Entity**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelRoot"]}' 2>/dev/null
```

Assert: Exactly 1 entity. Save its `entityIndex` as `<root>`.
Entity should have name "LevelRoot".
Entity should also have: Transform, LevelTag, DomeGradient, IBLGradient.

**Test 1.2: LevelRoot Transform at Identity**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<root>,"components":["Transform"]}' 2>/dev/null
```

Assert:

- position: `[0, 0, 0]` (approximately)
- orientation: `[0, 0, 0, 1]`
- scale: `[1, 1, 1]`

The LevelSystem enforces identity transform on the level root every frame.

---

### Suite 2: LevelTag Membership

**Test 2.1: All Level Entities Tagged**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelTag"]}' 2>/dev/null
```

Assert: Multiple entities — all entities except entity 0 (scene root, which is persistent).

**Test 2.2: LevelTag ID Matches**

Pick any tagged entity from the results above:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<any-tagged>,"components":["LevelTag"]}' 2>/dev/null
```

Assert: `id` = `"level:default"`

All tagged entities should have the same `id` value (`"level:default"` for the initial level).

**Test 2.3: Persistent Entities Excluded**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["Transform"],"withoutComponents":["LevelTag"]}' 2>/dev/null
```

Assert: Only entity 0 (scene root — created with persistent: true internally).

---

### Suite 3: Default Lighting

**Test 3.1: LevelRoot Has Both Environment Components**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<root>,"components":["DomeGradient","IBLGradient"]}' 2>/dev/null
```

Assert: Both components present with default color values.

**Test 3.2: LevelSystem Config**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert: LevelSystem has config key: `defaultLighting`.

---

### Suite 4: Scene Hierarchy

**Test 4.1: LevelRoot is Child of Scene Root**

```bash
MCPCALL --tool scene_get_hierarchy --args '{"maxDepth":2}' 2>/dev/null
```

Assert:

- Scene root children include "LevelRoot"
- LevelRoot children include all level entities (env mesh, robot, panel, logo, etc.)

**Test 4.2: Entity Count**

```bash
MCPCALL --tool ecs_find_entities --args '{"limit":50}' 2>/dev/null
```

Assert: Total entity count should be >= 5.

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
| 1. LevelRoot           | PASS/FAIL |
| 2. LevelTag Membership | PASS/FAIL |
| 3. Default Lighting    | PASS/FAIL |
| 4. Scene Hierarchy     | PASS/FAIL |
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

### LevelTag id for default level

When no GLXF level URL is provided, the level id is `"level:default"`. All entities created via `world.createTransformEntity()` (without `persistent: true`) automatically receive `LevelTag` with this id.

### Level root identity enforcement

`LevelSystem.update()` checks and resets the level root's transform to identity every frame. If you modify the level root's position via `ecs_set_component`, it will be reset on the next frame.

### Entity 0 is special

Entity 0 wraps the Three.js `Scene` object. It has `Transform` but no `LevelTag` — it's the persistent root that survives level changes.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
