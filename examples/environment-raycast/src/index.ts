/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetManifest, AssetType, SessionMode, World } from '@iwsdk/core';
import { Interactable, PanelUI, ScreenSpace } from '@iwsdk/core';
import { PanelSystem } from './panel.js';
import { RaycastPlantSystem } from './raycast-plant.js';

const assets: AssetManifest = {
  plantSansevieria: {
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: 'always',
    features: {
      handTracking: true,
      anchors: false,
      hitTest: { required: true },
      planeDetection: false,
      meshDetection: false,
      layers: true,
    },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: true,
  },
}).then((world) => {
  const { camera } = world;

  camera.position.set(0, 1, 0.5);

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxHeight: 0.8,
      maxWidth: 1.6,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
    });
  panelEntity.object3D!.position.set(0, 1.29, -1.9);

  world.registerSystem(PanelSystem).registerSystem(RaycastPlantSystem);
});
