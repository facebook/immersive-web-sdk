Hey @felixtrz 👋

I ran your skills through `tessl skill review` at work and found some targeted improvements. Here's the full before/after:

![Skill Review Score Card](score_card.png)

| Skill | Before | After | Change |
|-------|--------|-------|--------|
| test-level | 47% | 89% | +42% |
| test-ui | 59% | 95% | +36% |
| test-grab | 55% | 89% | +34% |
| test-environment | 55% | 81% | +26% |
| test-all | 64% | 89% | +25% |
| test-audio | 64% | 89% | +25% |
| test-interactions | 64% | 89% | +25% |
| test-locomotion | 75% | 100% | +25% |
| test-ecs-core | 64% | 81% | +17% |
| test-physics | 73% | 89% | +16% |
| xr-mode-test | 88% | 100% | +12% |
| iwsdk-debug | 91% | 100% | +9% |
| click-target | 88% | 95% | +7% |

<details>
<summary>Changes made</summary>

The main improvement across all skills was adding explicit **"Use when..."** trigger clauses to frontmatter descriptions. This is the single most impactful change for skill discoverability — it tells Claude exactly when to select each skill.

**Specific changes:**
- **Test skills (test-all, test-audio, test-ecs-core, test-environment, test-grab, test-interactions, test-level, test-locomotion, test-physics, test-ui):** Added "Use when..." clauses with natural language trigger terms (e.g., "testing VR movement systems", "debugging player locomotion") alongside the technical terms already present
- **click-target:** Expanded trigger terms to include "tapping", "selecting", "VR/AR/WebXR" variations
- **xr-mode-test:** Added "VR/AR/WebXR" alternative terms and "immersive session initialization" triggers
- **iwsdk-debug:** Added explicit "Use when..." clause for debugging physics glitches, animation stutters, collision issues
- **iwsdk-ui-panel:** Added specific capabilities ("ScreenSpace preview", "backdrop techniques", "creating panel layouts")
- **iwsdk-ui:** Reorganized description to lead with capabilities, added "dashboard interfaces" and "widget layouts" trigger terms
- **iwsdk-planner (both copies):** Added concrete action verbs ("providing architectural patterns, code review checklists, and implementation guidelines")
- **All descriptions:** Normalized to quoted string format in frontmatter

</details>

Honest disclosure — I work at @tesslio where we build tooling around skills like these. Not a pitch - just saw room for improvement and wanted to contribute.

Want to self-improve your skills? Just point your agent (Claude Code, Codex, etc.) at [this Tessl guide](https://docs.tessl.io/evaluate/optimize-a-skill-using-best-practices) and ask it to optimize your skill. Ping me - [@rohan-tessl](https://github.com/rohan-tessl) - if you hit any snags.

Thanks in advance 🙏
