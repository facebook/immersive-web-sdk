/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  SceneDocument,
  ScenePerspectiveView,
} from '@iwsdk/scene-composition';
import { signal } from '@preact/signals-core';
import { Types } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import type { World } from '../ecs/world.js';
import {
  DomeGradient,
  DomeTexture,
  IBLGradient,
  IBLTexture,
} from '../environment/index.js';
import { Vector3 } from '../runtime/index.js';
import { LevelRoot } from './level-root.js';
import {
  applySceneEnvironment,
  captureSceneEnvironment,
  restoreSceneEnvironment,
  type SceneEnvironmentState,
} from './level-scene-environment.js';
import {
  SceneJSONImporter,
  type SceneJSONLoadResult,
} from './level-scene-json-importer.js';
import { disposeSceneObjectResources } from './level-scene-object.js';
import { LevelTag } from './level-tag.js';

/**
 * Manages the active level root, enforces identity transforms, and atomically loads levels.
 *
 * @remarks
 * - Stages replacement content invisibly and destroys the prior level only after a successful load.
 * - Rejects failed loads while keeping the prior level active.
 * - Loads native scene JSON documents or native scene JSON URLs.
 * @category Scene
 */
export class LevelSystem extends createSystem(
  {
    // All entities that belong to a level (will be destroyed on level change)
    levelEntities: { required: [LevelTag] },
  },
  {
    /** Attach a default gradient dome on level roots when none provided. */
    defaultLighting: { type: Types.Boolean, default: true },
  },
) {
  private loading = false;
  /** Renderer state that predates the currently committed level. */
  private activeEnvironmentBase: SceneEnvironmentState | undefined;

  init(): void {
    // Ensure there is always an active level signal and a root entity
    if (!this.world.activeLevel || !this.world.activeLevel.value) {
      const root = this.world.createTransformEntity(undefined, {
        parent: this.world.sceneEntity,
      });
      root.object3D!.name = 'LevelRoot';
      root.addComponent(LevelRoot);
      if (!this.world.activeLevel) {
        // @ts-ignore initialize the signal if missing
        this.world.activeLevel = signal(root);
      } else {
        this.world.activeLevel.value = root;
      }
    }
  }

  update(): void {
    // Enforce identity transform on the level root every frame
    const root = this.world.activeLevel!.value!;
    const obj = root.object3D!;
    if (
      obj.position.x !== 0 ||
      obj.position.y !== 0 ||
      obj.position.z !== 0 ||
      obj.scale.x !== 1 ||
      obj.scale.y !== 1 ||
      obj.scale.z !== 1 ||
      obj.rotation.x !== 0 ||
      obj.rotation.y !== 0 ||
      obj.rotation.z !== 0
    ) {
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.set(1, 1, 1);
      obj.updateMatrixWorld(true);
    }

    // Check if a new level is requested
    if (this.loading) {
      return;
    }
    const pendingUrl = this.world.requestedLevelUrl;
    const pendingDocument = this.world.requestedLevelDocument;
    if (pendingUrl === undefined && pendingDocument === undefined) {
      return;
    }
    this.startLevelChange(pendingUrl ?? '', pendingDocument);
  }

  private startLevelChange(
    url: string,
    document = this.world.requestedLevelDocument,
  ): void {
    this.loading = true;
    const resolveLoad = this.world._resolveLevelLoad;
    const rejectLoad = this.world._rejectLevelLoad;
    this.world._resolveLevelLoad = undefined;
    this.world._rejectLevelLoad = undefined;
    // Unset request now to avoid re-entry during async flow
    this.world.requestedLevelUrl = undefined;
    this.world.requestedLevelDocument = undefined;
    const previousRoot = this.world.activeLevel!.value!;
    const previousLevelId = this.world.activeLevelId;
    const previousEntities = new Set(this.queries.levelEntities.entities);
    const nextLevelId = url || 'level:default';
    const environmentAtLoadStart = captureSceneEnvironment(
      this.world.scene,
      this.world.renderer,
    );

    // Stage the replacement under the scene root without exposing it as active.
    this.world.activeLevelId = nextLevelId;
    const newRoot: Entity = this.world.createTransformEntity(undefined, {
      parent: this.world.sceneEntity,
    });
    newRoot.object3D!.name = 'LevelRoot';
    newRoot.object3D!.visible = false;
    newRoot.addComponent(LevelRoot);

    const doLoad =
      document != null
        ? SceneJSONImporter.loadDocument(this.world, document, newRoot)
        : url
          ? SceneJSONImporter.load(this.world, url, newRoot)
          : Promise.resolve();
    void doLoad
      .then((loadResult) => {
        const nativeResult = asNativeSceneLoadResult(loadResult);
        // Prepare the next authored environment against the stable pre-level
        // baseline. The apply is transactional and retires the active level's
        // generated resources only after the replacement is ready.
        const nextEnvironmentBase =
          this.activeEnvironmentBase ?? environmentAtLoadStart;
        applySceneEnvironment(
          this.world.scene,
          this.world.renderer,
          nativeResult?.document.environment,
          nextEnvironmentBase,
        );
        if (nativeResult != null) {
          newRoot.object3D!.userData.iwsdkSceneResources = cloneJson(
            nativeResult.document.resources,
          );
        }

        disposeLevelEntities(previousEntities);
        newRoot.object3D!.visible = true;
        this.world.activeLevelId = nextLevelId;
        this.world.activeLevel!.value = newRoot;
        if (nativeResult != null) {
          applySceneHeroCamera(this.world, nativeResult.document);
        }
        this.activeEnvironmentBase = nextEnvironmentBase;

        // Attach default lighting only after the staged level is committed.
        try {
          if (this.config.defaultLighting.value) {
            const hasDome =
              newRoot.hasComponent(DomeTexture) ||
              newRoot.hasComponent(DomeGradient);
            const hasIBL =
              newRoot.hasComponent(IBLTexture) ||
              newRoot.hasComponent(IBLGradient);
            const hasAuthoredRootComponents =
              nativeResult?.document.components != null;
            if (!hasAuthoredRootComponents && !hasDome) {
              newRoot.addComponent(DomeGradient);
            }
            if (!hasAuthoredRootComponents && !hasIBL) {
              newRoot.addComponent(IBLGradient);
            }
          }
        } catch (error) {
          console.warn('[LevelSystem] defaultLighting setup failed:', error);
        }
        this.loading = false;
        resolveLoad?.();
      })
      .catch((error) => {
        const stagedEntities = new Set<Entity>([newRoot]);
        for (const entity of this.queries.levelEntities.entities) {
          if (!previousEntities.has(entity)) {
            stagedEntities.add(entity);
          }
        }
        disposeLevelEntities(stagedEntities);
        restoreSceneEnvironment(
          this.world.scene,
          this.world.renderer,
          environmentAtLoadStart,
        );
        this.world.activeLevelId = previousLevelId;
        this.world.activeLevel!.value = previousRoot;
        console.error('[LevelSystem] Failed to load level', error);
        this.loading = false;
        rejectLoad?.(error);
      });
  }
}

/** Apply a composed scene's authored hero view to the non-immersive camera. */
export function applySceneHeroCamera(
  world: World,
  document: SceneDocument,
): boolean {
  if (world.renderer.xr?.isPresenting === true) {
    return false;
  }
  const heroViewId = document.authoring?.composition?.review.heroView;
  const view = document.authoring?.views?.find(
    (candidate): candidate is ScenePerspectiveView =>
      candidate.id === heroViewId && candidate.projection === 'perspective',
  );
  if (view == null) {
    return false;
  }

  const cameraPosition = new Vector3(...view.position);
  if (world.camera.parent != null) {
    world.camera.parent.updateWorldMatrix(true, false);
    world.camera.parent.worldToLocal(cameraPosition);
  }
  world.camera.position.copy(cameraPosition);
  world.camera.lookAt(...view.target);
  if ('fov' in world.camera) {
    world.camera.fov = view.fov;
  }
  world.camera.updateProjectionMatrix();
  world.camera.userData.iwsdkSceneHeroView = cloneJson(view);
  return true;
}

function disposeLevelEntities(entities: Iterable<Entity>): void {
  const uniqueEntities = [...new Set(entities)];
  disposeSceneObjectResources(
    ...uniqueEntities.flatMap((entity) =>
      entity.object3D == null ? [] : [entity.object3D],
    ),
  );
  for (const entity of uniqueEntities) {
    try {
      entity.destroy();
    } catch {}
  }
}

function asNativeSceneLoadResult(
  value: SceneJSONLoadResult | void,
): SceneJSONLoadResult | undefined {
  return value != null && 'document' in value ? value : undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
