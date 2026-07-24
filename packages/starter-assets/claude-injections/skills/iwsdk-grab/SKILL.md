---
name: iwsdk-grab
description: Grab an object in the WebXR scene using emulated controllers. Use when the user wants to pick up, move, or test grabbing an object. Supports OneHandGrabbable and TwoHandsGrabbable components which use proximity-based grip (squeeze button), not trigger.
argument-hint: <object-name> [destination]
---

# Grab Object

Grab an object in the XR scene using the IWER emulated controllers. The workflow has a **required core** (steps 1-5) that must always execute, and **optional extensions** (steps 6-9) that depend on the user's intent.

User request is in `$ARGUMENTS`.

## Required Core

These steps always execute in order. A grab cannot succeed without them.

### Step 1: Enter XR

Check session status. If not in an active XR session, accept and enter.

```
xr_get_session_status → if not sessionActive → xr_accept_session
```

### Step 2: Locate the target

Find the object by name in the live runtime hierarchy. Use `scene_get_runtime_hierarchy` and match against the name from `$ARGUMENTS`.

```
scene_get_runtime_hierarchy → find node matching the target name
```

If the object is not found, report the available named objects and stop.

### Step 3: Get its transform

Get the object's world position using its UUID from step 2.

```
scene_get_object_transform(uuid) → use positionRelativeToXROrigin
```

### Step 4: Animate controller to target

Animate the controller to the object's position. Default to `"controller-right"` unless the user specified left.

```
xr_animate_to({
  device: "controller-right",
  position: { x, y, z },
  duration: 0.5,
})
```

### Step 5: Engage grip

OneHandGrabbable and TwoHandsGrabbable are proximity-based and use the **squeeze/grip button (index 1)**, not the trigger.

```
xr_set_gamepad_state({
  device: "controller-right",
  buttons: [{ index: 1, value: 1 }],
})
```

The object is now grabbed. If the user only asked to grab (not move), stop here.

## Optional Extensions

Apply these based on the user's request.

### Step 6: Move to destination

If the user specified a destination position, animate the controller there. If no position was given but the user asked to "move" the object, animate it to in front of the headset.

To find "in front of headset": `xr_get_transform({ "device": "headset" })` → place at `(head.x, head.y - 0.2, head.z - 0.5)` adjusted for head orientation.

```
xr_animate_to({
  device: "controller-right",
  position: { x, y, z },
  duration: 0.5,
})
```

### Step 7: Release grip

Release the squeeze button to drop the object.

```
xr_set_gamepad_state({
  device: "controller-right",
  buttons: [{ index: 1, value: 0 }],
})
```

### Step 8: Return controller

Animate the controller back to its resting position so it's not overlapping the dropped object.

```
xr_animate_to({
  device: "controller-right",
  position: { x: 0.2, y: 1.4, z: -0.3 },
  duration: 0.5,
})
```

Default resting positions: right `(0.2, 1.4, -0.3)`, left `(-0.2, 1.4, -0.3)`.

### Step 9: Verify

Take a screenshot to confirm the result.

```
browser_screenshot
```

## Notes

- **Never use `xr_set_device_state` to move controllers** — it teleports instead of animating, which can break grab state.
- **Never use `xr_select` or trigger (button index 0) for grabs** — OneHandGrabbable/TwoHandsGrabbable respond to squeeze (button index 1).
- **DistanceGrabbable is different** — it uses ray-based selection, not proximity. This skill does not cover DistanceGrabbable.
- If the object lacks a name in the hierarchy, suggest adding `mesh.name = "MyObject"` in code before `createTransformEntity`.
