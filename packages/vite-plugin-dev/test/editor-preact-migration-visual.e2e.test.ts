/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir } from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor Preact migration visual contract', () => {
  test.skipIf(!process.env.IWSDK_VISUAL_OUTPUT_DIRECTORY)(
    'captures stable runtime, root, node, and component picker views',
    async () => {
      const outputDirectory = process.env.IWSDK_VISUAL_OUTPUT_DIRECTORY;
      await mkdir(outputDirectory!, { recursive: true });

      harness = await createEditorTestHarness('editor-preact-migration-visual');
      const editor = await harness.openEditor();
      const page = editor.page;

      await expect.poll(() => page.title()).toContain('IWSDK Scene Editor');
      const root = page.locator('#scene-root-drop-target');
      await expect.poll(() => root.getAttribute('data-active')).not.toBeNull();
      await expect
        .poll(() => root.locator('[data-scene-root-disclosure]').count())
        .toBe(0);
      await expect
        .poll(() => page.locator('[data-scene-root-inspector]').count())
        .toBe(1);

      const alignment = await page.evaluate(() => {
        const rootIcon = document.querySelector(
          '#scene-root-drop-target .node-row-icon',
        );
        const topLevelCaret = document.querySelector(
          '#outliner > .node-row .node-row-caret',
        );
        if (
          !(rootIcon instanceof HTMLElement) ||
          !(topLevelCaret instanceof HTMLElement)
        ) {
          return null;
        }
        return {
          rootIconLeft: rootIcon.getBoundingClientRect().left,
          topLevelCaretLeft: topLevelCaret.getBoundingClientRect().left,
        };
      });
      expect(alignment).not.toBeNull();
      expect(alignment!.rootIconLeft).toBeCloseTo(
        alignment!.topLevelCaretLeft,
        0,
      );

      await page.screenshot({
        path: path.join(outputDirectory!, 'editor-root-960x720.png'),
      });

      await page.locator('[data-node-id="table-1"]').click();
      await expect
        .poll(() =>
          page.locator('[data-node-id="table-1"]').getAttribute('data-active'),
        )
        .not.toBeNull();
      await page.screenshot({
        path: path.join(outputDirectory!, 'editor-node-960x720.png'),
      });

      await page.locator('[data-transform-field="position.0"]').hover();
      await page.screenshot({
        path: path.join(outputDirectory!, 'editor-number-hover-960x720.png'),
      });

      await page.locator('#add-component').click();
      await expect
        .poll(() =>
          page.locator('#component-picker-dialog').getAttribute('open'),
        )
        .not.toBeNull();
      await expect
        .poll(() =>
          page
            .locator('[data-component-picker-option="AudioSource"] strong')
            .textContent(),
        )
        .toBe('AudioSource');
      await page.screenshot({
        path: path.join(
          outputDirectory!,
          'editor-component-picker-960x720.png',
        ),
      });
      await page.locator('[data-close-component-picker]').click();

      await page.locator('[data-workspace-view-button="runtime"]').click();
      await expect.poll(() => page.title()).toBe('IWSDK Runtime');
      await expect
        .poll(() =>
          page
            .frameLocator('#workspace-runtime-frame')
            .locator('#app-status')
            .textContent(),
        )
        .toMatch(/^\d+ nodes$/u);
      await page.screenshot({
        path: path.join(outputDirectory!, 'runtime-960x720.png'),
      });
    },
    60000,
  );
});
