/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { format as formatWithPrettier } from 'prettier';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { iwsdkDev } from '../src/index.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const PERFORMANCE_THRESHOLDS = {
  appInitialReadyMs: 60_000,
  compareScreenshotsMs: 20_000,
  editorStartupMs: 60_000,
  explicitScreenshotPairMs: 20_000,
  namedScreenshotBatchMs: 60_000,
  singleScreenshotCaptureMs: 10_000,
  transformCommitMs: 10_000,
};

let tempRoot: string;
let browser: Browser | undefined;
let server: ViteDevServer | undefined;
let previousManagedWorkspaceToken: string | undefined;
const TEST_MANAGED_WORKSPACE_TOKEN = 'editor-browser-e2e-managed-token';
const MANAGED_WORKSPACE_HEADERS = {
  'x-iwsdk-managed-workspace': TEST_MANAGED_WORKSPACE_TOKEN,
};

beforeEach(async () => {
  previousManagedWorkspaceToken =
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-editor-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(path.join(tempRoot, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'scenes'), { recursive: true });
  await mkdir(path.join(tempRoot, 'src'), { recursive: true });
});

afterEach(async () => {
  if (previousManagedWorkspaceToken == null) {
    delete process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  } else {
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN =
      previousManagedWorkspaceToken;
  }
  previousManagedWorkspaceToken = undefined;
  await browser?.close();
  browser = undefined;
  await server?.close();
  server = undefined;
  await rm(tempRoot, { recursive: true, force: true });
});

describe('native editor browser E2E', () => {
  test('edits, screenshots, saves, reloads, and reflects scene JSON changes in the app', async () => {
    const coreImportUrl = `/@fs/${path
      .join(REPO_ROOT, 'packages/core/src/index.ts')
      .replace(/\\/g, '/')}`;
    const scenePath = path.join(
      tempRoot,
      'public',
      'scenes',
      'editor-smoke.iwsdk.scene.json',
    );
    await writeFile(
      path.join(tempRoot, 'public', 'assets', 'table.gltf'),
      JSON.stringify(
        createBoxGltf({
          baseColor: [0.56, 0.34, 0.78, 1],
          max: [1, 0.5, 1],
          min: [-1, 0, -1],
        }),
      ),
      'utf8',
    );
    await writeFile(
      path.join(tempRoot, 'public', 'assets', 'vase.gltf'),
      JSON.stringify(
        createBoxGltf({
          baseColor: [0.95, 0.72, 0.25, 1],
          max: [0.1, 0.4, 0.1],
          min: [-0.1, 0, -0.1],
        }),
      ),
      'utf8',
    );
    await writeFile(
      scenePath,
      JSON.stringify(
        {
          assets: [
            {
              bounds: { max: [1, 0.5, 1], min: [-1, 0, -1] },
              id: 'table',
              uri: '/assets/table.gltf',
            },
            {
              bounds: { max: [0.1, 0.4, 0.1], min: [-0.1, 0, -0.1] },
              id: 'vase',
              uri: '/assets/vase.gltf',
            },
          ],
          nodes: [
            {
              asset: 'table',
              components: {
                'com.iwsdk.components.PanelUI': {
                  props: {
                    config: 'panel.json',
                    maxWidth: 1,
                  },
                  type: 'PanelUI',
                },
              },
              id: 'table-1',
              transform: { position: [0, 0, 0] },
            },
          ],
          units: 'meters',
          version: 'iwsdk.scene.v1',
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(
      path.join(tempRoot, 'index.html'),
      `<link rel="icon" href="data:," />
<style>
  html, body, #app-root {
    margin: 0;
    min-height: 100%;
    overflow: hidden;
  }
  #app-root {
    background: #081018;
    height: 100vh;
  }
  #app-status {
    background: rgba(8, 16, 24, 0.78);
    color: #f7fbff;
    font: 13px system-ui, sans-serif;
    left: 12px;
    padding: 6px 8px;
    position: fixed;
    top: 12px;
    z-index: 2;
  }
</style>
<div id="app-root"></div>
<div id="app-status">Loading</div>
<script type="module" src="/src/main.js"></script>`,
      'utf8',
    );
    await writeFile(
      path.join(tempRoot, 'src', 'main.js'),
      `
import { LevelTag, PanelUI, Transform, World } from ${JSON.stringify(coreImportUrl)};

const host = document.getElementById('app-root');
const status = document.getElementById('app-status');

function roundVec3(values) {
  return Array.from(values).map((value) => Number(value.toFixed(4)));
}

function sceneNodeObjects(world) {
  const nodes = [];
  world.getActiveRoot().traverse((object) => {
    const nodeId = object.userData?.iwsdkSceneNodeId;
    if (typeof nodeId !== 'string' || object.name !== nodeId) {
      return;
    }
    nodes.push({
      assetId: object.userData.iwsdkSceneAssetId,
      id: nodeId,
      name: object.name,
      position: roundVec3(object.position.toArray()),
      scale: roundVec3(object.scale.toArray()),
    });
  });
  return nodes.sort((a, b) => a.id.localeCompare(b.id));
}

function runtimeEntities(world) {
  const query = world.queryManager.registerQuery({ required: [LevelTag] });
  return [...query.entities]
    .filter((entity) => typeof entity.object3D?.userData?.iwsdkSceneNodeId === 'string')
    .map((entity) => {
      const components = entity
        .getComponents()
        .filter(Boolean)
        .map((component) => component.id)
        .sort();
      const panelUI = components.includes('PanelUI')
        ? {
            config: entity.getValue(PanelUI, 'config'),
            maxHeight: entity.getValue(PanelUI, 'maxHeight'),
            maxWidth: entity.getValue(PanelUI, 'maxWidth'),
          }
        : null;
      return {
        components,
        id: entity.object3D.userData.iwsdkSceneNodeId,
        index: entity.index,
        panelUI,
        position: roundVec3(entity.object3D.position.toArray()),
        transformParentIndex: entity.getValue(Transform, 'parent')?.index ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function collectProof(world) {
  const canvas = world.renderer.domElement;
  const nodes = sceneNodeObjects(world);
  return {
    activeLevelName: world.activeLevel.value.object3D?.name,
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    importedEntities: runtimeEntities(world),
    nodeCount: nodes.length,
    nodes,
    renderer: canvas.dataset.renderer,
    webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
  };
}

try {
  const world = await World.create(host, {
    features: {
      camera: false,
      environmentRaycast: false,
      grabbing: false,
      locomotion: false,
      physics: false,
      sceneUnderstanding: false,
      spatialUI: false,
    },
    input: { canvasPointerEvents: false },
    level: '/scenes/editor-smoke.iwsdk.scene.json',
    render: {
      camera: { lookAt: [0, 0, 0], position: [3, 2.5, 5] },
      defaultLighting: true,
    },
    xr: false,
  });
  world.renderer.domElement.id = 'app-canvas';
  world.renderer.domElement.dataset.renderer = 'iwsdk-webgl';
  window.__APP_WORLD = world;
  window.__APP_RUNTIME_PROOF = collectProof(world);
  status.textContent = window.__APP_RUNTIME_PROOF.nodeCount + ' nodes';
} catch (error) {
  console.error('[IWSDK App Fixture] Failed to initialize', error);
  status.textContent = 'Error: ' + (error?.message || String(error));
  throw error;
}
`,
      'utf8',
    );

    server = await createServer({
      logLevel: 'silent',
      plugins: [iwsdkDev()],
      root: tempRoot,
      server: {
        fs: {
          allow: [tempRoot, REPO_ROOT],
        },
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    expect(baseUrl).toBeTruthy();

    browser = await launchChromium();
    const appPage = await browser.newPage();
    const editorContext = await browser.newContext({
      extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS,
    });
    const editorPage = await editorContext.newPage();
    const performanceTimings: Record<string, number> = {};
    const appErrors = collectPageErrors(appPage);
    const editorErrors = collectPageErrors(editorPage);
    const editorRequestFailures: string[] = [];
    const editorModuleFinished: string[] = [];
    const editorModuleRequests: string[] = [];
    const editorModuleResponses: Array<{ status: number; url: string }> = [];
    const editorAssetResponses: Array<{ status: number; url: string }> = [];
    editorPage.on('request', (request) => {
      const url = request.url();
      if (
        url.includes('@iwsdk-editor-runtime') ||
        url.includes('/packages/core/src/') ||
        url.includes('/packages/vite-plugin-dev/src/editor/')
      ) {
        editorModuleRequests.push(`${request.method()} ${url}`);
      }
    });
    editorPage.on('requestfailed', (request) => {
      editorRequestFailures.push(
        `${request.method()} ${request.url()} ${
          request.failure()?.errorText ?? 'failed'
        }`,
      );
    });
    editorPage.on('requestfinished', (request) => {
      const url = request.url();
      if (
        url.includes('@iwsdk-editor-runtime') ||
        url.includes('/packages/core/src/') ||
        url.includes('/packages/vite-plugin-dev/src/editor/')
      ) {
        editorModuleFinished.push(`${request.method()} ${url}`);
      }
    });
    editorPage.on('response', (response) => {
      const url = response.url();
      if (
        url.includes('@iwsdk-editor-runtime') ||
        url.includes('/packages/core/src/') ||
        url.includes('/packages/vite-plugin-dev/src/editor/')
      ) {
        editorModuleResponses.push({ status: response.status(), url });
      }
      if (
        url.includes('/assets/table.gltf') ||
        url.includes('/assets/vase.gltf')
      ) {
        editorAssetResponses.push({ status: response.status(), url });
      }
    });

    const appInitialReadyStartMs = Date.now();
    await appPage.goto(baseUrl!, { waitUntil: 'networkidle' });
    await expectAppStatus(appPage, '1 nodes', appErrors);
    performanceTimings.appInitialReadyMs = Date.now() - appInitialReadyStartMs;
    expect(await hasNonBlankCanvas(appPage, '#app-canvas')).toBe(true);
    await expect
      .poll(() => appPage.evaluate(() => (window as any).__APP_RUNTIME_PROOF))
      .toMatchObject({
        activeLevelName: 'LevelRoot',
        nodeCount: 1,
        nodes: [
          {
            assetId: 'table',
            id: 'table-1',
            position: [0, 0, 0],
          },
        ],
        renderer: 'iwsdk-webgl',
        webgl: true,
      });
    const initialAppProof = await appPage.evaluate(
      () => (window as any).__APP_RUNTIME_PROOF,
    );
    expect(initialAppProof.importedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            'LevelTag',
            'PanelUI',
            'Transform',
          ]),
          id: 'table-1',
          panelUI: {
            config: 'panel.json',
            maxHeight: 1,
            maxWidth: 1,
          },
        }),
      ]),
    );

    const editorStartupStartMs = Date.now();
    await editorPage.goto(
      `${baseUrl!}__iwsdk/workspace?scene=public/scenes/editor-smoke.iwsdk.scene.json`,
      { waitUntil: 'domcontentloaded' },
    );
    await waitForEditorReady(
      editorPage,
      editorErrors,
      editorRequestFailures,
      editorModuleRequests,
      editorModuleFinished,
      editorModuleResponses,
    );
    performanceTimings.editorStartupMs = Date.now() - editorStartupStartMs;
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('1 nodes, 2 assets');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    await editorPage.locator('#scene-graph-filter').fill('table');
    await expect
      .poll(() =>
        editorPage
          .locator('#outliner [data-node-id]')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-node-id')),
          ),
      )
      .toEqual(['table-1']);
    await editorPage.locator('#scene-graph-filter').fill('missing');
    await expect
      .poll(() => editorPage.locator('[data-empty-outliner]').textContent())
      .toBe('No matching nodes');
    await editorPage.locator('#scene-graph-filter').fill('');
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
        ),
      )
      .toMatchObject({
        assetLoads: [
          {
            assetId: 'table',
            status: 'loaded',
          },
        ],
        meshCount: expect.any(Number),
        nodeObjectCount: 1,
      });
    await expect
      .poll(
        () =>
          editorPage.evaluate(() => {
            const proof = (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
            return proof.meshCount > 0 && proof.nodeObjectCount === 1;
          }),
        { timeout: 10_000 },
      )
      .toBe(true);
    expect(await hasNonBlankCanvas(editorPage, '#scene-canvas')).toBe(true);
    const initialViewportProof = await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
    );
    await writeJsonEvidence(
      'scene-before.json',
      JSON.parse(await readFile(scenePath, 'utf8')),
    );
    await writeJsonEvidence(
      'hierarchy-before.json',
      await editorPage.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
          'scene_get_hierarchy',
          {},
        ),
      ),
    );
    expect(initialViewportProof).toMatchObject({
      layout: {
        bottomPanel: {
          position: 'absolute',
        },
        leftPanel: {
          position: 'absolute',
          resize: 'none',
        },
        rightPanel: {
          position: 'absolute',
          resize: 'none',
        },
        statusStrip: {
          position: 'absolute',
        },
        toolbar: {
          position: 'absolute',
        },
        viewport: {
          position: 'absolute',
        },
      },
      orbitControls: true,
      orientationGizmo: {
        axisCount: 6,
        draggable: true,
        renderer: 'shared-webgl',
        webgl: true,
      },
      renderer: 'iwsdk-webgl',
      transformControls: {
        mode: 'translate',
        space: 'local',
        visible: false,
      },
      uses2DRenderer: false,
      webgl: true,
      worldReady: true,
    });
    await expectOrientationGizmoVisible(editorPage);
    const layoutProof = initialViewportProof.layout as {
      canvas: {
        height: number;
        left: number;
        top: number;
        width: number;
      };
      bottomPanel: { bottom: number; left: number; right: number; top: number };
      leftPanel: { left: number; right: number; top: number };
      rightPanel: { left: number; right: number; top: number };
      statusStrip: { bottom: number; left: number; right: number };
      toolbar: { left: number; right: number; top: number };
      viewport: { left: number; right: number; top: number };
      window: { height: number; width: number };
    };
    expect(Math.abs(layoutProof.canvas.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(layoutProof.canvas.top)).toBeLessThanOrEqual(1);
    expect(layoutProof.canvas.width).toBeGreaterThanOrEqual(
      layoutProof.window.width - 1,
    );
    expect(layoutProof.canvas.height).toBeGreaterThanOrEqual(
      layoutProof.window.height - 1,
    );
    expect(layoutProof.leftPanel.left).toBeLessThan(32);
    expect(layoutProof.leftPanel.right).toBeGreaterThan(
      layoutProof.viewport.left + 220,
    );
    expect(layoutProof.rightPanel.right).toBeGreaterThan(
      layoutProof.window.width - 32,
    );
    expect(layoutProof.rightPanel.left).toBeLessThan(
      layoutProof.viewport.right - 260,
    );
    expect(layoutProof.toolbar.left).toBeGreaterThanOrEqual(
      layoutProof.leftPanel.right,
    );
    expect(layoutProof.toolbar.right).toBeLessThanOrEqual(
      layoutProof.rightPanel.left,
    );
    expect(layoutProof.statusStrip.left).toBeGreaterThanOrEqual(
      layoutProof.leftPanel.right,
    );
    expect(layoutProof.statusStrip.right).toBeLessThanOrEqual(
      layoutProof.rightPanel.left,
    );
    expect(
      Math.abs(layoutProof.statusStrip.bottom - layoutProof.bottomPanel.top),
    ).toBeLessThanOrEqual(2);
    expect(layoutProof.bottomPanel.left).toBeLessThan(32);
    expect(layoutProof.bottomPanel.right).toBeLessThanOrEqual(
      layoutProof.rightPanel.left,
    );
    expect(layoutProof.bottomPanel.bottom).toBeGreaterThan(
      layoutProof.window.height - 2,
    );
    await expect
      .poll(() => editorPage.locator('#editor-status-strip').textContent())
      .toContain('1 nodes | saved | IWSDK WebGL');
    expect(initialViewportProof.meshCount).toBeGreaterThan(0);
    expect(initialViewportProof.nodeObjectCount).toBe(1);
    expect(initialViewportProof.assetLoads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'table',
          status: 'loaded',
          url: expect.stringContaining('/assets/table.gltf'),
        }),
      ]),
    );
    await expect
      .poll(() => editorPage.locator('[data-diagnostic-log]').count())
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        editorPage
          .locator('[data-bottom-tab]')
          .evaluateAll((tabs) =>
            tabs.map((tab) => tab.getAttribute('data-bottom-tab')),
          ),
      )
      .toEqual(['console', 'events', 'validation']);
    await expect
      .poll(() => editorPage.locator('#validate-scene').count())
      .toBe(0);
    await editorPage.locator('[data-bottom-tab="events"]').click();
    await editorPage.evaluate(async () => {
      await (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
        'scene_validate',
        {},
      );
    });
    await expect
      .poll(() =>
        editorPage.locator('[data-diagnostic-event="scene_validate"]').count(),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
          const session = (window as any).IWSDK_SCENE_EDITOR.session;
          return {
            documentRuntime: runtime.handles('scene_get_document'),
            documentSession: session.handles('scene_get_document'),
            legacyRuntime: runtime.handles('scene_get_object_transform'),
            legacySession: session.handles('scene_get_object_transform'),
          };
        }),
      )
      .toEqual({
        documentRuntime: true,
        documentSession: true,
        legacyRuntime: false,
        legacySession: false,
      });

    const hoverTarget = await editorPage.evaluate(() => {
      const canvas = document.getElementById('scene-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('scene canvas missing');
      }
      const hit = (window as any).__IWSDK_EDITOR_NODE_HITS.find(
        (entry: { id: string }) => entry.id === 'table-1',
      );
      if (!hit) {
        throw new Error('table-1 projected hit target missing');
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (hit.x / canvas.width) * rect.width,
        y: rect.top + (hit.y / canvas.height) * rect.height,
      };
    });
    await editorPage.mouse.move(hoverTarget.x, hoverTarget.y);
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .hoverBounds,
        ),
      )
      .toMatchObject({
        centerDistance: 0,
        nodeId: 'table-1',
      });

    const cameraBeforeWheel = initialViewportProof.cameraPosition as number[];
    await editorPage.locator('#scene-canvas').hover({
      position: { x: 350, y: 300 },
    });
    await editorPage.mouse.wheel(0, 500);
    await expect
      .poll(async () => {
        const proof = await editorPage.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
        );
        const position = proof.cameraPosition as number[];
        return Math.hypot(
          position[0] - cameraBeforeWheel[0],
          position[1] - cameraBeforeWheel[1],
          position[2] - cameraBeforeWheel[2],
        );
      })
      .toBeGreaterThan(0.01);

    const topGizmoTarget = await editorPage.evaluate(() => {
      const widget = document.querySelector(
        '#orientation-gizmo .orientation-gizmo-widget',
      );
      if (!(widget instanceof HTMLElement)) {
        throw new Error('orientation gizmo widget missing');
      }
      const target = (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof().orientationGizmo.clickTargets.find(
        (entry: { view: string }) => entry.view === 'top',
      );
      if (!target) {
        throw new Error('top orientation gizmo target missing');
      }
      const rect = widget.getBoundingClientRect();
      return {
        x: rect.left + (target.x / rect.width) * rect.width,
        y: rect.top + (target.y / rect.height) * rect.height,
      };
    });
    await editorPage.mouse.click(topGizmoTarget.x, topGizmoTarget.y);
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA.view),
      )
      .toBe('top');
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .orientationGizmo?.animating === false,
        ),
      )
      .toBe(true);
    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setCamera({
        view: 'quarter',
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA.view),
      )
      .toBe('quarter');
    const cameraBeforeGizmoDrag = await editorPage.evaluate(
      () => (window as any).__IWSDK_EDITOR_CAMERA.position,
    );
    const gizmoDragTarget = await editorPage.evaluate(() => {
      const widget = document.querySelector(
        '#orientation-gizmo .orientation-gizmo-widget',
      );
      if (!(widget instanceof HTMLElement)) {
        throw new Error('orientation gizmo widget missing');
      }
      const rect = widget.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });
    await editorPage.mouse.move(gizmoDragTarget.x, gizmoDragTarget.y);
    await editorPage.mouse.down();
    await editorPage.mouse.move(
      gizmoDragTarget.x + 34,
      gizmoDragTarget.y + 18,
      {
        steps: 8,
      },
    );
    await editorPage.mouse.up();
    await expect
      .poll(async () => {
        const position = await editorPage.evaluate(
          () => (window as any).__IWSDK_EDITOR_CAMERA.position,
        );
        return Math.hypot(
          position[0] - cameraBeforeGizmoDrag[0],
          position[1] - cameraBeforeGizmoDrag[1],
          position[2] - cameraBeforeGizmoDrag[2],
        );
      })
      .toBeGreaterThan(0.01);

    expect(editorAssetResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 200,
          url: expect.stringContaining('/assets/table.gltf'),
        }),
      ]),
    );
    await writeEditorEvidence(editorPage, initialViewportProof);
    await writeWorkspaceEvidence(editorPage, editorContext, baseUrl!);

    await expect
      .poll(() => editorPage.locator('#camera-controls').count())
      .toBe(0);
    await expect
      .poll(() => editorPage.locator('[data-camera-field]').count())
      .toBe(0);
    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setCamera({
        view: 'right',
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        position: [8, 2, 0],
        view: 'right',
      });

    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setCamera({
        view: 'orbit',
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        position: [5.66, 3, 0],
        view: 'orbit',
      });

    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setCamera({
        fov: 35,
        lookAt: [0, 0.5, 0],
        position: [2, 4, 6],
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        fov: 35,
        lookAt: [0, 0.5, 0],
        position: [2, 4, 6],
        view: 'custom',
      });

    await editorPage.locator('[data-node-id="table-1"]').click();
    await expect
      .poll(() => editorPage.locator('[data-node-title-edit]').inputValue())
      .toBe('table-1');
    await expect
      .poll(() =>
        editorPage.locator('.inspector-section-chevron .lucide-icon').count(),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .hoverBounds,
        ),
      )
      .toBeNull();
    const cameraBeforeFrameSelected = await editorPage.evaluate(
      () => (window as any).__IWSDK_EDITOR_CAMERA.position,
    );
    await editorPage.keyboard.press('F');
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        lookAt: [0, 0.25, 0],
        view: 'custom',
      });
    const cameraAfterFrameSelected = await editorPage.evaluate(
      () => (window as any).__IWSDK_EDITOR_CAMERA.position,
    );
    expect(
      Math.hypot(
        cameraAfterFrameSelected[0] - cameraBeforeFrameSelected[0],
        cameraAfterFrameSelected[1] - cameraBeforeFrameSelected[1],
        cameraAfterFrameSelected[2] - cameraBeforeFrameSelected[2],
      ),
    ).toBeGreaterThan(0.01);
    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.frameViewport('scene'),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        lookAt: [0, 0.25, 0],
        view: 'custom',
      });
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('0');
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
        ),
      )
      .toMatchObject({
        transformControls: {
          attachedNodeId: 'table-1',
          mode: 'translate',
          space: 'local',
          visible: true,
        },
      });
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .selectionBounds,
        ),
      )
      .toMatchObject({
        centerDistance: 0,
        nodeId: 'table-1',
      });
    await writeEditorEvidence(
      editorPage,
      await editorPage.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
      ),
      'selected-transform',
    );

    await editorPage.locator('[data-transform-mode="rotate"]').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls.mode,
        ),
      )
      .toBe('rotate');
    await expect
      .poll(() =>
        editorPage
          .locator('[data-transform-mode="rotate"]')
          .getAttribute('data-active'),
      )
      .toBe('');
    await editorPage.keyboard.press('R');
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls.mode,
        ),
      )
      .toBe('scale');
    await editorPage.keyboard.press('W');
    await editorPage.keyboard.press('Q');
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls,
        ),
      )
      .toMatchObject({ mode: 'translate', space: 'world' });
    await editorPage.locator('[data-transform-space="local"]').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls.space,
        ),
      )
      .toBe('local');
    await editorPage.locator('[data-transform-snap]').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls.snapping,
        ),
      )
      .toMatchObject({
        applied: {
          rotationSnapDeg: 15,
          scaleSnap: 0.1,
          translationSnap: 0.25,
        },
        enabled: true,
        rotationDeg: 15,
        scale: 0.1,
        translation: 0.25,
      });
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-snap]').getAttribute('data-active'),
      )
      .toBe('');
    await editorPage.locator('[data-transform-snap]').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .transformControls.snapping,
        ),
      )
      .toMatchObject({
        applied: {
          rotationSnapDeg: null,
          scaleSnap: null,
          translationSnap: null,
        },
        enabled: false,
      });

    const transformControlCommit = await editorPage.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.25, 0, 0],
        rotationDeg: [0, 15, 0],
        scale: [1.1, 1.1, 1.1],
      }),
    );
    expect(transformControlCommit).toMatchObject({
      documentTransform: {
        position: [0.25, 0, 0],
        rotationDeg: [0, 15, 0],
        scale: 1.1,
      },
      proof: {
        transformControls: {
          attachedNodeId: 'table-1',
          visible: true,
        },
      },
    });
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Unsaved changes');
    await editorPage.locator('#undo').click();
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('0');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');

    const documentTransformBeforeCanvasDrag = await editorPage.evaluate(
      () =>
        (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].transform,
    );
    const canvasDragStart = await editorPage.evaluate(() => {
      const proof = (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
      const layout = proof.layout;
      return {
        x: layout.leftPanel.right + 40,
        y: layout.statusStrip.top - 48,
      };
    });
    await editorPage.mouse.move(canvasDragStart.x, canvasDragStart.y);
    await editorPage.mouse.down();
    await editorPage.mouse.move(
      canvasDragStart.x + 90,
      canvasDragStart.y + 40,
      {
        steps: 8,
      },
    );
    await editorPage.mouse.up();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform,
        ),
      )
      .toEqual(documentTransformBeforeCanvasDrag);
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');

    await editorPage.keyboard.press('W');
    const pointerDragStart = await editorPage.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.findTransformControlPointerTarget('X'),
    );
    const documentTransformBeforePointerDrag = await editorPage.evaluate(
      () =>
        (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].transform,
    );
    const objectTransformBeforePointerDrag = await editorPage.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlObjectTransform(),
    );
    await editorPage.mouse.move(pointerDragStart.x, pointerDragStart.y);
    await editorPage.mouse.down();
    await editorPage.mouse.move(pointerDragStart.x + 80, pointerDragStart.y, {
      steps: 8,
    });
    const livePointerDragState = await editorPage.evaluate(() => ({
      documentTransform: (window as any).IWSDK_SCENE_EDITOR.session.document
        .nodes[0].transform,
      objectTransform: (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlObjectTransform(),
      selectionBounds: (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
        .selectionBounds,
    }));
    expect(livePointerDragState.documentTransform).toEqual(
      documentTransformBeforePointerDrag,
    );
    expect(
      Math.hypot(
        livePointerDragState.objectTransform.position[0] -
          objectTransformBeforePointerDrag.position[0],
        livePointerDragState.objectTransform.position[1] -
          objectTransformBeforePointerDrag.position[1],
        livePointerDragState.objectTransform.position[2] -
          objectTransformBeforePointerDrag.position[2],
      ),
    ).toBeGreaterThan(0.01);
    expect(livePointerDragState.selectionBounds).toMatchObject({
      centerDistance: 0,
      nodeId: 'table-1',
    });
    await editorPage.mouse.up();
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const position = (window as any).IWSDK_SCENE_EDITOR.session.document
            .nodes[0].transform.position;
          return Math.hypot(position[0], position[1], position[2]);
        }),
      )
      .toBeGreaterThan(0.01);
    await editorPage.locator('#undo').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform,
        ),
      )
      .toEqual(documentTransformBeforePointerDrag);
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');

    await editorPage.evaluate(async () => {
      await (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
        'scene_add_node',
        {
          node: {
            asset: 'vase',
            id: 'vase-node',
            transform: { position: [0, 0, 0] },
          },
        },
      );
    });
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('2 nodes, 2 assets');
    await expect
      .poll(() => editorPage.locator('[data-node-title-edit]').inputValue())
      .toBe('vase-node');
    await fillTransformField(editorPage, 'position.0', '0.35');
    await expect
      .poll(() => editorPage.locator('[data-placement-target]').count())
      .toBe(0);
    await expect
      .poll(() => editorPage.locator('[data-place-on-target]').count())
      .toBe(0);
    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch('scene_place_on', {
        align: 'preserve-xz',
        nodeId: 'vase-node',
        targetId: 'table-1',
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const nodes = (window as any).IWSDK_SCENE_EDITOR.session.document
            .nodes;
          const vase = nodes.find(
            (entry: { id: string }) => entry.id === 'vase-node',
          );
          return {
            placeOn: vase?.transform?.placeOn,
            position: vase?.transform?.position,
          };
        }),
      )
      .toEqual({
        placeOn: undefined,
        position: [0.35, 0.5, 0],
      });
    await expect
      .poll(() => editorPage.locator('[data-look-at-target]').count())
      .toBe(0);
    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch('scene_look_at', {
        nodeId: 'vase-node',
        target: [0, 0.5, 1],
      }),
    );
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const nodes = (window as any).IWSDK_SCENE_EDITOR.session.document
            .nodes;
          const vase = nodes.find(
            (entry: { id: string }) => entry.id === 'vase-node',
          );
          return vase?.transform?.rotationDeg?.[1] ?? 0;
        }),
      )
      .toBeGreaterThan(300);
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
              .selectionBounds,
        ),
      )
      .toMatchObject({
        centerDistance: 0,
        nodeId: 'vase-node',
      });
    await editorPage
      .locator('[data-node-id="vase-node"]')
      .dragTo(editorPage.locator('[data-node-id="table-1"]'));
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const documentValue = (window as any).IWSDK_SCENE_EDITOR.session
            .document;
          return {
            rootIds: documentValue.nodes.map(
              (entry: { id: string }) => entry.id,
            ),
            tableChildIds: documentValue.nodes[0].children?.map(
              (entry: { id: string }) => entry.id,
            ),
          };
        }),
      )
      .toEqual({
        rootIds: ['table-1'],
        tableChildIds: ['vase-node'],
      });
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof().objectHierarchy.find(
            (entry: { nodeId: string }) => entry.nodeId === 'vase-node',
          ),
        ),
      )
      .toMatchObject({
        nodeId: 'vase-node',
        parentNodeId: 'table-1',
      });
    await expect
      .poll(() => editorPage.locator('[data-hierarchy-parent]').count())
      .toBe(0);
    await expect
      .poll(() => editorPage.locator('[data-move-root]').count())
      .toBe(0);
    await editorPage
      .locator('[data-node-id="vase-node"]')
      .dragTo(editorPage.locator('#scene-root-drop-target'));
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.map(
            (entry: { id: string }) => entry.id,
          ),
        ),
      )
      .toEqual(['table-1', 'vase-node']);
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof().objectHierarchy.find(
            (entry: { nodeId: string }) => entry.nodeId === 'vase-node',
          ),
        ),
      )
      .toMatchObject({
        nodeId: 'vase-node',
        parentNodeId: null,
      });
    await editorPage.keyboard.press('Delete');
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('1 nodes, 2 assets');
    await expect
      .poll(async () =>
        normalizeText(await editorPage.locator('#inspector').textContent()),
      )
      .toBe('No selection');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');

    await editorPage.locator('[data-node-id="table-1"]').click();
    await expect
      .poll(() => editorPage.locator('#duplicate-node').count())
      .toBe(0);
    await expect.poll(() => editorPage.locator('#remove-node').count()).toBe(0);
    await editorPage.locator('[data-node-id="table-1"]').click({
      button: 'right',
    });
    await expect
      .poll(() => editorPage.locator('#scene-graph-context-menu').isVisible())
      .toBe(true);
    await editorPage.locator('[data-scene-graph-action="duplicate"]').click();
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('2 nodes, 2 assets');
    await expect
      .poll(() => editorPage.locator('[data-node-title-edit]').inputValue())
      .toBe('table-1-copy');
    await editorPage
      .locator('[data-node-title-edit]')
      .fill('table-copy-renamed');
    await editorPage.locator('[data-node-title-edit]').press('Enter');
    await expect
      .poll(() => editorPage.locator('[data-node-title-edit]').inputValue())
      .toBe('table-copy-renamed');
    await expect
      .poll(() =>
        editorPage.evaluate(() =>
          (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.map(
            (entry: { id: string }) => entry.id,
          ),
        ),
      )
      .toEqual(['table-1', 'table-copy-renamed']);
    await expect
      .poll(() =>
        editorPage.locator('[data-node-id="table-copy-renamed"]').count(),
      )
      .toBe(1);
    await editorPage.locator('[data-node-id="table-copy-renamed"]').click({
      button: 'right',
    });
    await expect
      .poll(() => editorPage.locator('#scene-graph-context-menu').isVisible())
      .toBe(true);
    await editorPage.locator('[data-scene-graph-action="remove"]').click();
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('1 nodes, 2 assets');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    await editorPage.locator('[data-node-id="table-1"]').click();

    await fillTransformField(editorPage, 'position.0', '0.1');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Unsaved changes');
    await editorPage.locator('#undo').click();
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('0');

    await fillTransformField(editorPage, 'position.1', '-0.2');
    const invalidValidation = await editorPage.evaluate(async () =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch('scene_validate', {}),
    );
    expect(JSON.stringify(invalidValidation)).toContain(
      'penetrates below the floor',
    );
    await editorPage.locator('#undo').click();
    await expect
      .poll(() => editorPage.locator('#validation-status').count())
      .toBe(0);
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    const validValidation = await editorPage.evaluate(async () =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch('scene_validate', {}),
    );
    expect(validValidation).toMatchObject({ valid: true });

    await fillTransformField(editorPage, 'position.0', '0.1');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Unsaved changes');
    await editorPage.locator('#revert').click();
    await editorPage.waitForLoadState('domcontentloaded');
    await waitForEditorReady(
      editorPage,
      editorErrors,
      editorRequestFailures,
      editorModuleRequests,
      editorModuleFinished,
      editorModuleResponses,
    );
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    await editorPage.locator('[data-node-id="table-1"]').click();
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('0');

    await fillTransformField(editorPage, 'position.0', '0.2');
    await fillTransformField(editorPage, 'position.1', '0');
    await fillTransformField(editorPage, 'position.2', '-0.3');
    await fillTransformField(editorPage, 'rotationDeg.1', '45');
    await fillTransformField(editorPage, 'scale.0', '1.2');
    await fillTransformField(editorPage, 'scale.1', '1.2');
    await fillTransformField(editorPage, 'scale.2', '1.2');
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Unsaved changes');
    await expect
      .poll(() =>
        editorPage.locator('[data-transform-field="position.0"]').inputValue(),
      )
      .toBe('0.2');
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform,
        ),
      )
      .toMatchObject({
        position: [0.2, 0, -0.3],
        rotationDeg: [0, 45, 0],
        scale: 1.2,
      });

    const panelComponentRow = editorPage.locator(
      '[data-component-type="PanelUI"]',
    );
    await expect
      .poll(() => panelComponentRow.locator('[data-component-value]').count())
      .toBe(0);
    await expect
      .poll(() => panelComponentRow.locator('[data-update-component]').count())
      .toBe(0);
    await expect
      .poll(() =>
        panelComponentRow
          .locator('[data-remove-component] > svg.lucide-icon')
          .count(),
      )
      .toBe(1);
    await panelComponentRow
      .locator('[data-component-field="config"]')
      .fill('updated-panel.json');
    await panelComponentRow
      .locator('[data-component-field="maxWidth"]')
      .fill('2');
    await editorPage.locator('#new-component-type').focus();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .components['com.iwsdk.components.PanelUI'],
        ),
      )
      .toEqual({
        props: {
          config: 'updated-panel.json',
          maxHeight: 1,
          maxWidth: 2,
        },
        type: 'PanelUI',
      });

    await editorPage.locator('#new-component-type').selectOption('Visibility');
    await editorPage.locator('#add-component').click();
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .components['com.iwsdk.components.Visibility'],
        ),
      )
      .toEqual({
        props: {
          isVisible: true,
        },
        type: 'Visibility',
      });
    const shortcutModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await editorPage.keyboard.press(`${shortcutModifier}+Z`);
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .components['com.iwsdk.components.Visibility'],
        ),
      )
      .toBeUndefined();
    await editorPage.keyboard.press(`${shortcutModifier}+Shift+Z`);
    await expect
      .poll(() =>
        editorPage.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .components['com.iwsdk.components.Visibility'],
        ),
      )
      .toEqual({
        props: {
          isVisible: true,
        },
        type: 'Visibility',
      });
    await editorPage.keyboard.press(`${shortcutModifier}+S`);
    await expect
      .poll(async () => {
        const keyboardSavedScene = JSON.parse(
          await readFile(scenePath, 'utf8'),
        );
        return keyboardSavedScene.nodes[0]?.components?.[
          'com.iwsdk.components.Visibility'
        ]?.props?.isVisible;
      })
      .toBe(true);
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');

    await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch('scene_set_camera', {
        view: 'top',
      }),
    );
    const transformCommitStartMs = Date.now();
    await editorPage.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.35, 0, -0.2],
        rotationDeg: [0, 45, 0],
        scale: 1.2,
      }),
    );
    performanceTimings.transformCommitMs = Date.now() - transformCommitStartMs;
    await expect
      .poll(() => editorPage.locator('[data-node-title-edit]').inputValue())
      .toBe('table-1');
    await expect
      .poll(() =>
        editorPage.evaluate(() => {
          const position = (window as any).IWSDK_SCENE_EDITOR.session.document
            .nodes[0].transform.position;
          return position[0] > 0.2 && position[2] > -0.3;
        }),
      )
      .toBe(true);
    const tableTransformAfterDrag = await editorPage.evaluate(
      () =>
        (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].transform,
    );
    expect(tableTransformAfterDrag.position[0]).toBeGreaterThan(0.2);
    expect(tableTransformAfterDrag.position[2]).toBeGreaterThan(-0.3);

    const toolResult = await editorPage.evaluate(async () => {
      const runtime = (window as any).IWSDK_SCENE_EDITOR.runtime;
      await runtime.dispatch('scene_add_node', {
        node: {
          asset: 'vase',
          id: 'vase-1',
          transform: { position: [0.35, 0, 0] },
        },
      });
      await runtime.dispatch('scene_place_on', {
        align: 'preserve-xz',
        nodeId: 'vase-1',
        targetId: 'table-1',
      });
      await runtime.dispatch('scene_look_at', {
        nodeId: 'vase-1',
        target: [0, 0.5, 1],
      });
      await runtime.dispatch('scene_set_transform', {
        nodeId: 'vase-1',
        transform: {
          position: [0.4, 0.6, 0.2],
          rotationDeg: [0, 330, 0],
          scale: 1,
        },
      });
      await runtime.dispatch('scene_undo', {});
      await runtime.dispatch('scene_redo', {});
      const screenshots = [];
      const currentScreenshotStartMs = performance.now();
      await runtime.dispatch('scene_set_camera', { view: 'right' });
      const currentScreenshot = await runtime.dispatch('scene_screenshot', {
        height: 240,
        view: 'current',
        width: 320,
      });
      const singleScreenshotCaptureMs =
        performance.now() - currentScreenshotStartMs;
      screenshots.push(currentScreenshot);
      const namedScreenshotBatchStartMs = performance.now();
      for (const view of ['top', 'front', 'back', 'left', 'right', 'quarter']) {
        screenshots.push(
          await runtime.dispatch('scene_screenshot', {
            height: 240,
            view,
            width: 320,
          }),
        );
      }
      const namedScreenshotBatchMs =
        performance.now() - namedScreenshotBatchStartMs;
      screenshots.push(
        await runtime.dispatch('scene_screenshot', {
          height: 240,
          orbitStep: 3,
          view: 'orbit',
          width: 320,
        }),
      );
      screenshots.push(
        await runtime.dispatch('scene_screenshot', {
          fov: 35,
          height: 240,
          lookAt: [0, 0.5, 0],
          position: [3, 4, 5],
          width: 320,
        }),
      );
      const compareScreenshotsStartMs = performance.now();
      const comparison = await runtime.dispatch('scene_compare_screenshots', {
        first: { view: 'top' },
        height: 180,
        second: { view: 'front' },
        width: 240,
      });
      const compareScreenshotsMs =
        performance.now() - compareScreenshotsStartMs;
      const sameNamedComparison = await runtime.dispatch(
        'scene_compare_screenshots',
        {
          first: { view: 'top' },
          height: 180,
          second: { view: 'top' },
          width: 240,
        },
      );
      const explicitCamera = {
        fov: 35,
        height: 180,
        lookAt: [0, 0.5, 0],
        position: [3, 4, 5],
        width: 240,
      };
      const explicitScreenshotPairStartMs = performance.now();
      const explicitFirst = await runtime.dispatch(
        'scene_screenshot',
        explicitCamera,
      );
      const explicitSecond = await runtime.dispatch(
        'scene_screenshot',
        explicitCamera,
      );
      const explicitScreenshotPairMs =
        performance.now() - explicitScreenshotPairStartMs;
      const validation = await runtime.dispatch('scene_validate', {});
      const saved = await runtime.dispatch('scene_save', {});
      const documentResult = await runtime.dispatch('scene_get_document', {});
      const proof = (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
      return {
        comparison,
        determinism: {
          explicitFirst,
          explicitMatches: explicitFirst.imageData === explicitSecond.imageData,
          explicitSecond,
          sameNamedComparison,
        },
        documentResult,
        performance: {
          compareScreenshotsMs,
          explicitScreenshotPairMs,
          namedScreenshotBatchMs,
          singleScreenshotCaptureMs,
        },
        proof,
        saved,
        screenshots,
        validation,
      };
    });

    expect(toolResult.validation).toMatchObject({ valid: true });
    expect(toolResult.saved).toMatchObject({
      dirty: false,
      path: 'public/scenes/editor-smoke.iwsdk.scene.json',
    });
    expect(toolResult.comparison).toMatchObject({
      matches: false,
      first: { camera: { view: 'top' }, mimeType: 'image/png' },
      second: { camera: { view: 'front' }, mimeType: 'image/png' },
    });
    expect(toolResult.determinism).toMatchObject({
      explicitMatches: true,
      sameNamedComparison: {
        first: { camera: { view: 'top' }, mimeType: 'image/png' },
        matches: true,
        second: { camera: { view: 'top' }, mimeType: 'image/png' },
      },
    });
    expect(toolResult.determinism.explicitFirst.imageData).toBe(
      toolResult.determinism.explicitSecond.imageData,
    );
    Object.assign(
      performanceTimings,
      toolResult.performance as Record<string, number>,
    );
    assertPerformanceThresholds(performanceTimings);
    await writeJsonEvidence('performance.json', {
      thresholds: PERFORMANCE_THRESHOLDS,
      timings: performanceTimings,
    });
    await writeScreenshotDeterminismEvidence(toolResult.determinism);
    expect(toolResult.screenshots).toHaveLength(9);
    expect(
      (
        toolResult.screenshots as Array<{
          camera: { view: string };
        }>
      ).map((screenshot) => screenshot.camera.view),
    ).toEqual([
      'right',
      'top',
      'front',
      'back',
      'left',
      'right',
      'quarter',
      'orbit',
      'custom',
    ]);
    expect(
      new Set(
        (
          toolResult.screenshots as Array<{
            imageData: string;
          }>
        ).map((screenshot) => screenshot.imageData),
      ).size,
    ).toBeGreaterThan(4);
    for (const screenshot of toolResult.screenshots as Array<{
      imageData: string;
      mimeType: string;
    }>) {
      expect(screenshot.mimeType).toBe('image/png');
      expect(screenshot.imageData.length).toBeGreaterThan(1000);
    }
    await writeCameraAndScreenshotEvidence(
      toolResult.screenshots as Array<{
        camera: { view: string };
        imageData: string;
        mimeType: string;
      }>,
      toolResult.comparison as {
        firstImageDataLength: number;
        matches: boolean;
        secondImageDataLength: number;
        first: { camera: unknown; imageData: string };
        second: { camera: unknown; imageData: string };
      },
    );
    expect(
      (toolResult.documentResult as { document: { nodes: unknown[] } }).document
        .nodes,
    ).toHaveLength(2);
    expect(toolResult.proof).toMatchObject({
      assetLoads: expect.arrayContaining([
        expect.objectContaining({
          assetId: 'table',
          status: 'loaded',
        }),
        expect.objectContaining({
          assetId: 'vase',
          status: 'loaded',
        }),
      ]),
    });
    expect(editorAssetResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 200,
          url: expect.stringContaining('/assets/vase.gltf'),
        }),
      ]),
    );

    const savedScene = JSON.parse(await readFile(scenePath, 'utf8'));
    await writeJsonEvidence('scene-after.json', savedScene);
    expect(savedScene.nodes).toHaveLength(2);
    expect(savedScene.nodes[0]).toMatchObject({
      components: {
        'com.iwsdk.components.PanelUI': {
          props: {
            config: 'updated-panel.json',
            maxHeight: 1,
            maxWidth: 2,
          },
          type: 'PanelUI',
        },
        'com.iwsdk.components.Visibility': {
          props: {
            isVisible: true,
          },
          type: 'Visibility',
        },
      },
      id: 'table-1',
      transform: tableTransformAfterDrag,
    });
    expect(savedScene.nodes[1]).toMatchObject({
      id: 'vase-1',
      transform: { position: [0.4, 0.6, 0.2] },
    });

    await editorPage.reload({ waitUntil: 'domcontentloaded' });
    await waitForEditorReady(
      editorPage,
      editorErrors,
      editorRequestFailures,
      editorModuleRequests,
      editorModuleFinished,
      editorModuleResponses,
    );
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toBe('2 nodes, 2 assets');
    await writeJsonEvidence(
      'hierarchy-after.json',
      await editorPage.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
          'scene_get_hierarchy',
          {},
        ),
      ),
    );
    await writeJsonEvidence(
      'proof-after-reload.json',
      await editorPage.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
      ),
    );

    await appPage.reload({ waitUntil: 'networkidle' });
    await expectAppStatus(appPage, '2 nodes', appErrors);
    expect(await hasNonBlankCanvas(appPage, '#app-canvas')).toBe(true);
    const appProofAfterSave = await appPage.evaluate(
      () => (window as any).__APP_RUNTIME_PROOF,
    );
    expect(appProofAfterSave).toMatchObject({
      activeLevelName: 'LevelRoot',
      nodeCount: 2,
      nodes: expect.arrayContaining([
        expect.objectContaining({
          assetId: 'table',
          id: 'table-1',
          position: tableTransformAfterDrag.position,
          scale: [1.2, 1.2, 1.2],
        }),
        expect.objectContaining({
          assetId: 'vase',
          id: 'vase-1',
          position: [0.4, 0.6, 0.2],
        }),
      ]),
      renderer: 'iwsdk-webgl',
      webgl: true,
    });
    expect(appProofAfterSave.importedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            'LevelTag',
            'PanelUI',
            'Transform',
            'Visibility',
          ]),
          id: 'table-1',
          panelUI: {
            config: 'updated-panel.json',
            maxHeight: 1,
            maxWidth: 2,
          },
          position: tableTransformAfterDrag.position,
        }),
        expect.objectContaining({
          components: expect.arrayContaining(['LevelTag', 'Transform']),
          id: 'vase-1',
          position: [0.4, 0.6, 0.2],
        }),
      ]),
    );
    await writeJsonEvidence('app-after-reload-proof.json', appProofAfterSave);
    await writeAppScreenshotEvidence(appPage);
    await writeJsonEvidence('network.json', {
      editorAssetResponses,
      editorModuleFinished,
      editorModuleRequests,
      editorModuleResponses,
      editorRequestFailures,
    });
    await writeJsonEvidence('console.json', {
      appErrors: appErrors(),
      editorErrors: editorErrors(),
    });

    expect(appErrors()).toEqual([]);
    expect(editorErrors()).toEqual([]);
  }, 180000);
});

function collectPageErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      errors.push(
        `${message.text()} @ ${location.url}:${location.lineNumber}:${location.columnNumber}`,
      );
    }
  });
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  return () => errors;
}

function assertPerformanceThresholds(timings: Record<string, number>): void {
  for (const [key, threshold] of Object.entries(PERFORMANCE_THRESHOLDS)) {
    expect(timings[key], key).toBeGreaterThanOrEqual(0);
    expect(timings[key], key).toBeLessThanOrEqual(threshold);
  }
}

function normalizeText(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

async function fillTransformField(
  page: Page,
  field: string,
  value: string,
): Promise<void> {
  const input = page.locator(`[data-transform-field="${field}"]`);
  await input.fill(value);
  await input.blur();
  await expect.poll(() => input.inputValue()).toBe(value);
}

async function expectAppStatus(
  page: Page,
  expected: string,
  getErrors: () => string[] = () => [],
) {
  try {
    await expect
      .poll(() => page.locator('#app-status').textContent(), {
        timeout: 15000,
      })
      .toBe(expected);
  } catch (error) {
    const status = await page.locator('#app-status').textContent();
    throw new Error(
      `Expected app status ${JSON.stringify(expected)}, got ${JSON.stringify(
        status,
      )}\n${getErrors().join('\n')}`,
      { cause: error },
    );
  }
}

async function waitForEditorReady(
  page: Page,
  getErrors: () => string[],
  requestFailures: string[],
  moduleRequests: string[] = [],
  moduleFinished: string[] = [],
  moduleResponses: Array<{ status: number; url: string }> = [],
): Promise<void> {
  let result: { error?: string | null; ready: boolean };
  try {
    result = await page
      .waitForFunction(
        () => {
          if ((window as any).IWSDK_SCENE_EDITOR) {
            return { ready: true };
          }
          const error = document.querySelector('.editor-error pre');
          if (error?.textContent) {
            return { error: error.textContent, ready: false };
          }
          return false;
        },
        undefined,
        { timeout: 15000 },
      )
      .then(
        (handle) =>
          handle.jsonValue() as Promise<{
            error?: string | null;
            ready: boolean;
          }>,
      );
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      bodyText: document.body?.innerText?.slice(0, 1200) ?? '',
      scripts: [...document.scripts].map((script) => ({
        async: script.async,
        defer: script.defer,
        noModule: script.noModule,
        src: script.src,
        type: script.type,
      })),
      title: document.title,
      url: window.location.href,
    }));
    const editorRuntimeText = await page.evaluate(async () => {
      const response = await fetch('/@iwsdk-editor-runtime');
      const text = await response.text();
      return {
        contentType: response.headers.get('content-type'),
        fullText: text,
        status: response.status,
        text: text.slice(0, 4000),
      };
    });
    const runtimeDiagnosticPath = path.join(
      os.tmpdir(),
      'iwsdk-editor-runtime-diagnostic.js',
    );
    await writeFile(runtimeDiagnosticPath, editorRuntimeText.fullText, 'utf8');
    throw new Error(
      `Timed out waiting for editor readiness: ${
        error instanceof Error ? error.message : String(error)
      }\nURL: ${diagnostics.url}\nTitle: ${diagnostics.title}\nText:\n${
        diagnostics.bodyText
      }\nScripts:\n${diagnostics.scripts
        .map((script) => JSON.stringify(script))
        .join('\n')}\nRequest failures:\n${requestFailures.join(
        '\n',
      )}\nModule requests:\n${moduleRequests.join(
        '\n',
      )}\nModule finished:\n${moduleFinished.join(
        '\n',
      )}\nModule responses:\n${moduleResponses
        .map((response) => `${response.status} ${response.url}`)
        .join('\n')}\nEditor runtime response:\n${editorRuntimeText.status} ${
        editorRuntimeText.contentType
      }\nWritten to: ${runtimeDiagnosticPath}\n${
        editorRuntimeText.text
      }\nErrors:\n${getErrors().join('\n')}\nBody:\n${(
        await page.content()
      ).slice(0, 1200)}`,
    );
  }

  if (!result.ready) {
    const editorRuntimeText = await page.evaluate(async () => {
      const response = await fetch('/@iwsdk-editor-runtime');
      const text = await response.text();
      return {
        contentType: response.headers.get('content-type'),
        fullText: text,
        status: response.status,
      };
    });
    const runtimeDiagnosticPath = path.join(
      os.tmpdir(),
      'iwsdk-editor-runtime-diagnostic.js',
    );
    await writeFile(runtimeDiagnosticPath, editorRuntimeText.fullText, 'utf8');
    throw new Error(
      `Editor failed to initialize: ${
        result.error ?? '<no error text>'
      }\nEditor runtime response: ${editorRuntimeText.status} ${
        editorRuntimeText.contentType
      }\nWritten to: ${runtimeDiagnosticPath}\n${getErrors().join('\n')}`,
    );
  }
}

async function writeEditorEvidence(
  page: Page,
  proof: Record<string, unknown>,
  label = 'editor',
): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  await mkdir(evidenceDir, { recursive: true });
  const prefix = label === 'editor' ? 'editor' : label;
  const proofName = label === 'editor' ? 'proof.json' : `${prefix}-proof.json`;
  await writeFile(
    path.join(evidenceDir, proofName),
    await formatJsonEvidence(proof),
    'utf8',
  );
  await page.locator('#scene-canvas').screenshot({
    path: path.join(evidenceDir, `${prefix}-webgl-viewport.png`),
  });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDir, `${prefix}-full-page.png`),
  });
}

async function writeWorkspaceEvidence(
  page: Page,
  context: BrowserContext,
  baseUrl: string,
): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  await mkdir(evidenceDir, { recursive: true });
  await waitForWorkspaceRuntime(page);
  const viewStates: Record<string, unknown> = {};
  for (const view of ['runtime', 'editor', 'split'] as const) {
    viewStates[view] = await dispatchWorkspaceTool(page, 'workspace_set_view', {
      view,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.dataset.iwsdkWorkspaceView,
        ),
      )
      .toBe(view);
    await page.screenshot({
      fullPage: true,
      path: path.join(evidenceDir, `workspace-${view}.png`),
    });
  }

  const pickerPage = await context.newPage();
  let pickerState: unknown;
  let createState: unknown;
  try {
    await pickerPage.goto(`${baseUrl}__iwsdk/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await expect
      .poll(() => pickerPage.locator('.scene-picker-dialog h1').textContent())
      .toBe('Open Scene');
    await waitForWorkspaceRuntime(pickerPage);
    pickerState = await dispatchWorkspaceTool(
      pickerPage,
      'workspace_get_state',
    );
    await pickerPage.screenshot({
      fullPage: true,
      path: path.join(evidenceDir, 'workspace-scene-picker.png'),
    });
    await pickerPage
      .locator('input[name="path"]')
      .fill('public/scenes/evidence-create-flow.iwsdk.scene.json');
    await pickerPage
      .locator('#scene-picker-create button[type="submit"]')
      .click();
    await pickerPage.waitForURL(/evidence-create-flow\.iwsdk\.scene\.json/, {
      timeout: 10_000,
    });
    await waitForWorkspaceRuntime(pickerPage);
    createState = await dispatchWorkspaceTool(
      pickerPage,
      'workspace_get_state',
    );
    await pickerPage.screenshot({
      fullPage: true,
      path: path.join(evidenceDir, 'workspace-create-scene.png'),
    });
  } finally {
    await pickerPage.close();
    await dispatchWorkspaceTool(page, 'workspace_set_view', { view: 'editor' });
  }

  await writeJsonEvidence('workspace-proof.json', {
    createState,
    pickerState,
    viewStates,
  });
}

async function writeJsonEvidence(name: string, value: unknown): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, name),
    await formatJsonEvidence(value),
    'utf8',
  );
}

async function formatJsonEvidence(value: unknown): Promise<string> {
  return formatWithPrettier(JSON.stringify(value), { parser: 'json' });
}

async function writePngEvidence(
  name: string,
  imageData: string,
): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  const base64 = imageData.includes(',')
    ? (imageData.split(',').pop() ?? '')
    : imageData;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, name), Buffer.from(base64, 'base64'));
}

async function writeCameraAndScreenshotEvidence(
  screenshots: Array<{
    camera: { view: string };
    imageData: string;
    mimeType: string;
  }>,
  comparison: {
    firstImageDataLength: number;
    matches: boolean;
    secondImageDataLength: number;
    first: { camera: unknown; imageData: string };
    second: { camera: unknown; imageData: string };
  },
): Promise<void> {
  const selectedScreenshots = new Map<string, string>();
  for (const screenshot of screenshots) {
    if (
      screenshot.mimeType === 'image/png' &&
      ['top', 'front', 'right', 'quarter'].includes(screenshot.camera.view) &&
      !selectedScreenshots.has(screenshot.camera.view)
    ) {
      selectedScreenshots.set(screenshot.camera.view, screenshot.imageData);
    }
  }

  await Promise.all(
    [...selectedScreenshots.entries()].map(([view, imageData]) =>
      writePngEvidence(`editor-${view}.png`, imageData),
    ),
  );
  await writeJsonEvidence('camera-states.json', {
    screenshots: screenshots.map((screenshot) => ({
      hash: hashImageData(screenshot.imageData),
      imageDataLength: screenshot.imageData.length,
      mimeType: screenshot.mimeType,
      view: screenshot.camera.view,
      camera: screenshot.camera,
    })),
  });
  await writeJsonEvidence('image-diff.json', {
    first: {
      camera: comparison.first.camera,
      hash: hashImageData(comparison.first.imageData),
      imageDataLength: comparison.firstImageDataLength,
    },
    matches: comparison.matches,
    second: {
      camera: comparison.second.camera,
      hash: hashImageData(comparison.second.imageData),
      imageDataLength: comparison.secondImageDataLength,
    },
  });
}

async function writeAppScreenshotEvidence(page: Page): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(evidenceDir, 'app-after-reload.png'),
  });
}

async function writeScreenshotDeterminismEvidence(determinism: {
  explicitFirst: { imageData: string; imageDataLength?: number };
  explicitMatches: boolean;
  explicitSecond: { imageData: string; imageDataLength?: number };
  sameNamedComparison: {
    firstImageDataLength: number;
    matches: boolean;
    secondImageDataLength: number;
    first: { imageData: string };
    second: { imageData: string };
  };
}): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    path.join(evidenceDir, 'screenshot-determinism-proof.json'),
    await formatJsonEvidence({
      explicit: {
        firstHash: hashImageData(determinism.explicitFirst.imageData),
        firstLength: determinism.explicitFirst.imageData.length,
        matches: determinism.explicitMatches,
        secondHash: hashImageData(determinism.explicitSecond.imageData),
        secondLength: determinism.explicitSecond.imageData.length,
      },
      sameNamed: {
        firstHash: hashImageData(
          determinism.sameNamedComparison.first.imageData,
        ),
        firstLength: determinism.sameNamedComparison.firstImageDataLength,
        matches: determinism.sameNamedComparison.matches,
        secondHash: hashImageData(
          determinism.sameNamedComparison.second.imageData,
        ),
        secondLength: determinism.sameNamedComparison.secondImageDataLength,
      },
    }),
    'utf8',
  );
}

function hashImageData(imageData: string): string {
  return createHash('sha256').update(imageData).digest('hex');
}

async function waitForWorkspaceRuntime(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
          if (!runtime || typeof runtime.dispatch !== 'function') {
            return false;
          }
          try {
            await runtime.dispatch('workspace_get_state', {});
            return true;
          } catch {
            return false;
          }
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function dispatchWorkspaceTool(
  page: Page,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  return page.evaluate(
    ({ method: runtimeMethod, params: runtimeParams }) => {
      const runtime = (window as any).FRAMEWORK_MCP_RUNTIME;
      if (!runtime || typeof runtime.dispatch !== 'function') {
        throw new Error('FRAMEWORK_MCP_RUNTIME is not available');
      }
      return runtime.dispatch(runtimeMethod, runtimeParams);
    },
    { method, params },
  );
}

async function hasNonBlankCanvas(
  page: Page,
  selector: string,
): Promise<boolean> {
  const twoDimensionalResult = await page
    .locator(selector)
    .evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const first = [data[0], data[1], data[2], data[3]].join(',');
      for (let index = 4; index < data.length; index += 4) {
        if (
          `${data[index]},${data[index + 1]},${data[index + 2]},${
            data[index + 3]
          }` !== first
        ) {
          return true;
        }
      }
      return false;
    });
  if (twoDimensionalResult != null) {
    return twoDimensionalResult;
  }

  const imageDataLength = await page.locator(selector).evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return 0;
    }
    return canvas.toDataURL('image/png').length;
  });
  return imageDataLength > 1000;
}

async function expectOrientationGizmoVisible(page: Page): Promise<void> {
  const proof = await page.evaluate(() => {
    const widget = document.querySelector(
      '#orientation-gizmo .orientation-gizmo-widget',
    );
    if (!(widget instanceof HTMLElement)) {
      throw new Error('orientation gizmo widget missing');
    }
    const rect = widget.getBoundingClientRect();
    return {
      devicePixelRatio: window.devicePixelRatio || 1,
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      targets: (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
        .orientationGizmo.clickTargets,
    };
  });
  const screenshot = await page.screenshot({ fullPage: true });
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(screenshot)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const width = info.width;
  const height = info.height;
  const dpr = proof.devicePixelRatio;
  const saturatedTargets = proof.targets.filter(
    (target: { x: number; y: number; view: string }) => {
      const centerX = Math.round((proof.rect.left + target.x) * dpr);
      const centerY = Math.round((proof.rect.top + target.y) * dpr);
      let saturatedPixels = 0;
      for (let y = centerY - 5; y <= centerY + 5; y += 1) {
        for (let x = centerX - 5; x <= centerX + 5; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) {
            continue;
          }
          const index = (y * width + x) * channels;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const max = Math.max(red, green, blue);
          const min = Math.min(red, green, blue);
          if (max > 95 && max - min > 45) {
            saturatedPixels += 1;
          }
        }
      }
      return saturatedPixels >= 8;
    },
  );
  expect(saturatedTargets.length).toBeGreaterThanOrEqual(3);
}

async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const executablePath = findSystemChromium();
    if (executablePath == null) {
      throw error;
    }
    return chromium.launch({
      args: ['--no-sandbox'],
      executablePath,
      headless: true,
    });
  }
}

function findSystemChromium(): string | undefined {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];
  return candidates.find((candidate) => existsSync(candidate));
}

function createBoxGltf({
  baseColor,
  max,
  min,
}: {
  baseColor: [number, number, number, number];
  max: [number, number, number];
  min: [number, number, number];
}) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const faces = [
    {
      normal: [0, 0, 1],
      vertices: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ],
      ],
    },
    {
      normal: [0, 0, -1],
      vertices: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ],
      ],
    },
    {
      normal: [-1, 0, 0],
      vertices: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ],
      ],
    },
    {
      normal: [1, 0, 0],
      vertices: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ],
      ],
    },
    {
      normal: [0, 1, 0],
      vertices: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ],
      ],
    },
    {
      normal: [0, -1, 0],
      vertices: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ],
      ],
    },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  faces.forEach((face, faceIndex) => {
    const offset = faceIndex * 4;
    for (const vertex of face.vertices) {
      positions.push(...vertex);
      normals.push(...face.normal);
    }
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
    );
  });

  const positionBuffer = Buffer.from(new Float32Array(positions).buffer);
  const normalBuffer = Buffer.from(new Float32Array(normals).buffer);
  const indexBuffer = Buffer.from(new Uint16Array(indices).buffer);
  const binary = Buffer.concat([positionBuffer, normalBuffer, indexBuffer]);

  return {
    asset: { generator: 'iwsdk editor e2e fixture', version: '2.0' },
    buffers: [
      {
        byteLength: binary.byteLength,
        uri: `data:application/octet-stream;base64,${binary.toString('base64')}`,
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteLength: positionBuffer.byteLength,
        byteOffset: 0,
        target: 34962,
      },
      {
        buffer: 0,
        byteLength: normalBuffer.byteLength,
        byteOffset: positionBuffer.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteLength: indexBuffer.byteLength,
        byteOffset: positionBuffer.byteLength + normalBuffer.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        max,
        min,
        type: 'VEC3',
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
      },
    ],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: baseColor,
          metallicFactor: 0,
          roughnessFactor: 0.62,
        },
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: {
              NORMAL: 1,
              POSITION: 0,
            },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}
