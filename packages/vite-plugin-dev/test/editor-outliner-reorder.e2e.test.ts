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
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor outliner reorder', () => {
  test('sorts the outliner by id without changing document order', async () => {
    harness = await createEditorTestHarness('editor-outliner-reorder');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'z-vase',
        transform: { position: [1, 0, 0] },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'a-vase',
        transform: { position: [2, 0, 0] },
      },
    });
    await expect
      .poll(() => rootNodeIds(editor))
      .toEqual(['table-1', 'z-vase', 'a-vase']);
    await expect
      .poll(() => outlinerNodeIds(editor))
      .toEqual(['a-vase', 'table-1', 'z-vase']);

    await openNodeContextMenu(editor, 'a-vase');
    await expect
      .poll(() =>
        editor.page.locator('[data-scene-graph-action="move-up"]').count(),
      )
      .toBe(0);
    await expect
      .poll(() =>
        editor.page.locator('[data-scene-graph-action="move-down"]').count(),
      )
      .toBe(0);
    await expect
      .poll(() =>
        editor.page.evaluate(() => ({
          conflict: Boolean(
            document.querySelector('#scene-save-conflict-dialog'),
          ),
          dirty: (window as any).IWSDK_SCENE_EDITOR.session.isDirty,
        })),
      )
      .toEqual({ conflict: false, dirty: false });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'z-vase',
      'a-vase',
    ]);

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'z-vase', 'a-vase']);
    await expect
      .poll(() => outlinerNodeIds(reloadedEditor))
      .toEqual(['a-vase', 'table-1', 'z-vase']);
  }, 45000);
});

async function openNodeContextMenu(
  editor: EditorPageContext,
  nodeId: string,
): Promise<void> {
  await editor.page.locator(`[data-node-id="${nodeId}"]`).click({
    button: 'right',
  });
  await expect
    .poll(() =>
      editor.page
        .locator('#scene-graph-context-menu')
        .getAttribute('data-context-node-id'),
    )
    .toBe(nodeId);
}

async function rootNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.map(
      (node: { id: string }) => node.id,
    ),
  );
}

async function outlinerNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page
    .locator('#outliner [data-node-id]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-node-id') ?? ''),
    );
}
