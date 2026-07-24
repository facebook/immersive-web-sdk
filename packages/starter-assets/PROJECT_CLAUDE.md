# IWSDK Project - Claude Code Configuration

This file configures Claude Code for IWSDK (Immersive Web SDK) project development.

## Project Structure

```
my-iwsdk-project/
├── src/
│   ├── index.ts              # World.create() entry point
│   ├── systems/              # Custom systems
│   └── components/           # Custom components
├── public/
│   ├── scenes/               # Native IWSDK scene JSON
│   ├── iwsdk-assets/         # Shared catalog assets served by Vite
│   ├── audio/                # Sound files
│   └── ui/                   # Compiled UI
├── ui/
│   └── *.uikitml             # UI markup source
└── vite.config.ts
```

**Convention:** One system per file, with its related components. No barrel `index.ts` files.

---

## Native Scene Composition

Static scene layout lives in `public/scenes/*.iwsdk.scene.json`. The running app
loads it with `World.create(..., { level: './scenes/<name>.iwsdk.scene.json' })`.

### Rules

- Use scene JSON for static composition: environment roots, placed catalog
  assets, UI panels, lights, grabbable objects, physics bodies, and audio
  emitters.
- Use TypeScript/JavaScript runtime entity creation when entities depend on
  runtime state, variable counts, procedural generation, animation logic, or app
  systems.
- Use the IWSDK native editor route (`/__iwsdk/editor`) and scene MCP tools for
  visual inspection, multi-angle screenshots, transforms, validation, and saving.
- Prefer shared catalog paths such as
  `/iwsdk-assets/robot/robot.gltf` instead of copying model files into each
  project.

---

## Critical Best Practices

### Browser 3D With First-Class XR

IWSDK is a 3D web framework with first-class XR support. XR can be disabled for a browser-only app with `World.create(container, { xr: false })`, but the runtime still creates `world.player` as the local player/XR origin and keeps `world.camera` under it.

- For first-person browser apps that may later enter XR, move `world.player` for locomotion or WASD-style movement. Treat `world.camera` as the viewer/head under that rig.
- For orbit, editor, product, cinematic, or third-person views, it is fine to keep `world.player` at the origin and drive `world.camera` however the app needs.
- `world.camera.position` is local to `world.player`. Use `world.camera.getWorldPosition(tempVector)` when logic needs the actual viewer position.
- Configure the initial browser view with `render.camera` in `World.create`; do not add camera category presets unless the app explicitly needs one.

Browser pointer input is enabled through `input.canvasPointerEvents` by default. Add `RayInteractable` and react to `Hovered`/`Pressed` for objects that should work with both mouse/touch canvas input and XR rays. XR-specific input lives at `world.input.xr`; use `world.input.keyboard` and `world.input.browserGamepads` for low-level browser controls. Reusable systems should prefer `world.input.actions` for intent such as `locomotion.move` or `locomotion.jump`; opt into browser locomotion bindings with `features.locomotion.browserControls`.

### Feature Configuration (CRITICAL!)

**This is the #1 cause of bugs in IWSDK projects.**

| Feature                    | Prerequisites                                        | If Missing                     |
| -------------------------- | ---------------------------------------------------- | ------------------------------ |
| `locomotion: true`         | LocomotionEnvironment component OR physics collision | **Player falls through world** |
| `physics: true`            | PhysicsBody + PhysicsShape components on entities    | Wasted overhead                |
| `grabbing: true`           | Grabbable components (OneHandGrabbable, etc.)        | Wasted overhead                |
| `sceneUnderstanding: true` | AR session mode                                      | Feature won't work             |

```typescript
// ❌ BAD - Player falls through the world!
World.create(container, {
  features: { locomotion: true },
});

// ✅ GOOD - With proper environment
World.create(container, {
  features: { locomotion: true },
});
// AND scene has LocomotionEnvironment component on floor/surfaces

// ✅ GOOD - AR experience (no virtual locomotion)
World.create(container, {
  xr: { sessionMode: SessionMode.ImmersiveAR },
  features: { locomotion: false, sceneUnderstanding: true },
});
```

### VR Performance Context

VR targets 72-90 FPS, giving only **11-14ms per frame**. Every allocation in `update()` risks a GC pause that drops frames.

### Anti-Patterns to Avoid

#### DON'T store entity arrays in systems

```typescript
// ❌ BAD - Manual entity tracking
private myEntities: Entity[] = [];

// ✅ GOOD - Use queries
this.queries.items.entities
```

#### DON'T allocate in update()

```typescript
// ❌ BAD - Creates garbage every frame
update() {
  const temp = new Vector3();
}

// ✅ GOOD - Allocate in init() as class properties
private temp!: Vector3;
init() {
  this.temp = new Vector3();
}
```

#### DON'T poll for state changes

```typescript
// ❌ BAD - Checking every frame
update() {
  if (entity.hasComponent(Pressed)) { ... }
}

// ✅ GOOD - Subscribe to query
this.queries.pressed.subscribe('qualify', (entity) => { ... });
```

#### DON'T forget to cleanup subscriptions

```typescript
// ❌ BAD - Memory leak
init() {
  this.world.visibilityState.subscribe((state) => { ... });
}

// ✅ GOOD - Register cleanup
init() {
  this.cleanupFuncs.push(
    this.world.visibilityState.subscribe((state) => { ... })
  );
}
```

#### DON'T use .value in update() loops

```typescript
// ❌ BAD - creates subscription overhead every frame
update() {
  const rate = this.config.tickRate.value;
}

// ✅ GOOD - peek() reads without subscription
update() {
  const rate = this.config.tickRate.peek();
}
```

#### DON'T use raw asset loaders — use AssetManager

```typescript
// ❌ BAD - bypasses DRACO/KTX2 setup, no caching, no de-duplication
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
new GLTFLoader().loadAsync(url);

// ✅ GOOD - Declare in AssetManifest passed to World.create({ assets })
const world = await World.create(container, {
  assets: { myModel: { url: '/models/scene.glb', type: AssetType.GLTF } },
});
const gltf = AssetManager.getGLTF('myModel');
// `getGLTF` returns a fresh clone of `scene`/`scenes` per call, so it's
// safe to use the same key for multiple entities. Pass `{ shared: true }`
// if you intentionally want the cached instance.

// ✅ GOOD - For runtime loading
await AssetManager.loadGLTF(url, 'myModel');
```

#### DON'T use scene.add() — use createTransformEntity

```typescript
// ❌ BAD - bypasses ECS, no Transform component, no level lifecycle
scene.add(mesh);

// ❌ BAD - parenting under a non-entity silently reparents to scene root
someObject3D.add(mesh);

// ✅ GOOD - proper entity creation with parent
world.createTransformEntity(mesh, parentEntity);
// or with options
world.createTransformEntity(mesh, { parent: parentEntity });

// ✅ GOOD - persistent entity (survives level changes)
world.createTransformEntity(mesh, {
  parent: world.sceneEntity,
  persistent: true,
});
```

#### DON'T use manual Raycaster — use RayInteractable component

```typescript
// ❌ BAD - no BVH acceleration, doesn't work in XR, no pointer events
import { Raycaster } from '@iwsdk/core';
const raycaster = new Raycaster();

// ✅ GOOD - add RayInteractable, then query Hovered/Pressed in your system
entity.addComponent(RayInteractable);
// InputSystem provides BVH-accelerated raycasting, pointer events,
// and auto-manages Hovered/Pressed state
```

#### DON'T deep-import `Handle` to force-release or query a grab

```typescript
// ❌ BAD - private API; future SDK refactors will break this silently
import { Handle } from '@iwsdk/core/dist/grab/handles.js';
(Handle as any).data.instance[entity.index].cancel();

// ✅ GOOD - public methods on GrabSystem
const grab = world.getSystem(GrabSystem);
grab.forceRelease(entity); // drop a held entity (game reset, weapon swap)
const hand = grab.getHolderHand(entity); // 'left' | 'right' | null
```

#### DON'T add environment components to arbitrary entities

```typescript
// ❌ BAD - Environment components on random entity (silently ignored)
someEntity.addComponent(DomeGradient, { sky: [0.2, 0.6, 0.8, 1.0] });

// ✅ GOOD - Must go on the level root
const root = world.activeLevel.value;
root.addComponent(DomeGradient, { sky: [0.2, 0.6, 0.8, 1.0] });
```

#### DON'T forget `_needsUpdate` after changing environment properties

```typescript
// ❌ BAD - Changes are silently ignored
root.setValue(DomeGradient, 'sky', [0.1, 0.2, 0.8, 1.0]);

// ✅ GOOD - Set _needsUpdate to apply changes
root.setValue(DomeGradient, 'sky', [0.1, 0.2, 0.8, 1.0]);
root.setValue(DomeGradient, '_needsUpdate', true);
```

#### DON'T use `entity.destroy()` for objects with GPU resources

```typescript
// ❌ BAD - GPU memory for geometry/materials/textures is leaked
entity.destroy();

// ✅ GOOD - Also cleans up GPU resources
entity.dispose();
```

#### DON'T pass numbers to ScreenSpace

```typescript
// ❌ BAD - ScreenSpace uses CSS strings, not numbers
entity.addComponent(ScreenSpace, { width: 400, top: 20 });

// ✅ GOOD - Use CSS string expressions
entity.addComponent(ScreenSpace, { width: '400px', top: '20px' });
```

---

## Agents Available

### `iwsdk-project-code-reviewer`

Reviews IWSDK project code for correct framework usage, ECS patterns, and performance.

```
Use the iwsdk-project-code-reviewer agent to review my code
```

---

## Skills Available

### `/iwsdk-planner`

**IWSDK project planning and best practices guide**

Use when:

- Planning new IWSDK features
- Designing systems/components
- Need guidance on ECS, signals, or reactive patterns

### `/iwsdk-grab`

**Grab objects with emulated controllers**

Use when:

- Picking up, moving, or testing grab interactions
- Testing OneHandGrabbable or TwoHandsGrabbable (proximity-based, uses squeeze/grip button)

### `/iwsdk-ray`

**Ray-based interactions — click, select, distance-grab**

Use when:

- Pointing at and clicking objects or UI buttons
- Distance-grabbing with DistanceGrabbable (trigger hold)
- Testing ray-based selection on RayInteractable entities

### `/iwsdk-ui`

**Develop and iterate on UI panels**

Use when:

- Working on PanelUI components
- Editing UIKITML markup
- Using ScreenSpace for full-screen 2D preview during development

### `/iwsdk-debug`

**Debug continuous behavior frame by frame**

Use when:

- Debugging physics (falling, bouncing, collisions)
- Debugging animations, game loops, or any real-time behavior
- Behavior happens too fast to observe — uses ECS pause/step/snapshot/diff

### `/iwsdk-physics`

**Physics implementation guide**

Use when:

- Adding physics simulation (PhysicsBody, PhysicsShape)
- Configuring rigid bodies, collision shapes, forces
- Troubleshooting physics behavior

## Planning Rule

When planning any new feature or system, ALWAYS invoke `/iwsdk-planner` first to load the full API reference and best practices.

---

## MCP Tools Available

### IWSDK Reference (Code Intelligence)

Semantic code search and API lookup for IWSDK, elics ECS, and dependencies.

Starter projects install `@iwsdk/reference` by default so these tools are available locally, but they only become usable after reference warmup. Run `npx iwsdk reference warmup` once to download the pinned model and corpus. Set `IWSDK_REFERENCE_ASSETS_BASE_URL` too when you are using an internal or unpublished corpus payload instead of the published `@iwsdk/reference-assets` package. The pinned model file URLs themselves are baked into the SDK, so warmup still requires access to those public URLs unless the shared cache has already been pre-warmed.

| Tool                                         | Purpose                      | When to Use                                              |
| -------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `mcp__iwsdk-reference__search_code`          | Semantic search across IWSDK | Finding code by description ("how to create VR session") |
| `mcp__iwsdk-reference__get_api_reference`    | Quick API lookup by name     | When you know the class/function name                    |
| `mcp__iwsdk-reference__find_by_relationship` | Find code by relationships   | Classes that extend/implement something                  |
| `mcp__iwsdk-reference__list_ecs_components`  | List all ECS components      | Discovering available components                         |
| `mcp__iwsdk-reference__list_ecs_systems`     | List all ECS systems         | Discovering available systems                            |
| `mcp__iwsdk-reference__find_usage_examples`  | Find real-world examples     | Understanding how to use an API                          |

### IWER (Immersive Web Emulation Runtime)

WebXR emulator control for testing without a headset. Starter projects expose these tools under `mcp__iwsdk-runtime__`.

**Session**

| Tool                    | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `xr_get_session_status` | Check IWER connection (**call first!**) |
| `xr_accept_session`     | Enter XR mode                           |
| `xr_end_session`        | Exit XR mode                            |
| `browser_reload_page`   | Reload browser to reset state           |

**Device Control**

| Tool                   | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `xr_set_transform`     | Set position/orientation of headset, controller, or hand                |
| `xr_get_transform`     | Read current position/orientation of a device                           |
| `xr_look_at`           | Orient a device toward a world position (optional move-to)              |
| `xr_animate_to`        | Smoothly animate a device to a new transform over time                  |
| `xr_set_input_mode`    | Switch between `controller` and `hand` tracking                         |
| `xr_set_connected`     | Connect/disconnect an input device                                      |
| `xr_select`            | Full select action (press+release) — fires selectstart/select/selectend |
| `xr_set_select_value`  | Set trigger/pinch value (0-1) for grab-move-release patterns            |
| `xr_set_gamepad_state` | Set button values and thumbstick axes by index                          |
| `xr_get_device_state`  | Read full device state (headset + controllers + hands)                  |
| `xr_set_device_state`  | Batch-set device state; call with no args to reset defaults             |

**Observation**

| Tool                       | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `browser_screenshot`       | Screenshot the browser (returns image inline)           |
| `browser_get_console_logs` | Browser console logs with level/pattern/count filtering |

**Scene Inspection** (requires IWSDK / FRAMEWORK_MCP_RUNTIME)

| Tool                         | Purpose                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `scene_get_hierarchy`        | Three.js scene tree with names, UUIDs, and entity indices                                  |
| `scene_get_object_transform` | Local + global transforms; includes position relative to XR origin (use with `xr_look_at`) |

**ECS Debugging** (requires IWSDK / FRAMEWORK_MCP_RUNTIME)

| Tool                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `ecs_find_entities`   | Search entities by component composition and/or name regex |
| `ecs_query_entity`    | Read all component field values for an entity by index     |
| `ecs_list_components` | List all registered components with field schemas          |
| `ecs_list_systems`    | List all systems with priority, pause state, entity counts |
| `ecs_set_component`   | Write a component field value on a live entity             |
| `ecs_toggle_system`   | Pause/resume a specific system by name                     |
| `ecs_pause`           | Freeze all ECS updates (render loop continues)             |
| `ecs_resume`          | Resume ECS updates after pause                             |
| `ecs_step`            | Advance N frames with fixed timestep while paused          |
| `ecs_snapshot`        | Capture full ECS state (stores up to 2 snapshots)          |
| `ecs_diff`            | Compare two snapshots — shows field-level diffs            |

**Key workflows:**

- **Discover entities:** `ecs_find_entities` (get entity indices) → `ecs_query_entity` (read component data)
- **Discover schema:** `ecs_list_components` to see field names/types before querying or setting values
- **Frame-by-frame debugging:** `ecs_pause` → `ecs_step` (count/delta). Must pause before stepping.
- **Diff state changes:** `ecs_snapshot({"label":"before"})` → trigger action → `ecs_snapshot({"label":"after"})` → `ecs_diff({"from":"before","to":"after"})`
- **Isolate a system:** `ecs_list_systems` to discover names → `ecs_toggle_system({"name":"SystemName","paused":true})` to pause one system while others run
- **Look at an object:** `scene_get_hierarchy` → find UUID → `scene_get_object_transform` → use `positionRelativeToXROrigin` with `xr_look_at`

**Connection check — always call first:**

```
mcp__iwsdk-runtime__xr_get_session_status
```

If your tool environment lazily loads MCP schemas, hydrate the `mcp__iwsdk-runtime__*` tool definitions first. If MCP tools are still deferred, use the CLI (`npx iwsdk xr status`) for the same check.

If this returns a successful connection, the dev server is ALREADY running. Do NOT start another one.

**Troubleshooting:**

- Dev server not running → Start with `npm run dev` (CLI-managed) or `npx iwsdk dev up`
- Browser tab in background → Bring to foreground (Chrome throttles background tabs)
- Session not active → Use `mcp__iwsdk-runtime__xr_accept_session`

### hzdb (Meta Quest Device Tools)

Tools for Meta Quest device management and Meta's 3D asset library. All tools are prefixed `mcp__hzdb__`.

**3D Asset Search**

| Tool                 | Purpose                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `meta_assets_search` | Search Meta's 3D model library by text description. Returns GLB/FBX download URLs and previews. |

Use `meta_assets_search` to find ready-made 3D models (e.g., "spaceship", "office chair", "fantasy sword"). Download the GLB URL to `public/gltf/` and add it to your `AssetManifest`.

**Device Management** (requires a connected Quest via USB or WiFi ADB)

| Tool                      | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `device_list`             | List connected Quest devices                           |
| `device_info`             | Device model, Android version, serial number           |
| `device_battery`          | Battery level, charging status, temperature            |
| `device_wake`             | Wake headset from sleep                                |
| `device_proximity_sensor` | Disable proximity sensor to keep headset awake on desk |
| `get_device_logcat`       | Read device logs with tag/level/package filtering      |
| `push_file` / `pull_file` | Transfer files to/from the device                      |

These are device action tools, not IWSDK development tools. Useful for checking device health or transferring files, but not part of the typical code-build-test loop.

**Quest Platform Documentation**

| Tool                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `search_docs`          | Search Meta Quest developer documentation  |
| `fetch_meta_quest_doc` | Fetch full content of a documentation page |

**Important:** Only use these for Quest platform questions (distribution policies, WebXR spec details, device capabilities). For IWSDK API and development questions, use `iwsdk-reference` instead — it returns actual source code and is significantly more accurate.

---

## Quick Reference

### Core Architecture

IWSDK is built on three pillars:

1. **ECS (Entity Component System)** via `elics` library
2. **Reactive Signals** via `@preact/signals-core`
3. **Three.js Integration** with zero-copy transform binding

### Key Imports

```typescript
import {
  World,
  SessionMode,
  VisibilityState,
  createSystem,
  createComponent,
  Types,
  eq,
  ne,
  lt,
  le,
  gt,
  ge,
  isin,
  nin,
  Transform,
  RayInteractable,
  Hovered,
  Pressed,
  OneHandGrabbable,
  TwoHandsGrabbable,
  DistanceGrabbable,
  PhysicsBody,
  PhysicsShape,
  PhysicsState,
  PhysicsShapeType,
  AudioSource,
  PlaybackMode,
  AudioUtils,
  PanelUI,
  PanelDocument,
  InputComponent,
} from '@iwsdk/core';
```

### Critical Import Rule

**ALWAYS import Three.js types from `@iwsdk/core`, NEVER from `'three'` directly.**

```typescript
// ✅ CORRECT
import { Vector3, Quaternion, Mesh, MeshStandardMaterial } from '@iwsdk/core';

// ❌ WRONG - causes duplicate Three.js instances and bugs
import { Vector3 } from 'three';
import * as THREE from 'three';
```

**Exception:** GLTF loader types still come from three/addons:

```typescript
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
```

### Available Types

```typescript
Types.Float32; // 32-bit float
Types.Float64; // 64-bit float
Types.Int8; // 8-bit integer
Types.Int16; // 16-bit integer
Types.Int32; // 32-bit integer
Types.Uint32; // 32-bit unsigned
Types.Boolean; // true/false
Types.String; // text
Types.Vec3; // [x, y, z]
Types.Vec4; // [x, y, z, w]
Types.Color; // [r, g, b, a] - RGBA!
Types.Entity; // Entity reference
Types.Enum; // Enumerated value
Types.Object; // Any JS object (AVOID - not optimized)
```

### Component Template

```typescript
export const MyComponent = createComponent('MyComponent', {
  speed: { type: Types.Float32, default: 1.0 },
  position: { type: Types.Vec3, default: [0, 0, 0] },
  color: { type: Types.Color, default: [1, 1, 1, 1] }, // RGBA
});
```

### Zero-Allocation Vector Access

Use `getVectorView()` for direct TypedArray access in hot paths:

```typescript
// Returns Float32Array view - no object allocation
const posView = entity.getVectorView(Transform, 'position') as Float32Array;
posView[0] = x; // Direct write
posView[1] = y;
posView[2] = z;
```

### System Template

```typescript
export class MySystem extends createSystem(
  {
    items: { required: [MyComponent] },
    activeItems: { required: [MyComponent], excluded: [Disabled] },
  },
  {
    speed: { type: Types.Float32, default: 1.0 },
  },
) {
  private temp!: Vector3;

  init() {
    this.temp = new Vector3();

    this.queries.items.subscribe('qualify', (entity) => {
      // Entity matched query
    });

    this.cleanupFuncs.push(
      this.config.speed.subscribe((value) => {
        // Config changed
      }),
    );
  }

  update(delta: number, time: number) {
    for (const entity of this.queries.activeItems.entities) {
      // Process entity - NO allocations here!
    }
  }
}
```

### XR Input Access

```typescript
update() {
  const leftGamepad = this.input.xr.gamepads.left;
  const rightGamepad = this.input.xr.gamepads.right;

  // Button states
  leftGamepad?.getButtonPressed(InputComponent.Trigger);  // Currently held
  leftGamepad?.getButtonDown(InputComponent.Trigger);     // Just pressed
  leftGamepad?.getButtonUp(InputComponent.Trigger);       // Just released

  // Thumbstick
  const axes = leftGamepad?.getAxesValues(InputComponent.Thumbstick);
  console.log(axes?.x, axes?.y);  // -1 to 1

  // Player spatial hierarchy
  this.player.head;              // Head tracking
  this.player.raySpaces.left;    // Left controller ray
  this.player.gripSpaces.right;  // Right controller grip
}
```

### VisibilityState Handling

```typescript
init() {
  this.cleanupFuncs.push(
    this.world.visibilityState.subscribe((state) => {
      switch (state) {
        case VisibilityState.NonImmersive:
          // Browser mode (2D)
          break;
        case VisibilityState.Visible:
          // Full XR experience
          break;
        case VisibilityState.VisibleBlurred:
          // XR but focus lost - pause game
          break;
      }
    })
  );
}
```

### Audio Playback

```typescript
entity.addComponent(AudioSource, {
  src: '/audio/click.mp3',
  positional: true,
  volume: 0.5,
  playbackMode: PlaybackMode.Restart, // or Overlap, Ignore, FadeRestart
});

// Play audio
AudioUtils.play(entity);
```

### Physics Setup

```typescript
// PhysicsBody = motion properties
entity.addComponent(PhysicsBody, {
  state: PhysicsState.Dynamic, // or Static, Kinematic
  linearDamping: 0.5,
  gravityFactor: 1.0,
});

// PhysicsShape = collision shape + material
entity.addComponent(PhysicsShape, {
  shape: PhysicsShapeType.Box, // or Sphere, Cylinder, Auto
  density: 1.0,
  restitution: 0.5, // Bounciness
  friction: 0.3,
});
```

---

## Testing Workflow

**CRITICAL: Always run type check BEFORE testing!**

```bash
npx tsc --noEmit
```

Type errors will prevent systems from initializing properly, but may not show errors in the browser console. Always type check after writing code and before testing.

**BEFORE starting a dev server, ALWAYS check if one is already running:**

```
mcp__iwsdk-runtime__xr_get_session_status
```

If your tool environment lazily loads MCP schemas, hydrate the `mcp__iwsdk-runtime__*` tool definitions first. If MCP tools are still deferred, use `npx iwsdk xr status` instead.

If this returns a successful connection, the dev server is already running. Do NOT start another one.

1. **Type check first:** `npx tsc --noEmit` - fix any errors before proceeding
2. Check IWER status first: `mcp__iwsdk-runtime__xr_get_session_status` (or `npx iwsdk xr status` if MCP schemas are still deferred)
3. If not connected, start the CLI-managed dev server: `npm run dev`
4. If you need the resolved runtime URL or port, run `npx iwsdk dev status`
5. Enter XR: `mcp__iwsdk-runtime__xr_accept_session`
6. Test interactions with controller tools

### Debugging Missing Features

If something isn't appearing or working but no errors show in console:

1. **Don't use level filter for console logs** — call `mcp__iwsdk-runtime__browser_get_console_logs` with just `count`, not `level` filter, as you may miss important errors
2. **Run type check** — `npx tsc --noEmit` often reveals issues that don't appear as runtime errors
3. **Check scene hierarchy** — use `mcp__iwsdk-runtime__scene_get_hierarchy` to verify entities exist and find entity indices
4. **Reload and check logs immediately** — some errors only appear during initialization
5. **Inspect ECS state** — use `mcp__iwsdk-runtime__ecs_find_entities` to check if entities have expected components, then `mcp__iwsdk-runtime__ecs_query_entity` to read their values
6. **Diff before/after** — take `mcp__iwsdk-runtime__ecs_snapshot` before and after an action to see exactly what changed (or didn't)
7. **Isolate systems** — use `mcp__iwsdk-runtime__ecs_toggle_system` to pause suspect systems one at a time to find which causes the issue
