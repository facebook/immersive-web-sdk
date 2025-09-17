---
title: Queries
---

# Queries

Queries define dynamic entity sets. Each query specifies:

- `required`: components an entity must have
- `excluded`: components an entity must not have (optional)
- `where`: value predicates on component fields (optional)

Membership updates automatically as entities gain/lose components and when relevant component values change.

## Defining Queries (required/excluded)

```ts
export class RenderUISystem extends createSystem({
  panels: { required: [PanelUI], excluded: [ScreenSpace] },
}) {
  /*…*/
}
```

## Value Predicates (`where`)

IWSDK re‑exports elics predicate helpers for readable, type‑safe value filters:

```ts
import { eq, ne, lt, le, gt, ge, isin, nin } from '@iwsdk/core';

export class DangerHUD extends createSystem({
  lowHealth: {
    required: [Health],
    where: [lt(Health, 'current', 30)],
  },
  statusBar: {
    required: [Status],
    where: [isin(Status, 'phase', ['combat', 'boss'])],
  },
}) {
  update() {
    // Only entities with Health.current < 30
    for (const e of this.queries.lowHealth.entities) {
      /* … */
    }
  }
}
```

Supported operators

- Equality/inequality: `eq`, `ne`
- Numeric comparisons: `lt`, `le`, `gt`, `ge`
- Set membership: `isin` (in), `nin` (not in)

Entity references

```ts
// Types.Entity fields are nullable entity references; test for null/non-null
export const Target = createComponent('Target', {
  entity: { type: Types.Entity, default: null },
});

export class Targeting extends createSystem({
  locked: { required: [Target], where: [ne(Target, 'entity', null)] },
  free: { required: [Target], where: [eq(Target, 'entity', null)] },
}) {
  /* … */
}
```

Notes

- Predicates can reference fields across different required components.
- Predicates on numeric fields validate against min/max if your schema defines them (see Components).
- Vector fields (Vec2/3/4) are exposed as typed arrays; if you need to filter by a vector field, prefer aliasing a numeric “key” (e.g., `radius`) and update that via `setValue`.

## How membership updates when values change

When you call `entity.setValue(Component, 'key', value)`, the ECS:

1. writes the value into the component’s storage
2. calls `updateEntityValue(entity, component)` to re‑evaluate queries whose `where` depends on that component

This happens automatically for scalar fields. For vector fields obtained via `getVectorView`, direct mutation does not trigger value re‑evaluation. If a query’s `where` depends on a vector field, update it through `setValue` (with a whole tuple) or keep a scalar mirror for filtering.

Live update diagram:

```text
entity.setValue(C,'hp',20) → QueryManager.updateEntityValue(entity,C)
  → re-evaluate queries with where on C → emit qualify/disqualify → update query.entities
```

## Reacting to membership changes

```ts
this.queries.panels.subscribe('qualify', (e) => {
  // attach resources exactly once when an entity starts matching
});
this.queries.panels.subscribe('disqualify', (e) => {
  // cleanup when it stops matching
});
```

## Iterating entities efficiently

```ts
for (const e of this.queries.panels.entities) {
  // per-frame work
}
```

Avoid nested O(N²) loops across two large queries; build an index (e.g., Map from id → entity) or tag associations during `qualify` and reuse.

## Advanced Query Examples

### Dynamic Difficulty Adjustment

```ts
export class DifficultySystem extends createSystem({
  // Only enemies that need difficulty scaling
  weakEnemies: {
    required: [Health, Enemy],
    where: [lt(Health, 'current', 20)],
  },
  strongEnemies: {
    required: [Health, Enemy],
    where: [gt(Health, 'current', 80)],
  },
  playerNearby: {
    required: [Player, Transform],
    where: [lt(Transform, 'distanceToPlayer', 10)],
  },
}) {
  update() {
    const playerCount = this.queries.playerNearby.entities.size;

    // Buff weak enemies when players are close
    if (playerCount > 0) {
      for (const enemy of this.queries.weakEnemies.entities) {
        const current = enemy.getValue(Health, 'current')!;
        enemy.setValue(Health, 'current', Math.min(100, current + 5));
      }
    }
  }
}
```

### Smart Resource Management

```ts
export class ResourceSystem extends createSystem({
  // Entities that need expensive updates
  highDetail: {
    required: [Mesh, Transform],
    where: [lt(Transform, 'distanceToCamera', 50)],
  },
  // Entities that can use cheap updates
  lowDetail: {
    required: [Mesh, Transform],
    where: [gt(Transform, 'distanceToCamera', 50)],
  },
  // Completely invisible (can skip entirely)
  invisible: {
    required: [Mesh, Visibility],
    where: [eq(Visibility, 'isVisible', false)],
  },
}) {
  update() {
    // Expensive processing only for nearby objects
    for (const entity of this.queries.highDetail.entities) {
      this.expensiveUpdate(entity);
    }

    // Cheap processing for distant objects
    for (const entity of this.queries.lowDetail.entities) {
      this.cheapUpdate(entity);
    }

    // Skip invisible entities entirely
    console.log(
      `Skipping ${this.queries.invisible.entities.size} invisible entities`,
    );
  }
}
```
