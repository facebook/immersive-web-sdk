/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  AudioSource,
  RayInteractable,
  PanelUI,
  ScreenSpace,
  PokeInteractable,
  EnvironmentType,
  LocomotionEnvironment,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import {
  LogInIcon,
  RectangleGogglesIcon,
  MousePointerClickIcon,
} from '@pmndrs/uikit-lucide';
import { PanelSystem } from './panel.js';
import { Robot } from './robot.js';
import { RobotSystem } from './robot.js';

const assets: AssetManifest = {
  chimeSound: {
    url: './audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  webxr: {
    url: './textures/webxr.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  environmentDesk: {
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  robot: {
    url: '/iwsdk-assets/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    // Optional structured features; layers/local-floor are offered by default
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    spatialUI: {
      kits: [
        horizonKit,
        { LogInIcon, RectangleGogglesIcon, MousePointerClickIcon },
      ],
    },
  },
}).then((world) => {
  const { camera } = world;

  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  const { scene: envMesh } = AssetManager.getGLTF('environmentDesk')!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.1, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  const { scene: robotMesh } = AssetManager.getGLTF('robot')!;

  robotMesh.position.set(0, 0.95, -1.5);
  robotMesh.scale.setScalar(0.5);

  world
    .createTransformEntity(robotMesh)
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(Robot)
    .addComponent(AudioSource, { src: './audio/chime.mp3' });

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxHeight: 0.4,
      maxWidth: 0.5,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '50%',
    })
    .addComponent(AudioSource, { src: './audio/chime.mp3' });
  panelEntity.object3D!.position.set(0, 1.5, -1.4);

  const webxrLogoTexture = AssetManager.getTexture('webxr')!;
  webxrLogoTexture.colorSpace = SRGBColorSpace;
  const logoBanner = new Mesh(
    new PlaneGeometry(3.39, 0.96),
    new MeshBasicMaterial({
      map: webxrLogoTexture,
      transparent: true,
    }),
  );
  world.createTransformEntity(logoBanner);
  logoBanner.position.set(0, 1, 1.8);
  logoBanner.rotateY(Math.PI);

  world.registerSystem(PanelSystem).registerSystem(RobotSystem);
});
