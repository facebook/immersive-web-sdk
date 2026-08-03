# IWSDK Project Manifest And Starter Simplification Plan

Status: approved; implementation in progress
Last updated: 2026-07-31
Owner surface: `immersive-web-sdk`
Primary objective: replace target-specific starter code generation with one
project manifest, one common application source tree, native scene JSON, and a
shared immutable CDN asset catalog.

## Executive Summary

IWSDK's current project creation path still carries machinery from the former
eight-variant starter matrix:

```text
AR or VR x JavaScript or TypeScript x Meta Spatial or native
```

Meta Spatial and GLXF are gone, native scene JSON now owns static composition,
and Desktop 3D has become a third runtime target. The current implementation
still materializes six complete intermediate starter trees, applies custom
template directives to TypeScript and Vite configuration, transpiles the trees,
converts them to Chef recipes, publishes those recipes through
`@iwsdk/starter-assets`, and uses a separate Vite plugin to expose example
models from `node_modules`.

The replacement should have four clean layers:

1. **`iwsdk.config.json`** is the declarative project manifest shared by
   Create, Vite, the managed editor, and the application runtime.
2. **Native scene JSON** owns authored hierarchy, transforms, environment,
   player placement, asset placement, and component values.
3. **Manifest modules** use parallel `defineAssets({...})` and
   `defineComponents([...])` helpers for declarations that require JavaScript
   values.
4. **`src/index.ts` remains normal application code**. It creates the world and
   retains explicit, fully typed `world.registerSystem(System, options)` calls.

The starter has one canonical TypeScript source tree. Target selection changes
only `iwsdk.config.json` and the selected `main.iwsdk.scene.json`. JavaScript is
derived mechanically from TypeScript; it is not independently templated.

Shared stock models are published once in a public, immutable
`@iwsdk/example-assets` package and consumed through exact-version CDN URLs by
both repository examples and generated starters. Generated projects neither
install that package nor contain copies of its glTF files. The existing
`iwsdkExampleAssets()` Vite middleware/copy plugin is removed.

Finally, `@iwsdk/create` becomes self-contained. It owns the common starter
source and agent guidance, writes the target manifest and scene directly, and
no longer fetches variant recipes from `@iwsdk/starter-assets`. Once the new
path has full parity, `@iwsdk/starter-assets`, the Chef recipe pipeline, and the
six-directory intermediate generator are deleted.

## Goals

- Eliminate all AR/VR/Desktop conditional templating from application code and
  `vite.config.ts`.
- Establish one first-class, schema-validated project manifest consumed by all
  IWSDK tooling.
- Keep `World.create()` and explicit `world.registerSystem()` available as the
  transparent low-level programming model.
- Make the editor and runtime resolve the same asset and component manifests.
- Give asset declarations an API consistent with component declarations.
- Keep generated projects small and free of copied stock glTF assets.
- Make repository examples and generated projects use the same stock asset
  URLs and loading behavior.
- Remove the special example-asset Vite server/build path.
- Replace six maintained/generated starter variants with one common source
  tree plus data generation and mechanical language conversion.
- Make Create independent from remotely fetched starter recipes.
- Preserve the existing Create UX and flags, including `--target`, language,
  feature, canary, installation, Git, and AI-tool selection.
- Provide sufficient migration guidance for the IWSDK 0.5.0 breaking release.

## Non-Goals

- Removing `World.create()` or preventing applications from supplying an
  explicit `WorldOptions` object.
- Serializing custom components, procedural `Object3D` assets, or systems into
  JSON.
- Introducing `defineApp()`, a system list abstraction, or a framework-owned
  application lifecycle that replaces ordinary TypeScript logic.
- Moving executable system registration into scene JSON or
  `iwsdk.config.json`.
- Making every third-party application asset use the IWSDK stock asset CDN.
- Making scene JSON contain executable module URLs or JavaScript.
- Requiring the managed editor for runtime-only IWSDK applications.
- Preserving the internal Chef recipe format as a public compatibility layer.

## Product And API Decisions

### Settled Direction

1. `iwsdk.config.json` is a first-class project manifest, not a hidden starter
   implementation detail.
2. `src/index.ts` remains the explicit web application entry point.
3. `src/index.ts` owns application logic and complete system registration
   calls, including `priority` and typed `configData`.
4. `World.create()` remains the low-level API and accepts fully expanded
   `WorldOptions` exactly as it does today.
5. A Vite virtual module expands the project manifest into ordinary
   `WorldOptions` by importing the declared asset and component modules.
6. `defineAssets()` is added alongside `defineComponents()`.
7. The Vite plugin discovers `iwsdk.config.json`; target-specific manifest and
   emulator branches disappear from `vite.config.ts`. Operator-session `ai`
   and `workspace` options disappear from project source rather than moving
   into another committed file.
8. Shared stock glTF assets and their linked textures are served from an
   exact-version public CDN package.
9. Generated projects do not install `@iwsdk/example-assets` and do not copy
   its glTF files into `public/`.
10. Create embeds the common starter source and generates target data locally.
11. `@iwsdk/starter-assets` is removed after its non-asset responsibilities are
    relocated and parity is proven.
12. A manifest-first dev server always exposes the managed editor and command
    session; there is no `dev.workspace.enabled` project switch. Operator
    choices such as headed/headless launch, open behavior, AI mode, and
    screenshot size remain CLI/runtime settings. AI remains optional. IWER is
    an explicit project emulator setting and is never inferred solely from
    `world.xr`.
13. `iwsdk.config.json` is committed, hand-editable project source. Create and
    editor tooling may update it, but it is not disposable generated state.
14. IWSDK 0.5 removes project metadata from
    `iwsdkDev({ assetManifest, componentManifest, ... })`. The shipped plugin
    hard-errors with an actionable migration message rather than maintaining
    two authorities. Temporary compatibility may exist only inside an
    implementation stack while fixtures migrate; it is gone at the top.

### Resolved Implementation Decisions

1. **CDN scope:** initially move immutable shared glTF models and their linked
   textures. Keep developer-editable source such as
   `public/ui/welcome.uikitml` and scene JSON local. Audio or branding images may
   move later only when they are explicitly treated as read-only stock content.
2. **Asset package versioning:** version `@iwsdk/example-assets` independently
   from the fixed IWSDK package group. Existing files never change within a
   published version. Adding assets produces a new package version without
   invalidating prior URLs.
3. **Public virtual-module name and support policy:**
   `virtual:iwsdk-project` is the public, semver-protected specifier. Ship its
   ambient declaration from `@iwsdk/vite-plugin-dev/client`.
4. **Config normalizer ownership:** serializable World/XR normalization is a
   pure, browser-safe `@iwsdk/core` API so Vite, Create, tests, and non-Vite
   tooling can produce the same `WorldOptions` subset.
5. **CDN provider:** use an exact-version jsDelivr npm URL initially, with a
   documented localization path for applications that require offline or
   first-party hosting. A Meta-owned mirror can be added without changing asset
   IDs when the base URL is environment-overridable and centralized.
6. **Desktop scene:** share the immersive scene seed with VR. Ship the common
   browser-camera/mouselook system only for `xr:false` worlds, so Desktop is a
   functional target rather than the current blank fixed-camera output without
   letting browser preview input mutate an XR project's authored spawn. This
   introduces the environment desk, plant, robot, audio, UIKitML
   panel, custom Robot component, and two systems into a target that is empty
   today. It also requires a real browser look controller because browser
   locomotion currently moves but does not rotate the camera. Keep one neutral
   panel and suppress its XR action when XR is disabled.
7. **CDN contributor and docs-build behavior:**
   `VITE_IWSDK_EXAMPLE_ASSET_BASE_URL` overrides the stock-asset base in
   browser modules; the `VITE_` prefix is intentional so Vite exposes it
   without another config-time bridge. Local SDK development, Sandcastle, and
   deterministic CI serve/intercept the packed bytes; a named network-enabled
   `cdn-release` lane alone proves jsDelivr.

## Current State And Problems

### Starter Generation

`packages/starter-assets/scripts/generate-starters.mjs` currently:

- copies `starter-template/` into VR, AR, and Browser TypeScript trees;
- applies custom `@template:if` blocks to source and Vite configuration;
- removes target-specific source files and assets;
- transpiles each TypeScript tree into a separate JavaScript tree;
- leaves six complete intermediate variants.

The live source also contains target directives in `welcome.uikitml`; browser
generation deletes that panel and its supporting code/assets. The generator
contains four historical directive/anchor families (`@template`, Chef feature
anchors, `@iwer-sem-*`, and the build-assets lexer), not merely one target
conditional syntax. Some are dead, while the Chef feature anchors still carry
prompt-selected locomotion, grabbing, and physics settings and therefore cannot
be deleted until the project manifest replaces them.

`packages/starter-assets/scripts/build-assets.mjs` then:

- scans the six trees;
- applies a second custom transformation pass;
- converts every file into Chef recipe edits;
- stores public files in a content-addressed asset directory;
- generates five tool-guidance recipes, including the vendor-neutral
  `base-agents-config` recipe;
- publishes an index of six recipes.

The source of truth is nominally one template, but the build path still reasons
about six complete applications and several overlapping transformation paths.

### Generated Runtime Code

Current target differences in `src/index.ts` include:

- scene filenames;
- `SessionMode` and XR configuration;
- feature flags;
- browser renderer and input configuration;
- camera placement;
- procedural logo-banner creation;
- custom system imports and registration.

`public/ui/welcome.uikitml` is also target-templated, and the current
`PanelSystem` assumes both the panel and an `xr-button` exist. Desktop currently
ships neither. This is part of the same common-source migration, not an
unrelated UI cleanup.

Most of these are data or scene-composition concerns. The remaining custom
system registrations are ordinary application logic and should be identical
when the corresponding entities are absent or present.

### Generated Vite Configuration

Current target differences include:

- `emulator.environment` for AR;
- `emulator.iwer` for Browser versus XR;
- `ai: {}` versus `workspace: { enabled: true }`;
- manifest module paths with language-specific extensions.

The Vite configuration repeats project metadata already needed by runtime and
editor. It should consume the project manifest instead.

### Example Asset Package

`@iwsdk/example-assets` currently contains the environment desk, plant, and
robot source files plus a catalog, copy helpers, and a Vite plugin. It is not
currently available on the public npm registry. Canary tests work because the
bundle contains its local tarball.

Generated starters currently install it as a development dependency. During
development its Vite middleware serves files under `/iwsdk-assets/`; during a
production build it copies selected files into `dist/iwsdk-assets/`. The files
are not present in the generated project's source tree.

This creates different and unnecessary asset delivery behavior for repository
examples, canary scaffolds, public scaffolds, and production builds.

### `@iwsdk/starter-assets` Has Multiple Responsibilities

The package is not merely a binary asset bundle. It currently carries:

- the canonical starter template;
- six generated recipe variants;
- content-addressed public starter files;
- Claude, Codex, Cursor, and Copilot guidance recipes;
- starter skills, including migration and scene-composer skills;
- project-level `AGENTS.md` and `CLAUDE.md` sources;
- Chef recipe verification scripts.

Deleting it requires relocating all these responsibilities, not merely moving
the models to a CDN.

## Target Architecture

```text
                         @iwsdk/create
                    prompts and CLI options
                              |
              +---------------+----------------+
              |                                |
        common source files              generated target data
     index/assets/components/Vite       iwsdk.config + main scene
              |                                |
              +---------------+----------------+
                              |
                     generated application
                              |
                iwsdk.config.json (authority)
                   /          |           \
                  /           |            \
          iwsdkDev()    virtual project    managed editor
            Vite         WorldOptions      and validation
                              |
                         World.create()
                              |
                 explicit registerSystem calls

  @iwsdk/example-assets@exact-version
                  |
           immutable CDN URLs
                  |
          examples and starters
```

The project manifest is read as data in Node. Asset and component modules are
not executed in the Vite configuration process. They are imported into the
appropriate browser realm by virtual modules, preserving the existing Elics
component-registry identity guarantees.

## `iwsdk.config.json` Contract

### Proposed Shape

```json
{
  "$schema": "./node_modules/@iwsdk/core/dist/schemas/iwsdk-project.v1.schema.json",
  "version": "iwsdk.project.v1",
  "scene": "./public/scenes/main.iwsdk.scene.json",
  "assets": {
    "module": "./src/assets"
  },
  "components": {
    "module": "./src/components"
  },
  "world": {
    "xr": {
      "mode": "vr",
      "offer": "always",
      "features": {
        "handTracking": true
      }
    },
    "features": {
      "locomotion": {
        "useWorker": true
      },
      "grabbing": true,
      "physics": false,
      "sceneUnderstanding": false,
      "environmentRaycast": false,
      "spatialUI": true
    },
    "input": {
      "canvasPointerEvents": true
    },
    "render": {
      "near": 0.001,
      "far": 200
    }
  },
  "dev": {
    "emulator": {
      "device": "metaQuest3",
      "iwer": true,
      "activation": "always",
      "injectOnBuild": true
    }
  }
}
```

The v1 field names are normative and must stay aligned between the JSON Schema,
TypeScript types, and runtime validator. The important boundaries are:

- `scene` names a project-root source file, not an arbitrary URL.
- asset and component module paths are local, project-root-confined, and
  extensionless so the same manifest works for TypeScript and JavaScript.
- `assets.module` and `components.module` are optional and default to empty
  manifests. Seven current examples have no custom component module.
- the complete asset manifest is the editor/runtime catalog. Project config
  never hides assets merely to control startup loading.
- `world` contains only serializable configuration. It is normalized into
  existing `WorldOptions` values such as `SessionMode.ImmersiveVR`.
- `world.xr` is a union: `false` disables XR, while the object form carries
  serializable XR configuration.
- manifest `scene` maps explicitly to `WorldOptions.level`; the runtime API does
  not gain a second `scene` option.
- `world.xr.features` mirrors the existing `XRFeatureOptions` JSON shape,
  including booleans, `{ "required": true }`, `layers`, and structured
  `depthSensing`; it does not invent an `"optional"` string enum.
- `dev` contains only project-owned emulator behavior needed by the Vite
  plugin. The managed editor and command bridge are intrinsic to a
  manifest-first dev server, while `dev.emulator.iwer` remains explicit.
  Emulator activation, build injection, and
  optional user-agent exceptions use JSON-safe values (regex values use
  source/flags objects rather than executable `RegExp` instances).
  Headed/headless launch, open behavior, AI
  mode, and screenshot size are operator-session settings supplied by the CLI
  or environment, not committed application configuration.
- systems are intentionally absent.

Optional development values keep the existing plugin defaults, but those
defaults are part of the v1 contract rather than target inference:

| Field                             | Default          |
| --------------------------------- | ---------------- |
| `dev.emulator.device`             | `metaQuest3`     |
| `dev.emulator.iwer`               | `true`           |
| `dev.emulator.environment`        | none             |
| `dev.emulator.activation`         | `localhost`      |
| `dev.emulator.injectOnBuild`      | `false`          |
| `dev.emulator.userAgentException` | `OculusBrowser`  |
| managed editor/command access     | always available |

Create omits `dev.emulator.iwer` because every starter uses the v1 default of
`true`. A target choice never changes IWER implicitly; a developer who disables
it does so explicitly and accepts the loss of runtime emulation/inspection.

### Normative Expressibility Boundary

Phase 0 must inventory every `World.create()` call in all ten examples and both
starter outputs before the v1 schema freezes. The resulting table becomes part
of the schema specification:

| Existing application value                                                                    | Manifest treatment               |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| `level`                                                                                       | Mapped from project `scene`      |
| `xr.sessionMode`                                                                              | Mapped from `world.xr.mode`      |
| `xr.offer`, `referenceSpace`, `restoreCameraOnExit`                                           | Expressible directly             |
| `xr.features`, including `layers` and structured `depthSensing`                               | Mirrors `XRFeatureOptions`       |
| Locomotion `useWorker`, `browserControls`, `initialPlayerPosition`, comfort, turning, jumping | Expressible directly             |
| Grabbing, physics, scene understanding, environment raycast, camera                           | Expressible directly             |
| Serializable spatial UI options (`forwardHtmlEvents`, `kit`, `preferredColorScheme`)          | Expressible directly             |
| Render `fov`, near/far, stencil, and nonimmersive camera pose                                 | Expressible directly             |
| Input canvas pointer behavior                                                                 | Expressible directly             |
| Asset and component objects                                                                   | Imported from local modules      |
| `features.spatialUI.componentSets` and other executable values                                | Code-only override in `index.ts` |
| System constructors, priorities, and `configData`                                             | Code-only in `index.ts`          |

The manifest is intentionally not total over `WorldOptions`. Applications merge
code-only values explicitly when constructing the final options rather than
serializing executable objects.

### Target Differences

Create generates the manifest programmatically.

#### VR

- `world.xr.mode = "vr"`.
- locomotion enabled with worker by default.
- grabbing enabled by default.
- the shared scene references the environment desk and other immersive assets.
- no simulated real-world environment.

#### AR

- `world.xr.mode = "ar"`.
- locomotion disabled by default.
- scene understanding and environment raycast follow Create selections.
- `dev.emulator.environment = "living_room"`.
- the AR scene does not reference the virtual environment desk, so its lazy
  model is not fetched.
- the AR scene contains content appropriate for passthrough.

#### Desktop 3D

- `world.xr = false`.
- browser locomotion controls and their initial player position are explicitly
  configured.
- `dev.emulator.iwer` is omitted and therefore keeps the target-independent
  default of `true`; it is not inferred from `world.xr`. The editor/command
  session is always available in development; AI/headless/open choices come
  from the dev command session.
- the initial implementation uses the shared VR/Desktop scene seed.
- browser camera defaults are target data, not templated source code.

### Schema And Validation Requirements

- Ship a versioned JSON Schema under `@iwsdk/core/dist/schemas/` and include it
  in the published tarball.
- Validate the manifest during Vite startup, production build, Create tests,
  and managed-editor initialization.
- Report errors with JSON paths and suggested fixes.
- Reject module paths that escape the project root or use remote URLs.
- Resolve extensionless modules through Vite, supporting `.ts`, `.tsx`, `.js`,
  `.jsx`, `.mjs`, and `.mts` where appropriate.
- Reject unknown manifest versions rather than guessing.
- Normalize source paths under `public/` into runtime URLs deterministically.
- Ensure the selected scene exists and has the native scene suffix.
- Extend `packages/scene-composition` validation options with the complete
  asset-ID catalog and lift the existing cross-check from
  `scripts/check-native-scene-examples.mjs`; ensure every scene asset reference
  is present in the complete project asset catalog.
- Ensure component schemas used by the scene exist in built-in or selected
  component catalogs.

## Asset Manifest API

### Add `defineAssets()`

`@iwsdk/core` should export a helper parallel to `defineComponents()`:

```ts
import { AssetType, defineAssets } from '@iwsdk/core';

export default defineAssets({
  robot: {
    type: AssetType.GLTF,
    url: 'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@1.0.0/assets/robot/robot.gltf',
    name: 'Robot',
    priority: 'lazy',
  },
  'welcome-panel': {
    type: AssetType.UIKitML,
    url: './ui/welcome.uikitml',
    name: 'Welcome Panel',
  },
});
```

`defineAssets()` must do more than cast a type:

- preserve literal asset IDs and entry types;
- validate nonblank IDs;
- validate URL-backed entry shapes and supported asset types;
- reject duplicate or invalid definitions where detectable;
- reject parented procedural `Object3D` prototypes early;
- freeze the manifest container without freezing the mutable Three.js
  prototypes it references;
- optionally attach a non-enumerable manifest brand/version if editor/runtime
  realm validation needs one;
- return a value accepted unchanged by `World.create({ assets })`.

`defineComponents()` remains responsible for component IDs, schemas, and the
component-registry marker. No `defineApp()` or `defineSystems()` API is added.

### Complete Catalog And Loading Policy

Current `AssetManager.preloadAssets()` loads every URL entry: default-priority
assets block world creation and background assets begin fetching immediately.
A shared starter manifest would therefore download unused target assets.

Do not solve this with a project-level asset allowlist. Availability and
preloading are different concerns:

- `assets.ts` is the complete authoring/runtime catalog;
- the editor drawer always exposes every authoring-compatible entry;
- `priority: 'critical'` blocks world readiness;
- `priority: 'background'` begins loading after critical assets without
  blocking;
- new `priority: 'lazy'` registers the URL and metadata without fetching it;
- scene lowering loads a referenced lazy glTF/UIKitML asset through the existing
  asynchronous `RenderableAssetRegistry.instantiate()` path;
- direct application access may explicitly load a lazy texture, audio, HDR, or
  model through AssetManager before reading it.

Existing manifests retain their current default critical behavior. Only assets
explicitly marked lazy change loading semantics. Shared stock glTF entries in
the common starter are lazy, so the AR scene does not download the unreferenced
VR environment while the editor can still add it later.

Core must ensure lazy entries register key-to-URL identity without starting a
request, concurrent first use deduplicates, failures use the structured asset
error, and editor bounds/thumbnail requests update after lazy loading. Scene
validation checks references against the complete catalog, not a target filter.

## Component Manifest API

Custom components remain executable schema declarations:

```ts
import { defineComponents } from '@iwsdk/core';
import { Robot } from './robot-component.js';

export default defineComponents([Robot]);
```

The project manifest points to this module. The same module is imported in the
runtime and managed-editor browser realms. Vite must not execute it merely to
parse `iwsdk.config.json` in Node.

## Runtime Bootstrap And `src/index.ts`

### Virtual Project Module

`@iwsdk/vite-plugin-dev` exposes the public, semver-protected typed virtual
module `virtual:iwsdk-project`, which:

- imports the asset manifest module;
- preserves the complete asset catalog and its per-entry loading priorities;
- imports the component manifest module;
- maps manifest XR strings to existing runtime enum values;
- converts the source scene path to its runtime URL;
- produces an ordinary `WorldOptions` object;
- exports no hidden system registration or application lifecycle.

Ship its ambient declaration from the public
`@iwsdk/vite-plugin-dev/client` export. TypeScript
starters include `src/vite-env.d.ts` referencing that client entry (or list it
in `tsconfig.types`) and expose a real `typecheck` script. The declaration must
be tested from the packed package, not from monorepo path aliases.

The virtual module is explicit build plumbing, not a replacement runtime API.
Applications that do not use Vite can continue constructing the same object
manually.

### Common Entry Point

All starter targets share this structure:

```ts
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { RobotSystem } from './robot.js';

const container = document.querySelector<HTMLDivElement>('#scene-container');
if (container == null) {
  throw new Error('Missing #scene-container');
}

const world = await World.create(container, projectOptions);

world.registerSystem(RobotSystem, {
  priority: 20,
  configData: {
    rotationSpeed: 1.5,
  },
});

world.registerSystem(PanelSystem, {
  priority: 30,
  configData: {
    initiallyVisible: true,
  },
});
```

The actual starter systems and their schemas determine the real options. The
important contract is that the complete calls remain code. They are not reduced
to an untyped class array or serialized into JSON.

Systems included in the common starter must tolerate scenes where their target
entities are absent. Prefer component queries and qualify/disqualify
subscriptions. Avoid unconditional `requireSceneObject()` during initialization
when a target legitimately omits that object.

### Registration Timing

The first implementation preserves current IWSDK semantics: `World.create()`
loads the initial level and resolves, then application systems are registered.
Elics already back-fills query entity sets, but `subscribe('qualify', callback)`
does not replay by default. Systems that initialize existing scene entities use
the existing `replayExisting` argument explicitly and receive a contract test.
If a system truly must run before initial scene loading, treat that as a
separate runtime API requirement; do not introduce a general app lifecycle
abstraction as part of this starter cleanup.

### Fully Expanded Escape Hatch

This remains supported:

```ts
const world = await World.create(container, {
  assets,
  components,
  level: './scenes/main.iwsdk.scene.json',
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
  },
  features: {
    locomotion: true,
    grabbing: true,
  },
});
```

Runtime-only applications are not required to adopt the project manifest. The
managed editor and zero-configuration project tooling do require it.

## Native Scene Responsibilities

The selected `public/scenes/main.iwsdk.scene.json` owns:

- level-root environment components;
- environment and content hierarchy;
- asset placement;
- transforms and visibility;
- authored player-space transform;
- component attachment and component field values;
- screen-space and follower relationships;
- editor views and other authoring metadata.

Move the remaining static starter composition out of `index.ts`:

- author an XR spawn/origin in the scene's `player.transform` only when the
  experience requires one; do not encode a browser preview offset there, and
  let the starter use the runtime's origin default when no authored spawn is
  needed;
- keep the player/camera distinction explicit: `player.transform` controls the
  authored XR spawn/origin, while `world.render.camera` controls the
  nonimmersive preview pose;
- use one common nonimmersive camera policy where possible;
- represent the logo/banner as a declared asset placed by the scene, or remove
  it if it adds no starter value; a raw `AssetType.Texture` is not placeable,
  so a retained banner needs a renderable glTF/procedural asset rather than a
  fictional scene texture placement;
- remove the unused `chimeSound` manifest entry while AudioSource uses a raw
  file URL, or separately add a real asset-reference contract; do not preserve
  the current duplicate declaration/fetch;
- replace target-templated `welcome.uikitml` copy with one neutral document;
  the common Panel system must tolerate both a missing panel and a missing XR
  control, and an `xr:false` project must not display a live Enter XR action;
- add an explicit `World.xrEnabled` capability or equivalent guard so
  `launchXR()` rejects clearly when XR was disabled instead of attempting a
  session;
- replace the currently unshipped starter-only `src/mouselook.ts` with the
  approved common Desktop browser-camera system; keep it inert in XR-enabled
  worlds so preview input cannot change the authored immersive spawn;
- keep custom behavioral systems in code;
- keep runtime-created or genuinely procedural state in code.

The initial scene seed count is two:

1. shared VR/Desktop scene;
2. AR/passthrough scene.

Create always writes the selected seed under the same filename:
`public/scenes/main.iwsdk.scene.json`.

The project-config scene is also the managed editor's default. An explicit
editor `?scene=` selection may override it, but the editor must not fall back to
an unshipped `public/scenes/scene.iwsdk.scene.json`.

## Vite Configuration

`iwsdkDev()` discovers `iwsdk.config.json` from the Vite root. It derives asset
and component module paths, emulator behavior, and editor/runtime integration
from that file. A manifest-first `iwsdkDev()` dev server always registers its
managed editor and command session. CLI settings decide whether the managed
browser opens immediately, whether it is headed, and whether AI mode is active;
these are not persisted project capabilities.

The starter Vite config becomes target-independent:

```ts
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev()],
  server: {
    host: '0.0.0.0',
    port: 8081,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: {
      input: './index.html',
    },
  },
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  publicDir: 'public',
  base: './',
});
```

This removes:

- `assetManifest` and `componentManifest` duplication;
- target-specific IWER and simulated-environment branches from TypeScript by
  moving their explicit values into project data;
- the duplicated `ai` versus `workspace` Vite branches; the managed editor is
  an ordinary dev-server capability and AI is a CLI-selected session mode;
- `iwsdkExampleAssets()`;
- language-specific manifest extensions.

Changes to module paths, emulator activation, or IWER may
require rebuilding the injection bundle. Phase 2 must register the config as a
watched file and restart the Vite server when a page reload is insufficient;
it must not claim HMR can update build-start-only values. CLI AI/headless/open
changes take effect when the dev process is launched or restarted.

IWSDK-required Vite defaults may later move into the plugin, but that cleanup is
not necessary to establish the project manifest and should not obscure this
migration.

## Immutable CDN Asset Package

### Package Role

Publish `@iwsdk/example-assets` as a public, static asset package. Its runtime
role is a stable CDN namespace, not an installed dependency.

This is an independently landable workstream. Manifest/Create development must
continue against the current `/iwsdk-assets/` delivery behind one centralized,
environment-overridable base URL until licensing and public-CDN gates pass.

The package should contain:

- canonical glTF files;
- every texture or buffer referenced by those glTF files;
- a machine-readable catalog;
- stable asset IDs and entry paths;
- file sizes and SHA-256 hashes;
- conservative model bounds;
- original source URLs;
- license identifiers and required attribution;
- package documentation explaining the immutability contract.

Remove or stop using publicly:

- `iwsdkExampleAssets()`;
- development middleware;
- production copy helpers;
- application-facing virtual or local path behavior.

Internal catalog validation helpers may remain if they support package release
tests without becoming part of generated applications.

### URL Contract

Use exact package versions, never `latest` or a semver range:

```text
https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@1.0.0/assets/robot/robot.gltf
```

Requirements:

- published files are immutable within a version;
- existing asset paths are never repointed to different bytes;
- exact file hashes are checked before publication;
- glTF-relative texture and buffer paths remain inside the same versioned
  directory;
- CDN responses have working CORS and appropriate MIME types;
- a post-publish smoke test downloads every catalog file and verifies hashes;
- applications can localize files later without changing scene asset IDs.
- repository contributors can override the base URL to a local package server
  while iterating on stock assets;
- docs-site example builds explicitly choose the public CDN or a release-owned
  mirror rather than inheriting an accidental developer default.

### Release Ordering

The public package does not currently exist on npm. The release must be staged:

1. audit every asset's provenance and redistribution license;
2. publish `@iwsdk/example-assets` with public access;
3. verify npm contents and CDN availability;
4. run post-publish CORS, MIME, relative-resource, and hash checks;
5. only then land public starter/example URLs that depend on the package.

Until step 4 completes, tests use a local HTTP server serving the exact package
tarball contents. Do not merge URLs that point to an unpublished package. The
real-CDN suite runs in a named network-enabled release lane; Sandcastle and
offline lanes use a Playwright route fixture backed by the packed tarball.

Repository custody and the root project license are not proof that a model can
be redistributed. If the audit cannot establish original source and license
evidence, replace that model with a newly created or explicitly licensed asset
before publication. Track A continues on the existing local delivery while
that happens.

### Availability And Offline Tradeoff

Direct CDN loading deliberately makes stock starter models network-dependent at
runtime. This is acceptable for thin samples only if:

- failure messages identify the failed remote asset clearly;
- core wraps loader failures in `AssetLoadError { assetId, url, cause }` and
  applies a finite fetch/load timeout;
- critical assets reject `World.create()` with the structured error, while
  background assets remain nonblocking and log the same structured identity;
- documentation explains how to download and replace the URLs with local
  files;
- production guidance recommends owning or mirroring critical application
  assets;
- test infrastructure can serve or intercept the same immutable bytes locally
  rather than relying on internet availability for every CI run.

Phase 5 owns one shared stock-asset URL predicate and one `page.route` fixture.
All proof scripts must use that predicate instead of hard-coded
`/iwsdk-assets/` substring matching, and absolute CDN URLs must be validated
rather than skipped.

## Create And Starter Pipeline

### Common Source Tree

Move the canonical template into `@iwsdk/create`, for example:

```text
packages/create/
  template/
    common/
      gitignore.template
      .nvmrc
      README.md
      index.html
      vite.config.ts
      tsconfig.json
      src/
        index.ts
        assets.ts
        components.ts
        vite-env.d.ts
        mouselook.ts
        panel.ts
        robot.ts
        robot-component.ts
      public/
        ui/welcome.uikitml
        audio/chime.mp3
        textures/webxr.png
    scenes/
      immersive.iwsdk.scene.json
      ar.iwsdk.scene.json
  guidance/
    AGENTS.md
    CLAUDE.md
    skills/
    agents/
```

The final exact layout can differ, but there must be one maintained copy of
each common source file. `package.json` is generated from normalized Create
configuration and SDK version data; it is not copied unchanged from today's
tarball-relative source template. Dotfiles use explicit package-safe aliases
and are renamed on output so npm packing cannot silently omit them.

### Generation Algorithm

1. Resolve the existing Create prompts/flags into one normalized project
   configuration.
2. Resolve the packaged template root relative to `import.meta.url`, never the
   repository checkout, and copy the common source to a staging result.
3. Generate `iwsdk.config.json` from the normalized configuration.
4. Select the AR or shared immersive scene seed and write it as
   `public/scenes/main.iwsdk.scene.json`.
5. Ship one common `defineAssets()` catalog. Stock models use lazy entries and
   a centralized base URL; scene references determine which ones load.
6. Include selected AI-tool guidance directly from Create's packaged files.
7. Generate `package.json` from one explicit version authority. Normal npm mode
   uses the packed Create version and exact matching IWSDK versions; canary mode
   uses `bundle.json.sdkVersion` and rejects a Create/bundle mismatch. Never
   silently fall back to `@latest`.
8. During the Create package build, mechanically compile the canonical
   TypeScript template into generated JavaScript template output. At scaffold
   time, TypeScript copies the source output and JavaScript copies the generated
   semantic equivalent, renames references, removes TypeScript dependencies,
   and omits `tsconfig.json`. This keeps Sucrase/build tooling out of the public
   Create runtime dependency set.
9. Convert the template/config/scene result into a plain `ProjectFile[]` and
   write it through a Chef-independent scaffold consumer. Preserve path
   confinement, symlink rejection, atomic replacement, `--force` behavior, Git
   initialization, and install behavior.
10. Resolve SDK package versions or canary tarballs as today, without fetching
    a separate starter recipe.

The `@iwsdk/create` build emits templates and guidance under `dist/`, updates
the package `files` list, and tests the actual `npm pack` tarball. The packed
CLI must scaffold successfully when the repository source tree and
`packages/starter-assets/dist` are unavailable.

There are still six supported output combinations, but no six independently
transformed code variants:

```text
3 target configurations x 2 mechanical language outputs
```

### Remove Chef And Remote Recipes

After parity:

- remove `@pmndrs/chef` from the creation path;
- delete recipe index fetching and fallback logic;
- delete variant recipe generation and verification;
- simplify the canary bundle contract to package versions/tarballs plus any
  other non-template release metadata;
- keep Create's safe output preflight and atomic writes;
- remove jsDelivr starter-recipe availability as a scaffold-time dependency.

### Rewrite And Relocate Agent Guidance

Rewrite these for the new manifest/CDN surface and move their canonical sources
from `@iwsdk/starter-assets` to `@iwsdk/create`:

- `PROJECT_AGENTS.md`;
- `PROJECT_CLAUDE.md`;
- `claude-injections/skills/**`, `claude-injections/agents/**`, and
  `claude-injections/settings.json`;
- Codex skills under `.agents/skills/**`;
- Cursor and Copilot instruction sources;
- migration skill and scene-composer resources;
- tool-specific settings templates.

Preserve conditional generation: only requested integrations should be written
where that is the current Create behavior. Add package-content tests so a
published Create tarball cannot omit required guidance. Add a synchronization
or single-source rule for the repository-root `.claude` copies. Audit every
instruction for retired `assetManifest`, `/iwsdk-assets/`, recipe, Meta Spatial,
and GLXF guidance; relocation without content rewrite does not pass.

### Delete `@iwsdk/starter-assets`

Delete the package only when all gates pass:

- Create scaffolds without fetching recipes;
- every common starter file ships in the Create tarball;
- all guidance recipes have equivalent direct generation;
- canary source resolution no longer expects starter recipes;
- release tooling no longer publishes or references the package;
- docs no longer tell users or contributors to rebuild starter assets;
- all six output combinations install, build, serve, and open in the editor.
- published 0.4.x packages remain available for old Create clients; after the
  new release, deprecate rather than unpublish `@iwsdk/starter-assets`.

## Example Migration

For every repository example:

1. Add an `iwsdk.config.json` that declares its scene, asset manifest,
   component manifest, world features, and emulator target.
2. Change its Vite plugin usage to `iwsdkDev()` with no duplicated manifest or
   target options.
3. Replace shared local/example-plugin glTF URLs with exact-version CDN URLs.
4. Remove `iwsdkExampleAssets()` from Vite configuration.
5. Remove `@iwsdk/example-assets` application dependencies where present.
6. Keep example-specific assets local.
7. Keep explicit system registration and other application logic in
   `src/index.ts`.
8. Validate that asset IDs, scene references, and editor thumbnails remain
   unchanged from the user's perspective.

Repository tests should intercept or locally serve the immutable CDN package
bytes where offline determinism is required. A separate post-publish suite
tests the real public CDN.

## Package-Level Implementation Work

### `packages/core`

- Add `defineAssets()` and tests.
- Add backward-compatible `priority: 'lazy'` registration and on-demand loading
  tests for glTF/UIKitML plus explicit load paths for other asset types.
- Export project-manifest TypeScript types used by tooling.
- Ship the versioned project JSON Schema inside `dist/schemas/` and verify the
  packed path used by `$schema`.
- Add the core-owned pure normalizer for the serializable World/XR subset after
  the example inventory fixes its scope.
- Add an explicit XR-enabled capability and guard `launchXR()` for `xr:false`.
- Add structured `AssetLoadError` identity and finite critical-asset timeout.
- Keep `WorldOptions`, `World.create()`, and explicit asset/component arguments
  supported.

### `packages/scene-composition`

- Extend scene validation options with a known asset-ID catalog.
- Move the existing scene-asset cross-check out of
  `scripts/check-native-scene-examples.mjs` into the reusable validator.
- Keep the package runtime-independent: callers supply IDs, not AssetManager
  objects or module paths.
- Add validation tests for missing, disabled, and valid asset references.

### `packages/vite-plugin-dev`

- Discover and validate `iwsdk.config.json`.
- Add path-confined extensionless module resolution.
- Generate `virtual:iwsdk-project`, expose its declaration through a public
  client types entry, and test it from a starter whose `tsconfig.types` does not
  see monorepo globals.
- Drive existing asset/component editor virtual modules from the project
  manifest.
- Derive explicit IWER and AR emulator behavior from project configuration;
  always register the managed editor/command session for manifest-first dev
  servers, and merge CLI-selected launch and AI choices at process startup.
- Watch the manifest and restart Vite when build-start-only injection settings
  change; use page reload only for values that are genuinely runtime-loaded.
- Default the editor scene to project `scene`, with explicit query selection as
  an override.
- Migrate `editor-e2e-fixture.ts` and the full editor E2E suite to a
  manifest-only fixture during this package phase.
- Remove legacy plugin metadata options from the shipped surface and provide an
  actionable hard error/migration message for stale configuration.

### `packages/cli`

- Detect an IWSDK app using `iwsdk.config.json` in addition to current Vite and
  dependency heuristics.
- Preserve `dev:runtime`, adapter sync, managed browser, MCP, and reference
  behavior for the new generated package.
- Remove hard-coded starter-template checkout paths from CLI tests.
- Decide whether `@meta-quest/hzdb` remains a generated dependency and cover
  the resulting telemetry path in the Create matrix.
- Update CLI/help/migration guidance without changing explicit runtime command
  semantics.

### `packages/example-assets`

- Add source/license/attribution metadata.
- Define and test the immutable public file layout.
- Remove the generated-starter Vite plugin path.
- Add npm-pack, local HTTP, and post-publish CDN verification.
- Decouple package versioning if approved.
- Update Changesets fixed-group configuration and release documentation; prove
  that bumping `@iwsdk/core` does not bump this immutable asset package.
- Publish publicly before dependent URLs land.

### `packages/create`

- Embed the common template and guidance.
- Generate project config and scene data directly.
- Keep safe scaffold behavior.
- Build and package mechanical TS-to-JS template output.
- Generate package dependencies from the selected version authority.
- Split scaffold production from Chef so `scaffoldProject` consumes
  `ProjectFile[]`.
- Remove recipe fetching and Chef composition.
- Update canary bundle handling.
- Compare Create version with `bundle.json.sdkVersion` in canary mode.
- Update `package.json` build/test dependencies and remove the
  `@iwsdk/starter-assets` workspace dependency.
- Test published-package contents and external scaffolding, not merely
  monorepo source paths.

### `packages/starter-assets`

- Freeze feature work while replacement is developed.
- Keep the old pipeline available only until parity tests pass.
- Delete the package, build scripts, recipes, CAS output, and release references
  in the final removal phase.

### Examples And Docs

- Migrate every example to project manifests and CDN stock assets.
- Update setup, external assets, editor, build/deploy, and migration guides.
- Update starter and CLI skills to teach the new boundary.
- Update the 0.5 migration skill with an old-to-new configuration table.
- Rewrite stock-asset proof scripts around the shared URL predicate and local
  route fixture.
- Regenerate tracked test evidence and SHA-256 manifests, including a Desktop
  target and a Phase 0 baseline outside `docs/test-evidence/current/`.
- Update root README, contributor scripts, CI workflows, changesets, reference
  source priorities, and bundle rehearsal scripts that name
  `packages/starter-assets`.

## Compatibility And Migration Policy

This is an intentional IWSDK 0.5.0 application-structure break, but the runtime
programming API remains available.

### Still Supported

- explicit `World.create(container, WorldOptions)`;
- explicit `assets` and `components` values in `WorldOptions`;
- explicit `world.registerSystem(System, { priority, configData })`;
- code-authored entities and procedural assets;
- applications that do not use the managed editor.

### New Primary Path

- `iwsdk.config.json` is the project authority;
- `iwsdkDev()` discovers it;
- `virtual:iwsdk-project` supplies expanded world options;
- asset and component modules use `defineAssets()` and
  `defineComponents()`;
- `index.ts` adds application systems and logic after world creation.

### Retired From Generated Projects

- target-specific `@template:if` code;
- separate AR/VR/Browser scene filenames in application code;
- `iwsdkDev({ assetManifest, componentManifest, ... })` starter declarations;
- target-specific `ai` versus `workspace` branches in `vite.config.ts` (the
  managed editor becomes intrinsic and operator launch/AI settings move to the
  dev command session; only project-owned emulator settings live under `dev`);
- `iwsdkExampleAssets()`;
- `@iwsdk/example-assets` as an installed starter dependency;
- `@iwsdk/starter-assets` recipes;
- Chef-based starter composition.

### Migration Guide Outline

1. Create `iwsdk.config.json` from the existing `World.create()` and
   `iwsdkDev()` settings.
2. Rename the chosen initial scene to `main.iwsdk.scene.json` or update the
   manifest path.
3. Wrap the asset manifest in `defineAssets()`.
4. Keep `defineComponents()` and point the config at its module.
5. Replace the duplicated `WorldOptions` block with
   `virtual:iwsdk-project` where adopting the primary path.
6. Leave `world.registerSystem()` calls in `index.ts`.
7. Move manifest and emulator behavior from Vite configuration into project
   `assets`, `components`, and `dev` fields; remove the workspace-enable switch,
   and move operational AI, headed/headless, open, and screenshot choices to
   the dev command/session.
8. Remove the example-assets Vite plugin and dependency.
9. Choose CDN or localized URLs for formerly shared example models.
10. Verify editor asset/component discovery, runtime scene load, system
    registration, and production build.

## Implementation Workstreams And Phases

The work is split so an external licensing or publication delay cannot block
the internal project-manifest refactor.

### Track A: Project Manifest, Starter, And Create

Track A runs initially against the current local `/iwsdk-assets/` delivery
behind one centralized base-URL contract. It owns Phases 0, 2, 3, 4, 5A/5B,
6, and the non-CDN release verification.

### Track B: Immutable Asset Distribution

Track B owns licensing, independent package versioning, publication, real-CDN
verification, documentation for localization, and the final base-URL switch.
It can land independently. Track A must not embed unpublished CDN URLs.

### Phase 0: Contract Approval, Inventory, And Baseline

Tasks:

- approve the settled direction and resolve the decisions above;
- inventory the complete `World.create()` shape of all ten examples and both
  starter outputs before freezing the schema;
- capture all six scaffold outputs via `starter:sync` or built recipes, because
  successful starter builds delete their intermediate trees;
- record package/file sizes, generated file lists, network requests, build
  output, managed-editor/runtime screenshots, and Desktop behavior;
- record the concrete shared-scene Desktop delta and approved common
  browser-camera behavior in baseline evidence;
- store the baseline outside `docs/test-evidence/current/`, include Desktop,
  and preserve its SHA-256 manifests;
- inventory every repository consumer of `packages/starter-assets`, Chef
  recipes, literal `/iwsdk-assets/`, and old Vite manifest options;
- repair or explicitly record pre-existing audit/proof defects before they are
  used as baselines;
- preserve the current stack before implementation.

Gate:

- schema expressibility table, virtual-module policy, legacy-option policy,
  config ownership, CDN policy, Desktop behavior, and package-removal scope are
  explicitly approved.

### Track B Phase 1: Immutable Asset Distribution

Tasks:

- audit licensing, provenance, and attribution;
- finalize static package paths and independent Changesets/release policy;
- add environment-overridable base URL, local package server, npm-pack tests,
  and contributor workflow;
- keep CDN URL generation out of the public package API until a real package
  version has passed publication; consumer source owns the approved exact
  version literal and `VITE_IWSDK_EXAMPLE_ASSET_BASE_URL` override;
- publish the package publicly;
- run real CDN CORS/MIME/hash/glTF-relative-resource checks in a named
  network-enabled release lane.

Gate:

- every catalog asset loads from its pinned public URL and matches its recorded
  hash, every asset has original-source and redistribution-license evidence,
  and a core-package changeset does not bump the immutable asset package.

### Phase 2: Project Manifest, Validation, And `defineAssets()`

Tasks:

- implement the approved manifest types, normative field table, and packed JSON
  Schema;
- implement config parsing, validation, path confinement, and core-owned
  normalization;
- implement `defineAssets()`;
- implement and test backward-compatible lazy asset registration/on-demand
  instantiation without filtering the authoring catalog;
- add scene-composition asset-catalog validation;
- add the finalized virtual project module and public client declaration;
- drive runtime/editor asset and component modules from config;
- preserve explicit `WorldOptions` behavior;
- add config watching and Vite restart for build-start-only changes;
- default the editor scene from config;
- migrate the editor E2E fixture from old plugin options to a manifest-only
  fixture;
- add TypeScript starter declarations and a real typecheck script.

Gate:

- the full editor E2E suite is green against a manifest-only fixture;
- a hand-authored app uses the manifest for runtime and editor;
- an explicit-options app passes unchanged;
- packed client declarations typecheck outside the monorepo.

### Phase 3: One Common Starter

Tasks:

- remove target blocks from index, assets, components, Vite, and
  `welcome.uikitml`;
- move static composition into scene seeds while preserving the player versus
  nonimmersive camera distinction;
- use one neutral panel, guard `xr:false`, and make PanelSystem tolerate absent
  objects/elements;
- use `replayExisting` at system subscriptions that initialize loaded scene
  entities;
- fix `DepthSensingSystem` to replay already-loaded `DepthOccludable` entities;
- implement the approved browser-camera/mouselook disposition;
- use fixed `main.iwsdk.scene.json` and default the editor to it;
- verify the shared VR/Desktop seed or use the approved split;
- regenerate starter/editor evidence affected by node, camera, or scene changes;
- keep stock asset delivery behind the Track A base URL until Track B passes.

Gate:

- the same TypeScript, Vite, asset, component, and UIKitML source bytes are used
  for VR, AR, and Desktop; only config and scene data differ;
- Desktop renders its approved scene, mouse look works when required, and no
  live XR button appears with `xr:false`;
- Browser, VR, and AR editor/runtime checks are clean.

### Phase 4: Self-Contained Create

Tasks:

- move common source and rewritten guidance into Create;
- generate package.json, config, and scene directly;
- build and package mechanical JavaScript template output;
- convert scaffolding to `ProjectFile[]` while preserving safety checks;
- update normal/canary version authority and enforce `bundle.json.sdkVersion`;
- update the Create package files/build pipeline, dotfile aliases, and
  `import.meta.url` template lookup;
- remove recipe fetching and Chef from the new path;
- rewrite `create-flow-e2e` so it has no starter-assets `beforeAll` dependency
  or old target-shape assertions;
- update CLI/reference/canonical-surface consumers that locate the old template.

Gate:

- `test:create-flow-e2e` passes with `packages/starter-assets/dist` absent;
- an `npm pack` tarball scaffolds all six combinations with outbound network
  denied;
- safe overlay, symlink, Git, install, typecheck, and build behaviors pass.

### Phase 5A: Harness And Evidence Rewrite

Tasks:

- rewrite `check-native-scene-examples.mjs` before the first example migrates;
- rewrite render-proof, runtime-smoke, and Create E2E URL matching around one
  shared predicate;
- add a Playwright `page.route` fixture backed by packed immutable asset bytes;
- ensure absolute URLs are validated rather than skipped;
- update evidence targets and hash manifests, including Desktop;
- define the real-CDN release lane and explicit console-message allowlist.

Gate:

- current examples pass both the local/intercepted stock-asset path and the new
  project-manifest harness before consumer migration begins.

### Phase 5B: Examples, Docs, And Guidance

Tasks:

- migrate examples in VR, AR, and Desktop batches;
- rebuild package tarballs and clean-install each non-workspace example per
  batch;
- remove the example-assets Vite plugin after Track B's base URL switch;
- rewrite, rather than merely relocate, starter skills and agent guidance;
- update docs, root README, release docs, migration guidance, reference source
  priorities, and tracked evidence;
- update Meta Spatial audit allowlists for intentional migration/history docs
  while removing live obsolete guidance.

Gate:

- every example opens in runtime and editor, loads its scene/assets, and passes
  focused behavior tests, typecheck, build, and deterministic offline proof.

### Phase 6: Remove Old Pipeline

Tasks:

- delete `@iwsdk/starter-assets`, six-variant generation, and Chef verification;
- remove package/workspace/lockfile/changeset/release references;
- update root build/test scripts, CI workflows, canonical MCP checks, release
  rehearsal, bundle scripts, CLI tests, reference source priorities, README,
  and docs;
- clear the known hard consumers explicitly:
  - `packages/create/package.json` and `pnpm-lock.yaml`;
  - root `package.json` native-scene/Create scripts;
  - `scripts/check-canonical-mcp-surface.mjs`;
  - `scripts/check-native-scene-examples.mjs`;
  - `scripts/native-scene-release-rehearsal.mjs`;
  - `scripts/build-bundle.sh` and SDK bundle scripts;
  - `.github/workflows/native-scene-editor.yml`;
  - pending changesets and `.changeset/config.json`;
  - `packages/cli/test/cli.test.ts`;
  - `packages/reference/src/query-handlers.ts`;
  - `packages/reference/test/tools.test.ts`;
  - `packages/create/tests/installer.test.ts`, `source.test.ts`, and
    `scaffold.test.ts`;
  - `scripts/check-native-scene-editor-evidence.mjs` and
    `scripts/check-native-scene-starter-evidence.mjs`;
  - `.github/workflows/deploy-docs.yml` and `scripts/build-examples.sh`;
  - `ci/sandcastle/run-check.sh` and `RELEASE.md`;
  - root and package READMEs;
- remove legacy example-assets Vite exports after Track B is live;
- retain old published 0.4.x packages and mark them deprecated rather than
  unpublishing them;
- remove temporary dual-path tests.

Gate:

- `pnpm install --frozen-lockfile` passes with the directory deleted;
- `pnpm test:canonical-mcp-surface` passes;
- `pnpm test:native-scene-examples` passes;
- `pnpm test:create-flow-e2e` passes;
- `pnpm changeset status` passes;
- `pnpm audit:metaspatial` passes with intentional migration/history references
  explicitly allowlisted;
- `bash scripts/build-bundle.sh` passes;
- repository search finds no live recipe, template directive, hard-coded
  starter-assets dependency, or `iwsdkExampleAssets` consumer outside approved
  migration/history fixtures.

### Phase 7: Release Verification

Tasks:

- pack the actual public packages and record their file manifests;
- scaffold from those tarballs into clean external directories;
- install and build all six combinations;
- run live Browser, VR, and AR editor/runtime checks;
- test physical-headset HTTPS guidance and managed-browser behavior;
- run both deterministic intercepted-asset tests and the real public CDN suite;
- verify migration documentation against a representative 0.4.x app;
- publish a named evidence artifact list and console-message allowlist.

Gate:

- production-ready evidence exists for every acceptance criterion below and
  each named release artifact is present.

## Verification Matrix

### Unit And Contract Tests

- valid VR, AR, and Desktop manifests normalize correctly;
- invalid versions and unknown fields fail clearly;
- path traversal and remote module paths are rejected;
- extensionless TS and JS modules resolve correctly;
- missing asset/component modules default to empty manifests;
- `defineAssets()` preserves literal types and validates entries;
- component registry identity remains correct in runtime/editor realms;
- the full manifest remains visible to runtime and editor;
- critical/background/lazy loading policies behave independently of catalog
  availability;
- scene references missing from the catalog fail before rendering;
- config `scene` maps to runtime `level` and editor default scene;
- the managed editor works with no AI mode, AI mode works through that same
  session, and IWER follows its explicit config rather than `world.xr`;
- virtual and manually expanded `WorldOptions` are behaviorally equivalent;
- direct `World.create()` remains unaffected.

### Create Matrix

Test:

```text
VR      x TypeScript
VR      x JavaScript
AR      x TypeScript
AR      x JavaScript
Desktop x TypeScript
Desktop x JavaScript
```

For each output:

- generated file set is correct;
- only target data differs between target variants;
- JavaScript is a mechanical semantic equivalent of TypeScript;
- package versions and canary tarball paths resolve;
- install succeeds from a packed/published-like environment;
- typecheck succeeds for TypeScript;
- the virtual module declaration resolves without monorepo ambient types;
- production build succeeds;
- no `@iwsdk/example-assets` or `@iwsdk/starter-assets` dependency exists;
- no stock glTF is copied into project source;
- no template directive survives;
- Git and `--force` safety behavior remains correct.

### Runtime And Editor Tests

- config-selected scene loads;
- all manifest authoring assets appear in the asset drawer;
- component schemas appear in the inspector;
- thumbnails and in-scene assets load from CDN;
- relative glTF textures resolve from the CDN directory;
- unreferenced lazy assets are not requested, while adding one in the editor or
  scene loads it on demand;
- custom systems register with their intended priorities and config data;
- systems discover scene entities that existed before registration;
- Browser controls work with `xr: false`;
- the approved Desktop mouse-look/camera policy works;
- `xr:false` has no active Enter XR UI and `launchXR()` reports an actionable
  disabled-state error;
- VR enters/exits XR cleanly;
- AR remains transparent and uses its simulated environment in development;
- reload, runtime/editor switching, screenshots, and scene save remain stable;
- console has no asset, schema, or runtime errors.

### CDN And Publication Tests

- npm tarball contains every catalog file and no unexpected files;
- every published URL returns 200;
- CORS allows browser loading;
- content types are correct enough for loaders and browsers;
- SHA-256 matches the catalog;
- glTF-linked resources are complete;
- a cold browser can load all stock models;
- a documented localized copy works with the same asset IDs;
- CDN outage produces actionable errors rather than an unexplained blank scene.

### Regression Tests

- CLI runtime commands and MCP parity remain intact;
- managed browser launch/retry behavior remains intact;
- CLI AI/launch modes and explicit IWER permutations publish command-ready
  sessions as expected;
- example-focused ECS, UI, interaction, locomotion, physics, and audio suites
  remain green;
- package lint, format, typecheck, build, and API extraction remain green;
- migration skill examples compile against the final API.

## Acceptance Criteria

1. There is one maintained starter application source tree.
2. AR, VR, and Desktop TypeScript, Vite, asset/component modules, and UIKitML
   contain no target template branches.
3. Create writes one fixed scene filename and one project manifest.
4. The same config drives runtime, editor, asset discovery, component discovery,
   and emulator/IWER behavior. Manifest-first dev servers always expose the
   managed editor; CLI session settings drive AI mode and
   headed/headless/open behavior.
5. `defineAssets()` and `defineComponents()` are the consistent manifest APIs.
6. `index.ts` retains explicit, fully expressive system registration.
7. Direct `World.create(WorldOptions)` remains supported.
8. Stock shared glTF assets are loaded through immutable, exact-version URLs.
9. Generated projects neither install the example asset package nor contain
   copied stock glTF files.
10. Repository examples use the same public asset URLs.
11. Create no longer fetches or composes starter recipes.
12. `@iwsdk/starter-assets` and the six-variant generator are removed.
13. All six generated combinations install and build from packed release
    artifacts.
14. Browser, VR, and AR live verification passes with clean console output.
15. The 0.5 migration guide documents both the manifest-first path and the
    explicit `WorldOptions` escape hatch.
16. CDN failures identify asset ID and URL and terminate or degrade according to
    the documented critical/background policy.
17. The packed Create package contains every common template, dotfile alias,
    declaration, and rewritten guidance resource required to scaffold offline.

## Risks And Mitigations

| Risk                                              | Impact                                                 | Mitigation                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Public CDN is unavailable or blocked              | Stock starter scenes fail at runtime                   | Exact versioning, clear errors, localize/mirror documentation, local CI fixture                            |
| Asset redistribution rights are unclear           | Package cannot be published safely                     | Mandatory source/license/attribution audit before publication                                              |
| Common manifest preloads unused models            | Slow startup and wasted headset bandwidth              | Keep full catalog; mark stock models lazy; load scene references on demand; test request counts            |
| Config becomes a second inconsistent authority    | Runtime and editor diverge                             | One schema, one parser, one virtual expansion path, reject conflicting plugin options                      |
| Vite executes component modules in Node           | Browser globals fail or Elics registry identity splits | Parse only JSON in Node; import manifest modules in browser virtual modules                                |
| Virtual module hides too much runtime behavior    | Debugging becomes difficult                            | Keep `index.ts` explicit, export ordinary `WorldOptions`, document expanded equivalent                     |
| System registration loses priority/configuration  | Behavior changes silently                              | Keep complete `world.registerSystem()` calls in application code                                           |
| Late system registration misses existing entities | Scene behavior fails                                   | Use and test the existing `replayExisting` subscription argument at affected call sites                    |
| Desktop cannot truly share VR scene               | Poor browser experience                                | Treat sharing as a hypothesis and split only after live evidence                                           |
| Create package grows                              | Slower npm install                                     | Measure actual packed size including PNG/audio/guidance; compare against removed recipes and remote assets |
| Removing recipes breaks canary flow               | Local development and release testing fail             | Redesign canary manifest first; test packed tarball scaffolds before deletion                              |
| JavaScript conversion drifts                      | JS output behaves differently                          | One mechanical transpiler, semantic snapshots, build/live matrix                                           |
| Config HMR leaves stale editor/runtime state      | Confusing development behavior                         | Restart Vite for injection-bundle settings; reload only runtime-loaded boundaries                          |
| Managed editor is accidentally treated as opt-in  | Bare manifest-first apps lose editor/command access    | Make it intrinsic to manifest-first dev servers; keep only launch/AI choices session-scoped                |
| Schema freezes before example inventory           | Real apps need code workarounds or v2 immediately      | Inventory all examples/starters and publish normative expressibility table before schema freeze            |

## Estimation Gate

Do not attach a precise staffing estimate before Phase 0. The external review
correctly warns that this is not a small starter cleanup, but its estimate is
not grounded enough to become a commitment. Phase 0 must size Track A by
package/fixture migration and Track B by licensing/publication work, identify
what can run in parallel, and publish a revised estimate with explicit
assumptions and confidence.

## Suggested Review And Commit Stack

Keep Track A branches focused and independently testable:

1. **Project manifest and asset declaration API**
   - schema, parser, `defineAssets()`, path validation, types.
2. **Vite/editor/runtime project integration**
   - virtual project module, zero-duplication manifest discovery, target
     derivation.
3. **Common starter and self-contained Create**
   - common source, generated config/scene, language conversion, guidance move.
4. **Harness, example, docs, and guidance migration**
   - proof fixtures, example configs, evidence, docs and migration skill.
5. **Old-pipeline removal and release rehearsal**
   - starter-assets/Chef deletion, consumer cleanup, packed release matrix.

Track B is separately landable:

1. catalog licensing, immutable layout, independent release configuration;
2. local/package/CDN verification and public publication;
3. consumer base-URL switch and example-assets Vite plugin deletion.

Do not expose a public starter that references a package before Track B's
post-publish gate passes.

## Definition Of Done

### Track A: Manifest, Starter, And Create

Track A is complete when a clean user can install the packed Create package,
generate any supported target/language combination, inspect a small and
understandable project containing `iwsdk.config.json`, open its scene in the
managed editor, run it in Browser or emulated XR, understand and modify its
explicit system registration in `index.ts`, and build it for deployment
without any dependency on `@iwsdk/starter-assets` or Chef recipes. While Track
B is rights-gated, the temporary example-assets Vite bridge is an explicit
Track A exception and must remain isolated behind the final base-URL contract.

### Track B: Immutable Asset Distribution

Track B is complete only when every stock model has original-source and
redistribution-license evidence (or an approved replacement), the independently
versioned package is publicly published, every exact-version CDN file passes
CORS/MIME/hash/relative-resource checks, generated apps and repository examples
use those URLs without installing `@iwsdk/example-assets`, and the
example-assets Vite plugin and copy path are deleted from live consumers.

### Combined Release

The project and its final release are complete only when both tracks are
complete and the named Phase 7 evidence proves the combined top-of-stack
state. Track A passing does not waive or silently redefine the public-CDN
acceptance criteria.
