---
outline: [2, 4]
---

# Chapter 9: Meta Spatial Editor

Congratulations on completing the core IWSDK tutorial! While you can build entire WebXR experiences with code alone, Meta Spatial Editor provides a powerful visual tool that can dramatically accelerate your development workflow. In this bonus chapter, you'll learn how to combine visual scene composition with programmatic behavior.

## What You'll Build

By the end of this chapter, you'll be able to:

- Set up Meta Spatial Editor for IWSDK integration
- Create and compose 3D scenes visually with drag-and-drop
- Add IWSDK components to objects directly in the editor
- Export scenes that automatically integrate with your IWSDK projects
- Use hot reload for instant feedback between editor and code
- Create custom components and use them in the visual editor

## Why Meta Spatial Editor?

Meta Spatial Editor excels at tasks that are tedious or error-prone in code, while IWSDK's code-first approach handles logic and dynamic behavior perfectly. Together, they create a powerful hybrid workflow:

**Meta Spatial Editor strengths:**
- **Visual scene layout**: Position objects in 3D space with immediate feedback
- **Component assignment**: Add grabbable, physics, and UI components without coding
- **Asset composition**: Drag-and-drop 3D model placement and organization
- **Designer collaboration**: Non-programmers can contribute to scene creation

**IWSDK code strengths:**
- **Custom interactions**: Complex behaviors and game logic
- **Dynamic content**: Procedural generation and runtime changes
- **Performance optimization**: Fine-tuned systems and queries
- **Integration**: APIs, databases, and external services

The result is a workflow where designers handle spatial composition visually while developers focus on behavior and systems.

## Prerequisites

Before starting, make sure you have:

- **Completed Chapters 1-8** - You should have a working IWSDK project
- **Node.js 20.19.0+** - For running the development server
- **IWSDK project with Meta Spatial Editor integration** - Created with `npm create @iwsdk@latest` and chose "Yes" for Meta Spatial Editor integration

::: warning Project Setup Required
If your project wasn't created with Meta Spatial Editor support, you'll need to manually add the `@iwsdk/vite-plugin-metaspatial` plugin to your `vite.config.ts`. The easiest approach is to create a new project with the integration enabled.
:::

### Download Meta Spatial Editor

Download and install Meta Spatial Editor version 9 or higher:

- **Mac**: [Meta Spatial Editor for Mac](https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-mac)
- **Windows**: [Meta Spatial Editor for Windows](https://developers.meta.com/horizon/downloads/package/meta-spatial-editor-for-windows)


## Getting Started with Visual Scene Composition

Let's start by opening an existing Meta Spatial Editor project and understanding how it integrates with IWSDK.

### Starting Your Development Server

First, ensure your IWSDK development server is running:

```bash
cd your-iwsdk-project  # Navigate to your project
npm run dev            # Start the development server
```

Keep this running throughout the tutorial - it's essential for hot reload functionality.

### Opening Your First Spatial Project

When you created your IWSDK project with Meta Spatial Editor integration, a `metaspatial/` folder was automatically created with a starter project.

1. **Launch Meta Spatial Editor**
2. **Open** the `Main.metaspatial` file in your project's `metaspatial/` directory
3. You should see a basic scene with some example objects

![Meta Spatial Editor Interface](/spatial-editor/mse.gif)

### Understanding the Interface

The Meta Spatial Editor provides the essential tools for scene composition including a 3D viewport for editing, composition panel for organizing objects, properties panel for configuration, and asset library for available resources.

### Basic Navigation

Learn these essential navigation controls:

- **Left mouse + drag**: Rotate camera around the scene
- **Middle mouse + drag**: Pan the camera view  
- **Mouse wheel**: Zoom in/out
- **W/A/S/D or arrow keys**: Walk the viewport camera
- **Left click**: Select objects

## Building Your First Scene

Let's create a simple interactive scene to understand the core workflow.

### Adding Objects to Your Scene

You can add objects in several ways:

**Method 1: Drag and drop assets**
1. From the Asset Library, drag a GLTF model directly into the 3D viewport
2. The object appears both in the scene and in the Composition panel hierarchy

![Drag and Drop Assets](/spatial-editor/drag.gif)

**Method 2: Create empty nodes**
1. Click the gizmo + plus icon in the Composition panel
2. This creates an empty node that can serve as a parent group for organizing objects

![Create Empty Nodes](/spatial-editor/node.gif)

### Organizing Scene Hierarchy

Good scene organization makes your project maintainable:

1. **Create parent groups** for logical organization (e.g., "Furniture", "Lighting", "Interactive Objects")
2. **Drag child objects** onto parent nodes in the Composition panel to establish relationships
3. **Name objects descriptively** - this helps when writing code that references them

![Parent-Child Relationships](/spatial-editor/parent.gif)

### Positioning and Transforming Objects

Use the visual gizmos to position objects precisely:

1. **Select an object** in the viewport or Composition panel
2. **Use the visual gizmos** to adjust transforms, materials, and other properties

![Transform Objects](/spatial-editor/place.gif)

::: tip Precision Controls
Hold **Shift** while dragging for finer control, or use the Properties panel to enter exact numeric values for transforms.
:::

### Adding IWSDK Components Visually

This is where Meta Spatial Editor really shines - you can add IWSDK components without writing any code:

1. **Select an object** you want to make interactive
2. **In the Properties panel**, find the "Immersive Web SDK Components" section
3. **Click the + button** to add a component
4. **Choose a component** like "Interactable" or "OneHandGrabbable"
5. **Configure properties** in the component's settings

For grabbable objects, you need both components:
- **Interactable**: Makes the object respond to pointer events
- **OneHandGrabbable** or **DistanceGrabbable**: Defines grab behavior

![Add Components](/spatial-editor/grabeditor.gif)

## Hot Reload Integration

The real magic happens when you save your spatial project - your IWSDK app automatically updates.

### How Hot Reload Works

1. **Meta Spatial Editor**: Save your project (Cmd/Ctrl+S)
2. **Vite Plugin**: Detects the change and regenerates GLXF export
3. **IWSDK Runtime**: Automatically reloads the updated scene
4. **Your App**: Updates instantly in browser or headset

![Hot Reload in Action](/spatial-editor/livereload.gif)

### Testing the Integration

Let's verify everything is working:

1. **Add a grabbable object** in Meta Spatial Editor (follow the steps above)
2. **Save the project** (Cmd/Ctrl+S) 
3. **Check your IWSDK app** (browser or headset) - the object should now be grabbable
4. **Try grabbing it** with controllers or hand tracking

::: warning Keep Dev Server Running
Hot reload only works when your IWSDK development server is running. If you stop the server, you'll need to restart it to re-enable hot reload.
:::

## Creating Custom Components

While built-in components cover common use cases, you can create custom components for unique behaviors.

### Step 1: Define Your Component in Code

Create a new file in your `src/` directory (e.g., `src/spinner.js`):

```javascript
import { createComponent, createSystem } from '@iwsdk/core';

// Define a component with configurable properties
export const Spinner = createComponent('Spinner', {
  speed: { type: 'float', default: 1.0 },
  axis: { type: 'enum', values: ['X', 'Y', 'Z'], default: 'Y' }
});

// Create a system that processes Spinner components
export class SpinSystem extends createSystem({
  spinners: { required: [Spinner] },
}) {
  update(delta) {
    this.queries.spinners.entities.forEach((entity) => {
      const speed = entity.getValue(Spinner, 'speed');
      const axis = entity.getValue(Spinner, 'axis');

      // Rotate the object based on the axis setting
      if (axis === 'Y') {
        entity.object3D.rotateY(delta * speed);
      } else if (axis === 'X') {
        entity.object3D.rotateX(delta * speed);
      } else if (axis === 'Z') {
        entity.object3D.rotateZ(delta * speed);
      }
    });
  }
}
```

### Step 2: Register Your System

In your main `src/index.ts`, import and register the system:

```javascript
import { SpinSystem } from './spinner.js';

// After World.create()
World.create(/* ... */).then((world) => {
  // Register your custom system
  world.registerSystem(SpinSystem);
  
  // ... rest of your setup
});
```

### Step 3: Use Component in Meta Spatial Editor

1. **Select an object** you want to spin
2. **In the Properties panel**, click + next to "Immersive Web SDK Components"
3. **Click the "Reload" button** in the component dropdown to refresh available components
4. **Choose "Spinner"** from the list
5. **Configure properties**: Set speed to 2.0, axis to 'Y'
6. **Save the project**

![Add Custom Component](/spatial-editor/spineditor.gif)

### Step 4: Test Your Custom Behavior

Check your app - the object should now be spinning according to your settings!

![Spinning Object](/spatial-editor/spiniwer.gif)

## Advanced Integration: 2D UI Panels

Meta Spatial Editor can also handle spatial UI panels, integrating with IWSDK's UIKitML system.

### Creating a UI Panel

1. **Create your UIKitML file** in your project's `ui/` directory (covered in Chapter 10)
2. **In Meta Spatial Editor**, click "Add 2D Panel" or use the menu: Nodes → New → 2D Panel
3. **Select the new Panel node** in the Composition panel
4. **Position and size** the panel in 3D space using transform gizmos
5. **In Properties panel**, set the Panel ID to match your UIKitML filename
6. **Save the project**

The 2D UI will automatically appear in your IWSDK app at the specified position and size.

::: tip Aspect Ratio Matching
If the panel's aspect ratio doesn't match your UIKitML definition, IWSDK will fit the content as best as possible and leave unused areas transparent.
:::

## Best Practices & Workflow Tips

### Use the Right Tool for Each Task

- **Use Meta Spatial Editor for**: Spatial layout, asset placement, visual component assignment, lighting setup
- **Use IWSDK code for**: Game logic, dynamic behavior, performance optimization, API integration

### Version Control Strategy

Track both your IWSDK project and your metaspatial project in source control.

### Team Collaboration

- **Designers/Artists**: Work primarily in Meta Spatial Editor for layouts and visual composition
- **Developers**: Focus on IWSDK code for systems and behavior
- **Both**: Communicate about component interfaces and naming conventions


## Best Practices & Tips

- **Use the Editor for Layout, Not Logic**: Keep business logic in code; use the editor for spatial layout and component assignment.
- **Version Control**: Track both your IWSDK project and your metaspatial project in source control.
- **Collaborate**: Designers can iterate on scenes without blocking developers, and vice versa.