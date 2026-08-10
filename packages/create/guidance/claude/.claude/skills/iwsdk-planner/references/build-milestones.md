# Phases 4–5 Playbook — Architecture & Milestone Build

## Scaffolding (new apps)

Use `@iwsdk/create` — never hand-roll project structure. Infer flags from the
TECH_PLAN, don't hardcode.

Flag menu (choose one per pair — this is NOT a runnable command):

```text
--mode vr | --mode ar     # XR apps; or --no-xr for browser-first
--physics | --no-physics
--grabbing | --no-grabbing
--locomotion | --no-locomotion
--scene-understanding | --no-scene-understanding   # AR only
--yes                     # ALWAYS for agents — without it, interactive
                          # prompts hang AND the feature flags are ignored
```

Runnable example (VR game, physics + grabbing, stationary):

```bash
npx @iwsdk/create@latest bowling-vr --yes --mode vr --physics --grabbing --no-locomotion
```

If `@latest` misbehaves, fall back to the version pinned by the project or the
current release documented on iwsdk.dev.

Notes:

- `--no-xr` (the legacy alias for `--target browser`) scaffolds `xr: false`,
  browser locomotion, canvas pointer input, and browser interaction support.
  Camera look remains intentionally app-owned because first-person, orbit,
  editor, and follow cameras need different behavior. For a first-person app,
  adapt the pointer-lock pattern in `examples/browser-first/src/mouselook.ts`.
- Dual-runtime (VR + browser testable): scaffold `--mode vr`, then set
  `xr: { offer: 'once' }`, `input: { canvasPointerEvents: true }`,
  `locomotion: { browserControls: true }`.
- Generated apps come with: `npm run dev` (= `iwsdk dev up --open
--foreground`), a `dev:runtime` script (required by the CLI — never remove
  it), the Vite dev plugin, starter src (`index.ts`, `panel.ts`, `robot.ts`),
  `public/ui/welcome.uikitml`, and AI configs (CLAUDE.md, skills, MCP
  adapters). Delete starter content you don't use (robot etc.) at M1, not M0
  — M0 verifies the untouched baseline.
- Existing app instead of scaffold: write an "existing-app delta" section —
  current feature flags vs needed, files to add/change.

## Asset Strategy

In priority order:

1. **Code-built primitives** (default for MVP): Box/Sphere/Cylinder/Cone/
   Torus geometries + `MeshStandardMaterial` from `@iwsdk/core` — zero
   sourcing risk, fine for stylized art directions. Compose "models" from
   grouped primitives under one `createTransformEntity`.
2. **Assets already in the project** (`public/gltf/…` from the starter, or
   user-provided). List them in the manifest with paths.
3. **Asset search tooling, if present** — if the environment has an asset
   MCP (e.g. a `meta_assets_search`-style tool) or the user offers a source,
   download GLB/GLTF into `public/gltf/<name>/` and record license/origin.
4. **Ask the user** (interactive mode) for must-have hero assets.

Never invent asset paths; never reference files you haven't created or
verified. All runtime loading goes through `AssetManager` (manifest in
`World.create` for preload, `AssetManager.loadGLTF` for on-demand) — never
raw loaders. Audio: short mp3s; the starter ships `public/audio/chime.mp3`
you can reuse for MVP feedback.

## ARCHITECTURE.md template

```markdown
# <Title> — Architecture

## Scaffold

Command: <exact @iwsdk/create line, or existing-app delta>

## File tree (one system per file; no barrel index)

src/
index.ts # World.create + registrations + scene setup only
components/<x>.ts # createComponent defs (group related)
systems/<x>.ts # one system per file
public/ui/<panel>.uikitml
public/{gltf,audio,textures}/…

## Components

| Component | Field | Type | Default | Notes |

## Systems

| System | Priority | Queries | Purpose |
<band rule: 0–9 input · 10–19 simulation · 20–29 visual sync · 30+ UI/ambient>

## Entity placement (from design/concept/layout.svg)

| Entity | Components | Position [x,y,z] | Notes |

## Globals

| Key | Type | Purpose |

## Milestones

### M0 — scaffold renders

Demo: app serves; scene renders; XR session enters.
Assertions: screenshot non-black; `xr enter` ok; console clean.

### M1 — <core mechanic vertical slice>

Demo: <observable behavior>
Assertions: <specific ecs/screenshot/log checks>

### M2…Mn — <one mechanic or surface each>

### M-final — all MVP success criteria pass (Phase 6 full run)
```

Milestone rules: 3–6 milestones; each independently demoable; core-loop
mechanic first (riskiest feel-work earliest); UI and audio get their own
milestone unless trivial; every spec success criterion mapped to exactly one
milestone's assertions.

## Runtime-hitch hardening defaults (build these in from M1)

The managed dev runtime steps physics on the raw frame delta. Reloads, screenshots,
debug snapshots, backgrounded windows, and CI can all hitch; a single multi-second
step tunnels thin colliders and pops stacked contacts. Defaults that avoid a day of
debugging:

- **Solid-block static colliders** (0.3 m+ thick), never thin plates; extend
  the floor under/behind every play area as a catch surface; add invisible
  containment walls so nothing rolls out of the world.
- **Spawn-gate dynamic bodies**: hold spawns until N consecutive stable
  frames (e.g. 5 frames under 50 ms) so first steps can't tunnel them.
- **Physics-on-demand for precarious arrangements** (stacks, pyramids,
  dominoes): keep them body-less until the moment gameplay needs them
  knockable; re-park body-less on reset.
- **Self-healing bounds recovery**: a system that returns escaped dynamics
  to their spawn poses.
- **Check physical support when translating design layouts**: a layout
  drawn for looks (e.g. cans spaced wide apart) may leave upper items
  unsupported — stacking needs contact (can spacing ≈ 2·radius).

## The Milestone Loop (Phase 5)

For each milestone:

1. **Brief** — restate demo criterion + assertions (from ARCHITECTURE.md).
2. **Implement** — following `api-reference.md` best practices. Key habits:
   imports from `@iwsdk/core` (never `three` for standard classes — one
   Three instance only), `createTransformEntity` (never `scene.add`),
   queries + qualify/disqualify subscriptions (never entity arrays), config
   signals + `.peek()` in `update()`, `cleanupFuncs` for every subscription,
   module-scope scratch vectors (no per-frame allocations).
3. **Typecheck** — `npx tsc --noEmit`. Fix everything; zero-error baseline
   makes later breakage attributable.
4. **Verify** — run this milestone's assertions live (`verification.md` has
   the loop). First milestone verifies the _scaffold before edits_.
5. **Record** — Milestone Log entry in `design/PIPELINE.md` with evidence
   paths. Per-milestone commits (message: `M<n>: <demo criterion>`) are this
   pipeline's intended checkpointing — confirm once with the user at Phase 5
   start, or record `[ASSUMED] auto-commit milestones` in autonomous mode.
   If your harness forbids unrequested commits, skip them and note in
   PIPELINE.md that the "revert to last green commit" recovery rung is
   unavailable.
6. Broken? Debug with runtime tools (`ecs pause/step/snapshot/diff`,
   `browser logs`) before touching code. Revert to last green commit if a
   milestone turns into a swamp; re-plan the milestone instead of thrashing.

## Sub-agent rules for build fan-out

- Parallelize only **genuinely independent modules** (e.g. audio system vs
  UI panel vs environment theming). Core-loop code is usually sequential.
- Each sub-agent owns a **disjoint file set**, stated explicitly in its
  brief. Nobody but the main agent touches `src/index.ts`, `package.json`,
  or `vite.config.ts`.
- Sub-agent brief = paths to GAME_SPEC/TECH_PLAN/ARCHITECTURE + the
  **absolute app-root path** (run all commands from there — sub-agent
  working directories often reset between calls) + the path to
  `references/api-reference.md` with the
  instruction to follow its best practices and anti-pattern list + owned
  files + its milestone's assertions + "run `npx tsc --noEmit` before
  returning; do NOT start dev servers or install packages".
- Sub-agents cannot keep background processes alive — the **main agent owns
  the dev server** (`iwsdk dev up/down`), does all runtime verification, and
  integrates results.
- After integrating parallel work: typecheck + verify loop before the next
  fan-out. Two unverified fan-outs deep is how projects sink.

## Common `iwsdk.config.json` world shapes

```jsonc
// VR game (stationary or room-scale)
{
  "world": {
    "xr": { "mode": "vr", "offer": "once" },
    "features": {
      "physics": true,
      "grabbing": true,
      "locomotion": false,
      "spatialUI": true
    }
  }
}

// Dual-runtime VR + browser-testable (recommended for agent-built apps —
// lets you and CI verify in a plain browser tab too)
{
  "world": {
    "xr": { "mode": "vr", "offer": "once" },
    "input": { "canvasPointerEvents": true },
    "features": {
      "physics": true,
      "grabbing": true,
      "spatialUI": true,
      "locomotion": { "browserControls": true }
    }
  }
}

// AR placement app
{
  "world": {
    "xr": {
      "mode": "ar",
      "features": { "planeDetection": true, "hitTest": true }
    },
    "features": {
      "locomotion": false,
      "sceneUnderstanding": true,
      "environmentRaycast": true,
      "grabbing": true
    }
  }
}
```

Only enable what the TECH_PLAN grounded — every stray flag is overhead and a
prerequisite trap (locomotion without collision geometry = player falls
through the world). Full option reference: `api-reference.md` §18–19.
