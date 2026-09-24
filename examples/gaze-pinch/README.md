# Gaze + Pinch Example

Demonstrates IWSDK's gaze + pinch multimodal input:

- Eye tracking drives a single global gaze pointer. When gaze disappears,
  ordinary hand/controller far rays take over immediately.
- Either hand's pinch commits a selection on the gaze candidate.
- Cards highlight softly while looked at, scale their glow with pinch
  strength, and pop forward when the pinch fires.
- The orange cube adds **gaze grab**: look at it, pinch, and it flies to your
  hand and tracks it until you let go — no hand ray required.

## Run

```bash
npm install
npm run dev
```

The dev server opens with the IWER emulator (Meta VR Glasses profile). Choose
the **Gaze + Hands** preset in DevUI to drive gaze with the cursor and use
either emulated hand for pinch. If your hardware or runtime doesn't grant gaze
tracking, hand/controller far rays remain active.

On a Quest 3 running this development server, `dev.targetDevicePreview`
activates the Meta VR Glasses gaze preview: native head, hand, and controller
tracking stay browser-owned, and the requested gaze source is simulated from
head direction. This preview is omitted from production builds. Set
`gazeSimulation` to `false` to turn it off.

In native override mode, the same CLI can steer gaze and either synthetic hand
for pinch input. The application must request the browser's hand-tracking
feature so the session can expose hand-shaped input sources. Browser-native
controller, hand, and transient-pointer sources remain suppressed while the
override is attached.

## Is this real gaze?

Production gaze shows no cursor. Target hover feedback is the intended visual
confirmation. To diagnose targeting explicitly, set
`features.gaze.showDebugReticle` to `true` to show a white hit reticle.

For the reason, read the `[iwsdk][gaze]` console lines. They separate the
relevant tracking states:

| Message                                          | What it means                                              |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `'gaze-tracking' was NOT granted`                | The runtime refused the feature — check the browser build. |
| `no XRInputSource with targetRayMode === "gaze"` | Granted, but no eye-tracking device surfaced.              |
| `getPose(targetRaySpace) returned null`          | Source exists, no valid pose: permission or calibration.   |
| `mapping XRTargetRaySpace onto the head pose`    | Real poses, but the runtime is handing back the head ray.  |

That last one can only be found by measurement, so the pointer compares the
gaze ray against the head ray for the first few seconds of a session and logs
a verdict with the numbers — the same test the standalone
`webxr-eye-gaze-diagnostic.html` page runs. `real eye movement observed`
means gaze is genuinely working. The intentional head-directed Quest target
preview is recognized separately and reports an informational preview message,
not a runtime warning.

## What to look at in the code

- `iwsdk.config.json` — opts into the `gazeTracking` XR session feature, which
  is what registers `GazeSystem`, plus `grabbing` for the gaze-grab cube.
- `public/scenes/gaze-pinch.iwsdk.scene.json` — places the cards and marks each
  one `RayInteractable`. Gaze and hand rays share the same target contract;
  while gaze is active it owns far targeting, and near touch/grab interaction
  takes priority. The cube uses
  `DistanceGrabbable`, which is already an implicit ray target for both hand
  rays and the cone-assisted gaze ray.
- `src/assets.ts` — the cards and the cube are procedural `Mesh` prototypes
  registered in the asset manifest, so the scene can reference them like any
  glTF.
- `src/gaze-card.ts` — reacts to the standard `Hovered` and `Pressed` tags.
  Reads `getPinchStrength()` for a continuous pre-commit affordance. Its query
  excludes `DistanceGrabbable` and `PokeInteractable` so the highlight lerp
  doesn't affect the drag cube or welcome panel.

## Gaze grab

Gaze is exposed as a ray pointer, so it can activate `DistanceGrabbable`
directly. The cone chooses the target, the ordinary ray pointer emits the
press, and the distance-grab handle captures that same pointer. While captured,
the pointer origin and motion follow the pinching hand.

```jsonc
"components": {
  "DistanceGrabbable": {
    "movementMode": "MoveTowardsTarget",
    "targetPositionOffset": [0, 0, -0.25],
    "moveSpeedFactor": 0.2
  }
}
```

## Tuning

The example uses `GazeSystem` defaults. Pass `features.gaze` in
`iwsdk.config.json` (or `configData` to
`world.registerSystem`) to change them:

| Field                             | Default | Effect                                                                                          |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `suppressWhenDirectPointerActive` | `true`  | Gaze yields whenever a near touch/grab pointer is in HOVER or SELECT on either hand.            |
| `filterMinCutoff`                 | `1.5`   | 1€ filter min cutoff. Lower = smoother but laggier.                                             |
| `filterBeta`                      | `0.05`  | 1€ filter beta. Higher = less smoothing during fast saccades.                                   |
| `dwellWindowSeconds`              | `0.15`  | Sliding window for dwell consensus. `0` picks the raw per-frame winner.                         |
| `coneAngle`                       | `5`     | Half-angle of the selection cone, in **degrees**. Wider = easier small targets, more ambiguity. |
| `maxRayLength`                    | `30`    | Maximum gaze cone/raycast distance in meters.                                                   |
| `pointerTransformFollowsHand`     | `true`  | Once selected, the pinching hand's ray pose drives captured interactions.                       |
| `logDiagnostics`                  | `true`  | Emit the `[iwsdk][gaze]` console lines above.                                                   |
| `showDebugReticle`                | `false` | Show an opt-in white gaze hit reticle.                                                          |
| `trackingLossGraceSeconds`        | `5`     | Keep gaze mode active briefly after tracking becomes invalid before restoring far rays.         |

The cone only chooses among the existing ray targets. Once it has a winner,
the gaze pointer bends toward that target and uses the normal
`@pmndrs/pointer-events` ray lifecycle. This is why the same pinch can click the
welcome panel, set `Hovered` / `Pressed` on cards, or capture the distance-grab
cube without a parallel gaze-only event path.

Gaze intentionally reports `pointerType === "ray"`. If an advanced target must
accept hand rays but reject gaze, use a functional `pointerEventsType` policy
and inspect the pointer state instead of adding another ECS component:

```ts
object.pointerEventsType = (_pointerId, pointerType, pointerState) =>
  pointerType !== 'ray' ||
  (pointerState as { source?: string } | undefined)?.source !== 'gaze';
```
