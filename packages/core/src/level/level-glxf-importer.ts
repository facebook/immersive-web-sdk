/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GLXF, GLXFLoader } from '@iwsdk/glxf';
import { AssetManager } from '../asset/index.js';
import type { Entity, World } from '../ecs/index.js';
import { EntityCreator } from './level-entity-creator.js';

/**
 * Loads a GLXF composition, attaches the scene graph, and creates ECS entities/components
 * based on `meta_spatial.components` extras.
 *
 * @remarks
 * - Uses the {@link AssetManager} GLTF loader so previously cached assets are reused.
 * - Each top‑level child of the GLXF active scene is attached to the current level root.
 * - Component names are resolved against the registry as `com.iwsdk.components.<id>`.
 *
 * @category Scene
 */
export class GLXFImporter {
  static async load(
    world: World,
    url: string,
    parentEntity: Entity,
  ): Promise<void> {
    const loader = new GLXFLoader(AssetManager.loadingManager).setGLTFLoader({
      loadAsync: (u: string) => AssetManager.loadGLTF(u),
    });

    const glxf: GLXF = await loader.loadAsync(url);

    const levelRoot = parentEntity.object3D ?? world.getActiveRoot();
    const levelParentEntity =
      parentEntity ?? world.activeLevel.value ?? world.sceneEntity;

    [...glxf.scene.children].forEach((child) => {
      levelRoot.attach(child);
      EntityCreator.createEntitiesFromObject3D(
        child,
        glxf.nodes,
        levelParentEntity,
        world,
      );
    });
  }
}
