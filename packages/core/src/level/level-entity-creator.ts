/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AnySchema, Component, ComponentRegistry } from 'elics';
import { Types, Entity } from '../ecs/index.js';
import type { World } from '../ecs/index.js';
import { Object3D } from '../runtime/index.js';
import { PanelUI } from '../ui/index.js';

/** Component id prefix expected in GLXF extras. */
const PACKAGE_PREFIX = 'com.iwsdk.components.';

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
    glxfComponents: Record<string, any>,
    world: World,
  ): void {
    const allComponents = ComponentRegistry.getAllComponents();
    this.handleMetaSpatialPanelComponents(entity, glxfComponents, world);

    Object.entries(glxfComponents).forEach(([componentName, componentData]) => {
      if (componentName === 'com.iwsdk.components.PanelUI') {
        return;
      }
      if (!componentName.startsWith(PACKAGE_PREFIX)) {
        return;
      }

      const targetId = componentName.slice(PACKAGE_PREFIX.length);
      const component = allComponents.find((comp) => comp.id === targetId);
      if (component) {
        const componentProps = this.mapGLXFDataToProps(
          component,
          componentData,
        );
        if (!component.bitmask) {
          world.registerComponent(component);
        }
        entity.addComponent(component, componentProps);
      } else {
        console.warn(
          `Component "${componentName}" not found in registry. Available components:`,
          allComponents.map((comp) => comp.id),
        );
      }
    });
  }

  private static mapGLXFDataToProps(
    component: Component<AnySchema>,
    glxfData: Record<string, any>,
  ): Record<string, any> {
    const props: Record<string, any> = {};
    Object.entries(glxfData).forEach(([key, fieldData]) => {
      if (fieldData && typeof fieldData === 'object' && component.schema[key]) {
        if (component.schema[key].type === Types.Enum && 'alias' in fieldData) {
          props[key] = fieldData.alias;
        } else if ('value' in fieldData) {
          props[key] = fieldData.value;
        }
      }
    });
    return props;
  }

  private static handleMetaSpatialPanelComponents(
    entity: Entity,
    glxfComponents: Record<string, any>,
    world: World,
  ): void {
    const panelComponent = glxfComponents['com.iwsdk.components.PanelUI'];

    if (!panelComponent || !panelComponent.config?.value) {
      return;
    }

    const config = (panelComponent.config.value as string).replace(
      '.uikitml',
      '.json',
    );
    const maxWidth = (panelComponent.maxWidth?.value ?? 1) as number;
    const maxHeight = (panelComponent.maxHeight?.value ?? 1) as number;

    if (!PanelUI.bitmask) {
      world.registerComponent(PanelUI);
    }
    entity.addComponent(PanelUI, { config, maxWidth, maxHeight });
  }
}
