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

describe('editor metadata inspector', () => {
  test('commits node metadata on focusout, rejects invalid payloads, and reloads saved metadata', async () => {
    harness = await createEditorTestHarness('editor-metadata-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    let metadataField = await openMetadataEditor(editor);
    await expect.poll(() => metadataField.inputValue()).toBe('{}');

    await metadataField.fill(
      JSON.stringify(
        {
          note: 'intentional support object',
          validation: { allowFloating: true },
        },
        null,
        2,
      ),
    );
    await editor.page.locator('[data-node-title-edit]').focus();
    await expect
      .poll(() => readNodeMetadata(editor))
      .toEqual({
        note: 'intentional support object',
        validation: { allowFloating: true },
      });

    metadataField = await openMetadataEditor(editor);
    await metadataField.fill('[]');
    await editor.page.locator('[data-node-title-edit]').focus();
    await expect
      .poll(() => editor.page.locator('#metadata-editor-message').textContent())
      .toContain('Node metadata must be a JSON object');
    await expect
      .poll(() => readNodeMetadata(editor))
      .toEqual({
        note: 'intentional support object',
        validation: { allowFloating: true },
      });

    await metadataField.fill(
      JSON.stringify(
        { note: 'saved from inspector', role: 'support' },
        null,
        2,
      ),
    );
    await editor.page.locator('[data-node-title-edit]').focus();
    await expect
      .poll(() => readNodeMetadata(editor))
      .toEqual({
        note: 'saved from inspector',
        role: 'support',
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0].metadata).toEqual({
      note: 'saved from inspector',
      role: 'support',
    });

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await selectNode(reloadedEditor.page, 'table-1');
    const reloadedMetadataField = await openMetadataEditor(reloadedEditor);
    await expect
      .poll(() => reloadedMetadataField.inputValue())
      .toContain('"saved from inspector"');
  }, 45000);
});

async function openMetadataEditor(editor: EditorPageContext) {
  const details = editor.page.locator('.metadata-editor');
  await details.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
    }
  });
  return details.locator('[data-node-metadata]');
}

async function readNodeMetadata(editor: EditorPageContext): Promise<any> {
  return editor.page.evaluate(
    () => (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].metadata,
  );
}
