/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_VERSION,
  type SceneDocument,
} from '@iwsdk/scene-composition';
import { describe, expect, it } from 'vitest';
import { lowerSceneDocumentObjects } from '../../src/level/level-scene-object.js';

describe('scene node visibility lowering', () => {
  it('supports canonical visibility, legacy scenes, and canonical precedence', async () => {
    const document: SceneDocument = {
      nodes: [
        { content: { type: 'group' }, id: 'canonical', visible: false },
        {
          components: {
            'com.iwsdk.components.Visibility': { isVisible: false },
          },
          content: { type: 'group' },
          id: 'legacy',
        },
        {
          components: {
            'com.iwsdk.components.Visibility': { isVisible: false },
          },
          content: { type: 'group' },
          id: 'canonical-wins',
          visible: true,
        },
      ],
      resources: {},
      units: 'meters',
      version: CURRENT_SCENE_VERSION,
    };

    const lowered = await lowerSceneDocumentObjects(document);

    expect(lowered.map(({ object }) => object.visible)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
