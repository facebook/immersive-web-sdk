/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { SceneDocument } from '@iwsdk/scene-composition';
import type { Entity } from '../ecs/entity.js';
import type { World } from '../ecs/world.js';
import { GLXFImporter } from './level-glxf-importer.js';
import {
  SceneJSONImporter,
  type SceneJSONLoadResult,
} from './level-scene-json-importer.js';

/**
 * Routes level URLs to the native IWSDK scene importer or the legacy GLXF importer.
 *
 * @category Scene
 */
export class LevelImporter {
  static async load(
    world: World,
    url: string,
    parentEntity: Entity,
  ): Promise<SceneJSONLoadResult | void> {
    if (SceneJSONImporter.canLoadUrl(url)) {
      return SceneJSONImporter.load(world, url, parentEntity);
    }

    await GLXFImporter.load(world, url, parentEntity);
  }

  static async loadDocument(
    world: World,
    document: SceneDocument,
    parentEntity: Entity,
  ): Promise<SceneJSONLoadResult> {
    return SceneJSONImporter.loadDocument(world, document, parentEntity);
  }
}
