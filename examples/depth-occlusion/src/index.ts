/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  DepthOccludable,
  DepthSensingSystem,
  ReferenceSpaceType,
  SessionMode,
  UIKitMLAsset,
  World,
} from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';

export class OcclusionDemoSystem extends createSystem({
  occludables: { required: [DepthOccludable] },
}) {
  update(): void {
    const time = performance.now() * 0.001;
    for (const entity of this.queries.occludables.entities) {
      if (entity.object3D) {
        entity.object3D.rotation.y = time * 0.5;
        entity.object3D.rotation.x = Math.sin(time * 0.3) * 0.2;
      }
    }
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  level: './scenes/depth-occlusion.iwsdk.scene.json',
  render: {
    camera: {
      position: [0, 1.6, 0],
    },
  },
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      depthSensing: {
        required: true,
        usage: 'gpu-optimized',
        format: 'float32',
      },
      hitTest: { required: true },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
  features: {
    grabbing: true,
    spatialUI: true,
  },
}).then((world) => {
  world
    .registerSystem(DepthSensingSystem, {
      configData: {
        enableDepthTexture: true,
        enableOcclusion: true,
        useFloat32: true,
        blurRadius: 20,
      },
    })
    .registerSystem(OcclusionDemoSystem);

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
});
