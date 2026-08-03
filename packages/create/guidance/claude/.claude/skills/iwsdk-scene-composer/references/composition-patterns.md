# Composition Patterns

## Contents

1. Representation Ladder
2. Object Reconstruction
3. Environment Composition
4. Repetition
5. Camera And Lighting
6. Cost Control

## Representation Ladder

Match silhouette and proportions before surface detail. All visible scene content is
an `asset` reference, but the registered asset may be a glTF or a procedural
`Object3D`. Choose the lowest-complexity asset implementation that preserves every
required feature:

| Form                                    | Asset implementation       |
| --------------------------------------- | -------------------------- |
| Rectilinear mass, panel, slab           | Box geometry               |
| Soft-edged block, cushion, casing       | Rounded-box geometry       |
| Rounded mass, joint, crown              | Scaled sphere geometry     |
| Pole or simple column                   | Cylinder or cone geometry  |
| Rotational vessel, turned seat, shade   | Lathe geometry             |
| Wheel, ring, circular handle            | Torus geometry             |
| Limb, padded rail, soft elongated body  | Capsule geometry           |
| Flat profile with meaningful outline    | Shape/extrude geometry     |
| Branch, pipe, cable, bicycle frame      | Tube along explicit points |
| Reusable part hierarchy                 | Procedural asset or prefab |
| Repeated compatible detail              | Deterministic pattern      |
| Identity-critical asset already present | Registered glTF asset      |

Create geometry and materials in an asset module and register its parentless root in
the manifest. Keep composition and repetition in scene JSON. Do not force an organic
continuous form into a single box, and do not import an opaque glTF solely to avoid a
small deterministic procedural asset.

## Object Reconstruction

Build one semantic hierarchy in this order:

1. root at a stable support/pivot point;
2. primary masses and bounding proportions;
3. structural connectors and negative spaces;
4. silhouette-defining secondary forms;
5. repeated identity details;
6. shared material families and small accents in asset code.

Keep parts separate when their boundary, material, or transform matters. Merge visual
noise into a larger form when it cannot affect a required view.

Every layout-critical semantic group must contain actual coarse renderables for its
primary masses. Keep those assets, instances, or patterns visible in the `layout`
lens. An empty group is a useful transform root and feature binding, but it
has no bounds, pixels, support contact, or silhouette and therefore cannot be the
group's layout proxy.

### Stool Or Small Furniture

- seat: lathe, cylinder, extruded outline, or shallow rounded box;
- legs: tapered cylinders or capsules, parented under the root;
- braces: tubes/cylinders between measured endpoints;
- upholstery: scaled capsule/sphere or layered rounded masses;
- seams/buttons: sparse repeated small geometry only when identity-critical.

Place the root on the floor. Check seat height and leg spread in front and side views.
Preserve negative space between legs.

### Armchair And Reading Furniture

Compose seat cushion, back cushion, arms, frame, and legs as independent parts. Use
rounded boxes, scaled capsules/spheres for soft cushions, and boxes/tubes for the
frame. Overlap soft parts slightly to avoid visible gaps. Match the outer silhouette
and seat/back angle before seams or buttons.

### Mechanical Prop Or Generator

Start with chassis and major cylindrical/box volumes. Add one hierarchy per visible
system: frame, tank, vents, control panel, handles, cables, fasteners. Use exact
patterns for manufactured vents/bolts. Use tubes for cables and pipes. Keep painted
metal dielectric; reserve high metalness for exposed metal.

### Bicycle Or Thin Frame

Use two wheel cylinders/tori in a procedural asset, or use a registered glTF when
silhouette fidelity requires it. Build a procedural frame from tubes between stable
joint points. Use separate
fork, handlebar, crank, saddle, and pedal groups. Verify wheel coplanarity, contact
with ground, and frame negative spaces from a side view, then check real volume from a
quarter view.

### Animal Or Organic Character Blockout

Use a root at ground contact, capsules/ellipsoids for torso and limbs, spheres for
joints/head, cones or extrudes for ears/tail accents, and tubes for curved tails.
Preserve pose, body proportions, leg contacts, head direction, and silhouette before
facial detail. A procedural animal assembled from simple geometry is a stylized
blockout; state the ceiling when fur, anatomy, or likeness is required.

### Tree, Stump, Or Plant

Use a tapered cylinder/extrude for the trunk, tubes for branches/roots/stems, scaled
spheres/cones or extruded leaves for foliage. Model major silhouette branches
explicitly. Use deterministic seeded patterns for compatible smaller branches/leaves,
with bounded count and variation. Avoid a uniform sphere when the reference depends on
an irregular crown or gnarled outline.

### Tent Or Fabric Shelter

Use an extruded triangular/arched profile or thin planes for fabric panels, tubes for
poles, and cylinders/tubes for guy lines. Keep planes double-sided only where needed.
Offset layered flaps to avoid z-fighting. Verify support points and interior opening
from front and quarter views.

### Lantern Or Transparent Vessel

Build the metal frame first, then a low-opacity double-sided glazing proxy when
supported. Use cylinders/extrudes for body and cap, tubes for cage/handle, and a small
emissive interior source plus actual light when required. Scalar opacity does not
provide refraction; record that limitation.

### Arch Or Masonry Opening

Prefer one extrude with an explicit opening hole for a clean arch silhouette. Otherwise
compose two pillars and a ring of wedge-like repeated blocks, keeping the opening
unobstructed. Model the void, not a painted arch on a solid wall. Use irregular but
bounded variation only after the main curve and support contact are correct.

## Environment Composition

Use a shallow semantic hierarchy:

```text
scene
  ground-and-paths
  architecture
  focal-cluster
  furniture-and-props
  vegetation
  lights
```

### Architecture

Create one group per building. Start with body, roof, foundation, primary openings,
and large facade bands. Add window/balcony prefabs only after one module is correct.
Use a consistent facade offset of roughly `0.01..0.04` meters to prevent z-fighting.
Infer floor height from doors or people when visible; otherwise record a conventional
scale assumption.

### Roads, Paths, And Ground

Use thin boxes for surfaces needing reliable support bounds. Use polygon/extrude for
irregular patios or paths. Put lane/edge markings slightly above the surface. Avoid
overlapping coplanar planes. Validate layout from top and vertical contact from front.

For a studio floor or seamless background support, use one surface large enough to
cover the scene footprint and every required, alternate, and diagnostic camera
frustum. Match its base value to the environment background when continuity is
intended, while preserving enough lighting response to show contact shadows. Inspect
every exact saved view for a horizon, diagonal plane edge, corner, or value seam; a
hero-only edge check is insufficient. Mark oversized infrastructure nodes
`framingRole: "support"` and fit the camera to `framingBounds`; use raw `worldBounds`
and exact-view captures to verify support coverage, so the oversized support neither
clips nor inflates subject framing.

### Furniture Clusters

Preserve reachability and conversational orientation: chairs face the focal center,
tables sit at usable height, lamps stand beside rather than inside furniture, and
objects share the same support surface. Bind the cluster and each identity-critical
object to feature criteria.

### Vegetation Borders

Model prominent plants explicitly. Use prefabs and deterministic scatter/along-path
patterns for background beds. Separate trunk/stem and crown/leaf material families.
Vary scale/yaw within a narrow range and keep the distribution reproducible.

### Vehicles And People

Use a group origin at ground contact. For vehicles, compose body/cabin/wheels and
orient the group along the path. For distant people, register simplified procedural
assets with torso/head/limb geometry and preserve height/stance. Avoid identical
prominent poses.

## Repetition

Use exact grid/linear/radial/along-path patterns for manufactured structures and
seeded scatter for organic distribution. Name the algorithm/version and seed.

Build and validate one prefab before instancing. Keep local IDs semantic. Use explicit
instances when individual components or unique transforms are required. Material
variants are separate manifest assets, not scene overrides.
Use a pattern only when all instances can share compatible render content.

Do not add hundreds of explicit nodes when a bounded pattern expresses the same
authoring intent. Do not use a pattern to hide meaningful per-instance differences.

## Camera And Lighting

Treat the player spawn as a required application camera, not an incidental origin.
Unless `player.transform` says otherwise, the player's feet are at `[0, 0, 0]` and
their first-person view is approximately `[0, 1.6, 0]`. Keep that standing volume
clear and inspect a saved spawn view before accepting the composition.

Tune a reference camera in this order:

1. target at the composition/object center;
2. projection type;
3. azimuth for visible side proportions;
4. elevation for visible top area;
5. distance/FOV or orthographic height for framing;
6. geometry/placement for remaining overlap differences.

Never distort support or obvious volume solely to match one view. Validate a
non-planar form from at least one alternate angle.

Use lights to reveal authored form rather than paint lighting into base color. For a
studio or product scene, prefer Room IBL plus one or two rectangular area lights and
a low-intensity shadow-casting directional light when contact shadows matter. For a
broad environment, ambient/hemisphere fill plus a directional key remains useful.
Author lights as ECS components. Directional, spot, and rectangular area lights emit
along their node's local `-Z` axis, so aim them with the node rotation. Keep review
geometry lighting neutral and separate from final-look lighting.

## Cost Control

- Use low segment counts for small/distant curved parts and increase only when a
  required silhouette visibly benefits.
- Instance compatible repetition. Record the expanded count and draw-call lowering.
- Disable shadow casting on tiny repeated trim, leaves, fasteners, and markings unless
  their shadows carry a required feature.
- Begin with `castShadow: false` on assets, then opt in focal grounded
  masses deliberately. Treat more than one shadow caster per four visible meshes as
  a review trigger, not as physical-device performance proof; retain a feature-based
  justification for any exception.
- Avoid hidden back-side detail that cannot affect any required or application view.
- Reuse material instances inside asset modules instead of gratuitous one-off values.
- Keep transparent surfaces sparse and inspect sorting from required views.
- Record raw calls, triangles, programs, textures, shadow casters, and frame samples;
  do not substitute node count for measured renderer cost.
