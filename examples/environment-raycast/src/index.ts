/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitMLAsset, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { configureWelcomePanel } from './panel.js';
import { RaycastPlantSystem } from './raycast-plant.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
  world.registerSystem(RaycastPlantSystem);
});
