# Phase 3 Playbook — Grounding the Spec to IWSDK

Every mechanic in `design/GAME_SPEC.md` gets classified before any code:

- **BUILT-IN** — a component/system ships in IWSDK; we just attach/configure.
- **CONFIGURE** — a feature flag or config object in `World.create` (plus
  prerequisites, e.g. locomotion requires collision geometry).
- **CUSTOM** — needs a new component/system; sketch its queries and priority.

The output is `design/TECH_PLAN.md`. The audit rule: re-check every CUSTOM
item against the reinvention-risk table in `api-reference.md` — an agent
rebuilding a built-in (raycasting, grab logic, sky domes, teleport arcs,
spatial audio) is this pipeline's most common and most expensive failure.

## Source-of-truth ladder

1. **`iwsdk reference` CLI** (semantic search over the actual SDK source) —
   best for "does X exist / how is Y used".
2. **`references/api-reference.md`** (ships with this skill) — curated
   patterns, enums, gotchas; always available.
3. **Installed source** — `node_modules/@iwsdk/core/dist/**/*.d.ts` (grep
   recursively — the dist root only has a re-export barrel; the real
   declarations live in subdirectories like `dist/grab/*.d.ts`).
4. **Docs site** — https://iwsdk.dev (guides + concepts; also `llms.txt`).

Trust order for _signatures_: 3 > 1 > 2 > 4. Trust order for _patterns and
gotchas_: 2 > 1 > 4.

**Version drift is real**: curated docs (rung 2, plus the project CLAUDE.md)
may describe APIs newer or older than the installed package. Example: docs
describing `GrabSystem.forceRelease()` while the installed 0.4.2 has no such
method, and `entity.setValue()` throwing on vector fields in elics 3.4.x
while older docs show `setValue(Transform, 'position', [...])`. For every
API your plan depends on, confirm the signature at rung 3 (installed
`.d.ts`) or rung 1 before writing it into TECH_PLAN.

## Reference CLI protocol

Run from **inside the app directory** (the CLI resolves the nearest folder
with a `vite.config.*` and an `@iwsdk/*` dependency — it fails at a monorepo
root or empty dir). The package `@iwsdk/reference` must be installed
(generated apps include it; `npm i -D @iwsdk/reference` otherwise). Fresh
installed scaffolds perform the one-time ~210 MB corpus/model warmup during
creation; queries then run offline. `npx iwsdk reference status` tells you the
state. Run `npx iwsdk reference warmup` manually only for an older app, a
`--no-install` scaffold, or recovery from an interrupted initialization.

```bash
# Semantic search — start here for each mechanic
npx iwsdk reference search --input-json '{"query":"throw object with physics velocity","limit":5,"verbosity":1}'

# Exact API card once you have a name
npx iwsdk reference api --input-json '{"name":"PhysicsManipulation"}'

# Enumerate what exists (great first call of the phase — cache the output)
npx iwsdk reference components --input-json '{}'
npx iwsdk reference systems --input-json '{}'

# Real usage examples from the SDK/examples
npx iwsdk reference examples --input-json '{"api_name":"DistanceGrabbable"}'

# Who depends on / extends a thing
npx iwsdk reference dependents --input-json '{"api_name":"GrabSystem"}'
npx iwsdk reference relationship --input-json '{"type":"extends","target":"System"}'

# Pull exact source when the docs disagree
npx iwsdk reference file --input-json '{"file_path":"packages/core/src/grab/grab-system.ts","source":"iwsdk"}'
```

Tips: `verbosity` 0–3 controls how much code comes back (default 3 is
verbose — use 1 for surveys, 3 for the one API you're implementing against).
Output is a JSON envelope `{ok, data:{result:{results:[…]}}}`; parse stdout
only. The first query after warmup pays model-load latency (~10–30 s).

If reference is unavailable (no network / install failed): use ladder rungs
2–4 and say so in TECH_PLAN's risk list — grounding confidence is lower.
Known install failure: `@iwsdk/reference` depends on `onnxruntime-node`,
whose postinstall downloads CUDA binaries; behind restrictive proxies it
403s and kills `npm install`. Retry with
`npm_config_onnxruntime_node_install_cuda=skip npm install`.

## Domain → API starting points

Survey `components`/`systems` output first, then dig per domain. Common
mappings (details in `api-reference.md`):

| Spec language                    | Look at                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pick up, hold, wield (near)      | `OneHandGrabbable`, `TwoHandsGrabbable`, `grabbing` flag                                                                                                  |
| pull from afar, force-grab       | `DistanceGrabbable` + `MovementMode`                                                                                                                      |
| throw, bounce, stack, knock over | `physics` flag, `PhysicsBody`+`PhysicsShape`, `PhysicsManipulation` (impulses/velocity)                                                                   |
| point, click, hover, poke        | `Interactable` (+ `Hovered`/`Pressed` tags), built-in RayPointer                                                                                          |
| buttons, menus, score display    | `spatialUI` flag, manifest `AssetType.UIKitML`, placed scene node + stable element IDs; `ScreenSpace` (intentional browser HUD); `Follower` (head-locked) |
| walk, teleport, turn, jump       | `locomotion` flag (+ `browserControls` for keyboard), `LocomotionEnvironment` on collision geometry                                                       |
| sky, mood, lighting              | `DomeGradient`/`DomeTexture` + `IBLGradient`/`IBLTexture` **on the level root**                                                                           |
| sounds, music                    | `AudioSource` + `AudioUtils.play()`, `PlaybackMode`                                                                                                       |
| spawn/despawn, levels            | `createTransformEntity`, `LevelTag`/`LevelRoot`, `world.loadLevel()`                                                                                      |
| AR: real tables/walls            | `sceneUnderstanding` flag, `XRPlane`/`XRMesh`                                                                                                             |
| AR: place on surfaces            | `environmentRaycast` flag, `EnvironmentRaycastTarget` + `RaycastSpace`                                                                                    |
| AR: hide behind real things      | `DepthOccludable` (see the iwsdk-depth-occlusion skill)                                                                                                   |
| camera feed, selfie, MR capture  | `camera` flag, `CameraSource`, `CameraUtils`                                                                                                              |
| game state, pause, score         | signals in `world.globals`, system `config` signals                                                                                                       |

## Levels & scenes note

Scenes can be **built in code** (manifest assets + `createTransformEntity`) or loaded
from native IWSDK scene JSON selected by `iwsdk.config.json`. Use scene JSON for static
composition and runtime code for procedural or state-dependent entities. Scene JSON is
authored source, not generated editor state: agents may edit files under
`public/scenes/` directly, while humans may use the managed workspace editor for
hierarchy, transforms, components, and assets. Validate and render through
`scene render-file`, then use `scene open` for live editor collaboration.

## TECH_PLAN.md template

```markdown
# <Title> — Tech Plan

## iwsdk.config.json world block (decided)

\`\`\`jsonc
{
"world": {
"xr": { "mode": "vr", "offer": "once" },
"features": { "physics": true, "grabbing": true, "locomotion": false }
}
}
\`\`\`
Prerequisite checks: <locomotion→collision geometry? spatialUI→ui configs? …>

## Mechanics grounding

| Mechanic      | Class           | IWSDK pieces                         | Custom work                               | Risk                  |
| ------------- | --------------- | ------------------------------------ | ----------------------------------------- | --------------------- |
| M1 throw ball | BUILT-IN+CUSTOM | DistanceGrabbable, PhysicsBody/Shape | ThrowVelocitySystem (velocity on release) | release-velocity feel |

## Custom systems

### <SystemName> (priority <n> — band <input|sim|sync|ui>)

- Queries: `{ name: { required: [A, B], where: [...] } }`
- Reacts to: <qualify/disqualify/signal/frame>
- Writes: <components/signals>
- Sketch: <3–6 lines>

## Custom components

| Component | Fields (Type, default) | On which entities |

## Asset manifest

| Asset | Type | Source (code-built / user file / to-source) | Path |

## Globals & signals

| Key | Type | Writers | Readers |

## Risks & mitigations

| Risk | Impact | Mitigation |
```

## Fan-out guidance

Preconditions: reference warmup must already be **complete** before fanning
out (parallel agents must not each trigger a concurrent warmup or the
10–30 s model load; run one cheap query first to pay the load once).

One research agent per domain actually present in the spec. Each gets: spec
path, this file's path, the **absolute app-root path** (all `npx iwsdk`
commands run from there — sub-agent working directories often reset between
calls), its domain, and the instruction to _return only_ filled table rows +
custom-system sketches + citations (file paths / CLI output it based claims
on). Merge, dedupe (several domains will touch
`Interactable`), then do the reinvention audit yourself with
`api-reference.md` open.
