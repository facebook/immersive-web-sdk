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
  'locomotion-welcome-panel': {
    name: 'Locomotion Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'locomotion-settings-panel': {
    name: 'Locomotion Settings Panel',
    type: AssetType.UIKitML,
    url: '/ui/settings.uikitml',
  },
  switchSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/switch.mp3',
  },
} satisfies AssetManifest;

export default assets;
