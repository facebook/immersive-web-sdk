---
title: Input Visuals
---

# Input Visuals

Input visuals render the user’s controllers or hands and keep them animated from live input. IWSDK separates “adapters” (WebXR + scene wiring) from “implementations” (how the model looks and animates).

## Architecture

- Adapters (per side):
  - `XRControllerVisualAdapter`
  - `XRHandVisualAdapter`
  - Responsibilities:
    - Connect/disconnect to `XRInputSource`.
    - Keep `visual.model` aligned to the current grip space.
    - Choose a visual implementation and asset based on input profile.
    - Expose `isPrimary` and hook into `XROrigin` spaces.
- Implementations:
  - `AnimatedController` — animates buttons/axes using the WebXR Input Profile’s visual responses; uses `FlexBatchedMesh` for draw‑call reduction.
  - `AnimatedHand` — skinned hand with an outline pass (stencil + back‑face); updates joints from `fillPoses`.
  - `AnimatedControllerHand` — a controller‑holding hand that blends toward a “pressed” pose from button values.

## Using visuals

Visuals are created automatically by `XRInputManager` when an input source appears. Add the origin to your scene and call `update` each frame.

```ts
import { XRInputManager } from '@iwsdk/xr-input';

const xrInput = new XRInputManager({ scene, camera });
scene.add(xrInput.xrOrigin);

renderer.setAnimationLoop((t) => {
  xrInput.update(renderer.xr, clock.getDelta(), t / 1000);
  renderer.render(scene, camera);
});
```

By default, controllers use `AnimatedController` and hands use `AnimatedHand`. Only the “primary” source per side is visible; secondary sources are tracked but hidden.

## Swapping visual implementations

You can switch an adapter to a different implementation class at runtime. This keeps the WebXR wiring and swaps the rendering logic.

```ts
import { AnimatedControllerHand } from '@iwsdk/xr-input';

// Replace the controller visual with a controller-hand hybrid on the right hand
const rightController = xrInput.visualAdapters.controller.right;
rightController.updateVisualImplementation(AnimatedControllerHand);
```

Implementation classes must follow the `VisualImplementation` interface and usually extend `BaseControllerVisual` or `BaseHandVisual`.

## Customizing asset loading (CDN, cache, etc.)

Adapters fetch assets via an `XRAssetLoader` (default uses `GLTFLoader`). Provide your own to change source or add caching.

```ts
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const assetLoader = {
  async loadGLTF(assetPath: string): Promise<GLTF> {
    // Implement your fetch policy here: local cache, versioned CDN, etc.
    return await new GLTFLoader().loadAsync(assetPath);
  },
};

const xrInput = new XRInputManager({ scene, camera, assetLoader });
```

## How profiles pick visuals

- Controllers: the adapter reads the `XRInputSource.profiles` list and resolves a WebXR Input Profile JSON. From that it gets:
  - `layout` (per handedness) including component indices and visual response nodes.
  - `assetPath` suggestion for GLTF; the adapter constructs `https://cdn.jsdelivr.net/.../<profileId>/<left|right>.glb` unless overridden.
- Hands: a default “generic hand” layout is used; hand joints are updated via `XRFrame.fillPoses`.

Note: The repo prebuild script generates `generated-profiles.ts` so profiles are available at runtime without network requests for JSON.

## Build your own visual

Start from one of the base classes:

```ts
import { Group, MeshStandardMaterial } from 'three';
import { BaseControllerVisual } from '@iwsdk/xr-input';

export class MyControllerVisual extends BaseControllerVisual {
  init() {
    // Called once after GLTF is loaded
    this.model.traverse((n) => {
      // material tweaks, batching, etc.
      if ((n as any).isMesh) (n as any).material = new MeshStandardMaterial();
    });
  }
  update(dt: number) {
    if (!this.gamepad || !this.model.visible) return;
    // Read button/axis values from this.gamepad and animate nodes
  }
}
MyControllerVisual.assetKeyPrefix = 'my-controller';
```

Then instruct an adapter to use it:

```ts
xrInput.visualAdapters.controller.left.updateVisualImplementation(
  MyControllerVisual,
);
```

Guidelines:

- Cache keys: set a unique `assetKeyPrefix` and optionally `assetProfileId`/`assetPath` if you want a custom asset per profile/handedness. The loader caches visuals per `assetKeyPrefix-profileId-handedness`.
- Keep your GLTF skeleton/joint names consistent with layout or your update code.
- For hands, ensure your skinned mesh disables frustum culling and consider an outline pass for legibility.

## Toggling visibility

You can enable/disable visuals without disconnecting the adapter:

```ts
// Controller visuals off, logic continues to run
xrInput.visualAdapters.controller.left.toggleVisual(false);

// Hand visuals on
xrInput.visualAdapters.hand.left.toggleVisual(true);
```

## Troubleshooting

- Seeing the wrong controller model: check the runtime‑reported profile list in devtools (`inputSource.profiles`) and whether your adapter’s `assetProfileId` forces a specific one.
- Models appear but don’t animate: confirm the layout’s `visualResponses` node names exist in your GLTF and that `Gamepad` is present on the input source.
- Hands not moving: some runtimes lack the optional `XRFrame.fillPoses`. Consider a fallback to per‑joint `getJointPose` if targeting those.
