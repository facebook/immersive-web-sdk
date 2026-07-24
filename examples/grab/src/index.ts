/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManifest,
  AssetType,
  PanelUI,
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  World,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { LogInIcon, RectangleGogglesIcon } from '@pmndrs/uikit-lucide';
import { SettingsSystem } from './panel.js';

const assets: AssetManifest = {
  switchSound: {
    url: './audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  webxrLogo: {
    url: './textures/webxr.jpg',
    type: AssetType.Texture,
    priority: 'critical',
  },
};

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
    spatialUI: { kits: [horizonKit, { LogInIcon, RectangleGogglesIcon }] },
  },
}).then((world) => {
  const { camera } = world;
  camera.position.set(0, 1.3, 0);

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxHeight: 0.4,
      maxWidth: 0.5,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '50%',
      width: '25vw',
    });
  panelEntity.object3D!.position.set(0, 1.5, -1.4);

  world.registerSystem(SettingsSystem);
});
