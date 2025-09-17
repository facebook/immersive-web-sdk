---
outline: [2, 4]
---

# Chapter 4: External Assets

While primitive shapes are useful for learning, real WebXR applications use external assets like 3D models, textures, and audio files. In this chapter, you'll learn how to load and use external assets efficiently in IWSDK. By the end, you'll be able to load GLTF models and apply textures to create professional-looking scenes.

## Why External Assets Matter

External assets transform your WebXR experience from basic geometric shapes to rich, detailed environments:

- **3D Models**: Detailed objects created in tools like Blender, Maya, or downloaded from asset stores
- **Textures**: Images that provide surface detail, color, and material properties
- **Audio**: Sound effects and ambient audio for immersion
- **HDR Images**: Environment maps for realistic lighting and reflections

## IWSDK's AssetManager

IWSDK includes a powerful AssetManager that handles loading, caching, and optimization of external assets. It provides several key benefits:

- **Preloading**: Load assets during application initialization for smooth experiences
- **Caching**: Avoid reloading the same asset multiple times
- **Loading Priorities**: Control whether assets are critical (blocking) or background (non-blocking)
- **Static Access**: Simple API to retrieve loaded assets anywhere in your code

### Asset Loading Priorities

IWSDK supports two loading priorities to optimize performance:

1. **Critical**: Load before the application starts - **blocks World.create() until loaded**
2. **Background**: Load early but don't block initialization - **prevents runtime loading hiccups**

**Choose your loading strategy carefully:**

- **Critical priority**: Only for assets essential to your app's core experience (like main characters, UI elements, core environment pieces). The `World.create()` promise won't resolve until all critical assets are loaded, so use sparingly.

- **Background priority**: For assets you know you'll need but that shouldn't block startup (decorative objects, optional audio, extra textures). These start loading immediately after critical assets finish, so they're cached and ready when you need them - avoiding stutters caused by loading during runtime.

- **Runtime loading**: For user-specific or conditional content that may never be needed. Load these on-demand using `AssetManager.loadGLTF()` or similar methods.

## Setting Up Asset Loading

Assets are configured using an `AssetManifest` object that you pass to `World.create()`. Let's look at how this works in practice.

### Asset Manifest Structure

In your starter app's `src/index.ts`, you'll see this pattern:

```javascript
import { AssetManifest, AssetType, World } from '@iwsdk/core';

const assets: AssetManifest = {
  robot: {
    url: '/gltf/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  webxr: {
    url: '/textures/webxr.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  chimeSound: {
    url: '/audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
};

World.create(document.getElementById('scene-container'), {
  assets, // Pass the manifest to World.create
  // ... other options
}).then((world) => {
  // Assets are now loaded and available via AssetManager
});
```

### Supported Asset Types

IWSDK supports these asset types:

- **`AssetType.GLTF`**: 3D models in GLB or GLTF format
- **`AssetType.Texture`**: Images for materials (JPG, PNG, WebP)
- **`AssetType.HDRTexture`**: HDR environment maps (HDR format)
- **`AssetType.Audio`**: Audio files (MP3, WAV, OGG)

::: tip Asset Organization
Place your assets in the `public/` directory of your project. Common patterns:

- `/gltf/` for 3D models
- `/textures/` for images
- `/audio/` for sound files
- `/hdr/` for environment maps
  :::

## Loading and Using GLTF Models

GLTF (GL Transmission Format) is the standard format for 3D models in WebXR. Here's how to load and use them:

### Basic GLTF Loading

Add your GLTF to the asset manifest, then access it using `AssetManager.getGLTF()`:

```javascript
import { AssetManager } from '@iwsdk/core';

// In your asset manifest
const assets = {
  myRobot: {
    url: '/gltf/robot.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

// After World.create()
World.create(/* ... */).then((world) => {
  // Get the loaded GLTF
  const { scene: robotMesh } = AssetManager.getGLTF('myRobot');

  // Position and scale the mesh
  robotMesh.position.set(0, 1, -3);
  robotMesh.scale.setScalar(0.5);

  // Create a transform entity from the mesh
  const robotEntity = world.createTransformEntity(robotMesh);
});
```

### Why GLTF?

GLTF is currently the only official 3D model format supported by IWSDK. We chose GLTF because it's specifically designed for web and real-time 3D applications:

- **Web-optimized**: Efficient loading and parsing in browsers
- **Compact**: Binary GLB format reduces file sizes significantly
- **Complete**: Supports geometry, materials, textures, animations, and lighting in one format
- **Industry standard**: Backed by Khronos Group and supported by all major 3D tools
- **WebXR ready**: Perfect format for immersive web experiences

If you're working with other 3D formats like FBX, OBJ, or 3DS Max files, you can easily convert them to GLTF using free, open-source software like [Blender](https://www.blender.org). Simply import your model into Blender and export as GLTF or GLB.

::: tip GLTF Optimization

- **Use GLB format** for smaller file sizes (binary is more compact than JSON)
- **Optimize geometry** in your 3D software by removing unnecessary vertices and combining meshes where possible
- **Keep polygon counts reasonable** - aim for game-ready models rather than high-poly renders
  :::

## Working with Textures

Textures add surface detail to your 3D objects. Here's how to load and apply them:

### Basic Texture Loading

```javascript
import {
  MeshBasicMaterial,
  PlaneGeometry,
  Mesh,
  SRGBColorSpace,
} from '@iwsdk/core';

// In your asset manifest (already in your starter app)
const assets = {
  webxr: {
    url: '/textures/webxr.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
};

// After World.create()
World.create(/* ... */).then((world) => {
  // Get the loaded texture
  // Because of the "critical" loading strategy, we can be sure it's available here
  const webxrTexture = AssetManager.getTexture('webxr');

  // Set proper color space for the texture
  webxrTexture.colorSpace = SRGBColorSpace;

  // Create a material using the texture
  const logoMaterial = new MeshBasicMaterial({
    map: webxrTexture,
    transparent: true, // PNG with transparency
  });

  // Create a plane to display the WebXR logo
  const logoGeometry = new PlaneGeometry(1.13, 0.32);
  const logoPlane = new Mesh(logoGeometry, logoMaterial);
  logoPlane.position.set(0, 1.8, -1.9);

  // Create transform entity
  const logoEntity = world.createTransformEntity(logoPlane);
});
```

::: tip Texture Optimization

- **Choose the right format**: Use JPG for photos/realistic textures, PNG for images with transparency
- **Use power-of-2 dimensions**: 512×512, 1024×1024, 2048×2048 - these load and render more efficiently
- **Keep file sizes reasonable**: Large textures can significantly impact loading times and performance
  :::

::: tip Asset Availability
Use `if` checks when accessing assets with 'background' priority, as they might still be loading when your code runs. Critical assets are guaranteed to be available.
:::

## Runtime Asset Loading

You can also load assets dynamically after the app starts:

```javascript
// Load an asset at runtime
AssetManager.loadGLTF('/gltf/dynamic-object.glb', 'dynamicModel')
  .then(() => {
    const { scene: dynamicMesh } = AssetManager.getGLTF('dynamicModel');
    dynamicMesh.position.set(0, 2, -3);
    const entity = world.createTransformEntity(dynamicMesh);
  })
  .catch((error) => {
    console.error('Failed to load dynamic asset:', error);
  });
```

## What's Next

Excellent work! You now know how to work with external assets to create rich, detailed WebXR experiences. In Chapter 5, we'll focus on making your scenes look professional by adding proper environment and lighting.

You'll learn how to:

- Use Dome components for beautiful skyboxes and backgrounds
- Set up IBL (Image-Based Lighting) for realistic reflections and ambient lighting
- Configure environment maps and their effects on materials
- Create visually stunning scenes with minimal code changes
