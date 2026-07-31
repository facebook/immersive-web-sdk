# React and Preact 2D UI with IWSDK

IWSDK owns a real-time ECS world and a Three.js render surface. React and Preact own declarative DOM. They work well together when the boundary is explicit: IWSDK remains authoritative for the experience, while the UI renders small, immutable projections of world state and sends commands back to the world.

This guide applies equally to application HUDs, configuration panels, companion views, and editor tooling. The examples use Preact, followed by the equivalent React subscription adapter.

## Choose the Right Surface

Use DOM UI for:

- Browser HUDs, menus, forms, accessibility, and text-heavy panels.
- Companion and spectator controls.
- Development tools and editors around the Three.js canvas.

Use IWSDK spatial UI for controls that must exist inside the 3D world, participate in depth and occlusion, or remain usable in immersive XR. A browser DOM overlay should not be assumed to appear in the headset. See [Spatial UI with UIKitML](./10-spatial-ui-uikitml.md) for world-space UI.

It is reasonable for one application to use both: DOM for the browser shell and UIKitML for the immersive control surface.

## Ownership Model

Keep four kinds of state separate:

| Owner                    | What belongs there                             | Examples                                                 |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| IWSDK ECS                | Durable experience and simulation state        | Components, entity membership, level state, interactions |
| Three.js objects         | High-frequency render state managed by systems | Matrices, animation pose, camera motion                  |
| Shared signals           | Immutable UI projections of ECS state          | XR visibility, selected item summary, counts, progress   |
| Component-local UI state | Ephemeral interaction state                    | Open menu, draft input, focused tab                      |

Do not copy the world into a React state tree. Do not make JSX the owner of `Object3D` instances that IWSDK systems also mutate. Do not let both an ECS component and a UI signal independently claim to be the source of truth for the same value.

The recommended flow is:

```text
IWSDK events and systems -> immutable projection signal -> React/Preact render
React/Preact event       -> typed bridge command       -> IWSDK mutation
```

## Build a Narrow ECS Bridge

IWSDK already uses `@preact/signals-core` for world state and system configuration. Reuse that reactive contract instead of adding a second application store.

The bridge should be a system because it then shares the world's lifecycle, query API, and cleanup behavior:

```ts
import {
  RayInteractable,
  VisibilityState,
  createSystem,
  signal,
} from '@iwsdk/core';

type ChoiceSummary = {
  key: string;
  label: string;
};

type HudSnapshot = {
  choices: ChoiceSummary[];
  visibility: VisibilityState;
};

export class HudBridgeSystem extends createSystem({
  choices: { required: [RayInteractable] },
}) {
  readonly snapshot = signal<HudSnapshot>({
    choices: [],
    visibility: this.visibilityState.value,
  });

  init() {
    const publishChoices = () => {
      this.snapshot.value = {
        ...this.snapshot.peek(),
        choices: [...this.queries.choices.entities].map((entity) => ({
          // Good for one world lifetime. Use an authored ID component when the
          // identity must survive reloads or serialized scene revisions.
          key: `${entity.index}:${entity.generation}`,
          label: entity.object3D?.name || `Entity ${entity.index}`,
        })),
      };
    };

    this.cleanupFuncs.push(
      this.visibilityState.subscribe((visibility) => {
        this.snapshot.value = { ...this.snapshot.peek(), visibility };
      }),
      this.queries.choices.subscribe('qualify', publishChoices),
      this.queries.choices.subscribe('disqualify', publishChoices),
    );

    publishChoices();
  }

  activate(key: string) {
    const entity = [...this.queries.choices.entities].find(
      (candidate) => `${candidate.index}:${candidate.generation}` === key,
    );
    if (!entity?.active) return;

    // Perform the domain action here. Validate current entity/component state,
    // then use addComponent, removeComponent, setValue, or another IWSDK API.
  }
}
```

Important details:

- Query `qualify` and `disqualify` subscriptions describe membership changes. Publish an initial snapshot as well.
- Store unsubscribe functions in `cleanupFuncs`; `World.destroy()` and system teardown will run them.
- Publish new arrays and objects. In-place mutation will not produce a new snapshot for React.
- Expose intent methods such as `activate`, `select`, or `setVolume`, not general entity mutation from UI components.
- Revalidate the entity in every command. A UI click may arrive after an entity was destroyed or a level changed.

## Subscribe from Preact

`@preact/signals-core` is the shared contract. A small hook connects it to Preact without requiring the Preact-specific signals package:

```tsx
import type { ReadonlySignal } from '@iwsdk/core';
import { useEffect, useState } from 'preact/hooks';

export function useIwsdkSignal<T>(source: ReadonlySignal<T>): T {
  const [value, setValue] = useState(() => source.peek());
  useEffect(() => source.subscribe(setValue), [source]);
  return value;
}

function Hud({ bridge }: { bridge: HudBridgeSystem }) {
  const snapshot = useIwsdkSignal(bridge.snapshot);

  return (
    <nav aria-label="Scene choices">
      {snapshot.choices.map((choice) => (
        <button key={choice.key} onClick={() => bridge.activate(choice.key)}>
          {choice.label}
        </button>
      ))}
    </nav>
  );
}
```

This is also useful when an IWSDK app already has one version of `signals-core`. Adding an adapter package that resolves a second core version can produce two signal runtimes or confuse Vite dependency optimization. Keep one `signals-core` version in the application graph.

If the application deliberately standardizes on `@preact/signals`, reading `.value` directly in a Preact component is valid. Confirm that its `signals-core` range resolves to the same version IWSDK uses.

## Subscribe from React

React's `useSyncExternalStore` provides the equivalent boundary. The snapshot must remain referentially stable until the signal changes, which is why the bridge publishes immutable objects.

```tsx
import type { ReadonlySignal } from '@iwsdk/core';
import { useCallback, useSyncExternalStore } from 'react';

export function useIwsdkSignal<T>(source: ReadonlySignal<T>): T {
  const subscribe = useCallback(
    (notify: () => void) => source.subscribe(notify),
    [source],
  );
  const getSnapshot = useCallback(() => source.peek(), [source]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```

The ECS bridge and ownership rules do not change between React and Preact. Only this framework adapter changes.

## Mount the World Once

Give IWSDK a stable element and let it own the renderer subtree. The UI framework may position that element, but it should not reconcile the canvas or Three.js objects inside it.

```tsx
import { World } from '@iwsdk/core';
import { useEffect, useRef, useState } from 'preact/hooks';

function Experience() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [bridge, setBridge] = useState<HudBridgeSystem | null>(null);

  useEffect(() => {
    let cancelled = false;
    let world: World | undefined;

    void World.create(viewportRef.current!, {
      level: '/scenes/main.iwsdk.scene.json',
    }).then((created) => {
      world = created;
      if (cancelled) {
        world.destroy();
        return;
      }
      world.registerSystem(HudBridgeSystem);
      setBridge(world.getSystem(HudBridgeSystem) ?? null);
    });

    return () => {
      cancelled = true;
      world?.destroy();
    };
  }, []);

  return (
    <main class="experience-shell">
      <div ref={viewportRef} class="experience-viewport" />
      <aside class="experience-hud">
        {bridge ? <Hud bridge={bridge} /> : null}
      </aside>
    </main>
  );
}
```

`World.destroy()` is idempotent and tears down systems, render-loop listeners, and registered cleanup functions. This matters during tests, hot reload, route changes, and React development modes that intentionally exercise mount cleanup.

## Layer DOM over the Canvas

Use one stable layout, not independently sized canvases and panels:

```css
.experience-shell {
  position: relative;
  min-height: 100dvh;
}

.experience-viewport {
  position: absolute;
  inset: 0;
}

.experience-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.experience-hud button,
.experience-hud input,
.experience-hud select {
  pointer-events: auto;
}
```

This lets unoccupied HUD regions pass pointer input to IWSDK's canvas while real controls remain interactive. Keep DOM controls semantic and keyboard accessible. Do not reproduce ordinary buttons with custom canvas hit areas.

## Keep the Frame Loop out of JSX

The Three.js render loop can run at 72, 90, or 120 Hz. A DOM application usually should not.

Good publication points are:

- Query qualification or disqualification.
- XR visibility or session transitions.
- A completed selection, grab, transaction, or level change.
- Loading progress at a deliberately throttled cadence.
- On-demand inspection requested by the user or an agent.

Avoid:

- Setting a signal from every `System.update()` just to mirror transforms.
- Publishing camera matrices or pointer rays on every frame.
- Raycasting on passive mouse movement to prove that objects are visible.
- Rebuilding a large entity list for an unrelated component value change.

Continuous 3D motion belongs in systems and `Object3D` state. If a 2D readout truly needs live telemetry, sample it at a fixed low rate, publish only when the displayed value changes, and stop sampling when the panel is hidden.

## Separate Drafts from Commands

A form may keep an unsaved draft in component-local state. Commit it through one bridge command:

```tsx
function VolumeControl({ bridge, initial }: Props) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        bridge.setVolume(draft);
      }}
    >
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={draft}
        onInput={(event) => setDraft(Number(event.currentTarget.value))}
      />
      <button type="submit">Apply</button>
    </form>
  );
}
```

For continuous controls, either update on `input` with explicit throttling or commit on `change`/pointer release. Choose based on the experience, not framework convenience.

## Error and Async Rules

- Represent `idle`, `loading`, `ready`, and `error` explicitly for asynchronous projections.
- Give each request a generation token or `AbortController`; ignore stale completions.
- Disable or deduplicate commands that cannot safely run twice.
- Return structured domain errors from the bridge and translate them to user-facing text in the UI.
- Never retain `XRFrame`, transient hit-test results, or other frame-scoped objects in signals.

## Testing Checklist

Test the integration at three levels:

1. Bridge tests: query changes publish expected immutable snapshots; commands validate stale entities; cleanup unsubscribes.
2. Browser tests: controls update ECS state, canvas input still works outside controls, keyboard focus is usable, and unmount destroys the world.
3. Runtime tests: capture a real WebGL canvas, exercise browser and XR transitions, and inspect performance traces for UI commits or raycasts on passive input.

For editor-like surfaces, also keep a visual checkpoint before framework migrations. Compare scene graph indentation, selection bounds, inspector contents, canvas dimensions, and runtime/editor switching after the port.

## Review Checklist

Before merging a React or Preact integration, verify:

- IWSDK/ECS is still the source of truth for world state.
- UI projections are small, immutable, and event-driven.
- UI actions call typed bridge commands rather than mutating arbitrary entities.
- The IWSDK canvas has one stable owner and is not recreated by rerenders.
- All signal, query, DOM, and world subscriptions have cleanup paths.
- High-frequency transforms stay out of the DOM render cycle.
- Only one compatible `@preact/signals-core` runtime is installed.
- DOM controls remain accessible and do not block canvas input outside their bounds.
- In-headset controls use an appropriate spatial or supported overlay surface.
