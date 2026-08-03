---
name: iwsdk-planner
description: IWSDK experience pipeline and planning guide. Use when building a new IWSDK app/game end-to-end, planning new IWSDK features, designing systems/components, reviewing IWSDK code architecture, or when the user asks about IWSDK patterns, ECS design, signals, or reactive programming. Runs a phased ideation → design → grounding → architecture → build → verify → ship pipeline, orchestrating sub-agents per phase where the harness supports them.
argument-hint: '[experience idea, or feature to plan]'
---

# IWSDK Experience Pipeline

You are an expert IWSDK (Immersive Web SDK) architect and producer. This skill
turns an idea ("a VR bowling game", "an AR plant identifier") into a specced,
designed, grounded, built, and verified IWSDK app through explicit phases —
each phase producing reviewable artifacts on disk before the next begins.

## Choose Your Mode

| Situation                                                                    | Mode                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| New experience/game/app from an idea, or a large feature epic (multi-system) | **PIPELINE** — run the phases below                                   |
| Small feature in an existing app, an architecture question, a code review    | **QUICK** — jump to [Quick Planning](#quick-planning-single-features) |

When in doubt: if the work needs a spec the user should react to, use PIPELINE.

## Operating Principles

1. **Artifacts over conversation.** Every phase writes files under `design/`
   in the project. Files are the source of truth; the conversation is not.
   Anyone (including a fresh agent) must be able to resume from disk alone.
2. **Phase gates.** Do not start phase N+1 until phase N's artifact exists and
   its gate is satisfied. Record progress in `design/PIPELINE.md` (template
   below). Skipping a phase is allowed only if the user asks for it — record
   the skip and why.
3. **Sub-agents where available, inline where not.** If your harness has a
   sub-agent/Task tool, fan phases out as described in each phase's playbook —
   parallel agents for independent artifacts, one agent per research domain,
   disjoint file ownership for build agents. If not, do the same steps
   yourself, sequentially. The artifacts and gates are identical either way.
4. **The developer is a collaborator, not an oracle.** Ask real questions at
   ideation and at gates (use a structured question tool such as
   AskUserQuestion when available — batched, with opinionated defaults). If
   the user is absent or asked you to proceed autonomously, choose defaults
   and mark every such decision `[ASSUMED]` in the artifact, then continue.
5. **Ground before you build.** No implementation before every mechanic in the
   spec is mapped to IWSDK built-ins or explicitly classified as custom work
   (Phase 3). Rebuilding something IWSDK provides is the #1 failure mode.
6. **Verify with the runtime, not vibes.** "It compiles" is not a gate.
   Milestones pass only when the live app (dev server + emulated XR input +
   ECS assertions + screenshots) demonstrates the behavior.

## Pipeline State File

Create `design/PIPELINE.md` at the start; update it at every phase boundary:

```markdown
# <Project Name> — Pipeline State

| Phase          | Status      | Artifact                          | Notes                          |
| -------------- | ----------- | --------------------------------- | ------------------------------ |
| 0 Preflight    | done        | (this file, Capabilities below)   |                                |
| 1 Ideation     | done        | design/GAME_SPEC.md               | approved by user / assumptions |
| 2 Design       | in-progress | design/deck.html, design/concept/ |                                |
| 3 Grounding    | pending     | design/TECH_PLAN.md               |                                |
| 4 Architecture | pending     | design/ARCHITECTURE.md            |                                |
| 5 Build        | pending     | src/, milestone log below         |                                |
| 6 Verify       | pending     | design/VERIFICATION.md            |                                |
| 7 Ship         | pending     | review report, build, deploy      |                                |

## Capabilities (Phase 0 findings)

- interactive questions: yes (AskUserQuestion) | no (autonomous)
- sub-agents: yes (Task tool) | no
- slide/HTML preview: artifact tool | file only
- image generation: <tool name> | none (SVG fallback)
- iwsdk CLI: <version> | pending scaffold · reference: ready|warmup-needed|unavailable
- runtime verify: managed headed browser ready | blocked because <why>

## Milestone Log

- M0 <date>: scaffold renders — screenshot design/verify/m0.png
```

**Resuming:** if `design/PIPELINE.md` exists, read it plus the artifacts of
completed phases, then continue from the first non-done phase. Never redo a
done phase unless the user changes the requirements behind it.

---

## Phase 0 — Preflight (capability & environment probe)

Goal: know what this harness and machine can do, so later phases degrade
gracefully instead of failing mid-flight.

Probe and record in `design/PIPELINE.md` (Capabilities section):

1. **Interaction** — can you ask the user structured questions and get answers
   (e.g. AskUserQuestion tool)? If the user said "build it, don't ask me", or
   no question tool exists and the user is unresponsive, set `autonomous`.
2. **Sub-agents** — do you have a Task/agent-spawning tool? Note limits you
   know (e.g. sub-agents usually cannot keep background processes alive — the
   main agent must own dev servers).
3. **Presentation** — can you render/publish HTML (artifact tool)? Can you
   generate images (any image-gen tool)? Fallback: hand-authored SVG + local
   HTML files.
4. **Toolchain** — `node --version` (needs >=20.19 <21, >=22.12 <23, or >=24);
   is there an existing IWSDK app here or are we scaffolding fresh?
5. **IWSDK tooling** — only if an app already exists, and always from its
   directory (never a bare shell/monorepo root — `npx iwsdk` outside an app
   resolves to an unrelated npm package): `npx iwsdk status`,
   `npx iwsdk reference status`. Fresh installed scaffolds initialize this
   shared cache during creation. If an older/existing app still reports warmup
   needed and you have network, start `npx iwsdk reference warmup` **in the
   background now** (~210 MB download) so it's ready by Phase 3. If it fails, note the
   docs fallback (see `references/grounding.md`). **Scaffolding fresh?**
   Skip these probes, record `iwsdk CLI: pending scaffold`, and rely on the
   Scaffold Checkpoint below to run them right after ideation.

Gate: Capabilities section filled in. This phase never asks the user anything.

## Phase 1 — Ideation (idea → spec)

Goal: lock the idea into `design/GAME_SPEC.md` — the single document that says
what we are building, for whom, on what device, at what scope.

Playbook: `references/ideation.md` (question bank, spec template, worked
example).

Procedure:

1. Restate the user's idea in 2–3 sentences. State the genre, the fantasy,
   and the obvious open questions.
2. Ask **batched** question rounds (3–4 questions each, each with 2–4
   opinionated options + your recommended default; structured question tools
   typically cap a call at 4 questions — split a bigger round into two
   calls rather than dropping questions). Round 1: platform & mode
   (VR/AR/browser-first/dual), core loop, scale/comfort. Round 2: mechanics
   detail, art/audio direction, scope tier. Stop when the axes in the
   template are pinned — usually 2 rounds, 3 max. In `autonomous` mode:
   answer every question yourself with the most defensible default, mark
   `[ASSUMED]`, and keep a "Questions I would have asked" appendix.
3. Write `design/GAME_SPEC.md` from the template: pitch, pillars, core loop,
   mechanics list, platform/mode, space & locomotion needs, UI surfaces,
   audio moments, art direction, scope tiers (MVP / target / stretch),
   non-goals, success criteria (each criterion must be _observable_ — you
   will assert it in Phase 6).
4. Present a compact summary and get sign-off (or record `[ASSUMED]` set).

Gate: spec exists; every mechanic is named; success criteria observable;
user approved or assumptions documented.

### Scaffold Checkpoint (fresh projects only)

Ideation locks the platform axes — scaffold **now**, before Phase 2, so the
project directory exists for every later artifact and tool:

1. Scaffold with `@iwsdk/create` using the spec's mode/features
   (`references/build-milestones.md` has the flag menu); `cd` into the app.
2. Move any `design/` files created so far into `<app>/design/` — from here
   on, everything lives in the app root. Do the move BEFORE fanning out
   Phase 2/3 agents (or brief them with the final app paths) — agents
   writing to a stale staging path while you move it lose work.
3. Run the deferred Phase 0 probes (`npx iwsdk status`, `npx iwsdk reference
status`). Creation initializes the reference cache before returning. Only if
   status still reports warmup required should you run `npx iwsdk reference
warmup` and treat a failure as a scaffold/setup defect.
4. Do **not** modify app code yet — Phase 5's M0 verifies the untouched
   scaffold. Never scaffold a nested app inside an existing IWSDK app.

## Phase 2 — Design (spec → deck + concept art)

Goal: make the spec _visible_ so the developer can react to a look and a
layout, not a wall of text. Everything here is presentational — no code.

Playbook: `references/design-deck.md` (deck outline, HTML/SVG conventions,
concept-art briefs, capability ladder).

Fan out (parallel sub-agents if available, else sequential):

- **Deck agent** → `design/deck.html`: self-contained slide deck (inline CSS,
  arrow-key navigation) covering pitch, pillars, core loop diagram, mechanics,
  level layout, interaction model, art/audio direction, scope, tech snapshot.
- **Concept-art agent** → `design/concept/*.svg`: 2–4 hand-authored SVG
  pieces (key moment, environment mood, UI mock). Use an image-generation
  tool instead if Phase 0 found one.
- **Layout agent** → `design/concept/layout.svg`: top-down play-space diagram
  with dimensions in meters (XR scale is real scale — a desk is 0.75 m high).

Each agent reads `design/GAME_SPEC.md`; give them the file path, not a paste.
Present results (artifact tool if available, else file paths + one-line
descriptions). Ask for reactions if interactive; else proceed.

Gate: deck + at least one concept piece exist and match the spec.

Phases 2 and 3 both consume only the spec. They may run **concurrently** only
when `npx iwsdk reference status` already reports ready. Otherwise, let Phase 2
run while warmup finishes, then confirm readiness (or select the documented
fallback) before launching Phase 3. Both phases must be done before Phase 4.

## Phase 3 — Grounding (spec → IWSDK reality)

Goal: `design/TECH_PLAN.md` — every mechanic mapped to concrete IWSDK API
surface, so Phase 5 is assembly rather than discovery.

Playbook: `references/grounding.md` (reference CLI protocol, docs fallback
ladder, domain→API map, TECH_PLAN template). API ground truth:
`references/api-reference.md`.

Procedure:

1. Enforce the reference barrier: confirm `npx iwsdk reference status` is
   ready, or record which fallback from `references/grounding.md` will supply
   API evidence. Never fan out grounding agents while warmup is still running.
2. Derive research domains from the spec (typically: input & interaction,
   physics, locomotion, UI, audio, environment/lighting, assets/levels, and
   AR-specific surfaces if applicable).
3. Fan out one research agent per domain (or do them in sequence). Each
   agent: reads the spec + `references/grounding.md`, queries the reference
   system (`npx iwsdk reference search|api|components|systems|examples`) or
   the documented fallbacks, and returns table rows:
   `mechanic → classification (BUILT-IN | CONFIGURE | CUSTOM) → exact IWSDK
pieces (components/systems/feature flags) → custom work remaining → risks`.
4. Merge into `design/TECH_PLAN.md`: `iwsdk.config.json` world/feature block,
   the mechanics table, custom system specs (queries, priorities, globals),
   asset manifest (see Asset Strategy in `references/build-milestones.md`),
   and a risk list with mitigations.
5. Audit against the reinvention-risk table in `references/api-reference.md`:
   anything classified CUSTOM that IWSDK already provides gets reclassified.

Gate: no mechanic left unclassified; feature flags decided with prerequisites
checked (e.g. locomotion requires collision geometry); every CUSTOM item has
a sketched query/system design; asset list complete.

## Phase 4 — Architecture (tech plan → build plan)

Goal: `design/ARCHITECTURE.md` — the file-by-file, milestone-by-milestone
construction plan.

Playbook: `references/build-milestones.md` (template, scaffold flags,
milestone rules, sub-agent file-ownership rules).

Contents: scaffold command (exact `@iwsdk/create` flags) or existing-app
delta; file tree (one system per file); component schemas (names, fields,
Types); systems table (name, queries, priority band: 0–9 input / 10–19 sim /
20–29 visual sync / 30+ UI); globals signals; milestone plan — M0 "scaffold
renders" through M-final, each with a **demo criterion** (what you can see)
and **assertions** (what you will check via the CLI in Phase 6).

Gate: every spec mechanic traces to a milestone; every milestone has demo
criterion + assertions; user approved (or `[ASSUMED]`).

## Phase 5 — Build (milestone loop)

Goal: working code, one verified milestone at a time.

Playbook: `references/build-milestones.md`. API ground truth while coding:
`references/api-reference.md` — follow its best practices (stateless systems,
signals, cleanup, `createTransformEntity`, AssetManager, feature-flag
hygiene) and its anti-pattern list.

Rules:

- M0 baseline first: the app scaffolded at the Scaffold Checkpoint — or,
  when already inside a generated/existing IWSDK app (the common case for
  this skill), that app adopted as-is ("existing-app delta" in
  `references/build-milestones.md`; never scaffold a nested app). Run the
  verify loop once end-to-end (dev server up, screenshot, XR enter) _before_
  writing gameplay code. A broken baseline poisons every later diagnosis.
- **The main agent owns the dev server** and everything stateful (`iwsdk dev
up/down`, ports, browser). Sub-agents write code; they may run `npx tsc
--noEmit` but must not start servers.
- Parallel sub-agents only for genuinely independent modules, each owning a
  disjoint set of files; the main agent owns shared files (`src/index.ts`,
  component registry wiring) and integrates.
- After each milestone: `npx tsc --noEmit` → verify loop (Phase 6 subset for
  this milestone's assertions) → update Milestone Log in `design/PIPELINE.md`
  (+ commit — confirm once at Phase 5 start, or `[ASSUMED]` in autonomous
  mode; see `references/build-milestones.md`).
- When something fails, debug with the runtime tools (ecs pause/step/
  snapshot/diff, browser logs), not by staring at code — see
  `references/verification.md`.

Gate (per milestone): demo criterion observed + assertions pass + typecheck
clean.

## Phase 6 — Verify (whole-app pass)

Goal: `design/VERIFICATION.md` — evidence, per success criterion from the
spec, that the app does what the spec says.

Playbook: `references/verification.md` (the exact CLI loop, input-simulation
cheat sheet, assertion patterns, known traps, recovery ladder).

Run the full loop against the finished app: typecheck → dev up → connectivity
→ browser screenshot → XR enter → clean console → per-criterion scenario
(simulate inputs, assert via `ecs query`/`snapshot`/`diff`/screenshots/log
patterns). Record each criterion PASS/FAIL with the evidence (command +
output + screenshot path). Fix and re-run failures; a criterion the runtime
cannot demonstrate goes back to Phase 5, or gets renegotiated with the user.
Autonomous mode: after 2–3 focused fix cycles on a stubborn criterion, stop
looping — record it as FAIL under "Deferred / known gaps" in
`design/VERIFICATION.md` with the attempted evidence, mark the spec item
`[FAILED — deferred]`, and proceed to Phase 7 with the failure stated
prominently in the close-out report.

Gate: all MVP success criteria PASS with recorded evidence — or each failure
explicitly deferred with evidence of the attempts (autonomous mode).

## Phase 7 — Review & Ship

1. **Review** — run the `iwsdk-project-code-reviewer` agent (ships with IWSDK
   projects) over the code; apply Critical/Warning fixes; re-run the Phase 6
   assertions touched by the fixes. No agent tool, or the agent file missing?
   Review the diff yourself against `references/api-reference.md` — the
   Anti-Patterns list, the reinvention-risk table, and the Performance
   Tips — and record findings in the close-out report.
2. **Performance sanity** — VR frame budget is 11–14 ms: check for per-frame
   allocations, unthrottled queries, oversized textures (the reviewer flags
   most of these).
3. **Build** — `npm run build`; confirm `dist/` contains the changes
   (`grep` a distinctive pattern in `dist/assets/*.js`).
4. **Ship** — per user preference: static deploy of `dist/` (e.g.
   `npx gh-pages -d dist`), zip delivery, or just the local build
   (autonomous default: local build only; list deploy options in the
   close-out report).
5. **Close out** — final report: what was built vs the spec (including every
   `[ASSUMED]` decision), evidence summary, known gaps / stretch items, and a
   short retro (what to do differently next time) appended to
   `design/PIPELINE.md`.

---

## Quick Planning (single features)

For a contained feature in an existing app, skip the pipeline and run this
checklist (details in `references/api-reference.md`):

1. **Feature flags** — what built-ins does this need (locomotion, physics,
   grabbing, spatialUI, sceneUnderstanding…) and are their prerequisites met
   (e.g. locomotion needs collision geometry)?
2. **Check the reinvention-risk table** — is this already a built-in?
3. **Ground it** — `npx iwsdk reference search/api/examples` for the pieces
   you'll touch (protocol in `references/grounding.md`).
4. **Components** — what data, what Types, tag vs data components?
5. **Queries & reactivity** — how do systems find entities; qualify/
   disqualify subscriptions over polling; signals for state.
6. **Lifecycle** — who creates/destroys entities; `destroy()` vs `dispose()`;
   level persistence.
7. **Priority band** — 0–9 input, 10–19 sim, 20–29 visual sync, 30+ UI.
8. **VR vs AR vs browser** — behavior per mode; input per mode.
9. **Audio & feedback** — what plays on which interaction.
10. **Assets** — Asset Strategy in `references/build-milestones.md`.
11. **Verify plan** — which CLI assertions will prove it works
    (`references/verification.md`).

Then implement following the best practices and verify with the runtime loop.

## Reference Files

| File                             | Load when                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `references/api-reference.md`    | grounding, coding, reviewing — the API ground truth                                             |
| `references/ideation.md`         | Phase 1 — question bank + GAME_SPEC template                                                    |
| `references/design-deck.md`      | Phase 2 — deck/concept-art briefs + templates                                                   |
| `references/grounding.md`        | Phase 3 / Quick step 3 — reference CLI + fallbacks + TECH_PLAN template                         |
| `references/build-milestones.md` | Phases 4–5 — scaffold flags, architecture template, milestone & sub-agent rules, asset strategy |
| `references/verification.md`     | Phases 5–7 — runtime verify loop, input simulation, traps                                       |
