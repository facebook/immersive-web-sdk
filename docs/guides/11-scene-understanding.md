---
outline: [2, 4]
---

# Chapter 11: Scene Understanding

The IWSDK provides a comprehensive scene understanding system that enables AR/VR applications to detect and interact with real-world geometry. This chapter covers everything you need to know about implementing plane detection, mesh detection, and anchoring in your WebXR applications.

## What You'll Build

By the end of this chapter, you'll be able to:

- Set up scene understanding systems for plane and mesh detection
- Automatically detect flat surfaces like floors, walls, and ceilings
- Detect complex 3D geometry including furniture and room structure
- Create stable anchor points that persist across tracking loss
- Build semantic-aware interactions based on detected object types
- Place virtual content accurately on real-world surfaces

## Overview

The scene understanding system leverages WebXR's scene understanding capabilities to provide:

- **Plane Detection** - Automatically detect flat surfaces like floors, walls, and ceilings
- **Mesh Detection** - Detect complex 3D geometry including furniture and room structure
- **Anchoring** - Create stable reference points that persist across tracking loss
- **Automatic Entity Management** - Real-world geometry is automatically converted to ECS entities
- **Semantic Understanding** - Meshes include semantic labels (table, chair, wall, etc.)

### Key Components

- **`SceneUnderstandingSystem`** - Core system that manages WebXR scene understanding
- **`XRPlane`** - Component for detected flat surfaces
- **`XRMesh`** - Component for detected 3D geometry
- **`XRAnchor`** - Component for anchoring objects to stable positions

## Quick Start

Here's a minimal example to enable scene understanding:

```javascript
import {
  World,
  SceneUnderstandingSystem,
  XRPlane,
  XRMesh,
  XRAnchor,
  SessionMode,
} from '@iwsdk/core';

// React to detected planes
class PlaneProcessSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (entity) => {
      console.log('New plane detected!', entity.object3D?.position);
    });
  }

  update() {
    this.queries.planeEntities.entities.forEach((entity) => {
      console.log('Existing plane: ', entity.object3D?.position);
    });
  }
}

// Create world with AR session and required features
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      planeDetection: true,
      meshDetection: true,
      anchors: true,
    },
  },
}).then((world) => {
  // Register the scene understanding system
  world
    .registerSystem(SceneUnderstandingSystem)
    .registerComponent(XRPlane)
    .registerComponent(XRMesh)
    .registerComponent(XRAnchor)
    .registerSystem(PlaneProcessSystem);
});
```

## System Setup

### Step 1: WebXR Session Configuration

Scene understanding requires specific WebXR features to be enabled:

```javascript
World.create(container, {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      planeDetection: true, // Enable plane detection
      meshDetection: true, // Enable mesh detection
      anchors: true, // Enable anchor creation
    },
  },
});
```

**Important**: Not all WebXR implementations support all features. The system will log warnings for unsupported features.

### Step 2: Register System and Components

```javascript
world
  .registerSystem(SceneUnderstandingSystem)
  .registerComponent(XRPlane)
  .registerComponent(XRMesh)
  .registerComponent(XRAnchor);
```

### Step 3: System Configuration

The system accepts configuration options:

```javascript
world.registerSystem(SceneUnderstandingSystem, {
  configData: {
    showWireFrame: true, // Show/hide wireframe visualization for detected planes and meshes
  },
});
```

## Understanding the Components

### XRPlane

Represents detected flat surfaces in the real world. **Do not manually create** - these are automatically managed by the system.

#### Plane Properties

- **Entity Object3D** - Visual representation of the plane (wireframe box by default)
- **`_plane`** - Internal WebXR plane object (read-only)

### XRMesh

Represents detected 3D geometry in the real world. **Do not manually create** - these are automatically managed by the system.

```javascript
class MeshProcessSystem extends createSystem({
  meshEntities: { required: [XRMesh] },
}) {
  init() {
    // Query for detected meshes
    this.queries.meshEntities.subscribe('qualify', (entity) => {
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel');

      if (isBounded) {
        console.log('Object detected:', semanticLabel);
        const dimensions = entity.getValue(XRMesh, 'dimensions');
        const min = entity.getValue(XRMesh, 'min');
        const max = entity.getValue(XRMesh, 'max');

        console.log('Object size:', dimensions);
        console.log('Bounding box:', min, max);
      } else {
        console.log('Global mesh detected (room structure)');
      }
    });
  }
}
```

#### Mesh Properties

- **`isBounded3D`** - Whether this is a bounded object vs global scene mesh, [read more](https://developers.meta.com/horizon/documentation/unity/unity-scene-build-mixed-reality/?locale=en_GB#common-scene-anchors) about bounded 3D meshes and scene meshes
- **`semanticLabel`** - Semantic classification ('table', 'chair', 'wall', etc.)
- **`min`** - Minimum bounding box coordinates
- **`max`** - Maximum bounding box coordinates
- **`dimensions`** - Calculated dimensions [width, height, depth]
- **`_mesh`** - Internal WebXR mesh object (read-only)

### XRAnchor

Anchors objects to stable real-world positions. **User creates** this component to anchor entities.

```javascript
// Create an anchored object
const hologram = world.createTransformEntity(hologramMesh);
hologram.addComponent(XRAnchor);

// The system will automatically:
// 1. Create a stable anchor at the current world position
// 2. Attach the object to the anchored reference frame
// 3. Maintain stable positioning across tracking loss
```

#### Anchor Properties

- **`attached`** - Whether the entity has been attached to the anchor group (managed by system)

## Plane Detection

### Understanding Plane Detection

WebXR plane detection identifies flat surfaces in the real world:

- **Horizontal planes**: Floors, tables, desks
- **Vertical planes**: Walls, doors, windows
- **Arbitrary planes**: Angled surfaces like ramps

### Working with Detected Planes

```javascript
// React to new planes
class PlaneProcessSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (entity) => {
      const planeObject = entity.object3D;
      const position = planeObject.position;
      const rotation = planeObject.quaternion;

      console.log('Plane detected at:', position);

      // Place content on the plane
      const marker = createMarkerMesh();
      marker.position.copy(position);
      marker.position.y += 0.1; // Slightly above the plane
      scene.add(marker);
    });

    this.queries.planeEntities.subscribe('disqualify', (entity) => {
      console.log('Plane lost:', entity.object3D?.position);
      // Clean up any content placed on this plane
    });
  }
}
```

### Plane-based Content Placement

```javascript
// Place objects on detected floor planes
class PlaneProcessSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (entity) => {
      const plane = entity.getValue(XRPlane, '_plane');

      // Check if it's a horizontal plane (floor-like)
      if (plane.orientation === 'horizontal') {
        const planePosition = entity.object3D.position;

        // Place a virtual object on the floor
        const virtualObject = createVirtualObject();
        virtualObject.position.copy(planePosition);
        virtualObject.position.y += 0.5; // Above the floor
        scene.add(virtualObject);
      }
    });
  }
}
```

## Mesh Detection

### Understanding Mesh Detection

WebXR mesh detection provides detailed 3D geometry:

- **Bounded meshes**: Individual objects with semantic labels
- **Global mesh**: Generic scene mesh objects
- **Semantic classification**: The label of the detected mesh object if it's a bounded 3d mesh. Available sementic label values are listed [here](https://github.com/immersive-web/semantic-labels).

### Working with Detected Meshes

```javascript
class MeshProcessSystem extends createSystem({
  meshEntities: { required: [XRMesh] },
}) {
  init() {
    this.queries.meshEntities.subscribe('qualify', (entity) => {
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel');

      if (isBounded) {
        handleBoundedObject(entity, semanticLabel);
      } else {
        handleGlobalMesh(entity);
      }
    });
  }
}

function handleBoundedObject(entity, semanticLabel) {
  const dimensions = entity.getValue(XRMesh, 'dimensions');
  const position = entity.object3D.position;

  switch (semanticLabel) {
    case 'table':
      console.log(`Table detected: ${dimensions[0]}x${dimensions[2]}m`);
      break;

    case 'chair':
      console.log('Chair detected');
      // Maybe spawn a virtual cushion or highlight
      break;

    case 'wall':
      console.log('Wall detected');
      // Could place artwork or UI panels
      break;
  }
}

function handleGlobalMesh(entity) {
  console.log('Room structure detected');
  // Could use for occlusion, physics, or environmental effects
}
```

### Semantic-based Interactions

```javascript
// Example: Interactive table system
class TableInteractionSystem extends createSystem({
  tables: { required: [XRMesh], where: [eq(XRMesh, 'semanticLabel', 'table')] },
}) {
  update() {
    this.queries.tables.entities.forEach((entity) => {
      const dimensions = entity.getValue(XRMesh, 'dimensions');
      const position = entity.object3D.position;

      // Create interactive surface
      this.createTableInterface(position, dimensions);
    });
  }

  createTableInterface(position, dimensions) {
    // Create UI or interactive elements for the table
    const interface = createTableUI(dimensions);
    interface.position.copy(position);
    interface.position.y += 0.01; // Just above table surface
    this.scene.add(interface);
  }
}
```

## Anchoring

### Understanding Anchors

Anchors provide stable positioning that persists it's world location that won't be changed with recentering the view.

### Creating Anchored Content

```javascript
// Anchor existing object
const existingObject = world.createTransformEntity(mesh);
existingObject.object3D.position.set(0, 1, -2);
existingObject.addComponent(XRAnchor);
```

## Visual Feedback

### Wireframe Visualization

The system provides optional wireframe visualization for detected geometry:

```javascript
// Configure during registration
world.registerSystem(SceneUnderstandingSystem, {
  configData: { showWireFrame: false },
});

// Or enable/disable wireframes
world.getSystem(SceneUnderstandingSystem).config.showWireFrame.value = true;
```

## Common Patterns

### AR Furniture Placement

```javascript
// Place virtual furniture on detected floor planes
class FurnitureSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (entity) => {
      const plane = entity.getValue(XRPlane, '_plane');

      if (plane.orientation === 'horizontal') {
        const planePosition = entity.object3D.position;

        // Create anchored furniture
        const chairMesh = // Create your chair mesh here
        const chair = world.createTransformEntity(chairMesh);
        chair.object3D.position.copy(planePosition);
        chair.object3D.position.y += 0.4; // Chair height
        chair.addComponent(XRAnchor);
      }
    });
  }
}
```

### Interactive Surface Detection

```javascript
// Create interactive UI on detected tables
class SurfaceUISystem extends createSystem({
  meshes: { required: [XRMesh] },
}) {
  update() {
    this.queries.meshes.entities.forEach((entity) => {
      const semanticLabel = entity.getValue(XRMesh, 'semanticLabel');
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');

      if (isBounded && semanticLabel === 'table') {
        this.createTableUI(entity);
      }
    });
  }

  createTableUI(tableEntity) {
    const dimensions = tableEntity.getValue(XRMesh, 'dimensions');
    const position = tableEntity.object3D.position;

    // Create UI panel
  }
}
```

### Scene-Aware Physics

```javascript
// Use detected planes as physics collision surfaces
class PlanePhysicsSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (planeEntity) => {
      // Add physics collision to detected planes
      const planeMesh = planeEntity.object3D;

      planeEntity.addComponent(PhysicsShape, {
        shape: PhysicsShapeType.Box,
        dimensions: [
          planeMesh.geometry.parameters.width,
          planeMesh.geometry.parameters.height,
          planeMesh.geometry.parameters.depth,
        ],
      });

      planeEntity.addComponent(PhysicsBody, {
        state: PhysicsState.Static,
      });
    });
  }
}
```

## Troubleshooting

### Common Issues

**Scene understanding not working:**

- Verify AR session with related features are properly requested
- If you are running on a Meta Horizon OS device, ensure that the room scaning (environment setup) is finished.

**Planes/meshes not detected:**

- Ensure the environment has clear, well-lit surfaces
- Try manual room setup if available on the device

**Anchors not staying stable:**

- Verify 'anchor' feature is enabled in WebXR session
- Ensure adequate visual features for tracking
- Some devices have limitations on anchor count

**Performance issues:**

- Limit the number of entities with scene understanding components
- Consider disabling wireframes for better performance

### Debug Tips

**Log detection events:**

```javascript
class PlaneSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
}) {
  init() {
    this.queries.planeEntities.subscribe('qualify', (entity) => {
      console.log('Plane detected:', entity.getValue(XRPlane, '_plane'));
    });
    this.queries.planeEntities.subscribe('disqualify', (entity) => {
      console.log('Plane lost');
    });
  }
}
```

**Visualize bounding boxes:**

```javascript
class MeshSystem extends createSystem({
  meshEntities: { required: [XRMesh] },
}) {
  init() {
    this.queries.meshEntities.subscribe('qualify', (entity) => {
      const isBounded = entity.getValue(XRMesh, 'isBounded3D');
      if (isBounded) {
        const min = entity.getValue(XRMesh, 'min');
        const max = entity.getValue(XRMesh, 'max');

        // Create debug bounding box visualization
        const box = createBoundingBoxHelper(min, max);
      }
    });
  }
}
```

