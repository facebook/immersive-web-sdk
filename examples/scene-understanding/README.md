# WebXR Framework Scene Understanding Example

This example demonstrates WebXR scene understanding features in the Immersive Web SDK (IWSDK), showcasing real-world plane detection, mesh detection, and spatial anchors for augmented reality (AR) applications. Learn how to build AR experiences that understand and interact with the physical environment.

## 🎯 What You'll Learn

This example demonstrates:

- **Scene Understanding System**: Detecting and tracking real-world surfaces and objects
- **Plane Detection**: Identifying horizontal and vertical surfaces (floors, walls, tables)
- **Mesh Detection**: Capturing detailed 3D geometry of the environment
- **Spatial Anchors**: Placing virtual objects that stay fixed in the real world
- **Interactive AR**: Making detected planes and meshes interactive with pointer events
- **AR Session Management**: Configuring WebXR AR sessions with required features

### What's in the Example

The example includes:

1. **Plane Detection System**: Automatically detects real-world surfaces and visualizes them as wireframe meshes
2. **Mesh Detection System**: Captures 3D geometry of the environment with semantic labels
3. **Anchored Sphere**: A grabbable sphere that stays anchored to a fixed position in the real world
4. **Interactive Visualization**: Detected planes and meshes become visible when you point at them
5. **Custom System**: A `SceneShowSystem` that manages visibility and interaction of detected geometry

## 📁 Project Structure

```
scene-understanding/
├── src/                    # Source code
│   └── index.js           # Main application entry point with SceneShowSystem
├── dist/                  # Build output (generated)
├── index.html            # Main HTML file
├── vite.config.js        # Vite configuration
└── package.json          # Project dependencies
```

**Note**: This example focuses on code-based AR scene understanding and doesn't require static scene assets.

## 🚀 Quick Start

### Prerequisites

- Node.js 20.19.0+ and pnpm
- HTTPS support for WebXR development

### Installation

```bash
cd scene-understanding
pnpm install
```

### Development

```bash
# Start development server with HTTPS
pnpm dev

# Build for production
pnpm build

# Preview production build locally
pnpm preview
```

The development server will start on the HTTPS local URL reported by Vite or `npx iwsdk dev status` (typically `https://localhost:5173/` when that port is free).

**Important**: Scene understanding features require an AR-capable device (e.g., Meta Quest 3, Quest Pro) with plane detection, mesh detection, and anchor support.

## 🔍 Scene Understanding System Overview

### Enabling Scene Understanding

Configure the WebXR AR session in `iwsdk.config.json`:

```json
{
  "world": {
    "xr": {
      "mode": "ar",
      "features": {
        "hitTest": true,
        "planeDetection": { "required": true },
        "meshDetection": { "required": true },
        "anchors": { "required": true }
      }
    },
    "features": { "grabbing": true, "sceneUnderstanding": true }
  }
}
```

### Scene Understanding Components

The scene understanding system uses three main ECS components:

#### 1. XRPlane

Represents a detected real-world surface (floor, wall, table, etc.). See `immersive-web-sdk/packages/core/src/scene-understanding/plane.ts:32-42`

Planes are automatically created and updated by the `SceneUnderstandingSystem` and has an Object3D representing the Plane's geometry associated.

#### 2. XRMesh

Represents detected 3D geometry in the environment. See `immersive-web-sdk/packages/core/src/scene-understanding/mesh.ts:43-55`

**Properties**:

- `isBounded3D`: Whether this is a bounded object (true) or global mesh (false)
- `semanticLabel`: Semantic label from the device (e.g., "wall", "couch", "global mesh")
- `min`: Minimum bounding box corner `[x, y, z]`
- `max`: Maximum bounding box corner `[x, y, z]`
- `dimensions`: Size of the bounding box `[width, height, depth]`

Meshes are automatically created and updated by the `SceneUnderstandingSystem` has an Object3D representing the Mesh's geometry associated.

#### 3. XRAnchor

Marks an entity to be anchored at a fixed position in the real world (will not move after recentering the view). See `immersive-web-sdk/packages/core/src/scene-understanding/anchor.ts:35-45`

**Properties**:

- `attached`: Boolean indicating if the entity is attached to the anchor group, default `false`

**Usage**:

```javascript
// Create an entity that stays fixed in the real world
const entity = world.createTransformEntity(mesh);
entity.addComponent(XRAnchor);
```

Objects with the `XRAnchor` component are automatically attached to a stable anchor point by the `SceneUnderstandingSystem`.

### How Scene Understanding Works

The `SceneUnderstandingSystem` (see `src/scene-understanding/scene-understanding-system.ts:72-408`) handles:

1. **Feature Detection**: Checks which scene understanding features are enabled
2. **Plane Tracking**: Updates detected planes each frame from `XRFrame.detectedPlanes`
3. **Mesh Tracking**: Updates detected meshes each frame from `XRFrame.detectedMeshes`
4. **Geometry Generation**: Creates Three.js geometry from plane polygons and mesh vertices
5. **Anchor Management**: Creates and maintains spatial anchors for marked entities
6. **Lifecycle Management**: Destroys entities when planes/meshes are no longer tracked

## 💡 Best Practices & Tips

### Device Requirements

Scene understanding features require specific hardware capabilities. Always check `session.enabledFeatures` to verify which features are available.

### Working with Meshes

**Mesh Types**:

- **Bounded meshes** (`isBounded3D: true`): Individual objects like furniture, walls
- **Global mesh** (`isBounded3D: false`): Environment-wide mesh without semantic meaning

**Best Practices**:

- Use `semanticLabel` to identify what the mesh represents (e.g., "couch", "wall", "table")
- Bounded meshes include useful bounding box data (`min`, `max`, `dimensions`)
- Global meshes are useful for physics or collision but not for semantic understanding
- Filter by `isBounded3D` to work with specific objects vs. the entire environment

**Example: Finding Furniture**:

```javascript
this.queries.meshEntities.entities.forEach((meshEntity) => {
  const label = meshEntity.getValue(XRMesh, 'semanticLabel');
  const isBounded = meshEntity.getValue(XRMesh, 'isBounded3D');

  if (isBounded && (label === 'couch' || label === 'table')) {
    // This is a piece of furniture
    const dimensions = meshEntity.getVectorView(XRMesh, 'dimensions');
    console.log(`Found ${label} with size:`, dimensions);
  }
});
```

### Working with Anchors

**Anchor Behavior**:

- Anchors keep objects fixed in the real world even as the device tracking shifts
- Perfect for persistent AR content that should stay in one place
- The system maintains anchor stability by updating transforms automatically

**Tips**:

- Use anchors for important objects that must stay in a specific location
- Can be combine with `DistanceGrabbable` to let users position objects precisely

**Example: User-Placed Anchored Object**:

```javascript
// Let user grab and position an anchored object
const entity = world.createTransformEntity(mesh);
entity.addComponent(DistanceGrabbable);
entity.addComponent(RayInteractable);
entity.addComponent(XRAnchor);
```

### Performance Tips

1. **Limit Mesh Rendering**: Only make meshes visible when needed (like on pointer hover or for development only)
2. **Filter Bounded Meshes**: Use `where: [eq(XRMesh, 'isBounded3D', true)]` to ignore the global mesh
3. **Simplify Geometry**: Consider creating simplified collision shapes instead of using full mesh geometry

## 🌐 WebXR Development

### HTTPS Requirements

WebXR requires HTTPS for all features to work properly. This example includes:

- Automatic, cached self-signed HTTPS certificates from the IWSDK dev plugin
- No certificate-authority installation or trust-store changes
- Proper CORS configuration for asset loading

### Testing on Devices

**For Meta Quest Devices**:

1. Start the dev server:

```bash
pnpm dev
```

2. On your Quest device, open the browser and navigate to:

```
https://YOUR_LOCAL_IP:<PORT>
```

3. Accept the self-signed certificate warning

4. Enter VR/AR mode to test scene understanding features

**Important**: Scene understanding works best in well-lit environments with distinct surfaces. Walk around slowly to allow the device to scan your environment.

## 🛠 Customization

### Enabling Wireframe Toggle

The `SceneUnderstandingSystem` has a built-in `showWireFrame` config option:

```json
{
  "world": {
    "xr": { "mode": "ar" },
    "features": {
      "sceneUnderstanding": { "showWireFrame": true }
    }
  }
}
```

## 📋 Scripts

- **`pnpm dev`** - Start development server with HMR and HTTPS
- **`pnpm build`** - Build for production
- **`pnpm preview`** - Preview production build locally

## 🔗 Integration

This example demonstrates integration with:

- **IWSDK Scene Understanding System** - Automatic tracking and entity management
- **IWSDK Grabbing System** - Interactive manipulation of anchored objects
- **Meta Quest AR capabilities** - Real-world environment understanding

### Related Examples

- **Locomotion Example** - Learn about AR/VR navigation
- **Physics Example** - Combine scene understanding with physics for realistic interactions
- **Hit Test Example** - Place objects on detected surfaces using hit testing

### Use Cases for Scene Understanding

**Plane Detection**:

- Furniture placement apps
- AR games that need floor/table surfaces
- Virtual interior design
- Educational AR overlays on walls

**Mesh Detection**:

- Obstacle avoidance for AR navigation
- Environment-aware lighting and shadows
- Physics interactions with real objects
- Semantic understanding for context-aware apps

**Spatial Anchors**:

- Persistent AR content that stays in place
- Multi-user AR experiences with shared reference points
- AR annotations on real-world objects
- Virtual markers for navigation

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
