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

describe('editor outliner grouping', () => {
  test('groups and ungroups selected siblings while preserving runtime hierarchy and saved JSON', async () => {
    harness = await createEditorTestHarness('editor-outliner-grouping');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        asset: 'vase',
        id: 'vase-1',
        transform: { position: [1, 0, 0] },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        asset: 'vase',
        id: 'vase-2',
        transform: { position: [2, 0, 0] },
      },
    });
    await expect
      .poll(() => rootNodeIds(editor))
      .toEqual(['table-1', 'vase-1', 'vase-2']);

    const preGroupWorldPositions = await worldPositions(editor, [
      'vase-1',
      'vase-2',
    ]);
    await editor.page.locator('[data-node-id="vase-1"]').click();
    await editor.page.locator('[data-node-id="vase-2"]').click({
      modifiers: ['Shift'],
    });
    await expect
      .poll(() => selectedNodeIds(editor))
      .toEqual(['vase-1', 'vase-2']);

    await openNodeContextMenu(editor, 'vase-2');
    await expect
      .poll(() => selectedNodeIds(editor))
      .toEqual(['vase-1', 'vase-2']);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-scene-graph-action="group-selection"]')
          .isDisabled(),
      )
      .toBe(false);
    await editor.page
      .locator('[data-scene-graph-action="group-selection"]')
      .click();

    await expect
      .poll(() => rootNodeIds(editor))
      .toEqual(['table-1', 'group-1']);
    await expect
      .poll(() => childNodeIds(editor, 'group-1'))
      .toEqual(['vase-1', 'vase-2']);
    await expect.poll(() => selectedNodeIds(editor)).toEqual(['group-1']);
    await expect
      .poll(() => outlinerNodeIds(editor))
      .toEqual(['table-1', 'group-1', 'vase-1', 'vase-2']);
    await expect
      .poll(() => runtimeParents(editor))
      .toMatchObject({
        'group-1': null,
        'vase-1': 'group-1',
        'vase-2': 'group-1',
      });
    await expect
      .poll(() => worldPositions(editor, ['vase-1', 'vase-2']))
      .toEqual(preGroupWorldPositions);

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'group-1',
    ]);
    expect(
      savedScene.nodes
        .find((node: { id: string }) => node.id === 'group-1')
        ?.children?.map((node: { id: string }) => node.id),
    ).toEqual(['vase-1', 'vase-2']);

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'group-1']);
    await expect
      .poll(() => runtimeParents(reloadedEditor))
      .toMatchObject({
        'group-1': null,
        'vase-1': 'group-1',
        'vase-2': 'group-1',
      });

    await openNodeContextMenu(reloadedEditor, 'group-1');
    await expect
      .poll(() =>
        reloadedEditor.page
          .locator('[data-scene-graph-action="ungroup"]')
          .isDisabled(),
      )
      .toBe(false);
    await reloadedEditor.page
      .locator('[data-scene-graph-action="ungroup"]')
      .click();

    await expect
      .poll(() => rootNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1', 'vase-2']);
    await expect
      .poll(() => selectedNodeIds(reloadedEditor))
      .toEqual(['vase-1', 'vase-2']);
    await expect
      .poll(() => outlinerNodeIds(reloadedEditor))
      .toEqual(['table-1', 'vase-1', 'vase-2']);
    await expect
      .poll(() => runtimeParents(reloadedEditor))
      .toMatchObject({
        'vase-1': null,
        'vase-2': null,
      });
    await expect
      .poll(() => worldPositions(reloadedEditor, ['vase-1', 'vase-2']))
      .toEqual(preGroupWorldPositions);

    await expect(
      dispatchSceneTool(reloadedEditor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const ungroupedScene = await harness.readScene();
    expect(ungroupedScene.nodes.map((node: { id: string }) => node.id)).toEqual(
      ['table-1', 'vase-1', 'vase-2'],
    );
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

async function worldPositions(
  editor: EditorPageContext,
  nodeIds: string[],
): Promise<Record<string, number[]>> {
  const proof = await getEditorProof(editor.page);
  return Object.fromEntries(
    nodeIds.map((nodeId) => {
      const entry = proof.objectHierarchy.find(
        (candidate: any) => candidate.nodeId === nodeId,
      );
      return [nodeId, entry?.worldPosition ?? null];
    }),
  );
}
