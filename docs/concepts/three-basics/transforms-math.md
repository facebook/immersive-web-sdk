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
// Set absolute position
entity.object3D.position.set(2, 1.7, -5);
// Object appears 2m right, 1.7m up, 5m away

// Move relative to current position
entity.object3D.position.x += 1; // Move 1 meter right
entity.object3D.position.y += 0; // Same height
entity.object3D.position.z -= 2; // Move 2 meters away

// Or using ECS Transform for data-driven updates
const pos = entity.getVectorView(Transform, 'position');
pos[0] += 1; // Move 1 meter right
pos[2] -= 2; // Move 2 meters away
```

### Common Position Patterns

**Moving Forward Based on Orientation:**

```ts
// Create forward vector from object's rotation
const forward = new Vector3(0, 0, -1); // -Z is forward
forward.applyQuaternion(entity.object3D.quaternion);

// Move in that direction
entity.object3D.position.add(forward.multiplyScalar(speed * deltaTime));
```

**Positioning Relative to Another Object:**

```ts
// Place object 2 meters in front of another object
const forward = new Vector3(0, 0, -2); // 2 meters forward
forward.applyQuaternion(referenceObject.quaternion);

entity.object3D.position.copy(referenceObject.position).add(forward);
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
entity.object3D.quaternion.set(0, 0, 0, 1);

// Rotate around Y-axis (yaw/turn)
const yawQuat = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0), // Y-axis
  Math.PI / 4, // 45 degrees in radians
);
entity.object3D.quaternion.copy(yawQuat);

// Combine rotations
const additionalRot = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  deltaTime,
);
entity.object3D.quaternion.multiply(additionalRot);
```

### Common Rotation Patterns

**Look At Target:**

```ts
// Make object look at a target position
const targetPosition = new Vector3(5, 0, 0);
entity.object3D.lookAt(targetPosition);

// Or calculate direction manually
const direction = new Vector3()
  .subVectors(targetPosition, entity.object3D.position)
  .normalize();

const quaternion = new Quaternion().setFromUnitVectors(
  new Vector3(0, 0, -1), // Forward vector
  direction,
);
entity.object3D.quaternion.copy(quaternion);
```

**Rotation Over Time:**

```ts
// Rotate continuously around Y-axis
const rotationSpeed = Math.PI; // radians per second
const deltaQuat = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0), // Y-axis
  rotationSpeed * deltaTime,
);
entity.object3D.quaternion.multiply(deltaQuat);
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
entity.object3D.scale.set(2, 2, 2); // 2x bigger
entity.object3D.scale.set(0.5, 0.5, 0.5); // Half size

// Non-uniform scale
entity.object3D.scale.set(2, 1, 0.5);
// 2x wider, same height, half depth
```

### Scale in WebXR Context

**Real-world considerations:**

- Users expect consistent sizing (door ≈ 2m tall)
- Very small/large scales can cause rendering issues
- Consider user interaction when sizing objects

```ts
// Make object child-sized for interaction
entity.object3D.scale.set(0.6, 0.6, 0.6);

// Scale text based on distance for readability
const distance = entity.object3D.position.distanceTo(camera.position);
const textScale = Math.max(0.5, distance * 0.1);
entity.object3D.scale.set(textScale, textScale, textScale);
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
// Create a car with wheels as children
const car = world.createTransformEntity();
const wheel1 = new Mesh(wheelGeometry, wheelMaterial);
const wheel2 = new Mesh(wheelGeometry, wheelMaterial);

car.object3D.add(wheel1);
car.object3D.add(wheel2);

// Position wheels relative to car
wheel1.position.set(-1, -0.5, 1.2);
wheel2.position.set(1, -0.5, 1.2);

// Move car - wheels follow automatically
car.object3D.position.x += speed * deltaTime;

// Rotate wheels in local space
wheel1.rotateX((speed * deltaTime) / wheelRadius);
wheel2.rotateX((speed * deltaTime) / wheelRadius);
```

## Performance Optimization

### Direct Object3D vs ECS Updates

```ts
// For frequent updates, direct Three.js can be faster
entity.object3D.position.x += deltaX;
entity.object3D.position.y += deltaY;
entity.object3D.position.z += deltaZ;

// For data-driven updates, use ECS Transform
const pos = entity.getVectorView(Transform, 'position');
pos[0] += deltaX;
pos[1] += deltaY;
pos[2] += deltaZ;
```

### Avoid Unnecessary Calculations

```ts
// ❌ Recalculating every frame
const forward = new Vector3(0, 0, -1).applyQuaternion(
  entity.object3D.quaternion,
);

// ✅ Reuse vectors when possible
const forward = new Vector3(0, 0, -1);
forward.applyQuaternion(entity.object3D.quaternion);

// ✅ Cache complex calculations
let lastRotation = entity.object3D.quaternion.clone();
let cachedForward = new Vector3(0, 0, -1).applyQuaternion(lastRotation);

if (!entity.object3D.quaternion.equals(lastRotation)) {
  lastRotation.copy(entity.object3D.quaternion);
  cachedForward.set(0, 0, -1).applyQuaternion(lastRotation);
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
