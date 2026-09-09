---
name: iwsdk-grab
description: Use emulated XR controllers to verify proximity grabbing for OneHandGrabbable and TwoHandsGrabbable objects. Use for pick up, move, release, or regression-test requests involving near-hand grab with the squeeze button.
argument-hint: '(use the current request)'
---

# IWSDK Proximity Grab

Use this workflow only for `OneHandGrabbable` or `TwoHandsGrabbable`. A
`DistanceGrabbable` uses the ray/trigger path instead.

## Execute the requested path

1. Check XR session state and enter XR only when inactive.
2. Find the named live entity and query its components and transform. If it is
   absent, list nearby grabbable matches once and stop with the evidence.
3. Confirm it has `OneHandGrabbable` or `TwoHandsGrabbable`. Do not guess the
   interaction type from its name.
4. Animate the requested controller to the object. Default to the right
   controller only when the user did not choose a hand.
5. Press and hold squeeze/grip button index `1`:

   ```json
   {"device":"controller-right","buttons":[{"index":1,"value":1}]}
   ```

6. Query the entity for `Grabbed` or another requested observable state. If the
   grab did not qualify, make one focused correction to controller position and
   retry once.
7. If movement was requested, animate the held controller to the destination.
8. Release squeeze with index `1`, value `0`, then query the final transform or
   state. Move the controller away only when overlap would interfere with the
   result.

Do not use trigger index `0`, `xr select`, or teleport-style device mutation for
proximity grab. Do not edit source merely to make an existing named entity easier
to locate; report missing runtime identity when that is the actual defect.

## Evidence and stopping

Prefer measured ECS state over screenshots. Capture one runtime image only when
the user requested visual evidence or placement must be judged. Batch related
queries and avoid repeating session, hierarchy, or transform discovery after a
successful read.

When the request names an artifact path, save it directly with
`npx iwsdk browser screenshot --output-file <path>`. A screenshot returned only
to model context does not satisfy a requested file deliverable.

Stop once the requested grab/move/release path and final state are proven. Leave
the controller released and the XR session in the state the user requested.
