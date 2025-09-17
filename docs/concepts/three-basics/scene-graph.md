---
title: Scene Graph
---

# Scene Graph

Learning outcomes

- Understand Object3D hierarchy, add/remove, and traversal.
- Know when to use Groups vs entities and where to attach nodes.

Mental model

- The scene graph is a tree of Object3D nodes. Transform hierarchies determine local vs world space. Entities can host nodes at arbitrary points.

Create & parent

```ts
const parent = world.createTransformEntity();
const child = world.createTransformEntity(undefined, { parent });
child.object3D!.name = 'ChildNode';
```

Attach an external node

```ts
import { Object3D } from '@iwsdk/core';
const node = new Object3D();
const e = world.createTransformEntity();
e.object3D!.add(node);
```

Traverse/find

```ts
const root = world.getActiveRoot();
const target = root.getObjectByName('ChildNode');
```

Tips

- Use entity parenting for ECS‑aware relationships (Transform parent).
- Use Group() nodes for visual sub-structure without ECS state.
- Keep names unique within meaningful scopes for debugging.
