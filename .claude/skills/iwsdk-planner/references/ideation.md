# Phase 1 Playbook — Ideation

Turn an idea into `design/GAME_SPEC.md`. The spec is the contract for every
later phase: design renders it, grounding maps it, milestones implement it,
verification asserts it. Vague spec = expensive rework.

## How to Ask

- **Batch** 3–4 questions per round; never one-at-a-time drip. Structured
  question tools typically cap a call at 4 questions with 2–4 options each
  (AskUserQuestion allows at most 4) — split an oversized round into two
  consecutive calls rather than dropping questions.
- Every question offers 2–4 **opinionated options** with a recommended
  default and one-line trade-offs. Developers react better than they invent.
- Use the harness's structured question tool (e.g. AskUserQuestion) when
  available; otherwise a compact markdown list.
- 2 rounds is the target, 3 the max. If answers open a genuinely new axis
  (e.g. "actually it's multiplayer"), that justifies a round; taste
  refinements do not.
- **Autonomous mode:** answer every question yourself with the most
  defensible default, mark each `[ASSUMED]`, and add a "Questions I would
  have asked" appendix to the spec so the developer can revisit them later.

## Question Bank

Pick what's undetermined by the user's idea — skip what's already clear.

**Platform & mode (round 1, always)**

- VR (`ImmersiveVR`), AR/passthrough (`ImmersiveAR`), browser-first
  (`xr: false`), or dual (XR + browser fallback)? Dual costs extra input
  work but makes the app testable anywhere.
- Target device (Quest-class headset? phone AR? desktop browser?).
- Play space: seated / standing / room-scale? → drives locomotion + comfort.

**Core loop (round 1, always)**

- What does the player _do_ every 30 seconds? (verbs: grab, throw, aim,
  place, dodge, build, inspect…)
- What's the objective and the failure state? Score, timer, lives, zen?
- Session length target (2-minute toy vs 20-minute session).

**Mechanics detail (round 2)**

- For each verb: which hand(s)? near grab or distance grab? snap or free?
- Physics-driven or scripted outcomes? (bouncing/stacking/throwing → physics)
- Movement: none / teleport / smooth slide / both? Jumping?
- Win/lose feedback: what does the player see/hear on success and failure?

**Presentation (round 2)**

- Art direction: 2–3 adjectives + a palette hint (e.g. "neon arcade night",
  "warm wooden workshop"). Realistic assets need sourcing; stylized
  primitives can be built in code.
- Environment: skybox gradient? textured dome? modeled room?
- Audio moments: ambient loop? per-interaction SFX? music?

**Scope & success (round 2, always)**

- MVP in one sentence — the smallest thing that demonstrates the fantasy.
- Stretch list — what's explicitly _not_ MVP.
- 3–6 success criteria, each observable at runtime (see below).

**AR-specific (when applicable)**

- Does virtual content interact with real surfaces (tables/walls/floor)?
- Placement: tap-to-place, controller ray, auto-anchor?
- Occlusion by real objects needed?

## Success Criteria Must Be Observable

Phase 6 will assert every criterion with the runtime CLI. Good criteria name
an action and a checkable outcome:

- ✅ "Grabbing a ball and releasing it toward the pins knocks at least one
  pin over (pin rotation changes >45°)."
- ✅ "Score panel increments within 1s of a target being hit."
- ❌ "The game feels satisfying." (not assertable — turn it into proxies:
  SFX plays on hit, hit target flashes, etc.)

## GAME_SPEC.md Template

```markdown
# <Title> — Game Spec

**Pitch.** <2–3 sentences: fantasy + loop + platform.>

**Pillars.** <3 bullets that arbitrate future trade-offs.>

## Platform & Mode

- Session: ImmersiveVR | ImmersiveAR | browser-first | dual (XR + browser)
- Device target: <…> · Play space: seated|standing|room-scale
- Comfort: <teleport-only / vignette / stationary — and why>

## Core Loop

<One paragraph: the 30-second loop. Then:>

1. <beat> → 2. <beat> → 3. <beat> → repeat/escalate.

## Mechanics

| #   | Mechanic | Player verb  | Notes                      |
| --- | -------- | ------------ | -------------------------- |
| M1  | <name>   | grab/throw/… | <hand, distance, physics?> |

## Space & Locomotion

- World size: <e.g. 4×4 m room> · Locomotion: none|teleport|slide|both
- Collision geometry source: <floor plane / modeled room / native scene document>

## UI Surfaces

- <e.g. floating score panel (world-space, follows player), main menu panel,
  browser-mode HUD>

## Audio

- <ambient loop? SFX list keyed to mechanics: grab, hit, win…>

## Art Direction

- <adjectives, palette, asset approach: code-built primitives / GLTF assets>

## Scope

- **MVP:** <one sentence + the mechanics included>
- **Target:** <MVP + …>
- **Stretch (non-goals for now):** <list>

## Success Criteria (asserted in Phase 6)

| #   | Criterion (observable) | How it will be checked              |
| --- | ---------------------- | ----------------------------------- |
| S1  | <…>                    | ecs diff / screenshot / log pattern |

## Decisions & Assumptions

| Decision | Chosen   | Why      | Source           |
| -------- | -------- | -------- | ---------------- |
| <axis>   | <choice> | <reason> | user / [ASSUMED] |

## Questions I would have asked (autonomous mode only)

- <question — chosen default — what would change if answered differently>
```

## Sizing Guidance

Right-size the MVP to what one agent session can build _and verify_: 2–4
mechanics, 1 environment, 1–2 UI panels, 3–8 custom components, 2–5 custom
systems. Physics, grabbing, spatial UI, audio, and environment theming are
nearly free (built-ins); multiplayer, persistence, custom shaders, and
skeletal animation are expensive (custom). If the idea is big, put the
expensive parts in Stretch and say so in the pitch summary.
