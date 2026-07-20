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
  MANAGED_WORKSPACE_HEADERS,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor WebGL render proof', () => {
  test('rejects placeholder renderers and proves IWSDK WebGL scene ownership', async () => {
    harness = await createEditorTestHarness('editor-webgl-render-proof');
    const editor = await harness.openEditor();
    const proof = await expectRealWebGLViewport(editor);
    const editorCanvasWidth = proof.canvasWidth;

    expect(proof.webglContextType).toMatch(/WebGL/i);
    await expect
      .poll(() => getEditorProof(editor.page).then((entry) => entry.assetLoads))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'table',
            status: 'loaded',
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
    expect(proof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'table-1',
          parentNodeId: null,
        }),
      ]),
    );

    await expect
      .poll(() => dispatchSceneTool(editor.page, 'workspace_get_state'))
      .toMatchObject({
        editor: {
          dirty: false,
          pageId: expect.stringMatching(/:editor$/),
          ready: true,
          scenePath: 'public/scenes/editor-smoke.iwsdk.scene.json',
          sceneSessionId: expect.any(String),
        },
        managed: true,
        runtime: {
          pageId: expect.stringMatching(/:runtime$/),
        },
        view: 'editor',
        workspace: {
          pageId: expect.any(String),
          tabGeneration: expect.any(Number),
        },
      });

    const sceneFiles = await dispatchSceneTool(editor.page, 'scene_list_files');
    expect(sceneFiles).toMatchObject({
      files: [
        expect.objectContaining({
          path: 'public/scenes/editor-smoke.iwsdk.scene.json',
        }),
      ],
    });

    const createdScene = await dispatchSceneTool(editor.page, 'scene_create', {
      open: false,
      path: 'public/scenes/created-from-workspace.iwsdk.scene.json',
    });
    expect(createdScene).toMatchObject({
      opened: false,
      path: 'public/scenes/created-from-workspace.iwsdk.scene.json',
      previousRevision: 'missing',
      revision: expect.any(String),
      writtenRevision: expect.any(String),
    });
    await expect
      .poll(() => dispatchSceneTool(editor.page, 'scene_list_files'))
      .toMatchObject({
        files: expect.arrayContaining([
          expect.objectContaining({
            path: 'public/scenes/created-from-workspace.iwsdk.scene.json',
          }),
        ]),
      });

    await dispatchSceneTool(editor.page, 'workspace_set_view', {
      view: 'runtime',
    });
    await expect
      .poll(() =>
        editor.page.evaluate(
          () => document.documentElement.dataset.iwsdkWorkspaceView,
        ),
      )
      .toBe('runtime');
    expect(await isVisible(editor.page, '#workspace-runtime-frame')).toBe(true);
    expect(await isVisible(editor.page, '[data-workspace-editor-pane]')).toBe(
      false,
    );

    await dispatchSceneTool(editor.page, 'workspace_set_view', {
      view: 'split',
    });
    await expect
      .poll(() =>
        editor.page.evaluate(
          () => document.documentElement.dataset.iwsdkWorkspaceView,
        ),
      )
      .toBe('split');
    expect(await isVisible(editor.page, '#workspace-runtime-frame')).toBe(true);
    expect(await isVisible(editor.page, '[data-workspace-editor-pane]')).toBe(
      true,
    );
    await expect
      .poll(() =>
        getEditorProof(editor.page).then((entry) => entry.canvasWidth),
      )
      .toBeLessThan(editorCanvasWidth - 100);
    const splitCanvasWidth = (await getEditorProof(editor.page)).canvasWidth;

    await dispatchSceneTool(editor.page, 'workspace_set_view', {
      view: 'editor',
    });
    await expect
      .poll(() =>
        getEditorProof(editor.page).then((entry) => entry.canvasWidth),
      )
      .toBeGreaterThan(splitCanvasWidth + 100);

    await expect(
      dispatchSceneTool(editor.page, 'workspace_open_scene', {
        path: 'public/scenes/editor-smoke.iwsdk.scene.json',
      }),
    ).resolves.toMatchObject({
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
      revision: expect.any(String),
      reloading: true,
    });
  }, 15000);

  test('shows scene picker and supports headless scene file tools without a scene target', async () => {
    harness = await createEditorTestHarness('editor-scene-picker');
    const context = await harness.browser.newContext({
      extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS,
      viewport: { height: 720, width: 960 },
    });
    const page = await context.newPage();

    await page.goto(`${harness.baseUrl}__iwsdk/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await expect
      .poll(() => page.locator('.scene-picker-dialog h1').textContent())
      .toBe('Open Scene');

    const state = await dispatchSceneTool(page, 'workspace_get_state');
    expect(state).toMatchObject({
      editor: {
        ready: false,
        scenePath: null,
      },
      managed: true,
      view: 'editor',
    });

    const files = await dispatchSceneTool(page, 'scene_list_files');
    expect(files).toMatchObject({
      files: [
        expect.objectContaining({
          path: 'public/scenes/editor-smoke.iwsdk.scene.json',
        }),
      ],
    });

    const created = await dispatchSceneTool(page, 'scene_create', {
      open: false,
      path: 'public/scenes/from-picker.iwsdk.scene.json',
    });
    expect(created).toMatchObject({
      opened: false,
      path: 'public/scenes/from-picker.iwsdk.scene.json',
      previousRevision: 'missing',
      revision: expect.any(String),
      writtenRevision: expect.any(String),
    });

    await page
      .locator('input[name="path"]')
      .fill('public/scenes/from-picker-ui.iwsdk.scene.json');
    await page.locator('#scene-picker-create button[type="submit"]').click();
    await page.waitForURL(/from-picker-ui\.iwsdk\.scene\.json/, {
      timeout: 10000,
    });
    await expect
      .poll(() => dispatchSceneTool(page, 'workspace_get_state'))
      .toMatchObject({
        editor: {
          ready: true,
          scenePath: 'public/scenes/from-picker-ui.iwsdk.scene.json',
        },
      });
  }, 15000);
});

async function isVisible(
  page: { locator(selector: string): any },
  selector: string,
) {
  return page.locator(selector).evaluate((element: Element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  });
}
