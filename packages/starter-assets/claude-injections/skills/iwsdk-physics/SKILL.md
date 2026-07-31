---
name: iwsdk-physics
description: Guide for implementing physics in IWSDK projects. Use when adding physics simulation, configuring rigid bodies, collision shapes, applying forces, creating grabbable physics objects, or troubleshooting physics behavior.
---

# IWSDK Physics System Guide

This skill provides the complete reference and workflow for implementing Havok-powered physics simulation in IWSDK applications. Physics is built on three ECS components (`PhysicsBody`, `PhysicsShape`, `PhysicsManipulation`) orchestrated by the `PhysicsSystem`.

## Enabling Physics

Enable physics in `World.create` with the `physics` feature flag:

```typescript
import { World, SessionMode } from '@iwsdk/core';

const world = await World.create(container, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: {
    physics: true,
    grabbing: true, // Required if physics objects should be grabbable
    locomotion: true, // Requires collision geometry in the scene
  },
  level: './scenes/physics.iwsdk.scene.json',
});
```

Setting `physics: true` automatically registers `PhysicsBody`, `PhysicsShape`, `PhysicsManipulation` components and the `PhysicsSystem` at priority `-2`.

**Only enable physics when needed.** If no objects require dynamic simulation, omit it to avoid overhead.

## PhysicsBody Component Reference

Defines the motion behavior of a physics entity. Import from `@iwsdk/core`.

```typescript
import { PhysicsBody, PhysicsState } from '@iwsdk/core';

entity.addComponent(PhysicsBody, {
  state: PhysicsState.Dynamic,
  linearDamping: 0.0,
  angularDamping: 0.0,
  gravityFactor: 1.0,
  centerOfMass: [Infinity, Infinity, Infinity], // Infinity = auto-compute from shape
});
```

**Properties:**

| Property         | Type           | Default                          | Description                                           |
| ---------------- | -------------- | -------------------------------- | ----------------------------------------------------- |
| `state`          | `PhysicsState` | `Dynamic`                        | Motion type (see below)                               |
| `linearDamping`  | `Float32`      | `0.0`                            | Air resistance for translation (0 = none, 1 = heavy)  |
| `angularDamping` | `Float32`      | `0.0`                            | Air resistance for rotation                           |
| `gravityFactor`  | `Float32`      | `1.0`                            | Gravity multiplier (0 = floating, 2 = double gravity) |
| `centerOfMass`   | `Vec3`         | `[Infinity, Infinity, Infinity]` | Override center of mass; `Infinity` = auto-compute    |

**Read-only properties** (updated each frame by `PhysicsSystem`):

| Property           | Type   | Description              |
| ------------------ | ------ | ------------------------ |
| `_linearVelocity`  | `Vec3` | Current linear velocity  |
| `_angularVelocity` | `Vec3` | Current angular velocity |

### PhysicsState Enum

```typescript
PhysicsState.Static; // Immovable (walls, floors). Zero simulation cost.
PhysicsState.Dynamic; // Fully simulated. Responds to forces, gravity, collisions.
PhysicsState.Kinematic; // Programmatically moved. Pushes dynamic bodies but is not affected by them.
```

**When to use each:**

- **Static** -- Environment geometry (walls, floors, tables). Objects that never move but block dynamic bodies.
- **Dynamic** -- Objects that respond to physics (balls, crates, interactive props). Default for most gameplay objects.
- **Kinematic** -- Moving platforms that won't be pushed by other physics bodies.

## PhysicsShape Component Reference

Defines the collision geometry and material properties. Both `PhysicsShape` and `PhysicsBody` are required for physics simulation.

```typescript
import { PhysicsShape, PhysicsShapeType } from '@iwsdk/core';

entity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Auto,
  dimensions: [0, 0, 0],
  density: 1.0,
  restitution: 0.0,
  friction: 0.5,
});
```

**Properties:**

| Property      | Type               | Default     | Description                                                                           |
| ------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------- |
| `shape`       | `PhysicsShapeType` | `Auto`      | Collision shape type                                                                  |
| `dimensions`  | `Vec3`             | `[0, 0, 0]` | Shape-specific dimensions array. Not applicable when `PhysicsShapeType.Auto` is used. |
| `density`     | `Float32`          | `1.0`       | Mass density (kg/m^3). Higher = heavier.                                              |
| `restitution` | `Float32`          | `0.0`       | Bounciness (0 = no bounce, 1 = perfect bounce)                                        |
| `friction`    | `Float32`          | `0.5`       | Surface friction (0 = ice, 1 = rubber)                                                |

### PhysicsShapeType Enum

```typescript
PhysicsShapeType.Sphere; // dimensions[0] = radius
PhysicsShapeType.Box; // dimensions = [width, height, depth]
PhysicsShapeType.Cylinder; // dimensions[0] = radius, dimensions[1] = height
PhysicsShapeType.Capsules; // dimensions[0] = radius, dimensions[1] = total height (>= 2 * radius)
PhysicsShapeType.ConvexHull; // Convex wrapper around mesh vertices (dimensions ignored)
PhysicsShapeType.TriMesh; // Exact mesh triangles (dimensions ignored). Expensive; use for static only.
PhysicsShapeType.Auto; // Auto-detect from Three.js geometry type
```

### Dimensions by Shape Type

The `dimensions` property is a `Vec3` (`[x, y, z]`) whose meaning changes depending on the selected shape:

| Shape Type   | `dimensions[0]` | `dimensions[1]` | `dimensions[2]` | Example                         |
| ------------ | --------------- | --------------- | --------------- | ------------------------------- |
| `Sphere`     | radius          | _(unused)_      | _(unused)_      | `[0.5, 0, 0]` -- sphere r=0.5   |
| `Box`        | width           | height          | depth           | `[1, 2, 0.5]` -- 1×2×0.5 box    |
| `Cylinder`   | radius          | height          | _(unused)_      | `[0.3, 1.5, 0]` -- r=0.3, h=1.5 |
| `Capsules`   | radius          | total height    | _(unused)_      | `[0.3, 1.5, 0]` -- r=0.3, h=1.5 |
| `ConvexHull` | _(ignored)_     | _(ignored)_     | _(ignored)_     | Computed from mesh vertices     |

Capsule total height is measured end to end and must be at least twice its
radius. A total height equal to the diameter produces a sphere-length capsule.
| `TriMesh` | _(ignored)_ | _(ignored)_ | _(ignored)_ | Computed from mesh triangles |
| `Auto` | _(ignored)_ | _(ignored)_ | _(ignored)_ | Auto-detected from geometry |

For `ConvexHull`, `TriMesh`, and `Auto`, the dimensions array is not used -- the shape is derived directly from the entity's Three.js geometry.

**Auto-detection mapping:**

| Three.js Geometry               | Detected Shape | Dimensions Source                               |
| ------------------------------- | -------------- | ----------------------------------------------- |
| `SphereGeometry`                | Sphere         | `radius` from geometry parameters               |
| `BoxGeometry`                   | Box            | `width, height, depth` from parameters          |
| `PlaneGeometry`                 | Box            | `width, height, 0.01` (thin box)                |
| `CylinderGeometry`              | Cylinder       | Average of `radiusTop`/`radiusBottom`, `height` |
| `BufferGeometry` (generic/GLTF) | ConvexHull     | From mesh vertices                              |
| Unknown                         | Box (fallback) | From bounding box                               |

**Performance guidance:**

- Sphere/Box/Cylinder: Fastest collision detection. Prefer these when possible.
- ConvexHull: Good balance for complex meshes. Default for GLTF models via Auto.
- TriMesh: Exact geometry collision. Use only for static objects (walls, floors, terrain).

## PhysicsManipulation Component Reference

A **one-shot** component for applying forces and velocities. Automatically removed after one frame.

```typescript
import { PhysicsManipulation } from '@iwsdk/core';

// Apply an impulse (removed automatically after 1 frame)
entity.addComponent(PhysicsManipulation, {
  force: [0, 10, 0], // Impulse force vector
  linearVelocity: [0, 0, 0], // Override linear velocity (0 = no change)
  angularVelocity: [0, 0, 0], // Override angular velocity (0 = no change)
});
```

**Properties:**

| Property          | Type   | Default     | Description                             |
| ----------------- | ------ | ----------- | --------------------------------------- |
| `force`           | `Vec3` | `[0, 0, 0]` | Impulse force applied at center of mass |
| `linearVelocity`  | `Vec3` | `[0, 0, 0]` | Sets absolute linear velocity           |
| `angularVelocity` | `Vec3` | `[0, 0, 0]` | Sets absolute angular velocity          |

**The component is auto-removed** by `PhysicsSystem` after applying values. For sustained forces, re-add each frame:

```typescript
update() {
  if (!entity.hasComponent(PhysicsManipulation)) {
    entity.addComponent(PhysicsManipulation, { force: [0, 5, 0] });
  }
}
```

## Common Workflows

### Creating a Dynamic Physics Object

```typescript
import {
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  FrontSide,
} from 'three';
import {
  PhysicsShape,
  PhysicsShapeType,
  PhysicsBody,
  PhysicsState,
  PhysicsManipulation,
} from '@iwsdk/core';

// 1. Create Three.js mesh
const ball = new Mesh(
  new SphereGeometry(0.2),
  new MeshStandardMaterial({ color: new Color(0xff4444), side: FrontSide }),
);
ball.position.set(0, 2, -1);

// 2. Wrap as ECS entity
const entity = world.createTransformEntity(ball);

// 3. Add physics components
entity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Sphere,
  dimensions: [0.2, 0, 0],
  restitution: 0.6, // Bouncy
});
entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

// 4. Optional: apply initial impulse
entity.addComponent(PhysicsManipulation, { force: [5, 2, 0] });
```

### Creating a Static Environment Collider

For walls, floors, and fixed scenery that block dynamic objects but never move:

```typescript
// Ground plane
const ground = new Mesh(
  new BoxGeometry(10, 0.1, 10),
  new MeshStandardMaterial({ color: 0x888888 }),
);
ground.position.set(0, -0.05, 0);

const groundEntity = world.createTransformEntity(ground);
groundEntity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Box,
  dimensions: [10, 0.1, 10],
  friction: 0.8,
});
groundEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });
```

For complex static geometry (GLTF environments), use `TriMesh` for exact collision:

```typescript
envEntity.addComponent(PhysicsShape, { shape: PhysicsShapeType.TriMesh });
envEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });
```

### Creating a Kinematic Moving Platform

Kinematic bodies are moved by code and push dynamic objects:

```typescript
// Setup
const platform = new Mesh(
  new BoxGeometry(3, 0.2, 3),
  new MeshStandardMaterial({ color: 0x4488ff }),
);

const platformEntity = world.createTransformEntity(platform);
platformEntity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Box,
  dimensions: [3, 0.2, 3],
});
platformEntity.addComponent(PhysicsBody, { state: PhysicsState.Kinematic });

// In a system's update loop, move it:
update(delta, time) {
  for (const entity of this.queries.platforms.entities) {
    entity.object3D.position.y = 1 + Math.sin(time) * 2;
  }
}
```

### Resetting or Teleporting an Existing Body

Do not remove/re-add physics components or write only to the Object3D of a dynamic
body. Use the live physics system so Havok and the render transform update together:

```typescript
import { PhysicsSystem } from '@iwsdk/core';

const physics = world.getSystem(PhysicsSystem);
physics.setBodyTransform(entity, {
  position: homePosition,
  quaternion: homeQuaternion,
});
```

Velocity is cleared by default. Pass `{ resetVelocity: false }` only when a teleport
must preserve motion. `gravityFactor`, `linearDamping`, and `angularDamping` can be
changed reactively with `entity.setValue`; changing motion state or shape requires
deliberate body lifecycle handling.

### Making an Object Grabbable with Physics

Combine grab components with physics for throwable objects:

```typescript
import {
  RayInteractable,
  OneHandGrabbable,
  DistanceGrabbable,
} from '@iwsdk/core';

// Physics components
entity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto });
entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

// Grab components
entity.addComponent(RayInteractable);
entity.addComponent(OneHandGrabbable);

// Optional: allow grabbing from a distance
entity.addComponent(DistanceGrabbable, {
  rotate: true,
  translate: true,
});
```

When grabbed, the `GrabSystem` drives the held body kinematically (via `HP_Body_SetTargetQTransform`), making the object follow the hand. On release, the object resumes dynamic simulation with natural velocity for realistic throwing. Note: near-field grabs do not add `Hovered`/`Pressed` tags — assert grab behavior with ECS snapshot/diff, not tag queries.

### Reading Velocity for Game Logic

```typescript
const velocity = entity.getVectorView(PhysicsBody, '_linearVelocity');
const speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);

if (speed > 5.0) {
  // High-speed impact logic
}
```

### Explosion Pattern (Radial Force)

Apply outward force to all nearby physics objects:

```typescript
const explosionPos = bomb.object3D.position;
const radius = 5.0;
const force = 50.0;

for (const target of this.queries.physicsObjects.entities) {
  const dist = target.object3D.position.distanceTo(explosionPos);
  if (dist < radius && dist > 0) {
    const direction = target.object3D.position
      .clone()
      .sub(explosionPos)
      .normalize();
    const strength = force * (1 - dist / radius);
    target.addComponent(PhysicsManipulation, {
      force: direction.multiplyScalar(strength).toArray(),
    });
  }
}
```

## Custom Physics System Pattern

Create domain-specific components that interact with the physics system:

```typescript
import {
  createComponent,
  createSystem,
  Types,
  PhysicsBody,
  PhysicsManipulation,
} from '@iwsdk/core';

// 1. Define custom component
export const Buoyancy = createComponent('Buoyancy', {
  waterLevel: { type: Types.Float32, default: 0.0 },
  buoyancyForce: { type: Types.Float32, default: 15.0 },
});

// 2. Create system that applies physics forces
export class BuoyancySystem extends createSystem({
  floaters: { required: [Buoyancy, PhysicsBody] },
}) {
  update(delta) {
    for (const entity of this.queries.floaters.entities) {
      const waterLevel = entity.getValue(Buoyancy, 'waterLevel');
      const force = entity.getValue(Buoyancy, 'buoyancyForce');
      const y = entity.object3D.position.y;

      if (y < waterLevel) {
        const submersion = Math.min(1, (waterLevel - y) / 0.5);
        if (!entity.hasComponent(PhysicsManipulation)) {
          entity.addComponent(PhysicsManipulation, {
            force: [0, force * submersion * delta, 0],
          });
        }
      }
    }
  }
}

// 3. Register with world
world.registerComponent(Buoyancy);
world.registerSystem(BuoyancySystem, { priority: 5 });
```

## Material Tuning Guide

Adjust `density`, `restitution`, and `friction` on `PhysicsShape` to simulate different materials:

| Material    | Density | Restitution | Friction |
| ----------- | ------- | ----------- | -------- |
| Wood        | 0.6     | 0.3         | 0.5      |
| Metal/Steel | 7.8     | 0.2         | 0.4      |
| Rubber      | 1.1     | 0.8         | 0.9      |
| Ice         | 0.9     | 0.1         | 0.05     |
| Concrete    | 2.4     | 0.1         | 0.7      |
| Foam/Light  | 0.05    | 0.1         | 0.6      |
| Bouncy ball | 1.0     | 0.95        | 0.5      |

## System Priority Order

Physics runs in a carefully orchestrated sequence:

```
Priority -5: LocomotionSystem  (Player movement)
Priority -4: InputSystem       (Controller/hand input)
Priority -3: GrabSystem        (Grab interactions)
Priority -2: PhysicsSystem     (Physics simulation)
Priority -1: SceneUnderstanding (AR plane/mesh updates)
```

Register custom physics-related systems after the built-in PhysicsSystem (priority > -2) to read updated transforms:

```typescript
world.registerSystem(MyPhysicsLogicSystem, { priority: 5 });
```

## PhysicsSystem Configuration

The system accepts a `gravity` config (defaults to Earth gravity):

```typescript
import { PhysicsSystem } from '@iwsdk/core';

const physicsSystem = world.getSystem(PhysicsSystem);
physicsSystem.config.gravity.value = [0, -9.81, 0]; // Earth gravity (default)
physicsSystem.config.gravity.value = [0, -1.62, 0]; // Moon gravity
physicsSystem.config.gravity.value = [0, 0, 0]; // Zero gravity
```

## Native Scene JSON Configuration

Physics components can be configured declaratively in native scene JSON files:

```json
{
  "id": "dynamic-box",
  "content": { "type": "asset", "asset": "box" },
  "transform": { "position": [0, 1.5, -1] },
  "components": {
    "PhysicsShape": {
      "shape": "Box",
      "dimensions": [1, 1, 1],
      "density": 1,
      "friction": 0.5,
      "restitution": 0
    },
    "PhysicsBody": {
      "state": "DYNAMIC",
      "gravityFactor": 1,
      "linearDamping": 0,
      "angularDamping": 0
    }
  }
}
```

**State enum values in scene JSON:**

- `STATIC`
- `DYNAMIC`
- `KINEMATIC`

**Shape enum values in scene JSON:**

- `Sphere`
- `Box`
- `Cylinder`
- `Capsules`
- `ConvexHull`
- `TriMesh`
- `Auto`

## Troubleshooting

**Objects fall through the floor:**

- Ensure the floor entity has both `PhysicsShape` and `PhysicsBody` with `state: PhysicsState.Static`
- Verify the shape type and dimensions match the visual geometry
- If the `Auto` or `ConvexHull` is selected for the PhysicsShape of static objects, try to change into `TriMesh`
- Check that `physics: true` is set in `World.create` features

**Objects don't move:**

- Confirm `state` is `PhysicsState.Dynamic` (not Static or Kinematic)
- Check `gravityFactor` is > 0
- Verify both `PhysicsShape` and `PhysicsBody` are added (both are required)

**Objects are too bouncy or slide too much:**

- Lower `restitution` to reduce bouncing (0 = no bounce)
- Increase `friction` to reduce sliding (0.8+ for grippy surfaces)

**Objects move too slowly or feel sluggish:**

- Reduce `linearDamping` (0 = no air resistance)
- Check `density` is not too high (high density = heavy = resists force)

**Poor frame rate with many physics objects:**

- Use simpler shape types (Sphere/Box instead of ConvexHull/TriMesh)
- Use `TriMesh` only for static objects
- Explicitly set shape types instead of `Auto` to avoid detection overhead
- Reduce the number of dynamic bodies; make non-essential objects static

**Grabbed object doesn't follow hand:**

- Ensure `grabbing: true` in features
- Verify the entity has `RayInteractable` and a grabbable component (`OneHandGrabbable`, `TwoHandsGrabbable`, or `DistanceGrabbable`)

**PhysicsManipulation has no effect:**

- The entity must have a `PhysicsBody` with an active engine body (`_engineBody != 0`)
- The component is auto-removed after one frame; re-add it for sustained effects
- Force values may need to be larger; they are scaled by frame delta time

## Performance Tips

1. **Use primitive shapes** (Sphere, Box, Cylinder) over ConvexHull/TriMesh whenever acceptable
2. **Use `PhysicsState.Static`** for all non-moving objects; static bodies have zero simulation cost
3. **Explicitly set shape types** in production; avoid `Auto` detection overhead
4. **Minimize dynamic body count** -- each dynamic body requires per-frame transform sync
5. **Use damping** to settle objects faster and reduce ongoing simulation work
6. **TriMesh is for static only** -- it is computationally expensive and should never be used on dynamic bodies

## Complete Example: Physics Playground

```typescript
import {
  World,
  SessionMode,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsBody,
  PhysicsState,
  PhysicsManipulation,
  RayInteractable,
  OneHandGrabbable,
} from '@iwsdk/core';
import {
  Mesh,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  FrontSide,
} from 'three';

World.create(document.getElementById('scene-container'), {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { physics: true, grabbing: true },
}).then((world) => {
  // Static floor
  const floor = new Mesh(
    new BoxGeometry(10, 0.1, 10),
    new MeshStandardMaterial({ color: 0x555555 }),
  );
  floor.position.set(0, -0.05, 0);
  const floorEntity = world.createTransformEntity(floor);
  floorEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [10, 0.1, 10],
    friction: 0.8,
  });
  floorEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });

  // Dynamic bouncy ball (grabbable)
  const ball = new Mesh(
    new SphereGeometry(0.15),
    new MeshStandardMaterial({ color: new Color(0xff4444), side: FrontSide }),
  );
  ball.position.set(0, 1.5, -1);
  const ballEntity = world.createTransformEntity(ball);
  ballEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [0.15, 0, 0],
    restitution: 0.8,
    friction: 0.5,
  });
  ballEntity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  ballEntity.addComponent(RayInteractable);
  ballEntity.addComponent(OneHandGrabbable);

  // Dynamic box with initial impulse
  const box = new Mesh(
    new BoxGeometry(0.3, 0.3, 0.3),
    new MeshStandardMaterial({ color: new Color(0x4488ff), side: FrontSide }),
  );
  box.position.set(0.5, 2, -1);
  const boxEntity = world.createTransformEntity(box);
  boxEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [0.3, 0.3, 0.3],
    restitution: 0.3,
  });
  boxEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    linearDamping: 0.1,
  });
  boxEntity.addComponent(PhysicsManipulation, { force: [-3, 5, 0] });
});
```
