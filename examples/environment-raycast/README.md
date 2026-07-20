# Environment Raycast Example

This example demonstrates environment raycasting (hit-testing) in WebXR AR using the Immersive Web SDK (IWSDK). Place virtual plants on real-world surfaces by pointing your controller and pressing the trigger.

## Overview

This example showcases the `EnvironmentRaycastTarget` component for AR hit-testing:

- **Continuous Raycasting**: A preview plant follows the controller's raycast hit point in real-time
- **Surface Alignment**: Objects automatically orient to match the surface normal
- **Trigger-to-Place**: Press the trigger to spawn a permanent plant at the hit location
- **No Room Scanning Required**: Works immediately using WebXR hit-test, unlike Scene Understanding which requires room scanning

## Project Structure

```
environment-raycast/
├── src/
│   ├── index.ts           # Main application entry point
│   ├── panel.ts           # UI panel system
│   └── raycast-plant.ts   # Plant placement system
├── ui/
│   └── welcome.uikitml    # Welcome panel UI definition
├── public/
│   └── ui/                # Compiled UI output
├── index.html             # HTML entry point
├── vite.config.ts         # Vite build configuration
└── package.json           # Dependencies
```

The plant model is served from the shared `@iwsdk/example-assets` catalog at
`/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf`.

## Quick Start

### Prerequisites

- Node.js 20.19.0+
- pnpm (for monorepo dependencies)
- HTTPS-capable development environment
- AR-capable device (e.g., Meta Quest 3, Quest Pro)

### Installation

First, install dependencies and build packages from the monorepo root:

```bash
cd immersive-web-sdk
pnpm install
pnpm run build:tgz
```

Then install the example's dependencies:

```bash
cd examples/environment-raycast
npm install
```

### Development

```bash
# Start development server with HTTPS
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server will start on the HTTPS local URL reported by Vite or `npx iwsdk dev status` (typically `https://localhost:5173/` when that port is free).

## Implementation Details

### Main Application (src/index.ts)

The application initializes a WebXR AR world with hit-test enabled:

```typescript
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      hitTest: { required: true },
    },
  },
  features: {
    environmentRaycast: true,
  },
});
```

### EnvironmentRaycastTarget Component

The core of this example is the `EnvironmentRaycastTarget` component, which automatically positions an entity at the raycast hit point:

```typescript
// Create a preview entity that follows the raycast
const previewEntity = world.createTransformEntity(previewMesh);
previewEntity.addComponent(EnvironmentRaycastTarget, {
  space: RaycastSpace.Right, // Use right controller
  maxDistance: 10, // Maximum raycast distance in meters
});

// The entity's Object3D is automatically:
// - Positioned at the hit point
// - Oriented to match the surface normal
// - Hidden when there's no hit
```

### Reading Hit Results

Access the underlying `XRHitTestResult` for advanced use cases:

```typescript
const xrResult = entity.getValue(EnvironmentRaycastTarget, 'xrHitTestResult');
if (xrResult && gamepad.getSelectStart()) {
  // Spawn object at current hit location
  spawnObject(entity.object3D.position.clone());
}
```

## RaycastSpace Options

- **`RaycastSpace.Right`**: Use right controller's target ray
- **`RaycastSpace.Left`**: Use left controller's target ray
- **`RaycastSpace.Viewer`**: Use head/gaze direction
- **`RaycastSpace.Screen`**: For phone AR - tracks screen touch for tap-to-place

## Troubleshooting

### Raycast Not Working

- Ensure `hitTest: { required: true }` in XR features
- Verify `environmentRaycast: true` in World config
- Check that you're in an AR session (not VR)

### Preview Object Not Visible

- The object is hidden when there's no hit - point at a surface
- Check maxDistance isn't too small

### Build Issues

- Run `npm run fresh:build` for clean rebuild
- Check that all IWSDK packages are properly linked

## Learn More

- [Immersive Web SDK Documentation](https://iwsdk.dev/)
- [WebXR Hit Test Specification](https://immersive-web.github.io/hit-test/)

## License

Copyright (c) Meta Platforms, Inc. and affiliates.

This project is licensed under the MIT License - see the LICENSE file for details.
