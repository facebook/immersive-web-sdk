---
name: test-environment
description: "Test IWSDK environment system covering DomeGradient, IBLGradient, default lighting, and component schemas against the poke example via mcp-call.mjs WebSocket CLI. Use when testing lighting environments, validating gradient components, debugging scene lighting setup, or verifying environment configuration in IWSDK."
argument-hint: '[--suite gradient|ibl|defaults|all]'
---

# Environment System Test

Run 6 test suites covering default lighting verification, system registration, component registration, scene hierarchy, ECS data modification, and stability.

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

**IMPORTANT**: Boolean values in `ecs_set_component` must be actual JSON booleans (`value: true`), NOT strings (`value: "true"`). Strings silently fail to coerce.

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

### Suite 1: Default Lighting Verification

**Test 1.1: Find LevelRoot Dynamically**

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["LevelRoot"]}' 2>/dev/null
```

Assert: Exactly 1 entity. Save its `entityIndex` as `<root>`.

**Test 1.2: LevelRoot Has Environment Components**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<root>,"components":["DomeGradient","IBLGradient"]}' 2>/dev/null
```

Assert: Both components present with default values:

**DomeGradient defaults:**
| Field | Expected Value |
|-------|---------------|
| `sky` | `[0.2423, 0.6172, 0.8308, 1.0]` (soft blue) |
| `equator` | `[0.6584, 0.7084, 0.7913, 1.0]` (gray-blue) |
| `ground` | `[0.807, 0.7758, 0.7454, 1.0]` (warm beige) |
| `intensity` | `1.0` |
| `_needsUpdate` | `false` (already processed) |

**IBLGradient defaults:**
| Field | Expected Value |
|-------|---------------|
| `sky` | `[0.6902, 0.749, 0.7843, 1.0]` (soft blue-gray — different from DomeGradient!) |
| `equator` | `[0.6584, 0.7084, 0.7913, 1.0]` (same as DomeGradient) |
| `ground` | `[0.807, 0.7758, 0.7454, 1.0]` (same as DomeGradient) |
| `intensity` | `1.0` |
| `_needsUpdate` | `false` |

**Key detail**: DomeGradient and IBLGradient have **different** `sky` defaults.

---

### Suite 2: System Registration

**Test 2.1: EnvironmentSystem Present**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- EnvironmentSystem at priority 0
- Query entity counts: `domeGradients: 1`, `iblGradients: 1`, `domeTextures: 0`, `iblTextures: 0`

---

### Suite 3: Component Registration

**Test 3.1: All Environment Components Registered**

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert these components exist with correct schemas:

| Component      | Key Fields                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `DomeGradient` | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32), `_needsUpdate` (Boolean)        |
| `DomeTexture`  | `src` (String), `blurriness` (Float32), `intensity` (Float32), `rotation` (Vec3), `_needsUpdate` (Boolean) |
| `IBLGradient`  | `sky` (Color), `equator` (Color), `ground` (Color), `intensity` (Float32), `_needsUpdate` (Boolean)        |
| `IBLTexture`   | `src` (String, default: "room"), `intensity` (Float32), `rotation` (Vec3), `_needsUpdate` (Boolean)        |

---

### Suite 4: Scene Hierarchy

**Test 4.1: Dome Mesh in Scene**

```bash
MCPCALL --tool scene_get_hierarchy --args '{"maxDepth":2}' 2>/dev/null
```

The gradient dome mesh is added directly to the scene (not under LevelRoot). Look for an unnamed mesh node at the scene root level.

---

### Suite 5: ECS Data Modification

**Test 5.1: Modify DomeGradient Sky Color**

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<root>,"componentId":"DomeGradient","field":"sky","value":"[1.0, 0.0, 0.0, 1.0]"}' 2>/dev/null
```

Then verify:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<root>,"components":["DomeGradient"]}' 2>/dev/null
```

Assert: `sky` = `[1.0, 0.0, 0.0, 1.0]`

**Test 5.2: Modify IBLGradient Intensity**

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<root>,"componentId":"IBLGradient","field":"intensity","value":"2.0"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<root>,"componentId":"IBLGradient","field":"_needsUpdate","value":true}' 2>/dev/null
```

Assert: ECS value updates.

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
| Suite                    | Result    |
|--------------------------|-----------|
| 1. Default Lighting      | PASS/FAIL |
| 2. System Registration   | PASS/FAIL |
| 3. Component Registration| PASS/FAIL |
| 4. Scene Hierarchy       | PASS/FAIL |
| 5. ECS Data Modification | PASS/FAIL |
| 6. Stability             | PASS/FAIL |
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

### Live gradient color changes don't update visuals

Setting DomeGradient/IBLGradient color fields via `ecs_set_component` updates the ECS data but does NOT update the Three.js shader uniforms. Testing is limited to **data verification**.

### \_needsUpdate consumed immediately

The `_needsUpdate` flag is consumed by the EnvironmentSystem and reset to `false`. The response may already show `newValue: false`.

### Default lighting auto-attach

`LevelSystem` attaches `DomeGradient` + `IBLGradient` to the LevelRoot ONLY if `defaultLighting: true` (default) AND the level root doesn't already have dome/IBL components.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.

### Boolean values must be JSON booleans

When setting boolean fields (like `_needsUpdate`) via `ecs_set_component`, the `value` must be a JSON boolean (`true`), not a string (`"true"`). Strings silently fail.
