/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  CylinderGeometry,
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

const dynamicSphere = new Mesh(
  new SphereGeometry(0.2),
  new MeshStandardMaterial({ color: 0xa78bfa }),
);
dynamicSphere.name = 'Dynamic Sphere';

const dynamicCylinder = new Mesh(
  new CylinderGeometry(0.15, 0.15, 0.4),
  new MeshStandardMaterial({ color: 0x38bdf8 }),
);
dynamicCylinder.name = 'Dynamic Cylinder';

const assets = defineAssets({
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: stockAssetUrl('environment-desk', 'environmentDesk.gltf'),
  },
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: stockAssetUrl('plant-sansevieria', 'plantSansevieria.gltf'),
  },
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: stockAssetUrl('robot', 'robot.gltf'),
  },
  'physics-welcome-panel': {
    name: 'Physics Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  'physics-dynamic-sphere': dynamicSphere,
  'physics-dynamic-cylinder': dynamicCylinder,
});

export default assets;
