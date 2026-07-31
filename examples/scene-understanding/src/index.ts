/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManifest,
  AssetType,
  Color,
  createSystem,
  DistanceGrabbable,
  DomeTexture,
  eq,
  FrontSide,
  IBLTexture,
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  PokeInteractable,
  RayInteractable,
  ReferenceSpaceType,
  ScreenSpace,
  SessionMode,
  SphereGeometry,
  UIKitMLAsset,
  Vector3,
  World,
  XRAnchor,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import { configureWelcomePanel } from './panel.js';

export class SceneShowSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
  meshEntities: {
    required: [XRMesh],
    where: [eq(XRMesh, 'isBounded3D', true)],
  },
}) {
  private worldRotation!: Vector3;
  private anchoredMesh!: Mesh;

  init() {
    this.worldRotation = new Vector3();
    this.anchoredMesh = new Mesh(
      new SphereGeometry(0.2),
      new MeshStandardMaterial({
        side: FrontSide,
        color: new Color(Math.random(), Math.random(), Math.random()),
      }),
    );
    this.anchoredMesh.position.set(0, 1, -1);
    this.scene.add(this.anchoredMesh);
    const anchoredEntity = this.world.createTransformEntity(this.anchoredMesh);
    anchoredEntity.addComponent(RayInteractable);
    anchoredEntity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });
    anchoredEntity.addComponent(XRAnchor);

    this.queries.planeEntities.subscribe('qualify', (planeEntity) => {
      if (!planeEntity.hasComponent(RayInteractable)) {
        console.log(
          'SceneShowSystem configure + planeEntity ' + planeEntity.index,
        );
        planeEntity.object3D!.visible = false;
        planeEntity.addComponent(RayInteractable);
        planeEntity.object3D!.addEventListener('pointerenter', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = true;
          }
        });
        planeEntity.object3D!.addEventListener('pointerleave', () => {
          if (planeEntity.object3D) {
            planeEntity.object3D.visible = false;
          }
        });
      }
    });

    this.queries.meshEntities.subscribe('qualify', (meshEntity) => {
      if (!meshEntity.hasComponent(RayInteractable)) {
        meshEntity.addComponent(RayInteractable);
        meshEntity.object3D!.visible = false;
        meshEntity.object3D!.addEventListener('pointerenter', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = true;
          }
        });
        meshEntity.object3D!.addEventListener('pointerleave', () => {
          if (meshEntity.object3D) {
            meshEntity.object3D.visible = false;
          }
        });
      }
    });
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets: {
    veniceSunset: {
      url: './textures/venice_sunset_1k.exr',
      type: AssetType.HDRTexture,
      priority: 'critical',
    },
    welcomePanel: {
      name: 'Welcome panel',
      type: AssetType.UIKitML,
      url: './ui/welcome.uikitml',
    },
  } as AssetManifest,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    referenceSpace: ReferenceSpaceType.Unbounded,
    features: {
      hitTest: { required: true },
      planeDetection: { required: true },
      meshDetection: { required: true },
      anchors: { required: true },
      unbounded: { required: true },
    },
  },
  features: {
    grabbing: true,
    sceneUnderstanding: true,
    spatialUI: true,
  },
}).then(async (world) => {
  const { scene } = world;

  scene.background = new Color(0x808080);

  const root = world.activeLevel.value;
  root.addComponent(IBLTexture, { src: 'veniceSunset' });
  root.addComponent(DomeTexture, { src: 'veniceSunset' });

  const panel = await world.assets.instantiate<UIKitMLAsset>('welcomePanel');
  const panelEntity = world
    .createTransformEntity(panel)
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '50%',
    });
  panelEntity.object3D!.position.set(0, 1.5, -1.4);
  panelEntity.object3D!.scale.setScalar(0.145);

  world.registerSystem(SceneShowSystem);
  configureWelcomePanel(world, panel);
});
