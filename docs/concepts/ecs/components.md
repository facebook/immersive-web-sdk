---
title: Component
---

# Component

Components are named, typed data schemas. They do not contain behavior. You attach them to entities to express state.

## Data vs Behavior Separation (Mental Model)

Think of components as database tables (columns are fields, rows are entities):

```text
Health table:
  entity_id | current | max
  ----------+---------+-----
        12  |   100   | 100
        37  |    25   | 100

Position table:
  entity_id |   x   |   y   |   z
  ----------+-------+-------+------
        12  |  0.0  |  1.7  |  0.0
```

Systems are pure logic that run queries over these tables and update values. No behavior lives in the component definitions.

## Defining a Component

```ts
import { Types, createComponent } from '@iwsdk/core';

export const Health = createComponent('Health', {
  current: { type: Types.Float32, default: 100 },
  max: { type: Types.Float32, default: 100 },
});
```

Supported types include `Types.Boolean`, numeric types (`Float32`, `Int32`, …), `Types.String`, `Types.Enum`, `Types.Object`, and vector types like `Types.Vec3`.

Numeric fields may specify `min`/`max`; enum fields require an `enum` map. `Types.Entity` stores an entity reference (index under the hood; `null` by default).

Note: IWSDK re‑exports `Types` and helpers from elics. The semantics are identical; you can import from `@iwsdk/core` for convenience.

## Enums

```ts
export const MovementMode = { Walk: 'walk', Fly: 'fly' } as const;
export const Locomotion = createComponent('Locomotion', {
  mode: { type: Types.Enum, enum: MovementMode, default: MovementMode.Walk },
});
```

## Attaching to Entities

```ts
entity.addComponent(Health, { current: 50 });
```

## Reading/Writing

```ts
const cur = entity.getValue(Health, 'current');
entity.setValue(Health, 'current', cur! + 10);
```

### Vectors and performance

For vector fields (`Vec2/3/4`), you can mutate in place using a typed view without allocations:

```ts
const pos = entity.getVectorView(Transform, 'position'); // Float32Array [x,y,z]
pos[0] += 1;
```

If a query uses value predicates on a vector field, update through `setValue` (with a full tuple) so queries re‑evaluate, or mirror a scalar field for filtering.

### Internal fields

If a component needs internal implementation details, prefix field names with `_`. Documentation and tools can hide these (IWSDK’s docs do).
