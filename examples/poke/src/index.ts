/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitMLAsset, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { configureWelcomePanel } from './panel.js';
import { RobotSystem } from './robot.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  const panel = world.requireSceneObject<UIKitMLAsset>('welcome-panel');
  configureWelcomePanel(
    world,
    panel,
    world.requireSceneEntity('welcome-panel'),
  );
  world.registerSystem(RobotSystem);
});
