---
title: Transforms & 3D Math
---

# Transforms & 3D Math

Understanding 3D transformations is crucial for WebXR development. Objects need to be positioned, rotated, and scaled correctly to feel natural in virtual space. This guide covers the fundamentals with practical examples.

## The Three Pillars of 3D Transforms

Every 3D object has three fundamental properties:

```text
Transform = Position + Rotation + Scale

Position: [x, y, z]     → Where is it?
Rotation: [x, y, z, w]  → How is it oriented? (quaternion)
Scale:    [sx, sy, sz]  → How big is it?
```

In IWSDK, these are stored in the `Transform` component and automatically synced to Three.js.

## Position (Translation)

Position determines **where** an object exists in 3D space.

### Understanding 3D Coordinates

```text
IWSDK uses a right-handed coordinate system:
        +Y (up)
         |
         |
         |
    ---- 0 ---- +X (right)
        /
       /
    +Z (forward toward viewer)
```

**Real-world scale:** 1 unit = 1 meter (important for VR/AR)

### Working with Position

```ts
import { Transform } from '@iwsdk/core';

// Set absolute position
entity.setValue(Transform, 'position', [2, 1.7, -5]);
// Object appears 2m right, 1.7m up, 5m away

// Move relative to current position
const pos = entity.getVectorView(Transform, 'position');
pos[0] += 1; // Move 1 meter right
pos[1] += 0; // Same height
pos[2] -= 2; // Move 2 meters away
```

### Common Position Patterns

**Moving Forward Based on Orientation:**

```ts
export class MovementSystem extends createSystem({
  moving: { required: [Transform, Velocity] },
}) {
  update(dt: number) {
    for (const entity of this.queries.moving.entities) {
      const pos = entity.getVectorView(Transform, 'position');
      const rot = entity.getVectorView(Transform, 'orientation');
      const speed = entity.getValue(Velocity, 'speed')!;

      // Create forward vector from rotation
      const forward = new Vector3(0, 0, -1); // -Z is forward
      const quaternion = new Quaternion().fromArray(rot);
      forward.applyQuaternion(quaternion);

      // Move in that direction
      pos[0] += forward.x * speed * dt;
      pos[1] += forward.y * speed * dt;
      pos[2] += forward.z * speed * dt;
    }
  }
}
```

**Positioning Relative to Player:**

```ts
// Place object 2 meters in front of user
const playerPos = player.getVectorView(Transform, 'position');
const playerRot = player.getVectorView(Transform, 'orientation');

const forward = new Vector3(0, 0, -2); // 2 meters forward
forward.applyQuaternion(new Quaternion().fromArray(playerRot));

entity.setValue(Transform, 'position', [
  playerPos[0] + forward.x,
  playerPos[1] + forward.y,
  playerPos[2] + forward.z,
]);
```

## Rotation (Orientation)

Rotation determines **how** an object is oriented in 3D space.

### Quaternions vs Euler Angles

**IWSDK uses quaternions** `[x, y, z, w]` for rotation because:

✅ **No gimbal lock** - can represent any 3D rotation  
✅ **Smooth interpolation** - natural animation between rotations  
✅ **Efficient composition** - combining rotations is just multiplication  
✅ **WebXR standard** - matches what VR/AR hardware provides

❌ **Euler angles** `[pitch, yaw, roll]` have problems:

- Gimbal lock at certain angles
- Order dependency (XYZ vs YXZ gives different results)
- Difficult to interpolate smoothly

### Working with Rotation

```ts
// Identity rotation (no rotation)
entity.setValue(Transform, 'orientation', [0, 0, 0, 1]);

// Rotate around Y-axis (yaw/turn)
const yawQuat = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0), // Y-axis
  Math.PI / 4, // 45 degrees in radians
);
entity.setValue(Transform, 'orientation', yawQuat.toArray());

// Combine rotations
const currentRot = new Quaternion().fromArray(
  entity.getVectorView(Transform, 'orientation'),
);
const additionalRot = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  dt,
);
currentRot.multiply(additionalRot); // Apply additional rotation
entity.setValue(Transform, 'orientation', currentRot.toArray());
```

### Common Rotation Patterns

**Look At Target:**

```ts
export class LookAtSystem extends createSystem({
  lookers: { required: [Transform, LookAtTarget] },
}) {
  update() {
    for (const entity of this.queries.lookers.entities) {
      const pos = entity.getVectorView(Transform, 'position');
      const targetId = entity.getValue(LookAtTarget, 'entityId')!;
      const target = this.world.getEntityByIndex(targetId);

      if (target) {
        const targetPos = target.getVectorView(Transform, 'position');

        // Calculate look-at rotation
        const direction = new Vector3()
          .fromArray(targetPos)
          .sub(new Vector3().fromArray(pos))
          .normalize();

        const quaternion = new Quaternion().setFromUnitVectors(
          new Vector3(0, 0, -1), // Forward vector
          direction,
        );

        entity.setValue(Transform, 'orientation', quaternion.toArray());
      }
    }
  }
}
```

**Smooth Rotation Over Time:**

```ts
export class RotateSystem extends createSystem({
  spinning: { required: [Transform, Spinner] },
}) {
  update(dt: number) {
    for (const entity of this.queries.spinning.entities) {
      const rotation = entity.getVectorView(Transform, 'orientation');
      const speed = entity.getValue(Spinner, 'radiansPerSecond')!;

      // Create rotation delta
      const deltaQuat = new Quaternion().setFromAxisAngle(
        new Vector3(0, 1, 0), // Spin around Y
        speed * dt,
      );

      // Apply to current rotation
      const currentQuat = new Quaternion().fromArray(rotation);
      currentQuat.multiply(deltaQuat);

      // Update component
      const newRotation = currentQuat.toArray();
      rotation.set(newRotation);
    }
  }
}
```

**Convert from Euler Angles (when needed):**

```ts
// If you have pitch/yaw/roll from some source
const euler = new Euler(pitch, yaw, roll, 'YXZ'); // Order matters!
const quaternion = new Quaternion().setFromEuler(euler);
entity.setValue(Transform, 'orientation', quaternion.toArray());
```

## Scale

Scale determines **how big** an object appears.

### Understanding Scale Values

```ts
// Uniform scale (same in all directions)
entity.setValue(Transform, 'scale', [2, 2, 2]); // 2x bigger
entity.setValue(Transform, 'scale', [0.5, 0.5, 0.5]); // Half size

// Non-uniform scale
entity.setValue(Transform, 'scale', [2, 1, 0.5]);
// 2x wider, same height, half depth
```

### Scale in WebXR Context

**Real-world considerations:**

- Scale affects physics and collisions
- Users expect consistent sizing (door ≈ 2m tall)
- Very small/large scales can cause rendering issues

```ts
// Make object child-sized for interaction
entity.setValue(Transform, 'scale', [0.6, 0.6, 0.6]);

// Make text readable at distance
const distance = calculateDistanceToUser(entity);
const textScale = Math.max(0.5, distance * 0.1);
entity.setValue(Transform, 'scale', [textScale, textScale, textScale]);
```

## Local vs World Space

Understanding coordinate spaces is crucial for hierarchical objects.

### Coordinate Spaces Explained

```text
World Space: Global coordinate system (the scene)
├─ Car Entity (world position: [10, 0, 5])
    └─ Local Space: Relative to car
       ├─ Wheel (local position: [-2, -0.5, 1])
       └─ Door (local position: [0, 0, 1.5])
```

**World positions:** Where things actually are in the scene  
**Local positions:** Where things are relative to their parent

### Working with Coordinate Spaces

```ts
// Get world position of a child object
const worldPos = child.object3D!.getWorldPosition(new Vector3());

// Convert local point to world space
const localPoint = new Vector3(0, 0, -1); // 1 meter forward in local space
const worldPoint = localPoint.applyMatrix4(entity.object3D!.matrixWorld);

// Convert world point to local space
const worldPoint = new Vector3(5, 2, 0);
const localPoint = worldPoint.applyMatrix4(entity.object3D!.worldToLocal);
```

### Hierarchical Movement Example

```ts
export class CarSystem extends createSystem({
  cars: { required: [Transform, Vehicle] },
  wheels: { required: [Transform, Wheel] },
}) {
  update(dt: number) {
    for (const car of this.queries.cars.entities) {
      // Move car in world space
      const carPos = car.getVectorView(Transform, 'position');
      const speed = car.getValue(Vehicle, 'speed')!;
      carPos[0] += speed * dt;

      // Rotate wheels in local space (relative to car)
      for (const wheel of this.queries.wheels.entities) {
        if (this.isChildOf(wheel, car)) {
          const wheelRot = wheel.getVectorView(Transform, 'orientation');
          const wheelSpeed = speed / 0.5; // wheel radius

          const deltaRot = new Quaternion().setFromAxisAngle(
            new Vector3(1, 0, 0), // rotate around X-axis
            wheelSpeed * dt,
          );

          const currentRot = new Quaternion().fromArray(wheelRot);
          currentRot.multiply(deltaRot);
          wheelRot.set(...currentRot.toArray());
        }
      }
    }
  }
}
```

## Performance Optimization

### Use Vector Views for Hot Paths

```ts
// ❌ Slower: creates new arrays
entity.setValue(Transform, 'position', [x + dx, y + dy, z + dz]);

// ✅ Faster: direct array access
const pos = entity.getVectorView(Transform, 'position');
pos[0] += dx;
pos[1] += dy;
pos[2] += dz;
```

### Batch Transforms

```ts
export class BatchTransformSystem extends createSystem({
  moving: { required: [Transform, Velocity] },
}) {
  update(dt: number) {
    // Process all entities with same calculation pattern together
    for (const entity of this.queries.moving.entities) {
      const pos = entity.getVectorView(Transform, 'position');
      const vel = entity.getValue(Velocity, 'vector')!;

      // Simple vector math - very fast
      pos[0] += vel[0] * dt;
      pos[1] += vel[1] * dt;
      pos[2] += vel[2] * dt;
    }
  }
}
```

### Avoid Unnecessary Calculations

```ts
// ❌ Recalculating every frame
const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);

// ✅ Cache when rotation doesn't change
export class CachedMovement extends createSystem({
  movers: { required: [Transform, CachedForward] },
}) {
  init() {
    this.queries.movers.subscribe('qualify', (entity) => {
      this.updateCachedForward(entity);
    });
  }

  updateCachedForward(entity: Entity) {
    const rotation = entity.getVectorView(Transform, 'orientation');
    const forward = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion().fromArray(rotation),
    );
    entity.setValue(CachedForward, 'vector', forward.toArray());
  }
}
```

## Summary

**Key Takeaways:**

1. **Position** `[x, y, z]` - where objects exist in meters
2. **Rotation** `[x, y, z, w]` - quaternions for orientation (no gimbal lock)
3. **Scale** `[sx, sy, sz]` - size multipliers
4. **Use vector views** for performance in hot paths
5. **IWSDK syncs automatically** - update ECS, visuals follow
6. **WebXR scale matters** - 1 unit = 1 meter in real space
7. **Understand coordinate spaces** - local vs world for hierarchical objects

Understanding these fundamentals enables you to build natural-feeling VR/AR experiences where objects move, rotate, and scale predictably in 3D space.
