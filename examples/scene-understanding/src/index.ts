/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  type Entity,
  eq,
  type Material,
  Mesh,
  RayInteractable,
  UIKitMLAsset,
  World,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { configureWelcomePanel } from './panel.js';

type MeshMaterial = Material | Material[];

type RevealState = {
  hiddenMaterial: MeshMaterial;
  object: Mesh;
  originalMaterial: MeshMaterial;
  originalVisible: boolean;
  pointerEnter: () => void;
  pointerLeave: () => void;
};

export class SceneShowSystem extends createSystem({
  planeEntities: { required: [XRPlane] },
  meshEntities: {
    required: [XRMesh],
    where: [eq(XRMesh, 'isBounded3D', true)],
  },
}) {
  private hiddenMaterials = new Map<Material, Material>();
  private revealStates = new Map<Entity, RevealState>();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.planeEntities.subscribe(
        'qualify',
        (entity) => this.setupReveal(entity),
        true,
      ),
      this.queries.planeEntities.subscribe('disqualify', (entity) =>
        this.cleanupReveal(entity),
      ),
      this.queries.meshEntities.subscribe(
        'qualify',
        (entity) => this.setupReveal(entity),
        true,
      ),
      this.queries.meshEntities.subscribe('disqualify', (entity) =>
        this.cleanupReveal(entity),
      ),
      () => {
        for (const entity of [...this.revealStates.keys()]) {
          this.cleanupReveal(entity);
        }
        for (const material of this.hiddenMaterials.values()) {
          material.dispose();
        }
        this.hiddenMaterials.clear();
      },
    );
  }

  private setupReveal(entity: Entity): void {
    const object = entity.object3D;
    if (
      this.revealStates.has(entity) ||
      entity.hasComponent(RayInteractable) ||
      !(object instanceof Mesh)
    ) {
      return;
    }

    const originalMaterial = object.material;
    const hiddenMaterial = this.getHiddenMaterial(originalMaterial);
    const pointerEnter = () => {
      object.material = originalMaterial;
    };
    const pointerLeave = () => {
      object.material = hiddenMaterial;
    };

    this.revealStates.set(entity, {
      hiddenMaterial,
      object,
      originalMaterial,
      originalVisible: object.visible,
      pointerEnter,
      pointerLeave,
    });

    object.material = hiddenMaterial;
    // Keep the object semantically visible so pointer filtering can hit it.
    // Material.visible controls rendering without disabling raycasting.
    object.visible = true;
    object.addEventListener('pointerenter', pointerEnter);
    object.addEventListener('pointerleave', pointerLeave);
    entity.addComponent(RayInteractable);
  }

  private cleanupReveal(entity: Entity): void {
    const state = this.revealStates.get(entity);
    if (state === undefined) {
      return;
    }

    state.object.removeEventListener('pointerenter', state.pointerEnter);
    state.object.removeEventListener('pointerleave', state.pointerLeave);
    state.object.material = state.originalMaterial;
    state.object.visible = state.originalVisible;
    this.revealStates.delete(entity);

    if (entity.active && entity.hasComponent(RayInteractable)) {
      entity.removeComponent(RayInteractable);
    }
  }

  private getHiddenMaterial(material: MeshMaterial): MeshMaterial {
    if (Array.isArray(material)) {
      return material.map((entry) => this.getHiddenMaterialClone(entry));
    }
    return this.getHiddenMaterialClone(material);
  }

  private getHiddenMaterialClone(material: Material): Material {
    let hiddenMaterial = this.hiddenMaterials.get(material);
    if (hiddenMaterial === undefined) {
      hiddenMaterial = material.clone();
      hiddenMaterial.visible = false;
      this.hiddenMaterials.set(material, hiddenMaterial);
    }
    return hiddenMaterial;
  }
}

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(SceneShowSystem);
  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );
});
