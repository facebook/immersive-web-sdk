---
title: ECS ↔ Three.js Interop
---

# ECS ↔ Three.js Interop

This is the **most important concept** to understand in IWSDK. Many developers get confused about when to use ECS vs Three.js APIs. This guide clarifies the relationship and shows you exactly how to work with both.

## The Core Problem: Two Different APIs

**The Confusion:**

```ts
// ❓ Which way should I move an object?

// Three.js way:
entity.object3D.position.x += 1;

// ECS way:
const pos = entity.getVectorView(Transform, 'position');
pos[0] += 1;
```

**The Answer:** Both work, but **ECS Transform data is the source of truth** - IWSDK automatically syncs to Three.js visuals.

## Mental Model: Data-Driven Visuals

Think of it this way:

```text
ECS Components (Data)     ←sync→     Three.js Objects (Visuals)
─────────────────────                ──────────────────────────
Transform { pos: [2,1,0] }  ────────→ object3D.position: Vector3(2,1,0)
Transform { rot: [0,0,0,1] } ────────→ object3D.quaternion: Quaternion(0,0,0,1)
Transform { scale: [1,1,1] } ────────→ object3D.scale: Vector3(1,1,1)

// ECS components store the authoritative state
// Three.js objects provide the visual representation
```

**Key Insight:** ECS components hold the **authoritative data**. Three.js objects are **synchronized views** of that data.

## How IWSDK Bridges the Two Worlds

### 1. Entity Creation Links ECS + Three.js

```ts
import { World } from '@iwsdk/core';

const world = await World.create(container);

// This creates BOTH an ECS entity AND a Three.js Object3D
const entity = world.createTransformEntity();

console.log(entity.index); // ECS entity ID: 42
console.log(entity.object3D); // Three.js Object3D instance
console.log(entity.hasComponent(Transform)); // true - ECS Transform component
```

**What happened:**

1. `createTransformEntity()` creates an ECS entity
2. Creates a Three.js `Object3D` and attaches it as `entity.object3D`
3. Adds a `Transform` component with position/rotation/scale data
4. Registers the entity for automatic sync via TransformSystem

### 2. TransformSystem Keeps Everything in Sync

IWSDK runs a built-in `TransformSystem` that automatically synchronizes:

```ts
// Every frame, TransformSystem does this internally:
for (const entity of this.queries.transforms.entities) {
  const transform = entity.getComponent(Transform);
  const object3D = entity.object3D;

  // Sync ECS data → Three.js visuals
  object3D.position.fromArray(transform.position);
  object3D.quaternion.fromArray(transform.orientation);
  object3D.scale.fromArray(transform.scale);
}
```

You never write this code - IWSDK handles it automatically.

## When to Use ECS vs Three.js APIs

### Use ECS APIs For:

**✅ Transform Updates:**

```ts
// Update position through ECS - gets synced to Three.js automatically
const pos = entity.getVectorView(Transform, 'position');
pos[0] += deltaX;
pos[1] += deltaY;
pos[2] += deltaZ;
```

**✅ Data-Driven Logic:**

```ts
// ECS Transform is the single source of truth
entity.setValue(Transform, 'position', [2, 1, -5]);
// Three.js object3D.position gets updated automatically
```

### Use Three.js APIs For:

**✅ Creating Meshes and Materials:**

```ts
import { BoxGeometry, MeshStandardMaterial, Mesh } from '@iwsdk/core';

const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshStandardMaterial({ color: 0xff0000 });
const mesh = new Mesh(geometry, material);

const entity = world.createTransformEntity(mesh);
```

**✅ Complex 3D Hierarchies:**

```ts
// Build a complex object with multiple parts
const parent = world.createTransformEntity();
const body = new Mesh(bodyGeometry, bodyMaterial);
const wheel1 = new Mesh(wheelGeometry, wheelMaterial);
const wheel2 = new Mesh(wheelGeometry, wheelMaterial);

parent.object3D.add(body);
parent.object3D.add(wheel1);
parent.object3D.add(wheel2);

// Position wheels relative to parent
wheel1.position.set(-1, -0.5, 1.2);
wheel2.position.set(1, -0.5, 1.2);
```

**✅ Visual Properties:**

```ts
// Set Three.js-specific properties
entity.object3D.name = 'MyObject';
entity.object3D.layers.set(1); // Render layer
entity.object3D.castShadow = true;
entity.object3D.receiveShadow = true;
```

## Common Patterns

### Pattern 1: Direct Three.js Updates (Recommended)

```ts
// Update Three.js object directly - immediate and familiar
entity.object3D.position.x += deltaX; // Move right
entity.object3D.position.y += deltaY; // Move up
entity.object3D.position.z += deltaZ; // Move forward

// Animate rotation over time
const time = performance.now() * 0.001;
entity.object3D.rotation.y = time; // Rotate around Y-axis
```

### Pattern 2: ECS Transform Updates

```ts
// Update position through ECS - syncs to Three.js automatically
const pos = entity.getVectorView(Transform, 'position');
pos[0] += deltaX; // Move right
pos[1] += deltaY; // Move up
pos[2] += deltaZ; // Move forward

// IWSDK's TransformSystem automatically updates:
// entity.object3D.position.set(pos[0], pos[1], pos[2])
```

## Parenting and Hierarchies

### Scene vs Level Roots

IWSDK provides two root contexts:

```ts
// Persistent objects (survive level changes)
const ui = world.createTransformEntity(undefined, { persistent: true });
// Attached to: world.getPersistentRoot() (the Scene)

// Level objects (cleaned up on level change)
const prop = world.createTransformEntity(); // default
// Attached to: world.getActiveRoot() (current level)
```

### Entity Parenting

```ts
const parent = world.createTransformEntity();
const child = world.createTransformEntity(undefined, { parent });

// Both ECS Transform and Three.js hierarchy are set up:
console.log(child.getValue(Transform, 'parent') === parent.index); // true
console.log(child.object3D.parent === parent.object3D); // true
```

## Frame Order and Timing

Understanding when things happen each frame:

```text
1. Input Systems (-4 priority) ─── Update controller/hand data
2. Game Logic Systems (0 priority) ─ Your gameplay code here
3. TransformSystem (1 priority) ── Sync ECS → Three.js
4. renderer.render(scene, camera) ─ Three.js draws the frame
```

**Key Rules:**

- Write game logic in **your systems** (priority 0 or negative)
- Never write code that runs **after** TransformSystem
- Three.js objects are automatically synced before rendering

## Common Pitfalls and Solutions

### ❌ Pitfall: Fighting the Sync System

```ts
// DON'T: Manually update Three.js and expect ECS to follow
entity.object3D!.position.x = 5; // This gets overwritten!

// DO: Update ECS and let TransformSystem sync
const pos = entity.getVectorView(Transform, 'position');
pos[0] = 5; // Three.js automatically updates
```

### ❌ Pitfall: Component vs Object3D Confusion

```ts
// DON'T: Store Three.js objects directly in components
// Keep ECS data separate from Three.js objects

// DO: Use Transform component for position/rotation/scale
// IWSDK handles the Object3D sync automatically
```

## Summary

**The Golden Rules:**

1. **ECS owns the data** - Transform components are the source of truth
2. **Three.js shows the data** - Object3D properties are synchronized views
3. **IWSDK handles sync** - TransformSystem runs automatically every frame
4. **Use ECS for logic** - Game systems should manipulate components
5. **Use Three.js for setup** - Materials, geometries, and visual properties

This interop system lets you leverage the best of both worlds: ECS's data-driven architecture for game logic, and Three.js's powerful rendering capabilities for visuals.
