/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  BoxGeometry,
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

function occlusionMaterial(color: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    transparent: true,
    metalness: 0.3,
    roughness: 0.4,
  });
}

const sphere = new Mesh(new SphereGeometry(0.5), occlusionMaterial(0xff4444));
sphere.name = 'Soft Occlusion Sphere';

const cube = new Mesh(
  new BoxGeometry(0.25, 0.25, 0.25),
  occlusionMaterial(0x44ff44),
);
cube.name = 'Hard Occlusion Cube';

const cylinder = new Mesh(
  new CylinderGeometry(0.05, 0.05, 0.2, 32),
  occlusionMaterial(0x4444ff),
);
cylinder.name = 'Non-Occludable Cylinder';

const assets = defineAssets({
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: stockAssetUrl('robot', 'robot.gltf'),
  },
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: stockAssetUrl('plant-sansevieria', 'plantSansevieria.gltf'),
  },
  'depth-occlusion-welcome-panel': {
    name: 'Depth Occlusion Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  'depth-soft-sphere': sphere,
  'depth-hard-cube': cube,
  'depth-reference-cylinder': cylinder,
});

export default assets;
