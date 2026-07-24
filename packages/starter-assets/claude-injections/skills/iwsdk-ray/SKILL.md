---
name: iwsdk-ray
description: Ray-based interactions in the WebXR scene — click objects, press UI buttons, or distance-grab with DistanceGrabbable. Use when the user wants to point at and interact with something at a distance, click a UI button, or test ray-based selection.
argument-hint: <target> [action]
---

# Ray Interaction

Point at and interact with objects or UI elements in the XR scene using the controller ray. The workflow has a **required core** (steps 1-4) and **optional extensions** that depend on whether the target is an object or UI element, and what kind of interaction is needed.

User request is in `$ARGUMENTS`.

## Required Core

These steps always execute in order.

### Step 1: Enter XR

Check session status. If not in an active XR session, accept and enter.

```
xr_get_session_status → if not sessionActive → xr_accept_session
```

### Step 2: Locate the target

**For scene objects:** Find by name using `scene_get_runtime_hierarchy`, then get the UUID.

```
scene_get_runtime_hierarchy → find node matching target name
```

**For UI elements:** UI buttons/elements are children of PanelUI entities and may not have names by default. To locate precisely:

1. Read the UIKITML source file to find the element's `id` (e.g., `<button id="xr-button">`)
2. Find the system or code that loads the panel via `PanelDocument`
3. Add `.name = "element-id"` on the Object3D returned by `getElementById()` — this is harmless and makes it discoverable
4. Reload, then find it by name in `scene_get_runtime_hierarchy`

If the element already has a name in the hierarchy, skip straight to getting its transform.

If the object is not found, report the available named objects and stop.

### Step 3: Get its transform

Get the target's world position using its UUID from step 2.

```
scene_get_object_transform(uuid) → use positionRelativeToXROrigin
```

### Step 4: Aim the controller

Point the controller at the target. Default to `"controller-right"` unless the user specified left. Do NOT move the controller — only rotate it.

```
xr_look_at({ device: "controller-right", target: { x, y, z } })
```

The controller ray is now pointing at the target. What happens next depends on the interaction type.

## Interaction Branches

Based on the user's intent and the target's components, choose ONE of the following.

### Branch A: Click / Select (objects with RayInteractable, or UI buttons)

For simple clicks, send an explicit trigger press and release. Use for UI buttons and objects that respond to the Pressed component.

```
xr_set_select_value({ device: "controller-right", value: 1 })
xr_set_select_value({ device: "controller-right", value: 0 })
```

This emits the pointer down/up path without using `xr_select`, which can wedge
the 0.4.2 headless runtime.

### Branch B: Distance Grab (objects with DistanceGrabbable)

DistanceGrabbable requires **press and hold** on the trigger (button index 0), not a quick select.

#### B1: Engage trigger

```
xr_set_gamepad_state({
  device: "controller-right",
  buttons: [{ index: 0, value: 1 }],
})
```

The object is now distance-grabbed. Behavior depends on the `movementMode`:

- **MoveFromTarget / MoveAtSource / RotateAtSource** — object stays remote, moves relative to controller movement
- **MoveTowardsTarget** — object flies into the controller's hand, then behaves like a proximity grab

#### B2: Move to destination (optional)

If the user wants to move the object somewhere, animate the controller to the destination.

```
xr_animate_to({
  device: "controller-right",
  position: { x, y, z },
  duration: 0.5,
})
```

If no destination specified but user asked to "move" or "bring" the object, animate to in front of the headset: `xr_get_transform({ "device": "headset" })` → place at `(head.x, head.y - 0.2, head.z - 0.5)`.

#### B3: Release trigger

```
xr_set_gamepad_state({
  device: "controller-right",
  buttons: [{ index: 0, value: 0 }],
})
```

#### B4: Return controller

Animate back to resting position.

```
xr_animate_to({
  device: "controller-right",
  position: { x: 0.2, y: 1.4, z: -0.3 },
  duration: 0.5,
})
```

Default resting positions: right `(0.2, 1.4, -0.3)`, left `(-0.2, 1.4, -0.3)`.

### Step 5: Verify (optional)

Take a screenshot to confirm the result.

```
browser_screenshot
```

## Notes

- **Click vs hold:** use `xr_set_select_value` 1→0 for quick clicks. Hold it at 1 while moving a DistanceGrabbable, then release with 0.
- **Trigger vs squeeze:** Ray interactions use the **trigger (button index 0)**. Proximity grabs (OneHandGrabbable/TwoHandsGrabbable) use **squeeze (button index 1)**. Don't mix them up.
- **UI element discovery:** Always prefer the precise approach — name the Object3D via PanelDocument's `getElementById` + `.name`, then find it in the hierarchy. Guessing positions based on panel offset is fragile.
- **DistanceGrabbable movement modes:** Check the entity's DistanceGrabbable component to see which `movementMode` is set. Use `ecs_query_entity` if unsure.
- **Don't move the controller to the target** — ray interactions work at a distance. Only rotate via `xr_look_at`, don't translate.
