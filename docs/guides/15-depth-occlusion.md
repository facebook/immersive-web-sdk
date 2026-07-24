---
outline: [2, 4]
---

# Chapter 15: Depth Occlusion

The IWSDK provides a depth occlusion system that hides virtual objects when they pass behind real-world surfaces, creating a convincing sense that virtual content exists within the physical environment. This chapter covers setting up depth sensing and applying occlusion to your entities.

## What You'll Build

By the end of this chapter, you'll be able to:

- Set up depth sensing for your AR experience
- Apply depth occlusion to virtual objects so they hide behind real-world geometry
- Choose between occlusion modes for different quality/performance tradeoffs
- Configure occlusion parameters like blur radius
- Access raw depth data for advanced use cases

## Overview

Depth occlusion uses the device's depth sensor to compare the distance of each virtual fragment against the real-world surface at that screen position. When a virtual object is farther from the camera than the real-world surface, the system discards or fades those fragments, making the virtual object appear to go behind the physical surface.

Without depth occlusion, virtual objects always render on top of real-world surfaces, breaking the illusion of presence. With depth occlusion enabled, a virtual ball rolling behind a couch will disappear behind it, just as a real ball would.

### Key Components

- **`DepthSensingSystem`** - Core system that retrieves depth data from the WebXR session and injects occlusion shaders into entity materials
- **`DepthOccludable`** - Component that marks an entity for occlusion by real-world geometry
- **`OcclusionShadersMode`** - Enum for selecting the occlusion algorithm (Soft, Hard, or MinMax)

## Quick Start

Here's a minimal example to get depth occlusion working:

```javascript
import {
  World,
  SessionMode,
  ReferenceSpaceType,
  DepthSensingSystem,
  DepthOccludable,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
} from '@iwsdk/core';

World.create(document.getElementById('scene-container'), {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      depthSensing: {
        required: true,
        usage: 'gpu-optimized',
        format: 'float32',
      },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
}).then((world) => {
  scene.background = null; // Transparent background for AR

  // Register the depth sensing system
  world.registerSystem(DepthSensingSystem).registerComponent(DepthOccludable);

  // Create a virtual sphere
  const sphere = new Mesh(
    new SphereGeometry(0.2),
    new MeshStandardMaterial({ color: 0xff4444, transparent: true }),
  );
  sphere.position.set(0, 1.0, -1.0);
  world.scene.add(sphere);

  // Mark it as occludable — it will now hide behind real-world surfaces
  const entity = world.createTransformEntity(sphere);
  entity.addComponent(DepthOccludable);
});
```

## System Setup

### Step 1: Enable Depth Sensing in World Config

Depth occlusion requires the WebXR `depth-sensing` feature. Configure it in your world options:

```javascript
World.create(container, {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      depthSensing: {
        required: true,
        usage: 'gpu-optimized', // or 'cpu-optimized'
        format: 'float32', // or 'luminance-alpha'
      },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
});
```

| Option   | Values                               | Description                                    |
| -------- | ------------------------------------ | ---------------------------------------------- |
| `usage`  | `'gpu-optimized'`, `'cpu-optimized'` | How depth data is delivered to the application |
| `format` | `'float32'`, `'luminance-alpha'`     | Precision of depth values                      |

**`gpu-optimized`** delivers depth as a GPU texture array and is the recommended path for occlusion. **`cpu-optimized`** provides per-pixel depth buffers accessible on the CPU, useful when you need to read individual depth values in JavaScript.

### Step 2: Register the System and Component

```javascript
world
  .registerSystem(DepthSensingSystem, {
    configData: {
      enableOcclusion: true, // Master toggle for occlusion rendering
      enableDepthTexture: true, // Create/update depth textures each frame
      useFloat32: true, // Use Float32 depth data (higher precision)
      blurRadius: 20.0, // Blur radius in pixels for SoftOcclusion mode
    },
  })
  .registerComponent(DepthOccludable);
```

All config properties are optional and default to the values shown above.

### Step 3: Mark Entities as Occludable

```javascript
const entity = world.createTransformEntity(mesh);
entity.addComponent(DepthOccludable);
```

The system will automatically traverse the entity's 3D hierarchy, find all `Mesh` children, and inject occlusion shader code into their materials.

## Understanding the Components

### DepthOccludable

Marks an entity to be occluded by real-world depth. When added, the system hooks into the material's shader compilation to inject depth comparison logic.

#### Properties

- **`mode`** - Occlusion algorithm: `OcclusionShadersMode.SoftOcclusion` (default), `HardOcclusion`, or `MinMaxSoftOcclusion`

```javascript
// Default — soft occlusion with smooth edges
entity.addComponent(DepthOccludable);

// Hard occlusion — sharp edges, best performance
entity.addComponent(DepthOccludable, {
  mode: OcclusionShadersMode.HardOcclusion,
});

// MinMax soft occlusion — highest quality with performance cost, edge-aware blending
entity.addComponent(DepthOccludable, {
  mode: OcclusionShadersMode.MinMaxSoftOcclusion,
});
```

### OcclusionShadersMode

Controls the algorithm used to determine occlusion at each fragment.

| Mode                  | Samples per Fragment | Extra GPU Passes          | Quality                                          | Performance  |
| --------------------- | -------------------- | ------------------------- | ------------------------------------------------ | ------------ |
| `SoftOcclusion`       | 13 (two-ring blur)   | None                      | Smooth edges, may bleed at depth discontinuities | Moderate     |
| `HardOcclusion`       | 1                    | None                      | Sharp edges, may alias                           | Fastest      |
| `MinMaxSoftOcclusion` | 1 (preprocessed)     | 1 fullscreen pass per eye | Edge-aware smooth, preserves depth boundaries    | Highest cost |

- **`SoftOcclusion`** is the default and works well for most cases. It uses a 13-tap sampling pattern (center + inner ring + outer ring) controlled by the `blurRadius` config.
- **`HardOcclusion`** does a single depth lookup per fragment. It's the cheapest option but produces hard edges that can look aliased.
- **`MinMaxSoftOcclusion`** runs a preprocessing pass that clusters a 4×4 depth neighborhood into near/far groups, then uses edge-aware interpolation at render time. This produces the smoothest results at depth discontinuities (e.g., an object edge against a distant background) at the cost of an additional render pass.

### DepthSensingSystem

The core system that orchestrates depth data retrieval and occlusion rendering.

#### Config Properties

- **`enableOcclusion`** - Master toggle for occlusion rendering (default: `true`)
- **`enableDepthTexture`** - Whether to update depth textures each frame (default: `true`)
- **`useFloat32`** - Use Float32 precision for CPU depth data (default: `true`)
- **`blurRadius`** - Blur radius in pixels for `SoftOcclusion` mode (default: `20.0`)

#### Accessible Data

The system exposes depth data that you can read from your own systems:

- **`cpuDepthData`** - Array of `XRCPUDepthInformation` objects (populated in CPU-optimized mode)
- **`gpuDepthData`** - Array of `XRWebGLDepthInformation` objects (populated in GPU-optimized mode)
- **`rawValueToMeters`** - Conversion factor from raw depth values to meters

```javascript
class MyDepthSystem extends createSystem() {
  update() {
    const depthSystem = this.world.getSystem(DepthSensingSystem);

    // Access CPU depth data (when using cpu-optimized mode)
    if (depthSystem.cpuDepthData.length > 0) {
      const depthInfo = depthSystem.cpuDepthData[0];
      const distanceMeters = depthInfo.getDepthInMeters(0.5, 0.5); // Center of screen
      console.log('Center depth:', distanceMeters, 'meters');
    }
  }
}
```

## Common Patterns

### Basic Occludable Object

Create a simple object that hides behind real-world surfaces:

```javascript
import {
  DepthOccludable,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Color,
} from '@iwsdk/core';

const cube = new Mesh(
  new BoxGeometry(0.2, 0.2, 0.2),
  new MeshStandardMaterial({
    color: new Color(0x44ff44),
    transparent: true, // Required for occlusion
    metalness: 0.3,
    roughness: 0.4,
  }),
);
cube.position.set(0, 1.0, -0.8);
scene.add(cube);

const entity = world.createTransformEntity(cube);
entity.addComponent(DepthOccludable);
```

### Occludable GLTF Model

Apply occlusion to a loaded GLTF model. The system traverses the entire mesh hierarchy automatically:

```javascript
import {
  AssetManager,
  DepthOccludable,
  OcclusionShadersMode,
} from '@iwsdk/core';

const { scene: robotMesh } = AssetManager.getGLTF('robot');
robotMesh.position.set(0.6, 0, -1.0);
scene.add(robotMesh);

const entity = world.createTransformEntity(robotMesh);
entity.addComponent(DepthOccludable, {
  mode: OcclusionShadersMode.MinMaxSoftOcclusion,
});
```

### Interactive Occludable Objects

Combine depth occlusion with grabbing so users can move objects behind real-world surfaces:

```javascript
import {
  DepthOccludable,
  DistanceGrabbable,
  RayInteractable,
  MovementMode,
  XRAnchor,
} from '@iwsdk/core';

const entity = world.createTransformEntity(mesh);
entity.addComponent(RayInteractable);
entity.addComponent(DistanceGrabbable, {
  movementMode: MovementMode.MoveFromTarget,
});
entity.addComponent(XRAnchor);
entity.addComponent(DepthOccludable);
```

### Toggling Occlusion at Runtime

You can enable or disable occlusion globally through the system config:

```javascript
const depthSystem = world.getSystem(DepthSensingSystem);

// Disable occlusion
depthSystem.config.enableOcclusion = false;

// Re-enable occlusion
depthSystem.config.enableOcclusion = true;
```

### Adjusting Blur Radius

Fine-tune the softness of occlusion edges for `SoftOcclusion` mode:

```javascript
const depthSystem = world.getSystem(DepthSensingSystem);

// Tighter blur — edges closer to hard occlusion
depthSystem.config.blurRadius = 5.0;

// Wider blur — smoother, more forgiving edges
depthSystem.config.blurRadius = 40.0;
```

## Troubleshooting

### Common Issues

**Occlusion not working at all:**

- Verify `depthSensing` is included in your XR features config with `required: true`
- Ensure the device supports the WebXR `depth-sensing` module
- Check that you're in an AR session (`SessionMode.ImmersiveAR`), not VR
- Confirm `DepthSensingSystem` is registered and `enableOcclusion` is `true`

**Objects not being occluded:**

- Make sure the entity has the `DepthOccludable` component
- The `DepthOccludable` component must be added after the entity's `object3D` has its final meshes. If you load a GLTF asynchronously, add the component after the model is ready

**Occlusion edges look wrong:**

- For aliased/jagged edges, switch from `HardOcclusion` to `SoftOcclusion`
- For bleeding at depth edges (e.g., occlusion leaks around object boundaries), try `MinMaxSoftOcclusion`
- Adjust `blurRadius` — lower values produce tighter edges, higher values produce smoother but potentially less accurate edges

**Custom shaders not working with occlusion:**

- The occlusion system injects GLSL code into the material's vertex and fragment shaders via `onBeforeCompile`. Custom shaders that don't use the standard Three.js shader structure may not be compatible
- Ensure your shader includes the `#include <output_fragment>` chunk, which is where the occlusion alpha is applied

## Performance Considerations

1. **Choose the right occlusion mode** — `HardOcclusion` is cheapest, `SoftOcclusion` is a good default, and `MinMaxSoftOcclusion` adds an extra render pass per eye. Use `MinMaxSoftOcclusion` only where edge quality matters most.
2. **Prefer `gpu-optimized` depth** — GPU-optimized depth sensing keeps depth data on the GPU as a texture array, avoiding CPU readback overhead. Use `cpu-optimized` only when you need to read depth values in JavaScript.
3. **Limit occludable entities** — Each entity with `DepthOccludable` has its shader uniforms updated every frame. Only mark entities that actually need occlusion.

## Best Practices

1. Use `SoftOcclusion` as the default mode — it provides a good balance of quality and performance
1. Reserve `MinMaxSoftOcclusion` for hero objects where edge quality is critical
1. Use `HardOcclusion` for small or distant objects where edge quality is less noticeable
1. Test occlusion with various real-world scenes — flat surfaces, object edges, and corners all stress occlusion differently
1. Combine depth occlusion with Scene Understanding (Chapter 11) and Environment Raycast (Chapter 14) for fully grounded AR experiences

## Example Projects

Check out the complete implementation in the SDK:

- **`examples/depth-occlusion`** - AR scene with multiple occlusion modes, grabbable objects, and GLTF models

```bash
cd immersive-web-sdk
pnpm install
pnpm run build:tgz
cd examples/depth-occlusion
npm install
npm run dev
```

## What's Next

With depth occlusion, your virtual objects can realistically integrate with the physical world. Combined with Scene Understanding (Chapter 11) for surface detection and Environment Raycast (Chapter 14) for content placement, you have all the tools needed to build immersive AR experiences where virtual and real objects coexist naturally.

Consider exploring:

- Using depth data directly for proximity-based effects (e.g., particles that react to nearby surfaces)
- Combining occlusion with physics so objects can both collide with and hide behind real-world geometry
- Building AR product visualization apps where items sit on and hide behind real furniture
