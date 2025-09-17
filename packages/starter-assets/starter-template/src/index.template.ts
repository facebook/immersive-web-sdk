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
} from '@iwsdk/core';
/* @template:if kind='manual' */
import {
  AudioSource,
  DistanceGrabbable,
  MovementMode,
  Interactable,
  PanelUI,
  PlaybackMode,
  ScreenSpace,
} from '@iwsdk/core';
/* @template:end */
/* @template:if kind='manual' */
import { EnvironmentType, LocomotionEnvironment } from '@iwsdk/core';
/* @template:end */
import { PanelSystem } from './panel.js';
/* @template:if kind='manual' */
import { Robot } from './robot.js';
/* @template:end */
import { RobotSystem } from './robot.js';

const assets: AssetManifest = {
  chimeSound: {
    url: '/audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background',
  },
  webxr: {
    url: '/textures/webxr.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  // @assets-manual-start
  // @assets-envdesk-start
  environmentDesk: {
    url: '/gltf/environmentDesk/environmentDesk.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  // @assets-envdesk-end
  plantSansevieria: {
    url: '/gltf/plantSansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  robot: {
    url: '/gltf/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  // @assets-manual-end
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: /* @session-mode */ SessionMode.ImmersiveAR,
    offer: 'always',
    // Optional structured features; layers/local-floor are offered by default
    features: {} /* @chef:xr */,
  },
  features: {} /* @chef:app */,
  /* @template:if kind='metaspatial' */ level:
    '/glxf/Composition.glxf' /* @template:end */,
}).then((world) => {
  const { camera } = world;
  /* @template:if mode='ar' */
  camera.position.set(0, 1, 0.5);
  /* @template:end */
  /* @template:if mode='vr' */
  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);
  /* @template:end */

  /* @template:if kind='manual' */
  /* @template:if mode='vr' */
  const { scene: envMesh } = AssetManager.getGLTF('environmentDesk')!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.1, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  /* @template:end */

  const { scene: plantMesh } = AssetManager.getGLTF('plantSansevieria')!;
  /* @template:if mode='ar' */
  plantMesh.position.set(1.2, 0.2, -1.8);
  plantMesh.scale.setScalar(2);
  /* @template:end */
  /* @template:if mode='vr' */
  plantMesh.position.set(1.2, 0.85, -1.8);
  /* @template:end */
  world
    .createTransformEntity(plantMesh)
    .addComponent(Interactable)
    .addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });

  const { scene: robotMesh } = AssetManager.getGLTF('robot')!;
  // defaults for AR
  robotMesh.position.set(-1.2, 0.4, -1.8);
  robotMesh.scale.setScalar(1);
  /* @template:if mode='vr' */
  robotMesh.position.set(-1.2, 0.95, -1.8);
  robotMesh.scale.setScalar(0.5);
  /* @template:end */
  world
    .createTransformEntity(robotMesh)
    .addComponent(Interactable)
    .addComponent(Robot)
    .addComponent(AudioSource, {
      src: '/audio/chime.mp3',
      maxInstances: 3,
      playbackMode: PlaybackMode.FadeRestart,
    });

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: '/ui/welcome.json',
      maxHeight: 0.8,
      maxWidth: 1.6,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%',
    });
  panelEntity.object3D!.position.set(0, 1.29, -1.9);
  /* @template:end */

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
