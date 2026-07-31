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
  selectNode,
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor metadata authoring boundary', () => {
  test('keeps untyped metadata out of the human inspector while retaining file authoring', async () => {
    harness = await createEditorTestHarness('editor-metadata-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => editor.page.locator('.metadata-editor').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-node-metadata]').count())
      .toBe(0);
    await dispatchSceneTool(editor.page, 'scene_apply_patch', {
      patch: {
        nodeId: 'table-1',
        op: 'setNodeMetadata',
        value: {
          'iwsdk.note': 'intentional support object',
          'iwsdk.validation': { allowFloating: true },
        },
      },
    });
    await expect
      .poll(() => readNodeMetadata(editor))
      .toEqual({
        'iwsdk.note': 'intentional support object',
        'iwsdk.validation': { allowFloating: true },
      });
    await expectEditorSettled(editor);
    await dispatchSceneTool(editor.page, 'scene_apply_patch', {
      patch: {
        nodeId: 'table-1',
        op: 'setNodeMetadata',
        value: { 'iwsdk.note': 'saved from file', 'iwsdk.role': 'support' },
      },
    });
    await expect
      .poll(() => readNodeMetadata(editor))
      .toEqual({
        'iwsdk.note': 'saved from file',
        'iwsdk.role': 'support',
      });
    await expectEditorSettled(editor);

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0].metadata).toEqual({
      'iwsdk.note': 'saved from file',
      'iwsdk.role': 'support',
    });

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await selectNode(reloadedEditor.page, 'table-1');
    await expect
      .poll(() => reloadedEditor.page.locator('.metadata-editor').count())
      .toBe(0);
    await expect
      .poll(() => readNodeMetadata(reloadedEditor))
      .toEqual({
        'iwsdk.note': 'saved from file',
        'iwsdk.role': 'support',
      });
  }, 45000);
});

async function readNodeMetadata(editor: EditorPageContext): Promise<any> {
  return editor.page.evaluate(
    () => (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].metadata,
  );
}

async function expectEditorSettled(editor: EditorPageContext): Promise<void> {
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
}
