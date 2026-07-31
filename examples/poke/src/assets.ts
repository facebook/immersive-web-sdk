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
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/robot/robot.gltf',
  },
  'poke-welcome-panel': {
    name: 'Poke Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'poke-webxr-banner': {
    name: 'WebXR Banner',
    type: AssetType.GLTF,
    url: '/gltf/webxr-banner.gltf',
  },
  chimeSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/chime.mp3',
  },
} satisfies AssetManifest;

export default assets;
