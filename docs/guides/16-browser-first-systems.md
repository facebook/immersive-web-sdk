# Browser-First Systems

IWSDK is a 3D web framework with first-class XR support. That means the core scene, ECS, renderer, player origin, camera, and input facade exist even when an app starts as a browser-only experience with `xr: false`.

The goal is not to prescribe one browser camera style. First-person, orbit, product, editor, cinematic, and third-person cameras all remain app choices. IWSDK's job is to keep the reusable systems available and make the browser/XR boundary explicit.

## System Status

| System                                             | Browser Story                                             | XR Story | Notes                                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Transform, level, visibility, environment lighting | Ready                                                     | Ready    | Core ECS and Three.js integration do not depend on XR.                                                                                       |
| Pointer input                                      | Ready                                                     | Ready    | `input.canvasPointerEvents` forwards browser canvas pointer events; XR rays use `input.xr.multiPointers`. Both feed `Hovered` and `Pressed`. |
| Spatial UI                                         | Ready                                                     | Ready    | Manifest-backed `UIKitMLAsset` works in world space, and `ScreenSpace` panels are parented to `world.camera` outside XR.                     |
| Audio                                              | Ready                                                     | Ready    | Audio sources and spatial audio are scene features, not XR-only features.                                                                    |
| Physics                                            | Ready                                                     | Ready    | Havok simulation is browser-safe. Physics colliders are separate from locomotion BVH collision.                                              |
| Locomotion                                         | Opt-in browser bindings                                   | Ready    | The locomotor engine is shared. Browser apps can opt into keyboard/browser-gamepad action bindings while keeping camera behavior app-owned.  |
| Grabbing                                           | Browser pointer selection ready; manipulation adapter TBD | Ready    | Ray hover/press works in the browser. Near-field one/two-hand grabbing remains XR-oriented.                                                  |
| Camera source                                      | Ready                                                     | Ready    | `CameraSource` uses browser media APIs and can run without an XR session when the camera feature is enabled.                                 |
| Scene understanding                                | XR-only                                                   | Ready    | Planes, meshes, and anchors depend on WebXR session features.                                                                                |
| Environment raycast                                | XR-only                                                   | Ready    | This is WebXR hit-test against real-world surfaces, not browser raycasting or locomotion BVH.                                                |
| Native XR layers                                   | XR-first                                                  | Ready    | Layer components use native WebXR composition layers when available; browser fallback promotion is a separate decision.                      |

## Input Actions

Low-level input stays available:

- `world.input.xr` for XR hands/controllers.
- `world.input.keyboard` for browser keyboard state.
- `world.input.browserGamepads` for standard browser gamepads.

Systems that can be reused across surfaces should bind to actions instead of physical inputs. The first built-in framework actions are scoped to locomotion and selection:

- `locomotion.move`
- `locomotion.turn`
- `locomotion.jump`
- `locomotion.teleportAim`
- `locomotion.teleportCommit`
- `interaction.select`

XR locomotion bindings are enabled by default so existing XR apps keep their current thumbstick and button behavior. Browser locomotion bindings are opt-in.

```ts
const world = await World.create(container, {
  xr: false,
  features: {
    locomotion: {
      browserControls: true,
    },
  },
});
```

With `browserControls: true`, IWSDK binds WASD/arrow keys and standard browser gamepads to locomotion actions. The app still owns the camera style. For first-person browser movement, drive `world.camera` orientation and let locomotion move `world.player`. For orbit, follow, editor, or third-person cameras, keep the camera logic in app systems and use locomotion only if the app wants a player origin that moves through the environment.

The `examples/browser-first` app uses `xr: false`, `features.locomotion.browserControls`, `input.canvasPointerEvents`, `LocomotionEnvironment`, browser-ready grab handles, ray interactables, physics, audio, and a world-space manifest-backed UIKitML asset together in one browser-first scene.

## Locomotion

Locomotion uses the same `@iwsdk/locomotor` engine in browser and XR. The reusable pieces are:

- `LocomotionEnvironment` for walkable/collidable scene geometry.
- BVH-backed collision and ground detection.
- Slide, turn, jump, and teleport engine calls.
- `world.player` as the moved origin.

The browser-first layer only answers intent questions like "what is the movement axis?" and "was jump pressed?". It does not install pointer lock or force a camera rig. Apps can add pointer lock, touch look, orbit controls, or follow cameras on top.

For a first-person desktop camera, keep `world.camera.position.x` and `.z` at `0` under the player origin, then rotate the camera from pointer movement:

```ts
let yaw = 0;
let pitch = 0;
canvas.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= event.movementX * 0.002;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - event.movementY * 0.002));
  world.camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
```

## Grabbing

Browser pointer events already cover hover, press, and select-like interaction for `RayInteractable` entities. `DistanceGrabbable`, `OneHandGrabbable`, and `TwoHandsGrabbable` still model XR manipulation semantics.

The next narrow browser adapter should focus on distance manipulation using pointer events plus `interaction.select`. It should not try to emulate two-hand XR grabbing on desktop unless the app explicitly opts into a custom interaction model.

## XR-Only Systems

Some systems should remain XR-only because the browser does not expose equivalent data:

- `SceneUnderstandingSystem` depends on WebXR plane detection, mesh detection, and anchors.
- `EnvironmentRaycastSystem` depends on WebXR hit-test sources.
- Native composition layers depend on WebXR layer support, even though the layer system has an internal textured mesh fallback.

Browser apps should use regular Three.js raycasting, canvas pointer events, authored scene geometry, or locomotion BVH collision for browser equivalents.
