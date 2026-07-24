---
name: test-audio
description: 'Test audio system (AudioSource loading, playback state, stop, spatial audio) against the audio example using the iwsdk CLI.'
argument-hint: '[--suite loading|playback|stop|all]'
---

# Audio System Test

Run 6 test suites covering audio loading, playback trigger, stop, system registration, component schema, and stability.

**Configuration:**

- EXAMPLE_DIR: `$IWSDK_REPO_ROOT/examples/audio`

**Tool calls**: every tool call is `npx iwsdk <subcommand> [--input-json '<JSON>'] [--timeout <ms>]`, run from inside the example workspace (cwd `$EXAMPLE_DIR`). The CLI auto-discovers the IWSDK app root from cwd, so no path tricks are required. Run `npx iwsdk mcp inspect` from the example to discover available tools and their CLI subcommands.

- `<JSON>` is a JSON object string. Omit `--input-json` if no arguments are needed.
- Output is JSON on stdout: `{ok, workspaceRoot, operation, result}`. Parse it to check assertions.
- Use `--timeout 20000` for operations that may take longer (reload, xr enter, screenshot).

**IMPORTANT**: Run each Bash command one at a time. Parse the JSON output and verify assertions before moving to the next command. Do NOT chain multiple CLI commands together.

**IMPORTANT**: When the instructions say "wait N seconds", use `sleep N` as a separate Bash command.

**IMPORTANT**: Boolean values in `ecs set-component` must be actual JSON booleans (`value: true`), NOT strings (`value: "true"`). Strings silently fail to coerce.

---

## Step 1: Install Dependencies

```bash
cd $IWSDK_REPO_ROOT/examples/audio && npm run fresh:install
```

Wait for this to complete before proceeding.

---

## Step 2: Start Dev Server

Start the dev server as a background task using the Bash tool's `run_in_background: true` parameter:

```bash
cd $IWSDK_REPO_ROOT/examples/audio && npm run dev
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

3. `npx iwsdk browser logs --input-json '{"count":20,"level":["error"]}' 2>/dev/null`
   Assert: No error-level logs. Audio autoplay warnings are acceptable.

---

### Suite 1: Audio Loading

**Test 1.1: Find Audio Entity**

```bash
npx iwsdk ecs find --input-json '{"withComponents":["AudioSource"]}' 2>/dev/null
```

Assert: At least 1 entity. Save the first as `<audio>`.

The audio example uses a native scene level that creates entities via composition. The Spinner entity has an AudioSource.

**Test 1.2: Verify Loaded State**

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<audio>,"components":["AudioSource"]}' 2>/dev/null
```

Assert:

- `src` contains an audio file path (e.g., `.mp3`)
- `_loaded` = `true` (buffer loaded)
- `_loading` = `false` (not currently loading)
- `_isPlaying` = `false` (not playing yet — unless autoplay is set)
- `volume` = `1`
- `positional` = `true`

**Test 1.3: Pool Created**
Assert: `_pool` exists with `available` array matching `maxInstances`.

---

### Suite 2: Playback Trigger

**Test 2.1: Request Play**

```bash
npx iwsdk ecs set-component --input-json '{"entityIndex":<audio>,"componentId":"AudioSource","field":"_playRequested","value":true}' 2>/dev/null
```

The set response may briefly show `newValue: true`. Wait one frame, then query the
component and assert `_playRequested` is `false`; the AudioSystem consumes the
request asynchronously.

```bash
sleep 1
```

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<audio>,"components":["AudioSource"]}' 2>/dev/null
```

**Test 2.2: Play with Loop for Observable State**

Set `loop: true` first, then request play:

```bash
npx iwsdk ecs set-component --input-json '{"entityIndex":<audio>,"componentId":"AudioSource","field":"loop","value":true}' 2>/dev/null
```

```bash
npx iwsdk ecs set-component --input-json '{"entityIndex":<audio>,"componentId":"AudioSource","field":"_playRequested","value":true}' 2>/dev/null
```

Then query:

```bash
npx iwsdk ecs query --input-json '{"entityIndex":<audio>,"components":["AudioSource"]}' 2>/dev/null
```

Assert: `_isPlaying` = `true` (looping sound keeps playing).

---

### Suite 3: Stop

**Test 3.1: Request Stop**

```bash
npx iwsdk ecs set-component --input-json '{"entityIndex":<audio>,"componentId":"AudioSource","field":"_stopRequested","value":true}' 2>/dev/null
```

Assert: `_stopRequested` consumed, `_isPlaying` becomes `false`.

---

### Suite 4: System Registration

```bash
npx iwsdk ecs systems 2>/dev/null
```

Assert:

- AudioSystem at priority 0
- Config keys: `enableDistanceCulling`, `cullingDistanceMultiplier`
- `audioEntities` >= 1

---

### Suite 5: Component Schema

```bash
npx iwsdk ecs components 2>/dev/null
```

Assert AudioSource fields:

- Core: `src` (FilePath), `volume` (Float32), `loop` (Boolean), `autoplay` (Boolean)
- Spatial: `positional` (Boolean), `refDistance`, `rolloffFactor`, `maxDistance`, `distanceModel`, `coneInnerAngle`, `coneOuterAngle`, `coneOuterGain`
- Behavior: `playbackMode` (Enum), `maxInstances` (Int8), `crossfadeDuration` (Float32), `instanceStealPolicy` (Enum)
- Control: `_playRequested`, `_pauseRequested`, `_stopRequested` (Boolean), `_fadeIn`, `_fadeOut` (Float32)
- State: `_pool` (Object), `_instances` (Object), `_isPlaying` (Boolean), `_buffer` (Object), `_loaded`, `_loading` (Boolean)

---

### Suite 6: Stability

```bash
npx iwsdk browser logs --input-json '{"count":30,"level":["error","warn"]}' 2>/dev/null
```

Assert: No application-level errors. Audio autoplay warnings and pre-existing 404 resource errors from page load are acceptable.

---

## Step 5: Cleanup & Results

Kill the dev server:

```bash
cd $IWSDK_REPO_ROOT/examples/audio && npx iwsdk dev down
```

Output a summary table:

```
| Suite                    | Result    |
|--------------------------|-----------|
| 1. Audio Loading         | PASS/FAIL |
| 2. Playback Trigger      | PASS/FAIL |
| 3. Stop                  | PASS/FAIL |
| 4. System Registration   | PASS/FAIL |
| 5. Component Schema      | PASS/FAIL |
| 6. Stability             | PASS/FAIL |
```

If any suite fails, include which assertion failed and actual vs expected values.

---

## Recovery

If at any point a transient error occurs (server crash, WebSocket timeout, connection refused, etc.) that is NOT caused by a source code bug:

1. Stop the dev server: `cd $IWSDK_REPO_ROOT/examples/audio && npx iwsdk dev down`
2. Restart: re-run Step 2 to start a fresh dev server
3. Re-run the Pre-test Setup (reload, accept session)
4. Retry the failed suite

Only give up after one retry attempt per suite. If the same suite fails twice, mark it FAIL and continue to the next suite.

---

## Known Issues & Workarounds

### Request flags are one-shot

`_playRequested`, `_pauseRequested`, and `_stopRequested` are consumed by the AudioSystem within one frame. The `npx iwsdk ecs set-component` response may already show `newValue: false`.

### Short sounds finish before query

Non-looping sounds may finish playing before you can query `_isPlaying`. Set `loop: true` before playing to observe a persistent `_isPlaying: true` state.

### Stop priority

If `_stopRequested` and `_playRequested` are set simultaneously, stop wins.

### Audio output not verifiable

IWER runs in a browser context where the AudioContext may be suspended until a user gesture. The MCP tools can verify ECS state transitions but cannot confirm actual audio output.

### Audio example uses native scene JSON

The audio example loads entities from `./scenes/audio.iwsdk.scene.json`. Most entities are not created in index.js; they come from the scene document. Use `npx iwsdk ecs find` to discover them dynamically.

### Boolean values must be JSON booleans

When setting boolean fields (like `_playRequested`, `loop`, `_stopRequested`) via `npx iwsdk ecs set-component`, the `value` must be a JSON boolean (`true`), not a string (`"true"`). Strings silently fail.

### Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `npx iwsdk ecs find`.
