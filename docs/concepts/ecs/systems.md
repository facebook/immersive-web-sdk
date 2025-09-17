---
title: System
---

# System

Systems implement behavior. They declare queries (entity sets) and optional config schema (reactive signals).

## Mental Model: Behavior that reacts to data

Systems are **functions over sets of entities**. Think of them as database stored procedures that run every frame:

```text
Traditional Game Loop:           ECS System Approach:
──────────────────────           ───────────────────
for each object:                 for each relevant entity set:
  object.update(dt)                system.update(dt, entities)

Problems:                        Benefits:
- Tight coupling                 - Data/behavior separation
- Hard to optimize               - Cache-friendly iteration
- Difficult to disable          - Easy to enable/disable
- Hard to test                   - Systems are pure functions
```

Queries pick the **rows** (entities) to process; systems implement the **logic** of what to do with that data each frame.

## Anatomy

```ts
import { Types, createSystem } from '@iwsdk/core';

export class MySystem extends createSystem(
  {
    groupA: { required: [CompA], excluded: [CompB] },
    groupB: { required: [CompC] },
  },
  {
    speed: { type: Types.Float32, default: 1 },
  },
) {
  init() {
    this.queries.groupA.subscribe('qualify', (e) => {
      /*…*/
    });
  }
  update(dt: number) {
    for (const e of this.queries.groupB.entities) {
      /*…*/
    }
  }
  destroy() {
    /* cleanup */
  }
}
```

## Config Signals

System config values are reactive signals powered by `@preact/signals`. Each config key is a `Signal<T>` at `this.config.key`.

```ts
export class CameraShake extends createSystem(
  {},
  {
    intensity: { type: Types.Float32, default: 0 },
    decayPerSecond: { type: Types.Float32, default: 1 },
  },
) {
  update(dt: number) {
    const i = this.config.intensity.peek();
    if (i <= 0) return;
    // apply random offset scaled by i
    this.camera.position.x += (Math.random() - 0.5) * 0.01 * i;
    this.config.intensity.value = Math.max(
      0,
      i - this.config.decayPerSecond.peek() * dt,
    );
  }
}
```

### Reading vs Tracking

- `.value` — set and track.
- `.peek()` — read without tracking to avoid incidental subscriptions.
- `.subscribe(fn)` — run when the value changes.

```ts
const unsubscribe = this.config.intensity.subscribe((v) => console.log(v));
// later
unsubscribe();
```

### UI ↔ ECS Wiring

Config signals are ideal for developer tools and UI controls:

```ts
// debugging slider
document.getElementById('intensity')!.addEventListener('input', (e) => {
  this.config.intensity.value = Number((e.target as HTMLInputElement).value);
});
```

## Creating/Destroying Entities in Systems

```ts
const e = this.createEntity();
e.addComponent(CompA);
e.destroy(); // remove when done
```

## Priorities

Systems run each frame in ascending `priority` (more negative runs earlier). IWSDK registers some priorities by default when you enable features in `World.create`:

- Locomotion: −5 (if enabled)
- Input: −4 (always)
- Grabbing: −3 (if enabled)

You control your system’s order via `{ priority }` when registering:

```ts
world.registerSystem(MySystem, { priority: -2 });
```

## Query events and resource management

Use `qualify`/`disqualify` to perform one‑time setup/teardown per entity. Cache handles on the entity (e.g., via a component or a symbol) instead of recomputing every frame.

## Batching and allocations

- Avoid creating objects in `update` loops; reuse vectors/arrays.
- Keep derived numbers in components if they are consumed by multiple systems.

## Debugging patterns

- Log query sizes: `console.debug('N panels', this.queries.panels.entities.size)`.
- Temporarily increase verbosity of specific systems with a debug config signal.

## Sharing data via globals

`this.globals` is a reference to `world.globals` — a simple shared object store. Use sparingly for cross‑system coordination.

```ts
this.globals.navMesh = myNavMesh;
```
