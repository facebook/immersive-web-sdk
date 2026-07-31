/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  /* @template:if mode='browser' */
  /* @template:else */
  AssetManager,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SessionMode,
  SRGBColorSpace,
  /* @template:end */
  World,
} from '@iwsdk/core';
import assets from './assets.js';
import components from './components.js';
/* @template:if mode='browser' */
/* @template:else */
import { PanelSystem } from './panel.js';
import { RobotSystem } from './robot.js';
/* @template:end */

let sceneLevel = './scenes/vr.iwsdk.scene.json';
/* @template:if mode='ar' */
sceneLevel = './scenes/ar.iwsdk.scene.json';
/* @template:end */
/* @template:if mode='browser' */
sceneLevel = './scenes/browser.iwsdk.scene.json';
/* @template:end */

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  components,
  /* @template:if mode='browser' */
  xr: false,
  render: {
    near: 0.001,
    far: 200,
    camera: {
      position: [0, 1.6, 3],
      lookAt: [0, 1, 0],
    },
  },
  input: {
    canvasPointerEvents: true,
  },
  /* @template:else */
  xr: {
    sessionMode: /* @session-mode */ SessionMode.ImmersiveAR,
    offer: 'always',
    // Optional structured features; layers/local-floor are offered by default
    features: {},
  } /* @chef:xr-config */,
  /* @template:end */
  features: {} /* @chef:app */,
  level: sceneLevel,
}).then((world) => {
  /* @template:if mode='browser' */
  /* @template:else */
  const { camera } = world;
  /* @template:end */
  /* @template:if mode='ar' */
  camera.position.set(0, 1, 0.5);
  /* @template:end */
  /* @template:if mode='vr' */
  camera.position.set(-4, 1.5, -6);
  camera.lookAt(0, 1.1, -1.8);
  /* @template:end */

  /* @template:if mode='browser' */
  /* @template:else */
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

  world.registerSystem(RobotSystem);
  world.registerSystem(PanelSystem);
  /* @template:end */
});
