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
  earth: {
    name: 'Earth',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/earth.glb',
  },
  'chichen-itza': {
    name: 'Chichen Itza',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/chichen_itza.glb',
  },
  'eiffel-tower': {
    name: 'Eiffel Tower',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/eiffel_tower.glb',
  },
  'opera-house': {
    name: 'Sydney Opera House',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/opera_house.glb',
  },
  pin: {
    name: 'Map Pin',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/pin.glb',
  },
  pyramid: {
    name: 'Pyramid',
    type: AssetType.GLTF,
    url: '/gltf/original-grab/pyramid.glb',
  },
  'grab-welcome-panel': {
    name: 'Grab Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'distance-grab-panel': {
    name: 'Distance Grab Panel',
    type: AssetType.UIKitML,
    url: '/ui/distance-grabbable.uikitml',
  },
  'one-hand-grab-panel': {
    name: 'One-Hand Grab Panel',
    type: AssetType.UIKitML,
    url: '/ui/one-hand-grabbable.uikitml',
  },
  'two-hand-grab-panel': {
    name: 'Two-Hand Grab Panel',
    type: AssetType.UIKitML,
    url: '/ui/two-hand-grabbable.uikitml',
  },
  switchSound: {
    priority: 'background',
    type: AssetType.Audio,
    url: './audio/switch.mp3',
  },
  webxrLogo: {
    priority: 'critical',
    type: AssetType.Texture,
    url: './textures/webxr.jpg',
  },
} satisfies AssetManifest;

export default assets;
