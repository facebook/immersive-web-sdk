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
entity.setValue(Transform, 'position', [x + 1, y, z]);

// Vector view way:
const pos = entity.getVectorView(Transform, 'position');
pos[0] += 1;
```

**The Answer:** It depends on what you need, but **ECS is usually better** for game logic.

## Mental Model: Data-Driven Visuals

Think of it this way:

```text
ECS Components (Data)     ←sync→     Three.js Objects (Visuals)
─────────────────────                ──────────────────────────
Transform { pos: [2,1,0] }  ────────→ object3D.position: Vector3(2,1,0)
Transform { rot: [0,0,0,1] } ────────→ object3D.quaternion: Quaternion(0,0,0,1)
Transform { scale: [1,1,1] } ────────→ object3D.scale: Vector3(1,1,1)

Health { current: 75 }               → (no visual equivalent)
Mesh { geometry: 'box' }   ────────→ object3D.add(new Mesh(...))
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

**✅ Game Logic and Systems:**

```ts
export class MovementSystem extends createSystem({
  moving: { required: [Transform, Velocity] },
}) {
  update(dt: number) {
    for (const entity of this.queries.moving.entities) {
      const pos = entity.getVectorView(Transform, 'position');
      const vel = entity.getValue(Velocity, 'speed')!;

      pos[0] += vel * dt; // ECS way - data-driven
    }
  }
}
```

**✅ Query-Driven Behavior:**

```ts
// Only process entities near the player
export class ProximitySystem extends createSystem({
  nearby: {
    required: [Transform, Interactive],
    where: [lt(Transform, 'distanceToPlayer', 5)],
  },
}) {
  /* ... */
}
```

**✅ Component-Based Features:**

```ts
// Any entity with these components becomes grabbable
entity.addComponent(Grabbable);
entity.addComponent(RigidBody, { mass: 1.5 });
// GrabbingSystem automatically handles the rest
```

### Use Three.js APIs For:

**✅ Setting Up Meshes and Materials:**

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
const car = world.createTransformEntity();
const body = new Mesh(bodyGeometry, bodyMaterial);
const wheel1 = new Mesh(wheelGeometry, wheelMaterial);
const wheel2 = new Mesh(wheelGeometry, wheelMaterial);

car.object3D!.add(body);
car.object3D!.add(wheel1);
car.object3D!.add(wheel2);

// Position wheels relative to car body
wheel1.position.set(-1, -0.5, 1.2);
wheel2.position.set(1, -0.5, 1.2);
```

**✅ One-Time Setup:**

```ts
// Set names, layers, or other Three.js properties
entity.object3D!.name = 'PlayerWeapon';
entity.object3D!.layers.set(1); // Render layer
entity.object3D!.castShadow = true;
entity.object3D!.receiveShadow = true;
```

## Common Patterns

### Pattern 1: ECS Controls, Three.js Renders

```ts
// ECS system animates the data
export class RotateSystem extends createSystem({
  spinning: { required: [Transform, Spinner] },
}) {
  update(dt: number) {
    for (const entity of this.queries.spinning.entities) {
      const rotation = entity.getVectorView(Transform, 'orientation');
      const speed = entity.getValue(Spinner, 'speed')!;

      // Rotate around Y-axis
      const quaternion = new Quaternion();
      quaternion.setFromAxisAngle(new Vector3(0, 1, 0), speed * dt);

      const current = new Quaternion().fromArray(rotation);
      current.multiply(quaternion);
      rotation.set(...current.toArray());
    }
  }
}

// Three.js automatically shows the rotation (no additional code needed)
```

### Pattern 2: Reactive Materials

```ts
export class HealthIndicatorSystem extends createSystem({
  healthBars: { required: [Transform, Health, MeshMaterial] },
}) {
  update() {
    for (const entity of this.queries.healthBars.entities) {
      const health =
        entity.getValue(Health, 'current')! / entity.getValue(Health, 'max')!;
      const materialId = entity.getValue(MeshMaterial, 'id')!;

      // Update Three.js material based on ECS data
      const material = this.getMaterialById(materialId);
      material.color.setRGB(1 - health, health, 0); // Red to green
    }
  }
}
```

### Pattern 3: Physics Integration

```ts
export class PhysicsSync extends createSystem({
  rigidbodies: { required: [Transform, RigidBody] },
}) {
  update() {
    for (const entity of this.queries.rigidbodies.entities) {
      // Physics engine updates RigidBody component
      const physicsPos = entity.getValue(RigidBody, 'position')!;
      const physicsRot = entity.getValue(RigidBody, 'rotation')!;

      // Sync to ECS Transform (Three.js gets updated automatically)
      entity.setValue(Transform, 'position', physicsPos);
      entity.setValue(Transform, 'orientation', physicsRot);
    }
  }
}
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

### Manual Parenting

```ts
const parent = world.createTransformEntity();
const child = world.createTransformEntity(undefined, { parent });

// Both ECS Transform and Three.js hierarchy are set up:
console.log(child.getComponent(Transform).parent === parent); // true
console.log(child.object3D!.parent === parent.object3D); // true
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

### ❌ Pitfall: Bypassing Queries

```ts
// DON'T: Search for entities manually
for (const entity of world.entities) {
  if (entity.hasComponent(Health)) {
    // Slow and breaks ECS patterns
  }
}

// DO: Use queries in systems
export class HealthSystem extends createSystem({
  healthEntities: { required: [Health] },
}) {
  update() {
    for (const entity of this.queries.healthEntities.entities) {
      // Fast and ECS-friendly
    }
  }
}
```

### ❌ Pitfall: Component vs Object3D Confusion

```ts
// DON'T: Store Three.js objects in components
const BadComponent = createComponent('Bad', {
  mesh: { type: Types.Object, default: null }, // Breaks ECS data orientation
});

// DO: Reference by ID and lookup
const GoodComponent = createComponent('Good', {
  meshId: { type: Types.String, default: '' },
});
```

## Summary

**The Golden Rules:**

1. **ECS owns the data** - Transform components are the source of truth
2. **Three.js shows the data** - Object3D properties are synchronized views
3. **IWSDK handles sync** - TransformSystem runs automatically every frame
4. **Use ECS for logic** - Game systems should manipulate components
5. **Use Three.js for setup** - Materials, geometries, and visual properties

This interop system lets you leverage the best of both worlds: ECS's data-driven architecture for game logic, and Three.js's powerful rendering capabilities for visuals.
