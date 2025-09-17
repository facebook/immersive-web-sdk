---
title: Distance Grabbing
---

# Distance Grabbing Algorithms

Distance grabbing enables remote object manipulation through ray-casting, implementing four distinct movement algorithms optimized for different interaction patterns. Each mode uses specialized mathematics to create natural-feeling remote manipulation experiences.

## Movement Mode Architecture

Distance grabbing uses a custom `DistanceGrabHandle` class that extends the standard `HandleStore` with specialized update algorithms. Unlike direct grabbing, the system applies custom movement calculations before delegating to the underlying handle system.

### Algorithm Selection Flow

```
User grabs distant object
  ↓
DistanceGrabHandle.update() called
  ↓
Switch based on movementMode:
  ├─ MoveTowardsTarget → Step-based interpolation
  ├─ MoveAtSource → Delta tracking  
  ├─ MoveFromTarget → Direct ray mapping
  └─ RotateAtSource → Rotation-only mode
  ↓
Apply transformations via outputState.update()
```

## Movement Algorithms

### MoveTowardsTarget: Step-Based Interpolation

Objects smoothly move toward the controller position using configurable speed interpolation.

#### Algorithm Implementation

```ts
const pointerOrigin = p1.pointerWorldOrigin;
const distance = pointerOrigin.distanceTo(position);

if (distance > this.moveSpeed) {
  // Calculate step vector toward target
  const step = pointerOrigin.sub(position)
    .normalize()
    .multiplyScalar(this.moveSpeed);
  position.add(step);
} else {
  // Snap to target when within threshold
  position.copy(pointerOrigin);
  quaternion.copy(p1.pointerWorldQuaternion);
}
```

#### Mathematical Properties

- **Convergence**: Exponential approach with configurable step size
- **Threshold Snapping**: Prevents infinite approach when distance < moveSpeed
- **Orientation Alignment**: Quaternion copying when object reaches target
- **Predictable Timing**: Linear step size regardless of distance

#### Design Trade-offs

- **Smoothness vs Speed**: Lower moveSpeed values create smoother but slower movement
- **Predictability vs Realism**: Constant speed feels artificial but provides consistent timing
- **Control vs Automation**: Object moves automatically once grabbed, less direct control

#### Best Use Cases

- Summoning objects in magical contexts
- Bringing distant items closer for inspection
- Telekinetic "pull" interactions where smooth approach is desired

### MoveAtSource: Delta Tracking

Objects follow controller movement deltas while maintaining their distance from the user.

#### Algorithm Implementation

```ts
const current = p1.pointerWorldOrigin;
if (this.previousPointerOrigin != undefined) {
  const delta = current.sub(this.previousPointerOrigin);
  position.add(delta);
} else {
  this.previousPointerOrigin = new Vector3().copy(current);
}
// Update stored position for next frame
this.previousPointerOrigin.copy(current);
```

#### Mathematical Properties

- **Delta Preservation**: Object maintains constant offset from controller
- **Frame-to-Frame Tracking**: Uses previous position storage for relative movement
- **Distance Independence**: Object depth doesn't affect lateral movement sensitivity
- **Local Coordinate Response**: Movement feels natural in controller's reference frame

#### Design Trade-offs  

- **Naturalness vs Precision**: Feels intuitive but lacks absolute positioning
- **Responsiveness vs Stability**: Immediate response but susceptible to hand jitter
- **Flexibility vs Constraint**: Free movement but no automatic positioning assistance

#### Best Use Cases

- Floating UI elements that should follow hand gestures
- Orbital manipulation around fixed points
- Maintaining spatial relationships during group object manipulation

### MoveFromTarget: Direct Ray Mapping

Objects position directly follows the ray intersection point with immediate response.

#### Algorithm Implementation

```ts
// Delegates to standard HandleStore update
super.update(time);
```

The system uses standard handle processing since ray endpoint provides direct world coordinates.

#### Mathematical Properties

- **1:1 Mapping**: Direct correspondence between ray endpoint and object position
- **No Interpolation**: Immediate position updates without smoothing
- **Precision Control**: Exact positioning control through ray direction
- **No Distance Dependency**: Works consistently regardless of object distance

#### Design Trade-offs

- **Precision vs Smoothness**: Exact control but can feel jittery with hand tremor
- **Immediacy vs Comfort**: Instant response but may cause motion discomfort
- **Accuracy vs Forgiveness**: Precise but unforgiving of slight hand movements

#### Best Use Cases

- Precise object positioning tasks
- Direct manipulation where exact placement is critical
- Cursor-like interactions requiring pixel-perfect control

### RotateAtSource: Rotation-Only Mode

Objects rotate in place without translation or scaling, using automatic constraint override.

#### Algorithm Implementation

```ts
// Translation and scale automatically disabled
translate: movementMode === MovementMode.RotateAtSource 
  ? ('as-rotate' as const) 
  : /* normal translate config */,
scale: movementMode === MovementMode.RotateAtSource 
  ? false 
  : /* normal scale config */
```

The system delegates to standard handle rotation processing while preventing position changes.

#### Mathematical Properties

- **Position Locking**: Object position remains completely fixed
- **Pure Rotation**: Only quaternion changes applied
- **Constraint Override**: Automatic disable of translation/scale regardless of component settings
- **Standard Rotation Math**: Uses existing handle rotation algorithms

#### Design Trade-offs

- **Focused Interaction vs Flexibility**: Clear single-purpose interaction but limited manipulation
- **Predictability vs Versatility**: Always behaves the same but can't reposition objects
- **Simplicity vs Capability**: Easy to understand but restricted functionality

#### Best Use Cases

- Valve and dial controls where position must remain fixed
- Directional indicators (arrows, compasses)
- Orientation-only adjustments for fixed objects

## Return-to-Origin Mechanics

The `returnToOrigin` feature provides automatic state restoration when objects are released.

### Implementation Strategy

```ts
// Override standard handle application on final frame
if (this.returnToOrigin && this.outputState?.last) {
  target.position.copy(this.initialTargetPosition);
  target.rotation.order = this.initialTargetRotation.order;
  target.quaternion.copy(this.initialTargetQuaternion);
  target.scale.copy(this.initialTargetScale);
  return; // Skip normal handle application
}
```

### State Preservation

The system captures initial transform state during handle creation:

- **Position**: World coordinates stored in `initialTargetPosition`
- **Rotation**: Both euler order and quaternion preserved
- **Scale**: Initial scale factors maintained
- **Timing**: Restoration happens on the final update frame

### Design Applications

- **Temporary Interactions**: Objects return to pedestals or designated positions
- **Preview Mode**: Allow examination without permanent repositioning
- **Reset Behavior**: Automatic cleanup after interaction completion
- **Spatial Constraints**: Ensure objects remain within designated areas

## Mode Selection Guidelines

### Interaction Context

- **Magical/Fantasy**: MoveTowardsTarget for supernatural pull effects
- **Technical/Precise**: MoveFromTarget for exact positioning
- **Natural/Intuitive**: MoveAtSource for gesture-based manipulation  
- **Constrained/Fixed**: RotateAtSource for orientation-only controls

### User Experience Goals

- **Comfort First**: MoveTowardsTarget reduces motion sickness through predictable movement  
- **Control First**: MoveFromTarget provides maximum manipulation precision
- **Natural First**: MoveAtSource feels most similar to direct hand movement
- **Simplicity First**: RotateAtSource eliminates position complexity

The system's flexibility allows mixing movement modes within the same application, with each object configured for its specific interaction requirements.