# Phases 5–7 Playbook — Runtime Verification

Everything here uses the `iwsdk` CLI (works in every harness). MCP
equivalents exist for every command but several names differ: `xr enter` =
`xr_accept_session`, `xr status` = `xr_get_session_status`, `ecs find` =
`ecs_find_entities`, `ecs query` = `ecs_query_entity`, `browser logs` =
`browser_get_console_logs`, `browser reload` = `browser_reload_page`,
`scene state` = `scene_get_state`, and `scene render-file` =
`scene_render_file`; the rest map 1:1
(`xr_select` → `xr select`, `ecs_pause` → `ecs pause`, …). Use MCP tools only
if your harness clearly has them connected. The sibling `iwsdk-grab` /
`iwsdk-ray` / `iwsdk-debug` / `iwsdk-ui` skills cover the same runtime
operations as focused per-interaction recipes — consistent with this file.

**Ground rules.** Run every `npx iwsdk …` from **inside the app directory**
(the app must depend on `@iwsdk/cli`; a bare `npx iwsdk` elsewhere resolves
to an unrelated npm package). One CLI call per shell command — no `&&`
chains between CLI calls; use separate `sleep N` calls for waits. Every
command prints a JSON envelope `{ok, data|error}` on stdout — parse it and
check the assertion **before** the next command. Add `--timeout 20000` to
slow ops (reload, xr enter, animate-to, screenshot).

## The Standard Loop

```bash
npx tsc --noEmit                     # 0. types clean first — always
npx iwsdk dev status                 # 1. already running? if state.running AND
                                     #    state.browserCommandReady are true,
                                     #    REUSE it — never start a second server
npx iwsdk dev up --timeout 60000     # 2. only if not running: detached daemon;
                                     #    returns once the browser is command-ready.
                                     #    (`npm run dev` = `iwsdk dev up --open
                                     #    --foreground` — never returns; use it only
                                     #    where your harness manages background
                                     #    processes. NEVER a bare '&'.)
npx iwsdk ecs systems                # 3. connectivity: returns system list
npx iwsdk browser reload --timeout 20000   # 4. fresh page state
sleep 3
npx iwsdk browser screenshot --output-file design/verify/base.png --timeout 20000
                                     # 5. runtime renders? (not black/empty).
                                     #    Browser screenshots are runtime-only and
                                     #    auto-switch away from editor view. Without
                                     #    --output-file the PNG lands in the system
                                     #    temp dir (path in the JSON envelope)
npx iwsdk xr enter --timeout 20000   # 6. enter emulated XR session
sleep 2
npx iwsdk browser logs --input-json '{"count":30}'
                                     # 7. console clean — scan ALL levels (a
                                     #    level filter can miss important errors);
                                     #    fail the gate on any error-looking line
```

If `dev up` times out, poll yourself: run `npx iwsdk dev status`, `sleep 5`,
repeat up to ~60 s (a shell `until` loop around the _single_ CLI call is fine
— the no-chaining rule is about chaining different CLI calls), then inspect
`npx iwsdk dev logs --tail 100`.

Then per-scenario: discover → simulate → assert. Finish with
`npx iwsdk dev down` when done for the session.

The dev server owns one managed headed Playwright Chromium window, with IWER enabled
for XR starters. It starts with the dev server; do not launch a second browser or turn
Vite's independent `server.open` back on. Use `scene screenshot` / `scene render-file`
for editor evidence and `browser screenshot` for the application runtime.

## Discover (after every reload — entity indices are NOT stable)

```bash
npx iwsdk ecs find --input-json '{"withComponents":["OneHandGrabbable"]}'
npx iwsdk ecs query --input-json '{"entityIndex":3}'          # full entity dump
npx iwsdk scene state --raw                                      # active scene/runtime state
npx iwsdk ecs components                                       # component registry
npx iwsdk ecs systems                                          # system registry
```

## Simulate input (XR emulation cheat sheet)

Devices: `headset`, `controller-left`, `controller-right`, `hand-left`,
`hand-right`.

```bash
# Aim/move devices
npx iwsdk xr set-transform --input-json '{"device":"headset","position":{"x":0,"y":1.6,"z":0}}'
npx iwsdk xr look-at --input-json '{"device":"controller-right","target":{"x":0,"y":1,"z":-2}}'
npx iwsdk xr animate-to --input-json '{"device":"controller-right","position":{"x":0.2,"y":1.1,"z":-0.4},"duration":0.5}' --timeout 20000

# Buttons — WRONG BUTTON FAILS SILENTLY, know which mechanic uses which:
npx iwsdk xr set-select-value --input-json '{"device":"controller-right","value":1}'   # press TRIGGER — UI pointerdown or distance-grab engage
npx iwsdk xr set-select-value --input-json '{"device":"controller-right","value":0}'   # release TRIGGER — UI pointerup or distance-grab release
npx iwsdk xr set-gamepad-state --input-json '{"device":"controller-right","buttons":[{"index":1,"value":1}]}'  # SQUEEZE — near grab (one/two-hand)
npx iwsdk xr set-gamepad-state --input-json '{"device":"controller-right","buttons":[{"index":3,"value":1}]}'  # A/X button (jump default)

# Thumbsticks (axes index 0=X, 1=Y):
npx iwsdk xr set-gamepad-state --input-json '{"device":"controller-left","axes":[{"index":1,"value":-1}]}'   # slide forward (0 to stop)
npx iwsdk xr set-gamepad-state --input-json '{"device":"controller-right","axes":[{"index":0,"value":1}]}'   # snap turn — EDGE-TRIGGERED: return to 0 before turning again
npx iwsdk xr set-gamepad-state --input-json '{"device":"controller-right","axes":[{"index":1,"value":1}]}'   # hold then release to 0 = teleport
```

Synthetic gamepad indices for `set-gamepad-state`: 0=trigger, 1=squeeze,
2=thumbstick-press, 3=A/X, 4=B/Y, 5=thumbrest. (App code uses
`InputComponent` enums; these raw indices are only for the emulator CLI.)

## Assert

Pick the right instrument per behavior:

| Behavior                      | Assertion                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| hover/click state             | `ecs query` for `Hovered`/`Pressed` on the entity                                                                                         |
| object moved/scaled/spawned   | `ecs snapshot` (label before) → act → `ecs snapshot` (after) → `ecs diff`                                                                 |
| physics settled/fell/collided | snapshot/diff on Transform position, or pause+step deterministically                                                                      |
| **locomotion** (player moved) | **screenshots before/after** — the XR origin moves, headset transform stays constant; never assert on headset transform                   |
| **near-field grab**           | snapshot/diff — `Hovered`/`Pressed` are NOT applied on near grabs                                                                         |
| UI reacted                    | `browser logs` with a pattern: instrument handlers with distinctive `console.log('[GAME] score=…')` and assert `{"pattern":"\\[GAME\\]"}` |
| game logic over time          | `ecs pause` → `ecs step --input-json '{"count":N}'` → query → `ecs resume`                                                                |
| looks right                   | `browser screenshot` and actually look at the image                                                                                       |

```bash
npx iwsdk ecs snapshot --input-json '{"label":"before"}'
# …act…
npx iwsdk ecs snapshot --input-json '{"label":"after"}'
npx iwsdk ecs diff --input-json '{"from":"before","to":"after"}'
```

Only the two most recent snapshot labels are retained.

## Known traps

- Entity indices change on every reload — re-run `ecs find`; never reuse.
- JSON values must be real types: `true` not `"true"`, numbers not strings
  (`ecs set-component` silently no-ops on wrong types).
- Trigger vs squeeze mix-ups produce _no error and no effect_ — check the
  mechanic's grab type first (`DistanceGrabbable` → trigger/select-value;
  `OneHandGrabbable`/`TwoHandsGrabbable` → squeeze button 1).
- Teleport is blocked while the ray hovers an `Interactable`.
- Snap turn re-fires only after the stick returns to 0.
- `--input-json` takes one single-quoted JSON argument; malformed JSON errors
  out — build it with a heredoc if it contains quotes.
- UIKitML files live under `public/ui`, are registered in the asset manifest with
  `AssetType.UIKitML`, and are parsed directly at runtime. Scene JSON references the
  manifest asset ID; application code uses the placed scene node ID and element IDs.
- After deploying: verify the live HTML references the newly built hashed
  assets (stale-dist deploys are the classic ship failure).

## Managed-runtime hardening

- Prefer `xr set-select-value` 1→0 when a test needs observable press and release
  phases. Use `xr set-gamepad-state` for explicit raw gamepad buttons. Application UI
  should use its normal `click` handlers unless the product itself needs lower-level
  pointer phases.
- **Physics steps on the raw frame delta.** Reloads, screenshots, and
  `ecs snapshot` (full-state serialize) stall the tab for hundreds of ms to
  seconds; a single huge step tunnels thin/falling bodies and pops stacked
  contacts. Don't run heavy CLI commands mid-interaction; snapshot between
  scenarios, not during them. Build apps defensively (see
  build-milestones.md runtime-hitch hardening defaults).
- **Parse the right payload path**: `browser logs` returns the entries under
  `data.result` (a LIST of {level, message}); `browser screenshot` returns
  `data.screenshotPath` directly under `data`. Shapes vary per command —
  check one real response before scripting assertions.
- **Log-window noise**: `[IWSDK-MCP-TRACE]` lines flood small `count`
  windows; use `count` 60–100 or a `pattern` filter for game logs.
- **Queries and screenshots disagreeing** (state changes you can't explain)
  usually means **two browser tabs** are connected — the relay is
  first-response-wins. Check `dev status` → `connectedClientCount`; if >1,
  `npx iwsdk dev restart` to converge on one tab.

## Recovery ladder (runtime unresponsive / weird)

1. `npx iwsdk xr status` and `npx iwsdk dev status` — what state is it in?
2. `npx iwsdk browser logs` — crashed app code shows here.
3. `npx iwsdk browser reload --timeout 20000` — clears bad page state.
4. `npx iwsdk dev restart` — bad transport/server state.
5. Re-enter XR (`xr enter`) and re-discover entities after any of the above.
6. Dev server won't start: check `npx iwsdk dev logs --tail 100`; commonest
   causes are a missing `dev:runtime` script, port conflict from an orphaned
   server (`iwsdk dev down` in that app dir), or Playwright browser revision
   mismatch (`npx playwright@<pinned> install chromium`).

## VERIFICATION.md format (Phase 6 output)

```markdown
# <Title> — Verification Report (<date>, commit <sha>)

| #   | Success criterion | Result | Evidence                                   |
| --- | ----------------- | ------ | ------------------------------------------ |
| S1  | throw knocks pins | PASS   | diff: pin-3 rot Δ87°; design/verify/s1.png |

## Scenario transcripts

### S1

<the exact commands run + the assertion output snippets>

## Deferred / known gaps
```

Keep screenshots in `design/verify/`. A criterion without evidence is not a
PASS.
