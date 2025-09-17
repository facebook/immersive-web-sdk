---
title: Raycasting & Input
---

# Raycasting & Input

Learning outcomes

- Understand when to use classic Raycaster vs IWSDK pointer/input systems.
- Hook into input at the right priority and avoid per-frame heavy work.

IWSDK way

- XRInputManager and @pmndrs/pointer-events provide unified hover/select events.

Custom picking

```ts
// In a high-priority system (before visuals), perform custom raycasts if needed
```

Tips

- Prefer pointer events for UI; keep custom raycasts minimal and batched.
