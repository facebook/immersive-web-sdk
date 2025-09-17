---
title: Rendering & Performance
---

# Rendering & Performance

Learning outcomes

- Understand IWSDK’s frame order and where to place heavy work.
- Reduce draw calls and allocations for XR.

Frame order

```text
Update signals → Systems (priority-ordered) → renderer.render(scene,camera)
```

Tips

- Reuse geometry/materials; avoid per-frame material changes.
- Cull aggressively; limit shadow casters/receivers.
- Avoid allocations in hot loops; use `getVectorView` and typed arrays.
- Use negative priorities for input/physics; run visuals later.
