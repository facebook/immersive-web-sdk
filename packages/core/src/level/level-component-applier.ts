/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { AnySchema, Component } from 'elics';
import { getComponentEditorMetadata } from '../ecs/component-editor-metadata.js';
import { ComponentRegistry, Types } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { PanelUI } from '../ui/index.js';

/** Canonical component id prefix used by native scene JSON. */
export const LEVEL_COMPONENT_PREFIX = 'com.iwsdk.components.';

const LEVEL_COMPONENT_ALIASES: Record<string, string> = {
  Interactable: 'RayInteractable',
};

let didWarnInteractableAlias = false;

export interface LevelComponentApplyOptions {
  allowUnprefixedComponents?: boolean;
  nodeId?: string;
  resolveEntityReference?: (reference: unknown) => Entity | undefined;
  strict?: boolean;
}

export class LevelComponentApplier {
  static applyComponents(
    entity: Entity,
    components: Record<string, unknown>,
    world: World,
    options: LevelComponentApplyOptions = {},
  ): void {
    const allComponents = ComponentRegistry.getAllComponents();
    this.handlePanelComponents(entity, components, world, options);

    Object.entries(components).forEach(([componentName, componentData]) => {
      const hasPackagePrefix = componentName.startsWith(LEVEL_COMPONENT_PREFIX);
      const allowUnprefixed =
        options.allowUnprefixedComponents === true || options.strict === true;
      if (!hasPackagePrefix && !allowUnprefixed) {
        return;
      }

      const componentKey = stripComponentPrefix(componentName);
      const targetId = normalizeComponentId(componentKey, allComponents, true);
      if (targetId === 'PanelUI') {
        return;
      }

      const component = allComponents.find((comp) => comp.id === targetId);
      if (component) {
        const componentProps = this.mapComponentDataToProps(
          component,
          componentData,
          options,
        );
        if (!component.bitmask) {
          world.registerComponent(component);
        }
        if (
          entity.hasComponent(component) &&
          getComponentEditorMetadata(component)?.intrinsic === true
        ) {
          this.updateComponent(entity, component, componentProps);
        } else {
          entity.addComponent(component, componentProps);
        }
      } else if (options.strict) {
        throw new Error(
          withSceneComponentContext(
            `Unknown component "${componentName}". Available components: ${allComponents
              .map((comp) => comp.id)
              .join(', ')}`,
            options.nodeId,
            componentName,
          ),
        );
      } else if (componentName.startsWith(LEVEL_COMPONENT_PREFIX)) {
        console.warn(
          `Component "${componentName}" not found in registry. Available components:`,
          allComponents.map((comp) => comp.id),
        );
      }
    });
  }

  static removeComponents(
    entity: Entity,
    components: Record<string, unknown> | undefined,
  ): void {
    if (components == null) {
      return;
    }
    const allComponents = ComponentRegistry.getAllComponents();
    for (const componentName of Object.keys(components)) {
      const targetId = normalizeComponentId(
        stripComponentPrefix(componentName),
        allComponents,
      );
      const component = allComponents.find((entry) => entry.id === targetId);
      if (component && entity.hasComponent(component)) {
        if (getComponentEditorMetadata(component)?.intrinsic === true) {
          if (component.id === 'Visibility') {
            (entity as any).setValue(component, 'isVisible', true);
          }
        } else {
          entity.removeComponent(component);
        }
      }
    }
  }

  private static updateComponent(
    entity: Entity,
    component: Component<AnySchema>,
    props: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(props)) {
      const field = component.schema[key];
      if (field == null) {
        continue;
      }
      if (
        field.type === Types.Vec2 ||
        field.type === Types.Vec3 ||
        field.type === Types.Vec4 ||
        field.type === Types.Color
      ) {
        if (Array.isArray(value)) {
          (entity as any).getVectorView(component, key).set(value);
        }
        continue;
      }
      (entity as any).setValue(component, key, value);
    }
  }

  private static mapComponentDataToProps(
    component: Component<AnySchema>,
    componentData: unknown,
    options: LevelComponentApplyOptions,
  ): Record<string, unknown> {
    if (!isRecord(componentData)) {
      return {};
    }

    const props: Record<string, unknown> = {};
    Object.entries(componentData).forEach(([key, fieldData]) => {
      const field = component.schema[key] as
        | Record<string, unknown>
        | undefined;
      if (!field) {
        return;
      }

      if (isRecord(fieldData)) {
        if (
          (field.type === Types.Entity || field.widget === 'entity') &&
          isSceneEntityReference(fieldData)
        ) {
          const referencedEntity = options.resolveEntityReference?.(fieldData);
          if (referencedEntity == null) {
            if (options.strict) {
              throw new Error(
                `Unable to resolve entity reference ${JSON.stringify(fieldData)}`,
              );
            }
            props[key] = fieldData;
          } else {
            props[key] =
              field.type === Types.Entity
                ? referencedEntity
                : referencedEntity.object3D;
          }
        } else if (field.type === Types.Enum && 'alias' in fieldData) {
          props[key] = fieldData.alias;
        } else if ('value' in fieldData) {
          props[key] = fieldData.value;
        } else {
          props[key] = fieldData;
        }
      } else {
        props[key] = fieldData;
      }
    });
    return props;
  }

  private static handlePanelComponents(
    entity: Entity,
    components: Record<string, unknown>,
    world: World,
    options: LevelComponentApplyOptions,
  ): void {
    const panelComponentName =
      canUseUnprefixedComponents(options) && components.PanelUI != null
        ? 'PanelUI'
        : `${LEVEL_COMPONENT_PREFIX}PanelUI`;
    const panelComponent =
      panelComponentName === 'PanelUI'
        ? components.PanelUI
        : components[`${LEVEL_COMPONENT_PREFIX}PanelUI`];
    const resolvedPanelComponent = panelComponent;

    if (!isRecord(resolvedPanelComponent)) {
      return;
    }

    const props = this.mapComponentDataToProps(
      PanelUI,
      resolvedPanelComponent,
      options,
    );
    if (typeof props.config !== 'string' || props.config.length === 0) {
      return;
    }

    if (!PanelUI.bitmask) {
      world.registerComponent(PanelUI);
    }
    entity.addComponent(PanelUI, {
      config: props.config,
    });
  }
}

function isSceneEntityReference(value: Record<string, unknown>): boolean {
  return (
    (value.type === 'node' && typeof value.id === 'string') ||
    (value.type === 'player-space' && typeof value.target === 'string') ||
    value.type === 'level-root'
  );
}

function canUseUnprefixedComponents(
  options: LevelComponentApplyOptions,
): boolean {
  return options.allowUnprefixedComponents === true || options.strict === true;
}

function stripComponentPrefix(componentName: string): string {
  return componentName.startsWith(LEVEL_COMPONENT_PREFIX)
    ? componentName.slice(LEVEL_COMPONENT_PREFIX.length)
    : componentName;
}

function normalizeComponentId(
  componentId: string,
  components: readonly Component<AnySchema>[],
  warnDeprecatedAlias = false,
): string {
  const targetId = components.some((component) => component.id === componentId)
    ? componentId
    : (LEVEL_COMPONENT_ALIASES[componentId] ?? componentId);

  if (
    targetId !== componentId &&
    warnDeprecatedAlias &&
    !didWarnInteractableAlias &&
    shouldEmitDevWarning()
  ) {
    didWarnInteractableAlias = true;
    console.warn(
      '[IWSDK] `Interactable` is deprecated; use `RayInteractable` instead. See https://iwsdk.dev/api/core/variables/Interactable.html',
    );
  }
  return targetId;
}

function shouldEmitDevWarning(): boolean {
  return (import.meta as any).env?.DEV !== false;
}

/** @internal */
export function resetLevelComponentWarningStateForTests(): void {
  didWarnInteractableAlias = false;
}
function withSceneComponentContext(
  message: string,
  nodeId: string | undefined,
  componentName: string,
): string {
  return nodeId == null
    ? `Component "${componentName}": ${message}`
    : `Scene node "${nodeId}" component "${componentName}": ${message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
