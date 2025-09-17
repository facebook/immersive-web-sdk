---
title: ECS Architecture in WebXR
---

# ECS Architecture in WebXR

Deep dive into how IWSDK's ECS architecture enables scalable, performant WebXR applications.

## Data-Oriented Design

ECS follows data-oriented design principles that are especially important for VR performance:

### Memory Layout: Why Columnar Storage Matters

Traditional OOP stores objects like this:

```text
PlayerObject { health: 100, position: [0,1,0], velocity: [1,0,0] }
EnemyObject  { health: 50,  position: [5,1,2], velocity: [-1,0,0] }
```

ECS stores the same data like this:

```text
Health:    [100, 50, 75, ...]  // all health values together
Position:  [0,1,0, 5,1,2, ...]  // all positions together
Velocity:  [1,0,0, -1,0,0, ...] // all velocities together
```

**Why this matters in VR:**

- **Cache efficiency**: When updating health, we only touch health data (no position/velocity)
- **SIMD potential**: Process multiple health values in parallel
- **Memory predictability**: Reduces cache misses during frame-critical updates

### Query Performance Model

Queries use bitmasking for O(1) component checks:

```text
Entity 12: Health(✓) + Position(✓) + AI(✓)     = bitmask: 00000111
Entity 37: Health(✓) + Position(✓) + Player(✓) = bitmask: 00001011

Query { required: [Health, Position] }          = mask:    00000011
  └─ Entity 12: (00000111 & 00000011) == 00000011 ✓ matches
  └─ Entity 37: (00001011 & 00000011) == 00000011 ✓ matches
```

This makes "find all entities with Health + Position" extremely fast even with thousands of entities.

## WebXR Frame Budget

VR applications must hit 72-90fps consistently. IWSDK's ECS helps by:

### System Priority Architecture

```text
Frame Budget (11ms for 90fps):
┌─ Input System (-4)          │ 1ms  │ Read controllers, hands
├─ Locomotion (-5)            │ 2ms  │ Update player movement
├─ Physics (-2)               │ 3ms  │ Collision detection
├─ Game Logic (0)             │ 2ms  │ Your gameplay systems
├─ UI System (1)              │ 1ms  │ Update spatial panels
└─ Render prep (2)            │ 2ms  │ Frustum culling, LOD
                              └────┘
                               11ms total budget
```

Systems with more negative priority run first, ensuring input lag stays minimal.

### Query-Driven Optimization

Smart systems only process entities that need updates:

```ts
export class LODSystem extends createSystem({
  // Only process visible objects that moved
  needsLODUpdate: {
    required: [Mesh, Transform, Visibility],
    where: [eq(Visibility, 'changed', true)],
  },
}) {
  update() {
    // Process only moved, visible objects
    for (const entity of this.queries.needsLODUpdate.entities) {
      // Update level-of-detail based on distance to camera
      this.updateLOD(entity);
      entity.setValue(Visibility, 'changed', false);
    }
  }
}
```

## Composition Patterns for WebXR

### Feature Composition

Build complex VR interactions through component composition:

```ts
// Make any object grabbable
entity.addComponent(Grabbable);
entity.addComponent(RigidBody); // Physics integration

// Make it also glowable
entity.addComponent(Interactable, { glowColor: [0, 1, 0] });

// Make it respond to voice commands
entity.addComponent(VoiceTarget, { keywords: ['pick up', 'grab'] });
```

Each system operates independently — GrabSystem, GlowSystem, VoiceSystem all work together without knowing about each other.

### Hierarchical Entities

WebXR often needs nested objects (hand → fingers → joints):

```ts
// Create hand hierarchy
const hand = world.createTransformEntity();
hand.addComponent(HandTracking);

const thumb = world.createTransformEntity(undefined, { parent: hand });
thumb.addComponent(FingerJoint, { type: 'thumb' });

const index = world.createTransformEntity(undefined, { parent: hand });
index.addComponent(FingerJoint, { type: 'index' });
```

Transform system automatically handles parent-child matrix updates.

## Scale and Performance Characteristics

### Entity Limits

- **Lightweight entities**: ~1000-5000 active entities typical for VR scenes
- **Component overhead**: ~8 bytes per component per entity (just indices)
- **System overhead**: ~0.1ms per system with empty queries

### Query Optimization

```ts
// ❌ Inefficient: checks every entity every frame
for (const entity of world.entities) {
  if (entity.hasComponent(Health) && entity.hasComponent(AI)) {
    // process
  }
}

// ✅ Efficient: precomputed set, direct iteration
for (const entity of this.queries.healthyAI.entities) {
  // process only matching entities
}
```

### Memory Usage Patterns

- **Packed components**: ~32 bytes per component instance (depends on field count)
- **Query indices**: ~4 bytes per entity per matching query
- **System overhead**: ~1KB per system class

## Integration with Three.js and WebXR

### Object3D Synchronization

IWSDK bridges ECS data and Three.js scene graph:

```text
ECS Side:              Three.js Side:
─────────              ──────────────
Entity 12 ←──linked──→ Object3D
├─ Transform           ├─ position: [1,2,3]
│  └─ position: [1,2,3] └─ quaternion: [...]
└─ Mesh                └─ mesh: BoxGeometry
   └─ geometry: "box"
```

Transform system automatically syncs ECS component data to Three.js matrices.

### WebXR Session Lifecycle

```text
Session Start:
├─ World.visibilityState → 'visible'
├─ Input systems activate (hand/controller tracking)
├─ Locomotion systems start physics updates
└─ Render loop switches to XR frame timing (90fps)

Session End:
├─ World.visibilityState → 'non-immersive'
├─ Input systems pause expensive tracking
└─ Render loop returns to 60fps
```

Systems can check `world.visibilityState` to reduce CPU load when VR headset is removed.

## Debugging and Profiling

### Query Analysis

```ts
console.log('System performance:');
for (const [name, query] of Object.entries(this.queries)) {
  console.log(`  ${name}: ${query.entities.size} entities`);
}
```

### Component Memory Usage

```ts
// Check component distribution
world.entityManager.entities.forEach((entity) => {
  console.log(
    `Entity ${entity.index}:`,
    entity.getComponents().map((c) => c.id),
  );
});
```

### System Timing

Built-in performance monitoring shows per-system frame time:

```ts
world.enablePerformanceMonitoring = true; // Shows system timing
```

This architecture enables IWSDK applications to scale from simple demos to complex multiplayer VR experiences while maintaining consistent performance.
