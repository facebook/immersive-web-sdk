/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  deriveSceneInstanceNodeId,
  deriveScenePatternInstanceNamespace,
  deriveScenePatternNodeId,
  generateScenePatternTransforms,
  getSceneNodeCollisionRadius,
  MAX_SCENE_PATTERN_INSTANCES,
  resolveSceneAuthoringTransforms,
  resolveScenePrefabRoot,
  SceneAssetBoundsResolver,
  SceneAssetContent,
  type SceneDocument,
  SceneNode,
  SceneNodeFramingRole,
  ScenePrefabNodeOverride,
  SceneScale,
  SceneTransform,
  Sha256,
  Vec3,
} from '@iwsdk/scene-composition';
import {
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from '../runtime/index.js';
import { disposeScenePrimitiveObject } from './level-scene-primitive.js';

export {
  deriveSceneInstanceNodeId,
  deriveScenePatternNodeId,
  generateScenePatternTransforms,
  MAX_SCENE_PATTERN_INSTANCES,
} from '@iwsdk/scene-composition';

export type SceneAssetLoader = (assetId: string) => Promise<Object3D>;

export interface SceneObjectLoweringOptions {
  loadAsset?: SceneAssetLoader;
  resolveAssetBounds?: SceneAssetBoundsResolver;
  maxPatternInstances?: number;
  runtimeHash?: Sha256;
  useInstancing?: boolean;
}

export interface SceneLoweredVirtualNode {
  id: string;
  instanceIndex: number;
  node: SceneNode;
  object: InstancedMesh;
  parentNodeId: string;
  sourceNodeId: string;
}

export interface SceneLoweredNode {
  children: SceneLoweredNode[];
  id: string;
  node: SceneNode;
  object: Object3D;
  parentNodeId?: string;
  sourceNodeId: string;
  virtualNodes: SceneLoweredVirtualNode[];
}

interface LoweringContext {
  createdObjects: Set<Object3D>;
  document: SceneDocument;
  expandedNodeCount: number;
  loadAsset?: SceneAssetLoader;
  maxPatternInstances: number;
  resolveAssetBounds?: SceneAssetBoundsResolver;
  runtimeHash?: Sha256;
  useInstancing: boolean;
}

interface LowerNodeOptions {
  derived: boolean;
  framingRole?: SceneNodeFramingRole;
  namespace?: string;
  overrides?: Record<string, ScenePrefabNodeOverride>;
  overridesApplied?: boolean;
  parentNodeId?: string;
  prefixMatrix?: Matrix4;
  prefabStack: string[];
}

/** Lower one authored node, including prefab and pattern content, to Object3D. */
export async function lowerSceneNodeObject(
  document: SceneDocument,
  node: SceneNode,
  options: SceneObjectLoweringOptions = {},
): Promise<SceneLoweredNode> {
  const resolvedDocument = resolveSceneDocumentForLowering(document);
  const resolvedNode =
    findSceneNode(resolvedDocument.nodes, node.id) ??
    resolveSceneNodeConstraints(document, node);
  const context = createLoweringContext(resolvedDocument, options);
  try {
    const lowered = await lowerNode(context, resolvedNode, {
      derived: false,
      prefabStack: [],
    });
    return lowered;
  } catch (error) {
    disposeSceneObjectResources(...context.createdObjects);
    throw error;
  }
}

/** Lower all top-level nodes while sharing one deterministic expansion budget. */
export async function lowerSceneDocumentObjects(
  document: SceneDocument,
  options: SceneObjectLoweringOptions = {},
): Promise<SceneLoweredNode[]> {
  const resolvedDocument = resolveSceneDocumentForLowering(document);
  const context = createLoweringContext(resolvedDocument, options);
  const roots: SceneLoweredNode[] = [];
  try {
    for (const node of resolvedDocument.nodes) {
      roots.push(
        await lowerNode(context, node, { derived: false, prefabStack: [] }),
      );
    }
    return roots;
  } catch (error) {
    disposeSceneObjectResources(...context.createdObjects);
    throw error;
  }
}

/** Resolve document-scoped constraints exactly as the shared object lowerer does. */
export function resolveSceneDocumentForLowering(
  document: SceneDocument,
): SceneDocument {
  return resolveSceneAuthoringTransforms(document);
}

/** Create only a node's direct render content, without its transform or children. */
export async function createSceneContentObject(
  document: SceneDocument,
  node: SceneNode,
  options: SceneObjectLoweringOptions = {},
): Promise<Object3D> {
  const context = createLoweringContext(document, options);
  try {
    const object = await createDirectContentObject(context, node);
    return object;
  } catch (error) {
    throw error;
  }
}

/** Apply a scene transform to an Object3D using Three.js' XYZ Euler convention. */
export function applySceneTransform(
  object: Object3D,
  transform: SceneTransform | undefined,
): void {
  if (transform?.position != null) {
    object.position.set(...transform.position);
  }
  if (transform?.rotationDeg != null) {
    object.rotation.set(
      degreesToRadians(transform.rotationDeg[0]),
      degreesToRadians(transform.rotationDeg[1]),
      degreesToRadians(transform.rotationDeg[2]),
    );
  }
  if (transform?.scale != null) {
    object.scale.set(...scaleToVec3(transform.scale));
  }
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

/** Release lowering-owned instance state without disposing shared asset resources. */
export function disposeSceneObjectResources(...roots: Object3D[]): void {
  for (const root of roots) {
    root.traverse((object) => {
      if (object instanceof InstancedMesh) {
        object.dispose();
      }
      disposeScenePrimitiveObject(object);
    });
  }
}

/** Dispose all resources owned by one or more returned lowering trees. */
export function disposeLoweredSceneNodes(...nodes: SceneLoweredNode[]): void {
  disposeSceneObjectResources(...nodes.map((node) => node.object));
}

function createLoweringContext(
  document: SceneDocument,
  options: SceneObjectLoweringOptions,
): LoweringContext {
  return {
    createdObjects: new Set(),
    document,
    expandedNodeCount: 0,
    loadAsset: options.loadAsset,
    maxPatternInstances:
      options.maxPatternInstances ?? MAX_SCENE_PATTERN_INSTANCES,
    resolveAssetBounds: options.resolveAssetBounds,
    runtimeHash: options.runtimeHash,
    useInstancing: options.useInstancing ?? true,
  };
}

async function lowerNode(
  context: LoweringContext,
  sourceNode: SceneNode,
  options: LowerNodeOptions,
): Promise<SceneLoweredNode> {
  if (options.derived) {
    claimExpandedNodes(context, 1);
  }
  const id =
    options.namespace == null
      ? sourceNode.id
      : deriveSceneInstanceNodeId(options.namespace, sourceNode.id);
  const override = options.overrides?.[sourceNode.id];
  const node = options.overridesApplied
    ? applyDerivedNodeId(sourceNode, id)
    : applyPrefabOverride(sourceNode, id, override);
  const inheritedFramingRole = node.framingRole ?? options.framingRole;
  const object = await createDirectContentObject(context, node);
  context.createdObjects.add(object);
  object.name = node.name ?? id;
  object.visible = override?.visible ?? true;
  applyLoweredTransform(object, node.transform, options.prefixMatrix);
  markSceneObject(
    object,
    node,
    sourceNode.id,
    context.runtimeHash,
    inheritedFramingRole ?? 'content',
  );

  const lowered: SceneLoweredNode = {
    children: [],
    id,
    node,
    object,
    parentNodeId: options.parentNodeId,
    sourceNodeId: sourceNode.id,
    virtualNodes: [],
  };

  if (node.content?.type === 'instance') {
    const prefab = findRequiredPrefab(context.document, node.content.prefab);
    assertPrefabNotRecursive(options.prefabStack, prefab.id);
    const root = resolveScenePrefabRoot(
      context.document,
      prefab.root,
      node.content.overrides,
    );
    const child = await lowerNode(context, root, {
      derived: true,
      framingRole: inheritedFramingRole,
      namespace: id,
      overrides: node.content.overrides,
      overridesApplied: true,
      parentNodeId: id,
      prefabStack: [...options.prefabStack, prefab.id],
    });
    object.add(child.object);
    lowered.children.push(child);
  } else if (node.content?.type === 'pattern') {
    await lowerPatternContent(
      context,
      lowered,
      options.prefabStack,
      inheritedFramingRole,
    );
  }

  for (const childNode of sourceNode.children ?? []) {
    const child = await lowerNode(context, childNode, {
      derived: options.derived,
      framingRole: inheritedFramingRole,
      namespace: options.namespace,
      overrides: options.overrides,
      overridesApplied: options.overridesApplied,
      parentNodeId: id,
      prefabStack: options.prefabStack,
    });
    object.add(child.object);
    lowered.children.push(child);
  }
  return lowered;
}

async function createDirectContentObject(
  context: LoweringContext,
  node: SceneNode,
): Promise<Object3D> {
  const content = node.content;
  if (
    content == null ||
    content.type === 'group' ||
    content.type === 'instance' ||
    content.type === 'pattern'
  ) {
    return new Object3D();
  }
  return createAssetContentObject(context, content);
}

async function createAssetContentObject(
  context: LoweringContext,
  content: SceneAssetContent,
): Promise<Object3D> {
  if (context.loadAsset == null) {
    throw new Error(
      `Scene asset "${content.asset}" requires an asset registry`,
    );
  }
  const object = await context.loadAsset(content.asset);
  if (object == null || object.isObject3D !== true) {
    throw new Error(
      `Scene asset registry returned an invalid object for "${content.asset}"`,
    );
  }
  if (object.parent != null) {
    throw new Error(
      `Scene asset registry returned a parented object for "${content.asset}"`,
    );
  }
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = content.castShadow ?? false;
      child.receiveShadow = content.receiveShadow ?? false;
    }
  });
  object.userData.iwsdkSceneAssetId = content.asset;
  return object;
}

async function lowerPatternContent(
  context: LoweringContext,
  lowered: SceneLoweredNode,
  prefabStack: string[],
  framingRole: SceneNodeFramingRole | undefined,
): Promise<void> {
  const content = lowered.node.content;
  if (content?.type !== 'pattern') {
    return;
  }
  const prefab = findRequiredPrefab(context.document, content.prefab);
  assertPrefabNotRecursive(prefabStack, prefab.id);
  const root = resolveScenePrefabRoot(
    context.document,
    prefab.root,
    content.overrides,
  );
  const collisionRadius = getSceneNodeCollisionRadius(context.document, root, {
    resolveAssetBounds: context.resolveAssetBounds,
  });
  const transforms = generateScenePatternTransforms(content.distribution, {
    collisionRadius,
    maxInstances: context.maxPatternInstances,
    seedKey: lowered.id,
  });
  const nextStack = [...prefabStack, prefab.id];

  if (context.useInstancing && isPrefabSafeToInstance(root)) {
    const template = await createDirectContentObject(context, root);
    if (template instanceof Mesh && template.children.length === 0) {
      claimExpandedNodes(context, transforms.length);
      const instances = new InstancedMesh(
        template.geometry,
        template.material,
        transforms.length,
      );
      instances.name = `${lowered.id}:instances`;
      instances.castShadow = template.castShadow;
      instances.receiveShadow = template.receiveShadow;
      instances.visible = content.overrides?.[root.id]?.visible ?? true;
      instances.userData.iwsdkSceneFramingRole =
        root.framingRole ?? framingRole ?? 'content';
      const localMatrix = sceneTransformMatrix(root.transform);
      const ids: string[] = [];
      for (let index = 0; index < transforms.length; index += 1) {
        const id = deriveScenePatternNodeId(lowered.id, index, root.id);
        const matrix = sceneTransformMatrix(transforms[index]).multiply(
          localMatrix,
        );
        instances.setMatrixAt(index, matrix);
        ids.push(id);
        lowered.virtualNodes.push({
          id,
          instanceIndex: index,
          node: { ...cloneJson(root), id },
          object: instances,
          parentNodeId: lowered.id,
          sourceNodeId: root.id,
        });
      }
      instances.instanceMatrix.needsUpdate = true;
      instances.userData.iwsdkSceneInstanceIds = ids;
      instances.userData.iwsdkSceneNodeId = lowered.id;
      instances.userData.iwsdkSceneRuntimeHash = context.runtimeHash;
      lowered.object.add(instances);
      return;
    }
  }

  for (let index = 0; index < transforms.length; index += 1) {
    const namespace = deriveScenePatternInstanceNamespace(lowered.id, index);
    const child = await lowerNode(context, root, {
      derived: true,
      framingRole,
      namespace,
      overrides: content.overrides,
      overridesApplied: true,
      parentNodeId: lowered.id,
      prefixMatrix: sceneTransformMatrix(transforms[index]),
      prefabStack: nextStack,
    });
    lowered.object.add(child.object);
    lowered.children.push(child);
  }
}

function applyPrefabOverride(
  source: SceneNode,
  id: string,
  override: ScenePrefabNodeOverride | undefined,
): SceneNode {
  const node = cloneJson(source);
  node.id = id;
  if (override?.transform != null) {
    node.transform = { ...(node.transform ?? {}), ...override.transform };
  }
  if (override?.components != null) {
    node.components = {
      ...(node.components ?? {}),
      ...cloneJson(override.components),
    };
  }
  return node;
}

function applyDerivedNodeId(source: SceneNode, id: string): SceneNode {
  const node = cloneJson(source);
  node.id = id;
  return node;
}

function resolveSceneNodeConstraints(
  document: SceneDocument,
  root: SceneNode,
): SceneNode {
  const scope: SceneDocument = {
    nodes: [root],
    resources: {},
    units: document.units,
    version: document.version,
  };
  return resolveSceneAuthoringTransforms(scope).nodes[0];
}

function findSceneNode(
  nodes: readonly SceneNode[],
  nodeId: string,
): SceneNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const child = findSceneNode(node.children ?? [], nodeId);
    if (child != null) {
      return child;
    }
  }
  return undefined;
}

function markSceneObject(
  object: Object3D,
  node: SceneNode,
  sourceNodeId: string,
  runtimeHash: Sha256 | undefined,
  framingRole: SceneNodeFramingRole,
): void {
  const values = {
    iwsdkSceneContent: cloneJson(node.content),
    iwsdkSceneContentType: node.content?.type,
    iwsdkSceneFramingRole: framingRole,
    iwsdkSceneMetadata: cloneJson(node.metadata),
    iwsdkSceneNodeId: node.id,
    iwsdkSceneRuntimeHash: runtimeHash,
    iwsdkSceneSourceNodeId: sourceNodeId,
  };
  object.traverse((child) => Object.assign(child.userData, values));
}

function applyLoweredTransform(
  object: Object3D,
  transform: SceneTransform | undefined,
  prefixMatrix: Matrix4 | undefined,
): void {
  if (prefixMatrix == null) {
    applySceneTransform(object, transform);
    return;
  }
  object.matrix.copy(prefixMatrix).multiply(sceneTransformMatrix(transform));
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.matrixAutoUpdate = false;
  object.updateMatrixWorld(true);
}

function sceneTransformMatrix(transform: SceneTransform | undefined): Matrix4 {
  const position = new Vector3(...(transform?.position ?? [0, 0, 0]));
  const rotation = transform?.rotationDeg ?? [0, 0, 0];
  const quaternion = new Quaternion().setFromEuler(
    new Object3D().rotation.set(
      degreesToRadians(rotation[0]),
      degreesToRadians(rotation[1]),
      degreesToRadians(rotation[2]),
    ),
  );
  const scale = new Vector3(...scaleToVec3(transform?.scale));
  return new Matrix4().compose(position, quaternion, scale);
}

function isPrefabSafeToInstance(root: SceneNode): boolean {
  return (
    root.content?.type === 'asset' &&
    (root.children?.length ?? 0) === 0 &&
    (root.components == null || Object.keys(root.components).length === 0) &&
    root.constraints == null
  );
}

function findRequiredPrefab(document: SceneDocument, prefabId: string) {
  const prefab = document.resources.prefabs?.find(
    (entry) => entry.id === prefabId,
  );
  if (prefab == null) {
    throw new Error(`Scene references unknown prefab "${prefabId}"`);
  }
  return prefab;
}

function assertPrefabNotRecursive(stack: string[], prefabId: string): void {
  if (stack.includes(prefabId)) {
    throw new Error(
      `Recursive scene prefab expansion: ${[...stack, prefabId].join(' -> ')}`,
    );
  }
}

function claimExpandedNodes(context: LoweringContext, count: number): void {
  context.expandedNodeCount += count;
  if (context.expandedNodeCount > context.maxPatternInstances) {
    throw new Error(
      `Scene derived-node expansion exceeds the limit of ${context.maxPatternInstances}`,
    );
  }
}

function scaleToVec3(scale: SceneScale | undefined): Vec3 {
  if (scale == null) {
    return [1, 1, 1];
  }
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
