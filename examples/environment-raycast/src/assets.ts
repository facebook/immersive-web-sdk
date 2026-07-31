/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { type AssetManifest, AssetType } from '@iwsdk/core';

const assets = {
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
  },
  'environment-raycast-welcome-panel': {
    name: 'Environment Raycast Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
} satisfies AssetManifest;

export default assets;
