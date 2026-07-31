/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  type AssetManifest,
  AssetType,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

const anchor = new Mesh(
  new SphereGeometry(0.2),
  new MeshStandardMaterial({ color: 0xa78bfa }),
);
anchor.name = 'Anchor';

const assets = {
  'venice-sunset': {
    name: 'Venice Sunset',
    type: AssetType.HDRTexture,
    url: './textures/venice_sunset_1k.exr',
  },
  'scene-understanding-welcome-panel': {
    name: 'Scene Understanding Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'scene-understanding-anchor': anchor,
} satisfies AssetManifest;

export default assets;
