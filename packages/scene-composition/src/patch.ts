/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { resolveReparentTransform } from './helpers.js';
import type {
  JsonObject,
  PatchResult,
  SceneComponentValue,
  SceneDocument,
  SceneNode,
  ScenePatch,
  SceneTransform,
} from './types.js';
import {
  deepClone,
  findNode,
  findNodeLocation,
  isJsonValue,
  isPlainObject,
} from './utils.js';
import { assertValidSceneDocument } from './validation.js';

export function applyScenePatch(
  document: SceneDocument,
  patch: ScenePatch,
): PatchResult {
  assertValidScenePatch(patch);

  const nextDocument = deepClone(document);
  const inverse = applyPatchInPlace(nextDocument, patch);
  assertValidSceneDocument(nextDocument);

  return {
    document: nextDocument,
    inverse,
  };
}

export class SceneCommandHistory {
  private sceneDocument: SceneDocument;
  private past: { patch: ScenePatch; inverse: ScenePatch }[] = [];
  private future: { patch: ScenePatch; inverse: ScenePatch }[] = [];

  constructor(
    document: SceneDocument,
    options: { validateInitialDocument?: boolean } = {},
  ) {
    if (options.validateInitialDocument !== false) {
      assertValidSceneDocument(document);
    }
    this.sceneDocument = deepClone(document);
  }

  get document() {
    return deepClone(this.sceneDocument);
  }

  apply(patch: ScenePatch) {
    const result = applyScenePatch(this.sceneDocument, patch);
    this.past.push({ inverse: result.inverse, patch });
    this.future = [];
    this.sceneDocument = result.document;
    return this.document;
  }

  undo() {
    const entry = this.past.pop();
    if (entry == null) {
      return this.document;
    }

    const result = applyScenePatch(this.sceneDocument, entry.inverse);
    this.future.push(entry);
    this.sceneDocument = result.document;
    return this.document;
  }

  redo() {
    const entry = this.future.pop();
    if (entry == null) {
      return this.document;
    }

    const result = applyScenePatch(this.sceneDocument, entry.patch);
    this.past.push({ inverse: result.inverse, patch: entry.patch });
    this.sceneDocument = result.document;
    return this.document;
  }
}

function applyPatchInPlace(
  document: SceneDocument,
  patch: ScenePatch,
): ScenePatch {
  switch (patch.op) {
    case 'addNode':
      return addNode(document, patch.node, patch.parentId ?? null, patch.index);
    case 'removeNode':
      return removeNode(document, patch.nodeId);
    case 'moveNode':
      return moveNode(
        document,
        patch.nodeId,
        patch.parentId ?? null,
        patch.index,
        patch.preserveWorldTransform === true,
      );
    case 'renameNode':
      return renameNode(document, patch.nodeId, patch.newNodeId);
    case 'updateTransform':
      return updateTransform(document, patch.nodeId, patch.transform);
    case 'updateComponent':
      return updateComponent(
        document,
        patch.nodeId,
        patch.component,
        patch.value,
      );
    case 'reorderChildren':
      return reorderChildren(document, patch.parentId ?? null, patch.childIds);
    case 'updateAssetRef':
      return updateAssetRef(document, patch.nodeId, patch.asset);
    case 'setEditorMetadata':
      return setEditorMetadata(document, patch.value, patch.nodeId);
    case 'setNodeMetadata':
      return setNodeMetadata(document, patch.nodeId, patch.value);
  }
}

function assertValidScenePatch(value: unknown): asserts value is ScenePatch {
  if (!isPlainObject(value)) {
    throw new Error('Scene patch must be an object');
  }

  const op = value.op;
  switch (op) {
    case 'addNode':
      assertPlainObjectField(value.node, 'node');
      assertOptionalParentId(value.parentId);
      assertOptionalIndex(value.index);
      return;
    case 'removeNode':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      return;
    case 'moveNode':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      assertOptionalParentId(value.parentId);
      assertOptionalIndex(value.index);
      assertOptionalBoolean(
        value.preserveWorldTransform,
        'preserveWorldTransform',
      );
      return;
    case 'renameNode':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      assertNonEmptyStringField(value.newNodeId, 'newNodeId');
      return;
    case 'updateTransform':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (value.transform !== undefined) {
        assertPlainObjectField(value.transform, 'transform');
      }
      return;
    case 'updateComponent':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      assertNonEmptyStringField(value.component, 'component');
      if (value.value !== undefined && !isJsonValue(value.value)) {
        throw new Error('value must be JSON serializable');
      }
      return;
    case 'reorderChildren':
      if (
        !Array.isArray(value.childIds) ||
        !value.childIds.every((childId) => typeof childId === 'string')
      ) {
        throw new Error('childIds must be an array of strings');
      }
      assertOptionalParentId(value.parentId);
      return;
    case 'updateAssetRef':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (value.asset !== undefined) {
        assertNonEmptyStringField(value.asset, 'asset');
      }
      return;
    case 'setEditorMetadata':
      if (
        value.value !== undefined &&
        (!isPlainObject(value.value) || !isJsonValue(value.value))
      ) {
        throw new Error('value must be a JSON object');
      }
      if (value.nodeId !== undefined) {
        assertNonEmptyStringField(value.nodeId, 'nodeId');
      }
      return;
    case 'setNodeMetadata':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (
        value.value !== undefined &&
        (!isPlainObject(value.value) || !isJsonValue(value.value))
      ) {
        throw new Error('value must be a JSON object');
      }
      return;
    default:
      throw new Error(`Unsupported scene patch op "${String(op)}"`);
  }
}

function assertPlainObjectField(value: unknown, fieldName: string) {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertNonEmptyStringField(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalParentId(value: unknown) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error('parentId must be a string or null');
  }
}

function assertOptionalIndex(value: unknown) {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || (value as number) < 0)
  ) {
    throw new Error('index must be a non-negative integer');
  }
}

function assertOptionalBoolean(value: unknown, fieldName: string) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

function addNode(
  document: SceneDocument,
  node: SceneNode,
  parentId: string | null,
  index?: number,
): ScenePatch {
  if (findNode(document.nodes, node.id) != null) {
    throw new Error(`Cannot add duplicate node "${node.id}"`);
  }

  const siblings = getSiblings(document, parentId, { create: true });
  const insertionIndex = index ?? siblings.length;
  siblings.splice(insertionIndex, 0, deepClone(node));

  return {
    nodeId: node.id,
    op: 'removeNode',
  };
}

function removeNode(document: SceneDocument, nodeId: string): ScenePatch {
  const location = findNodeLocation(document.nodes, nodeId);
  if (location == null) {
    throw new Error(`Cannot remove unknown node "${nodeId}"`);
  }

  const [removed] = location.siblings.splice(location.index, 1);
  return {
    index: location.index,
    node: removed,
    op: 'addNode',
    parentId: location.parent?.id ?? null,
  };
}

function moveNode(
  document: SceneDocument,
  nodeId: string,
  parentId: string | null,
  index?: number,
  preserveWorldTransform = false,
): ScenePatch {
  if (parentId === nodeId) {
    throw new Error(`Cannot move node "${nodeId}" under itself`);
  }

  const source = findNodeLocation(document.nodes, nodeId);
  if (source == null) {
    throw new Error(`Cannot move unknown node "${nodeId}"`);
  }

  if (
    parentId != null &&
    findNode(source.node.children ?? [], parentId) != null
  ) {
    throw new Error(
      `Cannot move node "${nodeId}" under its descendant "${parentId}"`,
    );
  }

  if (parentId != null && findNode(document.nodes, parentId) == null) {
    throw new Error(`Unknown parent node "${parentId}"`);
  }

  const preservedTransform = preserveWorldTransform
    ? resolveReparentTransform(document, nodeId, parentId)
    : undefined;
  const previousParentId = source.parent?.id ?? null;
  const previousIndex = source.index;
  const [node] = source.siblings.splice(source.index, 1);
  if (preservedTransform != null) {
    if (isMeaningfulTransform(preservedTransform)) {
      node.transform = preservedTransform;
    } else {
      delete node.transform;
    }
  }
  if (source.parent != null && source.siblings.length === 0) {
    delete source.parent.children;
  }
  const destination = getSiblings(document, parentId, { create: true });
  const insertionIndex = Math.min(
    index ?? destination.length,
    destination.length,
  );
  destination.splice(insertionIndex, 0, node);

  return {
    index: previousIndex,
    nodeId,
    op: 'moveNode',
    parentId: previousParentId,
    preserveWorldTransform,
  };
}

function renameNode(
  document: SceneDocument,
  nodeId: string,
  newNodeId: string,
): ScenePatch {
  if (nodeId === newNodeId) {
    return {
      newNodeId: nodeId,
      nodeId,
      op: 'renameNode',
    };
  }

  const node = getRequiredNode(document, nodeId);
  if (findNode(document.nodes, newNodeId) != null) {
    throw new Error(
      `Cannot rename node "${nodeId}" to duplicate id "${newNodeId}"`,
    );
  }

  node.id = newNodeId;

  return {
    newNodeId: nodeId,
    nodeId: newNodeId,
    op: 'renameNode',
  };
}

function updateTransform(
  document: SceneDocument,
  nodeId: string,
  transform: SceneTransform | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous =
    node.transform == null ? undefined : deepClone(node.transform);
  if (transform == null) {
    delete node.transform;
  } else {
    node.transform = deepClone(transform);
  }

  return {
    nodeId,
    op: 'updateTransform',
    transform: previous,
  };
}

function updateComponent(
  document: SceneDocument,
  nodeId: string,
  component: string,
  value: SceneComponentValue | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous = node.components?.[component];

  if (value === undefined) {
    if (node.components != null) {
      delete node.components[component];
      if (Object.keys(node.components).length === 0) {
        delete node.components;
      }
    }
  } else {
    node.components = node.components ?? {};
    node.components[component] = deepClone(value);
  }

  return {
    component,
    nodeId,
    op: 'updateComponent',
    value: previous === undefined ? undefined : deepClone(previous),
  };
}

function reorderChildren(
  document: SceneDocument,
  parentId: string | null,
  childIds: string[],
): ScenePatch {
  const siblings = getSiblings(document, parentId, { create: false });
  const previousIds = siblings.map((node) => node.id);

  if (previousIds.length !== childIds.length) {
    throw new Error('reorderChildren must include every child id exactly once');
  }

  const byId = new Map(siblings.map((node) => [node.id, node]));
  const nextSiblings = childIds.map((id) => {
    const node = byId.get(id);
    if (node == null) {
      throw new Error(`Cannot reorder unknown child "${id}"`);
    }
    return node;
  });

  siblings.splice(0, siblings.length, ...nextSiblings);

  return {
    childIds: previousIds,
    op: 'reorderChildren',
    parentId,
  };
}

function updateAssetRef(
  document: SceneDocument,
  nodeId: string,
  asset: string | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous = node.asset;

  if (asset == null) {
    delete node.asset;
  } else {
    node.asset = asset;
  }

  return {
    asset: previous,
    nodeId,
    op: 'updateAssetRef',
  };
}

function setEditorMetadata(
  document: SceneDocument,
  value: JsonObject | undefined,
  nodeId?: string,
): ScenePatch {
  if (nodeId == null) {
    const previous =
      document.editor === undefined ? undefined : deepClone(document.editor);
    if (value === undefined) {
      delete document.editor;
    } else {
      document.editor = deepClone(value);
    }
    return {
      op: 'setEditorMetadata',
      ...(previous === undefined ? {} : { value: previous }),
    };
  }

  const node = getRequiredNode(document, nodeId);
  const previous =
    node.editor === undefined ? undefined : deepClone(node.editor);
  if (value === undefined) {
    delete node.editor;
  } else {
    node.editor = deepClone(value);
  }

  return {
    nodeId,
    op: 'setEditorMetadata',
    ...(previous === undefined ? {} : { value: previous }),
  };
}

function setNodeMetadata(
  document: SceneDocument,
  nodeId: string,
  value: JsonObject | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous =
    node.metadata === undefined ? undefined : deepClone(node.metadata);
  if (value === undefined) {
    delete node.metadata;
  } else {
    node.metadata = deepClone(value);
  }

  return {
    nodeId,
    op: 'setNodeMetadata',
    ...(previous === undefined ? {} : { value: previous }),
  };
}

function getRequiredNode(document: SceneDocument, nodeId: string) {
  const node = findNode(document.nodes, nodeId);
  if (node == null) {
    throw new Error(`Unknown node "${nodeId}"`);
  }

  return node;
}

function getSiblings(
  document: SceneDocument,
  parentId: string | null,
  options: { create: boolean },
) {
  if (parentId == null) {
    return document.nodes;
  }

  const parent = getRequiredNode(document, parentId);
  if (parent.children == null) {
    if (!options.create) {
      return [];
    }
    parent.children = [];
  }
  return parent.children;
}

function isMeaningfulTransform(transform: SceneTransform): boolean {
  if (
    transform.position != null &&
    transform.position.some((value) => value !== 0)
  ) {
    return true;
  }
  if (
    transform.rotationDeg != null &&
    transform.rotationDeg.some((value) => value !== 0)
  ) {
    return true;
  }
  if (transform.scale != null) {
    const scale =
      typeof transform.scale === 'number'
        ? [transform.scale, transform.scale, transform.scale]
        : transform.scale;
    if (scale.some((value) => value !== 1)) {
      return true;
    }
  }
  return Object.keys(transform).some(
    (key) => !['position', 'rotationDeg', 'scale'].includes(key),
  );
}
