/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  BoxGeometry,
  CapsuleGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  defineAssets,
} from '@iwsdk/core';

const publicAssetUrl = (filePath: string) =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const DEFAULT_STOCK_ASSET_BASE =
  'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets';
const stockAssetBase = (
  import.meta.env.VITE_IWSDK_EXAMPLE_ASSET_BASE_URL?.trim() ||
  DEFAULT_STOCK_ASSET_BASE
).replace(/\/+$/u, '');
const stockAssetUrl = (assetId: string, fileName: string) =>
  `${stockAssetBase}/${assetId}/${fileName}`;

const rayTarget = new Mesh(
  new BoxGeometry(0.36, 0.36, 0.36),
  new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
);
rayTarget.name = 'Ray Target';

const physicsBall = new Mesh(
  new SphereGeometry(0.18, 32, 16),
  new MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.35 }),
);
physicsBall.name = 'Physics Ball';

const playerAvatar = new Mesh(
  new CapsuleGeometry(0.3, 1, 4, 12),
  new MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.6 }),
);
playerAvatar.name = 'Player Avatar';

const assets = defineAssets({
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: stockAssetUrl('environment-desk', 'environmentDesk.gltf'),
  },
  'browser-first-welcome-panel': {
    name: 'Browser-First Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  'browser-first-ray-target': rayTarget,
  'browser-first-physics-ball': physicsBall,
  'browser-first-player-avatar': playerAvatar,
});

export default assets;
