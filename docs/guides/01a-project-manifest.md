# Project Manifest

`iwsdk.config.json` is the committed project authority shared by Create, Vite,
the managed editor, and the application runtime. It holds JSON-safe project
data; application behavior and system registration remain ordinary TypeScript
or JavaScript.

## Minimal project

```json
{
  "$schema": "./node_modules/@iwsdk/core/dist/schemas/iwsdk-project.v1.schema.json",
  "version": "iwsdk.project.v1",
  "scene": "./public/scenes/main.iwsdk.scene.json",
  "assets": { "module": "./src/assets" },
  "components": { "module": "./src/components" },
  "world": {
    "xr": {
      "mode": "vr",
      "offer": "always",
      "features": { "handTracking": true }
    },
    "features": {
      "locomotion": true,
      "grabbing": true,
      "spatialUI": true
    }
  },
  "dev": {
    "emulator": { "device": "metaQuest3" }
  }
}
```

The `scene` path is project-root-relative and must point under `public/`.
Module paths are extensionless, project-root-relative source paths so the same
manifest works for TypeScript and JavaScript. Both module declarations are
optional.

## Application entry point

The Vite plugin converts the manifest into regular `WorldOptions` and imports
the declared modules in the browser realm:

```ts
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

const container = document.querySelector<HTMLDivElement>('#scene-container');
if (container == null) {
  throw new Error('Missing #scene-container');
}

const world = await World.create(container, projectOptions);
world.registerSystem(GameSystem, {
  priority: 10,
  configData: { difficulty: 2 },
});
```

Systems, callbacks, procedural values, and UIKitML `componentSets` are
executable and do not belong in JSON. Merge code-only options explicitly when
needed; `World.create(container, explicitOptions)` remains supported for
non-Vite and advanced applications.

## Asset and component modules

Use `defineAssets()` and `defineComponents()` so malformed declarations fail
close to their source:

```ts
import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export default defineAssets({
  environment: {
    name: 'Environment',
    type: AssetType.GLTF,
    url: publicAssetUrl('models/environment.glb'),
    priority: 'lazy',
  },
  'settings-panel': {
    name: 'Settings Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/settings.uikitml'),
  },
});
```

The asset module is the complete editor/runtime catalog. Do not filter it with
a project-level include list. Loading is controlled per entry:

- omitted or `critical`: block `World.create()`;
- `background`: start immediately without blocking;
- `lazy`: load on first explicit or scene-instantiation use.

Native scene asset IDs are validated against this complete catalog.

## World configuration

The `world` object covers the serializable part of `WorldOptions`:

- `xr`: `false`, or VR/AR mode, offer policy, reference space, and features,
  including the preferred `gazeTracking` feature and its deprecated
  `eyeTracking` compatibility alias;
- `render`: field of view, clipping planes, stencil, and nonimmersive camera;
- `input`: canvas pointer event settings;
- `features`: gaze, locomotion, grabbing, physics, scene understanding,
  environment raycast, camera access, and serializable spatial UI settings.

Requesting `xr.features.gazeTracking` registers `GazeSystem`.
`world.features.gaze` tunes that system but does not enable gaze by itself. See
[Gaze and Pinch](/concepts/xr-input/gaze) for the interaction model and testing
workflow.

`world.render.camera` is the browser preview pose under `world.player`.
Top-level scene `player.transform` is different: it authors the player/XR
origin in the virtual environment.

## Development configuration

`dev.emulator` stores project-owned desktop emulator behavior such as device,
environment, IWER, activation, and build injection. The managed editor and
command session are always available for manifest-first development servers.

`dev.targetDevicePreview` adds a development-only Meta VR Glasses gaze
preview to a physical Quest headset while preserving its browser-owned viewer,
hands, and controllers. With `gazeSimulation: "head"`, the default, IWER adds a
head-directed synthetic gaze source when the application requests
`gazeTracking`:

```json
{
  "dev": {
    "targetDevicePreview": {
      "gazeSimulation": "head"
    }
  }
}
```

Set `gazeSimulation` to `false` to turn the preview off without removing the
block. Target-device preview is active only in the Vite development server and
is never injected into a production build. The CLI's `--native-xr-control`
mode takes precedence because it intentionally replaces native tracking for
deterministic automation.

Headed/headless launch, open behavior, AI mode, and screenshot dimensions are
operator-session choices:

```bash
npx @iwsdk/cli dev up --ai-mode collaborate --headed --open
npx @iwsdk/cli dev up --ai-mode agent --screenshot-width 500 --screenshot-height 500
```

Keep Vite configuration small:

```ts
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev()],
});
```

Passing `assetManifest`, `componentManifest`, `emulator`, `ai`, or `workspace`
beside a project manifest creates competing authorities and is rejected.
