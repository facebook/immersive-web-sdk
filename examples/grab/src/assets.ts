/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

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

const assets = defineAssets({
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: stockAssetUrl('environment-desk', 'environmentDesk.gltf'),
  },
  earth: {
    name: 'Earth',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/earth.glb'),
  },
  'chichen-itza': {
    name: 'Chichen Itza',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/chichen_itza.glb'),
  },
  'eiffel-tower': {
    name: 'Eiffel Tower',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/eiffel_tower.glb'),
  },
  'opera-house': {
    name: 'Sydney Opera House',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/opera_house.glb'),
  },
  pin: {
    name: 'Map Pin',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/pin.glb'),
  },
  pyramid: {
    name: 'Pyramid',
    type: AssetType.GLTF,
    url: publicAssetUrl('gltf/original-grab/pyramid.glb'),
  },
  'grab-welcome-panel': {
    name: 'Grab Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  'distance-grab-panel': {
    name: 'Distance Grab Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/distance-grabbable.uikitml'),
  },
  'one-hand-grab-panel': {
    name: 'One-Hand Grab Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/one-hand-grabbable.uikitml'),
  },
  'two-hand-grab-panel': {
    name: 'Two-Hand Grab Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/two-hand-grabbable.uikitml'),
  },
  switchSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: publicAssetUrl('audio/switch.mp3'),
  },
  webxrLogo: {
    priority: 'critical',
    type: AssetType.Texture,
    url: publicAssetUrl('textures/webxr.jpg'),
  },
});

export default assets;
