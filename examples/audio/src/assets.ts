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
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: stockAssetUrl('robot', 'robot.gltf'),
  },
  'spatial-audio-panel': {
    name: 'Spatial Audio Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
  song: {
    priority: 'background',
    type: AssetType.Audio,
    url: publicAssetUrl('audio/beepboop.mp3'),
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
