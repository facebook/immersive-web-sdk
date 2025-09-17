# @iwsdk/vite-plugin-gltf-optimizer

A Vite plugin for optimizing GLTF/GLB files during build using gltf-transform. Provides intelligent compression for geometry and textures optimized for WebXR applications.

## Features

- 🚀 **Build-time Optimization** - Processes GLTF/GLB files during Vite build
- 📦 **Multiple Compression Options** - Draco, Meshopt, and quantization-only modes
- 🎨 **Smart Texture Compression** - Auto-detects optimal KTX2 compression (ETC1S vs UASTC)
- ⚡ **WebXR Optimized** - Presets tuned for VR/AR performance and memory constraints
- 🔧 **Developer Friendly** - Uniform 0-1 scale for all quality settings
- 📁 **Dependency Management** - Prevents texture/bin conflicts by managing asset dependencies

## Installation

```bash
pnpm add -D @iwsdk/vite-plugin-gltf-optimizer
```

## Quick Start

```javascript
import { defineConfig } from 'vite';
import { optimizeGLTF } from '@iwsdk/vite-plugin-gltf-optimizer';

export default defineConfig({
  plugins: [
    optimizeGLTF({
      level: 'medium', // 'light' | 'medium' | 'aggressive'
      verbose: true,
    }),
  ],
});
```

## Configuration Options

### Preset Levels

Choose a preset level for quick setup:

```javascript
optimizeGLTF({
  level: 'light', // High quality, basic optimization
  level: 'medium', // Balanced quality/size (default)
  level: 'aggressive', // Maximum compression
});
```

### Advanced Configuration

```javascript
optimizeGLTF({
  // File filtering
  include: /\.(gltf|glb)$/i, // Files to process
  exclude: /test|demo/, // Files to skip
  verbose: true, // Detailed logging

  // Geometry compression (0.0 = max compression, 1.0 = max quality)
  geometry: {
    compress: 'meshopt', // 'quantize' | 'meshopt' | 'draco' | 'both' | false
    quality: 0.75, // Compression quality
    speed: 0.5, // Encoding speed (draco only)
    precision: 0.8, // Vertex precision
  },

  // Texture compression
  textures: {
    mode: 'auto', // 'auto' | 'etc1s' | 'uastc' | 'manual'
    quality: 0.75, // Texture quality
    maxSize: 1024, // Maximum texture size

    // Manual mode patterns
    etc1sPatterns: [/ui|simple/], // ETC1S compression patterns
    uastcPatterns: [/normal|detail/], // UASTC compression patterns
  },
});
```

## Compression Methods

### Geometry Compression

- **`quantize`** - Fast, lossless vertex precision reduction (10-30% reduction)
- **`meshopt`** - Fast decode, good compression (~50-70% reduction)
- **`draco`** - Best compression, slower decode (~80-95% reduction)
- **`both`** - Apply meshopt then draco for maximum compression
- **`false`** - No geometry compression

### Texture Compression

All textures are converted to KTX2 format for optimal GPU memory usage:

- **`etc1s`** - Smaller files, good for UI and simple textures
- **`uastc`** - Higher quality, good for normal maps and detailed textures
- **`auto`** - Smart mode that chooses based on texture usage:
  - UASTC: normal maps, metallic-roughness, emission, detail textures
  - ETC1S: diffuse/base color, UI, backgrounds, simple textures

## Usage Examples

### Basic WebXR Optimization

```javascript
// Optimized for VR headsets with memory constraints
optimizeGLTF({
  level: 'medium',
  geometry: { compress: 'meshopt' }, // Fast decode
  textures: { mode: 'auto', maxSize: 1024 },
});
```

### High-Quality Desktop VR

```javascript
// Prioritize visual quality for desktop VR
optimizeGLTF({
  geometry: {
    compress: 'draco',
    quality: 0.9, // High quality
    precision: 0.9, // High precision
  },
  textures: {
    mode: 'uastc', // High quality textures
    quality: 0.85,
    maxSize: 2048,
  },
});
```

### Mobile VR Optimization

```javascript
// Maximum compression for mobile bandwidth/memory
optimizeGLTF({
  level: 'aggressive',
  geometry: { compress: 'draco' }, // Best compression
  textures: {
    mode: 'etc1s', // Smaller textures
    maxSize: 512,
  },
});
```

### Custom Pattern Matching

```javascript
// Manual control over texture compression
optimizeGLTF({
  textures: {
    mode: 'manual',
    etc1sPatterns: [
      /ui|interface|logo/i, // UI elements
      /diffuse|albedo|color/i, // Color textures
      /environment|sky/i, // Backgrounds
    ],
    uastcPatterns: [
      /normal|bump/i, // Normal maps
      /metallic|roughness|ao/i, // PBR maps
      /hero|main|detail/i, // Important textures
    ],
  },
});
```

## Build Output

The plugin processes files during `vite build`:

```bash
npm run build
```

Example output:

```
🔧 GLTF Optimizer Configuration:
   Level: medium
   Geometry: meshopt (quality: 75%, precision: 80%)
   Textures: auto mode (quality: 75%, max size: 1024px)

📋 Found 4 GLTF/GLB file(s) to optimize
🔄 Processing: gltf/generated/drone.gltf
   Geometry compression: meshopt
   Texture "baseColorTexture": etc1s compression
   Texture "normalTexture": uastc compression
✅ drone.gltf: 623.4KB → 156.8KB (74.8% reduction)
🔄 Processing: gltf/generated/robot.gltf
✅ robot.gltf: 1.2MB → 234.5KB (80.4% reduction)
✅ GLTF optimization completed
```

## Performance Impact

Typical compression results:

- **File size**: 70-95% reduction depending on content
- **GPU memory**: 80-90% reduction (textures stay compressed)
- **Load time**: Faster due to smaller files
- **Decode time**: Minimal impact with meshopt, slight increase with draco

## WebXR Integration

Add meshopt support to your Three.js loader:

```javascript
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// In your asset manager
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  optimizeGLTF,
  type GLTFOptimizerOptions,
} from '@iwsdk/vite-plugin-gltf-optimizer';

const options: GLTFOptimizerOptions = {
  level: 'medium',
  verbose: true,
};
```

## License

MIT
