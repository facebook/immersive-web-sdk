# IWSDK Managed Browser Desktop Development Plan

Status: implemented; Linux headless validation complete
Last updated: 2026-08-15
Owner surface: `immersive-web-sdk`
Primary objective: make the existing managed Playwright browser sufficient for
normal development and verification of the current application without adding a
large Playwright-shaped MCP tool surface or forcing agents to launch a second
browser.

## Executive Summary

IWSDK already owns a Playwright Chromium instance, its browser context, the
managed workspace page, and the application runtime frame. Agents cannot use
most of that browser today. The public browser surface contains only screenshot,
console-log, and reload operations. It has no DOM discovery, trusted desktop
input, application-focused waiting, or useful performance capture.

This is why an agent that needs to click a 2D control, type into a form, drive a
canvas with mouse input, or capture a performance trace falls back to a second
Playwright browser. That fallback loses the managed session, duplicates startup
and state, conflicts with the one-browser guidance, and makes human/agent
collaboration harder to reason about.

The proposed product model is deliberately narrower than a generic Playwright
test service:

- `browser_*` tools always operate on the current application. Agents do not
  select runtime, editor, workspace, tabs, or arbitrary URLs.
- Keep the current three browser tools and add only three common tools:
  `browser_snapshot`, `browser_interact`, and `browser_profile`.
- Use Playwright host-side input so clicks, keyboard events, hover, drag, and
  actionability checks behave like a real desktop browser.
- Do not add arbitrary navigation to the common tool surface. Same-origin route
  changes caused by the application are observable and waitable, but the agent
  cannot use common tools to leave the current app.
- Do not expose arbitrary Playwright code as an MCP tool. Provide an explicit,
  opt-in CLI runner that attaches to the same managed browser for long-tail
  Playwright and CDP work.
- Treat desktop performance observations as host diagnostics, never calibrated
  Quest performance. Preserve GPU/SwiftShader environment data in every result.

The final MCP browser surface is six tools. Full Playwright remains available as
an escape hatch without adding its complete operation vocabulary to every
agent's tool list.

Implementation validation completed on 2026-08-15 for the available Linux
headless environment. The focused CLI and managed-browser suites pass, both
packages build, CLI/MCP parity passes, lint and changed-file formatting pass,
and the full nine-example IWSDK matrix passes. The repository-wide test command
also reaches the existing editor hardware-GPU proof tests; those tests reject
the host's SwiftShader renderer by design. Headed paths have unit coverage, but
an actual headed run still requires a host with an X server.

## Problem Statement

### Current Public Surface

Remote main currently exposes 45 MCP tools, but only these three are browser
tools:

1. `browser_screenshot`
2. `browser_get_console_logs`
3. `browser_reload_page`

The managed browser implementation retains a Playwright `Page` internally, but
the public `ManagedBrowser` interface exposes only screenshot, log, tab
metadata, lifecycle, and scene-proof helpers. The managed page subscribes to
console, page-error, close, and browser-disconnect events. It does not expose
DOM state, accessibility state, trusted input, request failures, dialogs,
downloads, navigation events, Playwright tracing, or CDP performance capture.

### Concrete Development Failures

The current surface cannot complete these ordinary current-app workflows:

- Click a DOM button or canvas location and confirm the resulting state.
- Type into a text field, submit a form, or use keyboard focus.
- Hover, scroll, drag, or operate a range control.
- Discover interactive elements without guessing CSS selectors from source.
- Wait for a control, text value, path change, animation state, or network-idle
  condition after an application action.
- Correlate an interaction with frame times, long tasks, browser metrics, or a
  trace artifact.
- Inspect request failures, dialog interruptions, or the browser source
  location of console output.

The React/Preact 2D UI guide already expects browser control testing, keyboard
focus testing, real canvas capture, browser/XR transitions, and performance
traces. The managed browser cannot currently perform those checks.

### Contract Drift

The browser documentation says `browser_screenshot` accepts a `target` of
`runtime`, `editor`, or `workspace`. The runtime contract defines an empty input
schema and explicitly rejects all parameters other than the standard stale-tab
precondition. The implementation always switches the managed workspace to the
runtime before capturing.

The implementation and documentation must be corrected together. This plan does
not preserve the documented public target selector. The simpler contract is
that `browser_*` means the current application.

## Product Decisions

### Finalized Direction

- There is one managed browser, one managed context, and one current
  application session.
- Common browser tools operate only on that current application.
- Scene editor inspection and control remain under `scene_*` tools.
- XR input remains under `xr_*` tools.
- ECS state remains under `ecs_*` tools.
- The managed workspace shell is an implementation detail of application
  targeting, not a choice agents make on every call.
- Trusted Playwright actions are required for desktop input. Calling
  `element.click()` inside `page.evaluate()` is not equivalent.
- Arbitrary navigation is not part of the common surface.
- Long-tail Playwright automation is an explicit local CLI capability, not a
  default MCP tool.
- Large traces and diagnostic artifacts are written to bounded workspace-owned
  artifact paths instead of being returned inline.

### Final MCP Browser Surface

The public browser surface contains exactly six tools:

1. `browser_screenshot`
2. `browser_get_console_logs`
3. `browser_reload_page`
4. `browser_snapshot`
5. `browser_interact`
6. `browser_profile`

Do not add one tool per Playwright action. Do not add `browser_navigate`,
`browser_context`, `browser_evaluate`, or `browser_run_playwright` to the default
MCP surface in this plan.

### Non-Goals

- Building a remotely hosted browser farm.
- Replacing Playwright Test or providing its assertion runner.
- Exposing arbitrary external websites to agents through the managed context.
- Providing mobile-device parity through the common MCP surface.
- Claiming that desktop Chromium or SwiftShader measurements predict Quest
  performance.
- Making every Playwright API serializable through MCP.
- Using browser tools to automate the native scene editor UI when semantic
  `scene_*` tools already exist.

## Application Surface Resolution

### Internal Resolution Rule

Every browser command resolves one application surface internally:

1. If the managed page is the workspace shell, resolve the application runtime
   iframe.
2. Otherwise, resolve the managed page's main frame.
3. Read page ID and tab generation from the resolved application frame, not
   from whichever outer shell happens to be visible.
4. Reject commands when the resolved application identity changes during a
   stale-sensitive operation.

The agent never supplies `runtime`, `editor`, or `workspace` as a target.

### Relationship To Relay Routing

The WebSocket relay already understands semantic page roles and tab
generations. The Playwright host needs a frame resolver as well, but the two
systems must share one canonical identity model rather than independently
inventing role and generation semantics.

The canonical application identity should include:

- managed browser session ID;
- application page ID;
- application tab generation;
- outer page URL;
- resolved application frame URL;
- whether the app is top-level or workspace-framed.

### Visible Workspace View

The runtime iframe is hidden while the editor view is active. Trusted pointer
input and meaningful rendered-frame measurement cannot operate against a
`display: none` iframe.

Therefore:

- DOM snapshotting may inspect the application frame without changing the
  visible view when Playwright can do so safely.
- Screenshot and profiling may temporarily switch to the runtime view, wait for
  the existing runtime readiness protocol, capture, and restore the prior view.
- Interaction switches to runtime view and holds it for the complete batch.
  In collaborate mode this takeover is visible to the developer.
- The previous view may be restored after the batch. It must not be restored
  between individual steps.

This behavior is explicit product behavior, not an incidental side effect.

## Tool Contracts

### `browser_screenshot`

Purpose: capture the current application as rendered in the managed browser.

Initial parameters:

- `format`: `png` or `jpeg`;
- `quality`: JPEG quality when applicable;
- `fullPage`: capture the application document rather than only its viewport;
- `ref`: optionally capture an element returned by `browser_snapshot`.

Behavior:

- Resolve the application surface automatically.
- If the app is in the workspace runtime frame, switch to runtime, wait for the
  existing readiness and frame-settle protocol, capture, and restore the prior
  view.
- Return application identity and dimensions with the image.
- Bound every returned capture to the configured screenshot dimensions, including
  full-page, element, and automatic failure captures. Report when downscaling
  occurred.

The tool does not capture the native scene editor. Use `scene_screenshot` for
that purpose.

### `browser_get_console_logs`

Purpose: query application browser diagnostics without adding a separate event
tool.

Preserve existing level, pattern, count, and time filtering. Enrich each entry
with bounded structured data when available:

- event kind: console, page error, request failure, dialog, download,
  navigation, or popup;
- source URL, line, and column;
- application frame identity;
- real serialized console arguments where safe and bounded;
- request URL, method, resource type, and failure reason for failed requests;
- repeat count and timestamp.

Console argument serialization must tolerate detached execution contexts and
must not allow one unserializable handle to fail the whole query.

### `browser_reload_page`

Purpose: reload only the current application.

Behavior:

- Resolve the application surface automatically.
- Reload the application frame or top-level application page, not an arbitrary
  page supplied by the caller.
- Preserve current relaunch and bridge-readiness recovery.
- Stop or mark interrupted any active browser profile.
- Return the new application page ID and generation.

### `browser_snapshot`

Purpose: give agents a compact, semantic representation of the current app's
2D interactive surface.

The snapshot should be accessibility-first and include:

- roles, accessible names, relevant text, and control state;
- visibility, enabled/disabled, checked, selected, expanded, and focused state;
- viewport-relative bounds for interactive elements;
- application URL/path and frame identity;
- a snapshot ID;
- short element refs suitable for later interaction;
- a bounded representation of canvases and other non-accessible interactive
  regions, including their bounds.

Refs are not DOM `ElementHandle` instances. A ref stores a lazy locator recipe
and an element fingerprint. At action time it must:

1. re-resolve through Playwright;
2. match exactly one element;
3. still match the expected semantic fingerprint;
4. otherwise fail with a retryable stale-ref result.

Refs include their snapshot identity and are never recycled as `e1`, `e2`, and
so on across snapshots. Keep recipes from multiple recent snapshots in a
bounded LRU so a diagnostic or subtree snapshot cannot silently retarget an
older ref. If a rerender removes the primary identity locator, semantic
fallback must resolve uniquely; identical candidates fail as ambiguous rather
than selecting by a shifted structural index.

A React or Preact rerender does not automatically invalidate a ref if the lazy
locator still resolves uniquely to the same semantic element. A detached,
ambiguous, or materially changed target does.

Snapshot output must be bounded by node count, depth, text length, and total
serialized size. Agents can request a subtree through an existing ref when a
full page is too large.

### `browser_interact`

Purpose: perform the common trusted desktop actions required to develop and
verify the current app.

The tool accepts a bounded `steps` array. The initial action families are:

- pointer: click, double-click, hover, move, press/release, and wheel;
- text: fill, type, clear, and key press;
- controls: check/uncheck and select option;
- gesture: scroll and drag;
- wait/assert: element state, text, application path, load state, or bounded
  network-idle condition.

Targets are expressed through:

- snapshot ref, preferred;
- compact semantic locator using role/name or test ID;
- viewport or canvas-relative coordinates for canvas and WebGL applications.

Common interaction does not support arbitrary `goto`, external origins,
back/forward traversal, cookies, network route handlers, permissions, or raw
JavaScript evaluation. Application-driven same-origin path changes are allowed
and can be awaited or asserted.

Batch rules:

- Maximum initial batch length: 10 steps.
- One timeout budget for the batch plus bounded per-step overrides. Cap both
  at 12 seconds and derive the effective budget from the remaining active host
  command time, reserving time to restore the previous workspace view before
  the 27-second active-command deadline. The six browser host operations use a
  60-second transport budget; queue waiting has its own 15-second retryable
  deadline and never tears down the browser.
- Resolve refs lazily immediately before the step that uses them.
- On failure, stop the batch and return:
  - failed step index;
  - action-specific validation or Playwright actionability cause;
  - whether retrying with a new snapshot is appropriate;
  - a bounded fresh snapshot near the failed target when possible;
  - an automatic application screenshot;
  - completed-step results.
- Validate the selected action with action-specific code. Do not rely on one
  enormous JSON Schema `oneOf` whose errors cannot identify the invalid field.

### `browser_profile`

Purpose: correlate current-app activity with bounded desktop-browser
performance evidence.

The tool uses one stateful contract:

- `action: start`
- `action: stop`
- `action: status`

Initial profile modes:

1. `interaction`
   - mark each `browser_interact` step;
   - collect frame intervals, long tasks where supported, event timing, JS heap
     metrics, and relevant browser performance entries;
   - summarize only measurements with a clear and implemented definition.

2. `rendering`
   - collect bounded rAF/frame-time statistics and renderer environment;
   - reuse the existing uncalibrated host-browser measurement language;
   - report GPU vendor/renderer and whether SwiftShader is active.

3. `trace`
   - optional raw Playwright/CDP trace artifact for expert analysis;
   - store the artifact under a bounded workspace-owned path;
   - return hashes, size, duration, environment, and path;
   - do not claim to summarize raw trace events until a real trace processor is
     selected and validated.

Do not expose a generic `web-vitals` preset for the workspace-framed WebGL
runtime. LCP, CLS, and INP semantics are not reliably representative there.

Profiles must:

- auto-stop after a configured maximum duration;
- record reload, HMR, navigation, visibility, and browser-relaunch events;
- report interruptions rather than silently dropping them;
- stop safely when the browser closes;
- return `calibrated: false` and `targetDevice: null` for desktop host data.

## Shared Command Coordination

All browser operations, including the three existing tools, use one managed
browser command coordinator.

The coordinator provides:

- a per-application mutation mutex;
- serialized view switching and restoration;
- profile lifecycle ownership;
- stale application identity checks;
- cancellation on browser relaunch or shutdown;
- bounded command and artifact budgets;
- structured trace events for command start, step completion, and failure.

Read-only snapshot and log queries may run concurrently only when they cannot
race with view switching or profile state. Screenshot is not treated as purely
read-only because it may switch the visible workspace view.

## Security Requirements

### Managed Access Header Scoping

The existing Playwright context route injects the managed workspace access
header for protected paths on the managed origin. Before adding richer
automation, header injection must also validate the request initiator/frame.

Required behavior:

- Protected requests initiated by the managed workspace or application frame
  can receive the header when intended.
- A third-party frame or page cannot navigate or fetch the managed origin and
  receive the privileged header merely because the destination pathname is
  protected.
- Host-issued top-level managed workspace navigation has an explicit trusted
  path separate from renderer-initiated navigation.
- Tests cover cross-origin simple POST, preflighted requests, redirects, nested
  frames, and top-level navigation.
- The test matrix distinguishes top-level, same-origin child, cross-origin
  child, `about:blank`/`srcdoc` descendants, opaque-origin frames, redirects,
  and requests without an associated frame. An initial top-level
  `about:blank` is trusted only through the explicit host-navigation path; it is
  never a blanket trusted initiator.

### Input And Output Bounds

- Reject artifact paths outside the workspace artifact root.
- Reject absolute paths and traversal.
- Bound screenshot dimensions, snapshot size, batch length, serialized console
  arguments, profile duration, raw trace size, and returned JSON.
- Do not return raw trace bytes through MCP.
- Redact managed access tokens and internal endpoints from logs and artifacts.

## Full Playwright Escape Hatch

### Product Shape

Long-tail Playwright capability is provided through an explicit CLI workflow,
not an MCP tool:

```bash
npx @iwsdk/cli dev up --allow-browser-automation
# Or, for an already-running session:
npx @iwsdk/cli dev restart --allow-browser-automation
npx @iwsdk/cli browser run ./scripts/diagnose.mjs
```

The proposed runner attaches to the existing managed Chromium instance and
resolves the same current application page/frame. The script can use normal
Playwright and CDP APIs for cases intentionally omitted from the common tools,
including:

- advanced network interception and HAR workflows;
- cookies, storage, permissions, and offline state;
- viewport and CDP emulation;
- file chooser and download workflows;
- unusual waits or locators;
- raw JavaScript evaluation;
- advanced performance and memory capture;
- application-specific multi-page or navigation debugging.

This is a local arbitrary-code capability equivalent to running a workspace
script from the shell. It is not described as a sandbox. It requires explicit
user opt-in when the dev server starts and is not advertised in MCP `tools/list`.
Enabling it also grants any local process that can reach the loopback CDP endpoint
browser-level authority for that dev session, including page contents, storage,
cookies, network controls, and arbitrary script execution in the managed page.
Documentation must state that security boundary plainly. IWSDK blocks common
accidental lifecycle calls, but does not claim to sandbox a malicious workspace
script or another local process.

### Connection Feasibility

A local feasibility probe demonstrated that Playwright 1.58.2 APIs can attach
over CDP to a Chromium browser launched through `launchPersistentContext` with
a loopback remote-debugging port. The attached client saw the existing context
and page, performed a trusted click observed by the owner connection, and
created a CDP session.

Production work must still prove:

- pinned Playwright browser-revision compatibility;
- headed app-mode behavior;
- headless behavior;
- behavior when the runner exits unexpectedly;
- collision behavior between owner and attached clients;
- compatibility with the existing `context.route()` handler;
- lifecycle protection against accidental page/context/browser close;
- endpoint discovery and permission behavior across supported agent harnesses.

Do not print or persist an attach endpoint unless browser automation was
explicitly enabled. Prefer an `iwsdk browser run` command that resolves the
active session and connection internally over requiring agents to manipulate a
raw endpoint.

## Implementation Phases

## Phase 0: Prerequisites And Contract Repair

### Goal

Remove security and concurrency hazards before adding new browser authority.

### Tasks

- Scope managed access-header injection by trusted initiator/frame.
- Add application-surface identity and frame resolution shared with relay role
  semantics.
- Extract the current runtime-view switch, readiness, settle, and restoration
  behavior into the resolver/coordinator.
- Add the command coordinator and apply it to screenshot, logs, and reload.
- Capture request failures, dialogs, downloads, popups, frame navigation, and
  browser navigation as bounded diagnostic events.
- Fix the screenshot documentation and current tool-count drift.
- Add telemetry fields for managed browser command, application identity,
  duration, outcome, and relaunch.

### Acceptance Criteria

- Cross-origin content cannot receive a managed workspace access header.
- Concurrent screenshot/reload operations cannot corrupt the visible view.
- Existing browser commands preserve auto-relaunch behavior.
- Browser documentation matches the installed schema.

## Phase 1: Application Snapshot And Trusted Interaction

### Goal

Allow agents to discover and operate ordinary current-app 2D controls and
canvas input without a second browser.

### Tasks

- Implement bounded accessibility-first application snapshots.
- Implement lazy ref recipes and semantic fingerprints.
- Implement the initial interaction action families.
- Add coordinate input relative to the app viewport and named canvas bounds.
- Add application path and element-state waits.
- Return step-specific failures, nearby snapshots, and screenshots.
- Ensure the runtime view remains active for the full interaction batch.

### Testing

- Browser-first example:
  - click DOM controls;
  - click and drag on the canvas;
  - verify canvas input is not blocked outside DOM controls.
- React/Preact 2D UI fixture:
  - fill and submit a form;
  - operate a range/select/checkbox control;
  - verify keyboard focus and Enter/Escape behavior;
  - trigger an application-driven route/path change and await it.
- Rerender fixture:
  - ref re-resolves after an equivalent rerender;
  - detached or ambiguous ref returns a retryable error.
- Collaborate mode:
  - interaction visibly switches to runtime;
  - the batch is not interrupted by screenshot or reload;
  - prior view restoration is deterministic.

### Acceptance Criteria

- The reference 2D workflows complete entirely in the managed browser.
- No test starts a second Playwright browser.
- Common failures identify the exact step and recovery action.

## Phase 2: Desktop Performance Profiles

### Goal

Provide useful interaction and rendering diagnostics without overstating host
measurements.

### Tasks

- Add stateful profile start/stop/status handling to the coordinator.
- Add interaction step markers.
- Collect bounded frame intervals, long tasks, event timing, and CDP
  `Performance` metrics where supported.
- Reuse current renderer-environment and uncalibrated classification fields.
- Add optional Playwright/raw CDP trace artifact output.
- Record HMR, reload, visibility, and relaunch events in profile results.

### Acceptance Criteria

- An agent can start a profile, interact with the app, stop the profile, and
  receive correlated markers and bounded measurements.
- SwiftShader results are clearly identified.
- Raw trace artifacts remain file-backed and bounded.
- No field claims calibrated device performance.

## Phase 3: Opt-In Same-Session Playwright Runner

### Goal

Provide complete long-tail browser access without expanding the default MCP
surface.

### Tasks

- Add explicit `--allow-browser-automation` dev-server configuration.
- Add safe session metadata for resolving the enabled local connection.
- Implement `iwsdk browser run <script>` using the project's installed
  Playwright version.
- Pass the resolved current application page/frame and CDP access to the
  script.
- Document ownership rules and dangerous lifecycle operations.
- Ensure runner exit does not terminate or orphan the managed browser.

### Acceptance Criteria

- The runner observes and changes the same page/context as managed MCP tools.
- A trusted click from the runner is visible through the owner connection.
- Advanced network, storage, and CDP examples run without launching another
  Chromium process.
- The capability is unavailable unless explicitly enabled.

## Validation Matrix

Validate every phase in both managed modes:

| Scenario                    | Agent/headless | Collaborate/headed |
| --------------------------- | -------------- | ------------------ |
| App is top-level            | Required       | Required           |
| App is workspace iframe     | Required       | Required           |
| IWER enabled                | Required       | Required           |
| Browser-first/IWER disabled | Required       | Required           |
| Hardware GPU                | When available | When available     |
| SwiftShader                 | Required       | Required           |
| HMR during command          | Required       | Required           |
| Full reload during command  | Required       | Required           |
| Browser relaunch recovery   | Required       | Required           |

## Metrics

Track:

- success and failure count by browser tool and action family;
- duration and retry count;
- stale-ref and actionability failure rate;
- number of steps per interaction batch;
- snapshot size and truncation rate;
- profile duration, artifact size, and interruption rate;
- browser relaunch frequency during browser commands;
- tool schema byte/token growth;
- use of the CLI Playwright runner.

The exact rate of agents launching an unrelated second browser is not directly
observable from MCP. A possible heuristic is to count app requests from
unmanaged HeadlessChrome clients that lack the managed-page marker, with clear
acknowledgement that this can produce false positives.

## Rejected Alternatives

### One MCP Tool Per Playwright Action

Rejected because it creates a large and ambiguous browser tool vocabulary,
duplicates normal Playwright APIs, and increases tool-selection errors.

### Page-Only JavaScript Evaluation As The Escape Hatch

Rejected because DOM `.click()` is not trusted desktop input and page
evaluation cannot provide Playwright actionability, browser-context state,
downloads, network interception, or full trace control.

### Arbitrary Playwright Code In An MCP Tool

Rejected for the default surface because it overlaps common tools, invites
overuse, carries privileged-page and lifecycle risks, and makes arbitrary code
execution available to every MCP client. The explicit local CLI runner provides
the capability with clearer user intent.

### Generic Navigation Tools

Rejected from the common surface because the product goal is developing the
current application, not browsing arbitrary sites. Application-driven route
changes remain observable and waitable. Advanced navigation remains available
through the opt-in runner.

### Generic Browser Context MCP Tool

Rejected initially because most context mutation is long-tail for current-app
development, several device properties require context recreation, and the
surface would overlap heavily with the advanced runner. Add a narrow common
capability later only if telemetry shows repeated runner usage for one safe,
well-defined setting.

## Completion Criteria

This plan is complete when:

- Agents can discover and operate current-app 2D DOM and canvas controls in the
  managed browser.
- Agents can capture bounded interaction/rendering performance evidence from
  that same session.
- Common browser development no longer requires a second Playwright browser.
- Advanced Playwright/CDP workflows can attach to the same browser through an
  explicit CLI capability.
- The default MCP browser surface contains six tools and no arbitrary-code or
  arbitrary-navigation tool.
- Browser commands remain safe under concurrent MCP clients, HMR, reload, and
  browser relaunch.
- Managed access tokens cannot be conferred on requests initiated by untrusted
  pages or frames.
- Documentation, CLI help, MCP schemas, and tests describe the same installed
  behavior.

## Closely Related Follow-up

The [canonical React and Preact integration plan](./iwsdk-react-preact-integration-plan.md)
is the next flat-surface application-development step. It remains planning-only
and is intentionally not implemented by this managed-browser work.
