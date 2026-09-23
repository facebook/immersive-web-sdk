/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component } from '@pmndrs/uikit';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import type { Object3D } from '../runtime/index.js';
import { UIKitDocument } from '../ui/document.js';
import { PanelDocument } from '../ui/panel-components.js';
import { UIKitMLAsset } from '../ui/uikitml-asset.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;
const MAX_PROPERTY_COUNT = 20;
const MAX_PROPERTY_NAME_LENGTH = 64;
const MAX_SELECTOR_LENGTH = 512;
const MAX_SELECTOR_PARTS = 16;
const MAX_TRAVERSED_OBJECTS = 10_000;
const MAX_STRING_LENGTH = 200;
const MAX_SERIALIZED_DEPTH = 3;
const MAX_COLLECTION_ITEMS = 20;
const PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;

const DEFAULT_PROPERTIES = [
  'text',
  'value',
  'disabled',
  'checked',
  'selected',
  'display',
  'visibility',
  'pointerEvents',
] as const;

export interface UiInspectParams {
  entityIndex: number;
  selector?: string;
  properties?: string[];
  limit?: number;
}

export interface UiElementInspection {
  id?: string;
  classes: string[];
  componentType: string;
  uuid: string;
  text?: string;
  state: {
    active: boolean;
    clipped: boolean;
    disabled: boolean;
    displayed: boolean;
    hovered: boolean;
    visible: boolean;
  };
  layout: {
    relativeCenter: [number, number] | null;
    size: [number, number] | null;
  };
  properties: Record<string, unknown>;
  missingProperties?: string[];
}

export interface UiInspectResult {
  panel: {
    entityIndex: number;
    name?: string;
    assetId?: string;
    computedSize: { width: number; height: number } | null;
    targetSize: { width: number; height: number };
  };
  selector?: string;
  elements: UiElementInspection[];
  total: number;
  limited: boolean;
}

interface SelectorPart {
  kind: 'class' | 'id';
  value: string;
}

/** Inspect stable, live UIKitML elements owned by one ECS panel entity. */
export function uiInspect(
  world: World,
  params: Record<string, unknown>,
): UiInspectResult {
  const { entityIndex, selector, properties, limit } =
    params as unknown as Partial<UiInspectParams>;

  if (!Number.isInteger(entityIndex) || (entityIndex as number) < 0) {
    throw new Error(
      'entityIndex must be a non-negative integer. Use ecs_find_entities to discover the panel entity.',
    );
  }

  const normalizedSelector = normalizeSelector(selector);
  const requestedProperties = normalizeProperties(properties);
  const normalizedLimit = normalizeLimit(limit);

  const entity = world.entityManager.getEntityByIndex(entityIndex as number);
  if (!entity || !entity.active) {
    throw new Error(
      `Entity ${entityIndex} not found or has been destroyed. Use ecs_find_entities to find active panel entities.`,
    );
  }

  const document = findEntityUIKitDocument(entity);
  if (!document) {
    throw new Error(
      `Entity ${entityIndex} does not own a live UIKitML document. Choose an entity whose Object3D contains a UIKitMLAsset or PanelUI document.`,
    );
  }

  const candidates = findLiveCandidates(document, normalizedSelector?.parts);
  const elements = candidates
    .slice(0, normalizedLimit)
    .map((component) =>
      inspectElement(component, requestedProperties, properties !== undefined),
    );
  const asset = findUIKitMLAsset(entity.object3D, entity.index);

  return {
    panel: {
      entityIndex: entity.index,
      name: entity.object3D?.name || undefined,
      assetId: asset?.assetId,
      computedSize: document.computedSize,
      targetSize: document.targetSize,
    },
    selector: normalizedSelector?.value,
    elements,
    total: candidates.length,
    limited: candidates.length > normalizedLimit,
  };
}

function normalizeSelector(
  value: unknown,
): { value: string; parts: SelectorPart[] } | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error('selector must be a string');
  }
  const selector = value.trim();
  if (selector.length === 0) {
    throw new Error('selector must not be empty');
  }
  if (selector.length > MAX_SELECTOR_LENGTH) {
    throw new Error(
      `selector allows at most ${MAX_SELECTOR_LENGTH} characters`,
    );
  }
  const parts = selector.split(/\s+/u);
  if (parts.length > MAX_SELECTOR_PARTS) {
    throw new Error(
      `selector allows at most ${MAX_SELECTOR_PARTS} descendant parts`,
    );
  }
  if (parts.some((part) => !/^[#.][A-Za-z0-9_-]+$/u.test(part))) {
    throw new Error(
      'selector supports only #id, .class, and descendant combinations of those selectors',
    );
  }
  return {
    value: selector,
    parts: parts.map((part) => ({
      kind: part[0] === '#' ? 'id' : 'class',
      value: part.slice(1),
    })),
  };
}

/**
 * Traverse the current UIKit tree once and match descendant selectors without
 * materializing overlapping subtree results. The object cap bounds both the
 * unfiltered inventory and selector work on an unexpectedly large document.
 */
function findLiveCandidates(
  document: UIKitDocument,
  selectorParts?: SelectorPart[],
): Component<any>[] {
  const candidates: Component<any>[] = [];
  const emptyPrefixes = selectorParts?.map(() => false) ?? [];
  const stack: Array<{
    object: Object3D;
    matchedPrefixes: readonly boolean[];
  }> = [{ object: document.rootElement, matchedPrefixes: emptyPrefixes }];
  let scheduledObjects = 1;

  while (stack.length > 0) {
    const { object, matchedPrefixes } = stack.pop()!;
    let childPrefixes = matchedPrefixes;

    if (object instanceof Component) {
      if (selectorParts == null) {
        if (getElementId(object) != null) {
          candidates.push(object);
        }
      } else {
        const id = getElementId(object);
        const classes = new Set(getClassNames(object));
        const nextPrefixes = [...matchedPrefixes];
        let matchesFullSelector = false;

        for (let index = 0; index < selectorParts.length; index += 1) {
          const part = selectorParts[index];
          const matchesPart =
            part.kind === 'id' ? id === part.value : classes.has(part.value);
          const completesPrefix =
            matchesPart && (index === 0 || matchedPrefixes[index - 1]);
          nextPrefixes[index] ||= completesPrefix;
          if (index === selectorParts.length - 1) {
            matchesFullSelector = completesPrefix;
          }
        }

        if (matchesFullSelector) {
          candidates.push(object);
        }
        childPrefixes = nextPrefixes;
      }
    }

    for (let index = object.children.length - 1; index >= 0; index -= 1) {
      scheduledObjects += 1;
      if (scheduledObjects > MAX_TRAVERSED_OBJECTS) {
        throw new Error(
          `UIKitML inspection allows at most ${MAX_TRAVERSED_OBJECTS} objects per document`,
        );
      }
      stack.push({
        object: object.children[index],
        matchedPrefixes: childPrefixes,
      });
    }
  }

  return candidates;
}

function normalizeProperties(value: unknown): string[] {
  if (value == null) {
    return [...DEFAULT_PROPERTIES];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('properties must be a non-empty string array');
  }
  if (value.length > MAX_PROPERTY_COUNT) {
    throw new Error(`properties allows at most ${MAX_PROPERTY_COUNT} items`);
  }
  const result: string[] = [];
  for (const property of value) {
    if (
      typeof property !== 'string' ||
      property.length > MAX_PROPERTY_NAME_LENGTH ||
      !PROPERTY_NAME_PATTERN.test(property)
    ) {
      throw new Error(
        `each property must be a camelCase name of at most ${MAX_PROPERTY_NAME_LENGTH} characters`,
      );
    }
    if (!result.includes(property)) {
      result.push(property);
    }
  }
  return result;
}

function normalizeLimit(value: unknown): number {
  if (value == null) {
    return DEFAULT_LIMIT;
  }
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_LIMIT
  ) {
    throw new Error(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return value as number;
}

function inspectElement(
  component: Component<any>,
  requestedProperties: string[],
  includeMissingProperties: boolean,
): UiElementInspection {
  const properties: Record<string, unknown> = {};
  const missingProperties: string[] = [];
  for (const property of requestedProperties) {
    const inspected = readComputedProperty(component, property);
    if (!inspected.found) {
      missingProperties.push(property);
      continue;
    }
    properties[property] = serializeValue(inspected.value);
  }

  const id = getElementId(component);
  const text = collectText(component);
  const clipped = component.isClipped?.value === true;
  const disabled = readComputedProperty(component, 'disabled');
  const displayed = component.displayed?.value !== false;
  const semanticVisible = component.isVisible?.value !== false;

  return {
    id: typeof id === 'string' && id.length > 0 ? id : undefined,
    classes: getClassNames(component),
    componentType:
      component.constructor.name || component.type || 'UIKitComponent',
    uuid: component.uuid,
    text: text.length > 0 ? text : undefined,
    state: {
      active: (component.activeList?.value?.length ?? 0) > 0,
      clipped,
      disabled: disabled.found && disabled.value === true,
      displayed,
      hovered: (component.hoveredList?.value?.length ?? 0) > 0,
      visible:
        isObjectHierarchyVisible(component) &&
        semanticVisible &&
        displayed &&
        !clipped,
    },
    layout: {
      relativeCenter: numberPair(component.relativeCenter?.value),
      size: numberPair(component.size?.value),
    },
    properties,
    ...(includeMissingProperties && missingProperties.length > 0
      ? { missingProperties }
      : {}),
  };
}

function readComputedProperty(
  component: Component<any>,
  property: string,
): { found: true; value: unknown } | { found: false } {
  if (Object.prototype.hasOwnProperty.call(Object.prototype, property)) {
    return { found: false };
  }
  const value = (
    component.properties?.peek() as Record<string, unknown> | undefined
  )?.[property];
  if (value !== undefined) {
    return { found: true, value };
  }

  return { found: false };
}

function collectText(component: Component<any>): string {
  const values: string[] = [];
  const seen = new Set<string>();
  const stack: Object3D[] = [component];
  let collectedLength = 0;
  let traversedObjects = 0;

  while (
    stack.length > 0 &&
    collectedLength < MAX_STRING_LENGTH &&
    traversedObjects < MAX_TRAVERSED_OBJECTS
  ) {
    const object = stack.pop()!;
    traversedObjects += 1;
    if (object instanceof Component) {
      const text = (
        object.properties?.peek() as Record<string, unknown> | undefined
      )?.text;
      if (typeof text === 'string') {
        const normalized = text.replace(/\s+/gu, ' ').trim();
        if (normalized.length > 0 && !seen.has(normalized)) {
          seen.add(normalized);
          values.push(normalized);
          collectedLength += normalized.length + (values.length > 1 ? 1 : 0);
        }
      }
    }

    for (let index = object.children.length - 1; index >= 0; index -= 1) {
      stack.push(object.children[index]);
    }
  }

  return values.join(' ').slice(0, MAX_STRING_LENGTH);
}

function getElementId(component: Component<any>): string | undefined {
  const id = (
    component.properties?.peek() as Record<string, unknown> | undefined
  )?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function isObjectHierarchyVisible(component: Component<any>): boolean {
  // UIKit uses Object3D.visible internally to suppress renderless layout
  // components. isVisible/displayed carry UIKit semantics; only inspect the
  // document and ordinary Three.js ancestors here.
  let object: Object3D | null = component.parent;
  while (object != null) {
    if (!(object instanceof Component) && object.visible === false) {
      return false;
    }
    object = object.parent;
  }
  return true;
}

function getClassNames(component: Component<any>): string[] {
  const list = (component.classList as unknown as { list?: unknown[] }).list;
  return Array.isArray(list)
    ? list.filter(
        (entry): entry is string =>
          typeof entry === 'string' && !entry.startsWith('__id__'),
      )
    : [];
}

function numberPair(value: unknown): [number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    return null;
  }
  return [value[0], value[1]];
}

function findEntityUIKitDocument(entity: Entity): UIKitDocument | null {
  const hasPanelDocument = entity
    .getComponents()
    .some(
      (component) =>
        component === PanelDocument || component.id === PanelDocument.id,
    );
  if (hasPanelDocument) {
    const componentDocument = entity.getValue(
      PanelDocument,
      'document',
    ) as UIKitDocument | null;
    if (
      componentDocument instanceof UIKitDocument &&
      !componentDocument.disposed
    ) {
      return componentDocument;
    }
  }

  return findOwnedObject(entity.object3D, entity.index, (object) => {
    if (object instanceof UIKitDocument) {
      return object.disposed ? null : object;
    }
    if (object instanceof UIKitMLAsset) {
      return object.document.disposed ? null : object.document;
    }
    return null;
  });
}

function findUIKitMLAsset(
  object: Object3D | null | undefined,
  entityIndex: number,
): UIKitMLAsset | null {
  return findOwnedObject(object, entityIndex, (candidate) =>
    candidate instanceof UIKitMLAsset ? candidate : null,
  );
}

function findOwnedObject<T>(
  root: Object3D | null | undefined,
  entityIndex: number,
  match: (object: Object3D) => T | null,
): T | null {
  if (!root) {
    return null;
  }
  const stack = [root];
  while (stack.length > 0) {
    const object = stack.pop()!;
    if (
      object !== root &&
      typeof object.entityIdx === 'number' &&
      object.entityIdx !== entityIndex
    ) {
      continue;
    }
    const result = match(object);
    if (result != null) {
      return result;
    }
    for (let index = object.children.length - 1; index >= 0; index -= 1) {
      stack.push(object.children[index]);
    }
  }
  return null;
}

function serializeValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return typeof value === 'string' && value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...`
      : value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'function') {
    return '<function>';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if ((value as { isObject3D?: boolean }).isObject3D) {
    const object = value as { name?: string; type?: string };
    return `<Object3D:${object.name || object.type || 'unnamed'}>`;
  }
  if (seen.has(value)) {
    return '<circular>';
  }
  if (depth >= MAX_SERIALIZED_DEPTH) {
    return '<object>';
  }
  seen.add(value);
  if (ArrayBuffer.isView(value) && 'length' in value) {
    const array = value as unknown as ArrayLike<number>;
    const values = Array.from(
      { length: Math.min(array.length, MAX_COLLECTION_ITEMS) },
      (_, index) => array[index],
    );
    const result =
      array.length > MAX_COLLECTION_ITEMS
        ? { values, truncated: true, totalLength: array.length }
        : values;
    seen.delete(value);
    return result;
  }
  if (Array.isArray(value)) {
    const values = value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((entry) => serializeValue(entry, depth + 1, seen));
    const result =
      value.length > MAX_COLLECTION_ITEMS
        ? { values, truncated: true, totalLength: value.length }
        : values;
    seen.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  const keys = Object.keys(value);
  for (const key of keys.slice(0, MAX_COLLECTION_ITEMS)) {
    result[key] = serializeValue(
      (value as Record<string, unknown>)[key],
      depth + 1,
      seen,
    );
  }
  if (keys.length > MAX_COLLECTION_ITEMS) {
    result['...'] = `${keys.length - MAX_COLLECTION_ITEMS} more keys`;
  }
  seen.delete(value);
  return result;
}
