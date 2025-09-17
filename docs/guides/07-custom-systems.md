---
outline: [2, 4]
---

# Chapter 7: Custom Systems

Your starter app already includes a perfect example of custom ECS code: the robot that faces the player and plays sounds when clicked. In this chapter, we'll learn how to create custom systems and components by examining this existing implementation and understanding the fundamental ECS patterns you'll use in your own WebXR applications.

## Creating a Component

Components are data containers that you attach to entities. IWSDK uses `createComponent` to define component types with typed schemas.

### Component Schema Types

IWSDK supports these data types for component schemas:

| Type                             | Description                      |
| -------------------------------- | -------------------------------- |
| `Types.Int8`, `Types.Int16`      | Integer numbers                  |
| `Types.Float32`, `Types.Float64` | Floating point numbers           |
| `Types.Boolean`                  | true/false values                |
| `Types.String`                   | Text strings                     |
| `Types.Vec2`                     | 2D vectors [x, y]                |
| `Types.Vec3`                     | 3D vectors [x, y, z]             |
| `Types.Vec4`                     | 4D vectors [x, y, z, w]          |
| `Types.Color`                    | RGBA colors [r, g, b, a]         |
| `Types.Entity`                   | References to other entities     |
| `Types.Object`                   | Any JavaScript object            |
| `Types.Enum`                     | String values from a defined set |

### Component Examples

**Tag Component** (no data, just tags entities):

```typescript
import { createComponent } from '@iwsdk/core';

export const Robot = createComponent('Robot', {});
```

**Data Component** (stores actual information):

```typescript
import { createComponent, Types } from '@iwsdk/core';

export const Health = createComponent('Health', {
  current: { type: Types.Float32, default: 100 },
  max: { type: Types.Float32, default: 100 },
  regenerating: { type: Types.Boolean, default: false },
});

export const Position = createComponent('Position', {
  velocity: { type: Types.Vec3, default: [0, 0, 0] },
  target: { type: Types.Vec3, default: [0, 0, 0] },
});
```

## Creating a System

Systems contain the logic that operates on entities with specific components. They define queries to find relevant entities and run logic each frame.

### System Structure

```typescript
import { createSystem, eq, Types } from '@iwsdk/core';

export class MySystem extends createSystem(
  {
    // Regular query - entities with specific components
    myQuery: { required: [ComponentA, ComponentB] },

    // Query with exclusion - has ComponentA but NOT ComponentC
    specialQuery: { required: [ComponentA], excluded: [ComponentC] },

    // Query with value predicate - matches specific component values
    configQuery: {
      required: [PanelUI, PanelDocument],
      where: [eq(PanelUI, 'config', '/ui/welcome.json')],
    },
  },
  {
    // Optional config schema - system-level configuration
    speed: { type: Types.Float32, default: 1.0 },
    enabled: { type: Types.Boolean, default: true },
  },
) {
  // System implementation
}
```

### Accessing Queries and Config

**Queries** are accessible via `this.queries.queryName.entities` (which returns a Set) and support reactive subscriptions:

```typescript
// Access entities in update() or init()
this.queries.myQuery.entities.forEach((entity) => {
  // Process each entity
});

// React to entities entering/leaving queries
this.queries.welcomePanel.subscribe('qualify', (entity) => {
  // Called when entity newly matches query
});

this.queries.welcomePanel.subscribe('disqualify', (entity) => {
  // Called when entity stops matching query
});
```

**Config values** are converted to signals accessible via `this.config.propertyName.value`:

```typescript
// Access config values
const currentSpeed = this.config.speed.value;
const isEnabled = this.config.enabled.value;

// React to config changes
this.config.speed.subscribe((value) => {
  // React to speed changes
  console.log('Speed changed to:', value);
});
```

### System Lifecycle Methods

**`init()`** - Called once when the system is registered with the world:

```typescript
init() {
  // Initialize reusable objects for performance
  this.tempVector = new Vector3();

  // Set up reactive subscriptions
  this.queries.myQuery.subscribe('qualify', (entity) => {
    // Called when an entity newly matches the query
  });

  this.queries.myQuery.subscribe('disqualify', (entity) => {
    // Called when an entity stops matching the query
  });
}
```

**`update(delta: number, time: number)`** - Called every frame:

```typescript
update(delta, time) {
  // delta: Time since last frame (in seconds) - use for frame-rate independent movement
  // time: Total elapsed time since start (in seconds) - use for animations and timing

  this.queries.myQuery.entities.forEach((entity) => {
    // Run logic on each matching entity
    const position = entity.getComponent(Position);
    position.velocity[0] *= delta; // Frame-rate independent movement
  });
}
```

**`destroy()`** - Called when the system is unregistered:

```typescript
destroy() {
  // Clean up resources, remove event listeners, etc.
  this.tempVector = null;
}
```

### System Properties

- **`this.queries`** - Access to defined queries and their entities
- **`this.config`** - Access to system configuration values
- **`this.world`** - Reference to the ECS world
- **`this.player`** - Reference to XR player/camera rig (see [XR Origin](/concepts/xr-input/xr-origin.md) for more details)
- **`this.camera`** - Reference to the camera
- **`isPaused`** - Whether the system is currently paused

## Registering with World

After creating components and systems, you register them with the world to make them active:

```typescript
// Register components first
world
  .registerComponent(Robot)
  .registerComponent(Health)
  .registerComponent(Position);

// Then register systems
world.registerSystem(RobotSystem).registerSystem(HealthSystem, {
  priority: -1, // Higher priority systems run first (negative = higher priority)
  configData: { speed: 2.0 }, // Override default config values
});
```

::: tip System Priorities
Systems run in priority order each frame. Lower numbers run first. Values smaller than 0 are reserved for IWSDK systems and are prioritized for a reason, so generally speaking please choose numbers larger than 0 for your custom systems.
:::

## The Robot Example

Now let's examine how the robot system in your starter app implements these concepts:

```typescript
import {
  AudioUtils,
  createComponent,
  createSystem,
  Pressed,
  Vector3,
} from '@iwsdk/core';

// 1. Creating a tag component - no data, just tags entities as robots
export const Robot = createComponent('Robot', {});

// 2. Creating a system with two queries
export class RobotSystem extends createSystem({
  robot: { required: [Robot] }, // All robot entities
  robotClicked: { required: [Robot, Pressed] }, // Only clicked robots
}) {
  private lookAtTarget;
  private vec3;

  // 3. init() - called when system is registered
  init() {
    // Performance: Create reusable objects once
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();

    // Audio integration: Subscribe to click events
    this.queries.robotClicked.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });
  }

  // 4. update() - called every frame
  update() {
    // Process all robot entities
    this.queries.robot.entities.forEach((entity) => {
      // Get player head position
      this.player.head.getWorldPosition(this.lookAtTarget);

      // Get robot's Three.js object and position
      const spinnerObject = entity.object3D;
      spinnerObject.getWorldPosition(this.vec3);

      // Keep robots level (don't tilt up/down)
      this.lookAtTarget.y = this.vec3.y;

      // Make robot face player
      spinnerObject.lookAt(this.lookAtTarget);
    });
  }
}
```

**Mapping back to the concepts:**

1. **Component**: `Robot` is a tag component (empty schema) that tags entities
2. **Queries**: Two queries handle different entity states (all robots vs clicked robots)
3. **Registration**: System gets registered in `index.ts` with `world.registerSystem(RobotSystem)`
4. **Lifecycle**: `init()` sets up resources and subscriptions, `update()` runs the behavior
5. **Audio Integration**: Uses `AudioUtils.play(entity)` with the entity's `AudioSource` component

**Key patterns demonstrated:**

- **Performance optimization**: Reusable Vector3 objects in `init()`
- **Direct Three.js access**: `entity.object3D` bridges ECS data with rendering
- **Event-driven behavior**: `subscribe('qualify', ...)` for reactive audio
- **Frame-rate independent**: No delta usage needed here since `lookAt()` sets absolute rotation

## What's Next

Excellent! You now understand how IWSDK's ECS architecture works by examining real code. The robot example shows the essential patterns you'll use to create any custom behavior in your WebXR applications.

In the next chapter, we'll learn how to build and publish your WebXR application so others can experience what you've created.
