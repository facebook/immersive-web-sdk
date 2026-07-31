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

describe('editor bottom diagnostics panel', () => {
  test('shows assets and diagnostics as lower-drawer tabs', async () => {
    harness = await createEditorTestHarness('editor-bottom-panel');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await expect
      .poll(() =>
        editor.page
          .locator('[data-bottom-tab]')
          .evaluateAll((tabs) =>
            tabs.map((tab) => tab.getAttribute('data-bottom-tab')),
          ),
      )
      .toEqual(['assets', 'console', 'validation']);

    await expect
      .poll(() =>
        editor.page
          .locator('#editor-bottom-panel')
          .getAttribute('data-active-tab'),
      )
      .toBe('assets');
    await expect
      .poll(() => editor.page.locator('#assets-panel').isVisible())
      .toBe(true);
    await editor.page.locator('[data-bottom-tab="console"]').click();
    await expect
      .poll(() =>
        editor.page
          .locator('#editor-bottom-panel')
          .getAttribute('data-active-tab'),
      )
      .toBe('console');
    await expect
      .poll(() => editor.page.locator('[data-diagnostic-log]').count())
      .toBeGreaterThan(0);
    await expect
      .poll(() => editor.page.locator('#bottom-panel-content').textContent())
      .toContain('Scene editor document loaded');

    await expect(
      dispatchSceneTool(editor.page, 'scene_select', {
        nodeIds: ['table-1'],
      }),
    ).resolves.toMatchObject({ nodeIds: ['table-1'] });
    await expect
      .poll(() => editor.page.locator('#bottom-panel-content').textContent())
      .toContain('Selected 1 node(s)');

    await editor.page.locator('[data-bottom-tab="validation"]').click();
    await expect
      .poll(() => editor.page.locator('#bottom-panel-content').textContent())
      .toContain('No validation result yet');

    await expect(
      dispatchSceneTool(editor.page, 'scene_validate'),
    ).resolves.toMatchObject({ valid: true });
    await expect
      .poll(() =>
        editor.page
          .locator('[data-diagnostic-validation="valid"]')
          .textContent(),
      )
      .toContain('Scene validation passed');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-bottom-tab="validation"]')
          .evaluate((tab) => tab.hasAttribute('data-active')),
      )
      .toBe(true);

    const invalidResult = await dispatchSceneTool(
      editor.page,
      'scene_add_node',
      {
        node: {
          components: { MissingComponent: {} },
          id: 'invalid-node',
        },
      },
    );
    expect(invalidResult).toMatchObject({ valid: false });
    await expect
      .poll(() => editor.page.locator('#bottom-panel-content').textContent())
      .toContain(
        'Fix: Register "MissingComponent" in the application component manifest',
      );
    const issue = editor.page.locator(
      '[data-validation-node-id="invalid-node"]',
    );
    await expect.poll(() => issue.count()).toBe(1);
    await issue.click();
    await expect
      .poll(() =>
        editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_SELECTION),
      )
      .toEqual(['invalid-node']);

    await expect
      .poll(() => editor.page.locator('[data-bottom-tab="events"]').count())
      .toBe(0);
  }, 45000);
});
