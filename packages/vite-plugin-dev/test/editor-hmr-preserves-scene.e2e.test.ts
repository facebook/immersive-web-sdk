/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  dispatchSceneTool,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor runtime HMR', () => {
  test('keeps the active scene open when application code reloads', async () => {
    harness = await createEditorTestHarness('editor-hmr-preserves-scene');
    const editor = await harness.openEditor();

    let topLevelReloaded = false;
    editor.page.on('framenavigated', (frame) => {
      if (frame === editor.page.mainFrame()) {
        topLevelReloaded = true;
      }
    });

    const initialState = await dispatchSceneTool(
      editor.page,
      'scene_get_state',
    );
    expect(initialState.editor.sceneSessionId).toEqual(expect.any(String));
    await editor.page.evaluate(() => {
      (window as any).__IWSDK_ISSUE_48_EDITOR_MARKER = 'alive';
    });

    const runtimeSourcePath = path.join(harness.tempRoot, 'src/main.js');
    const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
    await writeFile(
      runtimeSourcePath,
      `${runtimeSource}\nwindow.__IWSDK_ISSUE_48_HMR = true;\n`,
      'utf8',
    );

    await expect
      .poll(async () => {
        try {
          return Boolean(
            (await dispatchSceneTool(editor.page, 'scene_get_state')).runtime
              .stale,
          );
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(topLevelReloaded).toBe(false);
    await expect(
      editor.page.evaluate(
        () => (window as any).__IWSDK_ISSUE_48_EDITOR_MARKER,
      ),
    ).resolves.toBe('alive');
    const updatedState = await dispatchSceneTool(
      editor.page,
      'scene_get_state',
    );
    expect(updatedState.editor.sceneSessionId).toBe(
      initialState.editor.sceneSessionId,
    );
    await editor.page.waitForFunction(
      () =>
        (window as any).__IWSDK_SCENE_EDITOR_READY === true &&
        (window as any).IWSDK_SCENE_EDITOR?.session != null,
    );
    expect(new URL(editor.page.url()).hash).toBe(
      '#editor/editor-smoke.iwsdk.scene.json',
    );
    await expect
      .poll(() =>
        editor.page.locator('html').getAttribute('data-iwsdk-workspace-view'),
      )
      .toBe('editor');

    await editor.page.locator('[data-workspace-view-button="runtime"]').click();
    await editor.page.waitForFunction(() => {
      const frame = document.getElementById(
        'workspace-runtime-frame',
      ) as HTMLIFrameElement | null;
      return (frame?.contentWindow as any)?.__IWSDK_ISSUE_48_HMR === true;
    });
    await expect
      .poll(() =>
        editor.page.locator('html').getAttribute('data-iwsdk-workspace-view'),
      )
      .toBe('runtime');
    expect(editor.errors()).toEqual([]);
  }, 60000);

  test('keeps the active scene open when an imported JSON module reloads', async () => {
    harness = await createEditorTestHarness('editor-hmr-imported-json');
    const runtimeSourcePath = path.join(harness.tempRoot, 'src/main.js');
    const dataPath = path.join(harness.tempRoot, 'src/issue-48-data.json');
    const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
    await writeFile(dataPath, JSON.stringify({ marker: 'before' }), 'utf8');
    await writeFile(
      runtimeSourcePath,
      `import issue48Data from './issue-48-data.json';
${runtimeSource}
window.__IWSDK_ISSUE_48_JSON = issue48Data.marker;
`,
      'utf8',
    );
    const editor = await harness.openEditor();

    let topLevelReloaded = false;
    editor.page.on('framenavigated', (frame) => {
      if (frame === editor.page.mainFrame()) {
        topLevelReloaded = true;
      }
    });
    const initialState = await dispatchSceneTool(
      editor.page,
      'scene_get_state',
    );
    expect(initialState.editor.sceneSessionId).toEqual(expect.any(String));
    await editor.page.evaluate(() => {
      (window as any).__IWSDK_ISSUE_48_EDITOR_MARKER = 'alive';
    });

    await writeFile(dataPath, JSON.stringify({ marker: 'after' }), 'utf8');

    await expect
      .poll(async () => {
        try {
          return Boolean(
            (await dispatchSceneTool(editor.page, 'scene_get_state')).runtime
              .stale,
          );
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(topLevelReloaded).toBe(false);
    await expect(
      editor.page.evaluate(
        () => (window as any).__IWSDK_ISSUE_48_EDITOR_MARKER,
      ),
    ).resolves.toBe('alive');
    const updatedState = await dispatchSceneTool(
      editor.page,
      'scene_get_state',
    );
    expect(updatedState.editor.sceneSessionId).toBe(
      initialState.editor.sceneSessionId,
    );

    await editor.page.locator('[data-workspace-view-button="runtime"]').click();
    await editor.page.waitForFunction(() => {
      const frame = document.getElementById(
        'workspace-runtime-frame',
      ) as HTMLIFrameElement | null;
      return (frame?.contentWindow as any)?.__IWSDK_ISSUE_48_JSON === 'after';
    });
    await expect
      .poll(() =>
        editor.page.locator('html').getAttribute('data-iwsdk-workspace-view'),
      )
      .toBe('runtime');
    expect(editor.errors()).toEqual([]);
  }, 60000);
});
