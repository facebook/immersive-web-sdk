/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Color,
  Mesh,
  PhysicsBody,
  PhysicsShape,
  PhysicsState,
  PhysicsShapeType,
  PhysicsManipulation,
  SphereGeometry,
  MeshStandardMaterial,
  FrontSide,
  SessionMode,
  World,
} from '@iwsdk/core';

const assets = {};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { handTracking: true },
  },
  level: '/glxf/Composition.glxf',
  features: {
    grabbing: true,
    locomotion: true,
    physics: true,
  },
}).then((world) => {
  const { scene, camera } = world;
  camera.position.set(5, 2, 5);
  camera.rotateY(Math.PI / 4);

  scene.background = new Color(0x808080);

  const body = new Mesh(
    new SphereGeometry(0.2),
    new MeshStandardMaterial({
      side: FrontSide,
      color: new Color(Math.random(), Math.random(), Math.random()),
    }),
  );
  body.position.set(-1, 1.5, 0.5);
  scene.add(body);
  const entity = world.createTransformEntity(body);
  entity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [0.2],
  });
  entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  entity.addComponent(PhysicsManipulation, { force: [10, 1, 1] });
});
