/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  type AssetManifest,
  AssetType,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

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
  'physics-welcome-panel': {
    name: 'Physics Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'physics-dynamic-sphere': dynamicSphere,
  'physics-dynamic-cylinder': dynamicCylinder,
} satisfies AssetManifest;

export default assets;
