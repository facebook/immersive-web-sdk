# Canonical React and Preact Integration for IWSDK

Status: proposed

## Executive summary

IWSDK should provide an official, optional React and Preact integration for browser DOM UI without transferring ownership of the 3D scene, ECS, WebXR session, renderer, or frame loop to either UI framework.

The canonical model is:

```text
React or Preact DOM UI
        | typed intent commands
        v
IWSDK bridge system -> ECS -> Three.js -> WebXR
        ^
        | immutable, low-frequency signal snapshots
        +------------------------------------------
```

Existing IWSDK applications must continue to use `World.create(container, projectOptions)` with continuous rendering and no React or Preact dependency. Framework support is additive and ships in separate packages.

The work is divided into four layers:

1. Harden the core world lifecycle and embedding contract.
2. Introduce a framework-neutral world host used by thin React and Preact adapters.
3. Ship one canonical application pattern, starter variants, examples, documentation, and browser tests.
4. Add broader reactive ECS hooks and optional demand rendering only after their core contracts are defined.

## Findings from the current implementation

### Scene Composer

The current Scene Composer demonstrates a useful but specialized architecture:

- Its workspace shell is implemented with Preact and `@preact/signals-core`.
- It mounts one immutable workspace snapshot signal into Preact and replaces the snapshot when state changes.
- It remains a hybrid UI: several inspector, dialog, contribution, and editor surfaces still use imperative DOM construction and event listeners.
- The workspace has two distinct 3D surfaces. The application runtime runs in an iframe, while the editor owns a separate IWSDK world.
- The editor world is created with XR and expensive runtime features disabled.
- After creation, the editor calls `world.renderer.setAnimationLoop(null)`.
- The editor renders explicitly after orbit controls, transform controls, selection, document changes, framing, resizing, and similar authoring operations.
- Orbit damping is disabled so the camera does not require ongoing frames after input ends.
- The editor explicitly calls `world.update(...)` when it needs component systems to process authored changes.

This proves that Preact can successfully own an IWSDK-oriented DOM shell and that an on-demand IWSDK viewport is possible in a constrained authoring environment. It does not establish that ordinary IWSDK applications should disable the normal loop.

### Runtime rendering

Normal IWSDK worlds use Three.js `setAnimationLoop`. Each frame:

1. Updates the world visibility signal.
2. Runs ECS systems.
3. Dispatches live XR frame callbacks when applicable.
4. Renders the scene.

This remains the correct default for WebXR, physics, animation, input, locomotion, and general application systems. React or Preact integration must not create a second frame loop or replace the IWSDK loop.

### Existing 2D UI guidance

The current React/Preact guide already establishes the right state boundary:

- IWSDK owns durable experience and simulation state.
- Three.js objects hold high-frequency render state.
- Signals hold small immutable UI projections.
- Component-local UI state holds ephemeral drafts.
- UI sends typed intent commands to a bridge system.
- DOM updates should not occur at headset frame rate.
- Browser DOM should not be assumed to appear inside immersive XR; UIKitML remains the spatial UI path.

The guide is directionally correct, but the SDK does not yet productize the pattern through adapters, lifecycle guarantees, templates, examples, or complete browser tests.

## Goals

- Make a DOM application shell a first-class IWSDK option.
- Support React and Preact with the same conceptual and nearly identical public API.
- Preserve IWSDK ownership of the 3D scene, ECS, renderer, input, XR session, and frame loop.
- Keep all framework dependencies out of `@iwsdk/core`.
- Preserve behavior and bundle composition for existing vanilla applications.
- Make mounting safe under React Strict Mode, hot reload, route changes, startup failure, and rapid remounting.
- Make invalid concurrent world creation fail loudly instead of silently corrupting shared ECS component storage.
- Correctly support full-window and embedded viewport layouts.
- Provide explicit loading, ready, error, XR, and teardown states.
- Make the recommended data bridge efficient, testable, and difficult to misuse.
- Establish a foundation for future ECS selector hooks without prematurely promising reactivity the ECS does not expose.

## Non-goals

- Reimplement IWSDK scene objects as JSX elements.
- Make React Three Fiber the primary IWSDK renderer.
- Allow React or Preact to drive the simulation at DOM render frequency.
- Mirror transforms, XR frames, pointer rays, or camera matrices into component state every frame.
- Replace UIKitML or other spatial UI used inside immersive XR.
- Turn on demand rendering automatically when a framework adapter is installed.
- Support multiple simultaneously active worlds. The first release instead enforces one active or initializing world per JavaScript realm.
- Add WebXR DOM Overlay support. The browser DOM shell is not an immersive UI surface in this plan.

## Design principles

### One owner per domain

- IWSDK owns the world and all real-time 3D state.
- React or Preact owns the surrounding DOM.
- A bridge system owns translation between world state and UI state.
- The viewport DOM element has one stable owner. The framework may position it but must not reconcile the renderer canvas or objects beneath it.

### Event-driven UI projections

Bridge systems publish new immutable snapshots only at meaningful semantic boundaries, such as:

- Entity query membership changes.
- Level changes.
- XR session and visibility transitions.
- Completed selections, grabs, or transactions.
- Deliberately throttled loading or telemetry updates.

They do not publish every simulation frame.

### Typed commands into the world

UI components call methods such as `select`, `activate`, `setVolume`, or `loadScene`. They do not receive unrestricted entity mutation APIs as props. Each command revalidates entity identity and current state before mutating the world.

### Additive adoption

Installing neither adapter leaves the current application architecture unchanged. Existing `World.create` call sites keep continuous rendering and do not gain a framework dependency.

## Proposed package structure

### `@iwsdk/core`

Remains framework-independent. It provides the corrected lifecycle, sizing, XR state, and signal contracts used by adapters.

### Framework-neutral host implementation

Implement a small host/controller layer without importing React or Preact. It may live in `@iwsdk/core/dom`, a dedicated `@iwsdk/dom` package, or as private shared source consumed by both adapters. The final location should be decided based on package ownership and bundle analysis, but its public behavior must be shared.

Responsibilities:

- Own one mount generation.
- Attach to one stable viewport element.
- Begin asynchronous world creation.
- Publish `idle`, `loading`, `ready`, `error`, and `destroyed` status.
- Register requested application systems after creation.
- Ignore or destroy stale completions.
- Serialize or cancel overlapping creation attempts before invoking core creation again.
- Destroy the world and detach all owned resources.
- Make repeated cleanup safe.

### `@iwsdk/react`

Peer dependencies:

- `react`
- `react-dom`
- `@iwsdk/core`

It should not require `@preact/signals-react` or a Babel transform. Signal subscription should use React's `useSyncExternalStore` and the structural `ReadonlySignal` contract exported by IWSDK.

### `@iwsdk/preact`

Peer dependencies:

- `preact`
- `@iwsdk/core`

It should subscribe to the same `ReadonlySignal` contract through Preact hooks. Direct `@preact/signals` integration can be documented as an optional application choice, but the adapter should not require a second signals runtime.

## Proposed public surface

The primary API should support flexible layouts:

```tsx
import projectOptions from 'virtual:iwsdk-project';
import {
  IWSDKProvider,
  IWSDKReady,
  IWSDKViewport,
  useIwsdkSignal,
  useSystem,
  useWorld,
  useWorldStatus,
} from '@iwsdk/react';

export function App() {
  return (
    <IWSDKProvider
      options={projectOptions}
      systems={[[HudBridgeSystem, { priority: 10 }]]}
    >
      <main className="experience-shell">
        <IWSDKViewport className="experience-viewport" />
        <IWSDKReady fallback={<LoadingHud />}>
          <Hud />
        </IWSDKReady>
      </main>
    </IWSDKProvider>
  );
}
```

Preact exposes the same names and behavior from `@iwsdk/preact`.

A convenience component may compose the common full-viewport case:

```tsx
<IWSDKWorld
  options={projectOptions}
  systems={[HudBridgeSystem]}
  fallback={<LoadingHud />}
>
  <Hud />
</IWSDKWorld>
```

### `IWSDKProvider`

- Owns one framework-neutral host controller for its mounted lifetime.
- Does not recreate the world because a props object or systems array received a new identity during rendering.
- Treats initial world options and system registration as mount configuration.
- In development, warns when immutable mount configuration changes after creation.
- Provides status and the ready world through context.
- Does not start creation until one `IWSDKViewport` is attached.
- Rejects or clearly documents multiple viewports under one provider.
- Accepts either a system constructor or `[SystemConstructor, SystemOptions]` so priority and configuration are not lost.

### `IWSDKViewport`

- Renders the stable element into which IWSDK appends its canvas.
- Registers and unregisters that element with the provider.
- Does not expose the canvas as framework-owned content.
- Supports class, style, accessibility label, and ref forwarding.
- Has no opinion about whether UI is overlaid, adjacent, or elsewhere in the DOM.

### `IWSDKWorld`

- Convenience composition of a provider, viewport, ready boundary, and overlay-capable wrapper.
- Suitable for starters and simple applications.
- Does not replace the more flexible provider/viewport API.

### `IWSDKReady`

- Renders its fallback until the provider reaches `ready`.
- Renders signal-consuming descendants only after their systems and signals exist.
- Keeps the viewport mounted while loading, avoiding a circular dependency between viewport attachment and ready-only children.
- Provides the canonical boundary for hooks that require a ready world.
- Publishes a dedicated ready-boundary context. Strict hooks require that context rather than merely checking whether the provider happens to be ready at the instant they render.

### Hooks

Initial hooks:

- `useWorldStatus()` returns a discriminated union for `idle`, `loading`, `ready`, `error`, and `destroyed`.
- `useWorld()` returns the ready world and throws a descriptive error when called outside an `IWSDKReady` subtree. `useOptionalWorld()` provides nullable access for status and shell components.
- `useSystem(SystemClass)` retrieves one registered system from an `IWSDKReady` subtree. `useOptionalSystem(SystemClass)` provides nullable access when needed.
- `useIwsdkSignal(signal, getServerSnapshot?)` subscribes to a stable immutable signal snapshot.

Signal-consuming hooks are called only inside an `IWSDKReady` subtree. They are not called conditionally and do not accept a signal that appears only after an earlier conditional return. Server-rendered shells use `useWorldStatus()` and fallbacks; world-signal consumers are client-only.

Potential later hooks, only after corresponding core contracts exist:

- `useXRSession()` or `useXRState()`.
- `useQuery(query, selector)`.
- `useEntity(reference)`.
- `useComponent(entity, component, selector)`.

Generic entity/component hooks must not be implemented by polling every frame. They require explicit ECS membership and value-change notifications plus referentially stable selector snapshots.

## Core lifecycle contract

The framework adapters depend on a stronger world lifecycle than exists today.

### Abortable creation

Add an optional abort signal without breaking existing calls:

```ts
const world = await World.create(container, options, { signal });
```

An alternative shape that places `signal` inside `WorldOptions` is acceptable if it fits the project configuration model better. Requirements:

- Abort is safe before renderer creation, during dynamic system loading, during asset preloading, and during initial level loading.
- Abort rejects with a recognizable abort error.
- Every resource created before rejection is cleaned up.
- A non-aborted initialization failure performs the same cleanup before rejecting.
- Late asynchronous completions cannot mutate or restart a destroyed world.
- Destroying during initial `loadLevel()` must reject and settle `World.create()`; it must not stop the only loop capable of observing the request while leaving the creation promise pending forever.
- Abort during asset preloading must settle the aborting creation promptly rather than waiting for the current 30-second asset timeout.
- Shared URL loads require consumer-aware abort settlement. Aborting one world detaches that consumer without failing other consumers of the same `CacheManager` promise.
- No current asset loader returns a working canceller, so stopping network work is an optional optimization rather than a prerequisite. Cache publication is the required enforcement point.
- Each in-flight and resolved cache entry carries an owning world/cache generation and an explicit renderer-sensitivity classification. A completion from a generation that is no longer live is routed through `discard` rather than published for renderer-sensitive types. Renderer-neutral results may survive only under a documented shared-cache policy.
- Late completion extends the existing `active`/`discard` discipline from `loadCachedAsset`; an abandoned result cannot publish into a replacement world's cache even when its underlying network request cannot be cancelled.

Core must reject concurrent creation in the same JavaScript realm with a descriptive error. Elics component definitions carry mutable global storage and bitmasks; registering the same component singleton in a second world can reinitialize storage used by the first world. This is a correctness invariant, not merely adapter guidance. The latch belongs in `initializeWorld`/`World.create` and is acquired before `createWorldInstance()` registers any component. Direct `new World()` construction remains ungated for existing low-level unit tests and callers that manage their own component registration.

The framework-neutral host additionally serializes Strict Mode and rapid-remount generations so normal framework behavior does not hit that guard. A stale generation must fully settle and be destroyed before the host invokes another `World.create()` only for short, explicitly bounded phases that cannot be made interruptible. This fallback does not apply to asset preloading or initial level loading; both must support prompt abort settlement.

### Complete destruction

`World.destroy()` remains idempotent. Its contract should additionally include:

- Mark the world as destroying so asynchronous continuations stop mutating it.
- Reject pending level and creation operations before stopping the animation loop.
- Cancel the pending XR offer flow and prevent an `'always'` policy from re-offering. If an offer resolves after teardown despite having no cancellation API, end the returned session rather than adopting it into the destroyed world.
- Stop the animation loop.
- Destroy systems and registered cleanup callbacks.
- Remove resize observers/listeners.
- End or detach an active XR session safely.
- Remove the renderer canvas if it is still owned by the original container.
- Dispose renderer-owned resources and release the WebGL context where appropriate.
- Destroy/dispose world-owned entities and scene resources while respecting explicitly shared asset ownership.
- Clear callbacks and references retained by the world.
- Clear `window.FRAMEWORK_MCP_RUNTIME` only if it still refers to this world's runtime.
- Restore the world's original `update` method and reset the module-scoped MCP debug-hook state so a new world cannot inherit a paused state or a stale `hookedWorld`.

Avoid changing `destroy()` to an unexpectedly rejecting async method. Synchronous `destroy()` should request `XRSession.end()` without awaiting and complete all synchronous teardown. Add `destroyAsync()` if callers need to await the session's `end` event and full asynchronous shutdown. Both methods remain idempotent.

### Global state and the single-world invariant

The first adapter release does not attempt multi-world support. It enforces one active or initializing world per JavaScript realm in core.

For the current static asset implementation:

- Delete the unused `AssetManager.world` field rather than migrating dead state.
- Recognize that `AssetManager.init()` already replaces `loadingManager`, clears `manifestEntries`, resets load configuration, and reinitializes loaders on every creation.
- Add explicit lifecycle handling for the state that survives in `CacheManager`: resolved assets, in-flight promises, logical key-to-URL mappings, and the generation that owns each entry.
- Clear logical key mappings between worlds. Remove stale-generation promise registrations so a replacement world does not join abandoned renderer-sensitive work. Define whether immutable URL-keyed renderer-neutral assets may remain shared and how they are disposed.
- Audit `GLTFAssetLoader`, whose initialization is renderer-bound.
- Keep the global cache only where cache identity and disposal semantics are safe across sequential worlds.
- Do not claim simultaneous-world safety until Elics component storage and all renderer-bound loader state are redesigned.

This bounded cleanup is part of Phase 1. A full instance-owned asset architecture belongs to a separate future multi-world effort.

### Container sizing

IWSDK currently sizes the renderer and camera from the browser window. Embedded applications require viewport-element sizing.

Introduce an explicit compatibility option first:

```ts
render: {
  sizing: 'window' | 'container' | 'manual';
}
```

Rollout:

1. Preserve `'window'` as the compatibility default in the first additive release.
2. Make framework adapters explicitly request `'container'`.
3. Use `'manual'` for specialized hosts such as Scene Composer that own their own sizing schedule.
4. Add explicit viewport dimensions to every starter and example before container mode can become a default; most current containers rely on the window-sized canvas to establish their height.
5. Validate all examples and document CSS sizing requirements.
6. Consider making `'container'` the default only in a major release.

All three modes maintain one IWSDK viewport box, which is the sole semantic layout basis for renderer size, camera projection, and `ScreenSpaceUISystem`. Window mode sets it from the browser viewport and preserves the existing `100vw`/`100vh` CSS measurement helpers rather than replacing them with pixel dimensions. Container mode derives it from the observed container content box, and manual mode from the last supported resize call.

Container mode is a core semantic rather than duplicated adapter behavior. It uses `ResizeObserver`, handles zero-size and hidden containers, updates the viewport box, and does not allow the global window resize handler to overwrite container dimensions. ScreenSpace's hidden measurement helpers use that same box.

Percentages alone are insufficient because CSS viewport units continue to resolve against the browser's initial containing block. In container and manual modes, IWSDK must use a sized query container and token-aware normalization from `vw`/`vh`/`vmin`/`vmax` and their dynamic/small/large variants to `cqw`/`cqh`/`cqmin`/`cqmax`. This includes both the `ScreenSpace` schema defaults and the automatic `25vw`/`25vh` fallback. Window mode preserves the existing viewport-unit behavior exactly.

Manual mode installs no automatic window or container listener and exposes one supported resize operation rather than requiring callers to reach directly into renderer and camera internals.

### XR lifecycle state

DOM UI needs to render an Enter XR button, progress, errors, and session exit coherently.

Add a signal-backed state such as:

```ts
type XRState =
  | { status: 'idle'; session: null; error: null }
  | { status: 'requesting'; session: null; error: null }
  | { status: 'presenting'; session: XRSession; error: null }
  | { status: 'error'; session: null; error: Error };
```

Provide an awaitable request method while preserving compatibility with existing fire-and-forget calls. Options include:

- Add `requestXRSession()` and keep `launchXR()` behavior stable.
- Make `launchXR()` return a handled promise whose rejection semantics are explicitly migrated.

The initial implementation should favor an additive method if changing rejection behavior could introduce unhandled promises in existing applications.

The session must enter the reactive state as soon as `requestSession` or `offerSession` resolves, before awaiting `renderer.xr.setSession`. This closes the current interval in which an actual session exists while `world.session` is still undefined and `exitXR()` cannot end it. Cancellation/exit must work while the state is `requesting` as well as while it is `presenting`.

`visibilityState` remains the per-frame WebXR visibility projection. The new XR lifecycle signal is the source of truth for request, session, error, and exit state; documentation must define their different purposes rather than duplicating visibility in two independent stores.

### SSR and browser-only behavior

- Importing an adapter must be safe during server rendering.
- Server output contains the stable viewport shell and optional loading fallback, but no world.
- World creation occurs only after the client viewport is attached.
- `useIwsdkSignal` accepts a server snapshot. It is required for host-owned lifecycle signals such as world status that render in the SSR shell. World-owned bridge signals are never server-rendered or hydrated because `IWSDKReady` gates them, so those consumers do not require a server snapshot.
- Documentation covers client-component boundaries and dynamic import for Next.js, Remix, and similar environments.
- Keep the existing Node-import safety regression coverage and add a smoke test for the root `@iwsdk/core` export.
- Gate or remove the unconditional startup ASCII banner so importing core in an SSR process does not write to server logs. The runtime already defers browser resource creation; the banner is the remaining observed import-time side effect.

## State bridge contract

The recommended bridge is an IWSDK system:

```ts
class HudBridgeSystem extends createSystem({
  choices: { required: [Choice] },
}) {
  readonly snapshot = signal<HudSnapshot>(initialSnapshot);

  init() {
    const publish = () => {
      this.snapshot.value = buildImmutableSnapshot(
        this.queries.choices.entities,
      );
    };

    this.cleanupFuncs.push(
      this.queries.choices.subscribe('qualify', publish),
      this.queries.choices.subscribe('disqualify', publish),
      this.visibilityState.subscribe(publish),
    );

    publish();
  }

  activate(id: string) {
    // Resolve and validate current ECS state, then perform the domain action.
  }
}
```

Rules:

- Snapshots must remain referentially stable until the bridge publishes a change.
- Publish new arrays and objects rather than mutating a previous snapshot.
- The bridge publishes one aggregate initial snapshot explicitly. Elics can replay existing query members to a subscriber, but that replay is per entity rather than one stable aggregate UI snapshot.
- Subscription cleanup belongs in `cleanupFuncs`.
- Commands validate stale entity references after level changes.
- Commands become inert once their world is destroying or destroyed, even if an event handler still holds a previous system reference.
- High-frequency values remain in ECS or Three.js unless deliberately sampled and throttled for display.

## Routing and application lifetime

The default recommendation is one stable world above the application router:

```text
App root
  IWSDKProvider
    Router
      Route UI
    IWSDKViewport
```

Routes change scenes through `world.loadLevel()` rather than destroying and recreating the renderer. This preserves GPU resources, XR state where appropriate, and predictable initialization cost.

Route-local world mounting remains supported after complete destruction and abortable creation are verified. It should not be the starter default.

## Rendering modes

### Continuous mode

Continuous rendering remains the default for all existing and framework-hosted applications. It is required for ordinary IWSDK systems, animations, physics, input processing, and immersive XR.

Installing or using a React/Preact adapter must not alter the frame loop.

### Future demand mode

Demand rendering is a separate optional core feature, informed by Scene Composer but not required for the framework integration MVP.

Potential API:

```ts
render: {
  frameLoop: 'continuous' | 'demand';
}
```

with:

- `world.invalidate()` to coalesce and schedule a frame.
- An advanced `world.advance(time)` or equivalent for deterministic manual stepping if needed.
- Automatic continuous scheduling while an immersive XR session is active, returning to demand mode after exit.
- Clear documentation that time-based systems only progress when a demand frame is scheduled.
- Internal systems invalidating when they perform an asynchronous visual change.
- Readiness, screenshot, and render-proof tooling using a latched last-render record rather than assuming the current `renderer.info.render.calls` remains nonzero between demand frames.

Do not expose `renderer.setAnimationLoop(null)` as the public application pattern. Demand mode needs an IWSDK-owned scheduler because a frame includes system updates, XR handling, and rendering, not merely `renderer.render()`.

## React Three Fiber position

React Three Fiber is not the canonical path. Although advanced R3F configuration can reuse an external renderer, scene, camera, and manual frame scheduling, the deeper ownership conflicts remain.

Using two owners would create ambiguity around:

- **Entity and object lifetime:** IWSDK creates transform entities, attaches `Transform`, `Visibility`, and `LevelTag`, parents objects into the active level, and removes/disposes objects when entities are released. An R3F reconciler would independently mount and unmount the same `Object3D` graph.
- **Pointer ownership:** IWSDK's `CanvasPointerSystem` installs `@pmndrs/pointer-events` against an IWSDK-managed interactable set. R3F normally installs a second event manager on the same surface.
- Frame ordering and system updates.
- XR session setup.
- Resource disposal.
- Demand invalidation.

An advanced future adapter could investigate attaching a reconciler to IWSDK-owned Three.js resources, but it must demonstrate single-loop and single-owner semantics. Interoperability at the `Object3D` or asset boundary is safer than sharing the entire renderer lifecycle.

## Starter, example, and documentation work

### Project creation

Add an explicit UI choice without changing the vanilla default:

```text
npm create @iwsdk/app
  UI: Vanilla | React | Preact
```

Every variant uses `virtual:iwsdk-project` so assets, components, features, and scene configuration are preserved.

The repository does not currently have a template-variant mechanism. Phase 3 must explicitly update:

- Template selection and generation in `packages/create`.
- Generated dependency and script construction.
- Packed workspace dependency rewriting.
- Release-readiness verification.
- Tarball build package lists for the new adapter packages.

### Canonical example

Ship one example that demonstrates:

- A stable embedded viewport.
- Loading and error states.
- An accessible DOM HUD layered over the canvas.
- Pointer-event pass-through outside interactive controls.
- A bridge system publishing immutable state.
- Typed commands from UI to ECS.
- Enter/exit XR state.
- A level or route transition without recreating the world.
- Cleanup and remount behavior.

React and Preact versions should share application behavior and bridge-system tests rather than diverging into separate architectural examples.

The example and generated projects must also retain the IWSDK development-tool contract: `iwsdk dev`, managed browser startup, Scene Composer runtime switching, MCP inspection, screenshots, and existing test skills must wait on a distinct world-ready contract rather than assuming `World.create` finishes inside a short fixed timer.

Core dispatches a development-only `iwsdk:world-ready` event after initial asset preloading and `loadLevel()` have resolved, with world/generation identity sufficient to reject stale notifications. It also exposes a latched development readiness record so cross-realm tooling that attaches after the one-shot event can observe the same generation without reverting to timing guesses. Framework hosts use the `World.create()` promise and their own status signal programmatically; they do not depend on a DOM event in production. The existing `iwsdk:mcp-runtime-ready` event keeps its current meaning—an MCP runtime pointer was installed or replaced—and is not used as a world-readiness gate. Managed-browser and screenshot tooling retain render-stat fallback behavior for non-IWSDK applications.

### Fast Refresh policy

React and Preact presets introduce self-accepting HMR boundaries that do not exist in the vanilla starter. Elics component definitions are globally registered by ID, and re-evaluating a module that calls `createComponent` currently throws. Re-evaluated system constructors also cease to match instances registered under the previous constructor identity.

Before shipping framework starters, define and test one policy:

- Have the Vite plugin force a full page reload when a changed module defines or transitively imports IWSDK components or systems; or
- Establish a supported hot-replacement identity contract in core.

The first release should use full reload for component/system modules. Fast Refresh remains available for UI-only component modules.

### Documentation

Update the existing guide to distinguish:

- Vanilla IWSDK, which remains unchanged.
- Framework-hosted DOM UI.
- Spatial/in-headset UIKitML UI.
- Continuous runtime rendering versus editor-specific demand rendering.
- Supported single-world behavior versus future multi-world support.
- SSR/client-only requirements.
- Routing and lifecycle recommendations.
- Why React Three Fiber is not the default integration.
- Why WebXR DOM Overlay is outside the first release and why UIKitML remains the supported immersive UI surface.

## Testing and acceptance criteria

### Core lifecycle tests

- Two concurrent `World.create()` calls fail deterministically before shared Elics component storage can be reinitialized.
- Initialization failure leaves no canvas, loop, global listener, or MCP pointer.
- Abort at each asynchronous phase leaves no live world resources.
- Abort during asset preloading settles promptly, detaches only that consumer from shared work, and generation-checks publication so abandoned renderer-sensitive results are discarded rather than populating replacement-world state.
- Destroy during initial level loading settles the creation promise instead of leaving it pending.
- `destroy()` remains idempotent.
- Destruction removes the owned canvas and disposes the renderer.
- Destruction handles active XR safely.
- Destruction cancels a pending XR offer, prevents an `'always'` offer from recurring, and ends a session returned by an offer that resolves after teardown.
- A stale world cannot clear the MCP pointer belonging to a newer world.
- A new world cannot inherit a prior world's paused MCP debug state or patched update function.
- Pending level loads cannot mutate a destroyed world.
- Static asset compatibility behavior is covered during migration.
- `iwsdk:world-ready` fires only after successful initial preload and level load, never for failed, aborted, or stale generations; its latched readiness record supports late subscribers, and `iwsdk:mcp-runtime-ready` retains its pointer-change semantics.

### Sizing tests

- Window mode retains current behavior.
- Window mode continues measuring ScreenSpace CSS against the existing `100vw`/`100vh` basis so current HUD geometry does not change.
- Container mode uses the container's content dimensions.
- ResizeObserver changes renderer size and camera projection.
- A hidden or zero-size viewport recovers when displayed.
- Device pixel ratio behavior remains bounded and documented.
- An embedded `ScreenSpace` panel resolves percentages, normalized viewport-relative units, schema defaults, automatic fallbacks, and positions against the IWSDK viewport box rather than the browser window.
- Manual mode updates renderer, camera, and ScreenSpace from the dimensions supplied through the supported resize API.

### Adapter unit tests

- Provider waits for a viewport before creating the world.
- Strict Mode setup-cleanup-setup produces one live world and one canvas.
- The host serializes Strict Mode creation generations and never overlaps core creation.
- Stale creation completion is destroyed and never published.
- Prop identity changes do not recreate the world.
- Meaningful immutable configuration changes produce a warning or documented behavior.
- All hooks reject use outside their provider clearly.
- Signal snapshots remain stable between notifications.
- Preact and React expose equivalent lifecycle states.
- `IWSDKReady` prevents strict world/system hooks from rendering before readiness without conditional hook calls.
- System registration tuples preserve priority and configuration.

### Browser tests

- A real WebGL canvas renders in both starter variants.
- DOM controls update ECS state through bridge commands.
- Canvas pointer input works outside interactive overlay controls.
- Keyboard focus and semantic controls remain usable.
- Route and level transitions do not create duplicate canvases.
- Unmount leaves no active loop or canvas.
- Hot reload and rapid remount do not leak worlds.
- Editing a bridge system or component module under React/Preact Fast Refresh produces a controlled full reload rather than duplicate component registration or stale system-constructor identity.
- XR request state and errors reach the UI.
- UI commits do not occur at headset frame rate during steady simulation.
- `iwsdk dev`, managed browser control, Scene Composer runtime switching, MCP inspection, screenshots, and test skills recognize framework-hosted runtime readiness through the distinct development-only `iwsdk:world-ready` event rather than relying on `iwsdk:mcp-runtime-ready` or a fixed short startup delay.

### Existing application compatibility

- Run the complete IWSDK test matrix.
- Run every existing example with the unchanged vanilla entry point.
- Compare bundle output to confirm React and Preact are absent unless explicitly installed.
- Verify full-window examples retain their current dimensions and render-loop behavior.

## Rollout plan

### Phase 0: Establish contracts and measurements

- Choose and implement the lifecycle test harness: either stub `WebGLRenderer` under a DOM test environment in `packages/core`, or exercise real WebGL lifecycle through Playwright in `packages/vite-plugin-dev`. The existing `new World()` unit tests do not cover initialization resources.
- Add lifecycle, resource-leak, concurrent-creation, and container-sizing regression tests around current behavior.
- Remove the stale `world-destroy` test comment claiming cursor visuals touch `document` during module evaluation; the dedicated xr-input Node-import test now guards the corrected behavior.
- Record current full-window example screenshots, canvas dimensions, startup timing, and production bundle composition.
- Document the one-world-per-realm constraint until global state is isolated.

Exit criteria: behavior and leak baselines are reproducible before implementation changes.

### Phase 1: Core lifecycle hardening

- Add a core concurrent-create latch inside `initializeWorld`, acquired before `createWorldInstance()`, and release it only after complete destruction or failed-init cleanup.
- Clean up initialization failures.
- Add abortable creation or a cancellable mount handle.
- Complete world destruction, including ordering pending-operation rejection before loop shutdown.
- Cancel XR offer/session activity.
- Guard and clean global MCP state, including the debug update hook and paused state.
- Add the distinct development-only `iwsdk:world-ready` lifecycle event after successful initial level loading without changing `iwsdk:mcp-runtime-ready` semantics.
- Prevent destroyed worlds from accepting late asynchronous completions.
- Define and reset sequential-world `CacheManager` mappings and in-flight consumer state without attempting simultaneous-world support.
- Introduce explicit window/container/manual sizing while retaining the compatibility default, and make ScreenSpace use the same layout basis.
- Migrate Scene Composer's editor world to manual sizing and route `resizeEditorRenderer` through the supported resize API. Test that browser-window resizing cannot clobber the editor canvas CSS size, drawing buffer, or camera aspect.
- Correct the shipped React/Preact guide's destroy guarantee and replace its unsafe Strict Mode mounting snippet.

Exit criteria:

- Concurrent creation fails before any shared component storage changes.
- Destroy during initial level loading settles every promise.
- No loop, canvas, resize observer/listener, GL context, XR offer/session, MCP pointer, MCP debug hook, or stale async continuation survives teardown.
- A sequential replacement world starts with clean component, asset, and debug state.

### Phase 2: Framework-neutral host and adapters

- Implement the shared host controller.
- Add `@iwsdk/react`.
- Add `@iwsdk/preact`.
- Implement provider, viewport, ready boundary, status, world, system, and signal APIs.
- Ensure adapter imports and server snapshots are SSR-safe.
- Implement the Vite full-reload policy for component and system modules under framework Fast Refresh.

Exit criteria: identical React and Preact fixtures pass lifecycle and browser tests without affecting vanilla bundles.

### Phase 3: Product story

- Add React and Preact starter choices.
- Implement template selection, dependency generation, packed dependency rewriting, tarball package lists, and release-readiness checks for both new packages.
- Ship the canonical HUD example.
- Update the existing guide and API references.
- Add routing, accessibility, overlay, XR-state, and SSR guidance.
- Validate with at least one real application partner.
- Validate the full `iwsdk dev`, managed browser, Scene Composer, MCP, screenshot, and test-skill workflow using the distinct `iwsdk:world-ready` event while preserving `iwsdk:mcp-runtime-ready` for MCP pointer changes.

Exit criteria: a new developer can create, run, test, and deploy a framework-hosted IWSDK application without writing lifecycle plumbing.

### Phase 4: Reactive ECS selectors

- Define component value-change and entity-destruction subscriptions.
- Define selector snapshot identity and equality semantics.
- Add `useQuery`, `useEntity`, and `useComponent` only after those contracts exist.
- Prove that these hooks do not trigger DOM rendering at simulation frequency accidentally.

Exit criteria: hooks are event-driven, leak-free, and stable under level replacement.

### Phase 5: Optional demand rendering

- Define frame invalidation semantics at the world level.
- Integrate invalidation with asynchronous core systems.
- Specify XR transitions and time-based system behavior.
- Add power/performance benchmarks before recommending demand mode.
- Preserve managed-browser and render-proof readiness through a latched last-render signal or equivalent contract.

Exit criteria: demand mode is deterministic, does not double-render, and cannot silently break immersive XR.

## Compatibility policy

The first release of this work follows these rules:

- Existing `World.create(container, options)` source remains valid.
- Continuous rendering remains the default.
- Vanilla starters remain the default unless the developer selects a framework.
- React and Preact dependencies remain outside core.
- Window sizing remains available and initially remains the compatibility default.
- Existing fire-and-forget XR entry behavior is not changed to an unhandled rejecting promise.
- Existing static asset APIs receive a compatibility period if they must be replaced.
- Applications that previously attempted to create a second world in the same JavaScript realm now receive a descriptive error instead of silently corrupting shared ECS component storage.
- Behavior-changing defaults require a major release or explicit migration plan.

## Risks and mitigations

### Framework adapters disguise an unsafe core lifecycle

Mitigation: complete Phase 1 before advertising adapters as canonical. Do not solve lifecycle only inside React hooks.

### The adapter becomes a second application state store

Mitigation: adapter context contains lifecycle and world access only. Domain state lives in explicit bridge-system signals.

### Developers publish every frame into React

Mitigation: examples, tests, diagnostics, and documentation emphasize semantic snapshots and throttled telemetry. Do not provide a `useFrame` hook in the initial adapter.

### Duplicate signals runtimes

Mitigation: adapters consume the structural signal subscription API and keep signal packages aligned through peer dependency policy and tests.

### Multiple worlds remain unsafe

Mitigation: enforce one active or initializing world per realm in core. A future multi-world project must redesign Elics component storage as well as asset and development globals; teardown alone is insufficient.

### Resource disposal breaks shared assets

Mitigation: define ownership metadata and separate disposal of renderer/world-owned resources from globally cached or explicitly shared assets.

### Container sizing changes existing layout

Mitigation: introduce an explicit option, keep the compatibility default initially, and validate existing examples before changing defaults.

## Decisions requested before implementation

1. Should the shared host be public as `@iwsdk/dom` or remain an implementation detail of the two adapters?
2. Should abort support be an additional `World.create` argument, part of `WorldOptions`, or a new synchronous mount handle with a `ready` promise?
3. Is `IWSDKReady` plus strict hooks the preferred canonical shape, with explicitly named nullable hooks reserved for shell/status code?
4. Should the single-world latch cover only concurrent initialization or the full lifetime until `destroy()`? The recommendation is the full lifetime because simultaneous worlds are unsafe even after both initialize.
5. Should container sizing become the core default immediately, or only in a future major version?
6. Is a reactive XR state API required for the first adapter release or can the first example avoid an XR-status hook?
7. Should React and Preact ship simultaneously, with React receiving the heavier validation burden because Preact is already exercised by Scene Composer?

## Recommended decisions

1. Keep the shared host implementation private initially; promote it only when a non-framework consumer demonstrates a stable use case.
2. Prefer an abortable mount handle or additional lifecycle argument over mixing operational cancellation into serializable project options.
3. Provide `IWSDKReady`, `useWorldStatus()`, strict `useWorld()`/`useSystem()`, and separately named nullable variants.
4. Enforce one active or initializing world per realm in core until Elics storage, assets, and development globals are all safe for simultaneous worlds.
5. Use `render.sizing: 'window' | 'container' | 'manual'`; keep window sizing as the compatibility default initially, while adapters explicitly request container sizing.
6. Include reactive XR state in the first complete 2D story because entering XR is commonly initiated from DOM UI.
7. Build the shared contract and both thin adapters together. Treat React as the primary validation risk because it is absent from the current repository; use the existing Scene Composer Preact integration as prior art and parity coverage.
