# @iwsdk/glxf

GLXF (GLTF eXtended Format) loader for Three.js. A composite scene format optimized for WebXR applications, extending standard GLTF with support for multiple scenes, entities, and component data.

## Features

- 📦 **Composite Scenes** - Load multiple GLTF files as a single scene graph
- 🎯 **Component Data** - Attach custom component data to nodes for ECS integration
- 🔗 **Asset References** - Automatic dependency resolution and loading
- ⚡ **Three.js Native** - Works with any Three.js application

## Installation

```bash
npm install @iwsdk/glxf three
```

## Quick Start

```typescript
import { GLXFLoader } from '@iwsdk/glxf';
import { Scene } from 'three';

const loader = new GLXFLoader();
const glxf = await loader.loadAsync('/path/to/scene.glxf');

// Access the loaded scene
const scene = new Scene();
scene.add(glxf.scene);

// Access component data attached to nodes
glxf.scene.traverse((node) => {
  if (node.userData?.components) {
    console.log('Node components:', node.userData.components);
  }
});
```

## What is GLXF?

GLXF is a scene composition format that wraps multiple GLTF files and adds:

- **Scene Hierarchy** - Define relationships between multiple GLTF assets
- **Component Data** - Attach arbitrary data to nodes for game logic
- **Asset References** - Reference external GLTF files with automatic loading
- **Optimized Loading** - Parallel asset loading for WebXR experiences

GLXF is retained as a legacy interchange format. New IWSDK projects should prefer native scene JSON for authored scene composition.

## Peer Dependencies

- `three` >= 0.160.0

## Documentation

For more information, visit: **[https://iwsdk.dev](https://iwsdk.dev)**

## License

MIT © Meta Platforms, Inc.
