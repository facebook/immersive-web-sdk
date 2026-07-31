/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  dispatchSceneTool,
  expectRealWebGLViewport,
  getEditorProof,
  selectNode,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor selection bounds', () => {
  test('matches a nested procedural asset under a transformed parent', async () => {
    harness = await createEditorTestHarness('editor-selection-bounds');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        children: [
          {
            content: { asset: 'procedural-plinth', type: 'asset' },
            id: 'chair-seat',
            transform: {
              position: [0, 0.8598, 0.0174],
              rotationDeg: [-4, 0, 0],
            },
          },
        ],
        content: { type: 'group' },
        id: 'chair',
        transform: {
          position: [0.05, 0.04, -0.25],
          rotationDeg: [0, -4, 0],
        },
      },
    });

    await selectNode(editor.page, 'chair-seat');
    await expect
      .poll(async () => (await getEditorProof(editor.page)).selectionBounds)
      .toMatchObject({
        centerDistance: 0,
        maxDistance: 0,
        minDistance: 0,
        nodeId: 'chair-seat',
      });
    expect((await getEditorProof(editor.page)).selectedRuntime).toMatchObject({
      assetStatus: 'registered',
    });
    expect(editor.errors()).toEqual([]);
  }, 45000);
});
