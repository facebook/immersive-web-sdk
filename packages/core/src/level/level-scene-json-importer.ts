/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  assertValidSceneDocument,
  migrateSceneDocument,
  resolveLookAtTransformInDocument,
  resolvePlaceOnTransform,
  type SceneAsset,
  type SceneDocument,
  type SceneNode,
  type SceneScale,
  type SceneTransform,
} from '@iwsdk/scene-composition';
import { AssetManager } from '../asset/index.js';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { Object3D } from '../runtime/index.js';
import { LevelComponentApplier } from './level-component-applier.js';

export interface SceneJSONImportedNode {
  node: SceneNode;
  nodeId: string;
  assetId?: string;
  componentTypes: string[];
  entity: Entity;
  object: Object3D;
  parentNodeId?: string;
}

export interface SceneJSONLoadResult {
  document: SceneDocument;
  nodes: Map<string, SceneJSONImportedNode>;
  rootEntities: Entity[];
}

/**
 * Loads native IWSDK scene JSON documents into a level root.
 *
 * @category Scene
 */
export class SceneJSONImporter {
  static canLoadUrl(url: string): boolean {
    const pathname = parsePathname(url);
    return (
      pathname.endsWith('.iwsdk.scene.json') || pathname.endsWith('.scene.json')
    );
  }

  static async load(
    world: World,
    url: string,
    parentEntity: Entity,
  ): Promise<SceneJSONLoadResult> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to load IWSDK scene "${url}": ${response.status} ${response.statusText}`,
      );
    }

    const document = migrateSceneDocument(await response.json());
    assertValidSceneDocument(document);
    return this.loadDocument(world, document, parentEntity, url);
  }

  static async loadDocument(
    world: World,
    document: SceneDocument,
    parentEntity: Entity,
    documentUrl?: string,
  ): Promise<SceneJSONLoadResult> {
    const migratedDocument = migrateSceneDocument(document);
    const resolvedDocument = resolveAuthoringTransforms(migratedDocument);
    assertValidSceneDocument(resolvedDocument);
    const result: SceneJSONLoadResult = {
      document: resolvedDocument,
      nodes: new Map(),
      rootEntities: [],
    };

    for (const node of resolvedDocument.nodes) {
      const entity = await this.createNode(
        world,
        resolvedDocument,
        node,
        parentEntity,
        documentUrl,
        result,
      );
      result.rootEntities.push(entity);
    }

    return result;
  }

  private static async createNode(
    world: World,
    document: SceneDocument,
    node: SceneNode,
    parentEntity: Entity,
    documentUrl: string | undefined,
    result: SceneJSONLoadResult,
    parentNodeId?: string,
  ): Promise<Entity> {
    const object = await this.createObjectForNode(document, node, documentUrl);
    object.name = node.name ?? node.id;
    markObjectForSceneNode(object, node, documentUrl);
    applyTransform(object, node.transform);

    const parentObject = parentEntity.object3D ?? world.getActiveRoot();
    parentObject.add(object);

    const entity = world.createTransformEntity(object, parentEntity);
    if (node.components != null) {
      LevelComponentApplier.applyComponents(entity, node.components, world, {
        nodeId: node.id,
        strict: true,
      });
    }
    result.nodes.set(node.id, {
      assetId: node.asset,
      componentTypes: Object.keys(node.components ?? {}),
      entity,
      node,
      nodeId: node.id,
      object,
      parentNodeId,
    });

    for (const child of node.children ?? []) {
      await this.createNode(
        world,
        document,
        child,
        entity,
        documentUrl,
        result,
        node.id,
      );
    }

    return entity;
  }

  private static async createObjectForNode(
    document: SceneDocument,
    node: SceneNode,
    documentUrl: string | undefined,
  ): Promise<Object3D> {
    if (node.asset == null) {
      return new Object3D();
    }

    const asset = document.assets?.find((entry) => entry.id === node.asset);
    if (asset == null) {
      throw new Error(
        `Scene node "${node.id}" references unknown asset "${node.asset}"`,
      );
    }

    if (asset.type != null && asset.type !== 'gltf') {
      return new Object3D();
    }

    const assetUrl = resolveAssetUrl(asset, documentUrl);
    const loaded = await AssetManager.loadGLTF(assetUrl, asset.id);
    const cached = AssetManager.getGLTF(asset.id);
    return (cached?.scene ?? loaded.scene.clone(true)) as Object3D;
  }
}

function markObjectForSceneNode(
  object: Object3D,
  node: SceneNode,
  documentUrl: string | undefined,
): void {
  object.userData.iwsdkSceneNodeId = node.id;
  object.userData.iwsdkSceneAssetId = node.asset;
  object.userData.iwsdkSceneDocumentUrl = documentUrl;
  object.traverse((child) => {
    child.userData.iwsdkSceneNodeId = node.id;
    child.userData.iwsdkSceneAssetId = node.asset;
    child.userData.iwsdkSceneDocumentUrl = documentUrl;
  });
}

function resolveAuthoringTransforms(document: SceneDocument): SceneDocument {
  const resolvedDocument = structuredClone(document);
  const nodes = flattenNodes(resolvedDocument.nodes);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const resolvingPlaceOn = new Set<string>();
  const resolvedPlaceOn = new Set<string>();

  for (const node of nodes) {
    resolveNodePlaceOn(
      resolvedDocument,
      nodesById,
      resolvingPlaceOn,
      resolvedPlaceOn,
      node,
    );
  }

  for (const node of nodes) {
    if (node.transform?.lookAt != null) {
      node.transform = resolveLookAtTransformInDocument(
        resolvedDocument,
        node.id,
        node.transform.lookAt,
      );
    }
  }

  return resolvedDocument;
}

function resolveNodePlaceOn(
  document: SceneDocument,
  nodesById: Map<string, SceneNode>,
  resolving: Set<string>,
  resolved: Set<string>,
  node: SceneNode,
): void {
  if (resolved.has(node.id)) {
    return;
  }

  if (resolving.has(node.id)) {
    throw new Error(`Cycle detected while resolving placeOn for "${node.id}"`);
  }

  resolving.add(node.id);
  const placeOn = node.transform?.placeOn;
  if (placeOn != null) {
    const targetId = typeof placeOn === 'string' ? placeOn : placeOn.target;
    const target = nodesById.get(targetId);
    if (target == null) {
      throw new Error(
        `Scene node "${node.id}" placeOn target "${targetId}" was not found`,
      );
    }
    resolveNodePlaceOn(document, nodesById, resolving, resolved, target);
    node.transform = resolvePlaceOnTransform(document, node.id, placeOn);
  }
  resolving.delete(node.id);
  resolved.add(node.id);
}

function flattenNodes(
  nodes: SceneNode[],
  result: SceneNode[] = [],
): SceneNode[] {
  for (const node of nodes) {
    result.push(node);
    flattenNodes(node.children ?? [], result);
  }

  return result;
}

function applyTransform(
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
    const scale = scaleToVec3(transform.scale);
    object.scale.set(...scale);
  }

  object.updateMatrixWorld(true);
}

function scaleToVec3(scale: SceneScale): [number, number, number] {
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function resolveAssetUrl(
  asset: SceneAsset,
  documentUrl: string | undefined,
): string {
  if (/^(?:[a-z]+:)?\/\//i.test(asset.uri) || asset.uri.startsWith('/')) {
    return asset.uri;
  }

  if (documentUrl == null) {
    return asset.uri;
  }

  if (globalThis.location != null) {
    return new URL(asset.uri, new URL(documentUrl, globalThis.location.href))
      .href;
  }

  return asset.uri;
}

function parsePathname(url: string): string {
  try {
    return new URL(url, 'http://iwsdk.local').pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
