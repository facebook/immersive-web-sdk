/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  addComponentViaPicker,
  createEditorTestHarness,
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

describe('editor component inspector', () => {
  test('commits typed component fields when focus leaves and removes components with a compact X button', async () => {
    harness = await createEditorTestHarness('editor-component-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => editor.page.locator('#new-component-type').count())
      .toBe(0);
    await addComponentViaPicker(editor.page, 'TestInspectable');

    const componentRow = editor.page.locator(
      '[data-component-type="TestInspectable"]',
    );
    await expect.poll(() => componentRow.count()).toBe(1);
    await expect
      .poll(() => componentRow.locator('[data-update-component]').count())
      .toBe(0);
    await expect
      .poll(() =>
        componentRow
          .locator(
            '.component-row-header [data-remove-component] > svg.lucide-icon',
          )
          .count(),
      )
      .toBe(1);

    await componentRow
      .locator('[data-component-field="label"]')
      .fill('Edited label');
    await editor.page.locator('#add-component').focus();
    await expect
      .poll(() => readComponent(editor))
      .toMatchObject({
        enabled: true,
        label: 'Edited label',
        offset: [0, 0, 0],
        strength: 0.5,
      });

    await componentRow
      .locator('[data-component-field="strength"]')
      .fill('0.75');
    await editor.page.locator('#add-component').focus();
    await expect
      .poll(async () => (await readComponent(editor)).strength)
      .toBe(0.75);

    await componentRow
      .locator(
        '[data-component-vector-field="offset"][data-component-vector-index="1"]',
      )
      .fill('1.25');
    await editor.page.locator('#add-component').focus();
    await expect
      .poll(async () => (await readComponent(editor)).offset)
      .toEqual([0, 1.25, 0]);

    await componentRow
      .locator('[data-component-field="enabled"]')
      .setChecked(false);
    await expect
      .poll(async () => (await readComponent(editor)).enabled)
      .toBe(false);

    await componentRow.locator('[data-remove-component]').click();
    await expect.poll(() => readComponent(editor)).toBeUndefined();
  }, 45000);
});

async function readComponent(editor: EditorPageContext): Promise<any> {
  return editor.page.evaluate(
    () =>
      (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].components
        ?.TestInspectable,
  );
}
