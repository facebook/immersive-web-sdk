/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
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

describe('editor asset catalog', () => {
  test('filters manifest assets and adds one through the scene session', async () => {
    harness = await createEditorTestHarness('editor-asset-catalog');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await editor.page.locator('[data-bottom-tab="assets"]').click();

    await expect
      .poll(() =>
        editor.page
          .locator('#asset-catalog [data-add-asset]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-add-asset')),
          ),
      )
      .toEqual(['table', 'vase', 'procedural-plinth']);
    await expect
      .poll(() =>
        editor.page
          .locator('#asset-catalog .asset-catalog-thumb img')
          .evaluateAll((images) =>
            images.map((image) => image.getAttribute('src')),
          ),
      )
      .toEqual([
        expect.stringMatching(/^data:image\/png;base64,/u),
        expect.stringMatching(/^data:image\/png;base64,/u),
        expect.stringMatching(/^data:image\/png;base64,/u),
      ]);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-asset-id="procedural-plinth"] .asset-catalog-name')
          .textContent(),
      )
      .toBe('procedural-plinth');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-add-asset="vase"]')
          .locator('xpath=ancestor::*[contains(@class, "asset-catalog-row")]')
          .textContent(),
      )
      .toContain('gltf');

    await editor.page.locator('#asset-filter').fill('vas');
    await expect
      .poll(() =>
        editor.page
          .locator('#asset-catalog [data-add-asset]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-add-asset')),
          ),
      )
      .toEqual(['vase']);
    await editor.page.locator('#asset-filter').fill('missing');
    await expect
      .poll(() => editor.page.locator('#asset-catalog').textContent())
      .toContain('No assets found');
    await editor.page.locator('#asset-filter').fill('');

    await editor.page.locator('[data-add-asset="vase"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const documentValue = (window as any).IWSDK_SCENE_EDITOR.session
            .document;
          return {
            nodeIds: documentValue.nodes.map((node: { id: string }) => node.id),
            selected: (window as any).__IWSDK_EDITOR_SELECTION,
            status: document.querySelector('#scene-status')?.textContent,
            vaseNode: documentValue.nodes.find(
              (node: { id: string }) => node.id === 'vase-1',
            ),
          };
        }),
      )
      .toMatchObject({
        nodeIds: ['table-1', 'vase-1'],
        selected: ['vase-1'],
        status: '2 nodes, 3 assets',
        vaseNode: {
          content: { asset: 'vase', type: 'asset' },
          id: 'vase-1',
          transform: { position: expect.any(Array) },
        },
      });

    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .objectHierarchy,
        ),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId: 'vase-1',
            parentNodeId: null,
          }),
        ]),
      );

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: { asset: 'vase', type: 'asset' },
          id: 'vase-1',
        }),
      ]),
    );

    const reloadedEditor = await harness.openEditor();
    const reloadedProof = await expectRealWebGLViewport(reloadedEditor);
    expect(reloadedProof.nodeObjectCount).toBe(2);
    expect(reloadedProof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'vase-1',
        }),
      ]),
    );
  }, 15000);

  test('edits the selected node asset reference with runtime and reload parity', async () => {
    harness = await createEditorTestHarness('editor-asset-inspector');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await editor.page.locator('[data-node-id="table-1"]').click();
    await editor.page.waitForSelector('[data-node-asset-ref]', {
      timeout: 10000,
    });
    await expect
      .poll(() => editor.page.locator('[data-node-asset-ref]').inputValue())
      .toBe('table');
    await expect
      .poll(() => editor.page.locator('.asset-metadata-grid').count())
      .toBe(0);

    await editor.page.locator('[data-node-asset-ref]').selectOption('vase');
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const documentValue = (window as any).IWSDK_SCENE_EDITOR.session
            .document;
          const proof = (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
          return {
            asset: documentValue.nodes[0].content?.asset,
            dirty: document.querySelector('#dirty-status')?.textContent,
            runtimeAsset: proof.objectHierarchy.find(
              (entry: { nodeId: string }) => entry.nodeId === 'table-1',
            )?.assetId,
            selected: (window as any).__IWSDK_EDITOR_SELECTION,
          };
        }),
      )
      .toEqual({
        asset: 'vase',
        dirty: 'Saved',
        runtimeAsset: 'vase',
        selected: ['table-1'],
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0]).toMatchObject({
      content: { asset: 'vase', type: 'asset' },
      id: 'table-1',
    });

    const reloadedEditor = await harness.openEditor();
    const reloadedProof = await expectRealWebGLViewport(reloadedEditor);
    expect(reloadedProof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'vase',
          nodeId: 'table-1',
        }),
      ]),
    );
  }, 15000);

  test('does not consult or rewrite external review artifacts', async () => {
    harness = await createEditorTestHarness('editor-asset-stale-review');
    const reviewRoot = path.join(
      harness.tempRoot,
      'public/scenes/editor-smoke.iwsdk.review',
    );
    const workflowPath = path.join(
      reviewRoot,
      'workflow.iwsdk.review-workflow.json',
    );
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(
      workflowPath,
      JSON.stringify({
        contractHash: null,
        documentHash: `sha256:${'0'.repeat(64)}`,
        lockedMaxCorrectionRounds: 0,
        phase: 'manual-edit',
        round: 0,
        runtimeHash: `sha256:${'1'.repeat(64)}`,
        version: 'iwsdk.review-workflow.v1',
      }),
      'utf8',
    );

    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await editor.page.locator('[data-bottom-tab="assets"]').click();
    await editor.page.locator('[data-add-asset="vase"]').click();

    await expect
      .poll(async () => (await harness?.readScene()).nodes.length)
      .toBe(2);
    await expect
      .poll(() => editor.page.locator('#editor-status-strip').textContent())
      .not.toContain('outside the server-owned review workflow');
    const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
    expect(workflow).toMatchObject({ phase: 'manual-edit', round: 0 });
    expect(workflow.documentHash).toBe(`sha256:${'0'.repeat(64)}`);
    expect(editor.errors()).toEqual([]);
  }, 15000);
});
