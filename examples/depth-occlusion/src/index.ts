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
  BoxGeometry,
  Color,
  createSystem,
  CylinderGeometry,
  DepthOccludable,
  DepthSensingSystem,
  DistanceGrabbable,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  OcclusionShadersMode,
  PanelUI,
  PokeInteractable,
  RayInteractable,
  ReferenceSpaceType,
  ScreenSpace,
  SessionMode,
  SphereGeometry,
  Vector3,
  World,
  XRAnchor,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { LogInIcon, RectangleGogglesIcon } from '@pmndrs/uikit-lucide';
import { SettingsSystem } from './panel.js';

/**
 * Demo system that creates occludable objects and configures occlusion materials.
 * Virtual objects will be hidden when they pass behind real-world surfaces.
 */
export class OcclusionDemoSystem extends createSystem({
  occludables: { required: [DepthOccludable] },
}) {
  init() {
    this.createOccludableSphere(new Vector3(0, 0.8, -0.8), 0xff4444);
    this.createHardModeOccludableCube(new Vector3(-0.4, 0.8, -0.6), 0x44ff44);
    this.createNonOccludableCylinder(new Vector3(0.4, 0.8, -0.6), 0x4444ff);
    this.createOccludablePlant(new Vector3(-0.6, 0, -1.0));
    this.createOccludableRobot(new Vector3(0.6, 0, -1.0));
  }

  createOccludableSphere(position: Vector3, color: number, radius = 0.5) {
    const geometry = new SphereGeometry(radius);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable);

    return entity;
  }

  createHardModeOccludableCube(position: Vector3, color: number, size = 0.25) {
    const geometry = new BoxGeometry(size, size, size);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable, {
      mode: OcclusionShadersMode.HardOcclusion,
    });

    return entity;
  }

  createNonOccludableCylinder(
    position: Vector3,
    color: number,
    radius = 0.05,
    height = 0.2,
  ) {
    const geometry = new CylinderGeometry(radius, radius, height, 32);
    const material = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const entity = this.world.createTransformEntity(mesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    return entity;
  }

  createOccludablePlant(position: Vector3) {
    const { scene: plantMesh } = AssetManager.getGLTF('plantSansevieria')!;
    plantMesh.position.copy(position);
    this.scene.add(plantMesh);

    const entity = this.world.createTransformEntity(plantMesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable);

    return entity;
  }

  createOccludableRobot(position: Vector3) {
    const { scene: robotMesh } = AssetManager.getGLTF('robot')!;
    robotMesh.position.copy(position);
    this.scene.add(robotMesh);

    const entity = this.world.createTransformEntity(robotMesh);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    entity.addComponent(XRAnchor);
    entity.addComponent(DepthOccludable, {
      mode: OcclusionShadersMode.MinMaxSoftOcclusion,
    });

    return entity;
  }

  update() {
    const time = performance.now() * 0.001;
    for (const entity of this.queries.occludables.entities) {
      if (entity.object3D) {
        entity.object3D.rotation.y = time * 0.5;
        entity.object3D.rotation.x = Math.sin(time * 0.3) * 0.2;
      }
    }
  }
}

const assets: AssetManifest = {
  robot: {
    url: '/iwsdk-assets/robot/robot.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  plantSansevieria: {
    url: '/iwsdk-assets/plant-sansevieria/plantSansevieria.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
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
    spatialUI: { kits: [horizonKit, { LogInIcon, RectangleGogglesIcon }] },
  },
}).then((world) => {
  const { scene, camera } = world;

  scene.background = null;

  camera.position.set(0, 1.6, 0);

  world
    .registerSystem(DepthSensingSystem, {
      configData: {
        enableDepthTexture: true,
        enableOcclusion: true,
        useFloat32: true,
        blurRadius: 20.0,
      },
    })
    .registerComponent(DepthOccludable);

  world.registerSystem(OcclusionDemoSystem);

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
    });
  panelEntity.object3D!.position.set(0, 1.5, -1.4);

  world.registerSystem(SettingsSystem);
});
