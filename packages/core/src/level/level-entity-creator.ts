/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { Object3D } from '../runtime/index.js';
import { LevelComponentApplier } from './level-component-applier.js';

/**
 * Creates ECS entities from Three.js Object3D graphs and applies IWSDK components
 * found in GLXF `meta_spatial.components` extras.
 *
 * @remarks
 * - Only nodes present in the GLXF `nodes` array are converted to entities.
 * - Component ids are matched against the registry by `com.iwsdk.components.<id>`.
 * - Panel UI extras are mapped to {@link PanelUI} with JSON config paths.
 *
 * @category Scene
 */
export class EntityCreator {
  static createEntitiesFromObject3D(
    object: Object3D,
    nodes: Object3D[],
    parentEntity: Entity,
    world: World,
  ): void {
    const inNodes = nodes.includes(object);
    if (!inNodes) {
      return;
    }

    const isLevelMetaEntity =
      typeof object.name === 'string' && object.name.toLowerCase() === 'level';

    // Special case: a GLXF node named "level" acts as a container for level-root components.
    // Do not create a new ECS entity for it; attach its components to the existing parentEntity (level root),
    // and continue processing its children under the same parentEntity.
    if (isLevelMetaEntity && object.userData?.meta_spatial?.components) {
      this.applyComponents(
        parentEntity,
        object.userData.meta_spatial.components,
        world,
      );
      // Continue processing the carrier's children under the same parentEntity
      // (the level root) — they are real scene content, not metadata. Without
      // this they were silently orphaned and never converted to ECS entities.
      object.children.forEach((child: Object3D) => {
        this.createEntitiesFromObject3D(child, nodes, parentEntity, world);
      });
      // Remove the carrier node from the scene graph; it's metadata-only
      object.removeFromParent();
      return;
    }

    const entity = world.createTransformEntity(object, parentEntity);

    if (object.userData?.meta_spatial?.components) {
      this.applyComponents(
        entity,
        object.userData.meta_spatial.components,
        world,
      );
    }

    object.children.forEach((child: Object3D) => {
      this.createEntitiesFromObject3D(child, nodes, entity, world);
    });
  }

  private static applyComponents(
    entity: Entity,
    glxfComponents: Record<string, unknown>,
    world: World,
  ): void {
    LevelComponentApplier.applyComponents(entity, glxfComponents, world);
  }
}
