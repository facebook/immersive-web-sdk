/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  AssetManifest,
  AssetType,
  EnvironmentType,
  LocomotionEnvironment,
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  UIKitMLAsset,
  World,
} from '@iwsdk/core';
import { Elevator, ElevatorSystem } from './elevator.js';
import {
  configureWelcomePanel,
  LocomotionSettingsPanel,
  SettingsSystem,
} from './panel.js';

const assets: AssetManifest = {
  switchSound: {
    url: './audio/switch.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  environmentDesk: {
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  welcomePanel: {
    name: 'Welcome panel',
    type: AssetType.UIKitML,
    url: './ui/welcome.uikitml',
  },
  settingsPanel: {
    name: 'Locomotion settings',
    type: AssetType.UIKitML,
    url: './ui/settings.uikitml',
  },
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  render: {
    near: 0.001,
    far: 300,
  },
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: {
      handTracking: { required: true },
    },
  },
  features: {
    grabbing: true,
    locomotion: true,
    spatialUI: true,
  },
}).then(async (world) => {
  const { camera } = world;
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  // Static environment floor
  const { scene: envMesh } = AssetManager.getGLTF('environmentDesk')!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.107, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Elevator platform (cloned from same GLTF)
  const elevatorMesh = envMesh.clone();
  elevatorMesh.rotation.set(0, 0, 0);
  elevatorMesh.position.set(13, 0, -7.5);
  world
    .createTransformEntity(elevatorMesh)
    .addComponent(Elevator, { speed: 0.5, deltaY: 4 })
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.KINEMATIC });

  // Welcome panel (screen-space)
  const welcomePanelAsset =
    await world.assets.instantiate<UIKitMLAsset>('welcomePanel');
  const welcomePanel = world
    .createTransformEntity(welcomePanelAsset)
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
      right: 'auto',
      bottom: 'auto',
      width: '25vw',
      zOffset: 0.2,
    });
  welcomePanel.object3D!.position.set(0, 1.6, -2);
  welcomePanel.object3D!.scale.setScalar(0.523);
  configureWelcomePanel(world, welcomePanelAsset);

  // Settings panel (in-world)
  const settingsPanelAsset =
    await world.assets.instantiate<UIKitMLAsset>('settingsPanel');
  const settingsPanel = world
    .createTransformEntity(settingsPanelAsset)
    .addComponent(LocomotionSettingsPanel)
    .addComponent(RayInteractable);
  settingsPanel.object3D!.position.set(0, 1.182, 1.856);
  settingsPanel.object3D!.rotateY(Math.PI);
  settingsPanel.object3D!.visible = false;

  world.registerSystem(SettingsSystem).registerSystem(ElevatorSystem);
});
