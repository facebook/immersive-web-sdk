/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  UIKitMLAsset,
  World,
} from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: {
      handTracking: { required: true },
    },
  },
  level: './scenes/grab.iwsdk.scene.json',
  features: {
    grabbing: { useHandPinchForGrab: true },
    locomotion: true,
    spatialUI: true,
  },
}).then(async (world) => {
  const { camera } = world;
  camera.position.set(0, 1.3, 0);

  const panel =
    await world.assets.instantiate<UIKitMLAsset>('grab-welcome-panel');
  const panelEntity = world
    .createTransformEntity(panel)
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '50%',
      width: '25vw',
    });
  panelEntity.object3D!.position.set(0, 1.5, -1.4);
  panelEntity.object3D!.scale.setScalar(0.145);

  configureWelcomePanel(world, panel);
});
