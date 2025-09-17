---
outline: [2, 4]
---

# Chapter 5: Environment & Lighting

Now that you can create objects and load external assets, it's time to make your WebXR experience look professional with environment and lighting. This chapter introduces **Components and Systems** - the building blocks of IWSDK's architecture - while showing you how to create beautiful, realistic lighting for your scenes.

## ECS Refresher: Components and Systems

You've been working with **entities** since Chapter 3 using `world.createTransformEntity()`. Now you'll use **components and systems** for the first time.

**Components** are data you attach to entities (like "this entity has lighting" or "this entity is grabbable"). **Systems** automatically handle entities with specific components (like "apply lighting to all lit entities").

The pattern is simple: add components to entities, let systems handle the behavior automatically.

::: tip Learn More About ECS
For a comprehensive understanding of IWSDK's Entity Component System architecture, see [ECS Concepts](/concepts/ecs/index.md).
:::

## Why Environment and Lighting Matter

Good lighting transforms your scene from looking like a technical demo to a professional, polished VR experience. Proper environment setup provides realistic reflections, ambient lighting, and atmospheric depth that makes materials look convincing.

## Setup Lighting

IWSDK uses **Image-Based Lighting (IBL)** as the default lighting approach. This provides realistic lighting by using environment images to illuminate your entire scene, creating natural-looking reflections and ambient lighting that makes materials appear convincing.

Environment lighting components get attached to the **level root entity** - think of it as the main container for your scene:

```javascript
const levelRoot = world.activeLevel.value;
```

### IBL Lighting Options

**Built-in Room Environment** (easiest option):

```javascript
const levelRoot = world.activeLevel.value;

levelRoot.addComponent(IBLTexture, {
  src: 'room', // Built-in room environment
  intensity: 1.2, // Slightly brighter than default
});
```

**Custom HDR Lighting** (for specific moods):

```javascript
// Add HDR to your asset manifest
const assets = {
  sunsetHDR: {
    url: '/hdr/sunset_4k.hdr',
    type: AssetType.HDRTexture,
    priority: 'critical',
  },
};

// Use it for lighting
levelRoot.addComponent(IBLTexture, {
  src: 'sunsetHDR', // Reference your asset
  intensity: 0.9, // Lighting strength
  rotation: [0, Math.PI / 4, 0], // Rotate lighting direction
});
```

**Gradient-based Lighting** (for stylized scenes):

```javascript
levelRoot.addComponent(IBLGradient, {
  sky: [1.0, 0.9, 0.7, 1.0], // Warm sky light
  equator: [0.7, 0.7, 0.9, 1.0], // Cool horizon
  ground: [0.2, 0.2, 0.2, 1.0], // Dark ground reflection
  intensity: 1.0,
});
```

### How Environment Affects Materials

Environment lighting dramatically improves how materials look by providing realistic reflections and ambient lighting. The materials you created in previous chapters will automatically look much better with proper environment setup.

**Key material properties that respond to environment:**

- **Metalness**: Higher values reflect environment more (chrome, gold)
- **Roughness**: Lower values create sharper reflections (mirrors, polished surfaces)
- **Color**: Tints the reflected environment to create different metal types

The Three.js materials you're already using (`MeshStandardMaterial`) automatically work with IBL - no code changes needed!

### Traditional Light Sources

Traditional lighting is not explicitly supported by IWSDK, but you can use Three.js lights by disabling default lighting and adding your own light sources:

```javascript
import { DirectionalLight, AmbientLight } from '@iwsdk/core';

World.create(document.getElementById('scene-container'), {
  // ... other options
  render: {
    defaultLighting: false, // Disable IWSDK's default IBL
  },
}).then((world) => {
  // Add traditional Three.js lights directly to the scene
  const directionalLight = new DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  world.scene.add(directionalLight);

  const ambientLight = new AmbientLight(0x404040, 0.4);
  world.scene.add(ambientLight);
});
```

For more information on traditional lighting, see the [Three.js lighting documentation](https://threejs.org/manual/?q=ligh#en/lights).

## Setup Background

In real life, our background environment determines the lighting. However, in 3D graphics, these are two completely separate concepts:

- **Lighting** determines how materials render in the scene, providing reflections and illumination, but has no actual visual representation itself
- **Background** functions purely as a backdrop that you see behind objects, and does not affect how objects are rendered at all

While it's good practice to match your background to your environment lighting for visual coherence, you have complete flexibility to use them independently. You might use a sunset HDR for lighting while having a plain gradient background, or vice versa.

Background components attach to the level root entity, just like lighting components.

### Gradient Backgrounds

For clean, stylized scenes:

```javascript
const levelRoot = world.activeLevel.value;

levelRoot.addComponent(DomeGradient, {
  sky: [0.53, 0.81, 0.92, 1.0], // Light blue sky
  equator: [0.91, 0.76, 0.65, 1.0], // Warm horizon
  ground: [0.32, 0.32, 0.32, 1.0], // Dark ground
  intensity: 1.0,
});
```

### HDR Image Backgrounds

For photorealistic environments:

```javascript
// Add HDR to your asset manifest
const assets = {
  studioHDR: {
    url: '/hdr/studio.hdr',
    type: AssetType.HDRTexture,
    priority: 'critical',
  },
};

// Use the loaded HDR for background
const levelRoot = world.activeLevel.value;

levelRoot.addComponent(DomeTexture, {
  src: 'studioHDR', // Reference the asset key
  intensity: 0.8,
  blurriness: 0.1, // Slight blur for softer look
});
```

::: tip Background vs Lighting

- **Background**: What you see as the skybox (`DomeTexture` or `DomeGradient`)
- **Lighting**: How objects are lit (`IBLTexture` or `IBLGradient`)
- These are independent - mix and match as needed!
  :::

## What's Next

Excellent work! Your WebXR scene now has professional environment and lighting, and you've had your first taste of IWSDK's Component System. In Chapter 6, we'll continue using components to make your scene interactive with object grabbing and manipulation.

You'll learn how to:

- Add Interactable and Grabbable components to objects
- Use the grab system for natural VR interactions
- Understand how systems automatically handle interaction behaviors
- Make your GLTF models and primitive objects grabbable and interactive
