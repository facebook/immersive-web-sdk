---
name: iwsdk-depth-occlusion
description: Guide for implementing depth sensing and occlusion in IWSDK projects. Use when adding depth-based occlusion to hide virtual objects behind real-world surfaces, configuring DepthSensingSystem, choosing occlusion modes, or troubleshooting objects that disappear or fail to occlude.
argument-hint: '[description of depth occlusion task]'
---

# Depth Occlusion

Hide virtual objects behind real-world surfaces using WebXR depth sensing. The system samples a per-pixel depth texture from the XR device and compares it against each virtual fragment's depth — if the real surface is closer, the fragment is faded out.

## Setup

Three things are required: XR session depth config, the system, and the component.

### 1. Enable depth sensing on the XR session

```jsonc
// iwsdk.config.json
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
    }
  }
}
```

### 2. Register `DepthSensingSystem` and `DepthOccludable`

```typescript
import { DepthSensingSystem, DepthOccludable } from '@iwsdk/core';

world
  .registerSystem(DepthSensingSystem, {
    configData: {
      enableDepthTexture: true,
      enableOcclusion: true,
      useFloat32: true,
      blurRadius: 20.0,
    },
  });
```

### 3. Add `DepthOccludable` to entities

```typescript
import { DepthOccludable, OcclusionShadersMode } from '@iwsdk/core';

// Soft occlusion (default) — smooth edges via 13-tap blur
entity.addComponent(DepthOccludable);

// Hard occlusion — sharp edges, single depth sample
entity.addComponent(DepthOccludable, {
  mode: OcclusionShadersMode.HardOcclusion,
});

// MinMax occlusion — best quality, extra preprocessing pass
entity.addComponent(DepthOccludable, {
  mode: OcclusionShadersMode.MinMaxSoftOcclusion,
});
```

The material must have `transparent: true`. The system sets this automatically, but verify it on custom materials.

## Occlusion Modes

| Mode                  | Quality | Cost   | Best For                                                          |
| --------------------- | ------- | ------ | ----------------------------------------------------------------- |
| `SoftOcclusion`       | Good    | Low    | Most objects — smooth edges, hides depth aliasing                 |
| `HardOcclusion`       | Basic   | Lowest | Small objects or when sharp edges are acceptable                  |
| `MinMaxSoftOcclusion` | Best    | Medium | Large objects with complex silhouettes against varied backgrounds |

## DepthSensingSystem Config

| Property             | Type    | Default | Description                               |
| -------------------- | ------- | ------- | ----------------------------------------- |
| `enableOcclusion`    | Boolean | `true`  | Master switch for all occlusion           |
| `enableDepthTexture` | Boolean | `true`  | Create GPU textures from depth data       |
| `useFloat32`         | Boolean | `true`  | Float32 depth textures (higher precision) |
| `blurRadius`         | Float32 | `20.0`  | Blur radius for soft occlusion (pixels)   |

## Depth Sensing Modes

| Mode            | When to use                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cpu-optimized` | Simpler, works everywhere. Depth as linear meters in a DataArrayTexture.                                                                                                                                        |
| `gpu-optimized` | **Recommended.** Matches Quest hardware format. Depth as reverse-Z inverse depth in an ExternalTexture. Required for production parity with on-device behavior. Note that Quest devices only support this mode. |

## AR Session Requirements

Depth occlusion only works in AR mode. The scene background must be `null` for passthrough:

```typescript
scene.background = null;
```

## Troubleshooting

**Objects never occlude (always visible on top)**

- Verify the entity has `DepthOccludable` component
- Verify `DepthSensingSystem` is registered with `enableOcclusion: true`
- Check that `depthSensing` is in the XR features config

**Objects always invisible in IWER**

- In the IWER emulator, the SEM must have loaded environment geometry. If no room is loaded, no depth data is produced.
- Check the console for "Warning: depth-sensing feature not enabled"

**Flickering or noisy occlusion edges**

- Increase `blurRadius` (try 30-40)
- Switch from `HardOcclusion` to `SoftOcclusion`
- Use `MinMaxSoftOcclusion` for best edge quality

## Notes

- **Only works in AR mode** — set `world.xr.mode` to `"ar"` and configure
  `world.xr.features.depthSensing` in `iwsdk.config.json`.
- **`DepthOccludable` may be incompatible with custom shaders** that override `diffuse` or `fog_vertex` includes, since the occlusion code is injected at those shader hook points.
- **Non-occludable objects** are simply entities without `DepthOccludable` — they render normally on top of everything.
- **`DepthOccludable` is built into IWSDK** and is already registered — it appears
  in `scene_get_capabilities` under `registeredComponents`. Do not call
  `world.registerComponent()` for it; only the system needs registering.
