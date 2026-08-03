# IWSDK Scene Asset Authoring

## Contents

1. Shared Manifest Contract
2. URL Assets
3. Procedural Assets
4. Geometry And Materials
5. Runtime And Editor Semantics
6. Repetition And Performance
7. Validation Checklist

## Shared Manifest Contract

Keep the manifest in a dedicated module and point the project authority at it:

```json
{
  "assets": { "module": "./src/assets" }
}
```

The application consumes the expanded project options, so it cannot drift from
the editor's catalog:

```ts
// src/index.ts
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

await World.create(document.getElementById('scene-container')!, projectOptions);
```

The runtime and managed editor evaluate `src/assets.ts` separately in different
worlds. The module must therefore be deterministic and self-contained:

- do not read a `World`, scene, iframe, editor object, or DOM element;
- do not rely on singleton object identity across realms;
- do not start timers, fetch arbitrary state, or attach prototypes to a parent;
- keep prototypes immutable after registration.

The manifest ID is the stable application-global reference used by scene JSON.

## URL Assets

Register glTF files and non-renderable application assets normally:

```ts
// src/assets.ts
import { AssetType, defineAssets } from '@iwsdk/core';
import readingChair from './scene-assets/reading-chair.scene-asset.js';

const publicAssetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export default defineAssets({
  room: {
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/room.glb'),
    name: 'Room shell',
  },
  ambience: {
    type: AssetType.Audio,
    url: publicAssetUrl('audio/ambience.mp3'),
  },
  'status-panel': {
    name: 'Status panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/status-panel.uikitml'),
  },
  'reading-chair': readingChair,
});
```

Renderable entries appear in the editor asset catalog: glTF, UIKitML, and direct
`Object3D` prototypes. Audio, texture, and HDR entries remain available to application
systems but are not scene-node content. A UIKitML file in `public/ui/` is not placeable
until its URL is registered with `AssetType.UIKitML`.

Build public URLs from `import.meta.env.BASE_URL` so runtime, managed editor, and
subpath builds resolve the same files. Never put URLs or asset declarations in
scene JSON, and never guess a path without checking the project.

UIKitML scene nodes use the same asset-only JSON contract as glTF and procedural
objects:

```json
{
  "id": "status-panel",
  "content": { "type": "asset", "asset": "status-panel" },
  "transform": {
    "position": [0, 1.4, -1.5],
    "rotationDeg": [0, 0, 0]
  }
}
```

A minimal Horizon-compatible document uses normal `<style>` plus nested `<div>`
elements. Numeric sizes are UIKit units (centimeters), not browser CSS pixels:

```html
<style>
  .panel {
    flex-direction: column;
    width: 240;
    padding-top: 18;
    padding-right: 18;
    padding-bottom: 18;
    padding-left: 18;
    background-color: #10171a;
    border-color: #34464d;
    border-width: 1;
    border-radius: 14;
  }
  .title {
    color: #f6fbff;
    font-size: 24;
    font-weight: 700;
    line-height: 1.25;
  }
</style>
<div class="panel">
  <div id="status" class="title">Ready</div>
</div>
```

UIKitML is an HTML/CSS-shaped language, not a browser engine. Validate instead of
assuming full CSS support. In particular, expand multi-value shorthands such as
`padding: 12 18`, use unitless line-height multipliers such as `1.25`, and prefer
uniform `border-color`/`border-width` over directional border properties. Parser
errors include source locations.

Panel surfaces are single-sided and their front faces local **+Z**. Rotate the local
+Z axis toward the intended viewer; for a viewer at the origin and a panel at
`[0, 1.4, -1.5]`, the unrotated panel above already faces the viewer. For a computed
yaw, use `atan2(viewerX - panelX, viewerZ - panelZ)` with no extra 180-degree term.
Verify the authored rotation rather than assuming a missing preview is a loader
failure. Use
`npx iwsdk ui render-preview --input-json '{"assetId":"status-panel"}'` for an
isolated proof, and `scene render-file` for in-scene placement. Both commands reload
the current same-URL source, so before/after evidence does not require a server
restart.

At runtime, retain a directly instantiated `UIKitMLAsset`, or resolve a scene-authored
one by stable node id:

```ts
import { UIKit, UIKitMLAsset } from '@iwsdk/core';

const panel = world.requireSceneObject<UIKitMLAsset>('status-panel');
const status = panel.requireElementById<UIKit.Text>('status');
status.setProperties({ text: 'Ready' });
```

`UIKit.Text` is the public element type for text nodes and its public
`setProperties({ text })` method updates content. No deep import from pmndrs UIKit is
needed.

Do not search for an editor-only panel component or depend on a transient entity
index. The manifest ID identifies the reusable asset; the scene node ID identifies
its placed runtime instance; element `id` attributes identify fields inside it.

## Procedural Assets

A procedural asset module exports one parentless `Object3D` prototype:

```ts
// src/scene-assets/reading-chair.scene-asset.ts
import { BoxGeometry, Group, Mesh, MeshPhysicalMaterial } from '@iwsdk/core';

const upholstery = new MeshPhysicalMaterial({
  color: '#52604a',
  roughness: 0.82,
  sheen: 0.18,
  sheenColor: '#8a927d',
});

const wood = new MeshPhysicalMaterial({
  color: '#4b281c',
  roughness: 0.56,
  clearcoat: 0.08,
});

const chair = new Group();
chair.name = 'Reading chair';

const seat = new Mesh(new BoxGeometry(0.78, 0.18, 0.76), upholstery);
seat.position.y = 0.52;
chair.add(seat);

const back = new Mesh(new BoxGeometry(0.78, 0.92, 0.18), upholstery);
back.position.set(0, 1.04, 0.28);
chair.add(back);

for (const x of [-0.31, 0.31]) {
  for (const z of [-0.27, 0.27]) {
    const leg = new Mesh(new BoxGeometry(0.1, 0.52, 0.1), wood);
    leg.position.set(x, 0.26, z);
    chair.add(leg);
  }
}

export default chair;
```

The exported root must have `parent === null`. Its children may form any hierarchy.
The registry rejects an already-parented prototype because a prototype is a reusable
definition, never a placed scene instance.

Use `Group`, `Mesh`, `BufferGeometry`, standard Three.js geometries, imported helper
libraries, or custom shader materials as needed. The editor does not need source-level
knowledge of these internals; it imports and renders the resulting prototype.

## Geometry And Materials

Geometry and material authoring belongs in asset code. This includes:

- custom `BufferGeometry` attributes and indices;
- generated curves, extrusions, lathed surfaces, vegetation clusters, and decals;
- shared `MeshStandardMaterial` or `MeshPhysicalMaterial` instances;
- textures, normal maps, alpha maps, and generated `DataTexture` values;
- `ShaderMaterial` or `RawShaderMaterial` where the static scene requires it;
- multi-material meshes and complete glTF material assignments.

The scene editor deliberately does not expose material reassignment or editing. To
change a material, edit the owning asset module, let Vite reload it, and rerender the
scene. This keeps glTF multi-material assets intact and allows arbitrary shader code
without expanding the JSON schema.

Prefer shared material objects within a manifest evaluation. Do not dispose geometry,
materials, or textures from placed asset clones; the registry treats them as shared
prototype resources. World/application teardown owns their lifetime.

## Runtime And Editor Semantics

For every placement, the registry returns a distinct hierarchy clone. Direct
`Object3D` assets use skeleton-safe cloning. Geometry and material references remain
shared unless the asset itself deliberately creates distinct resources.

Bounds are computed from the instantiated asset with `Box3`. They drive placement,
selection, validation, framing, and scatter collision radius. Ensure that:

- transforms are finite;
- geometry has valid bounding data;
- the prototype origin is meaningful for composition;
- the local Y=0 convention is deliberate;
- invisible helpers do not inflate bounds unexpectedly.

Scene files reference only the manifest ID:

```json
{
  "id": "chair",
  "content": {
    "type": "asset",
    "asset": "reading-chair",
    "castShadow": true,
    "receiveShadow": true
  },
  "transform": { "position": [0, 0, 0] }
}
```

Changing a prototype updates every scene node that references its ID after reload.

## Repetition And Performance

Use scene prefabs and patterns for repeated placements. The lowerer can convert a
pattern to `InstancedMesh` when the prefab resolves to one eligible mesh without
components or child structure. More complex prefabs expand to cloned hierarchies but
still share prototype geometry and materials.

For large repeated sets:

- make a single-mesh asset when individual hierarchy is unnecessary;
- reuse one prefab and deterministic pattern distribution;
- avoid unique materials per instance;
- minimize shadow casters and transparent overdraw;
- split near identity-critical assets from distant simplified assets;
- measure draw calls and triangles from editor render statistics.

Do not add bespoke batching metadata to scene JSON. Optimize the registered asset and
prefab shape so normal lowering can batch it.

## Validation Checklist

- `vite.config.ts` points at the real manifest module.
- The application imports the same manifest default export.
- Every scene asset ID exists in the manifest.
- Every direct prototype is parentless and deterministic.
- Both editor and runtime can import the module without DOM/world dependencies.
- Selection bounds match the visible object.
- Repeated assets share geometry/materials and avoid unnecessary draw calls.
- Asset code, scratch modules, the composition root, and the flattened final scene
  build without warnings or blocking errors.
