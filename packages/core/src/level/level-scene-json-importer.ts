/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  assertValidSceneDocument,
  hashRuntimeSceneDocument,
  type JsonObject,
  type SceneDocument,
  type SceneCompositionDependency,
  type SceneEntityReference,
  type SceneNode,
  type SceneNodeContent,
  type SceneNodeFramingRole,
  type Sha256,
} from '@iwsdk/scene-composition';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { Object3D } from '../runtime/index.js';
import {
  LEVEL_COMPONENT_PREFIX,
  LevelComponentApplier,
} from './level-component-applier.js';
import { getScenePlayerTargetEntity } from './level-player-rig.js';
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
  playerAttachments: Entity[];
  rootEntities: Entity[];
  runtimeHash: Sha256;
}

export interface SceneJSONImportOptions {}

interface PendingSceneComponents {
  components: Record<string, unknown>;
  entity: Entity;
  nodeId: string;
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
    _options: SceneJSONImportOptions = {},
  ): Promise<SceneJSONLoadResult> {
    if (!this.canLoadUrl(url)) {
      throw new Error(
        `Unsupported level URL "${url}". Expected a native .iwsdk.scene.json or .scene.json document.`,
      );
    }
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
    const authoringAssets = world.assets?.catalog?.();
    const validationOptions = {
      componentCatalog: world.componentCatalog,
      ...(authoringAssets == null
        ? {}
        : { knownAssetIds: authoringAssets.map((asset) => asset.id) }),
      // Authoring review completeness is not part of the runtime projection.
      // Draft scenes that the editor can render must remain runtime-loadable.
      validateAuthoringWorkflow: false,
      validateComponentLinks: false,
    };
    assertValidSceneDocument(sourceDocument, validationOptions);
    if ((sourceDocument.imports?.length ?? 0) > 0) {
      throw new Error(
        'Scene imports are supported only by IWSDK authoring tools. Flatten this document before loading it at runtime with "iwsdk scene flatten --input-json \'{\"path\":\"public/scenes/source.iwsdk.scene.json\"}\'".',
      );
    }
    const runtimeHash = hashRuntimeSceneDocument(sourceDocument);
    const resolvedDocument = resolveSceneDocumentForLowering(sourceDocument);
    assertValidSceneDocument(resolvedDocument, validationOptions);
    const result: SceneJSONLoadResult = {
      dependencies: [],
      document: resolvedDocument,
      nodes: new Map(),
      playerAttachments: [],
      rootEntities: [],
      runtimeHash,
    };

    let roots: SceneLoweredNode[] = [];
    const createdEntities: Entity[] = [];
    const pendingComponents: PendingSceneComponents[] = [];
    try {
      roots = await lowerSceneDocumentObjects(resolvedDocument, {
        loadAsset: (assetId) => world.assets.instantiate(assetId),
        resolveAssetBounds: (assetId) => world.assets.bounds(assetId),
        runtimeHash,
      });
      for (const root of roots) {
        const playerTarget = root.node.parent?.target;
        const rootParent =
          playerTarget == null
            ? parentEntity
            : getScenePlayerTargetEntity(world, playerTarget);
        if (playerTarget != null) {
          root.object.userData.iwsdkSceneAuthoredVisible = root.object.visible;
          root.object.visible = false;
        }
        const entity = this.createEntityForLoweredNode(
          world,
          root,
          rootParent,
          documentUrl,
          result,
          createdEntities,
          pendingComponents,
        );
        result.rootEntities.push(entity);
        if (playerTarget != null) {
          result.playerAttachments.push(entity);
        }
      }
      const resolveEntityReference = createSceneEntityReferenceResolver(
        world,
        parentEntity,
        result.nodes,
      );
      if (resolvedDocument.components != null) {
        LevelComponentApplier.applyComponents(
          parentEntity,
          resolvedDocument.components,
          world,
          {
            nodeId: '$root',
            resolveEntityReference,
            strict: true,
          },
        );
      }
      for (const pending of pendingComponents) {
        LevelComponentApplier.applyComponents(
          pending.entity,
          pending.components,
          world,
          {
            nodeId: pending.nodeId,
            resolveEntityReference,
            strict: true,
          },
        );
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
    pendingComponents: PendingSceneComponents[],
  ): Entity {
    const parentObject = parentEntity.object3D ?? world.getActiveRoot();
    if (lowered.object.parent !== parentObject) {
      parentObject.add(lowered.object);
    }
    lowered.object.traverse((object) => {
      object.userData.iwsdkSceneDocumentUrl = documentUrl;
      object.userData.iwsdkSceneRuntimeHash = result.runtimeHash;
      object.userData.iwsdkSceneLevelId = world.activeLevelId;
    });

    const entity = world.createTransformEntity(lowered.object, parentEntity);
    createdEntities.push(entity);
    const components = withoutIntrinsicVisibility(lowered.node.components);
    if (components != null) {
      pendingComponents.push({
        components,
        entity,
        nodeId: lowered.id,
      });
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
        pendingComponents,
      );
    }
    return entity;
  }
}

function withoutIntrinsicVisibility(
  components: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (components == null) {
    return undefined;
  }
  const result = Object.fromEntries(
    Object.entries(components).filter(
      ([name]) =>
        name !== 'Visibility' && name !== `${LEVEL_COMPONENT_PREFIX}Visibility`,
    ),
  );
  return Object.keys(result).length === 0 ? undefined : result;
}

/** Resolve stable scene JSON entity references after all scene entities exist. */
export function createSceneEntityReferenceResolver(
  world: World,
  levelRoot: Entity,
  nodes: ReadonlyMap<string, { entity: Entity }>,
): (reference: unknown) => Entity | undefined {
  return (reference) => {
    if (!isSceneEntityReference(reference)) {
      return undefined;
    }
    if (reference.type === 'node') {
      return nodes.get(reference.id)?.entity;
    }
    if (reference.type === 'player-space') {
      return getScenePlayerTargetEntity(world, reference.target);
    }
    return levelRoot;
  };
}

function isSceneEntityReference(value: unknown): value is SceneEntityReference {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const reference = value as Record<string, unknown>;
  return (
    (reference.type === 'node' && typeof reference.id === 'string') ||
    (reference.type === 'player-space' &&
      typeof reference.target === 'string') ||
    reference.type === 'level-root'
  );
}

/** Reveal player-space attachments after their replacement level commits. */
export function activateScenePlayerAttachments(
  result: SceneJSONLoadResult | undefined,
): void {
  for (const entity of result?.playerAttachments ?? []) {
    const object = entity.object3D;
    if (object == null) {
      continue;
    }
    object.visible = object.userData.iwsdkSceneAuthoredVisible !== false;
    delete object.userData.iwsdkSceneAuthoredVisible;
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

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
