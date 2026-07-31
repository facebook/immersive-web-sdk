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
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor preview visibility', () => {
  test('isolates groups with stage context without changing scene identity', async () => {
    harness = await createEditorTestHarness('editor-preview-visibility');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        children: [
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'stage-prop',
            transform: { position: [-0.5, 0, 0] },
          },
        ],
        framingRole: 'support',
        id: 'stage-group',
        name: 'Room stage',
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        children: [
          {
            content: { asset: 'vase', type: 'asset' },
            id: 'focus-prop',
            transform: { position: [0.5, 0, 0] },
          },
        ],
        id: 'focus-group',
        name: 'Focus object',
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'other-prop',
        transform: { position: [1, 0, 0] },
      },
    });

    const before = await dispatchSceneTool(editor.page, 'scene_get_document');
    const isolated = await dispatchSceneTool(
      editor.page,
      'scene_set_preview_visibility',
      { mode: 'solo', nodeIds: ['focus-group'] },
    );
    expect(isolated).toMatchObject({
      action: 'previewVisibilityUpdated',
      documentHash: before.documentHash,
      runtimeHash: before.runtimeHash,
      previewState: { soloNodeId: 'focus-group' },
    });
    const isolatedState = await previewState(editor.page);
    expect(isolatedState.objects).toMatchObject({
      'focus-group': { visible: true },
      'focus-prop': { visible: true },
      'stage-group': { visible: true },
      'stage-prop': { visible: true },
      'other-prop': { visible: false },
    });

    await dispatchSceneTool(editor.page, 'scene_set_preview_visibility', {
      mode: 'hide',
      nodeIds: ['focus-group'],
    });
    expect((await previewState(editor.page)).objects).toMatchObject({
      'focus-group': { visible: false },
      'focus-prop': { visible: false },
      'stage-group': { visible: true },
    });

    await dispatchSceneTool(editor.page, 'scene_set_preview_visibility', {
      mode: 'save-arrangement',
      name: 'Focused',
    });
    await dispatchSceneTool(editor.page, 'scene_set_preview_visibility', {
      mode: 'reset',
    });
    await dispatchSceneTool(editor.page, 'scene_select', { nodeIds: [] });
    expect((await previewState(editor.page)).objects['other-prop']).toEqual({
      visible: true,
    });
    await dispatchSceneTool(editor.page, 'scene_set_preview_visibility', {
      mode: 'apply-arrangement',
      name: 'Focused',
    });
    expect(await previewState(editor.page)).toMatchObject({
      hiddenNodeIds: ['focus-group'],
      soloNodeId: 'focus-group',
    });

    const after = await dispatchSceneTool(editor.page, 'scene_get_document');
    expect(after.documentHash).toBe(before.documentHash);
    expect(after.runtimeHash).toBe(before.runtimeHash);
    expect((await harness.readScene()).authoring?.visibility).toBeUndefined();
  }, 60000);

  test('exposes visibility controls and raycasts only for deliberate picking', async () => {
    harness = await createEditorTestHarness('editor-preview-controls');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await editor.page.locator('[data-node-id="table-1"]').click({
      button: 'right',
    });
    await expect
      .poll(() =>
        editor.page
          .locator('[data-scene-graph-action="toggle-context"]')
          .count(),
      )
      .toBe(0);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-scene-graph-action="toggle-solo"]')
          .isVisible(),
      )
      .toBe(true);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-scene-graph-action="toggle-lock"]')
          .isVisible(),
      )
      .toBe(true);
    await editor.page.keyboard.press('Escape');
    await editor.page.locator('[data-preview-visibility-toggle]').click();
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="table-1"]')
          .getAttribute('data-preview-hidden'),
      )
      .not.toBeNull();
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="table-1"] .node-row-preview-state')
          .count(),
      )
      .toBe(0);

    await dispatchSceneTool(editor.page, 'scene_set_preview_visibility', {
      mode: 'reset',
    });
    const canvas = editor.page.locator('#scene-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const beforeMoves = (await previewState(editor.page)).raycastCount;
    for (let index = 0; index < 20; index += 1) {
      await editor.page.mouse.move(
        box!.x + 20 + index * 3,
        box!.y + 20 + index * 2,
      );
    }
    expect((await previewState(editor.page)).raycastCount).toBe(beforeMoves);
    // Existing selection E2E coverage proves deliberate clicks pick objects.
    // This regression is specifically for the expensive passive-hover path.
    expect((await previewState(editor.page)).raycastCount).toBe(beforeMoves);
  }, 60000);
});

async function previewState(page: any): Promise<any> {
  return page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPreviewVisibilityState(),
  );
}
