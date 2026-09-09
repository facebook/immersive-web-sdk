---
name: iwsdk-scene-composer
description: Compose editable IWSDK scenes from text or image references with manifest-backed assets, native scene JSON, bounded visual iteration, and runtime-safe output.
argument-hint: '(use the current request)'
---

# IWSDK Scene Composer

Build the requested scene with the smallest workflow that preserves editability
and visual quality. Application code owns geometry and materials; scene JSON owns
composition; the managed editor provides authoritative rendering.

## Select a path before discovery

Use the **direct path** by default. Choose the **modular path** only when the
request has multiple independently reusable scene sections, parallel authors,
recursive imports, or image reconstruction that materially benefits from
isolated modules.

- Direct path: edit manifest/assets and the final flat scene in place. Do not
  create scratch modules or run flatten.
- Modular path: author independent valid modules, render them only when useful,
  compose them through imports, then flatten exactly once before runtime use.

A scene with many nodes is not automatically modular. Repetition belongs in
prefabs or deterministic patterns, not one file per object.

## Fixed boundaries

- Use `iwsdk.scene.v1` and meters.
- Scene JSON contains composition, transforms, constraints, components,
  prefabs, and patterns. It never contains URLs, primitive geometry, material
  definitions, or material overrides.
- Register glTF, UIKitML, and deterministic parentless `Object3D` prototypes in
  the configured `defineAssets()` manifest.
- Import Three.js runtime classes from `@iwsdk/core`.
- Root environment components belong in the scene document `components` map.
- Preserve existing authored IDs and human edits unless the request replaces
  them explicitly.

## Bounded opening

Read the applicable scoped scene/assets instructions and inspect
`iwsdk.config.json`, the configured asset manifest, relevant asset modules, and
active scene in one bounded pass. Load a skill reference only for the path that
needs it:

- `references/scene-format.md` for an uncertain scene construct;
- `references/asset-authoring.md` for new procedural or imported assets;
- `references/text-intake.md` or `references/image-intake.md` for the matching
  input type;
- `references/composition-patterns.md` only when prefabs, patterns, or modules
  are genuinely useful.

Reach the first asset or scene edit within roughly eight tool calls. Do not begin
with dependency-tree searches, generated declarations, repeated capability
queries, or marketplace browsing.

For the routine direct path, the scaffold's scoped asset/scene rules plus the
existing manifest and scene are sufficient. Do not load the long scene-format
reference for flat nodes, components, or authored views, even when the assets
themselves use custom geometry. Load `scene-format.md` only for imports,
prefabs, patterns, or after a concrete scene-schema rejection. Load
`asset-authoring.md` only when external models, custom geometry, or shaders need
contracts beyond the scoped asset rule.

## Compose from large decisions to detail

Reduce the request to required anchors, silhouette, scale, support contacts,
negative space, material response, hero framing, and measurable acceptance
criteria. A single source image proves only visible geometry; state assumptions
instead of inventing hidden structure.

Build in this order:

1. support surface, room massing, and environment light;
2. identity-critical assets and their proportions;
3. repeated secondary detail with prefabs or deterministic patterns;
4. deliberate hero and diagnostic views;
5. material and lighting refinement.

Prefer existing manifest assets when they fit. Search MetaVR or another asset
source only when the request benefits from a ready-made model. Use procedural
asset code when dimensions, articulation, semantic parts, or deterministic
variation matter. Copy selected external files into project-owned storage; do
not persist temporary CDN URLs.

Every visible required anchor needs real asset content. Groups provide hierarchy,
not visible mass. Keep transforms explicit and IDs stable.

## Add stateful interaction without source archaeology

When the requested scene includes a small stateful interaction, progression
loop, or recovery path, keep it in one project system with project components.
The supported
public pattern is `createComponent` + `defineComponents`, then `createSystem`
queries whose `entities` values are Sets. React to ray activation with a query
qualified by `Pressed`; inspect or move scene-authored entities through each
queried entity's `object3D`. Read and write scalar component fields with
`getValue` and `setValue`.

Prefer `Types.Int8`, `Types.Boolean`, `Types.Float32`, or `Types.String` for
ordinary authored state. Encode a small finite slot/state set as an integer or
string; do not introduce `Types.Enum` and inspect ECS package declarations just
to model a few values.

```ts
export const InteractiveItem = createComponent('InteractiveItem', {
  slot: { type: Types.Int8, default: 0 },
  active: { type: Types.Boolean, default: false },
});
export default defineComponents([InteractiveItem]);

class InteractionSystem extends createSystem({
  items: { required: [InteractiveItem] },
  controlPressed: { required: [ControlState, Pressed] },
}) {
  init(): void {
    this.queries.controlPressed.subscribe('qualify', () => this.evaluate());
  }

  private evaluate(): void {
    for (const entity of this.queries.items.entities) {
      const position = entity.object3D.position;
      // Compare measured positions, update authored state, and render feedback.
    }
  }
}
```

`createComponent`, `createSystem`, `defineComponents`, `Types`, `Pressed`,
`UIKitMLAsset`, `UIKit`, `Color`, `Mesh`, `MeshStandardMaterial`, `Object3D`, and
`Vector3` are public top-level exports from `@iwsdk/core`. For a scene-authored
UIKitML surface, resolve its stable node ID with
`world.requireSceneObject<UIKitMLAsset>('ControlPanel')` and use stable element
IDs. For a bespoke, size-controlled surface, use a styled root `<div>`; Horizon
`<Panel>` and `<Button>` apply their own component chrome and should be used only
when that appearance is wanted. UIKit numeric layout values are centimeters,
and the surface front is local `+Z`. If a same-URL UIKitML edit looks stale,
reload the managed browser once and rerender; do not add cache-probe content or
inspect package source. Do not inspect `node_modules`, generated declarations,
or package exports to reconfirm these contracts; use the compiler or one focused
reference query only if a concrete call fails.

Use the common scene interaction payloads directly:
`"OneHandGrabbable": {}` for nearby squeeze manipulation and
`"RayInteractable": {}` for ray activation. `Grabbed` and `GrabSystem` are
public top-level exports; `Grabbed` is a transient tag managed by `GrabSystem`,
and `forceRelease(entity)` is its supported release method. These contracts do
not require package-source or declaration inspection.

For visual state changes, mutate project-owned mesh materials/transforms and
UIKit text or styles. When the experience needs a large environmental change,
author that backdrop, light, particle field, or focal surface as a project-owned
asset, give its scene node a project component, and mutate it through a normal
system query. Do not reach through `world.activeLevel`, `LevelRoot`,
`EnvironmentSystem`, or root `DomeGradient`/IBL internals merely to make a state
look different. Project-owned lighting, color, particles, geometry, and panel
feedback are sufficient and portable.

## Validate and review

Typecheck the complete first slice before starting the managed editor. Reuse one
command-ready session; do not launch a separate browser or custom renderer.

Compose the initial product view for the app's ordinary starting player pose,
not only for an authored camera or a headset pose moved during testing. Keep the
required anchors in a comfortable forward field of view and interaction range.
In the stock scaffold, the starting viewer is near `[0, 1.6, 0]` and looks down
negative Z: primary no-locomotion content normally belongs around `z = -0.5` to
`-2.5`. Positive Z is behind the player. Do not place the main interaction
surface or required hero anchors there and rely on the user turning around.
After any diagnostic camera or headset movement, return to the starting pose and
verify one live frame there. Initial, progress, and completion evidence should
use the same useful product viewpoint unless the state itself requires a small
change; do not make visual quality depend on a one-off inspection pose. If that
starting-pose frame omits a required primary anchor or shows mostly empty space,
correct authored transforms before continuing with behavior testing.

For the direct path:

1. render the authored hero view once with `viewId`:

   ```bash
   npx iwsdk scene render-file \
     --input-json '{"path":"public/scenes/main.iwsdk.scene.json","viewId":"hero"}' \
     --output-file artifacts/scene-hero.png
   ```

2. inspect one alternate built-in or authored diagnostic view only when it can
   reveal scale, contact, or occlusion problems hidden by the hero view;
3. make one batched correction and rerender only the affected final view;
4. open the final scene only if live editor collaboration or state inspection is
   required.

For the modular path, validate modules that own meaningful independent geometry,
then the composition root. Flatten once after the root passes. Never open an
import-bearing scene as the runtime/editable document, and never re-flatten over
later human edits.

Use `view` only for built-in presets such as `front`, `top`, `quarter`, or
`orbit`; use `viewId` for a camera declared in `authoring.views`. Check the
default immersive player viewpoint separately when the experience runs in XR.
The command above is the supported file-render path. Do not redirect its JSON
to scratch files, copy screenshots out of temporary directories, parse nested
result payloads, or call `render-file --help` after it succeeds.
The authored hero view and the tracked XR player are separate evidence. Do not
temporarily edit the project camera, restart the runtime, or manufacture a
browser view solely to make a live screenshot duplicate the hero framing.

Default visual budget: at most three scene renders, two compact image reads, and
one correction round for the direct path. Expand only to diagnose a specific
failed acceptance criterion. Do not rerender every node or asset independently,
repeat successful status/capability probes, or turn review into an open-ended
camera search.

For stateful scenes, prove progression, rejection, recovery, and completion
with component values, entity transforms, and interaction results. Save any
required initial/progress/completion runtime screenshots, but do not read each
raw PNG, move the headset solely to inspect transient text, or repeatedly chase
a short-lived visual state. If a human-facing sanity check is still useful,
inspect one compact final contact sheet and stop when it has no blocking defect.

Use these common verification forms directly instead of opening CLI help:

```bash
npx iwsdk xr select --input-json '{"device":"controller-right","duration":0.15}'
npx iwsdk ecs query --input-json '{"entityIndex":12}'
npx iwsdk browser screenshot --output-file artifacts/state.png
```

The final visual gate checks:

- required anchors are present, recognizable, supported, and correctly scaled;
- the composition has useful depth and intentional negative space;
- materials, color, environment, and lighting form one coherent visual language;
- hero and required diagnostic views are nonblank and avoid severe clipping or
  occlusion;
- runtime framing remains valid and no starter content survives unintentionally.

Finish only when the final scene validates, manifest IDs resolve, the production
build passes, and required visual checks pass. Do not create provenance reports,
design decks, or review documents unless the user requests them; concise final
evidence is enough.
