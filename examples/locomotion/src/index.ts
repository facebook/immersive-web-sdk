/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { UIKitMLAsset, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ElevatorSystem } from './elevator.js';
import { configureWelcomePanel, SettingsSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
  world.registerSystem(SettingsSystem).registerSystem(ElevatorSystem);
});
