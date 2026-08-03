/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  defineAssets,
} from '@iwsdk/core';

const publicAssetUrl = (filePath: string) =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const anchor = new Mesh(
  new SphereGeometry(0.2),
  new MeshStandardMaterial({ color: 0xa78bfa }),
);
anchor.name = 'Anchor';

const assets = defineAssets({
  'venice-sunset': {
    name: 'Venice Sunset',
    type: AssetType.HDRTexture,
    url: publicAssetUrl('textures/venice_sunset_1k.exr'),
  },
  'scene-understanding-welcome-panel': {
    name: 'Scene Understanding Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  'scene-understanding-anchor': anchor,
});

export default assets;
