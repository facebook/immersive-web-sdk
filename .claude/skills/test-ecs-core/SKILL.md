---
name: test-ecs-core
description: "Test ECS core functionality covering system registration, components, Transform sync, pause/step/resume, system toggle, entity discovery, and snapshots against the poke example via mcp-call.mjs WebSocket CLI. Use when testing entity-component system behavior, debugging ECS registration, or validating core IWSDK framework functionality."
argument-hint: '[--suite systems|components|transform|lifecycle|toggle|discovery|snapshot|stability|all]'
---

# ECS Core Test

Run 8 test suites covering ECS system registration, component schemas, Transform sync, pause/step/resume, system toggle, entity discovery, snapshot/diff, and stability.

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

3. `MCPCALL --tool browser_get_console_logs --args '{"level":["error","warn"]}' 2>/dev/null`
   Assert: result should be empty or have no errors/warnings

---

### Suite 1: System Registration

**Test 1.1: List All Systems**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert these framework systems are present with correct priorities:

| System              | Priority |
| ------------------- | -------- |
| `LocomotionSystem`  | -5       |
| `InputSystem`       | -4       |
| `GrabSystem`        | -3       |
| `TransformSystem`   | 0        |
| `VisibilitySystem`  | 0        |
| `EnvironmentSystem` | 0        |
| `LevelSystem`       | 0        |
| `AudioSystem`       | 0        |
| `PanelUISystem`     | 0        |

Also verify entity counts:

- InputSystem: `rayInteractables >= 1`, `pokeInteractables >= 1`
- TransformSystem: `transform >= 5`
- LevelSystem: `levelEntities >= 4`

---

### Suite 2: Component Registration

**Test 2.1: List All Components**

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert these components are present:

- `Transform` with fields: `position` (Vec3), `orientation` (Vec4), `scale` (Vec3), `parent` (Entity)
- `Visibility` with field: `isVisible` (Boolean, default: true)
- `LevelRoot` (no fields — marker)
- `LevelTag` with field: `id` (String)
- `PanelUI` with fields: `config` (String), `maxWidth` (Float32), `maxHeight` (Float32)
- `AudioSource` with fields: `src` (FilePath), `volume` (Float32)

**Test 2.2: Transform Default Values**
From the ecs_list_components output, verify Transform field defaults:

- `position` default: `[NaN, NaN, NaN]`
- `orientation` default: `[NaN, NaN, NaN, NaN]`
- `scale` default: `[NaN, NaN, NaN]`

---

### Suite 3: Transform Sync (ECS <-> Object3D)

**Test 3.1: Modify Transform Position**

1. Find an entity with LevelTag:

   ```bash
   MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelTag"]}' 2>/dev/null
   ```

   Pick the first entity's `entityIndex`.

2. Get the scene hierarchy to find the entity's Object3D UUID:

   ```bash
   MCPCALL --tool scene_get_hierarchy --args '{"maxDepth":3}' 2>/dev/null
   ```

   Find the node matching the entity index.

3. Get initial transform:

   ```bash
   MCPCALL --tool scene_get_object_transform --args '{"uuid":"<UUID>"}' 2>/dev/null
   ```

4. Set position via ECS:

   ```bash
   MCPCALL --tool ecs_set_component --args '{"entityIndex":<N>,"componentId":"Transform","field":"position","value":"[0, 2, -1]"}' 2>/dev/null
   ```

5. Verify Object3D moved:
   ```bash
   MCPCALL --tool scene_get_object_transform --args '{"uuid":"<UUID>"}' 2>/dev/null
   ```
   Assert: `localPosition` matches `[0, 2, -1]` (within tolerance of 0.01).

---

### Suite 4: ECS Pause / Step / Resume

**Test 4.1: Pause**

```bash
MCPCALL --tool ecs_pause 2>/dev/null
```

Assert: `paused === true`, `systemCount >= 12`

**Test 4.2: Step**

```bash
MCPCALL --tool ecs_step --args '{"count":5}' 2>/dev/null
```

Assert: `framesAdvanced === 5`

**Test 4.3: Resume**

```bash
MCPCALL --tool ecs_resume 2>/dev/null
```

Assert: `paused === false`

---

### Suite 5: System Toggle

**Test 5.1: Pause a System**

```bash
MCPCALL --tool ecs_toggle_system --args '{"name":"GrabSystem","paused":true}' 2>/dev/null
```

Assert: `isPaused === true`

**Test 5.2: Resume a System**

```bash
MCPCALL --tool ecs_toggle_system --args '{"name":"GrabSystem","paused":false}' 2>/dev/null
```

Assert: `isPaused === false`

---

### Suite 6: Entity Discovery

**Test 6.1: Find by Component**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelRoot"]}' 2>/dev/null
```

Assert: exactly 1 entity

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["Transform"]}' 2>/dev/null
```

Assert: returns entities (count >= 5)

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelTag"]}' 2>/dev/null
```

Assert: returns entities (count >= 4)

**Test 6.2: Find by Name Pattern**

```bash
MCPCALL --tool ecs_find_entities --args '{"namePattern":"LevelRoot"}' 2>/dev/null
```

Assert: matches entity named "LevelRoot"

**Test 6.3: Exclude Components**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["Transform"],"withoutComponents":["LevelTag"]}' 2>/dev/null
```

Assert: returns only persistent entities (fewer than the full Transform set)

---

### Suite 7: Snapshot & Diff

**Test 7.1: Snapshot**

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"baseline"}' 2>/dev/null
```

Assert: `entityCount >= 5`, `componentCount >= 20`

**Test 7.2: Modify and Diff**

1. Find an entity with LevelTag:

   ```bash
   MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelTag"]}' 2>/dev/null
   ```

2. Set its position:

   ```bash
   MCPCALL --tool ecs_set_component --args '{"entityIndex":<N>,"componentId":"Transform","field":"position","value":"[1, 1, 1]"}' 2>/dev/null
   ```

3. Take second snapshot:

   ```bash
   MCPCALL --tool ecs_snapshot --args '{"label":"modified"}' 2>/dev/null
   ```

4. Diff:
   ```bash
   MCPCALL --tool ecs_diff --args '{"from":"baseline","to":"modified"}' 2>/dev/null
   ```
   Assert: diff shows Transform.position changed to `[1, 1, 1]`

---

### Suite 8: Stability

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
| Suite                    | Result    |
|--------------------------|-----------|
| 1. System Registration   | PASS/FAIL |
| 2. Component Registration| PASS/FAIL |
| 3. Transform Sync        | PASS/FAIL |
| 4. Pause/Step/Resume     | PASS/FAIL |
| 5. System Toggle         | PASS/FAIL |
| 6. Entity Discovery      | PASS/FAIL |
| 7. Snapshot & Diff       | PASS/FAIL |
| 8. Stability             | PASS/FAIL |
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

### Transform NaN defaults

Transform fields default to `[NaN, NaN, NaN]` — by design. NaN sentinel means "don't overwrite existing Object3D value".

### UUIDs change on reload

Three.js Object3D UUIDs regenerate on page reload. Always call `scene_get_hierarchy` after reload.

### ecs_step timeout

`ecs_step` has a 5-second timeout per step. If render loop is inactive, steps may fail.

### Entity indices change on reload

Never cache entity indices across reloads. Always re-discover via `ecs_find_entities`.

### Console log noise

Some warnings (e.g., TLS self-signed cert) are expected and should be ignored. Only check for application-level errors/warnings.
