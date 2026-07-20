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
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor asset catalog', () => {
  test('filters catalog assets and adds a rendered node through the scene session', async () => {
    harness = await createEditorTestHarness('editor-asset-catalog');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await expect
      .poll(() =>
        editor.page
          .locator('#asset-catalog [data-asset-id]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-asset-id')),
          ),
      )
      .toEqual(['table', 'vase']);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-asset-id="vase"] .asset-catalog-meta')
          .textContent(),
      )
      .toContain('gltf');

    await editor.page.locator('#asset-catalog-filter').fill('vas');
    await expect
      .poll(() =>
        editor.page
          .locator('#asset-catalog [data-asset-id]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-asset-id')),
          ),
      )
      .toEqual(['vase']);
    await editor.page.locator('#asset-catalog-filter').fill('missing');
    await expect
      .poll(() => editor.page.locator('[data-empty-assets]').textContent())
      .toBe('No matching assets');
    await editor.page.locator('#asset-catalog-filter').fill('');

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
        status: '2 nodes, 2 assets',
        vaseNode: {
          asset: 'vase',
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
        expect.objectContaining({ asset: 'vase', id: 'vase-1' }),
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

  test('places added catalog assets on the selected support when surface placement is enabled', async () => {
    harness = await createEditorTestHarness('editor-asset-surface-placement');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await editor.page.locator('[data-node-id="table-1"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_SELECTION),
      )
      .toEqual(['table-1']);

    await editor.page.locator('[data-surface-placement]').click();
    await expect
      .poll(() =>
        editor.page
          .locator('[data-surface-placement]')
          .evaluate((button) => button.hasAttribute('data-active')),
      )
      .toBe(true);
    await expect
      .poll(() => getEditorProof(editor.page))
      .toMatchObject({
        surfacePlacement: {
          enabled: true,
          targetNodeId: 'table-1',
        },
      });

    await editor.page.locator('[data-add-asset="vase"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const documentValue = (window as any).IWSDK_SCENE_EDITOR.session
            .document;
          const vase = documentValue.nodes.find(
            (node: { id: string }) => node.id === 'vase-1',
          );
          const proof = (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
          return {
            events: ((window as any).__IWSDK_EDITOR_EVENTS || []).map(
              (event: { method: string }) => event.method,
            ),
            nodeIds: documentValue.nodes.map((node: { id: string }) => node.id),
            persistedPlaceOn: Boolean(vase?.transform?.placeOn),
            selected: (window as any).__IWSDK_EDITOR_SELECTION,
            surfacePlacement: proof.surfacePlacement,
            vasePosition: vase?.transform?.position,
          };
        }),
      )
      .toMatchObject({
        events: expect.arrayContaining(['scene_add_node', 'scene_place_on']),
        nodeIds: ['table-1', 'vase-1'],
        persistedPlaceOn: false,
        selected: ['vase-1'],
        surfacePlacement: {
          enabled: true,
          lastTargetNodeId: 'table-1',
          targetNodeId: 'table-1',
        },
        vasePosition: [0, 0.5, 0],
      });

    const proof = await getEditorProof(editor.page);
    expect(proof.objectHierarchy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'vase-1',
          parentNodeId: null,
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
      .poll(() => editor.page.locator('.asset-metadata-grid').textContent())
      .toContain('/assets/table.gltf');

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
            asset: documentValue.nodes[0].asset,
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
        dirty: 'Unsaved changes',
        runtimeAsset: 'vase',
        selected: ['table-1'],
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0]).toMatchObject({
      asset: 'vase',
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
});
