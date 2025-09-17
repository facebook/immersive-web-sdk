/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { signal } from '@preact/signals-core';
import { Types, createSystem } from '../ecs/index.js';
import type { Entity } from '../ecs/index.js';
import {
  DomeGradient,
  DomeTexture,
  IBLGradient,
  IBLTexture,
} from '../environment/index.js';
import { GLXFImporter } from './level-glxf-importer.js';
import { LevelRoot } from './level-root.js';
import { LevelTag } from './level-tag.js';

/**
 * Manages the active level root, enforces identity transforms, and loads new levels on request.
 *
 * @remarks
 * - Destroys all {@link LevelTag}-tagged entities on level change.
 * - Loads GLXF via {@link GLXFImporter} when a URL is requested through {@link World.loadLevel}.
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
    const pending = this.world.requestedLevelUrl;
    if (pending === undefined) {
      return;
    }
    this.startLevelChange(pending);
  }

  private startLevelChange(url: string): void {
    this.loading = true;
    // Unset request now to avoid re-entry during async flow
    this.world.requestedLevelUrl = undefined;

    // Destroy all level-tagged entities (current level content)
    for (const ent of this.queries.levelEntities.entities) {
      try {
        ent.destroy();
      } catch {}
    }

    // Create a fresh level root and make it active
    const newRoot: Entity = this.world.createTransformEntity(undefined, {
      parent: this.world.sceneEntity,
    });
    newRoot.object3D!.name = 'LevelRoot';
    newRoot.addComponent(LevelRoot);
    this.world.activeLevel!.value = newRoot;

    const doLoad = url
      ? GLXFImporter.load(this.world, url, newRoot)
      : Promise.resolve();
    void doLoad
      .catch((err) => console.error('[LevelSystem] Failed to load level', err))
      .finally(() => {
        this.loading = false;
        // Attach default lighting if requested and the level root has no dome/IBL
        try {
          if (this.config.defaultLighting.value) {
            const hasDome =
              newRoot.hasComponent(DomeTexture) ||
              newRoot.hasComponent(DomeGradient);
            const hasIBL =
              newRoot.hasComponent(IBLTexture) ||
              newRoot.hasComponent(IBLGradient);
            if (!hasDome && !hasIBL) {
              newRoot.addComponent(DomeGradient).addComponent(IBLGradient);
            }
          }
        } catch (e) {
          console.warn('[LevelSystem] defaultLighting setup failed:', e);
        }
        if (this.world._resolveLevelLoad) {
          this.world._resolveLevelLoad();
          this.world._resolveLevelLoad = undefined;
        }
      });
  }
}
