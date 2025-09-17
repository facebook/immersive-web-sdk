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
const o = new (await import('@iwsdk/core')).Object3D();
const withMesh = world.createTransformEntity(o);
```

`createTransformEntity` ensures `object3D` is detached when the entity is released.

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
