/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  type AssetManifest,
  AssetType,
  BoxGeometry,
  CapsuleGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

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

const assets = {
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
  },
  'browser-first-welcome-panel': {
    name: 'Browser-First Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'browser-first-ray-target': rayTarget,
  'browser-first-physics-ball': physicsBall,
  'browser-first-player-avatar': playerAvatar,
} satisfies AssetManifest;

export default assets;
