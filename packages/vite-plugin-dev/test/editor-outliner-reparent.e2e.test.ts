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

describe('editor outliner reparent', () => {
  test('reparents and unparents nodes through scene graph drag and drop with reload parity', async () => {
    harness = await createEditorTestHarness('editor-outliner-reparent');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'vase-1',
        transform: { position: [1, 0, 0] },
      },
    });
    await expect.poll(() => worldPosition(editor, 'vase-1')).toEqual([1, 0, 0]);
    const preReparentWorldPosition = await worldPosition(editor, 'vase-1');

    await dragOutlinerNode(editor, 'vase-1', '[data-node-id="table-1"]');
    await expect.poll(() => rootNodeIds(editor)).toEqual(['table-1']);
    await expect
      .poll(() => childNodeIds(editor, 'table-1'))
      .toEqual(['vase-1']);
    await expect
      .poll(() => outlinerNodeIds(editor))
      .toEqual(['table-1', 'vase-1']);
    await expect
      .poll(() => runtimeParents(editor))
      .toMatchObject({
        'table-1': null,
        'vase-1': 'table-1',
      });
    await expect
      .poll(() => worldPosition(editor, 'vase-1'))
      .toEqual(preReparentWorldPosition);

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const nestedScene = await harness.readScene();
    expect(nestedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
    ]);
    expect(
      nestedScene.nodes[0].children.map((node: { id: string }) => node.id),
    ).toEqual(['vase-1']);

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect
      .poll(() => childNodeIds(reloadedEditor, 'table-1'))
      .toEqual(['vase-1']);
    await expect
      .poll(() => runtimeParents(reloadedEditor))
      .toMatchObject({
        'vase-1': 'table-1',
      });

    await dragOutlinerNode(reloadedEditor, 'vase-1', '#scene-root-drop-target');
    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1']);
    await expect
      .poll(() => childNodeIds(reloadedEditor, 'table-1'))
      .toEqual([]);
    await expect
      .poll(() => runtimeParents(reloadedEditor))
      .toMatchObject({
        'table-1': null,
        'vase-1': null,
      });
    await expect
      .poll(() => worldPosition(reloadedEditor, 'vase-1'))
      .toEqual(preReparentWorldPosition);

    await expect(
      dispatchSceneTool(reloadedEditor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const unparentedScene = await harness.readScene();
    expect(
      unparentedScene.nodes.map((node: { id: string }) => node.id),
    ).toEqual(['table-1', 'vase-1']);
    expect(unparentedScene.nodes[0].children).toBeUndefined();
  }, 60000);
});

async function dragOutlinerNode(
  editor: EditorPageContext,
  nodeId: string,
  targetSelector: string,
): Promise<void> {
  const dataTransfer = await editor.page.evaluateHandle(
    () => new DataTransfer(),
  );
  await editor.page
    .locator(`[data-node-id="${nodeId}"]`)
    .dispatchEvent('dragstart', { dataTransfer });
  await editor.page
    .locator(targetSelector)
    .dispatchEvent('dragover', { dataTransfer });
  await editor.page.locator(targetSelector).dispatchEvent('drop', {
    dataTransfer,
  });
  await editor.page
    .locator(`[data-node-id="${nodeId}"]`)
    .dispatchEvent('dragend', { dataTransfer });
  await dataTransfer.dispose();
}

async function rootNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.map(
      (node: { id: string }) => node.id,
    ),
  );
}

async function childNodeIds(
  editor: EditorPageContext,
  nodeId: string,
): Promise<string[]> {
  return editor.page.evaluate((id) => {
    const nodes = (window as any).IWSDK_SCENE_EDITOR.session.document.nodes;
    const visit = (items: any[]): any | null => {
      for (const item of items) {
        if (item.id === id) {
          return item;
        }
        const found = visit(item.children || []);
        if (found) {
          return found;
        }
      }
      return null;
    };
    return (visit(nodes)?.children || []).map(
      (node: { id: string }) => node.id,
    );
  }, nodeId);
}

async function outlinerNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page
    .locator('#outliner [data-node-id]')
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-node-id') ?? ''),
    );
}

async function runtimeParents(
  editor: EditorPageContext,
): Promise<Record<string, string | null>> {
  const proof = await getEditorProof(editor.page);
  return Object.fromEntries(
    proof.objectHierarchy.map((entry: any) => [
      entry.nodeId,
      entry.parentNodeId,
    ]),
  );
}

async function worldPosition(
  editor: EditorPageContext,
  nodeId: string,
): Promise<number[] | null> {
  const proof = await getEditorProof(editor.page);
  return (
    proof.objectHierarchy.find((entry: any) => entry.nodeId === nodeId)
      ?.worldPosition ?? null
  );
}
