/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCENE_VERSION,
  SceneCommandHistory,
  applyScenePatch,
  validateSceneDocument,
  type SceneDocument,
} from '../src/index.js';

function sceneWithNode(node: SceneDocument['nodes'][number]): SceneDocument {
  return {
    nodes: [node],
    resources: {},
    units: 'meters',
    version: CURRENT_SCENE_VERSION,
  };
}

describe('scene node visibility', () => {
  it('validates canonical authored visibility', () => {
    expect(
      validateSceneDocument(
        sceneWithNode({
          content: { type: 'group' },
          id: 'hidden-node',
          visible: false,
        }),
      ),
    ).toMatchObject({ valid: true });
  });

  it('writes canonical default-omitting visibility and removes legacy payloads', () => {
    const legacy = sceneWithNode({
      components: {
        'com.iwsdk.components.Visibility': { isVisible: false },
      },
      content: { type: 'group' },
      id: 'legacy-node',
    });

    const hidden = applyScenePatch(legacy, {
      nodeId: 'legacy-node',
      op: 'updateVisibility',
      visible: false,
    }).document;
    expect(hidden.nodes[0].visible).toBe(false);
    expect(hidden.nodes[0].components).toBeUndefined();

    const visible = applyScenePatch(hidden, {
      nodeId: 'legacy-node',
      op: 'updateVisibility',
    }).document;
    expect(visible.nodes[0]).not.toHaveProperty('visible');
  });

  it('preserves exact visibility state through undo and redo', () => {
    const history = new SceneCommandHistory(
      sceneWithNode({ content: { type: 'group' }, id: 'node' }),
    );

    history.apply({
      nodeId: 'node',
      op: 'updateVisibility',
      visible: false,
    });
    expect(history.document.nodes[0].visible).toBe(false);
    expect(history.undo().nodes[0]).not.toHaveProperty('visible');
    expect(history.redo().nodes[0].visible).toBe(false);
  });
});
