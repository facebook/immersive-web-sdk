/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  XRAnchor,
  Color,
  XRMesh,
  XRPlane,
  SceneUnderstandingSystem,
  SessionMode,
  World,
  createSystem,
  Interactable,
} from '@iwsdk/core';

export class SceneShowSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
  meshEntities: { required: [XRMesh] },
}) {
  update(_delta, _time) {
    this.queries.planeEntities.entities.forEach((planeEntity) => {
      if (!planeEntity.hasComponent(Interactable)) {
        console.log(
          'SceneShowSystem update + planeEntity ' + planeEntity.index,
        );
        planeEntity.object3D.material.wireframe = false;
        planeEntity.object3D.material.visible = false;
        planeEntity.object3D.material.opacity = 0.3;
        planeEntity.addComponent(Interactable);
        planeEntity.object3D.addEventListener('pointerenter', () => {
          planeEntity.object3D.material.visible = true;
        });
        planeEntity.object3D.addEventListener('pointerleave', () => {
          planeEntity.object3D.material.visible = false;
        });
      }
    });

    this.queries.meshEntities.entities.forEach((meshEntity) => {
      if (!meshEntity.hasComponent(Interactable)) {
        meshEntity.addComponent(Interactable);
        meshEntity.object3D.material.visible = false;
        meshEntity.object3D.addEventListener('pointerenter', () => {
          meshEntity.object3D.material.visible = true;
        });
        meshEntity.object3D.addEventListener('pointerleave', () => {
          meshEntity.object3D.material.visible = false;
        });
      }
    });
  }
}

World.create(document.getElementById('scene-container'), {
  undefined,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    features: {
      hitTest: true,
      planeDetection: { required: true },
      meshDetection: { required: true },
      anchors: { required: true },
    },
  },
}).then((world) => {
  const { scene } = world;

  scene.background = new Color(0x808080);

  world
    .registerComponent(XRPlane)
    .registerComponent(XRMesh)
    .registerComponent(XRAnchor)
    .registerSystem(SceneUnderstandingSystem)
    .registerSystem(SceneShowSystem);
});
