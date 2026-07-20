/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { writeFile } from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  MANAGED_WORKSPACE_HEADERS,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor startup failure diagnostics', () => {
  test('shows an explicit error instead of falling back to a fake ready viewport', async () => {
    harness = await createEditorTestHarness('editor-startup-failure');
    const scenePath = 'public/scenes/malformed.iwsdk.scene.json';
    await writeFile(
      path.join(harness.tempRoot, scenePath),
      '{ "version": "iwsdk.scene.v1", "nodes": [',
      'utf8',
    );

    const context = await harness.browser.newContext({
      extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS,
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(`${harness.baseUrl}__iwsdk/workspace?scene=${scenePath}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() => page.locator('.editor-error h1').textContent())
      .toBe('IWSDK Scene Editor');
    await expect
      .poll(() => page.locator('.editor-error pre').textContent())
      .toMatch(/JSON|Unexpected|parse/i);
    await expect.poll(() => page.locator('#scene-canvas').count()).toBe(0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          hasEditor: Boolean((window as any).IWSDK_SCENE_EDITOR),
          hasHooks: Boolean((window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS),
        })),
      )
      .toEqual({
        hasEditor: false,
        hasHooks: false,
      });
    expect(consoleErrors.join('\n')).toContain(
      '[IWSDK Scene Editor] Failed to initialize:',
    );
  }, 45000);
});
