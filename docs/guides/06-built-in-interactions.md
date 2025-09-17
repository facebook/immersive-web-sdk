---
outline: [2, 4]
---

# Chapter 6: Built-in Interactions

Now that your scene looks professional with environment and lighting, it's time to make it interactive! This chapter shows you how to enable grabbing and locomotion - the two most common interactions in VR.

## How Input Works in IWSDK

IWSDK provides a comprehensive input system that handles controllers, hands, and various interaction patterns automatically. The input stack includes:

- **Visual representation** - Controllers and hands appear automatically
- **Pointer events** - Cross-modal interactions that work with controllers and hand tracking
- **Gamepad state** - Access to buttons, triggers, and thumbsticks
- **Built-in systems** - Grab and locomotion work out of the box

**Interaction Patterns**: Different interactions use different input approaches. **Grabbing** is built using pointer events - this makes it universal, working seamlessly with both controllers and hand tracking. **Locomotion** uses gamepad input because movement requires more advanced and precise controls like analog thumbsticks for smooth navigation.

::: tip Learn More About Input
For a deep dive into IWSDK's input architecture, see [XR Input Concepts](/concepts/xr-input/index.md).
:::

## Enabling Built-in Systems

Grab and locomotion are **built-in systems** that you enable via the `features` flag in `World.create()`. No additional setup required - just enable them and start adding components to objects.

## Enabling Grab and Locomotion

First, update your `World.create()` call to enable these features:

```javascript
// Update your existing World.create() call in src/index.ts
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { handTracking: true },
  },
  features: {
    grabbing: true, // Enable grab system
    locomotion: true, // Enable locomotion system
    // ... other existing features
  },
}).then((world) => {
  // ... your existing setup
});
```

That's it! IWSDK automatically sets up ray pointers, grab pointers, and locomotion controls. Controllers and hands will appear automatically, and the input systems start working immediately.

## Making Objects Grabbable

With grabbing enabled, you can add grab components to any object. IWSDK provides several grab components including `TwoHandGrabbable` for complex manipulation, but we'll focus on the two most commonly used types:

### OneHandGrabbable - Direct Manipulation

For objects you grab and move directly with one hand:

```javascript
// Make your existing robot grabbable
const { scene: robotMesh } = AssetManager.getGLTF('robot');
robotMesh.position.set(-1.2, 0.95, -1.8);
robotMesh.scale.setScalar(0.5);

world
  .createTransformEntity(robotMesh)
  .addComponent(Interactable) // Makes it interactive
  .addComponent(OneHandGrabbable, {
    // Makes it grabbable with one hand
    translate: true, // Can move it around
    rotate: true, // Can rotate it
  });
```

### DistanceGrabbable - At-a-Distance Interaction

For objects you can grab, scale, and manipulate from far away:

```javascript
// Make the plant grabbable at a distance
const { scene: plantMesh } = AssetManager.getGLTF('plantSansevieria');
plantMesh.position.set(1.2, 0.85, -1.8);

world
  .createTransformEntity(plantMesh)
  .addComponent(Interactable)
  .addComponent(DistanceGrabbable, {
    translate: true,
    rotate: true,
    scale: true, // Can also resize it
  });
```

**That's all you need!** Point at objects with your controllers, pull the trigger to grab them, and move them around naturally.

## Setting Up Locomotion

With locomotion enabled, you need to tell IWSDK which surfaces can be walked on by adding the `LocomotionEnvironment` component:

### Making Your Environment Walkable

```javascript
// Make your desk environment walkable
const { scene: envMesh } = AssetManager.getGLTF('environmentDesk');
envMesh.rotateY(Math.PI);
envMesh.position.set(0, -0.1, 0);

world.createTransformEntity(envMesh).addComponent(LocomotionEnvironment, {
  type: EnvironmentType.STATIC, // Static environment for collision
});
```

### How Locomotion Works

Once enabled, locomotion works automatically with standard VR controls:

- **Left thumbstick**: Walk forward/backward, strafe left/right
- **Right thumbstick**: Snap turn (comfortable) or smooth turn
- **Teleportation**: Point and click to teleport (if enabled)

The locomotion system handles collision detection, ground snapping, and comfortable movement speeds automatically.

::: tip Learn More About Locomotion
For detailed locomotion configuration and movement types, see [Locomotion Concepts](/concepts/locomotion/index.md).
:::

## Complete Interactive Setup

Here's how to add both grab and locomotion to your existing starter app:

```javascript
// Update your src/index.ts with these additions:

import {
  AssetManager,
  AssetManifest,
  AssetType,
  EnvironmentType,
  Interactable,
  LocomotionEnvironment,
  OneHandGrabbable,
  DistanceGrabbable,
  SessionMode,
  World,
} from "@iwsdk/core";

// ... existing assets and World.create setup with features enabled ...

World.create(/* ... */, {
  features: {
    grabbing: true,
    locomotion: true,
    // ... other features
  },
}).then((world) => {
  // ... existing camera and environment setup ...

  // Make environment walkable
  const { scene: envMesh } = AssetManager.getGLTF("environmentDesk");
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.1, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Make plant grabbable at distance
  const { scene: plantMesh } = AssetManager.getGLTF("plantSansevieria");
  plantMesh.position.set(1.2, 0.85, -1.8);
  world
    .createTransformEntity(plantMesh)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable);

  // Make robot grabbable with one hand
  const { scene: robotMesh } = AssetManager.getGLTF("robot");
  robotMesh.position.set(-1.2, 0.95, -1.8);
  robotMesh.scale.setScalar(0.5);
  world
    .createTransformEntity(robotMesh)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable);

  // ... rest of your existing setup
});
```

## What's Next

Excellent! Your VR scene is now fully interactive. Users can grab objects, move them around, and walk through your environment. In Chapter 7, we'll learn how to create your own custom systems and components to add unique behaviors to your WebXR experience.

You'll learn how to:

- Create custom components to store data
- Write systems that react to entities with specific components
- Implement custom game logic and behaviors
- Use queries to find entities efficiently
