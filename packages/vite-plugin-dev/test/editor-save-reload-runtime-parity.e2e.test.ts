/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { writeFile } from 'fs/promises';
import type { Frame, Page } from 'playwright';
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

async function workspaceRuntimeFrame(page: Page): Promise<Frame> {
  const frameElement = await page.waitForSelector('#workspace-runtime-frame');
  const frame = await frameElement.contentFrame();
  if (!frame) {
    throw new Error('Workspace runtime iframe is not attached');
  }
  return frame;
}

async function runtimeFrameNodePosition(
  page: Page,
  nodeId: string,
): Promise<number[] | null> {
  const frame = await workspaceRuntimeFrame(page);
  return frame.evaluate((id) => {
    const proof = (window as any).__APP_RUNTIME_PROOF;
    const node = proof?.nodes?.find((entry: any) => entry.id === id);
    return node?.position ?? null;
  }, nodeId);
}

describe('editor save/reload runtime parity', () => {
  test('blocks invalid scene saves from the editor UI without writing to disk', async () => {
    harness = await createEditorTestHarness('editor-invalid-save');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    const sceneBefore = await harness.readScene();

    await dispatchSceneTool(editor.page, 'scene_apply_patch', {
      patch: {
        component: 'TestInspectable',
        nodeId: 'table-1',
        op: 'updateComponent',
        value: {
          props: {
            enabled: 'yes',
            label: 'schema-invalid',
            offset: [0, 0, 0],
            strength: 0.5,
          },
          type: 'TestInspectable',
        },
      },
    });
    await expect
      .poll(() => editor.page.locator('#dirty-status').textContent())
      .toBe('Unsaved changes');

    await editor.page.locator('#save').click();
    await expect
      .poll(() => editor.page.locator('#editor-status-strip').textContent())
      .toContain('Cannot save invalid scene');
    await expect
      .poll(() => editor.page.locator('#editor-status-strip').textContent())
      .toContain('component field "enabled" must be a boolean');
    expect(await harness.readScene()).toEqual(sceneBefore);
  }, 45000);

  test('blocks overwriting externally modified scene files and shows a conflict dialog', async () => {
    harness = await createEditorTestHarness('editor-save-conflict');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_set_transform', {
      nodeId: 'table-1',
      transform: { position: [0.25, 0, 0.1] },
    });

    await writeFile(
      harness.scenePath,
      JSON.stringify(
        {
          ...(await harness.readScene()),
          nodes: [
            {
              asset: 'table',
              id: 'external-table',
              transform: { position: [-0.3, 0, 0.2] },
            },
            {
              asset: 'vase',
              id: 'external-vase',
              transform: { position: [-0.3, 0.55, 0.2] },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const toolConflict = await editor.page.evaluate(async () => {
      try {
        await (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
          'scene_save',
          {},
        );
        return { ok: true };
      } catch (error) {
        return {
          code: (error as any)?.code,
          currentRevision: (error as any)?.currentRevision,
          expectedRevision: (error as any)?.expectedRevision,
          message: (error as Error)?.message,
          ok: false,
          path: (error as any)?.path,
        };
      }
    });
    expect(toolConflict).toMatchObject({
      code: 'scene_revision_conflict',
      message: 'Scene file changed on disk.',
      ok: false,
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
    });
    expect(toolConflict.currentRevision).toEqual(expect.any(String));
    expect(toolConflict.expectedRevision).toEqual(expect.any(String));
    expect(toolConflict.currentRevision).not.toBe(
      toolConflict.expectedRevision,
    );

    await editor.page.locator('#save').click();
    await expect
      .poll(() =>
        editor.page.locator('#scene-save-conflict-dialog').textContent(),
      )
      .toContain('Scene Changed On Disk');
    await expect
      .poll(() => editor.page.locator('#editor-status-strip').textContent())
      .toBe('Conflict | Scene file changed on disk');

    expect(
      (await harness.readScene()).nodes.map((node: any) => node.id),
    ).toEqual(['external-table', 'external-vase']);
  }, 45000);

  test('autosaves scene edits and reloads matching editor and app runtime objects', async () => {
    harness = await createEditorTestHarness('editor-save-reload');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await dispatchSceneTool(editor.page, 'workspace_set_view', {
      view: 'split',
    });
    await expect
      .poll(() => runtimeFrameNodePosition(editor.page, 'table-1'))
      .toEqual([0, 0, 0]);

    const transformResult = await dispatchSceneTool(
      editor.page,
      'scene_set_transform',
      {
        nodeId: 'table-1',
        transform: {
          position: [0.4, 0, -0.25],
          rotationDeg: [0, 20, 0],
          scale: 1.1,
        },
      },
    );
    expect(transformResult).toMatchObject({
      action: 'transformUpdated',
      dirty: false,
    });
    const addNodeResult = await dispatchSceneTool(
      editor.page,
      'scene_add_node',
      {
        node: {
          asset: 'vase',
          id: 'vase-1',
          transform: { position: [0.4, 0.55, -0.25] },
        },
      },
    );
    expect(addNodeResult).toMatchObject({
      action: 'nodeAdded',
      dirty: false,
    });
    await expect
      .poll(() => editor.page.locator('#dirty-status').textContent())
      .toBe('Saved');
    await expect
      .poll(() => runtimeFrameNodePosition(editor.page, 'table-1'))
      .toEqual([0.4, 0, -0.25]);
    await expect
      .poll(() => runtimeFrameNodePosition(editor.page, 'vase-1'))
      .toEqual([0.4, 0.55, -0.25]);

    const savedScene = await harness.readScene();
    expect(savedScene.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'table-1',
          transform: {
            position: [0.4, 0, -0.25],
            rotationDeg: [0, 20, 0],
            scale: 1.1,
          },
        }),
        expect.objectContaining({
          id: 'vase-1',
          transform: { position: [0.4, 0.55, -0.25] },
        }),
      ]),
    );

    const reloadedEditor = await harness.openEditor();
    const reloadedProof = await expectRealWebGLViewport(reloadedEditor);
    expect(reloadedProof.nodeObjectCount).toBe(2);
    expect(reloadedProof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'table-1' }),
        expect.objectContaining({ nodeId: 'vase-1' }),
      ]),
    );

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
        expect.objectContaining({
          id: 'table-1',
          position: [0.4, 0, -0.25],
        }),
        expect.objectContaining({
          id: 'vase-1',
          position: [0.4, 0.55, -0.25],
        }),
      ]),
    );
    const appCanvasLength = await app.page
      .locator('#app-canvas')
      .evaluate((canvas) =>
        canvas instanceof HTMLCanvasElement
          ? canvas.toDataURL('image/png').length
          : 0,
      );
    expect(appCanvasLength).toBeGreaterThan(1000);
    expect(app.errors()).toEqual([]);
  }, 45000);
});
