---
outline: [2, 4]
---

# Chapter 1: Project Setup

Welcome to the Immersive Web SDK! In this first chapter, you'll learn how to create your first WebXR project from scratch. By the end of this chapter, you'll have a working IWSDK project with all dependencies installed and a development server running.

## What You'll Build

Throughout this getting started guide, you'll progressively build an interactive WebXR experience that includes:

- 3D objects and environments
- Interactive grabbable elements
- Player movement and navigation
- Spatial user interfaces
- Professional lighting and effects

But first, let's get your development environment set up!

## Prerequisites

Before we begin, make sure you have:

- **Node.js** (version 20.19.0 or higher) - [Download here](https://nodejs.org/)
- **A modern web browser** (Chrome, Edge, Firefox, or Safari)
- **Basic familiarity** with command line/terminal
- **Basic knowledge of JavaScript/TypeScript** (we'll teach you the WebXR and 3D parts!)

### Optional but Highly Recommended

- **A WebXR-compatible headset** (Meta Quest, HTC Vive, etc.) for testing your experience immersively. While not strictly required thanks to IWER (our WebXR emulator), having a physical headset provides the best testing experience.

### Meta Spatial Editor (Optional)

**For this tutorial, we recommend skipping Meta Spatial Editor integration.** You can build amazing WebXR experiences purely with code, which is what we'll teach you in this guide. If you're interested in visual scene composition tools later, check out [Chapter 9: Meta Spatial Editor](./09-meta-spatial-editor.md) after completing the core tutorial.

## Creating Your First Project

The fastest way to get started with IWSDK is using our interactive project generator. Open your terminal and run:

```bash
npm create @iwsdk@latest
```

This command will download and run the latest version of our project creation tool, which will guide you through setting up your project with the right configuration for your needs.

## Understanding the Setup Questions

The create tool will ask you several questions to customize your project. The exact questions depend on your choices, so let's walk through the complete flow. **Note**: Some questions are only asked for VR or AR experiences, which we'll call out clearly.

### Project Name

```
Project name (iwsdk-app)
```

This will be the name of your project folder and will also be used in your `package.json`. Choose something descriptive for your project. If you're just following along with this tutorial, you can use the default `iwsdk-app` or something like `my-first-xr-app`.

### Language Choice

```
Which language do you want to use?
❯ TypeScript
  JavaScript
```

- **TypeScript**: Provides type safety, better IDE support, and catches errors at development time. Recommended for most projects.
- **JavaScript**: Simpler setup, no compilation step, good for quick prototypes.

We recommend **TypeScript** for this tutorial as it provides better development experience and catches common mistakes early.

### Experience Type

```
What type of experience are you building?
❯ Virtual Reality
  Augmented Reality
```

- **Virtual Reality**: Creates a fully immersive virtual environment. Users will be completely immersed in your 3D world.
- **Augmented Reality**: Overlays digital content onto the real world. Users can see virtual objects in their physical space.

For this tutorial, we recommend choosing **VR** as it provides a more straightforward introduction to 3D concepts and spatial interactions.

### WebXR Features

Next, you'll be asked about various WebXR features. Each feature has three options:

- **No**: Don't include this feature
- **Optional**: Include the feature but make it work if not available
- **Required**: Require this feature (experience won't work without it)

#### For VR Experiences:

- **Enable Hand Tracking?** - Allows users to use their hands instead of controllers
- **Enable WebXR Layers?** - Advanced rendering optimization for better performance

#### For AR Experiences (additional options):

- **Enable Hand Tracking?** - Same as VR
- **Enable Anchors?** - Persistent positioning of objects in real world
- **Enable Hit Test?** - Detecting surfaces in the real world
- **Enable Plane Detection?** - Finding flat surfaces like floors, walls, tables
- **Enable Mesh Detection?** - Detailed 3D understanding of real-world geometry
- **Enable WebXR Layers?** - Same as VR

For this tutorial, the default choices work well. You can always change these later.

### Core Features

#### Locomotion (VR Only)

```
Enable locomotion? (Y/n)
```

Locomotion allows users to move around in your virtual world using controllers.

- **Yes**: Include movement systems (teleport, smooth movement, turning)
- **No**: Users stay in one place (good for seated experiences)

If you choose Yes, you'll get a follow-up question:

```
Deploy locomotion engine on a Worker? (recommended for performance)
❯ Yes (recommended)
  No
```

Workers run locomotion calculations on a separate thread for better performance. Choose **Yes** unless you have specific reasons not to.

#### Scene Understanding (AR Only)

```
Enable Scene Understanding (planes/meshes/anchors)? (Y/n)
```

Scene Understanding helps your AR app understand the real world around it.

- **Yes**: Include systems for detecting surfaces, objects, and spatial anchors
- **No**: Basic AR without advanced world understanding

#### Grabbing (Both VR and AR)

```
Enable grabbing (one/two-hand, distance)? (Y/n)
```

Grabbing lets users pick up and manipulate objects in your experience.

- **Yes**: Include one-handed, two-handed, and distance grabbing systems
- **No**: Objects can't be grabbed or moved by users

Recommended: **Yes** for interactive experiences.

#### Physics Simulation

```
Enable physics simulation (Havok)? (y/N)
```

Physics simulation adds realistic object behavior (gravity, collisions, etc.).

- **Yes**: Objects fall, bounce, and collide realistically
- **No**: Simpler behavior, better performance

Default is **No** because physics adds complexity. You can enable it later if needed.

### Meta Spatial Editor Integration

```
Enable Meta Spatial Editor integration?
❯ No (Can change later)
  Yes (Additional software required)
```

**Choose "No" for this tutorial.** This keeps your setup simple and lets you learn IWSDK's core concepts through code. You'll create and position 3D objects entirely through code, which gives you complete control and is perfect for learning the fundamentals.

If you're interested in visual scene composition tools later, you can explore [Chapter 9: Meta Spatial Editor](./09-meta-spatial-editor.md) after completing the main tutorial.

### Development Setup

#### Git Repository

```
Set up a Git repository? (Y/n)
```

Recommended: **Yes**. This initializes a Git repository for version control.

#### Install Dependencies

```
Install dependencies now? (We will print the command to start the dev server.) (Y/n)
```

Recommended: **Yes**. This runs `npm install` automatically and shows you the command to start the dev server.

## Project Structure Overview

Once the project is created, you'll see a structure like this:

```
my-iwsdk-app/
├── src/
│   ├── index.ts         # Application entry point and world setup
│   ├── robot.ts         # Example custom component and system
│   └── panel.ts         # UI panel interaction system
├── ui/
│   └── welcome.uikitml  # Spatial UI markup (compiled to public/ui/)
├── public/
│   ├── audio/           # Audio files (.mp3, .wav, etc.)
│   │   └── chime.mp3
│   ├── gltf/            # 3D models and textures
│   │   ├── environmentDesk/
│   │   ├── plantSansevieria/
│   │   └── robot/
│   ├── textures/        # Standalone texture files
│   └── ui/              # Compiled UI files (auto-generated)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Build configuration with IWSDK plugins
└── index.html           # HTML entry point
```

### Key Files Explained

- **`src/index.ts`**: This is where your application starts. It creates the ECS world, loads assets, spawns entities, and registers systems - everything happens here.
- **`src/robot.ts`** & **`src/panel.ts`**: Example custom components and systems showing how to create interactive behaviors.
- **`ui/welcome.uikitml`**: Spatial UI markup that gets compiled to JSON during build for the 3D interface panel. We'll learn more about UIKitML in [Chapter 10: Spatial UI with UIKitML](./10-spatial-ui-uikitml.md).
- **`public/gltf/`**: Organized folder structure for 3D models, with each model in its own subfolder alongside its textures.
- **`public/audio/`**: Audio files used for sound effects and spatial audio.
- **`vite.config.ts`**: Build configuration that includes IWSDK-specific plugins for WebXR emulation, UI compilation, and asset optimization.

## What's Next

Perfect! You now have a complete IWSDK project with all dependencies installed and a clear understanding of the project structure.

In Chapter 2, we'll launch your development server and learn how to test your WebXR experience both in a physical headset and using the built-in emulator on your computer.
