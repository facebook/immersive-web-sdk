/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSceneComponentCatalog,
  type JsonValue,
  type SceneComponentCatalog,
  type SceneComponentFieldSchema,
  type SceneComponentSchema,
} from '@iwsdk/scene-composition';
import { ComponentRegistry, type AnyComponent } from './component.js';

export type ComponentManifest<
  T extends readonly AnyComponent[] = readonly AnyComponent[],
> = T & {
  /** Used by the managed editor to detect split Elics module instances. */
  readonly componentRegistry: typeof ComponentRegistry;
};

/**
 * Declare the complete set of application components shared by runtime and
 * editor. Individual createComponent declarations remain unchanged.
 */
export function defineComponents<const T extends readonly AnyComponent[]>(
  components: T,
): ComponentManifest<T> {
  const ids = new Set<string>();
  for (const component of components) {
    if (component.id.trim().length === 0) {
      throw new Error('Component IDs must not be blank');
    }
    if (ids.has(component.id)) {
      throw new Error(`Duplicate component manifest ID "${component.id}"`);
    }
    ids.add(component.id);
  }
  const manifest = [...components] as unknown as ComponentManifest<T>;
  Object.defineProperty(manifest, 'componentRegistry', {
    configurable: false,
    enumerable: false,
    value: ComponentRegistry,
    writable: false,
  });
  return Object.freeze(manifest);
}

export interface ComponentCatalogOptions {
  source?: SceneComponentSchema['source'];
}

/** Derive editor and validation metadata from the actual Elics schema. */
export function sceneComponentSchemaFromComponent(
  component: AnyComponent,
  options: ComponentCatalogOptions = {},
): SceneComponentSchema {
  const fields: Record<string, SceneComponentFieldSchema> = {};
  for (const [fieldName, source] of Object.entries(component.schema)) {
    const field = source as Record<string, unknown>;
    const defaultValue = jsonValueOrUndefined(field.default);
    fields[fieldName] = {
      type: String(field.type) as SceneComponentFieldSchema['type'],
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(typeof field.description === 'string'
        ? { description: field.description }
        : {}),
      ...(typeof field.label === 'string' ? { label: field.label } : {}),
      ...(typeof field.help === 'string' ? { help: field.help } : {}),
      ...(isComponentWidget(field.widget) ? { widget: field.widget } : {}),
      ...(typeof field.step === 'number' && Number.isFinite(field.step)
        ? { step: field.step }
        : {}),
      ...(isStringRecord(field.enum) ? { enum: field.enum } : {}),
      ...(typeof field.fileTypes === 'string'
        ? { fileTypes: field.fileTypes }
        : {}),
      ...(typeof field.subfolder === 'string'
        ? { subfolder: field.subfolder }
        : {}),
      ...(typeof field.min === 'number' && Number.isFinite(field.min)
        ? { min: field.min }
        : {}),
      ...(typeof field.max === 'number' && Number.isFinite(field.max)
        ? { max: field.max }
        : {}),
      ...(field.hidden === true || fieldName.startsWith('_')
        ? { hidden: true }
        : {}),
    };
  }
  return {
    id: component.id,
    ...(component.description == null
      ? {}
      : { description: component.description }),
    fields,
    source: options.source ?? 'app',
  };
}

export function componentCatalogFromComponents(
  components: readonly AnyComponent[],
  options: ComponentCatalogOptions = {},
): SceneComponentCatalog {
  return createSceneComponentCatalog(
    components.map((component) =>
      sceneComponentSchemaFromComponent(component, options),
    ),
  );
}

function jsonValueOrUndefined(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const entries = value.map(jsonValueOrUndefined);
    return entries.every((entry) => entry !== undefined)
      ? (entries as JsonValue[])
      : undefined;
  }
  if (value != null && typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([key, entry]) => [key, jsonValueOrUndefined(entry)] as const,
    );
    return entries.every(([, entry]) => entry !== undefined)
      ? (Object.fromEntries(entries) as Record<string, JsonValue>)
      : undefined;
  }
  return undefined;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function isComponentWidget(
  value: unknown,
): value is NonNullable<SceneComponentFieldSchema['widget']> {
  return ['slider', 'color', 'vector', 'text', 'select'].includes(
    String(value),
  );
}
