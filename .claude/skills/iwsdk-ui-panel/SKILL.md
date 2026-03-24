---
name: iwsdk-ui-panel
description: "Develop and iterate on IWSDK UI panels efficiently using ScreenSpace preview and backdrop techniques. Use when working on PanelUI components, creating panel layouts, configuring component styling, debugging UI layout, or improving UI design in IWSDK applications."
allowed-tools: Read, Edit, Write, Bash(npm *)
---

# IWSDK UI Panel Development Workflow

This skill teaches the efficient workflow for developing UI panels in IWSDK applications using temporary ScreenSpace positioning and backdrop techniques.

## Quick Iteration Workflow

When working on a UI panel, follow these steps for rapid iteration:

### 1. Add Temporary ScreenSpace Component

Temporarily add the `ScreenSpace` component to your PanelUI entity to make it fill the 2D screen during development:

```typescript
import { ScreenSpace } from '@iwsdk/core';

world
  .createTransformEntity(panelHolder)
  .addComponent(PanelUI, {
    config: '/ui/your-panel.json',
    maxWidth: 1.0,
    maxHeight: 0.5,
  })
  .addComponent(ScreenSpace, {
    width: '90vw', // Fill 90% of viewport width
    height: '90vh', // Fill 90% of viewport height
    top: '5vh', // Center with 5% margins
    left: '5vw',
  });
```

**Important:** This is temporary for development only. Remove before production.

### 2. Create a Clean Backdrop

Create a solid color backdrop far from your gameplay area for clean UI visibility:

```typescript
const backdrop = new Mesh(
  new BoxGeometry(20, 20, 0.1),
  new MeshBasicMaterial({ color: 0x1a1a2e }),
);
backdrop.position.set(0, 0, -50); // Far from gameplay
scene.add(backdrop);
```

### 3. Position Camera Close to Backdrop

Move the camera very close to the backdrop (within 0.5m) to eliminate background distractions:

```typescript
// Position camera very close to backdrop for clean UI development
camera.position.set(0, 0, -49.5); // Just 0.5m from backdrop at z=-50
camera.lookAt(0, 0, -50);
```

**Why close?** The backdrop must fill the entire field of view to block out the 3D scene. Being far away (50m) won't work - you'll still see the environment around the edges.

### 4. Iterate with Screenshots

Now you can rapidly iterate on your UI:

1. Make changes to your `.uikitml` file
2. Take a screenshot to see the result against a clean backdrop
3. The UI fills most of the screen, making it easy to see details like:
   - Border colors and thickness
   - Padding and spacing
   - Text alignment and sizing
   - Color contrast
   - Overall layout

The ScreenSpace component makes the panel "follow" the camera, so it appears as a 2D overlay on your backdrop.

### 5. Test in VR

When you enter VR mode:

- The ScreenSpace component automatically detaches the panel from the camera
- The panel returns to its original 3D world space position
- Your gameplay is unaffected

This dual-mode behavior is handled automatically by the `ScreenSpaceUISystem`.

## Understanding UIKit Size Signals

UIKit components expose size information through signals. Log these to debug layout issues:

```typescript
const document = PanelDocument.data.document[entity.index];

console.log('computedSize:', document.computedSize); // Intrinsic size in cm
console.log('targetSize:', document.targetSize); // Target size in meters
console.log('rootElement.size.value:', document.rootElement?.size?.value);
console.log('document.scale:', document.scale); // Applied scale
```

**Understanding the output:**

- `computedSize`: UIKit's rendered size in **centimeters** (based on your CSS)
- `targetSize`: The requested size in **meters** (from PanelUI maxWidth/maxHeight or ScreenSpace constraints)
- `document.scale`: Uniform scale factor applied to fit target while preserving aspect ratio

Example output:

```
computedSize: { width: 100, height: 50 }         // 100cm × 50cm
targetSize: { width: 0.274, height: 0.168 }      // 0.274m × 0.168m
document.scale: { x: 0.274, y: 0.274, z: 0.274 } // Scaled down by 0.274x
```

## ScreenSpace Component Reference

The ScreenSpace component positions panels using CSS-like properties:

```typescript
.addComponent(ScreenSpace, {
  width: '90vw',      // CSS size: px, vw, vh, %, auto
  height: '90vh',     // CSS size: px, vw, vh, %, auto
  top: '5vh',         // CSS position: px, %, vh, auto
  bottom: 'auto',     // CSS position: px, %, vh, auto
  left: '5vw',        // CSS position: px, %, vw, auto
  right: 'auto',      // CSS position: px, %, vw, auto
  zOffset: 0.2,       // Distance in meters from camera (default: 0.2m)
});
```

**How it works:**

- In desktop mode: Panel attaches to camera at `zOffset` distance, using CSS layout
- In VR mode: Panel detaches from camera, returns to world space position
- Automatic switching handled by `ScreenSpaceUISystem`

## Common Workflow Tips

### Centering Content

Use flexbox in your UIKitML for centered layouts:

```css
.container {
  display: flex;
  flex-direction: column; /* Stack vertically */
  justify-content: center; /* Center vertically */
  align-items: center; /* Center horizontally */
}
```

### Sharp Borders

Set `border-radius: 0` for square edges that align with grid systems:

```css
.panel {
  border-radius: 0; /* Square edges */
  border-width: 0.15;
  border-color: #27272a;
}
```

### UIKit Units

Remember: UIKit uses **centimeters** for sizing, world space uses **meters**:

- `width: 100` in UIKitML = 100cm = 1.0m
- `maxWidth: 1.0` in PanelUI = 1.0 meter

## Cleanup Before Production

Before committing or going to production:

1. **Remove ScreenSpace component** from your entity
2. **Remove or reposition backdrop** if not needed for gameplay
3. **Restore camera position** to gameplay view
4. **Remove debug logging** of size signals

The panel will remain at its world space position defined by the entity's transform.

## Example: Complete Development Setup

```typescript
// 1. Enable spatialUI feature
World.create(container, {
  features: { spatialUI: true },
}).then((world) => {
  const { scene, camera } = world;

  // 2. Create backdrop for UI development
  const backdrop = new Mesh(
    new BoxGeometry(20, 20, 0.1),
    new MeshBasicMaterial({ color: 0x1a1a2e }),
  );
  backdrop.position.set(0, 0, -50);
  scene.add(backdrop);

  // 3. Position camera close to backdrop
  camera.position.set(0, 0, -49.5);
  camera.lookAt(0, 0, -50);

  // 4. Create your UI panel with ScreenSpace
  const panelHolder = new Group();
  panelHolder.position.set(0, 1.5, -1.0); // World space position for VR
  scene.add(panelHolder);

  world
    .createTransformEntity(panelHolder)
    .addComponent(PanelUI, {
      config: '/ui/my-panel.json',
      maxWidth: 1.0,
      maxHeight: 0.5,
    })
    .addComponent(ScreenSpace, {
      // TEMPORARY for development
      width: '90vw',
      height: '90vh',
      top: '5vh',
      left: '5vw',
    });
});
```

## Troubleshooting

**Panel not filling screen:**

- Check ScreenSpace width/height values
- Verify UIKitML doesn't have fixed small dimensions

**Background still visible:**

- Camera too far from backdrop - move closer (within 0.5m)
- Backdrop too small - increase size to 20×20 or larger

**Panel doesn't return to world space in VR:**

- Verify `spatialUI: true` in World.create features
- Check that ScreenSpaceUISystem is running

**Size signals showing unexpected values:**

- UIKit uses cm, world space uses meters (100cm = 1m)
- Check if aspect ratio constraints are being applied
