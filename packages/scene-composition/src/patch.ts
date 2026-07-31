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
  SceneAuthoring,
  SceneAuthoringView,
  SceneComponentValue,
  SceneDocument,
  SceneEnvironment,
  SceneNode,
  SceneNodeConstraints,
  SceneNodeContent,
  SceneNodeFramingRole,
  ScenePatch,
  ScenePrefab,
  SceneTransform,
} from './types.js';
import {
  deepClone,
  findNode,
  findNodeLocation,
  isJsonValue,
  isPlainObject,
} from './utils.js';
import {
  assertValidSceneDocument,
  type SceneDocumentValidationOptions,
} from './validation.js';

export function applyScenePatch(
  document: SceneDocument,
  patch: ScenePatch,
  validationOptions: SceneDocumentValidationOptions = {},
): PatchResult {
  const safePatch = deepClone(patch);
  assertValidScenePatch(safePatch);
  const previousDocument = deepClone(document);
  const nextDocument = applyPatchToClone(deepClone(document), safePatch);
  assertValidSceneDocument(nextDocument, validationOptions);

  return {
    document: nextDocument,
    inverse: { document: previousDocument, op: 'replaceDocument' },
  };
}

function applyPatchToClone(
  document: SceneDocument,
  patch: ScenePatch,
): SceneDocument {
  if (patch.op === 'replaceDocument') {
    return deepClone(patch.document);
  }
  if (patch.op === 'transaction') {
    return patch.patches.reduce<SceneDocument>(
      (current, entry) => applyPatchToClone(current, entry),
      document,
    );
  }
  applyPatchInPlace(document, patch);
  return document;
}

export class SceneCommandHistory {
  private sceneDocument: SceneDocument;
  private past: { patch: ScenePatch; inverse: ScenePatch }[] = [];
  private future: { patch: ScenePatch; inverse: ScenePatch }[] = [];
  private readonly validationOptions: SceneDocumentValidationOptions;

  constructor(
    document: SceneDocument,
    options: {
      validateInitialDocument?: boolean;
      validationOptions?: SceneDocumentValidationOptions;
    } = {},
  ) {
    this.validationOptions = options.validationOptions ?? {};
    if (options.validateInitialDocument !== false) {
      assertValidSceneDocument(document, this.validationOptions);
    }
    this.sceneDocument = deepClone(document);
  }

  get document() {
    return deepClone(this.sceneDocument);
  }

  apply(patch: ScenePatch) {
    const safePatch = deepClone(patch);
    const result = applyScenePatch(
      this.sceneDocument,
      safePatch,
      this.validationOptions,
    );
    this.past.push({ inverse: deepClone(result.inverse), patch: safePatch });
    this.future = [];
    this.sceneDocument = result.document;
    return this.document;
  }

  applyTransaction(patches: ScenePatch[]) {
    return this.apply({ op: 'transaction', patches });
  }

  replace(document: SceneDocument) {
    return this.apply({ document, op: 'replaceDocument' });
  }

  undo() {
    const entry = this.past.pop();
    if (entry == null) {
      return this.document;
    }

    const result = applyScenePatch(
      this.sceneDocument,
      entry.inverse,
      this.validationOptions,
    );
    this.future.push(entry);
    this.sceneDocument = result.document;
    return this.document;
  }

  redo() {
    const entry = this.future.pop();
    if (entry == null) {
      return this.document;
    }

    const result = applyScenePatch(
      this.sceneDocument,
      entry.patch,
      this.validationOptions,
    );
    this.past.push({ inverse: result.inverse, patch: entry.patch });
    this.sceneDocument = result.document;
    return this.document;
  }
}

function applyPatchInPlace(
  document: SceneDocument,
  patch: Exclude<ScenePatch, { op: 'replaceDocument' | 'transaction' }>,
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
    case 'updateFramingRole':
      return updateFramingRole(document, patch.nodeId, patch.framingRole);
    case 'updateComponent':
      return updateComponent(
        document,
        patch.nodeId,
        patch.component,
        patch.value,
      );
    case 'updateRootComponent':
      return updateRootComponent(document, patch.component, patch.value);
    case 'reorderChildren':
      return reorderChildren(document, patch.parentId ?? null, patch.childIds);
    case 'updateContent':
      return updateContent(document, patch.nodeId, patch.content);
    case 'updateConstraints':
      return updateConstraints(document, patch.nodeId, patch.constraints);
    case 'setNodeMetadata':
      return setNodeMetadata(document, patch.nodeId, patch.value);
    case 'setAuthoring':
      return setAuthoring(document, patch.authoring);
    case 'setEnvironment':
      return setEnvironment(document, patch.environment);
    case 'addPrefab':
      return addPrefab(document, patch.prefab, patch.index);
    case 'updatePrefab':
      return updatePrefab(document, patch.prefabId, patch.prefab);
    case 'removePrefab':
      return removePrefab(document, patch.prefabId);
    case 'addAuthoringView':
      return addAuthoringView(document, patch.view, patch.index);
    case 'updateAuthoringView':
      return updateAuthoringView(document, patch.viewId, patch.view);
    case 'removeAuthoringView':
      return removeAuthoringView(document, patch.viewId);
  }
}

function assertValidScenePatch(value: unknown): asserts value is ScenePatch {
  if (!isPlainObject(value)) {
    throw new Error('Scene patch must be an object');
  }

  const op = value.op;
  switch (op) {
    case 'replaceDocument':
      assertPlainObjectField(value.document, 'document');
      return;
    case 'transaction':
      if (!Array.isArray(value.patches)) {
        throw new Error('patches must be an array');
      }
      value.patches.forEach(assertValidScenePatch);
      return;
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
    case 'updateFramingRole':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (
        value.framingRole !== undefined &&
        value.framingRole !== 'content' &&
        value.framingRole !== 'support'
      ) {
        throw new Error('framingRole must be "content" or "support"');
      }
      return;
    case 'updateComponent':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      assertNonEmptyStringField(value.component, 'component');
      if (value.value !== undefined && !isJsonValue(value.value)) {
        throw new Error('value must be JSON serializable');
      }
      return;
    case 'updateRootComponent':
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
    case 'updateContent':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (value.content !== undefined) {
        assertPlainObjectField(value.content, 'content');
      }
      return;
    case 'updateConstraints':
      assertNonEmptyStringField(value.nodeId, 'nodeId');
      if (value.constraints !== undefined) {
        assertPlainObjectField(value.constraints, 'constraints');
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
    case 'setAuthoring':
      if (value.authoring !== undefined) {
        assertPlainObjectField(value.authoring, 'authoring');
      }
      return;
    case 'setEnvironment':
      if (value.environment !== undefined) {
        assertPlainObjectField(value.environment, 'environment');
      }
      return;
    case 'addPrefab':
      assertPlainObjectField(value.prefab, 'prefab');
      assertOptionalIndex(value.index);
      return;
    case 'updatePrefab':
      assertNonEmptyStringField(value.prefabId, 'prefabId');
      assertPlainObjectField(value.prefab, 'prefab');
      return;
    case 'removePrefab':
      assertNonEmptyStringField(value.prefabId, 'prefabId');
      return;
    case 'addAuthoringView':
      assertPlainObjectField(value.view, 'view');
      assertOptionalIndex(value.index);
      return;
    case 'updateAuthoringView':
      assertNonEmptyStringField(value.viewId, 'viewId');
      assertPlainObjectField(value.view, 'view');
      return;
    case 'removeAuthoringView':
      assertNonEmptyStringField(value.viewId, 'viewId');
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
  rewriteNodeReferences(document, nodeId, newNodeId);

  return {
    newNodeId: nodeId,
    nodeId: newNodeId,
    op: 'renameNode',
  };
}

function rewriteNodeReferences(
  document: SceneDocument,
  previousId: string,
  nextId: string,
) {
  const visit = (nodes: SceneNode[]) => {
    for (const entry of nodes) {
      visit(entry.children ?? []);
    }
  };
  visit(document.nodes);

  const composition = document.authoring?.composition;
  composition?.features.forEach((feature) => {
    feature.nodeRefs = replaceIds(feature.nodeRefs, previousId, nextId);
    feature.acceptance.forEach((criterion) => {
      if ('nodeRefs' in criterion && criterion.nodeRefs != null) {
        criterion.nodeRefs = replaceIds(criterion.nodeRefs, previousId, nextId);
      }
      if (criterion.kind === 'count' && criterion.pattern === previousId) {
        criterion.pattern = nextId;
      }
      if (
        criterion.kind === 'spatial-relation' &&
        criterion.target === previousId
      ) {
        criterion.target = nextId;
      }
    });
    const inspection = feature.objectInspection;
    inspection?.parts.forEach((part) => {
      part.nodeRefs = replaceIds(part.nodeRefs, previousId, nextId);
    });
    inspection?.contacts.forEach((contact) => {
      contact.nodeRefs = replaceIds(contact.nodeRefs, previousId, nextId);
      contact.targetNodeRefs = replaceIds(
        contact.targetNodeRefs,
        previousId,
        nextId,
      );
    });
    if (inspection?.context.includeNodeRefs != null) {
      inspection.context.includeNodeRefs = replaceIds(
        inspection.context.includeNodeRefs,
        previousId,
        nextId,
      );
    }
  });
  document.authoring?.nodeAnnotations?.forEach((annotation) => {
    if (annotation.node === previousId) {
      annotation.node = nextId;
    }
  });
}

function replaceIds(ids: string[], previousId: string, nextId: string) {
  return ids.map((id) => (id === previousId ? nextId : id));
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

function updateFramingRole(
  document: SceneDocument,
  nodeId: string,
  framingRole: SceneNodeFramingRole | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous = node.framingRole;
  if (framingRole === undefined) {
    delete node.framingRole;
  } else {
    node.framingRole = framingRole;
  }

  return {
    framingRole: previous,
    nodeId,
    op: 'updateFramingRole',
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

function updateRootComponent(
  document: SceneDocument,
  component: string,
  value: SceneComponentValue | undefined,
): ScenePatch {
  const previous = document.components?.[component];
  document.components ??= {};

  if (value === undefined) {
    delete document.components[component];
  } else {
    document.components[component] = deepClone(value);
  }

  return {
    component,
    op: 'updateRootComponent',
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

function updateContent(
  document: SceneDocument,
  nodeId: string,
  content: SceneNodeContent | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous = node.content;

  if (content == null) {
    delete node.content;
  } else {
    node.content = deepClone(content);
  }

  return {
    content: previous === undefined ? undefined : deepClone(previous),
    nodeId,
    op: 'updateContent',
  };
}

function updateConstraints(
  document: SceneDocument,
  nodeId: string,
  constraints: SceneNodeConstraints | undefined,
): ScenePatch {
  const node = getRequiredNode(document, nodeId);
  const previous = node.constraints;

  if (constraints == null) {
    delete node.constraints;
  } else {
    node.constraints = deepClone(constraints);
  }

  return {
    constraints: previous === undefined ? undefined : deepClone(previous),
    nodeId,
    op: 'updateConstraints',
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

function setAuthoring(
  document: SceneDocument,
  authoring: SceneAuthoring | undefined,
): ScenePatch {
  const previous =
    document.authoring == null ? undefined : deepClone(document.authoring);
  if (authoring == null) {
    delete document.authoring;
  } else {
    document.authoring = deepClone(authoring);
  }
  return { op: 'setAuthoring', authoring: previous };
}

function setEnvironment(
  document: SceneDocument,
  environment: SceneEnvironment | undefined,
): ScenePatch {
  const previous =
    document.environment == null ? undefined : deepClone(document.environment);
  if (environment == null) {
    delete document.environment;
  } else {
    document.environment = deepClone(environment);
  }
  return { op: 'setEnvironment', environment: previous };
}

function addPrefab(
  document: SceneDocument,
  prefab: ScenePrefab,
  index?: number,
): ScenePatch {
  const prefabs = (document.resources.prefabs ??= []);
  insertAt(prefabs, deepClone(prefab), index);
  return { op: 'removePrefab', prefabId: prefab.id };
}

function updatePrefab(
  document: SceneDocument,
  prefabId: string,
  prefab: ScenePrefab,
): ScenePatch {
  if (prefab.id !== prefabId) {
    throw new Error('updatePrefab cannot rename a resource id');
  }
  const prefabs = document.resources.prefabs ?? [];
  const index = findResourceIndex(prefabs, prefabId, 'prefab');
  const previous = prefabs[index];
  prefabs[index] = deepClone(prefab);
  return { op: 'updatePrefab', prefabId, prefab: previous };
}

function removePrefab(document: SceneDocument, prefabId: string): ScenePatch {
  const prefabs = document.resources.prefabs ?? [];
  const index = findResourceIndex(prefabs, prefabId, 'prefab');
  const [prefab] = prefabs.splice(index, 1);
  return { op: 'addPrefab', prefab, index };
}

function addAuthoringView(
  document: SceneDocument,
  view: SceneAuthoringView,
  index?: number,
): ScenePatch {
  document.authoring ??= {};
  const views = (document.authoring.views ??= []);
  insertAt(views, deepClone(view), index);
  return { op: 'removeAuthoringView', viewId: view.id };
}

function updateAuthoringView(
  document: SceneDocument,
  viewId: string,
  view: SceneAuthoringView,
): ScenePatch {
  if (view.id !== viewId) {
    throw new Error('updateAuthoringView cannot rename a view id');
  }
  const views = document.authoring?.views ?? [];
  const index = findResourceIndex(views, viewId, 'authoring view');
  const previous = views[index];
  views[index] = deepClone(view);
  return { op: 'updateAuthoringView', viewId, view: previous };
}

function removeAuthoringView(
  document: SceneDocument,
  viewId: string,
): ScenePatch {
  const views = document.authoring?.views ?? [];
  const index = findResourceIndex(views, viewId, 'authoring view');
  const [view] = views.splice(index, 1);
  return { op: 'addAuthoringView', view, index };
}

function insertAt<T>(entries: T[], value: T, index?: number) {
  entries.splice(Math.min(index ?? entries.length, entries.length), 0, value);
}

function findResourceIndex(
  entries: Array<{ id: string }>,
  id: string,
  kind: string,
) {
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`Unknown ${kind} "${id}"`);
  }
  return index;
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
