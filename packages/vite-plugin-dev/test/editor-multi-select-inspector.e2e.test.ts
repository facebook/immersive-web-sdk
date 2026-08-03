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

describe('editor multi-select inspector', () => {
  test('edits common transform fields across selected nodes and preserves reload parity', async () => {
    harness = await createEditorTestHarness('editor-multi-select-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'vase-1',
        transform: { position: [1, 0, 0] },
      },
    });

    await editor.page.locator('[data-node-id="table-1"]').click();
    await editor.page.locator('[data-node-id="vase-1"]').click({
      modifiers: ['Shift'],
    });
    await expect
      .poll(() => selectedNodeIds(editor))
      .toEqual(['table-1', 'vase-1']);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-multi-selection-count]')
          .getAttribute('data-multi-selection-count'),
      )
      .toBe('2');
    await expect
      .poll(() =>
        editor.page.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('');
    await expect
      .poll(() => getEditorProof(editor.page))
      .toMatchObject({
        selectionBounds: {
          aggregateBounds: expect.any(Object),
          nodeIds: ['table-1', 'vase-1'],
        },
        transformControls: {
          attachedNodeId: null,
          visible: false,
        },
      });

    await editor.page
      .locator('[data-transform-field="position.0"]')
      .fill('0.5');
    await editor.page.locator('[data-transform-field="position.1"]').focus();
    await expect
      .poll(() => transformSummary(editor))
      .toMatchObject({
        'table-1': { position: [0.5, 0, 0] },
        'vase-1': { position: [0.5, 0, 0] },
      });

    await editor.page.locator('[data-transform-field="scale.0"]').fill('1.25');
    await editor.page.locator('[data-transform-field="scale.1"]').focus();
    await expect
      .poll(() => transformSummary(editor))
      .toMatchObject({
        'table-1': { scale: [1.25, 1, 1] },
        'vase-1': { scale: [1.25, 1, 1] },
      });

    await editor.page.locator('[data-transform-field="scale.1"]').fill('0');
    await editor.page.locator('[data-transform-field="scale.2"]').focus();
    await expect
      .poll(() => transformSummary(editor))
      .toMatchObject({
        'table-1': { scale: [1.25, 0, 1] },
        'vase-1': { scale: [1.25, 0, 1] },
      });

    await editor.page.locator('[data-transform-field="scale.2"]').fill('-0.75');
    await editor.page.locator('[data-transform-field="scale.0"]').focus();
    await expect
      .poll(() => transformSummary(editor))
      .toMatchObject({
        'table-1': { scale: [1.25, 0, -0.75] },
        'vase-1': { scale: [1.25, 0, -0.75] },
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(
      Object.fromEntries(
        savedScene.nodes.map((node: any) => [node.id, node.transform]),
      ),
    ).toMatchObject({
      'table-1': { position: [0.5, 0, 0], scale: [1.25, 0, -0.75] },
      'vase-1': { position: [0.5, 0, 0], scale: [1.25, 0, -0.75] },
    });

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await dispatchSceneTool(reloadedEditor.page, 'scene_select', {
      nodeIds: ['table-1', 'vase-1'],
    });
    await expect
      .poll(() =>
        reloadedEditor.page
          .locator('[data-transform-field="position.0"]')
          .inputValue(),
      )
      .toBe('0.5');
    await expect
      .poll(() =>
        reloadedEditor.page
          .locator('[data-transform-field="scale.0"]')
          .inputValue(),
      )
      .toBe('1.25');
    await expect
      .poll(() =>
        reloadedEditor.page
          .locator('[data-transform-field="scale.1"]')
          .inputValue(),
      )
      .toBe('0');
    await expect
      .poll(() =>
        reloadedEditor.page
          .locator('[data-transform-field="scale.2"]')
          .inputValue(),
      )
      .toBe('-0.75');
  }, 45000);
});

async function selectedNodeIds(editor: EditorPageContext): Promise<string[]> {
  return editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_SELECTION);
}

async function transformSummary(
  editor: EditorPageContext,
): Promise<Record<string, any>> {
  return editor.page.evaluate(() => {
    const nodes = (window as any).IWSDK_SCENE_EDITOR.session.document.nodes;
    return Object.fromEntries(
      nodes.map((node: any) => [node.id, node.transform || {}]),
    );
  });
}
