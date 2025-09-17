---
title: Patterns & Tips
---

# Patterns & Tips

## One entity, many features

Prefer small components that compose:

```ts
player.addComponent(Health);
player.addComponent(Wallet);
player.addComponent(Locomotion, { mode: MovementMode.Walk });
```

## Events via qualify/disqualify

Use query events to perform expensive setup once:

```ts
this.queries.panels.subscribe('qualify', (e) => {
  /* load UI config, attach */
});
this.queries.panels.subscribe('disqualify', (e) => {
  /* cleanup */
});
```

## Avoid O(N²)

When relating two sets, build an index or tag results to avoid nested loops each frame.

## Keep schema public, hide internals

If a component needs internal fields for systems, prefix with `_` so docs and tools can hide them.

## Debugging

- Log query sizes in `update()` to spot performance issues.
- Temporarily expose config signals to tweak behavior from devtools.

## ECS vs OOP (Why composition wins)

- Composition scales: add/remove components at runtime to change behavior.
- No inheritance diamonds: independent systems operate on shared data safely.
- Testability: systems are plain functions over data; easy to unit test with fake entities/components.

## Performance Mental Models

- Columnar storage keeps per‑field arrays tightly packed → better cache behavior.
- Queries precompute masks and track membership; iterate query.entities directly.
- Prefer numbers/enums over nested objects in components.
- Use `getVectorView` to avoid allocations in hot paths.

## WebXR Integration Notes

- XR session visibility affects when your systems should do heavy work; check `world.visibilityState`.
- Input/locomotion should run at high priority (more negative) to avoid visual lag.

## Advanced Composition Patterns

### State Machine Components

Use enum components to drive complex behaviors:

```ts
const PlayerState = {
  Idle: 'idle',
  Walking: 'walking',
  Grabbing: 'grabbing',
} as const;
const PlayerController = createComponent('PlayerController', {
  state: { type: Types.Enum, enum: PlayerState, default: PlayerState.Idle },
  previousState: {
    type: Types.Enum,
    enum: PlayerState,
    default: PlayerState.Idle,
  },
});

// Different systems handle different states
export class WalkingSystem extends createSystem({
  walkers: {
    required: [PlayerController],
    where: [eq(PlayerController, 'state', 'walking')],
  },
}) {
  /* handle walking logic */
}

export class GrabbingSystem extends createSystem({
  grabbers: {
    required: [PlayerController],
    where: [eq(PlayerController, 'state', 'grabbing')],
  },
}) {
  /* handle grab logic */
}
```

### Component Flags for Optimization

Use boolean flags to control expensive operations:

```ts
const OptimizationFlags = createComponent('OptimizationFlags', {
  isDirty: { type: Types.Boolean, default: false },
  isVisible: { type: Types.Boolean, default: true },
  needsLODUpdate: { type: Types.Boolean, default: false },
});

// Only process dirty, visible objects
export class ExpensiveSystem extends createSystem({
  targets: {
    required: [SomeComponent, OptimizationFlags],
    where: [
      eq(OptimizationFlags, 'isDirty', true),
      eq(OptimizationFlags, 'isVisible', true),
    ],
  },
}) {
  update() {
    for (const entity of this.queries.targets.entities) {
      // Do expensive work
      this.doExpensiveWork(entity);
      // Mark clean
      entity.setValue(OptimizationFlags, 'isDirty', false);
    }
  }
}
```

### Hierarchical System Communication

Use parent-child relationships for coordinated behavior:

```ts
// Parent entity coordinates children
export class SquadLeaderSystem extends createSystem({
  squads: { required: [SquadLeader, Transform] },
}) {
  update() {
    for (const leader of this.queries.squads.entities) {
      // Find all squad members (children with SquadMember component)
      const members = this.findChildrenWithComponent(leader, SquadMember);
      this.coordinateSquad(leader, members);
    }
  }

  private findChildrenWithComponent(parent: Entity, component: Component) {
    // Walk transform hierarchy looking for component
    return (
      parent.object3D?.children
        .map((child) => this.world.getEntityByObject3D(child))
        .filter((entity) => entity?.hasComponent(component)) || []
    );
  }
}
```

### Performance-Critical Patterns

#### Batch Processing

Process entities in chunks to maintain frame rate:

```ts
export class BatchedSystem extends createSystem(
  {
    targets: { required: [ExpensiveComponent] },
  },
  {
    batchSize: { type: Types.Int32, default: 50 },
  },
) {
  private currentIndex = 0;

  update() {
    const entities = Array.from(this.queries.targets.entities);
    const batchSize = this.config.batchSize.peek();

    // Process only a subset each frame
    for (let i = 0; i < batchSize && this.currentIndex < entities.length; i++) {
      this.processEntity(entities[this.currentIndex]);
      this.currentIndex++;
    }

    // Wrap around when done
    if (this.currentIndex >= entities.length) {
      this.currentIndex = 0;
    }
  }
}
```

#### Pooled Entity Pattern

Reuse entities instead of creating/destroying frequently:

```ts
export class ProjectileSystem extends createSystem(
  {
    active: { required: [Projectile, Transform] },
    inactive: { required: [Projectile], excluded: [Transform] },
  },
  {
    poolSize: { type: Types.Int32, default: 100 },
  },
) {
  init() {
    // Pre-create pooled entities
    for (let i = 0; i < this.config.poolSize.peek(); i++) {
      const entity = this.createEntity();
      entity.addComponent(Projectile);
      // Start inactive (no Transform = not in scene)
    }
  }

  spawnProjectile(position: [number, number, number]) {
    // Reuse inactive entity
    const entity = this.queries.inactive.entities[0];
    if (entity) {
      entity.addComponent(Transform, { position });
      // Now active (has Transform)
    }
  }

  update() {
    for (const entity of this.queries.active.entities) {
      // Move projectile
      if (this.shouldDespawn(entity)) {
        entity.removeComponent(Transform); // Back to pool
      }
    }
  }
}
```

## Common Anti-Patterns to Avoid

### ❌ Storing References in Components

```ts
// Bad: storing objects breaks ECS data orientation
const BadComponent = createComponent('Bad', {
  mesh: { type: Types.Object, default: null }, // Three.js mesh object
  callbacks: { type: Types.Object, default: [] }, // Function array
});
```

```ts
// Good: use indices/IDs and lookup in systems
const GoodComponent = createComponent('Good', {
  meshId: { type: Types.String, default: '' },
  callbackTypes: { type: Types.String, default: '' }, // comma-separated
});
```

### ❌ Fat Components

```ts
// Bad: kitchen sink component
const PlayerComponent = createComponent('Player', {
  health: { type: Types.Float32, default: 100 },
  ammo: { type: Types.Int32, default: 30 },
  experience: { type: Types.Int32, default: 0 },
  inventory: { type: Types.Object, default: {} },
  achievements: { type: Types.Object, default: {} },
});
```

```ts
// Good: focused, composable components
const Health = createComponent('Health', { current: ..., max: ... });
const Inventory = createComponent('Inventory', { itemIds: ..., capacity: ... });
const Experience = createComponent('Experience', { points: ..., level: ... });
```

### ❌ Systems Doing Too Much

```ts
// Bad: god system
export class PlayerSystem extends createSystem({
  players: { required: [Player] },
}) {
  update() {
    for (const player of this.queries.players.entities) {
      this.updateHealth(player);
      this.updateMovement(player);
      this.updateInventory(player);
      this.updateAchievements(player);
      this.updateUI(player);
      this.playAudio(player);
    }
  }
}
```

```ts
// Good: focused systems
export class HealthSystem extends createSystem(...)
export class MovementSystem extends createSystem(...)
export class InventorySystem extends createSystem(...)
// Each system handles one concern
```
