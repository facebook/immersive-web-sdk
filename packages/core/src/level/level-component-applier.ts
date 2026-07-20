/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { AnySchema, Component } from 'elics';
import { ComponentRegistry, Types } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { PanelUI } from '../ui/index.js';

/** Component id prefix used by legacy GLXF and accepted by native scene JSON. */
export const LEVEL_COMPONENT_PREFIX = 'com.iwsdk.components.';

const LEVEL_COMPONENT_ALIASES: Record<string, string> = {
  Interactable: 'RayInteractable',
};

export interface LevelComponentApplyOptions {
  allowUnprefixedComponents?: boolean;
  nodeId?: string;
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
      const targetId = normalizeComponentId(componentKey);
      const resolvedComponentData = unwrapTypedComponentData(
        componentKey,
        targetId,
        componentData,
        {
          componentName,
          nodeId: options.nodeId,
          strict: options.strict,
        },
      );
      if (targetId === 'PanelUI') {
        return;
      }

      const component = allComponents.find((comp) => comp.id === targetId);
      if (component) {
        const componentProps = this.mapComponentDataToProps(
          component,
          resolvedComponentData,
        );
        if (!component.bitmask) {
          world.registerComponent(component);
        }
        entity.addComponent(component, componentProps);
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

  private static mapComponentDataToProps(
    component: Component<AnySchema>,
    componentData: unknown,
  ): Record<string, unknown> {
    if (!isRecord(componentData)) {
      return {};
    }

    const props: Record<string, unknown> = {};
    Object.entries(componentData).forEach(([key, fieldData]) => {
      if (!component.schema[key]) {
        return;
      }

      if (isRecord(fieldData)) {
        if (component.schema[key].type === Types.Enum && 'alias' in fieldData) {
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
    const resolvedPanelComponent = unwrapTypedComponentData(
      'PanelUI',
      'PanelUI',
      panelComponent,
      {
        componentName: panelComponentName,
        nodeId: options.nodeId,
        strict: options.strict,
      },
    );

    if (!isRecord(resolvedPanelComponent)) {
      return;
    }

    const props = this.mapComponentDataToProps(PanelUI, resolvedPanelComponent);
    if (typeof props.config !== 'string' || props.config.length === 0) {
      return;
    }

    if (!PanelUI.bitmask) {
      world.registerComponent(PanelUI);
    }
    entity.addComponent(PanelUI, {
      config: props.config.replace('.uikitml', '.json'),
      maxHeight: typeof props.maxHeight === 'number' ? props.maxHeight : 1,
      maxWidth: typeof props.maxWidth === 'number' ? props.maxWidth : 1,
    });
  }
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

function normalizeComponentId(componentId: string): string {
  return LEVEL_COMPONENT_ALIASES[componentId] ?? componentId;
}

function unwrapTypedComponentData(
  componentKey: string,
  resolvedType: string,
  componentData: unknown,
  context: {
    componentName: string;
    nodeId?: string;
    strict?: boolean;
  },
): unknown {
  if (!isTypedComponentData(componentData)) {
    return componentData;
  }

  if (
    componentData.type !== componentKey &&
    componentData.type !== resolvedType
  ) {
    const message = `Typed component payload type "${componentData.type}" does not match component key "${componentKey}".`;
    if (context.strict) {
      throw new Error(
        withSceneComponentContext(
          message,
          context.nodeId,
          context.componentName,
        ),
      );
    }
    console.warn(message);
  }
  return componentData.props ?? {};
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

function isTypedComponentData(
  value: unknown,
): value is { type: string; props?: unknown } {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'type' || key === 'props') &&
    typeof value.type === 'string' &&
    value.type.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
