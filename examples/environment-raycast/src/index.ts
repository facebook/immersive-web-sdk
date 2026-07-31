/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManifest,
  AssetType,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  UIKitMLAsset,
  World,
} from '@iwsdk/core';
import { configureWelcomePanel } from './panel.js';
import { RaycastPlantSystem } from './raycast-plant.js';

const assets: AssetManifest = {
  plantSansevieria: {
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  welcomePanel: {
    name: 'Welcome panel',
    type: AssetType.UIKitML,
    url: './ui/welcome.uikitml',
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
}).then(async (world) => {
  const { camera } = world;

  camera.position.set(0, 1, 0.5);

  const panel = await world.assets.instantiate<UIKitMLAsset>('welcomePanel');
  const panelEntity = world
    .createTransformEntity(panel)
    .addComponent(RayInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
    });
  panelEntity.object3D!.position.set(0, 1.29, -1.9);
  panelEntity.object3D!.scale.setScalar(0.465);

  configureWelcomePanel(world, panel);
  world.registerSystem(RaycastPlantSystem);
});
