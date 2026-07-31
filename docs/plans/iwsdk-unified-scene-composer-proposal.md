# IWSDK Unified Scene Composer Proposal

Status: proposal

Scope: static scene composition with native IWSDK scene JSON, the managed
workspace editor, declared assets, editable primitives, default PBR materials,
application-registered scene resources, deterministic review views, and runtime
verification.

Non-goals for the first version: animation, interaction authoring, skeletal
characters, a human-facing material editor, arbitrary code embedded in scene JSON,
photogrammetry, and guaranteed reconstruction of hidden geometry. Application code
may register a custom material or geometry provider through the typed extension
boundary described below.

## Executive Recommendation

Replace the image-only workflow with one `iwsdk-scene-composer` skill that accepts
three input modes:

- text: compose a scene from a written description;
- image: reconstruct the visible composition of one or more references;
- hybrid: use text as intent and images as layout, identity, or style evidence.

Keep the product as a skill accompanying the editor. Do not add a new package.

Split the workflow into two parts and five stages:

### Part A: Specify

1. **Brief** - normalize text/images, determine feasibility, record requirements,
   assumptions, references, target devices, and acceptance features.
2. **Compile** - generate and validate one typed, executable IWSDK scene document.

### Part B: Compose

3. **Materialize** - apply the scene document to the shared editor session as one
   atomic, revision-checked transaction.
4. **Review and refine** - inspect the complete scene through layout, geometry, and
   final-look lenses; make at most two focused correction rounds.
5. **Publish** - save, reload the app runtime, prove document/runtime parity,
   measure rendering cost, and retain compact evidence.

The critical design decision is that Part A must not produce a prose plan that a
later agent independently reinterprets. Its output must be the same declarative
authoring document that the editor owns. The document contains both typed authoring
intent and an executable scene graph. Publishing derives a canonical runtime
projection by removing editor-only authoring data; the runtime never receives
prompts, source images, annotations, assumptions, or review history.

The editor records two SHA-256 identities over canonical serialization:

- `documentHash` identifies the complete authoring document;
- `runtimeHash` identifies the derived runtime projection.

This is one source of truth with two explicit views, not two independently authored
formats. Screenshots, reviews, transactions, and runtime parity must name the hash
they prove.

## Product Boundary: One Document, Two Audiences

The managed editor is a general IWSDK scene editor, not an image-reconstruction
application. The human and agent surfaces intentionally expose different portions of
the same document.

The human editor exposes:

- one collapsible scene graph;
- selection, framing, transform gizmos, and transform fields;
- one **Assets** palette containing project glTF models, built-in primitive templates,
  and application-registered geometry assets;
- component assignment and component payload editing;
- camera/navigation, save, undo, and redo.

The human editor does not expose composition briefs, source images, feature contracts,
assumptions, review evidence/history, scene-resource tables, material parameters, or
material creation. Those remain available through the scene document and agent/MCP
tools. Hiding them is a product boundary, not a loss of authoring capability.

The agent surface retains the complete typed document, capability discovery, atomic
transactions, screenshots, review captures, render statistics, and publish proof. It
can author materials, geometry recipes, lights, environments, and hidden workflow
metadata without turning each capability into permanent editor UI.

## Runtime Resource Registration Boundary

Do not move every generated PBR material into handwritten application code. A closed
PBR recipe in scene data is portable, deterministic, hashable, and already becomes a
Three.js material only at runtime. Keep that built-in path and remove its human UI.

Add a second, application-registered path for forms the built-in contract cannot
express, especially custom shader materials and custom geometry. Registration is a
per-`World` service supplied before the world's initial level load; it does not extend
the static `AssetManager`:

```ts
World.create(container, {
  sceneResources: [
    defineSceneResources((resources) => {
      resources.registerMaterial({
        id: 'app/velvet',
        version: '1.0.0',
        parameters: velvetParameterSchema,
        create: (context, parameters) =>
          createVelvetMaterial(context, parameters),
      });
      resources.registerGeometry({
        id: 'app/chair-shell',
        version: '1.0.0',
        parameters: chairShellParameterSchema,
        bounds: chairShellBounds,
        create: (context, parameters) =>
          createChairShellGeometry(context, parameters),
      });
    }),
  ],
});
```

The scene stores only a runtime-retained provider binding plus validated JSON
parameters. The binding contains provider ID, version, parameter-schema hash, and an
implementation-manifest hash, so the runtime projection and `runtimeHash` pin the
provider rather than relying on authoring provenance that projection removes. Scene
JSON never stores executable JavaScript, a provider-module URL, or shader source.

Registration is world-scoped rather than global. A trusted Vite option or virtual
aggregator loads the same application-configured provider modules before the managed
editor creates its world and before the application loads its first level. Provider
module URLs never come from scene data. Capability discovery reports provider IDs,
versions, parameter schemas, preview/instancing support, conservative geometry
bounds, and implementation hashes. Publish proof compares the live editor and runtime
provider-manifest hashes as well as the document/runtime hashes.

Providers are trusted application code with normal DOM, network, and WebGL authority;
this is an extension boundary, not a sandbox. Core owns pooling, reference counts,
transaction commit/rollback, and instancing decisions. Each provider returns a
core-owned lease with idempotent disposal and declares clone/instance policy.
Geometry providers declare deterministic conservative bounds, and preflight verifies
finite output attributes, byte limits, actual-bound containment, and any vertex
displacement expansion. Material leases must dispose custom textures, uniforms, and
render targets; scanning built-in material properties is insufficient.

Geometry providers may opt into the human Assets palette with a label, preview
descriptor, and validated default parameters. Material providers never need human
editor controls. Built-in primitive recipes and built-in PBR recipes use the same
internal provider contract, so this extension does not create a second lowering
path. Provider definitions may be shared, but created materials/geometries may never
be cross-world singletons. HMR requires staged scene reload or world recreation.

The minimal closed-schema extension keeps registered materials in
`resources.materials` and registered geometry inline where primitive geometry lives:

```ts
type SceneProviderBinding = {
  id: string;
  version: string;
  parameterSchemaHash: Sha256;
  implementationHash: Sha256;
};

type SceneRegisteredMaterial = {
  id: string;
  model: 'provider';
  provider: SceneProviderBinding;
  parameters: JsonObject;
};

type SceneRegisteredGeometry = {
  type: 'provider';
  provider: SceneProviderBinding;
  parameters: JsonObject;
  bounds: SceneBounds;
};
```

Bound parameter nesting, array lengths, property counts, and serialized bytes before
calling provider code. Providers must create resources with IWSDK's Three.js runtime
instance or expose a core brand; raw `instanceof Material` checks are unsafe across
duplicate Three.js copies.

This should be introduced after the current editor interaction fixes. It extends the
working workflow without requiring an immediate scene-format rewrite or making an
agent-generated scene depend on generated TypeScript for ordinary PBR materials.

## Why The Current Garden Experiment Should Not Be Productized As-Is

The garden study proved that the general reconstruction loop is valuable, but it
also exposed unnecessary ceremony and a broken handoff:

- The upstream object admission gate rejected a legitimate full-frame environment.
- The study introduced `garden.scene-study.v1`, but its geometry fields are prose
  such as `curve-aligned stones` rather than executable recipes.
- The 984-line Three.js implementation does not import or compile the scene spec.
  The spec and implementation can drift without detection.
- The custom validator checks component counts, hard-coded node IDs, and pass order,
  not whether the scene can be materialized.
- Material scripts classified the dog and patio as manufactured finishes. Their
  outputs were preserved and then manually rejected.
- Seven incomplete build-pass reviews and seven correction renders produced a large
  audit trail without reaching the selected fidelity target.
- Fidelity and camera-confidence decimals were agent judgments presented with more
  precision than their method supported.
- Draw calls were budgeted but never measured.

Those are findings about the garden adaptation, not a claim that upstream
img2threejs lacks engineering gates. Current upstream v1.3.0 adds deterministic
reference admission, strict spec checks, Tier-1 image diagnostics, a multi-signal
"Divine Eye," multi-angle collapse detection, feature-level acceptance, artifact
caching, and a terminating correction-loop state machine. The IWSDK design should
reuse the appropriate invariants without importing object/character-specific rules.

The reusable ideas are narrower:

- establish feasibility and explicit uncertainty before building;
- name the features that make the scene recognizable;
- use stable IDs and a structured scene hierarchy;
- build or inspect coarse-to-fine;
- keep a fixed hero view and alternate diagnostic views;
- distinguish plan defects from implementation defects;
- bound the correction loop;
- prove the saved scene in the actual runtime.

## Current IWSDK Foundation

The uncommitted editor/schema work already provides a credible foundation:

- `iwsdk.scene.v1` nodes, hierarchy, assets, transforms, typed components,
  metadata, and editor metadata;
- box, sphere, cylinder, cone, and plane primitives;
- inline standard/basic scalar materials with color, roughness, metalness,
  opacity, emissive values, material side, flat shading, and shadow flags;
- a real IWSDK WebGL editor viewport with orbit controls, transform controls,
  selection helpers, a grid, asset loading, primitive inspection, and save/reload;
- shared human and agent command history with undo/redo and conflict detection;
- named and explicit editor camera poses plus fixed-resolution PNG screenshots;
- native scene import into the app runtime and editor/runtime parity tests.

Focused verification on the current worktree passed:

- 20 scene-composition tests;
- 27 targeted core importer, primitive, and scene-tool tests;
- 29 editor session and save/reload/runtime-parity tests, including the primitive
  city-block E2E case.

This is more than a placeholder. It is already a functional primitive blockout and
glTF-placement editor. It is not yet expressive or hardened enough to be the full
scene-generation IR.

## Current Gaps That Block The Unified Workflow

### Schema and validation

- The exported JSON Schema is closed, but the handwritten runtime validator accepts
  undeclared top-level, node, and transform fields. Invalid asset types also pass.
- `placeOn` cycles and self-references validate, then fail during import.
- Primitive support was added while the version remains `iwsdk.scene.v1`. The release
  history must determine whether this is an unreleased v1 draft or a compatibility
  break. A published v1 must be frozen; the local primitive-bearing draft cannot
  silently redefine it.
- Component schemas describe payloads but do not prove that the runtime registered
  the corresponding component.
- Level replacement destroys the old level before the new document has loaded
  transactionally.

### Expressiveness

- Materials are repeated inline; there is no reusable material resource library.
- There are no first-class scene lights, saved review cameras, environment/fog, or
  renderer settings in the scene schema.
- There are no prefabs, reusable primitive subtrees, instances, or deterministic
  patterns. Hundreds of flowers or fence boards therefore require hundreds of
  nodes and cannot become `InstancedMesh` automatically.
- The five primitives cannot express polygonal paving, swept branches, or capsules
  without awkward approximations.
- Image/audio/video asset types are accepted by the schema, but non-glTF renderable
  nodes currently become empty runtime objects.
- Group bounds are not aggregated, limiting reliable placement and alignment.

### Authoring and review

- The image-composer contract is stored in an untyped `editor.imageComposition`
  object, and its documented example omits several fields the skill declares
  mandatory.
- `scene_list_assets` lists resources already declared in the open document. It is
  not a searchable project/catalog asset registry, so an agent cannot yet discover
  arbitrary reusable assets from it.
- Agent review tooling does not yet provide an independent perceptual critic or a
  calibrated reference-comparison metric. This belongs in agent tooling, not the
  general-purpose editor UI.
- Hero camera state is not a first-class saved view.
- `scene_compare_screenshots` tests byte equality only. It does not compare a
  screenshot with a source image or measure semantic similarity.
- There is no atomic multi-patch transaction for materializing a large scene as one
  undoable operation.
- There is no agent-facing renderer profile containing real draw calls, triangles,
  textures, shadow casters, and frame timing.
- There is no generator-to-human-edit rebase model. Re-running generation risks
  overwriting hand edits unless stable-ID conflicts are detected.
- Current revision identity is based on file time and size. It cannot prove that two
  documents or runtime projections contain the same content.

## The Simplified Five-Stage Workflow

## Stage 1: Brief

Purpose: convert any supported input into the same typed composition contract.

### Text input

Extract:

- required objects and relationships;
- target mode: browser, VR, AR, or shared;
- style and material intent;
- desired scale or a conventional scale anchor;
- camera/view intent when provided;
- explicit exclusions;
- asset policy selected only from reported capabilities: declared assets, primitives,
  and, in a later version, generated static assets.

Text requirements are design intent, not observations. There is no source-fidelity
score and no camera-confidence score.

The first composer operates inside an already configured IWSDK application. A
requested browser/VR/AR surface constrains review and content, but the skill does not
silently reconfigure `World.create`, tracking origin, AR anchoring, or application
interaction policy.

### Image input

Record:

- technical readability and source provenance;
- visible semantic objects and spatial relationships;
- critical silhouette, overlap, count, palette, and lighting observations;
- normalized reference regions or points only for critical features;
- camera hypothesis as a range or fit result, not an arbitrary probability;
- hidden depth, unseen surfaces, and physical material values as assumptions.

Do not use foreground-coverage admission as a scene gate. Do not treat whole-image
PBR extraction as physical truth. Material analysis is optional evidence and never
authoritative.

### Hybrid input

Text has authority over requested content and behavior. Images have roles:

- `layout` - placement and proportions;
- `identity` - recognizable object features;
- `palette` - broad color and value grouping;
- `style` - rendering character only.

Conflicts must be resolved explicitly in the contract rather than silently choosing
one source.

### Feasibility result

Use categorical output:

- `supported` - current schema/assets can represent all required features;
- `conditional` - required simplifications are named and accepted;
- `blocked` - a required feature has no supported representation or evidence.

Avoid default decimal fidelity and confidence values. When measurable image anchors
exist, record their actual errors later. Otherwise use `high`, `medium`, or `low`
certainty on individual assumptions.

## Stage 2: Compile

Purpose: emit the executable scene specification.

"Compile" names a workflow boundary, not an image-to-scene algorithm. The skill's
agent interprets the text/image evidence and authors the typed document. Editor and
schema tools provide capabilities, templates, canonicalization, validation,
transactions, rendering, and measurements; they do not claim to infer semantic
objects or geometry deterministically.

The compiler is target-aware. It queries editor capabilities, asset IDs, component
schemas, primitive types, material features, target surface, and any calibrated
device profile before it finalizes the document. Unsupported representations fail
validation instead of appearing as prose geometry strategies.

The current asset tool is scene-local. Until IWSDK has a searchable project asset
registry, compilation is limited to primitives, explicit user-provided asset IDs,
and assets already declared in the scene. A compiler must never invent a catalog ID.

The output contains:

- typed source and composition contract;
- reusable assets, materials, and prefabs;
- saved authoring/review views;
- environment and lighting;
- the complete stable-ID scene graph;
- deterministic patterns or explicit instances;
- feature-to-node bindings and immutable acceptance criteria;
- assumptions and performance limits;
- optional reference screen anchors for measurable layout review.

Validation reports distinct lifecycle states rather than one overloaded `valid` bit:

1. `schemaValid` - the document matches one authoritative closed schema;
2. `capabilityCompatible` - every construct is supported by a named capability
   snapshot containing the SDK version and component-schema hashes;
3. `resourcesReady` - referenced resources pass local existence checks or remote
   preflight in the target environment;
4. `editorCommitted` - detached editor-preview instantiation succeeded and the
   transaction became the live editor document and viewport state;
5. `runtimeProven` - after publish, the configured application runtime loaded the
   same `runtimeHash` and passed its screenshot/log/parity gates.

Semantic diagnostics for references, cycles, feature coverage, placement, and
resource declarations are produced before preflight. Network fetches and app-level
component registration mean schema validity alone can never guarantee importability.

Compilation provenance records input content hashes, skill/adapter version, and the
capability-snapshot hash. Cached intake or compile artifacts are reusable only when
those keys match; an edited tool or changed runtime capability invalidates them.

Each feature criterion has a stable ID and a typed check kind such as `presence`,
`count`, `projected-region`, `spatial-relation`, or `visual-judgment`. The criterion
and tolerance live in the authoring document; mutable pass/fail status, observations,
and waivers live in the review sidecar keyed to the document hash.

There should be no arbitrary minimum component count and no required fixed pass
count. A scene with three correct nodes is better than one padded to sixteen.

## Stage 3: Materialize

Purpose: move the complete document into the shared editor/runtime surface.

Materialization has explicit ownership modes:

- `replace-new` creates or replaces a whole generated scene. This is the MVP default.
- `merge-under-root` owns exactly one generated root in an existing scene and leaves
  all nodes outside that root untouched. This requires an explicit root ID and is a
  later capability.

There is no implicit field-level merge and no promise to preserve arbitrary
"unrelated" nodes during replacement.

Each materialization uses a two-phase transaction:

1. compare `expectedBaseDocumentHash` with the live document (`null` for a new scene),
   compute the canonical candidate hash, and verify an optional independently supplied
   `candidateDocumentHash` assertion;
2. clone and patch a staged document without mutating live state;
3. run schema, semantic, capability, and resource-preflight checks;
4. preload resources and instantiate a detached editor-preview IWSDK scene;
5. validate the staged hierarchy, stable IDs, components, and renderer state;
6. commit the document and editor-preview scene together as one undo entry;
7. on any failure, dispose staged resources and leave the live scene unchanged.

The full document is materialized once. A layout lens can hide detail for an early
inspection without creating a second partial implementation or a separate scene
revision.

After a human edit, the saved authoring document is authoritative. The MVP refuses
to overwrite a changed generated scene: regeneration must target a new scene or use
an explicit whole-scene replacement. A future three-way rebase requires the exact
base generated snapshot and defined merge semantics for resources, hierarchy,
renames, deletes, ordering, and fields; stable IDs alone are insufficient.

## Stage 4: Review And Refine

Purpose: retain the diagnostic benefits of passes without maintaining many partial
scene implementations.

The editor provides review lenses over the same complete scene:

- **Layout lens:** macro nodes, bounds, support contacts, and top/front views.
- **Geometry lens:** all geometry with neutral material and lighting.
- **Final lens:** authored materials, lights, environment, and saved hero view.

The gates remain ordered: layout must pass before geometry, and geometry before final
look. Evidence is immutable and hash-bound. A layout-affecting correction invalidates
layout, geometry, and final evidence; a geometry correction invalidates geometry and
final; a material/light/environment correction invalidates final. The editor may
recapture unaffected lenses cheaply, but it never relabels evidence from an older
document hash as proof of the new document.

For image inputs, optionally show the source in a split panel or as a non-runtime
overlay. Critical features can include normalized reference rectangles or points.
The editor projects bound node groups into the hero view and reports measurable
center/extent deltas. These are diagnostics, not a universal perceptual score.

Review is deterministic-first, following the useful upstream hierarchy:

1. prove the document/runtime hashes, exact view, dimensions, nonblank pixels, and
   absence of renderer errors;
2. run only applicable scene metrics, such as projected feature center/extent error,
   support/contact gaps, count checks, and alternate-view collapse;
3. package the source/render pair and deterministic report for agent visual judgment;
4. require every critical feature to pass independently of any overall judgment.

Object-mask IoU, SSIM, pHash, and edge overlap can be reported for isolated crops or
well-aligned synthetic fixtures. They are not hard gates for arbitrary full-frame
environments until calibrated on scene data.

For every review:

1. validate the document;
2. capture hero, top, front/side, and quarter views as applicable;
3. inspect required features as `pass`, `partial`, `fail`, or `not-applicable`;
4. identify the single highest-impact defect;
5. classify it as contract, resource, scene, camera, or runtime;
6. apply one focused atomic correction transaction;
7. rerender.

Default limit: two correction rounds. Stop early on a repeated defect, oscillation,
plateau, a required missing asset/reference, or a gap beyond the declared
representation policy. More rounds require an explicit higher ceiling; a hard
ceiling and token budget remain non-bypassable.

Numeric scoring is optional. It is allowed only when the rubric and calculation are
stored and reproducible. A feature checklist plus actual anchor errors is the default.

## Stage 5: Publish

Purpose: prove that the saved human-editable scene is the scene the application runs.

The concrete gate is `scene_publish({reviewPath, representativeNodeIds?})`. It
refuses a dirty or unsaved scene and requires the exact path of a current immutable
review with a `pass` result, or `accepted-with-gaps` backed by literal user-authorized
waivers. It reloads the managed application runtime before collecting evidence.

Required gates:

- schema, capability, and resource-preflight states pass;
- every required feature is `pass`, or the user explicitly publishes an
  `accepted-with-gaps` result that lists the waived features;
- all resources resolve;
- editor screenshot is nonblank and free of render errors;
- saved scene reloads in the editor with the same stable IDs and resource bindings;
- app runtime reports the same `runtimeHash` as the published projection;
- representative node transforms, primitive descriptors, material references, and
  component values match between document and runtime;
- runtime screenshot is nonblank and logs contain no scene-load, shader, WebGL, or
  material errors;
- raw render cost and measurement environment are recorded; any device-profile
  pass/fail is used only when that profile has an owner and calibrated thresholds.

The gate persists a content-addressed runtime capture and immutable proof report. The
report records `runtimeProven: passed | failed`, current hashes, representative and
required-node parity checks, the post-reload log window, and the measurement
environment. Any failed or incomplete check produces `failed`; it cannot be reported
as a successful publish.

Default retained evidence should be compact:

- final `*.iwsdk.scene.json`;
- source references already named by the document;
- one review JSON keyed to `documentHash` and `runtimeHash`;
- hero and required diagnostic screenshots;
- runtime parity and measured-cost report.

Exhaustive intermediate crops, every partial render, and a process deck should be
opt-in audit artifacts, not the default workflow.

### Review evidence sidecar

Review state is a second fixed schema, not arbitrary log JSON. A record is immutable,
names the scene revision it evaluates, and contains no executable scene state:

```json
{
  "version": "iwsdk.scene-review.v1",
  "documentHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "runtimeHash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "capabilityHash": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "sourceHashes": [
    "sha256:d05d6f4cbb7459ae63cefbb3929af25375392d940b63ff460be36a842db5b9c8"
  ],
  "round": 1,
  "result": "pass",
  "lenses": [
    {
      "id": "layout",
      "status": "pass",
      "captures": [
        {
          "id": "layout-hero",
          "view": "hero",
          "path": "./evidence/layout-hero.png",
          "screenshotSha256": "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          "width": 1280,
          "height": 720,
          "camera": {
            "projection": "perspective",
            "position": [0, 1.48, -1.65],
            "target": [0, -1, 7.35],
            "fov": 41
          },
          "rendererEnvironment": {
            "browser": "...",
            "gpu": "...",
            "pixelRatio": 1
          },
          "visibleNodeIds": [
            "patio",
            "chair-left",
            "chair-right",
            "table",
            "dog",
            "flower-bed-left"
          ]
        }
      ]
    },
    {
      "id": "geometry",
      "status": "pass",
      "captures": [
        {
          "id": "geometry-hero",
          "view": "hero",
          "path": "./evidence/geometry-hero.png",
          "screenshotSha256": "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          "width": 1280,
          "height": 720,
          "camera": {
            "projection": "perspective",
            "position": [0, 1.48, -1.65],
            "target": [0, -1, 7.35],
            "fov": 41
          },
          "rendererEnvironment": {
            "browser": "...",
            "gpu": "...",
            "pixelRatio": 1
          },
          "visibleNodeIds": [
            "patio",
            "chair-left",
            "chair-right",
            "table",
            "dog"
          ]
        }
      ]
    },
    {
      "id": "final",
      "status": "pass",
      "captures": [
        {
          "id": "final-hero",
          "view": "hero",
          "path": "./evidence/final-hero.png",
          "screenshotSha256": "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          "width": 1280,
          "height": 720,
          "camera": {
            "projection": "perspective",
            "position": [0, 1.48, -1.65],
            "target": [0, -1, 7.35],
            "fov": 41
          },
          "rendererEnvironment": {
            "browser": "...",
            "gpu": "...",
            "pixelRatio": 1
          },
          "visibleNodeIds": [
            "patio",
            "chair-left",
            "chair-right",
            "table",
            "dog",
            "flower-bed-left"
          ]
        }
      ]
    }
  ],
  "featureResults": [
    {
      "feature": "seating-cluster",
      "criterion": "seating-count",
      "status": "pass",
      "evidenceRefs": ["layout-hero"],
      "observation": "3 bound nodes present"
    },
    {
      "feature": "seating-cluster",
      "criterion": "seating-read",
      "status": "pass",
      "evidenceRefs": ["layout-hero"],
      "observation": "chairs and table read as one cluster"
    },
    {
      "feature": "lying-dog",
      "criterion": "dog-presence",
      "status": "pass",
      "evidenceRefs": ["layout-hero"],
      "observation": "dog node visible in front of chairs"
    },
    {
      "feature": "patio-and-path",
      "criterion": "patio-presence",
      "status": "pass",
      "evidenceRefs": ["layout-hero"],
      "observation": "patio node visible"
    },
    {
      "feature": "flower-border",
      "criterion": "flower-count",
      "status": "pass",
      "evidenceRefs": ["layout-hero"],
      "observation": "pattern expands to 120 instances"
    }
  ],
  "waivers": [],
  "stop": { "reason": "success", "openDefectTags": [] }
}
```

The sidecar schema is closed. An overall `pass` requires every configured lens and
required feature criterion to pass. Criterion statuses are restricted to
`pass | partial | fail | not-applicable`; evidence references must resolve, and an
explicit user-authored waiver is required to publish any required criterion that is
not `pass`. A new scene hash creates a new review record; old evidence remains history
and is never silently rebound.

## Proposed Authoring Document And Runtime Projection

`iwsdk.scene.v1` is the sole scene contract. It has not shipped as an external
compatibility boundary, so the rich authoring document replaces the earlier local
draft directly instead of introducing a second version or migration layer. It must be
frozen before release, after every declared resource and node variant has stable
validators, editor controls, runtime lowering, and cleanup behavior. Breaking changes
after that release require a future schema version; they do not mutate released v1.

The candidate authoring document below is one closed, discriminated schema. Its
optional `authoring` branch is available to agent tools but is not rendered in the
human editor and is removed by canonical runtime projection. All references in this
complete example resolve. Hashes are computed over canonical serialization and
stored in revision/evidence records, not inside the self-hashed document.

| Branch             | Runtime | Contract                                                                                 |
| ------------------ | ------- | ---------------------------------------------------------------------------------------- |
| `version`, `units` | yes     | Required literals selecting immutable schema semantics                                   |
| `componentSchemas` | yes     | Typed component payload declarations, checked against the app capability snapshot        |
| `metadata`         | yes     | Opaque extension data preserved for compatibility; namespaced keys are required          |
| `authoring`        | no      | Optional agent-only brief, references, features, review views, and assumptions           |
| `resources`        | yes     | Closed, discriminated assets/materials/prefabs with stable IDs                           |
| `environment`      | yes     | Optional background, fog, lighting context, and renderer settings with cleanup semantics |
| `nodes`            | yes     | Ordered hierarchy of globally unique node IDs, typed content, transforms, and components |

Every structural branch uses `additionalProperties: false`. Document/node `metadata`
values are explicitly typed opaque JSON maps and are the only open extension points.
Node IDs are globally unique;
resource IDs are unique across the resource namespace; prefab node IDs are local to
their prefab. `children` preserve order. Every content reference, feature binding,
view reference, material reference, and component schema reference must resolve.

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "componentSchemas": [],
  "metadata": {},
  "authoring": {
    "composition": {
      "mode": "static",
      "input": {
        "kind": "hybrid",
        "prompt": "A quiet garden seating area with two chairs and a dog",
        "references": [
          {
            "id": "garden-reference",
            "uri": "./references/garden.png",
            "roles": ["layout", "identity", "palette"],
            "width": 1536,
            "height": 1024,
            "sha256": "d05d6f4cbb7459ae63cefbb3929af25375392d940b63ff460be36a842db5b9c8"
          }
        ]
      },
      "target": {
        "surfaces": ["browser", "vr"],
        "style": "stylized-pbr",
        "assetPolicy": "declared-assets-and-primitives"
      },
      "representationPolicy": {
        "fidelityCeiling": "stylized-blockout",
        "allowed": ["asset", "prefab", "pattern"],
        "acceptedApproximations": [
          {
            "feature": "lying-dog",
            "requested": "recognizable lying golden dog",
            "implementation": "capsule body blockout without fur or anatomy",
            "status": "accepted"
          },
          {
            "feature": "seating-cluster",
            "requested": "two slatted wooden garden chairs",
            "implementation": "box-based chair massing without individual slats",
            "status": "accepted"
          }
        ]
      },
      "features": [
        {
          "id": "seating-cluster",
          "priority": "required",
          "description": "Two weathered chairs and a low table",
          "nodeRefs": ["chair-left", "chair-right", "table"],
          "acceptance": [
            {
              "id": "seating-count",
              "kind": "count",
              "nodeRefs": ["chair-left", "chair-right", "table"],
              "equals": 3
            },
            {
              "id": "seating-read",
              "kind": "visual-judgment",
              "view": "hero",
              "criterion": "Two chairs and one low table read as one seating cluster"
            }
          ],
          "evidence": [
            {
              "reference": "garden-reference",
              "region": [0.07, 0.24, 0.37, 0.35]
            }
          ]
        },
        {
          "id": "lying-dog",
          "priority": "required",
          "description": "A golden dog lies in front of the chairs",
          "nodeRefs": ["dog"],
          "acceptance": [
            {
              "id": "dog-presence",
              "kind": "presence",
              "nodeRefs": ["dog"],
              "view": "hero"
            }
          ]
        },
        {
          "id": "patio-and-path",
          "priority": "required",
          "description": "A broad flagstone patio anchors the scene",
          "nodeRefs": ["patio"],
          "acceptance": [
            {
              "id": "patio-presence",
              "kind": "presence",
              "nodeRefs": ["patio"],
              "view": "hero"
            }
          ]
        },
        {
          "id": "flower-border",
          "priority": "required",
          "description": "A repeated flower border frames the seating",
          "nodeRefs": ["flower-bed-left"],
          "acceptance": [
            {
              "id": "flower-count",
              "kind": "count",
              "pattern": "flower-bed-left",
              "minimum": 100
            }
          ]
        }
      ],
      "assumptions": [
        {
          "id": "garden-depth",
          "statement": "Hidden garden depth is inferred from one view",
          "certainty": "low"
        }
      ],
      "review": {
        "heroView": "hero",
        "requiredViews": ["hero", "top"],
        "lenses": ["layout", "geometry", "final"],
        "maxCorrectionRounds": 2
      }
    },
    "nodeAnnotations": [
      {
        "node": "patio",
        "featureRefs": ["patio-and-path"],
        "reviewLayer": "layout"
      },
      {
        "node": "flower-bed-left",
        "featureRefs": ["flower-border"],
        "reviewLayer": "final"
      }
    ],
    "views": [
      {
        "id": "hero",
        "role": "hero",
        "projection": "perspective",
        "position": [0, 1.48, -1.65],
        "target": [0, -1, 7.35],
        "fov": 41
      },
      {
        "id": "top",
        "role": "diagnostic",
        "projection": "orthographic",
        "position": [0, 18, 7],
        "target": [0, 0, 7],
        "height": 18
      }
    ]
  },
  "components": {
    "com.iwsdk.components.DomeGradient": {
      "sky": [0.796078, 0.835294, 0.756863, 1],
      "equator": [0.796078, 0.835294, 0.756863, 1],
      "ground": [0.796078, 0.835294, 0.756863, 1]
    }
  },
  "resources": {
    "assets": [],
    "materials": [
      {
        "id": "weathered-wood",
        "model": "standard",
        "baseColor": "#756b5a",
        "roughness": 0.86,
        "metalness": 0
      },
      {
        "id": "foliage-mid",
        "model": "standard",
        "baseColor": "#4f7134",
        "roughness": 0.9,
        "metalness": 0
      },
      {
        "id": "flagstone",
        "model": "standard",
        "baseColor": "#77736a",
        "roughness": 0.94,
        "metalness": 0
      },
      {
        "id": "flower-white",
        "model": "standard",
        "baseColor": "#f2efe3",
        "roughness": 0.82,
        "metalness": 0
      },
      {
        "id": "dog-gold",
        "model": "standard",
        "baseColor": "#9b6335",
        "roughness": 0.9,
        "metalness": 0
      }
    ],
    "prefabs": [
      {
        "id": "simple-flower",
        "root": {
          "id": "flower-root",
          "content": {
            "type": "primitive",
            "geometry": {
              "type": "sphere",
              "radius": 0.04,
              "segments": 8
            },
            "material": "flower-white"
          }
        }
      }
    ]
  },
  "environment": {
    "fog": { "type": "linear", "near": 16, "far": 34 },
    "toneMapping": "aces",
    "exposure": 1.1
  },
  "nodes": [
    {
      "id": "sun",
      "name": "Warm sun",
      "components": {
        "com.iwsdk.components.DirectionalLight": {
          "color": [1, 0.839, 0.627, 1],
          "intensity": 2.2,
          "castShadow": true
        }
      },
      "transform": {
        "position": [8, 12, 8],
        "rotationDeg": [50, -44, 0]
      }
    },
    {
      "id": "patio",
      "name": "Flagstone patio",
      "content": {
        "type": "primitive",
        "geometry": { "type": "box", "size": [9, 0.08, 8] },
        "material": "flagstone",
        "receiveShadow": true
      },
      "transform": { "position": [0, 0, 4.5] }
    },
    {
      "id": "chair-left",
      "name": "Left chair blockout",
      "content": {
        "type": "primitive",
        "geometry": { "type": "box", "size": [0.8, 1.1, 0.85] },
        "material": "weathered-wood",
        "castShadow": true
      },
      "transform": { "position": [-0.75, 0.59, 3.6], "rotationDeg": [0, 12, 0] }
    },
    {
      "id": "chair-right",
      "name": "Right chair blockout",
      "content": {
        "type": "primitive",
        "geometry": { "type": "box", "size": [0.8, 1.1, 0.85] },
        "material": "weathered-wood",
        "castShadow": true
      },
      "transform": {
        "position": [0.85, 0.59, 3.75],
        "rotationDeg": [0, -10, 0]
      }
    },
    {
      "id": "table",
      "name": "Low round table",
      "content": {
        "type": "primitive",
        "geometry": { "type": "cylinder", "radius": 0.5, "height": 0.52 },
        "material": "weathered-wood",
        "castShadow": true
      },
      "transform": { "position": [0.05, 0.3, 3.1] }
    },
    {
      "id": "dog",
      "name": "Lying dog blockout",
      "content": {
        "type": "primitive",
        "geometry": { "type": "capsule", "radius": 0.3, "length": 0.9 },
        "material": "dog-gold",
        "castShadow": true
      },
      "transform": {
        "position": [0, 0.34, 2.25],
        "rotationDeg": [0, 0, 90],
        "scale": [1, 1, 0.72]
      }
    },
    {
      "id": "flower-bed-left",
      "name": "Left flower scatter",
      "content": {
        "type": "pattern",
        "prefab": "simple-flower",
        "distribution": {
          "type": "scatter",
          "count": 120,
          "seed": 1847,
          "algorithm": "pcg32-box-rejection-v1",
          "collision": "allow",
          "region": {
            "type": "box",
            "size": [3.2, 0.2, 2.1]
          },
          "variation": {
            "scale": [0.75, 1.25],
            "yawDeg": [0, 360]
          }
        }
      },
      "transform": { "position": [-3.4, 0.1, 4.2] }
    }
  ]
}
```

Canonical runtime projection removes the top-level `authoring` branch, serializes
with RFC 8785 JSON Canonicalization Scheme semantics, and retains `version`, `units`,
`componentSchemas`, `resources`, `environment`, `nodes`, components, and runtime
metadata. Review views and source-image references are authoring data and are removed.
The publisher hashes both the full document and this projection. Runtime import
exposes the `runtimeHash` through inspection APIs so parity is content-based rather
than based on file timestamps.

Prefab IDs are local to the prefab. A pattern instance receives a deterministic
runtime identity such as `flower-bed-left/0000/flower-root`; ordering is defined by
the versioned distribution algorithm, not by the host JavaScript RNG. Optimized
`InstancedMesh` lowering is allowed only for render-only compatible subtrees.
Per-instance ECS components require explicit instances or an exploded pattern.

## Required Resource And Node Types

### Resources

- `model` assets with URI, bounds, and optional material overrides;
- source images live only under `authoring`; external runtime image/texture resources
  remain outside the scene contract;
- reusable `standard`, `physical`, and `basic` materials, with bounded built-in
  `periodic-fbm-v1` recipes for independent PBR map channels;
- prefabs containing reusable node subtrees;
- external texture resources remain outside the scene contract; built-in procedural recipes carry
  their own closed sampler settings and deterministic data hashes.

Do not advertise resource types that load as empty objects.

### Node content

- group: no renderable content;
- model: catalog or generated static model asset;
- primitive: typed geometry plus a material reference;
- instance: one prefab instance with overrides;
- pattern: deterministic linear, grid, radial, along-path, scatter, or explicit
  transform sets, optimized to instancing when compatible;
- light: ambient, hemisphere, directional, point, spot, or rectangular area;

`components` are orthogonal to `content`: group, model, primitive, instance, pattern,
and light nodes may all carry typed IWSDK components. Component registration is part
of the capability snapshot and is validated before resource preflight. Every node
also permits a transform and typed authoring/runtime constraints such as v1-compatible
`placeOn` and yaw-only `lookAt`; full-orientation light direction is separate.

### Primitive geometry

Retain box, sphere, cylinder, cone, and plane. Add only the shapes required to
cover the static-composition domain without code:

- capsule;
- polygon/extrude;
- tube along explicit points.

An ellipsoid remains a scaled sphere. A thin cylinder covers discs. More exotic
geometry should use a static model asset rather than expanding the schema into a
general programming language.

### Runtime semantics that must be normative

- Light direction/target is a full 3D orientation contract; it cannot reuse the
  current yaw-only node `lookAt` helper.
- Per-instance model material overrides clone the affected glTF materials before
  mutation so sibling clones do not change.
- Environment fields have explicit precedence over `LevelSystem` defaults, are
  restored on level replacement, and declare AR behavior. Renderer-global settings
  must never leak from one scene to the next.
- Pattern algorithms declare algorithm ID/version, PRNG, iteration order, collision
  policy, maximum expansion, derived instance IDs, bounds, disposal, and lowering.
- Import rejects prefab recursion, reference cycles, unsafe URI schemes, excessive
  resource sizes/counts, non-finite transforms, and coordinates outside configured
  limits before live-state mutation.

## Schema Authority And Version Policy

Keep this work inside the existing `@iwsdk/scene-composition` package. The closed
Draft 2020-12 JSON Schema is the normative syntax; TypeScript types, validators,
editor forms, and capability declarations are generated from or checked against the
same discriminated definitions during build. The handwritten validator must not
remain a second, more permissive language. Core and the editor share one lowering
implementation for primitives, models, materials, patterns, and lights.

There is no compatibility reader or migration API before the first release:

1. `CURRENT_SCENE_VERSION` is the literal `iwsdk.scene.v1`, and every editor,
   runtime, example, starter, schema, and capability response uses it.
2. Parsers reject every other scene-version literal. They never silently rewrite a
   document while loading or saving.
3. Legacy scene types, serializers, validators, migration functions, and frozen
   compatibility fixtures are removed rather than carried into the initial contract.
4. Normative fixtures cover current v1, unknown-field rejection, stable ordering,
   runtime projection, and round-trip hash stability.

If a breaking format change becomes necessary after v1 is externally released, its
version and compatibility policy must be designed as a separate change. That future
work is not part of this initial editor skill.

## Editor Product Changes

### Human surface

Keep composition and review metadata out of the editor DOM. Merge project models,
built-in primitives, and registered geometry providers into one Assets palette.
Keep the scene graph, transforms, component inspector, camera controls, save, undo,
and redo. Content/resource identity may be shown as read-only context in the selected
node inspector; material and scene-resource editing are not human-facing features.

The agent continues to access the complete authoring contract and review sidecars by
MCP. Recording a review does not change the scene revision it evaluates.

### Review lenses

Add toolbar modes for layout, geometry, and final review. Lenses alter editor
visibility/material overrides only; they do not create divergent scene documents.

### Evidence and profiling

Capture screenshots with:

- `documentHash` and `runtimeHash`;
- view ID and exact camera parameters;
- active lens;
- resolution;
- visible node IDs;
- console/render errors;
- measured renderer statistics.

The editor should expose actual `renderer.info` values and frame timing. Performance
profiles should eventually come from versioned, owned, device-calibrated IWSDK
profiles rather than ad hoc agent numbers. Desktop editor timing alone must not be
presented as Quest performance.

## Agent Tool Changes

Retain the existing scene, workspace, camera, screenshot, save, undo/redo, placement,
and runtime-hierarchy tools. Add:

- `scene_get_capabilities` - supported schema versions, node/resource kinds,
  primitives, registered components and schema hashes, and safety limits;
- `scene_apply_transaction` - atomic ordered patches with one undo entry, expected
  `expectedBaseDocumentHash`, returned `candidateDocumentHash`, ownership mode,
  validation, and rollback on failure;
- `scene_replace_document` - the smaller MVP operation: atomic whole-document replace
  for a new/generated scene with an expected base hash;
- resource patch operations for assets, materials, prefabs, environment, and views;
- `scene_search_project_assets` and `scene_import_project_asset` as the local
  project provider distinct from scene-local `scene_list_assets`;
- `scene_set_review_lens` - layout, geometry, or final editor lens;
- `scene_capture_review` - screenshot plus revision, lens, camera, logs, and feature
  state metadata;
- `scene_persist_review_capture` - verify and immutably persist exact PNG bytes;
- `scene_save_review` - validate and immutably persist a complete review sidecar
  against the active scene, capabilities, and PNG evidence;
- `scene_list_reviews` and `scene_get_review` - typed review status and complete
  immutable records for the active scene;
- `scene_publish` - refuse dirty or stale inputs, reload the managed runtime, verify
  hashes/node parity/canvas/logs, and persist an immutable passed-or-failed runtime
  proof;
- `scene_get_render_stats` - actual calls, triangles, points, lines, textures,
  programs, shadow casters, and frame-time samples;
- future `scene_preview_rebase` and `scene_apply_rebase` tools only after a base
  snapshot and normative hierarchy/resource merge semantics exist.

`scene_compare_screenshots` should remain a byte-identity utility and be named or
documented accordingly. It must not be presented as perceptual comparison.

## Latest img2threejs v1.3.0 Mapping

The audited upstream is v1.3.0 at commit `7b1c62c`. Its ten-step loop targets one
isolated object or character and produces procedural Three.js code. IWSDK targets a
whole static scene and produces editor-owned data, so reuse must happen at the level
of invariants rather than file formats or scripts.

The garden study's seven build passes were an agent-authored plan for that scene, not
the current upstream default (eight passes in the orchestrator). The useful invariant
is coarse-to-fine diagnosis; IWSDK implements that as lenses over one scene rather
than mandatory partial scene files.

| Upstream step/facility                | IWSDK location | Adaptation                                                                                                                                                     |
| ------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Probe and reference admission      | Brief          | Keep decoding, dimensions, hashes, and duplicates; make isolated-subject mask gates crop-specific                                                              |
| 2. Assessment and quality contract    | Brief          | Replace complexity quotas with required scene features, assumptions, and representation policy                                                                 |
| 2b/2c. Detail inventory and landmarks | Brief          | Keep critical feature evidence; character anatomy/likeness is outside static-scene scope                                                                       |
| 3. Author `ObjectSculptSpec`          | Compile        | Replace prose-heavy sculpt data with executable IWSDK scene JSON                                                                                               |
| 4. PBR/reference evidence             | Compile        | Treat as optional evidence; scalar PBR is the baseline and bounded procedural maps may approximate evidenced material families without claiming reconstruction |
| 5. Normal and strict validation       | Compile gate   | Keep depth/coverage intent through referential, capability, and required-feature validation                                                                    |
| 6. Locked generator passes            | Materialize    | Replace code generation and partial files with one transaction plus editor review lenses                                                                       |
| 7-9. Render, deterministic/VLM review | Review         | Use exact views, scene-aware metrics, feature gates, and agent judgment only after technical gates                                                             |
| 10. Pipeline sync                     | Review/Publish | Replace mutable pass state with content hashes, one review record, and runtime proof                                                                           |
| Artifact cache and bounded correction | All            | Cache by input/tool/capability hash and retain repeat-defect, plateau, and hard-ceiling stops                                                                  |

Upstream maturity matters when deciding what to port. Its 168 Python tests pass, but
they do not compile or render generated Three.js in a browser. Divine Eye thresholds
and weights remain provisional; several calibration/color signals are report-only or
tested with synthetic fixtures. The VLM gate consumes injected/offline judgments,
the multi-angle tool analyzes supplied PNGs but does not drive a browser, the cache
helper is not wired into code generation, and Tier-1 pass lookup does not bind the
result to the current render hash. The documented check/generate sequence and the
generator's unlock checks are also weaker than the orchestration claims. IWSDK should
adopt the architecture, not copy constants or assume integration upstream does not
prove.

### Upstream invariants to retain

- deterministic checks before expensive visual judgment;
- every critical visual feature has an implementation binding and its own acceptance
  result, so an overall score cannot hide a missing feature;
- a reference/render comparison uses an exact named camera and recorded resolution;
- non-planar content is checked from another angle to catch billboard-like collapse;
- correction routing distinguishes a contract defect from an implementation defect;
- repeated defects, oscillation, plateau, token limit, and hard iteration ceiling
  terminate the loop;
- cached intake artifacts are keyed by reference content and tool implementation hash.

### Upstream rules not carried into this skill

- action-ready pivots, sockets, colliders, destruction groups, character anatomy,
  projection-based likeness, and animation readiness are outside static composition;
- full-frame environments do not use the isolated-object foreground-coverage and
  connected-component admission thresholds;
- global silhouette IoU is not a universal hard gate for a photographic scene with
  foliage, shadows, and inferred hidden geometry;
- fixed macro/meso/micro component minimums do not force fake nodes into a simple
  scene; required-feature coverage is the depth gate;
- upstream fidelity numbers are retained only when their exact deterministic formula
  and applicability are recorded. Agent-estimated decimals are labeled judgments,
  never measurements.

## Skill Design

Replace or supersede `iwsdk-image-composer` with one skill:

```text
iwsdk-scene-composer/
  SKILL.md
  references/
    scene-format.md
    text-intake.md
    image-intake.md
    review-and-stop.md
    composition-patterns.md
```

The main skill selects an input adapter, then always invokes the same compile,
materialize, review, and publish path. The image workflow becomes a reference file,
not an independent skill with a second implementation pipeline.

The existing skill provenance also needs correction: current img2threejs v1.3.0 is
Apache-2.0, not MIT.

## First Shippable Skill Versus Target Architecture

The target above is intentionally broad enough to express the garden study without
procedural JavaScript. It should not be mistaken for the first implementation slice.

The first shippable `iwsdk-scene-composer`:

- lives only in the existing editor skill directory; it creates no workspace package;
- accepts text, image, and hybrid briefs, then uses one compile/review/publish path;
- creates a new scene with atomic whole-document replacement;
- uses declared glTF assets, typed primitives, reusable standard/physical/basic
  materials, bounded procedural maps, transforms, hierarchy, components, named
  cameras, and screenshots;
- stores a fixed-schema composition overlay in the existing editor extensibility
  area and excludes it from the runtime hash;
- adds strict validation, capability reporting, content hashes, transactional load,
  raw renderer statistics, and two bounded correction rounds;
- refuses unsupported requests or records an explicit accepted simplification.

It does not promise arbitrary external texture maps, asset generation, calibrated
device budgets, merge-under-root, or regeneration rebase. Those remain separate
extensions even though shared materials, prefabs, patterns, expanded geometry, and
renderer-global environment settings are now present in v1.

The full garden-capable target begins only after v1 includes shared materials,
prefabs/patterns, required extra geometry, lights/environment, complete editor/runtime
lowering, and cleanup fixtures. This separation lets the useful skill ship without
pretending that a DCC/runtime expansion is already implemented.

## Implementation Roadmap

### Phase 0: Harden the current foundation

- Establish that v1 has not shipped, assign the rich local draft to the sole v1
  contract, and remove compatibility-only readers and migrations.
- Make one schema source authoritative for types, JSON Schema, and runtime validation.
- Reject unknown fields, unsupported asset uses, `placeOn` self/cycles, unknown runtime
  components, and invalid material/model combinations.
- Add canonical `documentHash`/`runtimeHash`, propagate the runtime hash through import
  and inspection, make scene import transactional, and propagate load failures.
- Fix patch cloning, reference-safe renames, and aggregate bounds.
- Correct skill provenance.

### Phase 1: First shippable unified skill

- Define and validate the typed composition overlay carried as agent-only authoring
  data and excluded from runtime projection and human editor UI.
- Add `scene_get_capabilities`, atomic whole-document replacement, and raw render
  statistics with measurement environment.
- Implement text, image, and hybrid intake adapters over one current-format compiler.
- Keep reference comparison and workflow review in agent tools using existing named
  views and screenshots.
- Add text-only, licensed/synthetic image, and hybrid E2E fixtures covering human
  edits, save/reload, runtime hashes, screenshots, and the two-round stop rule.

### Phase 2: Complete the garden-capable v1 contract

- Complete the discriminated v1 schema and normative runtime semantics before its
  first external release.
- Add reusable materials, saved views, environment, lights, prefabs, instances,
  deterministic patterns, capsule, polygon/extrude, and tube geometry.
- Share lowering between editor and runtime, including resource cleanup, aggregate
  bounds, pattern identities, instancing restrictions, and model-material cloning.
- Add current-format fixtures, safety limits, unknown-version rejection, and
  round-trip hash tests without a compatibility reader.
- Release immutable `iwsdk.scene.v1` only when every declared branch is implemented.

### Phase 3: General editor and registered-resource proof

- Keep the human editor limited to scene graph, transforms, one Assets palette,
  components, camera controls, and persistence.
- Add world-scoped registered material and geometry providers shared by editor and
  runtime. Prove parameter validation, capability hashing, deterministic bounds,
  disposal, preview, and custom shader support without a material editor.
- Add a real project asset search/import provider rather than overloading the
  scene-local asset list.
- Use a licensed or synthetically rendered garden fixture with known ground truth;
  do not commit the downloaded reference until its redistribution rights are known.
- Prove complete garden composition, feature bindings, deterministic patterns,
  agent materialization, human edits, save/reload, runtime parity, screenshots,
  resource cleanup, raw profiling, and correction limits.

### Phase 4: Optional fidelity extensions

- Add external image texture resources and arbitrary map ingestion only through a
  future format change after launch; keep deterministic built-in recipes in v1.
- Add static generated-model ingestion when an approved asset pipeline exists.
- Add calibrated, owned device profiles only after measurement methodology exists.
- Design merge-under-root and three-way regeneration rebase as separate features with
  base snapshots and normative conflict semantics.
- Keep runtime procedural behavior and interaction in typed IWSDK components/code,
  outside this static-composition skill.

## Target Implementation Acceptance Criteria

The proposal is complete when all of the following are true:

1. The same Part B implementation consumes text-, image-, and hybrid-authored specs.
2. The specification is executable and contains no prose-only geometry strategy.
3. Every required feature resolves to existing node/resource IDs.
4. Schema validity, capability compatibility, resource readiness, editor commit, and
   application-runtime proof are reported separately and cannot be mistaken for one
   another.
5. A failed preload or detached instantiation leaves the previous document, runtime
   scene, resources, renderer globals, and undo history unchanged.
6. A complex repeated scene uses versioned deterministic patterns, stable derived
   identities, compatible instancing, and measured draw calls.
7. The editor can show the brief, references, features, assumptions, materials, views,
   and review status without parsing arbitrary metadata.
8. Human edits survive save/reload and regeneration refuses replacement unless the
   selected ownership/conflict policy permits it.
9. Hero and diagnostic screenshots record exact cameras, dimensions, renderer
   environment, `documentHash`, and `runtimeHash`; byte identity is claimed only
   within an explicitly controlled environment.
10. Editor and app runtime report the same runtime hash with matching representative
    transforms, resources, and component values.
11. Publishing requires all required features to pass or records an explicit
    `accepted-with-gaps` waiver.
12. Authoring provenance is absent from the runtime projection, and unsafe resources,
    cycles, excessive expansion, and invalid numeric values fail before commit.
13. The garden can be represented at the declared stylized procedural-PBR fidelity
    ceiling, with unsupported photographic foliage/fur limitations visible before
    generation.

## Decisions To Make Before Implementation

1. `iwsdk.scene.v1` has not shipped as an external compatibility contract. The rich
   document is therefore the sole v1 schema and no compatibility reader is required.
2. Should pattern nodes remain live and editable at runtime or be baked at save time?
   Recommendation: keep deterministic live patterns and provide explicit explode/bake.
3. Who owns device-profile calibration and its measurement environment? Until answered,
   report raw renderer statistics without a device pass/fail claim.
4. Is orthographic projection required in the first scene-format slice? Recommendation: yes, because
   image and text composition commonly target isometric-like references.
5. Should the MVP composition overlay remain in `editor.composition`, or move to
   top-level `authoring` as shown? Recommendation: use top-level `authoring` in the
   sole v1 contract and keep it outside the runtime projection.

## Audit Basis And Verification

This proposal was checked against:

- IWSDK `feat/iwsdk-planner-pipeline` at `056e9807`, equal to `origin/main` at audit
  time, plus the existing uncommitted editor, schema, primitive, and skill work;
- `packages/scene-composition/src/{types,schema,validation,patch}.ts`;
- `packages/core/src/level/level-scene-{json-importer,primitive}.ts` and
  `packages/core/src/level/level-system.ts`;
- `packages/vite-plugin-dev/src/editor/{scene-editor-session,editor-runtime-source}.ts`;
- the CLI/MCP scene-tool contracts and relevant editor/runtime E2E tests;
- upstream img2threejs v1.3.0 at `7b1c62c` (`origin/main`, Apache-2.0), including its
  intake, spec, validation, pass orchestration, deterministic review, multi-angle,
  feature-gate, cache, and correction-loop code.

Verification environment: Node `v24.16.0`, pnpm `10.18.3`, Python `3.12.13+meta`.
The existing local IWSDK changes were not reset or rewritten.

Focused IWSDK checks passed, 76 tests total:

```sh
corepack pnpm@10.18.3 --filter @iwsdk/scene-composition test
corepack pnpm@10.18.3 --filter @iwsdk/core exec vitest run \
  tests/level/level-scene-json-importer.test.ts \
  tests/level/level-scene-primitive.test.ts tests/mcp/scene-tools.test.ts
corepack pnpm@10.18.3 --filter @iwsdk/vite-plugin-dev exec vitest run \
  test/scene-editor-session.test.ts \
  test/editor-save-reload-runtime-parity.e2e.test.ts
```

The upstream deterministic harness also passed all 168 tests:

```sh
python3 -m unittest discover -s forge/tests -p 'test_*.py'
```
