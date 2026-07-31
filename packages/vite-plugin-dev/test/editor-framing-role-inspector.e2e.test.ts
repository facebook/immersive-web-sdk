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
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor framing role authoring boundary', () => {
  test('keeps framing metadata out of the human inspector while retaining agent authoring', async () => {
    harness = await createEditorTestHarness('editor-framing-role-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => editor.page.locator('[data-node-framing-role]').count())
      .toBe(0);
    const originalNodeCount = await editor.page.evaluate(
      () => (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.length,
    );

    await dispatchSceneTool(editor.page, 'scene_set_framing_role', {
      framingRole: 'support',
      nodeId: 'table-1',
    });
    await expect.poll(() => readFramingRole(editor.page)).toBe('support');
    await expect
      .poll(() => harness!.readScene())
      .toMatchObject({ nodes: [{ framingRole: 'support', id: 'table-1' }] });
    expect(
      await editor.page.evaluate(
        () => (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.length,
      ),
    ).toBe(originalNodeCount);

    await dispatchSceneTool(editor.page, 'scene_undo');
    await expect.poll(() => readFramingRole(editor.page)).toBeUndefined();

    await dispatchSceneTool(editor.page, 'scene_redo');
    await expect.poll(() => readFramingRole(editor.page)).toBe('support');

    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0]).toMatchObject({
      framingRole: 'support',
      id: 'table-1',
    });

    const reloaded = await harness.openEditor();
    await expectRealWebGLViewport(reloaded);
    await selectNode(reloaded.page, 'table-1');
    await expect
      .poll(() => reloaded.page.locator('[data-node-framing-role]').count())
      .toBe(0);
    await expect.poll(() => readFramingRole(reloaded.page)).toBe('support');
  }, 45000);
});

async function readFramingRole(page: import('playwright').Page) {
  return page.evaluate(
    () =>
      (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].framingRole,
  );
}
