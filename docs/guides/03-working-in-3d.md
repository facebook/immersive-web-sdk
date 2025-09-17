---
outline: [2, 4]
---

# Chapter 3: Working in 3D

Now that you can test your WebXR experience, it's time to learn how to create and manipulate 3D objects. In this chapter, you'll learn the fundamentals of 3D graphics using Three.js within the IWSDK framework. By the end, you'll be able to create primitive shapes and arrange them in 3D space.

## Three.js Fundamentals

IWSDK is built on top of Three.js, the most popular WebGL library for JavaScript. Before we dive into IWSDK's Entity Component System, let's understand the basic Three.js building blocks.

Every 3D object is composed of four essential parts:

1. **Geometry**: The shape/structure (cube, sphere, plane)
2. **Material**: The surface properties (color, texture, how light interacts)
3. **Mesh**: The combination of geometry + material that creates a renderable object
4. **Object3D**: The base class that provides position, rotation, and scale properties

::: info Object3D and Mesh Relationship
`Object3D` is the base class for all objects in Three.js that can be placed in a 3D scene. `Mesh` extends `Object3D`, adding the ability to render geometry with materials. This means every mesh has position, rotation, and scale properties inherited from `Object3D`.
:::

### Geometry: Defining Shape

Geometry defines the 3D structure - the vertices, faces, and edges that make up a shape. Here are the essential primitive geometries you'll use most often:

**BoxGeometry** - For cubes and rectangular shapes:

```javascript
new BoxGeometry(1, 1, 1); // Perfect cube
new BoxGeometry(2, 0.5, 1); // Rectangular box (width, height, depth)
```

**SphereGeometry** - For balls and rounded objects:

```javascript
new SphereGeometry(1, 32, 32); // Simple sphere (radius, horizontal segments, vertical segments)
new SphereGeometry(1, 16, 16); // Lower detail for better performance
```

**CylinderGeometry** - For tubes, cans, and cones:

```javascript
new CylinderGeometry(1, 1, 2, 32); // Cylinder
new CylinderGeometry(0, 1, 2, 32); // Cone (top radius = 0)
```

**PlaneGeometry** - For flat surfaces:

```javascript
new PlaneGeometry(2, 2); // Square plane
new PlaneGeometry(4, 2); // Rectangular plane (width, height)
```

### Material: Defining Appearance

Materials determine how an object looks. For this chapter, we'll focus on two essential materials:

**MeshBasicMaterial** - Simple, unlit colors:

```javascript
import { MeshBasicMaterial } from 'three';

// Flat colors that don't respond to lighting
new MeshBasicMaterial({ color: 0xff0000 });
new MeshBasicMaterial({ color: 'red' });
new MeshBasicMaterial({ color: '#ff0000' });
```

**MeshStandardMaterial** - Realistic lighting:

```javascript
import { MeshStandardMaterial } from 'three';

// Responds to lights in your scene
new MeshStandardMaterial({
  color: 0x0066cc,
  roughness: 0.5, // 0 = mirror, 1 = completely rough
  metalness: 0.2, // 0 = non-metal, 1 = metal
});
```

### Mesh: Combining Shape and Appearance

A mesh combines geometry and material into a renderable 3D object:

```javascript
import { Mesh } from 'three';

// Create a red cube
const cube = new Mesh(cubeGeometry, redMaterial);

// Create a blue sphere
const sphere = new Mesh(sphereGeometry, blueMaterial);
```

## Creating Objects in IWSDK

IWSDK uses an Entity Component System (ECS) architecture. Instead of working with Three.js objects directly, you create entities and add components to them.

::: info What is ECS?
Don't worry if you're not familiar with ECS yet - we'll explain it in detail in Chapter 7. For now, think of it as a way to organize your code where:

- **Entities** are things in your world (like a cube or player)
- **Components** are data that describes entities (position, color, behavior)
- **Systems** are logic that operates on entities with specific components
  :::

### Creating Transform Entities from Meshes

The most straightforward way to add 3D objects to your IWSDK scene is to create a Three.js mesh first, then create a transform entity from it:

```javascript
import { World, Mesh, BoxGeometry, MeshStandardMaterial } from '@iwsdk/core';

// First create the Three.js mesh
const mesh = new Mesh(
  new BoxGeometry(1, 1, 1),
  new MeshStandardMaterial({ color: 0xff6666 }),
);

// Position the mesh
mesh.position.set(0, 1, -2);

// Create a transform entity from the mesh
const entity = world.createTransformEntity(mesh);
```

This approach:

1. Creates a standard Three.js mesh with geometry and material
2. Sets the initial position, rotation, or scale on the mesh
3. Creates an IWSDK entity with a Transform component that manages the mesh

### Positioning, Rotating, and Scaling Objects

You can manipulate objects by setting properties on the Three.js mesh **both before and after** creating the entity. After creating an entity, you access the mesh through the `entity.object3D` property:

```javascript
// BEFORE creating entity - manipulate the mesh directly
mesh.position.set(2, 0, -3); // 2 units right, 0 up, 3 units away
mesh.rotation.y = Math.PI / 2; // 90 degrees around Y-axis
mesh.scale.set(2, 2, 2); // Double size in all dimensions

const entity = world.createTransformEntity(mesh);

// AFTER creating entity - manipulate via entity.object3D
entity.object3D.position.x = 1; // Move 1 unit to the right
entity.object3D.position.y = 2; // Move 2 units up
entity.object3D.position.z = -5; // Move 5 units away from viewer

// You can also use quaternion for more precise rotation control
entity.object3D.quaternion.setFromEuler(new Euler(0, Math.PI, 0));

// Scale individual axes
entity.object3D.scale.set(1, 0.5, 1); // Half height, normal width/depth
```

::: tip Coordinate System & Rotation
**Position coordinates:**

- **X-axis**: Left (-) to Right (+)
- **Y-axis**: Down (-) to Up (+)
- **Z-axis**: Into screen (+) to Out of screen (-)

**Rotation:** Three.js uses radians. To convert degrees to radians: `radians = degrees * (Math.PI / 180)`. Common conversions: 90° = π/2, 180° = π, 270° = 3π/2, 360° = 2π.
:::

## Building Your First Scene

Let's add some simple 3D objects to your starter app. You'll modify your existing `src/index.ts` (or `src/index.js`) file to include new primitive objects.

First, add the Three.js imports you'll need at the top of your file:

```javascript
import {
  // ... existing imports
  Mesh,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
} from '@iwsdk/core';
```

Then, find the `World.create().then((world) => {` section and add your objects after the existing code:

```javascript
World.create(/* ... existing options */).then((world) => {
  // ... existing camera setup and asset loading code

  // Add your primitive objects here:

  // Create a red cube
  const cubeGeometry = new BoxGeometry(1, 1, 1);
  const redMaterial = new MeshStandardMaterial({ color: 0xff3333 });
  const cube = new Mesh(cubeGeometry, redMaterial);
  cube.position.set(-1, 0, -2);
  const cubeEntity = world.createTransformEntity(cube);

  // Create a green sphere
  const sphereGeometry = new SphereGeometry(0.5, 32, 32);
  const greenMaterial = new MeshStandardMaterial({ color: 0x33ff33 });
  const sphere = new Mesh(sphereGeometry, greenMaterial);
  sphere.position.set(1, 0, -2);
  const sphereEntity = world.createTransformEntity(sphere);

  // Create a blue floor plane
  const floorGeometry = new PlaneGeometry(4, 4);
  const blueMaterial = new MeshStandardMaterial({ color: 0x3333ff });
  const floor = new Mesh(floorGeometry, blueMaterial);
  floor.position.set(0, -1, -2);
  floor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  const floorEntity = world.createTransformEntity(floor);

  // ... rest of existing code (systems registration, etc.)
});
```

::: tip Where to Place Your Code
Add your primitive objects after the existing asset loading code but before the `world.registerSystem()` calls. This ensures your objects are created after the world is properly initialized but before any systems that might need to interact with them start running.
:::

## What's Next

Great work! You now understand the fundamentals of creating and positioning 3D objects in IWSDK. You've learned how Three.js geometry, materials, and meshes work, and how to integrate them into IWSDK's Entity Component System using transform entities.

In Chapter 4, we'll learn how to work with external assets like 3D models and textures, which will allow you to create much more sophisticated and visually appealing scenes.

You'll learn how to:

- Load GLTF/GLB 3D models
- Apply texture images to materials
- Use IWSDK's AssetManager for efficient loading
- Understand different asset loading strategies
