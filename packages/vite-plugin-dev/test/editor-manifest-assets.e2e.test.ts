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
});
