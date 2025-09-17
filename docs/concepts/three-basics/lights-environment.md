---
title: Lights & Environment
---

# Lights & Environment

Learning outcomes

- Use image-based lighting (IBL) for PBR; understand PMREM.
- Replace IWSDK’s default gradient with an HDR environment.

IWSDK context

- Default gradient + PMREM is applied; scene.environment drives reflections/IBL.

Replace environment (sketch)

```ts
// Load HDR → PMREM → scene.environment = texture
```

Tips

- Prefer environment lighting + a few direct lights; keep shadows scoped for XR performance.
