# Review And Stop

Use this reference after each authored module and again after root composition.
Review logic and evidence live in ordinary task files. The editor supplies raw,
authoritative observations; it does not own the review workflow.

## Inputs

Retain:

- root and module paths;
- source, composed, runtime, capability, and screenshot hashes;
- exact camera state and resolution;
- renderer environment and render statistics;
- reference image regions and assumptions;
- required features with owning IDs and acceptance criteria.

Call `scene_render_file` for off-document validation and rendering through the
command-ready managed editor browser. A result is usable only when `valid` is true
and an authoritative PNG is returned. A custom renderer is diagnostic evidence, not
a substitute. For the open root use `scene_get_state`, `scene_set_camera`, and
`scene_screenshot`.

## Object Review

Review identity-critical objects before judging the full scene. Capture each required
view under neutral form-reading conditions and representative final lighting.

For every object inspect:

1. silhouette;
2. major proportions;
3. required parts;
4. negative spaces;
5. support contacts and placement;
6. material response;
7. appearance in context.

Use `scene_set_preview_visibility` for temporary solo-with-context or ghosted views.
It must not change scene hashes. Store observations and screenshot references in the
task evidence, not in the scene editor.

## Composition Review

Review in this order:

1. **Layout**: hierarchy, scale, support contacts, top/front/side arrangement, floor
   and backdrop coverage.
2. **Geometry**: alternate-angle volume, silhouette, proportions, occlusion, and
   identity-critical details.
3. **Final**: materials, color, light, environment, shadows, and hero framing.
4. **Spawn**: inspect the exact player-origin view at standing eye height and confirm
   that no authored geometry intersects the player's standing volume.

For image-driven work, align source and render at the same aspect ratio. Use explicit
source regions and measurable projected bounds. `scene_measure_image_regions` is
appropriate only when source/render alignment and the requested color, luma,
highlight, or shadow statistic are meaningful.

Do not present an estimated decimal as a measured score. Record categorical outcomes
and actual measurements separately.

## Defects

Classify the largest remaining defect as one of:

- `contract`: requirement or ownership is wrong or incomplete;
- `resource`: asset/material cannot express the requirement;
- `scene`: geometry, placement, hierarchy, or lighting is wrong;
- `camera`: projection, pose, crop, or framing is wrong;
- `runtime`: composed and live application results differ.

Fix the owning module or root file directly. Rerender the changed module first and
then the root. Preserve the previous evidence so regressions are visible.

## Performance Review

Use render statistics returned by `scene_get_state`, `scene_screenshot`, or
`scene_render_file`. Treat gratuitous draw calls, unique repeated geometry, large
textures, and unnecessary shadow casters as defects. Desktop/browser frame samples
are diagnostics, not calibrated headset performance.

## Stop Rules

Default to at most two focused correction rounds after the first complete review.
Stop earlier when:

- the same defect repeats;
- two changes oscillate;
- applicable diagnostics plateau or regress;
- required input or assets are missing;
- the representation ceiling cannot satisfy a required feature;
- a user decision is required.

Completion requires all scratch-module renders to pass, a flattened import-free root,
a clean conflict-free editor state, nonblank required views (including player spawn),
passing required features, and a live application runtime bound to the expected
root/runtime hash. There is no editor publish tool; record the final evidence and
verify the application build normally.
