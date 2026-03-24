---
name: test-physics
description: "Test IWSDK Havok physics system covering gravity, rigid bodies, and static vs dynamic behavior against the physics example via mcp-call.mjs WebSocket CLI. Use when testing physics simulations, debugging Havok integration, validating rigid body behavior, or verifying collision detection in IWSDK."
argument-hint: '[--suite gravity|static|force|all]'
---

# Physics System Test

Run 5 test suites covering gravity, static body verification, PhysicsBody state, system/component registration, and stability.

All tool calls go through `scripts/mcp-call.mjs` via WebSocket — no MCP server, no permission prompts.

**Configuration:**

- EXAMPLE_DIR: /Users/felixz/Projects/immersive-web-sdk/examples/physics
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
cd /Users/felixz/Projects/immersive-web-sdk/examples/physics && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd /Users/felixz/Projects/immersive-web-sdk/examples/physics && npm run dev
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

### Verify Physics Setup

Find all physics bodies:

```bash
MCPCALL --tool ecs_find_entities --args '{"withComponents":["PhysicsBody"]}' 2>/dev/null
```

Assert: At least 1 entity.

For each entity found, query to identify dynamic vs static:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<N>,"components":["PhysicsBody"]}' 2>/dev/null
```

Check `state` field: `"DYNAMIC"` or `"STATIC"`.

Save the dynamic entity as `<sphere>` and any static entity as `<floor>`.

Verify PhysicsSystem:

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert: PhysicsSystem at priority -2, `physicsEntities` count >= 1.

---

### Suite 1: Gravity — Dynamic Body Falls

**Test 1.1: Verify Dynamic Entity Exists**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<sphere>,"components":["PhysicsBody","Transform"]}' 2>/dev/null
```

Assert:

- `state`: `"DYNAMIC"`
- `_engineBody`: > 0 (Havok body created)
- `gravityFactor`: 1

**Note**: By the time you query, the sphere may have already fallen and come to rest.

**Test 1.2: Deterministic Gravity Test**

Reset the sphere position, then use pause/step to observe fall:

```bash
MCPCALL --tool ecs_pause 2>/dev/null
```

```bash
MCPCALL --tool ecs_set_component --args '{"entityIndex":<sphere>,"componentId":"Transform","field":"position","value":"[0, 3, -1.5]"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"before-fall"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_step --args '{"count":50}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_snapshot --args '{"label":"after-fall"}' 2>/dev/null
```

```bash
MCPCALL --tool ecs_diff --args '{"from":"before-fall","to":"after-fall"}' 2>/dev/null
```

Assert:

- Sphere's `Transform.position[1]` (Y) decreased from `3.0`
- Only the dynamic sphere entity changed significantly

```bash
MCPCALL --tool ecs_resume 2>/dev/null
```

---

### Suite 2: Static Body Doesn't Move

**Test 2.1: Static Floor Stays Put**

If a static entity was found during setup:

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<floor>,"components":["PhysicsBody","Transform"]}' 2>/dev/null
```

Assert:

- `state`: `"STATIC"`
- `_linearVelocity`: `[0, 0, 0]`
- `_angularVelocity`: `[0, 0, 0]`

**Note**: If no separate static PhysicsBody entity exists (environment geometry may not use PhysicsBody), skip this suite and report SKIP.

---

### Suite 3: PhysicsBody State Values

**Test 3.1: Inspect Dynamic Body Fields**

```bash
MCPCALL --tool ecs_query_entity --args '{"entityIndex":<sphere>,"components":["PhysicsBody"]}' 2>/dev/null
```

Assert:

- `state`: `"DYNAMIC"`
- `linearDamping`: 0
- `angularDamping`: 0
- `gravityFactor`: 1
- `_engineBody`: > 0 (non-zero Havok handle)

---

### Suite 4: System & Component Registration

**Test 4.1: PhysicsSystem at Correct Priority**

```bash
MCPCALL --tool ecs_list_systems 2>/dev/null
```

Assert:

- PhysicsSystem at priority -2
- Config keys: `gravity`

**Test 4.2: Physics Components Registered**

```bash
MCPCALL --tool ecs_list_components 2>/dev/null
```

Assert:

- `PhysicsBody`: state (Enum), linearDamping (Float32), angularDamping (Float32), gravityFactor (Float32), \_linearVelocity (Vec3), \_angularVelocity (Vec3), \_engineBody (Float64)
- `PhysicsShape`: shape (Enum), dimensions (Vec3), density (Float32), restitution (Float32), friction (Float32), \_engineShape (Float64)
- `PhysicsManipulation`: force (Vec3), linearVelocity (Vec3), angularVelocity (Vec3)

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
| Suite                     | Result         |
|---------------------------|----------------|
| 1. Gravity                | PASS/FAIL      |
| 2. Static Body            | PASS/FAIL/SKIP |
| 3. PhysicsBody State      | PASS/FAIL      |
| 4. System/Component Reg.  | PASS/FAIL      |
| 5. Stability              | PASS/FAIL      |
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

### Sphere falls immediately

The dynamic sphere starts falling as soon as the Havok body is created. Use `ecs_pause` immediately after reload to catch it, or use the deterministic reset approach.

### PhysicsManipulation is one-shot

`PhysicsManipulation` is automatically removed after forces are applied in a single frame. You cannot query it after processing.

### ecs_set_component on Transform doesn't always override physics

While PhysicsSystem is running, it may overwrite your position on the next frame. Use `ecs_pause` before modifying positions.

### Havok WASM initialization is async

Bodies may not be created on the first frame. The `_engineBody` field transitions from 0 to non-zero once Havok processes the entity.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.
