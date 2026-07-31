---
name: test-level
description: 'Test level system (LevelRoot, LevelTag, authored environment, scene hierarchy) against the poke example using the iwsdk CLI.'
argument-hint: '[--suite root|tags|lighting|hierarchy|all]'
---

# Level System Test

Run 5 test suites covering LevelRoot, LevelTag membership, authored environment, scene hierarchy, and stability.

**Configuration:**

- EXAMPLE_DIR: `$IWSDK_REPO_ROOT/examples/poke`

**Tool calls**: every tool call is `npx iwsdk <subcommand> [--input-json '<JSON>'] [--timeout <ms>]`, run from inside the example workspace (cwd `$EXAMPLE_DIR`). The CLI auto-discovers the IWSDK app root from cwd, so no path tricks are required. Run `npx iwsdk mcp inspect` from the example to discover available tools and their CLI subcommands.

- `<JSON>` is a JSON object string. Omit `--input-json` if no arguments are needed.
- Output is JSON on stdout: `{ok, workspaceRoot, operation, result}`. Parse it to check assertions.
- Use `--timeout 20000` for operations that may take longer (reload, xr enter, screenshot).

**IMPORTANT**: Run each Bash command one at a time. Parse the JSON output and verify assertions before moving to the next command. Do NOT chain multiple CLI commands together.

**IMPORTANT**: When the instructions say "wait N seconds", use `sleep N` as a separate Bash command.

---

## Step 1: Install Dependencies

```bash
cd $IWSDK_REPO_ROOT/examples/poke && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd $IWSDK_REPO_ROOT/examples/poke && npm run dev
```

**IMPORTANT**: This command MUST be run with `run_in_background: true` on the Bash tool — do NOT append `&` to the command itself.

Once the background task is launched, poll the output for Vite's ready message (up to 60s). You can also run `npx iwsdk dev status` from the example directory until `state.running` becomes `true`. You do not need to extract or manage the port yourself; subsequent commands resolve the active runtime through the CLI automatically.

If the server fails to start within 60 seconds, report FAIL for all suites and skip to Step 5.

---

## Step 3: Verify Connectivity

```bash
npx iwsdk ecs systems 2>/dev/null
```

This must return JSON with a list of systems. If it fails:

1. Check the dev server output for errors
2. Try killing and restarting the server (Step 2)
3. If it still fails, report FAIL for all suites and skip to Step 5

---

## Step 4: Run Test Suites

### Pre-test Setup

Run these commands in order:

1. `npx iwsdk browser reload --timeout 20000 2>/dev/null`
   Then: `sleep 3`

2. `npx iwsdk xr enter --timeout 20000 2>/dev/null`
   Then: `sleep 2`

3. `npx iwsdk browser logs --input-json '{"count":20,"level":["error","warn"]}' 2>/dev/null`
   Assert: No error-level logs.

---

### Suite 1: LevelRoot

**Test 1.1: Find LevelRoot Entity**

```bash
npx iwsdk ecs find --input-json '{"withComponents":["LevelRoot"]}' 2>/dev/null
```

Assert: Exactly 1 entity. Save its `entityIndex` as `<root>`.
Entity should have name "LevelRoot".
Entity should also have: Transform, LevelTag, DomeGradient, IBLGradient.

**Test 1.2: LevelRoot Transform at Identity**

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<root>,"components":["Transform"]}' 2>/dev/null
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
npx iwsdk ecs find --input-json '{"withComponents":["LevelTag"]}' 2>/dev/null
```

Assert: Multiple entities — all entities except entity 0 (scene root, which is persistent).

**Test 2.2: LevelTag ID Matches**

Pick any tagged entity from the results above:

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<any-tagged>,"components":["LevelTag"]}' 2>/dev/null
```

Assert: `id` = `"level:default"`

All tagged entities should have the same `id` value (`"level:default"` for the initial level).

**Test 2.3: Persistent Entities Excluded**

```bash
npx iwsdk ecs find --input-json '{"withComponents":["Transform"],"withoutComponents":["LevelTag"]}' 2>/dev/null
```

Assert: 10 entities — entity 0 (scene root) plus 9 persistent input-rig entities created by the world bootstrap (xrOrigin, head, ray/grip/indexTip spaces for left and right). None of these should carry `LevelTag`.

---

### Suite 3: Authored Environment

**Test 3.1: LevelRoot Has Both Environment Components**

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<root>,"components":["DomeGradient","IBLGradient"]}' 2>/dev/null
```

Assert: Both scene-authored components are present with the gradient values
declared in `public/scenes/poke.iwsdk.scene.json`. They are not synthesized by
`LevelSystem`.

---

### Suite 4: Scene Hierarchy

**Test 4.1: LevelRoot is Child of Scene Root**

```bash
npx iwsdk scene runtime-hierarchy --input-json '{"maxDepth":2}' 2>/dev/null
```

Assert:

- Scene root children include "LevelRoot"
- LevelRoot children include all level entities (env mesh, robot, panel, logo, etc.)

**Test 4.2: Entity Count**

```bash
npx iwsdk ecs find --input-json '{"limit":50}' 2>/dev/null
```

Assert: Total entity count should be >= 5.

---

### Suite 5: Stability

```bash
npx iwsdk browser logs --input-json '{"count":30,"level":["error","warn"]}' 2>/dev/null
```

Assert: No application-level errors or warnings. Pre-existing 404 resource errors from page load are acceptable.

---

## Step 5: Cleanup & Results

Kill the dev server:

```bash
cd $IWSDK_REPO_ROOT/examples/poke && npx iwsdk dev down
```

Output a summary table:

```
| Suite                  | Result    |
|------------------------|-----------|
| 1. LevelRoot           | PASS/FAIL |
| 2. LevelTag Membership | PASS/FAIL |
| 3. Authored Environment | PASS/FAIL |
| 4. Scene Hierarchy     | PASS/FAIL |
| 5. Stability           | PASS/FAIL |
```

If any suite fails, include which assertion failed and actual vs expected values.

---

## Recovery

If at any point a transient error occurs (server crash, WebSocket timeout, connection refused, etc.) that is NOT caused by a source code bug:

1. Stop the dev server: `cd $IWSDK_REPO_ROOT/examples/poke && npx iwsdk dev down`
2. Restart: re-run Step 2 to start a fresh dev server
3. Re-run the Pre-test Setup (reload, accept session)
4. Retry the failed suite

Only give up after one retry attempt per suite. If the same suite fails twice, mark it FAIL and continue to the next suite.

---

## Known Issues & Workarounds

### LevelTag id for default level

When no GLXF level URL is provided, the level id is `"level:default"`. All entities created via `world.createTransformEntity()` (without `persistent: true`) automatically receive `LevelTag` with this id.

### Level root identity enforcement

`LevelSystem.update()` checks and resets the level root's transform to identity every frame. If you modify the level root's position via `ecs set-component`, it will be reset on the next frame.

### Entity 0 is special

Entity 0 wraps the Three.js `Scene` object. It has `Transform` but no `LevelTag` — it's the persistent root that survives level changes.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `npx iwsdk ecs find`.
