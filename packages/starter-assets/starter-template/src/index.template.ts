/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManifest,
  AssetType,
  AssetManager,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SessionMode,
  SRGBColorSpace,
  World,
} from '@iwsdk/core';
import { PanelSystem } from './panel.js';
import { RobotSystem } from './robot.js';

const assets: AssetManifest = {
  chimeSound: {
    url: './audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  webxr: {
    url: './textures/webxr.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
};

let sceneLevel = './scenes/vr.iwsdk.scene.json';
/* @template:if mode='ar' */
sceneLevel = './scenes/ar.iwsdk.scene.json';
/* @template:end */

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: /* @session-mode */ SessionMode.ImmersiveAR,
    offer: 'always',
    // Optional structured features; layers/local-floor are offered by default
    features: {},
  } /* @chef:xr-config */,
  features: {} /* @chef:app */,
  level: sceneLevel,
}).then((world) => {
  const { camera } = world;
  /* @template:if mode='ar' */
  camera.position.set(0, 1, 0.5);
  /* @template:end */
  /* @template:if mode='vr' */
  camera.position.set(-4, 1.5, -6);
  camera.lookAt(0, 1.1, -1.8);
  /* @template:end */

  const webxrLogoTexture = AssetManager.getTexture('webxr')!;
  webxrLogoTexture.colorSpace = SRGBColorSpace;
  const logoBanner = new Mesh(
    new PlaneGeometry(3.39, 0.96),
    new MeshBasicMaterial({
      map: webxrLogoTexture,
      transparent: true,
    }),
  );
  world.createTransformEntity(logoBanner);
  logoBanner.position.set(0, 1, 1.8);
  logoBanner.rotateY(Math.PI);

  world.registerSystem(PanelSystem).registerSystem(RobotSystem);
});
