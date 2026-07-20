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
  PanelUI,
  PokeInteractable,
  RayInteractable,
  ScreenSpace,
  SessionMode,
  World,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { LogInIcon, RectangleGogglesIcon } from '@pmndrs/uikit-lucide';
import { Elevator, ElevatorSystem } from './elevator.js';
import { SettingsSystem } from './panel.js';

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
    spatialUI: {
      kits: [horizonKit, { LogInIcon, RectangleGogglesIcon }],
    },
  },
}).then((world) => {
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
  const welcomePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxWidth: 1.8,
      maxHeight: 1.0,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
      right: 'auto',
      bottom: 'auto',
      width: 'auto',
      zOffset: 0.2,
    });
  welcomePanel.object3D!.position.set(0, 1.6, -2);

  // Settings panel (in-world)
  const settingsPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/settings.json',
      maxWidth: 1.8,
      maxHeight: 1.0,
    })
    .addComponent(RayInteractable);
  settingsPanel.object3D!.position.set(0, 1.182, 1.856);
  settingsPanel.object3D!.rotateY(Math.PI);

  world.registerSystem(SettingsSystem).registerSystem(ElevatorSystem);
});
