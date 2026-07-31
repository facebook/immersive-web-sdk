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
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
  },
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/robot/robot.gltf',
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
