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
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from '@iwsdk/core';

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

const assets = {
  robot: {
    name: 'Robot',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/robot/robot.gltf',
  },
  'plant-sansevieria': {
    name: 'Plant Sansevieria',
    type: AssetType.GLTF,
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
  },
  'depth-occlusion-welcome-panel': {
    name: 'Depth Occlusion Welcome Panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'depth-soft-sphere': sphere,
  'depth-hard-cube': cube,
  'depth-reference-cylinder': cylinder,
} satisfies AssetManifest;

export default assets;
