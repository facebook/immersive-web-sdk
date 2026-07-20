/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from '../ecs/world.js';
import { Object3D, Quaternion, Vector3 } from '../runtime/index.js';

/**
 * Hierarchy node returned by get_scene_hierarchy
 */
export interface HierarchyNode {
  name: string;
  uuid: string;
  sceneNodeId?: string;
  entityIndex?: number;
  children?: HierarchyNode[];
  /** Present when children were truncated due to breadth limit. */
  truncatedChildren?: number;
}

/**
 * Transform data returned by get_object_transform
 */
export interface ObjectTransform {
  localPosition: [number, number, number];
  localQuaternion: [number, number, number, number];
  localScale: [number, number, number];
  globalPosition: [number, number, number];
  globalQuaternion: [number, number, number, number];
  globalScale: [number, number, number];
  positionRelativeToXROrigin: [number, number, number] | null;
}

interface GetSceneHierarchyParams {
  parentId?: string;
  maxDepth?: number;
  maxChildren?: number;
}

interface GetObjectTransformParams {
  nodeId?: string;
  uuid?: string;
}

/** Default maximum number of children per node before truncation. */
const DEFAULT_MAX_CHILDREN = 50;

/**
 * Get the Three.js scene hierarchy as a JSON tree.
 * Returns object names, UUIDs, and entity indices where available.
 */
export function getSceneHierarchy(
  world: World,
  params: Record<string, unknown>,
): HierarchyNode {
  const {
    parentId,
    maxDepth = 5,
    maxChildren = DEFAULT_MAX_CHILDREN,
  } = params as unknown as GetSceneHierarchyParams;

  let root: Object3D | undefined;

  if (parentId) {
    root = world.scene.getObjectByProperty('uuid', parentId);
    if (!root) {
      throw new Error(
        `Object not found with UUID '${parentId}'. Use get_scene_hierarchy without parentId to see all available objects.`,
      );
    }
  } else {
    root = world.scene;
  }

  return buildHierarchy(root, 0, maxDepth, maxChildren);
}

function buildHierarchy(
  obj: Object3D,
  depth: number,
  maxDepth: number,
  maxChildren: number,
): HierarchyNode {
  const node: HierarchyNode = {
    name: obj.name || '(unnamed)',
    uuid: obj.uuid,
  };
  if (typeof obj.userData?.iwsdkSceneNodeId === 'string') {
    node.sceneNodeId = obj.userData.iwsdkSceneNodeId;
  }

  // Check if Object3D has associated entity (entityIdx is set by Transform component)
  if ('entityIdx' in obj && typeof (obj as any).entityIdx === 'number') {
    node.entityIndex = (obj as any).entityIdx;
  }

  if (depth < maxDepth && obj.children.length > 0) {
    const total = obj.children.length;
    const limit = Math.max(1, maxChildren);
    const childrenToInclude = obj.children.slice(0, limit);
    node.children = childrenToInclude.map((child) =>
      buildHierarchy(child, depth + 1, maxDepth, maxChildren),
    );
    if (total > limit) {
      node.truncatedChildren = total - limit;
    }
  }

  return node;
}

/**
 * Get local and global transforms of an Object3D.
 * Includes positionRelativeToXROrigin which can be used directly with IWER look_at tool.
 */
export function getObjectTransform(
  world: World,
  params: Record<string, unknown>,
): ObjectTransform {
  const { nodeId, uuid } = params as unknown as GetObjectTransformParams;

  if (!uuid && !nodeId) {
    throw new Error(
      'uuid or nodeId parameter is required. Use get_scene_hierarchy for Object3D UUIDs or scene_get_hierarchy for native scene node ids.',
    );
  }

  const obj =
    uuid != null
      ? world.scene.getObjectByProperty('uuid', uuid)
      : findObjectBySceneNodeId(world.scene, nodeId!);
  if (!obj) {
    throw new Error(
      uuid != null
        ? `Object not found with UUID '${uuid}'. Use get_scene_hierarchy to discover available objects.`
        : `Object not found with scene node id '${nodeId}'. Use scene_get_hierarchy to discover native scene node ids.`,
    );
  }

  // Ensure world matrix is up to date
  obj.updateWorldMatrix(true, false);

  // Local transform (direct properties)
  const localPosition = obj.position.toArray() as [number, number, number];
  const localQuaternion = obj.quaternion.toArray() as [
    number,
    number,
    number,
    number,
  ];
  const localScale = obj.scale.toArray() as [number, number, number];

  // Global transform (decompose from world matrix)
  const globalPosition = new Vector3();
  const globalQuaternion = new Quaternion();
  const globalScale = new Vector3();
  obj.matrixWorld.decompose(globalPosition, globalQuaternion, globalScale);

  // Position relative to XR origin
  let positionRelativeToXROrigin: [number, number, number] | null = null;

  if (world.player) {
    // Clone the global position and convert to XR origin local space
    const relativePos = globalPosition.clone();
    world.player.updateWorldMatrix(true, false);
    world.player.worldToLocal(relativePos);
    positionRelativeToXROrigin = relativePos.toArray() as [
      number,
      number,
      number,
    ];
  }

  return {
    localPosition,
    localQuaternion,
    localScale,
    globalPosition: globalPosition.toArray() as [number, number, number],
    globalQuaternion: globalQuaternion.toArray() as [
      number,
      number,
      number,
      number,
    ],
    globalScale: globalScale.toArray() as [number, number, number],
    positionRelativeToXROrigin,
  };
}

function findObjectBySceneNodeId(
  object: Object3D,
  nodeId: string,
): Object3D | undefined {
  if (object.userData?.iwsdkSceneNodeId === nodeId) {
    return object;
  }

  for (const child of object.children) {
    const found = findObjectBySceneNodeId(child, nodeId);
    if (found != null) {
      return found;
    }
  }

  return undefined;
}
