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
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor outliner context actions', () => {
  test('duplicates and removes scene graph nodes with document, runtime, and reload parity', async () => {
    harness = await createEditorTestHarness('editor-outliner-context-actions');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'vase-1',
        transform: { position: [1, 0, 0] },
      },
    });
    await expect.poll(() => rootNodeIds(editor)).toEqual(['table-1', 'vase-1']);

    await openNodeContextMenu(editor, 'vase-1');
    await editor.page.locator('[data-scene-graph-action="duplicate"]').click();
    await expect
      .poll(() => rootNodeIds(editor))
      .toEqual(['table-1', 'vase-1', 'vase-1-copy']);
    await expect.poll(() => selectedNodeIds(editor)).toEqual(['vase-1-copy']);
    await expect
      .poll(() => outlinerNodeIds(editor))
      .toEqual(['table-1', 'vase-1', 'vase-1-copy']);
    await expect
      .poll(() => runtimeNodeIds(editor))
      .toEqual(['table-1', 'vase-1', 'vase-1-copy']);

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const duplicatedScene = await harness.readScene();
    expect(
      duplicatedScene.nodes.map((node: { id: string }) => node.id),
    ).toEqual(['table-1', 'vase-1', 'vase-1-copy']);

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1', 'vase-1-copy']);
    await expect
      .poll(() => runtimeNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1', 'vase-1-copy']);

    await openNodeContextMenu(reloadedEditor, 'vase-1-copy');
    await reloadedEditor.page
      .locator('[data-scene-graph-action="remove"]')
      .click();
    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1']);
    await expect.poll(() => selectedNodeIds(reloadedEditor)).toEqual([]);
    await expect
      .poll(() => outlinerNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1']);
    await expect
      .poll(() => runtimeNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1']);

    await expect(
      dispatchSceneTool(reloadedEditor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const removedScene = await harness.readScene();
    expect(removedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'vase-1',
    ]);

    const finalEditor = await harness.openEditor();
    await expectRealWebGLViewport(finalEditor);
    await expect
      .poll(() => rootNodeIds(finalEditor))
      .toEqual(['table-1', 'vase-1']);
    await expect
      .poll(() => runtimeNodeIds(finalEditor))
      .toEqual(['table-1', 'vase-1']);
  }, 60000);
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

async function selectedNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_SELECTION);
}

async function outlinerNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page
    .locator('#outliner [data-node-id]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-node-id') ?? ''),
    );
}

async function runtimeNodeIds(editor: EditorPageContext): Promise<string[]> {
  const proof = await getEditorProof(editor.page);
  return proof.objectHierarchy
    .map((entry: any) => entry.nodeId)
    .sort((left: string, right: string) => left.localeCompare(right));
}
