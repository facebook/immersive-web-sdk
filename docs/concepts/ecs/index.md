---
title: ECS 101
---

# ECS with IWSDK

This is a practical, from‑zero introduction to Entity‑Component‑System (ECS) as used in IWSDK. It assumes no prior ECS knowledge and uses only IWSDK code — no pseudocode. By the end you will be able to design data‑driven features with components, write systems that react to entities via queries, and run everything inside a World.

- If you prefer concept deep‑dives, see the focused pages:
  - [World](/concepts/ecs/world)
  - [Entity](/concepts/ecs/entity)
  - [Component](/concepts/ecs/components)
  - [System](/concepts/ecs/systems)
  - [Queries](/concepts/ecs/queries)
  - [Lifecycle](/concepts/ecs/lifecycle)
  - [Patterns & Tips](/concepts/ecs/patterns)

IWSDK’s ECS is powered by the elics runtime. IWSDK layers WebXR, Three.js scene ownership, and convenient helpers on top, but the core mental model is the same.

## The ECS Mental Model

- Data over inheritance: Components are small, flat data definitions (no behavior). You attach them to Entities.
- Behavior is in Systems: Systems query for entities that have specific components, then update them every frame.
- Composition wins: You build features by composing components on entities, not by subclassing.
- Columnar memory: Each component field is stored in a packed array for cache‑friendly iteration.

## How IWSDK Extends ECS

- World coordinates Three.js rendering, WebXR session, input rig, asset loading, and the ECS scheduler.
- Entities can carry `object3D` and a synced `Transform` when created via `createTransformEntity()`.
- Systems can run with XR‑aware priorities (input/locomotion first, visuals after) before the renderer draws the frame.
- Built‑in components/systems for Transform, Visibility, Input, UI, Audio, Levels, etc.

## Key Concepts Overview

**Core Architecture:**

- [World](/concepts/ecs/world): the coordinator between ECS data, Three.js rendering, WebXR session, and assets. Owns the render loop and system priorities.
- [Entity](/concepts/ecs/entity): a lightweight container that can hold components, be created/destroyed, parented (scene vs level), and optionally carry a 3D `object3D`.
- [Component](/concepts/ecs/components): typed, packed data schemas with no behavior. Think database columns — each field stored in efficient arrays.
- [System](/concepts/ecs/systems): pure behavior that processes entities via queries. Runs each frame in priority order to implement game logic.

**Advanced Concepts:**

- [Queries](/concepts/ecs/queries): live, efficient sets of entities that update automatically as components change. Support complex filtering with value predicates.
- [Lifecycle](/concepts/ecs/lifecycle): understand when things happen — world boot sequence, system initialization, per-frame execution order, and cleanup.
- [Patterns & Tips](/concepts/ecs/patterns): proven composition patterns, performance optimizations, and debugging techniques for production use.

## Quick start: a complete feature in ~40 lines

We will implement a simple “Regeneration” feature: if an entity has `Health`, replenish it gradually.

```ts
import {
  World,
  Types,
  createComponent,
  createSystem,
  Entity,
} from '@iwsdk/core';

// 1) Data
export const Health = createComponent('Health', {
  current: { type: Types.Float32, default: 100 },
  max: { type: Types.Float32, default: 100 },
});

// 2) Behavior
export class HealthRegenSystem extends createSystem(
  { withHealth: { required: [Health] } },
  { regenPerSecond: { type: Types.Float32, default: 5 } },
) {
  init() {
    // react to config changes
    this.config.regenPerSecond.subscribe((v) => console.log('Regen now', v));
  }
  update(dt: number) {
    for (const e of this.queries.withHealth.entities) {
      const cur = e.getValue(Health, 'current')!;
      const max = e.getValue(Health, 'max')!;
      if (cur < max)
        e.setValue(
          Health,
          'current',
          Math.min(max, cur + dt * this.config.regenPerSecond.peek()),
        );
    }
  }
}

// 3) Running in a world
const container = document.getElementById('scene') as HTMLDivElement;
const world = await World.create(container);
world.registerComponent(Health);
world.registerSystem(HealthRegenSystem);

// Create an entity with Health
const player = world.createTransformEntity();
player.addComponent(Health, { current: 25, max: 100 });
```

That’s the whole loop: components define data, systems query and mutate that data, the world runs it.

## Mental Models in Action

Data flow each frame:

```text
Input → Core logic systems → Feature systems → UI/Render systems → Renderer
        (higher priority ↖ earlier; more negative = earlier)
```

Memory model (columnar storage):

```text
Health.current: [100, 25, 80, ...]
Health.max:     [100, 100, 150, ...]
               entity 0  1    2
```

ECS vs OOP (why composition):

- Add features by adding components, not by subclassing a deep hierarchy.
- Multiple orthogonal features coexist on the same entity without inheritance diamonds.

## Entities: attaching data and a 3D object

Entities are created from the world. In IWSDK they can also carry a Three.js object (`object3D`) and a built‑in `Transform` component when created via `createTransformEntity`.

```ts
// Persistent entity (parented under the scene) with an Object3D
const hud = world.createTransformEntity();

// Level‑scoped entity (parented under active level) with an existing object
import { Object3D } from '@iwsdk/core';
const mesh = new Object3D();
const gltfEntity = world.createTransformEntity(mesh);
```

Add/remove components at any time:

```ts
gltfEntity.addComponent(Health, { current: 50, max: 150 });
gltfEntity.removeComponent(Health);
```

Get or set component values inside systems:

```ts
const hp = e.getValue(Health, 'current');
e.setValue(Health, 'current', hp! - 10);
```

## Components: typed schemas (no behavior)

Components declare fields using `Types.*`, defaults, and optional enums. IWSDK re‑exports elics types.

```ts
import { Types, createComponent } from '@iwsdk/core';

export const DamageOverTime = createComponent('DamageOverTime', {
  dps: { type: Types.Float32, default: 10 },
  duration: { type: Types.Float32, default: 3 },
});
```

Under the hood components are registered with the world and used by queries.

## Systems: queries + lifecycle + config signals

Use `createSystem(queries, schema)` to define:

- `queries`: named sets with `required` (and optionally `excluded`) components.
- `schema`: system config options; each key becomes a reactive `Signal` at `this.config.<key>`.

```ts
export class DamageSystem extends createSystem(
  {
    ticking: { required: [Health, DamageOverTime] },
  },
  {
    // Config is reactive: this.config.tickRate.value etc.
    tickRate: { type: Types.Float32, default: 10 },
  },
) {
  private timeAcc = 0;

  init() {
    // React when an entity newly matches a query
    this.queries.ticking.subscribe('qualify', (e) =>
      console.log('Damage starts', e.index),
    );
  }

  update(dt: number) {
    this.timeAcc += dt;
    const step = 1 / this.config.tickRate.peek();
    while (this.timeAcc >= step) {
      this.timeAcc -= step;
      for (const e of this.queries.ticking.entities) {
        const dps = e.getValue(DamageOverTime, 'dps')!;
        const cur = e.getValue(Health, 'current')!;
        e.setValue(Health, 'current', Math.max(0, cur - dps * step));
      }
    }
  }
}
```

Common lifecycle hooks:

- `init()` — set up event handlers, one‑time wiring, load assets.
- `update(delta, time)` — per‑frame logic; prefer iterating `this.queries.<name>.entities`.
- `destroy()` — clean up handlers and disposables.

## Queries: thinking in sets

Queries are declarative filters defined once; the ECS keeps their membership up‑to‑date as entities gain/lose components.

```ts
export class HUDSystem extends createSystem({
  panels: { required: [PanelUI], excluded: [ScreenSpace] },
}) {
  init() {
    // Called whenever an entity first satisfies the query
    this.queries.panels.subscribe('qualify', (e) =>
      console.log('panel ready', e.index),
    );
  }
}
```

Filter by values using predicates:

```ts
import { lt, isin } from '@iwsdk/core';

export class DangerHUD extends createSystem({
  lowHealth: { required: [Health], where: [lt(Health, 'current', 30)] },
  status: {
    required: [Status],
    where: [isin(Status, 'phase', ['combat', 'boss'])],
  },
}) {
  /* … */
}
```

## Config and Signals: runtime tuning

System config values are reactive signals (`@preact/signals`). Update them on the fly (from UI, devtools, etc.).

```ts
const damage = world.registerSystem(DamageSystem);
damage.config.tickRate.value = 20;
```

If you need a reactive vector view from a component field (e.g., `Types.Vec3`), use `getVectorView`:

```ts
const v = e.getVectorView(Transform, 'position'); // Float32Array view
v[0] += 1; // move +X
```

## World: the runtime container

The world owns Three.js, input, player rig, render loop, and runs systems.

```ts
import { World, SessionMode } from '@iwsdk/core';

const container = document.getElementById('scene') as HTMLDivElement;
const world = await World.create(container, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { enableLocomotion: true, enableGrabbing: true },
  level: '/glxf/Composition.glxf',
});
```

Useful world helpers:

- `createTransformEntity(object?, parentOrOptions?)` — create an entity plus `object3D` with a parent.
- `getActiveRoot()` / `getPersistentRoot()` — use for attaching Three.js nodes.
- `loadLevel(url)` — request a GLXF level; LevelSystem performs the work.

## Real-World Example: Interactive VR Objects

This shows how ECS handles a complete interactive VR feature — objects that glow when looked at, can be grabbed, and react to being touched:

```ts
import { World, Types, createComponent, createSystem, lt } from '@iwsdk/core';

// Components: pure data schemas
export const Interactable = createComponent('Interactable', {
  glowIntensity: { type: Types.Float32, default: 0 },
  maxGlow: { type: Types.Float32, default: 2 },
});

export const GazeTarget = createComponent('GazeTarget', {
  isGazedAt: { type: Types.Boolean, default: false },
});

// System: behavior that reacts to data
export class InteractiveGlowSystem extends createSystem(
  {
    // Entities that can glow but aren't at max intensity yet
    glowable: {
      required: [Interactable, GazeTarget],
      where: [lt(Interactable, 'glowIntensity', 2)],
    },
  },
  {
    glowSpeed: { type: Types.Float32, default: 3 },
  },
) {
  init() {
    // React when objects start/stop being gazed at
    this.queries.glowable.subscribe('qualify', (entity) => {
      console.log('Object can now glow:', entity.index);
    });
  }

  update(dt: number) {
    for (const entity of this.queries.glowable.entities) {
      const isGazed = entity.getValue(GazeTarget, 'isGazedAt')!;
      const current = entity.getValue(Interactable, 'glowIntensity')!;
      const max = entity.getValue(Interactable, 'maxGlow')!;

      // Glow up when gazed at, fade when not
      const target = isGazed ? max : 0;
      const newIntensity =
        current + (target - current) * this.config.glowSpeed.peek() * dt;

      entity.setValue(Interactable, 'glowIntensity', newIntensity);

      // Update Three.js material (IWSDK handles the binding)
      if (entity.object3D) {
        (entity.object3D as any).material.emissiveIntensity = newIntensity;
      }
    }
  }
}
```

**Why this showcases ECS power:**

- **Composition**: Any entity can be made interactive by adding `Interactable + GazeTarget`
- **Reactive queries**: System automatically processes objects as they enter/leave gaze
- **Performance**: Packed arrays make iterating thousands of objects fast
- **Tunable**: `glowSpeed` can be adjusted at runtime via config signals
- **Decoupled**: Gaze detection, grabbing, audio feedback could be separate systems

## Where to Go Next

- Learn each concept in depth:
- [World](/concepts/ecs/world) — scene ownership, level roots, XR lifecycle.
- [Entity](/concepts/ecs/entity) — lifecycle, parenting, object3D.
- [Component](/concepts/ecs/components) — schemas, enums, vectors, defaults.
- [System](/concepts/ecs/systems) — queries, lifecycle, config, cleanup.
- [Queries](/concepts/ecs/queries) — required/excluded, qualify/disqualify events.
- [Patterns & Tips](/concepts/ecs/patterns) — common patterns, pitfalls, and performance notes.
- [Architecture](/concepts/ecs/architecture) — deep dive into performance, memory layout, and WebXR integration.

- Explore the API pages under "API → core → UI/Scene/etc." to see real systems and components used by IWSDK.
