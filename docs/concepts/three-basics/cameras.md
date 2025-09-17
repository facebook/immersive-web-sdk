---
title: Cameras & Projections
---

# Cameras & Projections

Learning outcomes

- Configure Perspective camera (FOV/near/far) via IWSDK.
- Understand XR camera behavior; compute world-per-pixel at depth.

IWSDK context

- World.create options: `{ render: { fov, near, far } }`.

Screen-space sizing (used by UI)

```ts
const vFOV = THREE.MathUtils.degToRad(camera.fov);
const worldHeightAtZ = 2 * Math.tan(vFOV / 2) * z;
const worldPerPixel = worldHeightAtZ / renderer.domElement.clientHeight;
```

Look at

```ts
camera.lookAt(0, 1.7, -1);
```

Tips

- Keep near > 0.05 in XR to avoid clip artifacts; set far conservatively.
