/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  expectRealWebGLViewport,
  MANAGED_WORKSPACE_HEADERS,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor WebGL render proof', () => {
  test('renders manifest assets in an IWSDK-owned WebGL viewport', async () => {
    harness = await createEditorTestHarness('editor-webgl-render-proof');
    const editor = await harness.openEditor();
    const proof = await expectRealWebGLViewport(editor);
    const editorCanvasWidth = proof.canvasWidth;

    expect(proof.webglContextType).toMatch(/WebGL/i);
    expect(proof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'table',
          nodeId: 'table-1',
          parentNodeId: null,
        }),
      ]),
    );
    expect(
      editor.responses.some(
        (response) =>
          response.status >= 200 &&
          response.status < 300 &&
          response.url.includes('/assets/table.gltf'),
      ),
    ).toBe(true);

    expect(
      await editor.page
        .locator('html')
        .getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');

    await editor.page.locator('[data-workspace-view-button="runtime"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () => document.documentElement.dataset.iwsdkWorkspaceView,
        ),
      )
      .toBe('runtime');
    await expect
      .poll(() =>
        editor.page
          .frameLocator('#workspace-runtime-frame')
          .locator('#app-status')
          .textContent(),
      )
      .toBe('1 nodes');

    await expect
      .poll(() =>
        editor.page
          .locator('[data-workspace-view-button]')
          .evaluateAll((buttons) =>
            buttons.map((button) =>
              button.getAttribute('data-workspace-view-button'),
            ),
          ),
      )
      .toEqual(['runtime', 'editor']);

    await editor.page.locator('[data-workspace-view-button="editor"]').click();
    await expect
      .poll(() =>
        editor.page
          .locator('#scene-canvas')
          .evaluate((canvas) => canvas.clientWidth),
      )
      .toBe(editorCanvasWidth);
  }, 15000);

  test('auto-opens the only scene and keeps ordinary app tabs unwrapped', async () => {
    harness = await createEditorTestHarness('editor-scene-picker');
    const context = await harness.browser.newContext({
      extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS,
      ignoreHTTPSErrors: true,
      viewport: { height: 720, width: 960 },
    });
    const page = await context.newPage();

    await page.goto(harness.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      Boolean((window as any).IWSDK_SCENE_EDITOR),
    );
    expect(page.url()).toBe(harness.baseUrl);
    await expect
      .poll(() =>
        page.locator('html').getAttribute('data-iwsdk-workspace-view'),
      )
      .toBe('runtime');

    await page.locator('[data-workspace-view-button="editor"]').click();
    await page.waitForURL(/#editor\/editor-smoke\.iwsdk\.scene\.json$/u);
    await expect
      .poll(() => page.locator('.scene-picker-dialog').count())
      .toBe(0);
    await expect
      .poll(() => page.locator('#scene-canvas').isVisible())
      .toBe(true);

    const ordinaryApp = await harness.openApp();
    expect(ordinaryApp.page.url()).toBe(harness.baseUrl);
    expect(
      await ordinaryApp.page.evaluate(
        () => (window as any).__IWSDK_EDITOR_CONFIG == null,
      ),
    ).toBe(true);
    await context.close();
  }, 15000);
});
