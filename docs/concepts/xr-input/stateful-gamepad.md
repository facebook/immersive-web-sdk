---
title: Stateful Gamepad
---

# Stateful Gamepad

`StatefulGamepad` wraps the XR `Gamepad` to provide edge‑triggered events and helpful axes utilities based on the active WebXR Input Profile.

## Why use it?

- Edge events: `getButtonDown/Up()` so you don’t hand‑roll previous/next button arrays.
- Mapping by component id: call `getButtonPressed('xr-standard-squeeze')` instead of hard‑coding indices.
- Axes helpers: 2D magnitude, per‑direction enter/leave (Up/Down/Left/Right) with a threshold.

## Accessing gamepads

`XRInputManager` exposes lazily‑created stateful pads for the current primary source on each side.

```ts
const leftPad = xrInput.gamepads.left;
const rightPad = xrInput.gamepads.right;

// Example: trigger a use action on select edge
if (rightPad?.getSelectStart()) doUse();
if (rightPad?.getSelectEnd()) stopUse();
```

Pads are re‑created when the primary input source changes or when a gamepad appears/disappears on that source. Always null‑check.

## Mappings from input profiles

When first created, the pad resolves the active profile and builds:

- `buttonMapping: Map<string, number>` — component id → button index.
- `axesMapping: Map<string, {x,y}>` — component id → axis indices.

Common component ids include:

- `'xr-standard-trigger'`, `'xr-standard-squeeze'`
- `'xr-standard-thumbstick'`, `'xr-standard-touchpad'`
- `'a-button'`, `'b-button'`, `'x-button'`, `'y-button'`, `'thumbrest'`, `'menu'`

## API cheatsheet

```ts
// Buttons by id or raw index
pad.getButtonPressed('xr-standard-trigger');
pad.getButtonDown('xr-standard-squeeze');
pad.getButtonUpByIdx(3);
pad.getButtonValue('xr-standard-trigger'); // 0..1

// Select convenience (from layout.selectComponentId)
pad.getSelectStart();
pad.getSelectEnd();
pad.getSelecting();

// 2D axes (thumbstick/touchpad)
const v = pad.getAxesValues('xr-standard-thumbstick'); // { x, y }
const mag = pad.get2DInputValue('xr-standard-thumbstick'); // 0..√2

// Directional state machine (with threshold)
pad.axesThreshold = 0.8; // default
pad.getAxesEnteringUp('xr-standard-thumbstick');
pad.getAxesLeavingRight('xr-standard-thumbstick');
```

Directional states are one of `Default, Up, Down, Left, Right` and update each `pad.update()` tick. The input manager calls `update()` for you when the gamepad is present.

## Patterns

### Smooth locomotion with thumbstick

```ts
const pad = xrInput.gamepads.left;
if (pad) {
  const { x, y } = pad.getAxesValues('xr-standard-thumbstick')!;
  // Move in grip space forward/right
  moveRigFromGrip(xrInput.xrOrigin.gripSpaces.left, x, y, dt);
}
```

### Snap turn on entering Left/Right

```ts
const pad = xrInput.gamepads.right;
if (pad?.getAxesEnteringLeft('xr-standard-thumbstick')) snapTurn(-30);
if (pad?.getAxesEnteringRight('xr-standard-thumbstick')) snapTurn(30);
```

### Press‑to‑hold interactions

```ts
const pad = xrInput.gamepads.right;
if (pad?.getButtonDown('xr-standard-trigger')) startLaser();
if (pad?.getButtonUp('xr-standard-trigger')) stopLaser();
```

## Troubleshooting

- `getSelectStart()` never fires: ensure the active layout’s `selectComponentId` matches your device profile, and that you’re checking the pad for the primary side.
- Axes events feel jittery: increase `axesThreshold` above 0.8 to reduce accidental cardinal transitions.
