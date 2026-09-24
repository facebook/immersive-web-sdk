# Gaze + Pinch Example

Demonstrates IWSDK's gaze + pinch multimodal input:

- Eye tracking drives a single global gaze pointer. When gaze disappears,
  ordinary hand/controller far rays take over immediately.
- Either hand's pinch commits a selection on the gaze candidate.
- Cards brighten and lift while looked at, scale their glow with pinch
  strength, and confirm a completed selection.
- The cube on the right adds **gaze grab**: look at it, pinch and hold, then
  move the committing hand. The cube follows the hand's position delta while
  keeping its original distance, then flies back to its plinth on release —
  no hand ray or snap-to-hand motion required.
- The spatial control panel demonstrates gaze hover on real UIKit controls.
  Pinch a color choice to restyle the cube, or reset its pose after a grab.

## Run

```bash
npm install
npm run dev
```

The dev server opens with the IWER emulator (Meta VR Glasses profile). Choose
the **Gaze + Hands** preset in DevUI to drive gaze with the cursor and use
either emulated hand for pinch. The application renders target-local hover and
selection feedback; it does not render a production gaze cursor. If your
hardware or runtime doesn't grant gaze tracking, hand/controller far rays
remain active.

On a Quest 3 running this development server, `dev.targetDevicePreview`
activates the Meta VR Glasses gaze preview: native head, hand, and controller
tracking stay browser-owned, and the requested gaze source is simulated from
head direction. This preview is omitted from production builds. Set
`gazeSimulation` to `false` to turn it off.

In full native override mode, the same CLI can steer gaze and either synthetic
hand for pinch input. The application must request the browser's hand-tracking
feature so the session can expose hand-shaped input sources. Browser-native
controller, hand, and transient-pointer sources remain suppressed while the
full override is attached.

## Is this real gaze?

Production gaze shows no cursor. Target hover feedback is the intended visual
confirmation. To diagnose targeting explicitly, set
`world.features.gaze.showDebugReticle` to `true` to show a white hit reticle.

The `[iwsdk][gaze]` console lines distinguish feature denial, a missing source,
an invalid pose, real eye movement, and a runtime that maps gaze onto head pose.
The intentional head-directed target preview is reported separately. See
[Gaze and Pinch](../../docs/concepts/xr-input/gaze.md) for the diagnostic table,
runtime behavior, and testing workflow.

## What to look at in the code

- `iwsdk.config.json` — opts into the `gazeTracking` XR session feature, which
  is what registers `GazeSystem`, plus `grabbing` for the gaze-grab cube.
- `public/scenes/gaze-pinch.iwsdk.scene.json` — places the interaction stage
  and cards, and marks each card `RayInteractable`. Gaze and hand rays share
  the same target contract; while gaze is active it owns far targeting, and
  near touch/grab interaction takes priority. The cube uses
  `DistanceGrabbable` for capture and `RayInteractable` for shared hover and
  press feedback across hand rays and the cone-assisted gaze ray.
- `src/assets.ts` — the cards, feedback-rich cube, two plinths, and luminous
  stage are procedural prototypes registered in the asset manifest, so the
  scene can reference them like any glTF.
- `src/gaze-card.ts` — reacts to the standard `Hovered` and `Pressed` tags.
  It reads `getPinchStrength()` for a continuous pre-commit affordance, drives
  the cube's hover/grab halo and arcing return flight from ordinary interaction
  tags, and updates the panel's interaction monitor. Its card query excludes
  `DistanceGrabbable` and `PokeInteractable` so the card animation does not
  affect the cube or panel.
- `src/panel.ts` — gives the UIKit palette native hover/active feedback, applies
  cube colors on selection, and resets the cube through the regular grab
  system.

## Gaze grab

Gaze is exposed as a ray pointer, so it can activate `DistanceGrabbable`
directly. The cone chooses the target, the ordinary ray pointer emits the
press, and the distance-grab handle captures that same pointer. At capture,
the pointer origin transfers to the pinching hand. `MoveAtSource` then applies
the hand origin's frame-to-frame delta to the cube, matching ISDK's separation
between gaze targeting and the selected motion provider. On release, the
sample eases the cube along a short arc to its authored pose above the right
plinth; another grab interrupts that return immediately.

```jsonc
"components": {
  "DistanceGrabbable": {
    "movementMode": "MoveAtSource",
    "rotate": false,
    "scale": false,
    "translate": true
  }
}
```

## Tuning

The example uses `GazeSystem` defaults. The canonical
[Gaze and Pinch](../../docs/concepts/xr-input/gaze.md#tune-targeting) guide lists
every `world.features.gaze` field and explains advanced per-target filtering.
