# Phase 2 Playbook — Design Deck & Concept Art

Make the spec visible. The developer should be able to _look_ at the game
before any code exists — and veto the look, the layout, or the loop cheaply.

Inputs: `design/GAME_SPEC.md`. Outputs: `design/deck.html`,
`design/concept/*.svg` (or generated images), `design/concept/layout.svg`.

## Capability Ladder (from Phase 0 probe)

| Capability found           | Concept art                    | Deck presentation                  |
| -------------------------- | ------------------------------ | ---------------------------------- |
| Image-generation tool      | generate key art + mood images | embed images in deck               |
| None (default)             | hand-authored SVG              | self-contained HTML file           |
| HTML artifact/preview tool | —                              | publish deck for viewing           |
| Terminal only              | —                              | give file path + per-slide summary |

Never block on a missing capability — degrade and note it in `PIPELINE.md`.

## Deck: `design/deck.html`

Self-contained single file: inline CSS, no external fonts/scripts/CDNs, works
from `file://`. One `<section class="slide">` per slide, 16:9 layout,
arrow-key + click navigation via a small inline script, slide counter.
Dark background with the game's palette as accents (pull actual hex values
from the spec's art direction — the deck should _feel_ like the game).

Slide outline (adapt, don't pad):

1. **Title** — name, one-line pitch, platform badge (VR/AR/browser).
2. **Fantasy & pillars** — the 3 pillars, each with a one-line consequence
   ("Pillar: instant fun → no menus before the first throw").
3. **Core loop** — a diagram (inline SVG boxes/arrows), 3–5 beats, timed.
4. **Mechanics** — one row per mechanic: verb, input, response, feedback.
5. **The space** — embed `concept/layout.svg`; call out dimensions, player
   start, interaction zones.
6. **Key moment** — embed the hero concept piece; caption the emotional beat.
7. **Interaction model** — controls per platform (VR controllers / hands /
   keyboard+mouse), one table.
8. **Art & audio direction** — palette swatches (actual hexes), material
   notes, audio moment list.
9. **Scope** — MVP / target / stretch as three columns; success criteria.
10. **Tech snapshot** — one slide only: session mode, feature flags,
    known-custom systems (from spec; refined in Phase 3).

## Concept Art: hand-authored SVG that doesn't look programmer-made

SVG is the reliable fallback and can look genuinely good if you treat it as
illustration, not as a diagram:

- **Compose in layers**: sky/background gradient → far silhouettes → mid
  shapes → subject → foreground accents → lighting effects.
- **Use the palette**: define 5–7 colors in `<defs>` as gradients; reuse
  them everywhere. Consistent palette reads as intentional art.
- **Light**: one light direction; add a `radialGradient` glow, rim-light
  strokes on the subject, and soft shadow ellipses under objects.
- **Atmosphere**: layered opacity (fog planes at 10–30%), stars/particles as
  small circles with varying opacity, vignette via an inset radial gradient.
- **Silhouette over detail**: shapes with strong outlines beat fussy detail;
  10–40 elements per piece is plenty.
- 1600×900 viewBox for scenes; embed via `<img>` or inline in the deck.

Standard set (2–4 pieces):

- `concept/key-moment.svg` — the hero shot: mid-action, player POV or
  three-quarter view of the climax beat.
- `concept/environment.svg` — the space at rest; establishes mood/palette.
- `concept/ui-mock.svg` — main panel(s) at rough proportions with real
  label text (this seeds the `.uikitml` work later).

## Layout Diagram: `design/concept/layout.svg`

Top-down, **meters as first-class**: draw a scale bar; label distances.
Include: play-space boundary, player start + facing arrow, every interactive
object (labeled with mechanic #), UI panel positions + heights, locomotion
destinations if any. XR is real scale — tables are ~0.75 m, standing eye
height ~1.6 m, comfortable reach ~0.6 m, comfortable UI distance 1.5–2.5 m.
This diagram becomes the entity placement table in Phase 4, so positions
drawn here should already be plausible `[x, y, z]` values.

## Sub-agent briefs (when fanning out)

Give each agent: the spec path, this file's path, the exact output path(s),
and "return a one-paragraph summary; the file is the deliverable". Deck,
concept set, and layout are independent — run them in parallel. Review all
outputs yourself against the spec before presenting: palette consistency,
mechanic names matching the spec, no placeholder lorem text.

## Presenting

- Artifact/preview tool available → publish the deck; link concept pieces.
  If the tool wraps content in its own HTML skeleton (some artifact tools
  do), keep `deck.html` standalone on disk and strip the
  `<!doctype>/<html>/<head>/<body>` wrapper only in the published copy.
- Remote/cloud harness with a file-send mechanism → send `design/deck.html`
  and the concept pieces to the user directly (rendered when supported).
- Otherwise → list file paths with one-line descriptions and tell the user
  how to open them (`open design/deck.html` / drag into a browser).
- Interactive mode → ask 2–3 pointed reaction questions (look right? layout
  right? anything to cut?). Autonomous → proceed; note in PIPELINE.md that
  design is unreviewed.
