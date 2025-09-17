/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  Color,
  SessionMode,
  World,
  PanelUI,
  ScreenSpace,
  AudioSource,
  Interactable,
} from '@iwsdk/core';
import { Spinner, SpinSystem } from './spin.js';
import { SettingsSystem, ShoePart } from './settings.js';

const assets = {
  switchSound: {
    url: '/audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    requiredFeatures: ['hand-tracking'],
  },
  level: '/glxf/Composition.glxf',
  features: {
    enableGrabbing: true,
    enableLocomotion: true,
  },
}).then((world) => {
  const { scene, camera } = world;
  camera.position.set(0.35, 0.9, -1.5);
  camera.rotateY(Math.PI / 6);

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: '/ui/settings.json',
      maxWidth: 2,
      maxHeight: 1.5,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      height: 'calc(100% - 100px)',
      top: '50px',
      right: '50px',
    })
    .addComponent(AudioSource, {
      src: '/audio/switch.mp3',
    });

  panelEntity.object3D.position.set(0, 1.7, -2);

  scene.background = new Color(0x808080);
  world
    .registerComponent(Spinner)
    .registerComponent(ShoePart)
    .registerSystem(SpinSystem)
    .registerSystem(SettingsSystem);
});
