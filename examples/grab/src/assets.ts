/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type AssetManifest, AssetType } from '@iwsdk/core';

const assets = {
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
  },
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
  },
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/robot/robot.gltf',
  },
  switchSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/switch.mp3',
  },
  webxrLogo: {
    priority: 'critical',
    type: AssetType.Texture,
    url: './textures/webxr.jpg',
  },
} satisfies AssetManifest;

export default assets;
