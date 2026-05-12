# Complete Example: Physics Playground

```typescript
import {
  World,
  SessionMode,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsBody,
  PhysicsState,
  PhysicsManipulation,
  Interactable,
  OneHandGrabbable,
} from '@iwsdk/core';
import {
  Mesh,
  BoxGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  FrontSide,
} from 'three';

World.create(document.getElementById('scene-container'), {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { physics: true, grabbing: true },
}).then((world) => {
  const { scene } = world;

  const floor = new Mesh(
    new BoxGeometry(10, 0.1, 10),
    new MeshStandardMaterial({ color: 0x555555 }),
  );
  floor.position.set(0, -0.05, 0);
  scene.add(floor);
  const floorEntity = world.createTransformEntity(floor);
  floorEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [10, 0.1, 10],
    friction: 0.8,
  });
  floorEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });

  const ball = new Mesh(
    new SphereGeometry(0.15),
    new MeshStandardMaterial({ color: new Color(0xff4444), side: FrontSide }),
  );
  ball.position.set(0, 1.5, -1);
  scene.add(ball);
  const ballEntity = world.createTransformEntity(ball);
  ballEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [0.15],
    restitution: 0.8,
    friction: 0.5,
  });
  ballEntity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  ballEntity.addComponent(Interactable);
  ballEntity.addComponent(OneHandGrabbable);

  const box = new Mesh(
    new BoxGeometry(0.3, 0.3, 0.3),
    new MeshStandardMaterial({ color: new Color(0x4488ff), side: FrontSide }),
  );
  box.position.set(0.5, 2, -1);
  scene.add(box);
  const boxEntity = world.createTransformEntity(box);
  boxEntity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Box,
    dimensions: [0.3, 0.3, 0.3],
    restitution: 0.3,
  });
  boxEntity.addComponent(PhysicsBody, {
    state: PhysicsState.Dynamic,
    linearDamping: 0.1,
  });
  boxEntity.addComponent(PhysicsManipulation, { force: [-3, 5, 0] });
});
```
