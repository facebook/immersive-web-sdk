/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Component } from 'elics';
import type { Entity } from './entity.js';
import { World } from './world.js';

// Type for component instance data from GLXF
/** Field shape for GLXF component metadata. @category ECS */
export interface GLXFComponentData {
  [key: string]: {
    keyString: string;
    type: string;
    value: any;
    alias?: string;
  };
}

// Type for component registry entry
/** Mapping entry from GLXF name → component class and optional mapper. @category ECS */
export interface ComponentRegistryEntry {
  componentClass: Component<any>;
  description?: string;
  mapper?: (glxfData: GLXFComponentData) => Record<string, any>;
}

/**
 * Registry that maps GLXF component names to ECS component classes.
 *
 * @remarks
 * - Separate from `elics`' built-in registry to avoid naming conflicts.
 * - Supports custom field mappers to translate GLXF metadata to component props.
 *
 * @category ECS
 */
export class GLXFComponentRegistry {
  private static registry = new Map<string, ComponentRegistryEntry>();
  private static componentToName = new Map<Component<any>, string>();

  /** Register an ECS component class under a GLXF component name. */
  static register(
    glxfComponentName: string,
    componentClass: Component<any>,
    description?: string,
    mapper?: (glxfData: GLXFComponentData) => Record<string, any>,
  ): void {
    this.registry.set(glxfComponentName, {
      componentClass,
      description,
      mapper,
    });
    this.componentToName.set(componentClass, glxfComponentName);
  }

  /** Return the GLXF name for a given component class. */
  static getComponentName(component: Component<any>): string | undefined {
    return this.componentToName.get(component);
  }

  /** Lookup a registered mapping entry by GLXF name. */
  static getComponent(
    glxfComponentName: string,
  ): ComponentRegistryEntry | undefined {
    return this.registry.get(glxfComponentName);
  }

  /** Apply mapped components from GLXF metadata to an entity. */
  static applyComponents(
    entity: Entity,
    world: World,
    glxfComponents: Record<string, GLXFComponentData>,
  ): void {
    Object.entries(glxfComponents).forEach(([componentName, componentData]) => {
      const entry = this.getComponent(componentName);
      if (entry) {
        // Use custom mapper if provided, otherwise use default mapping
        const componentProps = entry.mapper
          ? entry.mapper(componentData)
          : this.defaultMapper(componentData);

        console.log(
          `Applying component "${componentName}" to entity with props:`,
          componentProps,
        );

        if (!entry.componentClass.bitmask) {
          world.registerComponent(entry.componentClass);
        }
        entity.addComponent(entry.componentClass, componentProps);
      } else {
        console.warn(
          `Component "${componentName}" not found in registry. Available components:`,
          Array.from(this.registry.keys()),
        );
      }
    });
  }

  /** Default mapper converting GLXF `{ key: { value } }` shape to props. */
  private static defaultMapper(
    glxfData: GLXFComponentData,
  ): Record<string, any> {
    const props: Record<string, any> = {};

    Object.entries(glxfData).forEach(([key, fieldData]) => {
      if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
        props[key] = fieldData.value;
      }
    });

    return props;
  }

  /** List all registered GLXF component names. */
  static getRegisteredComponents(): string[] {
    return Array.from(this.registry.keys());
  }

  /** Clear the registry (useful for tests). */
  static clear(): void {
    this.registry.clear();
    this.componentToName.clear();
  }

  /** Placeholder to wire built‑in mappings from generated metadata. */
  static setupBuiltinComponents(): void {
    // This will be populated with the actual component imports
    // For now, we'll register the components we know about
    // Note: This is a temporary solution. In a real implementation,
    // we would need to import the actual component objects and register them
    // with their correct names from the components.json
  }
}
