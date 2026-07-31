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
  test('preserves rounded alpha on an initially loaded legacy panel preview', async () => {
    harness = await createEditorTestHarness('editor-legacy-uikitml-preview');
    await writeFile(
      path.join(harness.tempRoot, 'public', 'ui', 'welcome.uikitml'),
      `<style>
  .heading { height: 48px; text-align: center; font-size: 24px; font-weight: 700; line-height: 24px; letter-spacing: -0.5px; color: #272727; }
  .heading:dark { color: rgba(255, 255, 255, 0.9); }
  .sub-heading { color: #272727; font-size: 14px; font-weight: 500; line-height: 18px; width: 100%; margin-top: 10px; }
  .sub-heading:dark { color: rgba(255, 255, 255, 0.90); }
  .panel-root { flex-direction: column; width: 344px; }
  .panel-content { align-items: center; flex-direction: column; padding-top: 16px; padding-left: 24px; padding-right: 24px; }
  .button { margin-left: 24px; margin-right: 24px; margin-top: 16px; margin-bottom: 24px; }
</style>
<Panel class="panel-root">
  <div class="panel-content">
    <div class="heading"> Spatial Audio </div>
    <Divider></Divider>
    <div class="sub-heading"> Play positional 3D audio sources that respond to user interactions
      with the Immersive Web SDK.</div>
  </div>
  <Button id="xr-button" class="button">
    <ButtonIcon>
      <RectangleGoggles></RectangleGoggles>
    </ButtonIcon>
    Enter XR
  </Button>
  <Button id="exit-button" class="button" style="display: none">
    <ButtonIcon>
      <LogIn></LogIn>
    </ButtonIcon>
    Exit to Browser
  </Button>
</Panel>`,
      'utf8',
    );
    const scene = await harness.readScene();
    scene.nodes.push({
      components: {
        PanelUI: { config: '/ui/welcome.uikitml' },
      },
      content: { type: 'group' },
      id: 'legacy-panel',
      transform: { position: [0, 1.5, -2], scale: 0.25 },
    });
    await writeFile(harness.scenePath, JSON.stringify(scene, null, 2), 'utf8');

    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await expect
      .poll(() =>
        editor.page.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
            'legacy-panel',
          ),
        ),
      )
      .toMatchObject({
        cornerAlpha: [0, 0, 0, 0],
        roundedCornerAlpha: [0, 0, 0, 0],
      });
    expect(
      await editor.page.evaluate(() =>
        (
          window as any
        ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewRendererState(),
      ),
    ).toMatchObject({
      contextLossCount: 0,
      contextLost: false,
      createdCount: 1,
    });

    await editor.page.locator('[data-node-id="legacy-panel"]').click();
    await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.25, 1.5, -2],
      }),
    );
    await expect
      .poll(() =>
        editor.page.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
            'legacy-panel',
          ),
        ),
      )
      .toMatchObject({
        cornerAlpha: [0, 0, 0, 0],
        roundedCornerAlpha: [0, 0, 0, 0],
      });
    expect(editor.errors()).toEqual([]);
  }, 30000);

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
      .toEqual(['table', 'vase', 'procedural-plinth', 'welcome-panel']);
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
        status: '2 nodes, 4 assets',
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

  test('adds a UIKitML asset object and renders its preview', async () => {
    harness = await createEditorTestHarness('editor-uikitml-asset');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await editor.page.locator('[data-bottom-tab="assets"]').click();

    await expect
      .poll(() =>
        editor.page
          .locator('[data-asset-id="welcome-panel"]')
          .getAttribute('data-asset-kind'),
      )
      .toBe('uikitml');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-asset-id="welcome-panel"] .asset-catalog-thumb img')
          .getAttribute('src'),
      )
      .toMatch(/^data:image\/png;base64,/u);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-asset-id="welcome-panel"] .asset-catalog-thumb img')
          .evaluate((image) => getComputedStyle(image).objectFit),
      )
      .toBe('contain');

    await editor.page.locator('[data-add-asset="welcome-panel"]').click();
    await expect
      .poll(async () => {
        const state = await editor.page.evaluate(() => {
          const scene = (window as any).IWSDK_SCENE_EDITOR.session.document;
          const node = scene.nodes.find(
            (entry: { id: string }) => entry.id === 'welcome-panel-1',
          );
          const preview = (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
            'welcome-panel-1',
          );
          return {
            cornerAlpha: preview?.cornerAlpha,
            materialType: preview?.materialType,
            node,
            previewSize: preview?.computedSize,
            selected: (window as any).__IWSDK_EDITOR_SELECTION,
            textureColorSpace: preview?.textureColorSpace,
            toneMapped: preview?.toneMapped,
            transparent: preview?.transparent,
          };
        });
        return { ...state, errors: editor.errors() };
      })
      .toMatchObject({
        cornerAlpha: [0, 0, 0, 0],
        errors: [],
        node: {
          content: { asset: 'welcome-panel', type: 'asset' },
          id: 'welcome-panel-1',
          transform: {
            position: [expect.any(Number), 1.25, expect.any(Number)],
            scale: expect.any(Number),
          },
        },
        previewSize: { height: expect.any(Number), width: expect.any(Number) },
        materialType: 'MeshBasicMaterial',
        textureColorSpace: 'srgb',
        toneMapped: false,
        transparent: true,
        selected: ['welcome-panel-1'],
      });
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="welcome-panel-1"] .node-row-icon')
          .getAttribute('data-node-icon'),
      )
      .toBe('PanelTop');
    await expect
      .poll(() => editor.page.locator('[data-node-asset-ref]').inputValue())
      .toBe('welcome-panel');
    await expect
      .poll(() =>
        editor.page.locator('[data-component-type="PanelUI"]').count(),
      )
      .toBe(0);

    await editor.page.locator('[data-node-asset-ref]').selectOption('vase');
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const scene = (window as any).IWSDK_SCENE_EDITOR.session.document;
          return {
            asset: scene.nodes.find(
              (entry: { id: string }) => entry.id === 'welcome-panel-1',
            )?.content?.asset,
            preview: (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
              'welcome-panel-1',
            ),
          };
        }),
      )
      .toEqual({ asset: 'vase', preview: null });
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="welcome-panel-1"] .node-row-icon')
          .getAttribute('data-node-icon'),
      )
      .toBe('Box');

    await editor.page
      .locator('[data-node-asset-ref]')
      .selectOption('welcome-panel');
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const scene = (window as any).IWSDK_SCENE_EDITOR.session.document;
          return {
            asset: scene.nodes.find(
              (entry: { id: string }) => entry.id === 'welcome-panel-1',
            )?.content?.asset,
            preview: (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
              'welcome-panel-1',
            ),
          };
        }),
      )
      .toMatchObject({
        asset: 'welcome-panel',
        preview: {
          computedSize: {
            height: expect.any(Number),
            width: expect.any(Number),
          },
        },
      });
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="welcome-panel-1"] .node-row-icon')
          .getAttribute('data-node-icon'),
      )
      .toBe('PanelTop');

    const rendered = await dispatchSceneTool(editor.page, 'ui_render_preview', {
      assetId: 'welcome-panel',
      height: 256,
      width: 320,
    });
    expect(rendered).toMatchObject({
      assetId: 'welcome-panel',
      height: 256,
      imageData: expect.stringMatching(/^[A-Za-z0-9+/=]+$/u),
      mimeType: 'image/png',
      width: 320,
    });
    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    expect(await harness.readScene()).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          content: { asset: 'welcome-panel', type: 'asset' },
          id: 'welcome-panel-1',
        }),
      ]),
    });

    const app = await harness.openApp();
    await expect
      .poll(() =>
        app.page.evaluate(() =>
          (window as any).__APP_RUNTIME_PROOF.importedEntities.find(
            (entry: { id: string }) => entry.id === 'welcome-panel-1',
          ),
        ),
      )
      .toMatchObject({ id: 'welcome-panel-1' });
    const runtimePanel = await app.page.evaluate(() =>
      (window as any).__APP_RUNTIME_PROOF.importedEntities.find(
        (entry: { id: string }) => entry.id === 'welcome-panel-1',
      ),
    );
    expect(runtimePanel.components).toContain('Transform');
    expect(runtimePanel.components).not.toContain('PanelUI');
    await expect
      .poll(() =>
        app.page.evaluate(() => {
          const asset = (window as any).__APP_WORLD.requireSceneObject(
            'welcome-panel-1',
          );
          return {
            assetId: asset.assetId,
            hasDocument: Boolean(asset.document),
            hasTitleElement: Boolean(asset.getElementById('title')),
            isUIKitMLAsset: asset.isUIKitMLAsset,
          };
        }),
      )
      .toEqual({
        assetId: 'welcome-panel',
        hasDocument: true,
        hasTitleElement: true,
        isUIKitMLAsset: true,
      });
    expect(app.errors()).toEqual([]);

    const reloadedEditor = await harness.openEditor();
    await expect
      .poll(() =>
        reloadedEditor.page.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getPanelPreviewState(
            'welcome-panel-1',
          ),
        ),
      )
      .toMatchObject({
        computedSize: { height: expect.any(Number), width: expect.any(Number) },
      });
    expect(reloadedEditor.errors()).toEqual([]);
    expect(editor.errors()).toEqual([]);
  }, 30000);

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
