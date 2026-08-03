# Depth Occlusion Example

This example demonstrates depth-based occlusion in the Immersive Web SDK (IWSDK). Virtual objects are hidden when they pass behind real-world surfaces, creating a more realistic AR experience.

## What This Example Shows

- **Depth Sensing**: Configuring WebXR depth sensing with GPU-optimized float32 depth data
- **Depth Occlusion**: Using the `DepthOccludable` component to automatically occlude virtual objects behind real-world geometry
- **DepthSensingSystem**: Registering and configuring the system that drives depth data retrieval and occlusion rendering
- **Interactive Objects**: Combining occlusion with distance grabbing and spatial anchors

### What's in the Example

The example creates three occludable primitives in an AR scene:

1. **Red sphere** at `(0, 0.8, -0.8)` with `DepthOccludable`
2. **Green cube** at `(-0.4, 0.8, -0.6)` with `DepthOccludable`
3. **Blue cylinder** at `(0.4, 0.8, -0.6)` without `DepthOccludable` (for comparison)

All objects are distance-grabbable and anchored, so you can move them around and observe occlusion in action. The `OcclusionDemoSystem` also applies a gentle rotation animation to occludable entities.

## Project Structure

```
depth-occlusion/
├── src/
│   └── index.js          # OcclusionDemoSystem and world setup
├── index.html            # HTML entry point
├── vite.config.js        # Vite configuration with HTTPS
└── package.json          # Dependencies
```

## Quick Start

### Prerequisites

- Node.js 20.19.0+ and pnpm
- An AR-capable device with depth sensing support (e.g., Meta Quest 3)

### Installation

```bash
cd depth-occlusion
pnpm install
```

### Development

```bash
# Start development server with HTTPS
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## How It Works

### 1. Configure Depth Sensing

Declare depth sensing in `iwsdk.config.json`:

```json
{
  "world": {
    "xr": {
      "mode": "ar",
      "referenceSpace": "unbounded",
      "features": {
        "depthSensing": {
          "required": true,
          "usage": "gpu-optimized",
          "format": "float32"
        },
        "hitTest": { "required": true },
        "anchors": { "required": true },
        "unbounded": { "required": true }
      }
    },
    "features": {
      "grabbing": true
    }
  }
}
```

### 2. Register the DepthSensingSystem

```javascript
world.registerSystem(DepthSensingSystem, {
  configData: {
    enableDepthTexture: true,
    enableOcclusion: true,
    useFloat32: true,
  },
});
```

### 3. Mark Entities as Occludable

Add the `DepthOccludable` component to any entity that should be hidden behind real-world surfaces:

```javascript
const entity = world.createTransformEntity(mesh);
entity.addComponent(DepthOccludable);
```

The `DepthSensingSystem` automatically injects occlusion shader code into the entity's materials when the component is added, and removes it when the component is removed. No manual shader setup is required.

### Depth Sensing Options

| Option               | Type    | Default | Description                                   |
| -------------------- | ------- | ------- | --------------------------------------------- |
| `enabled`            | boolean | `true`  | Enable/disable the depth sensing system       |
| `enableDepthTexture` | boolean | `true`  | Enable depth texture generation               |
| `enableOcclusion`    | boolean | `true`  | Enable occlusion rendering                    |
| `useFloat32`         | boolean | `true`  | Use float32 depth values (vs luminance-alpha) |

### Depth Sensing Modes

The `depthSensing.usage` field controls how depth data is accessed:

- **`gpu-optimized`**: Depth data stays on the GPU as a texture array. Lower latency, preferred for occlusion.
- **`cpu-optimized`**: Depth data is copied to CPU memory as a `DataTexture`. Useful if you need to read depth values on the CPU.

## Testing on Device

1. Start the dev server: `pnpm dev`
2. On your Quest device, open the browser and navigate to the reported network URL, for example `https://YOUR_LOCAL_IP:<PORT>`
3. Accept the self-signed certificate warning
4. Enter AR mode
5. Move the virtual objects behind real-world surfaces to see occlusion

## License

This project is licensed under the MIT License - see the LICENSE file for details.
