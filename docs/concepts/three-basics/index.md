---
title: Three.js Basics
---

# Three.js with IWSDK

This section bridges the gap between ECS data and 3D visuals. **IWSDK handles Three.js initialization for you**, but you still need to understand meshes, materials, transformations, and how the 3D world connects to your ECS components.

## The Mental Model: Two Connected Worlds

Many developers get confused about the relationship between ECS and Three.js. Think of them as **two synchronized worlds**:

```text
ECS World (Data):              Three.js World (Visuals):
─────────────────              ──────────────────────────
Entity 12                      Object3D
├─ Transform { pos: [1,2,3] }  ├─ position: Vector3(1,2,3)
├─ Health { current: 75 }      └─ Mesh
└─ Mesh { geometry: 'box' }        ├─ BoxGeometry
                                   └─ MeshStandardMaterial
```

**Key insight**: ECS stores the **data** (what things are), Three.js handles the **rendering** (how things look). IWSDK automatically syncs them.

## What IWSDK Manages vs What You Control

**IWSDK Handles Automatically:**

- `WebGLRenderer` creation and WebXR setup
- `Scene` and `PerspectiveCamera` initialization
- Render loop (`renderer.setAnimationLoop`)
- Transform synchronization between ECS ↔ Three.js
- Default lighting environment and PMREM
- Input raycasting and XR session management

**You Focus On:**

- Creating entities with `world.createTransformEntity()`
- Attaching meshes, geometries, and materials to `entity.object3D`
- Writing ECS systems to animate and control behavior
- Understanding 3D math for rotations, positioning, and scaling

## Core Three.js Concepts You Need

**Essential Knowledge:**

- [ECS ↔ Three.js Interop](/concepts/three-basics/interop-ecs-three) — how the two worlds stay synchronized
- [Transforms & 3D Math](/concepts/three-basics/transforms-math) — position, rotation, scale in 3D space
- [Meshes, Geometry & Materials](/concepts/three-basics/meshes-geometry-materials) — the building blocks of 3D objects

## Quick Start: Your First 3D Object

Here's how ECS and Three.js work together in IWSDK:

```ts
import { World, Mesh, BoxGeometry, MeshStandardMaterial } from '@iwsdk/core';

// 1) IWSDK creates renderer, scene, camera automatically
const world = await World.create(container);

// 2) Create a mesh using Three.js classes
const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshStandardMaterial({ color: 0x00ff00 });
const mesh = new Mesh(geometry, material);

// 3) Create an entity and attach the Three.js object
const boxEntity = world.createTransformEntity(mesh);

// 4) Position the object in 3D space
boxEntity.object3D.position.set(2, 1, 0);
```

**What happened?**

1. IWSDK handled renderer setup and render loop
2. You created Three.js objects (geometry, material, mesh)
3. You attached them to an ECS entity via `createTransformEntity()`
4. IWSDK automatically syncs ECS Transform data to Three.js position/rotation/scale

## Coordinate System & Units

IWSDK uses Three.js's **right-handed coordinate system**:

- **+X**: Right
- **+Y**: Up
- **+Z**: Forward (toward viewer)
- **Units**: Meters (aligned with WebXR's physical scale)

```text
        +Y (up)
         |
         |
         |
    ---- 0 ---- +X (right)
        /
       /
    +Z (forward)
```

This matches the real world in VR/AR where 1 unit = 1 meter.

## Why These Concepts Matter for WebXR

**VR/AR is Different from 2D Web:**

- **Performance**: 90fps requirement means efficient 3D math and rendering
- **Scale**: Objects must have realistic sizes (door = ~2 meters tall)
- **Interaction**: Users can walk around and touch objects in 3D space
- **Physics**: Collisions and grabbing require understanding 3D transforms

Understanding Three.js fundamentals helps you build immersive experiences that feel natural and perform well in headsets.
