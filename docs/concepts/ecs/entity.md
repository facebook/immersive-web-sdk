---
title: Entity
---

# Entity

An Entity is a lightweight container for Components. In IWSDK, Entities may also carry a Three.js `object3D`.

## Creating Entities

```ts
const e = world.createEntity();
const t = world.createTransformEntity(); // adds an Object3D and a Transform component
```

Parenting options:

```ts
const child = world.createTransformEntity(undefined, { parent: t });
const persistent = world.createTransformEntity(undefined, { persistent: true }); // parented under scene
```

## Object3D Attachment

```ts
import { Mesh, BoxGeometry, MeshStandardMaterial } from '@iwsdk/core';

const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshStandardMaterial({ color: 0x00ff00 });
const mesh = new Mesh(geometry, material);

const entity = world.createTransformEntity(mesh);
```

`createTransformEntity` is the recommended way to attach Three.js objects to entities. It ensures `object3D` is properly managed and detached when the entity is released.

## Component Operations

```ts
e.addComponent(Health, { current: 100 });
e.removeComponent(Health);
e.has(Health); // boolean
```

## Reading & Writing Data (in Systems)

```ts
const v = e.getValue(Health, 'current'); // number | undefined
e.setValue(Health, 'current', 75);

// For vector fields (Types.Vec3) use a typed view:
const pos = e.getVectorView(Transform, 'position'); // Float32Array
pos[1] += 1; // move up
```
