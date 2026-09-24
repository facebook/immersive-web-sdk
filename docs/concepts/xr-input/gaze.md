---
title: Gaze and Pinch
outline: [2, 3]
---

# Gaze and Pinch

IWSDK treats eye gaze as a single, session-wide ray pointer. Gaze chooses the
target; a pinch from either hand supplies the select action. Both steps use the
same pointer-event and ECS interaction path as existing hand and controller
rays, so targets do not need gaze-specific components or event handlers.

## Enable gaze

Request gaze tracking in `iwsdk.config.json`:

```json
{
  "world": {
    "xr": {
      "mode": "vr",
      "features": {
        "handTracking": { "required": true },
        "gazeTracking": true
      }
    },
    "features": {
      "grabbing": true
    }
  }
}
```

`gazeTracking: true` requests gaze as an optional WebXR feature. Use
`{ "required": true }` only when the experience cannot run without it;
otherwise a runtime without gaze would reject the entire immersive session.
`eyeTracking` remains a deprecated compatibility alias for `gazeTracking`.

Requesting the XR feature registers `GazeSystem`. The optional
`world.features.gaze` object only overrides its tuning defaults; it does not
enable gaze by itself.

## Interaction model and priority

Add the normal interaction components to a node in an
`.iwsdk.scene.json` file:

```jsonc
"components": {
  "RayInteractable": {},
  "DistanceGrabbable": {
    "movementMode": "MoveAtSource"
  }
}
```

React to the standard `Hovered` and `Pressed` ECS tags, or to ordinary Three.js
pointer events. Gaze reports `pointerType === "ray"`, and its pointer state
always includes `source: "gaze"` so an advanced target can distinguish it from
a hand or controller ray.

The default priority is:

1. An active near touch or grab suppresses gaze so direct manipulation wins.
2. A valid tracked gaze source owns far targeting.
3. When gaze is disconnected, hand and controller far rays resume immediately.
4. A temporarily invalid pose clears the gaze target but retains gaze ownership
   for `trackingLossGraceSeconds`; far rays resume if the pose does not recover.

IWSDK does not silently replace missing production gaze with head pose. A
head-directed gaze source is available only through explicit development
preview controls.

For a gaze-started distance grab, `pointerTransformFollowsHand` transfers the
captured pointer origin to the hand that pinched. `MoveAtSource` then follows
that hand's position delta without snapping the object to the hand.

The selection cone only chooses among existing ray-interactable targets. Once
it has a winner, the ordinary ray-pointer lifecycle owns hover, press, click,
capture, and grab. To accept hand/controller rays but reject gaze on one
advanced target, inspect the pointer state:

```ts
object.pointerEventsType = (_pointerId, pointerType, pointerState) =>
  pointerType !== 'ray' ||
  (pointerState as { source?: string } | undefined)?.source !== 'gaze';
```

## Visual feedback

Production gaze has no cursor by default. Give the target its own hover and
pressed feedback so users can see what will be selected. During development,
set `showDebugReticle: true` to render a white hit reticle:

```json
{
  "world": {
    "features": {
      "gaze": { "showDebugReticle": true }
    }
  }
}
```

## Test in the desktop emulator

Set `dev.emulator.device` to `metaVRGlasses`, which emulates Meta VR Glasses'
narrower field of view and exposes a gaze input source, then:

1. Start the managed server and enter XR.
2. In DevUI, select **Gaze + Hands**. This selects hand input and **Cursor**
   gaze together.
3. Move the pointer across targets and pinch with the configured commit hand
   to select or grab. Cursor gaze disables Play mode; right-drag to look around.
4. Set gaze mode to **Off** to remove the emulated gaze source and verify that
   hand rays resume.

The **Head** mode is an explicit emulator diagnostic. It is not a production
fallback.

## Test on a headset without eye tracking

The development-only target-device preview keeps the headset browser's native
viewer, hands, controllers, frame timing, and compositor. When the app requests
gaze, it adds a head-directed Meta VR Glasses test source:

```json
{
  "dev": {
    "targetDevicePreview": {
      "gazeSimulation": "head"
    }
  }
}
```

Set `gazeSimulation` to `false` to turn the preview off without removing the
block. The preview runs only in the Vite development server and is omitted from
production builds. Simulated head-directed gaze validates feature negotiation
and interaction plumbing; it does not validate eye-tracking accuracy.

## Drive tests from the CLI

With a managed emulator session, enter XR, aim gaze, pinch, and test fallback:

```bash
npx @iwsdk/cli xr enter
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
npx @iwsdk/cli xr look-at --input-json \
  '{"device":"gaze","target":{"x":0,"y":1.2,"z":-2}}'
npx @iwsdk/cli xr select --input-json '{"device":"hand-right"}'
npx @iwsdk/cli xr set-connected --input-json \
  '{"device":"gaze","connected":false}'
```

With `--native-xr-control`, the user enters XR in the headset first; then the
same gaze and synthetic-hand commands work through the full native override.
Use `set-select-value` instead of `select` for hold, move, and release
sequences.

## Tune targeting

All fields below are optional under `world.features.gaze`:

| Field                             | Default | Effect                                                                                |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `suppressWhenDirectPointerActive` | `true`  | Yield while either hand has an active near touch or grab.                             |
| `filterMinCutoff`                 | `1.5`   | 1€ filter cutoff; lower values are smoother but add lag.                              |
| `filterBeta`                      | `0.05`  | 1€ filter response; higher values react faster to large movements.                    |
| `dwellWindowSeconds`              | `0.15`  | Consensus window for stable targets; `0` uses each frame's winner.                    |
| `coneAngle`                       | `5`     | Selection-cone half-angle in degrees.                                                 |
| `maxRayLength`                    | `30`    | Maximum gaze ray and cone distance in meters.                                         |
| `pointerTransformFollowsHand`     | `true`  | Drive a captured pointer from the hand that committed the selection.                  |
| `logDiagnostics`                  | `true`  | Emit state-change diagnostics under the `[iwsdk][gaze]` prefix.                       |
| `showDebugReticle`                | `false` | Show the developer-only hit reticle.                                                  |
| `trackingLossGraceSeconds`        | `5`     | Retain gaze ownership across a transient invalid pose before restoring ordinary rays. |

Numeric values must be finite. `coneAngle` must be greater than `0` and less
than `180`; `maxRayLength` and `filterMinCutoff` must be greater than `0`;
`dwellWindowSeconds`, `filterBeta`, and `trackingLossGraceSeconds` must be
non-negative.

## Diagnose real gaze

The `[iwsdk][gaze]` console messages distinguish the common failure states:

| Message                                          | Meaning                                    |
| ------------------------------------------------ | ------------------------------------------ |
| `'gaze-tracking' was NOT granted`                | The runtime refused the requested feature. |
| `no XRInputSource with targetRayMode === "gaze"` | No eye-tracking input source appeared.     |
| `getPose(targetRaySpace) returned null`          | The source has no valid pose.              |
| `mapping XRTargetRaySpace onto the head pose`    | The runtime returned head-directed gaze.   |

The diagnostic compares the gaze and head rays for several seconds. A
head-directed target-device preview is recognized separately and logged as
intentional. For a complete implementation, see `examples/gaze-pinch`.
