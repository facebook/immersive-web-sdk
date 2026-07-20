# IWSDK Managed Workspace Scene Editor Plan

Status: implementation plan
Last updated: 2026-07-03
Owner surface: `immersive-web-sdk`
Primary objective: replace the fragile two-tab app/editor workflow with one
managed IWSDK workspace that owns runtime/editor view switching, scene-file
selection, and deterministic agent routing.

## Executive Summary

The current native scene editor direction is correct, but the current user flow
still exposes fragile implementation details:

- The editor URL is long and scene-path dependent.
- The agent and human can end up reasoning about separate browser tabs.
- Active-tab or foreground/background state is too easy to make implicit.
- A normal developer browser can accidentally enter the heavy editor surface.
- If the editor is allowed in both managed Playwright and normal browsers, the
  same scene file can have multiple independent writers.

The stronger product model is a single managed workspace:

- The managed Playwright browser opens a stable workspace URL, for example
  `/__iwsdk/workspace`.
- Runtime, editor, and split view are internal workspace views, not separate
  tabs users or agents have to coordinate.
- Editor mode exists only in the managed workspace browser.
- Normal browsers remain runtime/app browsers. If a normal browser opens the
  workspace/editor URL, it redirects to the runtime app.
- Scene tools route by semantic target, not by the currently active tab.
- Human and agent can switch workspace views explicitly. Agent tools may
  auto-switch the visible workspace view as UI polish, but correctness never
  depends on current view.
- Opening editor mode without a scene path shows a scene picker/create dialog.
  In autonomous/headless mode, the equivalent is an explicit scene file tool
  contract.

This plan assumes the existing native editor route, scene session, WebGL
viewport, and `scene_*` tools continue to be reused internally. The public
contract changes from "open a long editor URL in a tab" to "open or target the
managed workspace".

## Product Decisions

### Finalized Direction

- The scene editor is a managed-workspace feature, not a normal-browser feature.
- A developer's own browser remains the runtime app browser. If it opens a
  workspace/editor URL, it is redirected to the runtime app.
- The managed Playwright browser is the only browser that can mount the editor
  UI and write scene files through the native scene editor.
- Runtime, editor, and split view share one stable managed workspace page. The
  current view is workspace state controlled by UI and tools, not by fragile
  browser-tab foreground state.
- Opening editor view without a scene target opens a scene picker/create flow.
  Autonomous agents use equivalent file tools and never depend on a human-only
  modal.
- We intentionally do not support simultaneous editor writes from a managed
  Playwright browser and an unmanaged developer browser. This avoids file
  conflict semantics that are not useful for the first product version.

### Supported Browser Roles

1. Normal browser
   - Always runtime/app oriented.
   - DevUI remains available for manual runtime interaction.
   - Does not mount the scene editor.
   - Opening `/__iwsdk/workspace` or legacy `/__iwsdk/editor?...` redirects to
     the app/runtime URL.

2. Managed Playwright browser
   - Owns the workspace.
   - Can show runtime, editor, or split view.
   - Is the only browser allowed to mutate scene files through the native scene
     editor.
   - Can be headless for autonomous agents or headed for human oversight and
     collaboration.

3. Agent
   - Talks to the managed workspace through MCP/CLI tools.
   - Does not depend on active browser tab state.
   - Uses `scene_*` tools for editor/session operations.
   - Uses `xr_*`, ECS, and runtime scene tools for app/runtime operations.

### Stable Scene File Convention

Scene files live under:

```text
public/scenes/*.iwsdk.scene.json
```

Nested folders under `public/scenes/` may be supported, but all create/browse
flows must prevent escaping the project root and must reject paths outside
`public/scenes/`.

### Workspace Views

The workspace supports:

- `runtime`: app/runtime view only.
- `editor`: native scene editor view only.
- `split`: runtime and editor visible together.

The view is workspace state. It is visible in the UI, queryable via tools, and
changeable by human or agent. It is not a hidden CLI-only global.

### Auto-Switching

Auto-switching is allowed only as a convenience:

- `scene_*` tools may switch the workspace view to `editor`.
- `xr_*` and ECS tools may switch the workspace view to `runtime`.
- `browser_screenshot({ target: "editor" })` may switch or capture editor.
- `browser_screenshot({ target: "runtime" })` may switch or capture runtime.

Tool routing must still be explicit by semantic target. The active view must not
decide which session receives a command.

## Target User Journeys

### Manual Developer Editor Journey

1. Developer starts the dev server with a managed workspace enabled. For the
   first slice this can be `ai.mode = "collaborate"`; the long-term product
   should allow a workspace-only launch that does not imply an AI agent.
2. The normal browser opens the runtime app as usual.
3. The managed Playwright browser opens `/__iwsdk/workspace`.
4. Developer switches workspace view to `editor`.
5. If no scene is selected, the scene dialog opens:
   - Recent scene files.
   - Browse `public/scenes/`.
   - Create a new scene.
6. Developer edits in the 3D editor.
7. Developer saves. The server writes the selected scene JSON file.
8. Developer switches to runtime or reloads the app to verify.

### Semi-Manual Watched-Agent Journey

1. Developer starts the dev server with `ai.mode = "oversight"` or
   `ai.mode = "collaborate"`.
2. Managed Playwright workspace is visible.
3. Agent calls workspace/scene tools to open a scene and switch to editor view.
4. Developer watches the editor scene graph, viewport, gizmo, inspector, and
   save state update live.
5. In collaborate mode, the developer can interact with the managed browser
   directly between agent actions.
6. Agent uses runtime view and screenshots to verify the saved app result.

### Autonomous Agent Journey

1. Developer starts dev server with default `ai.mode = "agent"` or equivalent.
2. Managed Playwright workspace runs headlessly.
3. Agent calls `workspace_get_state`.
4. Agent opens an existing scene or creates one via tools. It must not depend on
   a modal requiring human input.
5. Agent uses `scene_*` tools to compose the scene in the editor session.
6. Agent captures multiple editor screenshots.
7. Agent saves the scene.
8. Agent verifies the app/runtime path with runtime-targeted screenshots and
   console checks.

## Phase 1: Managed Workspace Route And Browser Gating

### Goal

Introduce a stable managed workspace route and prevent normal browsers from
mounting the editor/workspace surface.

### Implementation Tasks

- Add `WORKSPACE_ROUTE = "/__iwsdk/workspace"` to `@iwsdk/vite-plugin-dev`.
- Generate a per-dev-server workspace access token/nonce.
- Launch the managed Playwright browser to the workspace route with proof that
  it is managed. Acceptable mechanisms:
  - Playwright context cookie set before navigation.
  - Extra HTTP header on managed context.
  - Token query used only for first navigation, then stored in an httpOnly or
    same-site dev cookie.
- Middleware behavior:
  - Managed request to `/__iwsdk/workspace` returns workspace shell HTML.
  - Unmanaged request to `/__iwsdk/workspace` redirects to app root.
  - Unmanaged request to legacy `/__iwsdk/editor` redirects to app root.
  - Managed request to legacy `/__iwsdk/editor` redirects to
    `/__iwsdk/workspace` and preserves any scene target for migration.
- Keep the old editor implementation available internally while the workspace
  shell is being built.
- Update runtime session metadata to mark the managed workspace page as
  `role: "workspace"` or equivalent, while preserving `app` and `editor`
  sub-target roles internally.

### Testing Plan

- Unit test route middleware:
  - Managed workspace token returns workspace shell.
  - Missing/invalid token redirects to `/`.
  - Legacy editor route redirects correctly.
  - Scene query is preserved only for managed migration path.
- E2E test with Playwright-managed launch:
  - Managed browser reaches workspace shell.
  - Normal browser opening `/__iwsdk/workspace` lands on runtime app.
- Security/path test:
  - Workspace token is not accepted for arbitrary project file access.

### Acceptance Criteria

- Agents and managed browser no longer need to navigate to
  `/__iwsdk/editor?scene=...`.
- Normal browser never loads the editor UI.
- Existing runtime app URL behavior is unchanged.
- Tests prove route gating for both managed and unmanaged clients.

## Phase 2: Single Workspace Shell With Runtime, Editor, And Split Views

### Goal

Replace tab switching with a single page workspace that owns view state.

### Implementation Tasks

- Build the workspace shell at `/__iwsdk/workspace`.
- Add a visible view switcher:
  - Runtime
  - Editor
  - Split
- Implement a workspace state model:
  - `view`
  - `scenePath`
  - `sceneSessionId`
  - runtime readiness
  - editor readiness
  - dirty/save state
  - selected node ids
- Decide the internal layout:
  - Preferred first implementation: one workspace page with an app/runtime
    iframe and an editor panel/runtime mounted in the same top-level workspace.
  - If iframes create WebGL/input issues, keep one top-level workspace document
    and mount/unmount runtime/editor panes without creating browser tabs.
- Keep runtime and editor state alive when switching views where feasible.
- Add split view where runtime and editor are visible simultaneously.
- Make current view visible and queryable; do not store it only inside CLI.

### Testing Plan

- Unit test workspace state reducer/session model.
- E2E tests:
  - Workspace opens in runtime view by default.
  - Switching runtime -> editor -> runtime does not create new browser tabs.
  - Split view renders both surfaces.
  - Current view is visible in DOM and exposed in workspace state.
  - Runtime app remains reachable from normal browser.
- Regression test:
  - Existing editor WebGL proof still passes inside workspace editor view.

### Acceptance Criteria

- There is exactly one managed workspace page for the primary workflow.
- Switching views does not depend on browser foreground/background tab state.
- Agents can query and set workspace view through a stable API.
- Human-visible UI always shows which view is active.

## Phase 3: Scene File Discovery, Selection Dialog, And Create Flow

### Goal

Make editor mode usable without a fragile scene URL by introducing first-class
scene file selection and creation.

### Implementation Tasks

- Add server endpoints or MCP-backed handlers:
  - List scene files under `public/scenes/`.
  - Read scene metadata/recent files.
  - Create a new scene file.
  - Validate scene file paths.
- Define create-new scene seed:

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "assets": [],
  "nodes": []
}
```

- Add editor scene dialog when entering editor view with no `scenePath`:
  - Recent scene files.
  - Browse project scene files.
  - Create new scene.
  - Empty state explaining `public/scenes/`.
- Add deterministic headless equivalents:
  - `scene_list_files`
  - `scene_open`
  - `scene_create`
- Add path policy:
  - Accept relative paths under `public/scenes/`.
  - Reject `..`, absolute paths, symlinks escaping root, and non-scene suffixes.
- Add recent scene tracking in dev session state.

### Testing Plan

- Unit tests for path validation:
  - Accept `public/scenes/main.iwsdk.scene.json`.
  - Accept nested scene paths if supported.
  - Reject `../outside.json`.
  - Reject absolute paths.
  - Reject wrong suffix.
- Unit tests for create scene:
  - Creates parent directories under `public/scenes/` if allowed.
  - Refuses overwrite unless explicit.
  - Writes canonical JSON formatting.
- E2E tests:
  - Entering editor view with no scene shows dialog.
  - Selecting an existing scene opens editor.
  - Creating a new scene opens editor and writes the file.
  - Headless `scene_create` and `scene_open` do not require modal interaction.

### Acceptance Criteria

- No developer or agent needs to manually construct a long editor URL.
- Editor no-scene state is an intentional modal, not a blank or failing editor.
- Autonomous agents have non-visual tools for the same file selection/create
  flow.
- All scene writes are confined to `public/scenes/`.

## Phase 4: Editor Session Lifecycle Inside Managed Workspace

### Goal

Move the existing native scene editor session into the workspace as the only
write-capable scene editing surface.

### Implementation Tasks

- Rehost current `SceneEditorSession` under workspace state.
- Replace route-level `?scene=` as the primary scene selector with workspace
  `scenePath`.
- Keep a stable `sceneSessionId` for the selected file.
- Ensure editor tools and human editor UI share the same session:
  - history
  - selection
  - dirty state
  - validation
  - save path
  - camera state
- Ensure scene changes update the runtime preview/app verification path:
  - save scene JSON
  - reload runtime target
  - or push `world.loadSceneDocument` where appropriate for preview.
- Treat editor session as single-writer because only managed workspace can load
  it.
- Remove any normal-browser editor document write path.

### Testing Plan

- Unit tests:
  - `SceneEditorSession` remains independent of DOM.
  - Workspace session creates one editor session per opened scene file.
  - Opening another scene clears/replaces prior editor state intentionally.
- E2E tests:
  - Human edit through editor UI changes same session that `scene_get_document`
    returns.
  - Agent patch changes same UI state visible in editor.
  - Save writes the selected scene file.
  - Reload runtime app reflects saved scene.
- Regression tests:
  - Existing scene editor tests for transform gizmo, outliner, components,
    metadata, validation, and screenshots pass under workspace route.

### Acceptance Criteria

- There is one authoritative scene session for the selected scene file.
- Editor UI and `scene_*` tools never diverge.
- Normal browser cannot become a second writer.
- Save/reload round trip works from managed workspace.

## Phase 5: Explicit MCP Target Routing And Workspace Tools

### Goal

Remove active-tab assumptions from tools and make runtime/editor routing
semantic.

### Implementation Tasks

- Add workspace tools:
  - `workspace_get_state`
  - `workspace_set_view`
  - `workspace_open_scene`
  - `workspace_close_scene` if needed
- Add or formalize scene file tools:
  - `scene_list_files`
  - `scene_open`
  - `scene_create`
- Update `browser_screenshot` and browser tools to accept explicit target:
  - `target: "runtime" | "editor" | "workspace"`
  - Default target should be deterministic and documented. Prefer requiring a
    target once the workspace ships, with a compatibility default only during
    migration.
- Route tool categories:
  - `scene_*` composition tools target editor session.
  - `xr_*` tools target runtime session.
  - ECS tools target runtime session.
  - `browser_*` tools require or infer an explicit target.
- Make auto-switch view behavior internal:
  - `scene_*` can switch visible view to editor.
  - runtime tools can switch visible view to runtime.
  - auto-switch failures must not change command routing.
- Update CLI canonical runtime contract and MCP parity tests.
- Update relay metadata:
  - workspace page id
  - workspace generation
  - runtime sub-target id
  - editor sub-target id
  - scene session id

### Testing Plan

- Unit tests:
  - Tool contract includes workspace and scene file tools.
  - CLI mappings stay canonical.
  - Relay routes editor-targeted requests only to editor session.
  - Relay routes runtime-targeted requests only to runtime session.
  - Unknown/ambiguous targets fail with actionable errors.
- E2E tests:
  - `scene_screenshot` captures editor viewport even when runtime view is
    currently visible.
  - runtime screenshot captures runtime view even after editor tools ran.
  - `workspace_set_view` changes visible UI without changing tool routing.
  - No test depends on Playwright active tab switching.
- Hygiene:
  - Run `pnpm test:canonical-mcp-surface`.
  - Run `pnpm test:mcp-parity`.

### Acceptance Criteria

- Agents never need to switch browser tabs.
- Agents never depend on whichever page is foregrounded.
- Every tool has a deterministic target.
- Existing scene tools continue to work through the workspace target.

## Phase 6: Managed Workspace Launch Modes

### Goal

Make the managed workspace available for agent, watched-agent, and manual-editor
flows without implying that the human must use a normal browser for editor work.

### Implementation Tasks

- Keep current AI modes:
  - `agent`: managed workspace headless.
  - `oversight`: managed workspace headed, DevUI off.
  - `collaborate`: managed workspace headed, DevUI or relevant manual controls
    on.
- Add a workspace-only launch option if product scope allows:

```ts
iwsdkDev({
  workspace: { enabled: true, open: true },
});
```

or equivalent CLI command:

```bash
iwsdk workspace open
```

- Ensure `ai` implies workspace, but workspace does not necessarily imply an
  active agent.
- In normal browser runtime DevUI, optionally show a small "Open managed
  workspace" affordance that triggers the CLI/managed browser path when
  available. It must not mount editor UI in the normal browser.
- Document recommended usage:
  - Manual editor: managed workspace headed.
  - Watched agent: oversight/collaborate.
  - Autonomous: agent/headless.

### Testing Plan

- Unit tests for option normalization:
  - `ai.mode = agent` creates headless workspace config.
  - `ai.mode = oversight` creates headed workspace config.
  - `ai.mode = collaborate` creates headed shared workspace config.
  - workspace-only config launches workspace without AI tool assumptions.
- E2E tests:
  - Agent mode starts headless workspace.
  - Oversight/collaborate start visible workspace and suppress duplicate
    `server.open` runtime browser where intended.
  - Normal browser app still opens/works when configured.
- Docs test:
  - AI modes and native editor docs agree on which browser owns editor mode.

### Acceptance Criteria

- Manual editor use does not require a normal browser editor route.
- Autonomous agent use still works headlessly.
- Watched/collaborative use has one visible managed workspace.
- Configuration makes the browser ownership model clear.

## Phase 7: Normal-Browser And Legacy Route Behavior

### Goal

Make accidental normal-browser editor entry harmless and backwards-compatible.

### Implementation Tasks

- For unmanaged clients:
  - `/__iwsdk/workspace` redirects to `/`.
  - `/__iwsdk/editor` redirects to `/`.
  - Optionally include a short-lived query/status flag so the app/DevUI can show
    a non-blocking message: "The scene editor runs in the managed IWSDK
    workspace."
- For managed clients:
  - `/__iwsdk/editor?scene=...` redirects to
    `/__iwsdk/workspace` and opens the scene.
- Update all generated docs, prompts, and test fixtures away from direct editor
  URL usage.
- Keep compatibility only for one release window if desired; after that,
  remove direct editor route as public surface.

### Testing Plan

- Route tests for managed and unmanaged clients.
- E2E tests:
  - Normal browser opening legacy editor route lands on app.
  - Managed browser opening legacy editor route lands on workspace editor view.
- Docs/static checks:
  - No docs tell users to manually open long editor scene URLs.
  - Agent guidance uses workspace/scene tools.

### Acceptance Criteria

- Normal browser users get the runtime app, which matches expectation.
- Existing old links do not hard fail during migration.
- Long editor URLs are no longer part of the recommended workflow.

## Phase 8: Single-Writer Policy, Conflict Prevention, And Recovery

### Goal

Prevent split-brain scene editing and make recovery behavior explicit when scene
files change on disk outside the managed workspace.

### Implementation Tasks

- Treat the managed workspace editor session as the only write-capable in-app
  editor session.
- Keep normal-browser access runtime-only; do not add a hidden escape hatch that
  mounts editor UI outside the managed workspace.
- Track the opened scene file's last-read revision:
  - filesystem mtime and size at minimum
  - content hash if the implementation already has cheap document hashing
- Before save, compare the current disk revision to the last-read revision.
- If the file changed externally:
  - block blind overwrite by default
  - show a managed-workspace conflict dialog for human flows
  - return a structured conflict error for agent/headless flows
  - offer reload-from-disk and force-save only if product explicitly accepts
    those behaviors
- Add save result metadata:
  - `scenePath`
  - `sceneSessionId`
  - previous revision
  - written revision
  - dirty state after save
- Make generated scene-create/open APIs return the same revision metadata.
- Document that external editor changes are supported as file changes, not as a
  second live scene-editor session.

### Testing Plan

- Unit tests:
  - Save succeeds when disk revision matches last-read revision.
  - Save fails with a structured conflict when the file changed externally.
  - Reload-from-disk updates the session revision and clears the conflict.
  - Force-save, if implemented, requires an explicit flag and updates revision
    metadata.
- E2E tests:
  - Managed workspace opens a scene, an external process edits the file, and the
    next UI save shows a conflict instead of overwriting.
  - Headless `scene_save` or equivalent returns a conflict error with the scene
    path and revision data.
  - Normal browser cannot create a second editor session that bypasses the
    conflict policy.
- Regression tests:
  - Ordinary save/reload runtime parity still passes when no conflict exists.

### Acceptance Criteria

- There is one live writer for scene-editor changes.
- External file changes are detected before overwrite.
- Human and autonomous flows receive actionable conflict feedback.
- Normal-browser runtime use can never become a second editor writer.

## Phase 9: Evidence, Release Gates, And Cleanup

### Goal

Make the new workspace flow release-grade and prevent regressions.

### Implementation Tasks

- Update evidence scripts to capture:
  - managed workspace runtime view
  - managed workspace editor view
  - split view
  - scene selection dialog
  - create-new-scene flow
  - scene save/reload runtime parity
  - normal-browser redirect behavior
  - autonomous headless scene composition
- Update release rehearsal to include workspace gates.
- Update docs:
  - Native Scene Editor guide.
  - AI Modes guide.
  - MCP Tools guide.
  - Migration guide if legacy editor route changes.
- Remove or de-emphasize direct `/__iwsdk/editor?scene=...` references.
- Confirm the deprecated external editor removal plan still points to the
  managed workspace editor as the replacement.

### Testing Plan

- Automated tests:
  - `pnpm test:canonical-mcp-surface`
  - `pnpm test:mcp-parity`
  - `pnpm --filter @iwsdk/vite-plugin-dev test`
  - targeted workspace E2E suite
  - native scene editor evidence check
  - native scene examples runtime/editor checks
- Browser evidence:
  - Screenshots for runtime/editor/split/scene picker/create flow.
  - Proof JSON showing page roles, target routing, scene session id, and save
    path.
- Manual smoke:
  - Developer can start headed managed workspace, create a scene, edit, save,
    reload runtime app, and inspect output without ever opening editor in a
    normal browser.

### Acceptance Criteria

- Release rehearsal includes managed workspace proof.
- Docs describe the new user journeys accurately.
- Automated tests prove normal-browser editor access is disabled.
- Automated tests prove managed workspace editor access works in headed and
  headless modes.
- No critical flow depends on tab switching.

## Tool Contract Sketch

This is the intended shape; exact naming can be refined during implementation.

```ts
workspace_get_state(): {
  view: 'runtime' | 'editor' | 'split';
  managed: true;
  runtime: { ready: boolean; pageId: string };
  editor: {
    ready: boolean;
    scenePath?: string;
    sceneSessionId?: string;
    dirty?: boolean;
  };
}

workspace_set_view({
  view: 'runtime' | 'editor' | 'split'
}): WorkspaceState

scene_list_files({
  root?: 'public/scenes',
  query?: string
}): { files: Array<{ path: string; modifiedAt?: string }> }

scene_open({
  path: 'public/scenes/main.iwsdk.scene.json'
}): { scenePath: string; sceneSessionId: string; document: SceneDocument }

scene_create({
  path: 'public/scenes/new-scene.iwsdk.scene.json',
  overwrite?: false
}): { scenePath: string; sceneSessionId: string; document: SceneDocument }

browser_screenshot({
  target: 'runtime' | 'editor' | 'workspace'
}): BrowserScreenshotResult
```

## Open Design Questions

1. Should workspace-only launch be a first-class config now, or should the first
   implementation require `ai.mode = "collaborate"` for manual editor use?
2. Should split view keep two live WebGL renderers, or pause one pane when it is
   not being interacted with?
3. Should runtime verification reload the app iframe/page, call
   `world.loadSceneDocument`, or support both?
4. Should old `/__iwsdk/editor` stay as managed-only redirect for one release or
   be removed immediately once workspace ships?
5. Should `browser_screenshot` require `target` immediately, or keep a
   compatibility default during migration?

Recommended defaults for the first implementation:

- Keep legacy `/__iwsdk/editor` as a managed-only redirect for one release.
- Keep a compatibility default for `browser_screenshot`, but update all first
  party docs/prompts/tests to pass an explicit target.
- Implement split view with two live panes first; add renderer pausing only if
  perf data says it is needed.
- Runtime verification should support reload first because it proves the saved
  scene file path works end-to-end. Direct in-memory preview can be added later
  as an editor convenience.

## Recommended First Slice

The smallest high-value slice is:

1. Add `/__iwsdk/workspace` and managed-browser gating.
2. Mount the existing editor inside workspace editor view.
3. Redirect normal-browser workspace/editor URLs to runtime app.
4. Add `workspace_get_state`, `workspace_set_view`, and `scene_open`.
5. Add scene picker/create dialog for editor-without-scene.
6. Update `scene_*` tools to target workspace editor session.
7. Add scene save revision checks so external file changes cannot be silently
   overwritten.
8. Add E2E tests proving no tab switching is required.

This slice removes the fragile public workflow while reusing most of the editor
implementation already built.
