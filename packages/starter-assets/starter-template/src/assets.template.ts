/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type AssetManifest, AssetType } from '@iwsdk/core';

const assets = {
  /* @template:if mode='vr' */
  'environment-desk': {
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    type: AssetType.GLTF,
    name: 'Environment Desk',
  },
  /* @template:end */
  /* @template:if mode='ar' */
  'plant-sansevieria': {
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    name: 'Plant Sansevieria',
  },
  robot: {
    url: '/iwsdk-assets/robot/robot.gltf',
    type: AssetType.GLTF,
    name: 'Robot',
  },
  /* @template:end */
  /* @template:if mode='vr' */
  'plant-sansevieria': {
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    name: 'Plant Sansevieria',
  },
  robot: {
    url: '/iwsdk-assets/robot/robot.gltf',
    type: AssetType.GLTF,
    name: 'Robot',
  },
  /* @template:end */
  /* @template:if mode='browser' */
  /* @template:else */
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
  /* @template:end */
} satisfies AssetManifest;

export default assets;
