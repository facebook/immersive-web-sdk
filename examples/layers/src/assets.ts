/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  BoxGeometry,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  defineAssets,
} from '@iwsdk/core';

const publicAssetUrl = (filePath: string) =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const grid = new GridHelper(10, 10, 0x888888, 0x444444);
grid.name = 'Grid';

const floor = new Mesh(
  new PlaneGeometry(10, 10),
  new MeshBasicMaterial({ color: 0x333333 }),
);
floor.name = 'Floor';

const pillar = new Mesh(
  new BoxGeometry(0.3, 2, 0.3),
  new MeshBasicMaterial({ color: 0xcc8844 }),
);
pillar.name = 'Pillar';

const orb = new Mesh(
  new SphereGeometry(0.4, 32, 32),
  new MeshBasicMaterial({ color: 0xffaa00 }),
);
orb.name = 'Orb';

const assets = defineAssets({
  'layers-grid': grid,
  'layers-floor': floor,
  'layers-pillar': pillar,
  'layers-orb': orb,
  'layers-welcome-panel': {
    name: 'Layers Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
});

export default assets;
