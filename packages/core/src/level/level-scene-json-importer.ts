/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  assertValidSceneDocument,
  composeSceneDocument,
  hashRuntimeSceneDocument,
  type JsonObject,
  type SceneDocument,
  type SceneCompositionDependency,
  type SceneNode,
  type SceneNodeContent,
  type SceneNodeFramingRole,
  type Sha256,
} from '@iwsdk/scene-composition';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { Object3D } from '../runtime/index.js';
import { LevelComponentApplier } from './level-component-applier.js';
import {
  disposeLoweredSceneNodes,
  lowerSceneDocumentObjects,
  resolveSceneDocumentForLowering,
  type SceneLoweredNode,
  type SceneLoweredVirtualNode,
} from './level-scene-object.js';

export interface SceneJSONImportedNode {
  assetId?: string;
  componentTypes: string[];
  contentType?: SceneNodeContent['type'];
  entity: Entity;
  framingRole: SceneNodeFramingRole;
  instanceIndex?: number;
  metadata?: JsonObject;
  node: SceneNode;
  nodeId: string;
  object: Object3D;
  parentNodeId?: string;
  runtimeHash: Sha256;
  sourceNodeId: string;
}

export interface SceneJSONLoadResult {
  dependencies: SceneCompositionDependency[];
  document: SceneDocument;
  nodes: Map<string, SceneJSONImportedNode>;
  rootEntities: Entity[];
  runtimeHash: Sha256;
}

export interface SceneJSONImportOptions {}

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
    _options: SceneJSONImportOptions = {},
  ): Promise<SceneJSONLoadResult> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to load IWSDK scene "${url}": ${response.status} ${response.statusText}`,
      );
    }

    return this.loadDocument(
      world,
      await response.json(),
      parentEntity,
      response.url || url,
      _options,
    );
  }

  static async loadDocument(
    world: World,
    document: SceneDocument,
    parentEntity: Entity,
    documentUrl?: string,
    _options: SceneJSONImportOptions = {},
  ): Promise<SceneJSONLoadResult> {
    const sourceDocument = structuredClone(document);
    const validationOptions = {
      componentCatalog: world.componentCatalog,
      // Authoring review completeness is not part of the runtime projection.
      // Draft scenes that the editor can render must remain runtime-loadable.
      validateAuthoringWorkflow: false,
    };
    assertValidSceneDocument(sourceDocument, validationOptions);
    if ((sourceDocument.imports?.length ?? 0) > 0 && documentUrl == null) {
      throw new Error(
        'Scene documents with imports require a document URL for relative resolution',
      );
    }
    const compositionSource =
      documentUrl == null ? undefined : canonicalSceneSource(documentUrl);
    const composed = await composeSceneDocument(sourceDocument, {
      ...validationOptions,
      ...(compositionSource == null ? {} : { source: compositionSource }),
      resolve: async ({ importer, src }) => {
        if (importer == null) {
          throw new Error(
            `Cannot resolve scene import "${src}" without an importer URL`,
          );
        }
        const source = new URL(src, importer).href;
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(
            `Failed to load IWSDK scene module "${source}": ${response.status} ${response.statusText}`,
          );
        }
        return {
          document: await response.json(),
          source: response.url || source,
        };
      },
    });
    const runtimeHash = hashRuntimeSceneDocument(composed.document);
    const resolvedDocument = resolveSceneDocumentForLowering(composed.document);
    assertValidSceneDocument(resolvedDocument, validationOptions);
    const result: SceneJSONLoadResult = {
      dependencies: composed.dependencies,
      document: resolvedDocument,
      nodes: new Map(),
      rootEntities: [],
      runtimeHash,
    };

    let roots: SceneLoweredNode[] = [];
    const createdEntities: Entity[] = [];
    try {
      if (resolvedDocument.components != null) {
        LevelComponentApplier.applyComponents(
          parentEntity,
          resolvedDocument.components,
          world,
          { nodeId: '$root', strict: true },
        );
      }
      roots = await lowerSceneDocumentObjects(resolvedDocument, {
        loadAsset: (assetId) => world.assets.instantiate(assetId),
        resolveAssetBounds: (assetId) => world.assets.bounds(assetId),
        runtimeHash,
      });
      for (const root of roots) {
        const entity = this.createEntityForLoweredNode(
          world,
          root,
          parentEntity,
          documentUrl,
          result,
          createdEntities,
        );
        result.rootEntities.push(entity);
      }
      const parentObject = parentEntity.object3D ?? world.getActiveRoot();
      parentObject.userData.iwsdkSceneRuntimeHash = runtimeHash;
      parentObject.userData.iwsdkSceneDocumentMetadata = cloneJson(
        resolvedDocument.metadata,
      );
      parentObject.userData.iwsdkSceneRootComponents = cloneJson(
        resolvedDocument.components,
      );
      parentObject.userData.iwsdkSceneEnvironment = cloneJson(
        resolvedDocument.environment,
      );
    } catch (error) {
      for (const entity of createdEntities.reverse()) {
        entity.destroy();
      }
      for (const root of roots) {
        root.object.removeFromParent();
      }
      disposeLoweredSceneNodes(...roots);
      throw error;
    }
    return result;
  }

  private static createEntityForLoweredNode(
    world: World,
    lowered: SceneLoweredNode,
    parentEntity: Entity,
    documentUrl: string | undefined,
    result: SceneJSONLoadResult,
    createdEntities: Entity[],
  ): Entity {
    const parentObject = parentEntity.object3D ?? world.getActiveRoot();
    if (lowered.object.parent !== parentObject) {
      parentObject.add(lowered.object);
    }
    lowered.object.traverse((object) => {
      object.userData.iwsdkSceneDocumentUrl = documentUrl;
      object.userData.iwsdkSceneRuntimeHash = result.runtimeHash;
    });

    const entity = world.createTransformEntity(lowered.object, parentEntity);
    createdEntities.push(entity);
    if (lowered.node.components != null) {
      LevelComponentApplier.applyComponents(
        entity,
        lowered.node.components,
        world,
        { nodeId: lowered.id, strict: true },
      );
    }
    addImportedNode(result, lowered, entity);
    for (const virtual of lowered.virtualNodes) {
      addVirtualImportedNode(result, virtual, entity);
    }
    for (const child of lowered.children) {
      this.createEntityForLoweredNode(
        world,
        child,
        entity,
        documentUrl,
        result,
        createdEntities,
      );
    }
    return entity;
  }
}

function addImportedNode(
  result: SceneJSONLoadResult,
  lowered: SceneLoweredNode,
  entity: Entity,
): void {
  assertUniqueRuntimeNodeId(result, lowered.id);
  const content = lowered.node.content;
  result.nodes.set(lowered.id, {
    assetId: content?.type === 'asset' ? content.asset : undefined,
    componentTypes: Object.keys(lowered.node.components ?? {}),
    contentType: content?.type,
    entity,
    framingRole:
      lowered.object.userData.iwsdkSceneFramingRole === 'support'
        ? 'support'
        : 'content',
    metadata: cloneJson(lowered.node.metadata),
    node: lowered.node,
    nodeId: lowered.id,
    object: lowered.object,
    parentNodeId: lowered.parentNodeId,
    runtimeHash: result.runtimeHash,
    sourceNodeId: lowered.sourceNodeId,
  });
}

function addVirtualImportedNode(
  result: SceneJSONLoadResult,
  lowered: SceneLoweredVirtualNode,
  entity: Entity,
): void {
  assertUniqueRuntimeNodeId(result, lowered.id);
  const content = lowered.node.content;
  result.nodes.set(lowered.id, {
    componentTypes: [],
    contentType: content?.type,
    entity,
    framingRole:
      lowered.object.userData.iwsdkSceneFramingRole === 'support'
        ? 'support'
        : 'content',
    instanceIndex: lowered.instanceIndex,
    metadata: cloneJson(lowered.node.metadata),
    node: lowered.node,
    nodeId: lowered.id,
    object: lowered.object,
    parentNodeId: lowered.parentNodeId,
    runtimeHash: result.runtimeHash,
    sourceNodeId: lowered.sourceNodeId,
  });
}

function assertUniqueRuntimeNodeId(
  result: SceneJSONLoadResult,
  nodeId: string,
): void {
  if (result.nodes.has(nodeId)) {
    throw new Error(`Duplicate lowered scene node id "${nodeId}"`);
  }
}

function parsePathname(url: string): string {
  try {
    return new URL(url, 'https://iwsdk.local').pathname.toLowerCase();
  } catch {
    return url.split(/[?#]/, 1)[0].toLowerCase();
  }
}

function canonicalSceneSource(source: string): string {
  const browserBase = (globalThis as { location?: { href?: string } }).location
    ?.href;
  return new URL(source, browserBase ?? 'https://iwsdk.local/').href;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
