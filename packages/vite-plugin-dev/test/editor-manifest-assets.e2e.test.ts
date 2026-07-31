/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
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

describe('editor manifest assets', () => {
  test('shares URL and procedural assets between runtime and editor worlds', async () => {
    harness = await createEditorTestHarness('editor-manifest-assets');

    const app = await harness.openApp();
    const runtimeProof = await app.page.evaluate(
      () => (window as any).__APP_RUNTIME_PROOF,
    );
    expect(runtimeProof.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: 'table', id: 'table-1' }),
      ]),
    );
    expect(app.errors()).toEqual([]);

    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await editor.page.locator('[data-bottom-tab="assets"]').click();
    const catalog = editor.page.locator('#asset-catalog');
    await expect.poll(() => catalog.textContent()).toContain('Table');
    expect(await catalog.textContent()).toContain('Vase');
    expect(await catalog.textContent()).toContain('Procedural plinth');

    await catalog.locator('[data-add-asset="procedural-plinth"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.find(
            (node: any) => node.content?.asset === 'procedural-plinth',
          ),
        ),
      )
      .toMatchObject({
        content: { asset: 'procedural-plinth', type: 'asset' },
      });
    expect(editor.errors()).toEqual([]);
  }, 30000);

  test('refreshes same-URL UIKitML in repeated detached scene renders', async () => {
    harness = await createEditorTestHarness('editor-uikitml-refresh');
    const scene = await harness.readScene();
    scene.nodes.push({
      content: { asset: 'welcome-panel', type: 'asset' },
      id: 'welcome-panel-1',
      transform: { position: [0, 1.25, 0.4], scale: 0.75 },
    });
    await writeFile(harness.scenePath, JSON.stringify(scene, null, 2), 'utf8');

    const editor = await harness.openEditor();
    const before = await dispatchSceneTool(editor.page, 'scene_render_file', {
      height: 720,
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
      view: 'front',
      width: 960,
    });

    await writeFile(
      path.join(harness.tempRoot, 'public', 'ui', 'welcome.uikitml'),
      `<style>
  .panel { flex-direction: column; padding: 18px; width: 240px; background-color: #35204f; border-radius: 14px; }
  .title { color: #ffd166; font-size: 24px; font-weight: 700; margin-bottom: 8px; }
  .body { color: #f8e8ff; font-size: 14px; }
</style>
<div class="panel">
  <div id="title" class="title">Refreshed panel</div>
  <div class="body">Same URL, newly rendered source.</div>
</div>`,
      'utf8',
    );

    const after = await dispatchSceneTool(editor.page, 'scene_render_file', {
      height: 720,
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
      view: 'front',
      width: 960,
    });

    expect(before.valid).toBe(true);
    expect(after.valid).toBe(true);
    expect(after.sourceDocumentHash).toBe(before.sourceDocumentHash);
    expect(after.screenshotSha256).not.toBe(before.screenshotSha256);
    expect(editor.errors()).toEqual([]);
  }, 30000);
});
