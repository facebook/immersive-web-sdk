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
  hashImageData,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor agent tools render proof', () => {
  test('composes, inspects, screenshots, validates, and saves through scene tools only', async () => {
    harness = await createEditorTestHarness('editor-agent-tools');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await expect(
      dispatchSceneTool(editor.page, 'scene_list_assets'),
    ).resolves.toMatchObject({
      assets: expect.arrayContaining([
        expect.objectContaining({ id: 'table' }),
        expect.objectContaining({ id: 'vase' }),
      ]),
    });

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        asset: 'vase',
        id: 'vase-1',
        transform: { position: [0.25, 0, 0] },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_place_on', {
      align: 'preserve-xz',
      nodeId: 'vase-1',
      targetId: 'table-1',
    });
    await dispatchSceneTool(editor.page, 'scene_look_at', {
      nodeId: 'vase-1',
      target: [1, 0.5, 0],
    });

    await expect(
      dispatchSceneTool(editor.page, 'scene_get_hierarchy'),
    ).resolves.toMatchObject({
      hierarchy: [
        expect.objectContaining({ id: 'table-1' }),
        expect.objectContaining({ id: 'vase-1' }),
      ],
    });

    const screenshots = await Promise.all(
      ['top', 'front', 'quarter'].map((view) =>
        dispatchSceneTool(editor.page, 'scene_screenshot', {
          height: 240,
          view,
          width: 320,
        }),
      ),
    );
    expect(screenshots).toHaveLength(3);
    expect(
      new Set(screenshots.map((entry) => hashImageData(entry.imageData))).size,
    ).toBe(3);

    await expect(
      dispatchSceneTool(editor.page, 'scene_validate'),
    ).resolves.toMatchObject({
      valid: true,
    });
    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({
      dirty: false,
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
    });

    const savedScene = await harness.readScene();
    expect(savedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'vase-1',
    ]);
    expect(savedScene.nodes[1].transform).toMatchObject({
      position: [0.25, 0.5, 0],
    });

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect(
      dispatchSceneTool(reloadedEditor.page, 'scene_get_hierarchy'),
    ).resolves.toMatchObject({
      hierarchy: [
        expect.objectContaining({ id: 'table-1' }),
        expect.objectContaining({ id: 'vase-1' }),
      ],
    });

    const app = await harness.openApp();
    const appProof = await app.page.evaluate(
      () => (window as any).__APP_RUNTIME_PROOF,
    );
    expect(appProof).toMatchObject({
      nodeCount: 2,
      renderer: 'iwsdk-webgl',
      webgl: true,
    });
    expect(appProof.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'table-1' }),
        expect.objectContaining({
          id: 'vase-1',
          position: [0.25, 0.5, 0],
        }),
      ]),
    );
    expect(app.errors()).toEqual([]);
  }, 45000);
});
