/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  eq,
  RayInteractable,
  ReferenceSpaceType,
  SessionMode,
  UIKitMLAsset,
  World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';

export class SceneShowSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
  meshEntities: {
    required: [XRMesh],
    where: [eq(XRMesh, 'isBounded3D', true)],
  },
}) {
  init(): void {
    this.queries.planeEntities.subscribe('qualify', (planeEntity) => {
      if (!planeEntity.hasComponent(RayInteractable)) {
        planeEntity.object3D!.visible = false;
        planeEntity.addComponent(RayInteractable);
        planeEntity.object3D!.addEventListener('pointerenter', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = true;
          }
        });
        planeEntity.object3D!.addEventListener('pointerleave', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = false;
          }
        });
      }
    });

    this.queries.meshEntities.subscribe('qualify', (meshEntity) => {
      if (!meshEntity.hasComponent(RayInteractable)) {
        meshEntity.addComponent(RayInteractable);
        meshEntity.object3D!.visible = false;
        meshEntity.object3D!.addEventListener('pointerenter', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = true;
          }
        });
        meshEntity.object3D!.addEventListener('pointerleave', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = false;
          }
        });
      }
    });
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  level: './scenes/scene-understanding.iwsdk.scene.json',
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      hitTest: { required: true },
      planeDetection: { required: true },
      meshDetection: { required: true },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
  features: {
    grabbing: true,
    sceneUnderstanding: true,
    spatialUI: true,
  },
}).then((world) => {
  world.registerSystem(SceneShowSystem);
  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
});
