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
  UIKitMLAsset,
  World,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
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

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
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
