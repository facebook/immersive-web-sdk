/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { JsonObject, JsonValue, SceneNode, Vec2, Vec3 } from './types.js';

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => isFiniteNumber(entry))
  );
}

export function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((entry) => isFiniteNumber(entry))
  );
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((entry) => isJsonValue(entry));
  }

  return false;
}

export function assertJsonObject(
  value: unknown,
  message = 'Expected JSON object',
): asserts value is JsonObject {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    throw new Error(message);
  }
}

export function findNode(
  nodes: SceneNode[],
  nodeId: string,
): SceneNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const child = findNode(node.children ?? [], nodeId);
    if (child != null) {
      return child;
    }
  }

  return undefined;
}

export interface NodeLocation {
  node: SceneNode;
  parent: SceneNode | null;
  siblings: SceneNode[];
  index: number;
}

export function findNodeLocation(
  nodes: SceneNode[],
  nodeId: string,
  parent: SceneNode | null = null,
): NodeLocation | undefined {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index !== -1) {
    return {
      index,
      node: nodes[index],
      parent,
      siblings: nodes,
    };
  }

  for (const node of nodes) {
    const location = findNodeLocation(node.children ?? [], nodeId, node);
    if (location != null) {
      return location;
    }
  }

  return undefined;
}

export function collectNodeIds(nodes: SceneNode[], ids = new Set<string>()) {
  for (const node of nodes) {
    ids.add(node.id);
    collectNodeIds(node.children ?? [], ids);
  }

  return ids;
}
