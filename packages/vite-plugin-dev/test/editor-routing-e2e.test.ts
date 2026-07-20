/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { iwsdkDev } from '../src/index.js';

interface JsonRpcResponse {
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
  _tabId?: string;
  _tabGeneration?: number;
}

interface PageRegistration {
  pageId: string;
  sceneSessionId?: string;
  tabGeneration: number;
}

let tempRoot: string;
let browser: Browser | undefined;
let commandSocket: WebSocket | undefined;
let server: ViteDevServer | undefined;
let previousManagedWorkspaceToken: string | undefined;
const EDITOR_STARTUP_TIMEOUT_MS = 30000;
const TEST_MANAGED_WORKSPACE_TOKEN = 'editor-routing-managed-workspace-token';
const MANAGED_WORKSPACE_HEADERS = {
  'x-iwsdk-managed-workspace': TEST_MANAGED_WORKSPACE_TOKEN,
};

beforeEach(async () => {
  previousManagedWorkspaceToken =
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-editor-routing-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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
  commandSocket?.close();
  commandSocket = undefined;
  await browser?.close();
  browser = undefined;
  await server?.close();
  server = undefined;
  await rm(tempRoot, { recursive: true, force: true });
}, 30000);

describe('native editor MCP routing E2E', () => {
  test('routes app and editor tool calls through one relay without stale page races', async () => {
    const scenePath = path.join(
      tempRoot,
      'public',
      'scenes',
      'routing-smoke.iwsdk.scene.json',
    );
    await writeFile(
      scenePath,
      JSON.stringify(
        {
          assets: [
            {
              bounds: { max: [1, 0.5, 1], min: [-1, 0, -1] },
              id: 'table',
              uri: '/assets/table.glb',
            },
            {
              bounds: { max: [0.12, 0.35, 0.12], min: [-0.12, 0, -0.12] },
              id: 'vase',
              uri: '/assets/vase.glb',
            },
            {
              bounds: { max: [0.25, 0.08, 0.18], min: [-0.25, 0, -0.18] },
              id: 'book',
              uri: '/assets/book.glb',
            },
            {
              bounds: { max: [0.15, 0.6, 0.15], min: [-0.15, 0, -0.15] },
              id: 'lamp',
              uri: '/assets/lamp.glb',
            },
            {
              bounds: { max: [0.45, 0.85, 0.45], min: [-0.45, 0, -0.45] },
              id: 'chair',
              uri: '/assets/chair.glb',
            },
            {
              bounds: { max: [0.2, 0.2, 0.2], min: [-0.2, 0, -0.2] },
              id: 'cube',
              uri: '/assets/cube.glb',
            },
          ],
          nodes: [
            {
              asset: 'table',
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
<div id="app-status">Loading</div>
<script type="module" src="/src/main.js"></script>`,
      'utf8',
    );
    await writeFile(
      path.join(tempRoot, 'src', 'main.js'),
      `
window.__APP_REQUESTS = [];
window.FRAMEWORK_MCP_RUNTIME = {
  handles() {
    return true;
  },
  async dispatch(method, params) {
    window.__APP_REQUESTS.push({method, params});
    return {handledBy: 'app', method, params};
  },
};
document.getElementById('app-status').textContent = 'Ready';
window.__APP_READY = true;
`,
      'utf8',
    );

    server = await createServer({
      logLevel: 'silent',
      plugins: [iwsdkDev({ ai: { mode: 'agent' } })],
      root: tempRoot,
      server: {
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
    const appErrors = collectPageErrors(appPage);
    const editorErrors = collectPageErrors(editorPage);
    await appPage.addInitScript(() => {
      (window as any).__IWER_MCP_MANAGED = true;
      (window as any).__IWSDK_MCP_PAGE_ROLE = 'app';
    });

    await appPage.goto(baseUrl!, { waitUntil: 'domcontentloaded' });
    await appPage.waitForFunction(() => (window as any).__APP_READY === true);

    await editorPage.goto(
      `${baseUrl!}__iwsdk/workspace?scene=public/scenes/routing-smoke.iwsdk.scene.json`,
      { waitUntil: 'domcontentloaded' },
    );
    await waitForEditorRuntime(editorPage, editorErrors, 'initial editor load');
    const editorRegistration = await readPageRegistration(editorPage);
    await appPage.waitForFunction(() => (window as any).__APP_READY === true);
    const appRegistration = await readPageRegistration(appPage);

    commandSocket = await connectCommandSocket(baseUrl!);

    const appResponse = await waitForSuccessfulRequest(commandSocket, () => ({
      method: 'app_ping',
      params: { value: 1 },
      target: {
        pageId: appRegistration.pageId,
        role: 'app',
        tabGeneration: appRegistration.tabGeneration,
      },
    }));
    expect(appResponse.result).toMatchObject({
      handledBy: 'app',
      method: 'app_ping',
      params: { value: 1 },
    });
    expect(appResponse._tabId).toBe(appRegistration.pageId);

    const editorResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_get_document',
        params: {},
        target: makeEditorTarget(editorRegistration),
      }),
    );
    expect(editorResponse.result).toMatchObject({
      document: {
        nodes: [{ id: 'table-1' }],
        version: 'iwsdk.scene.v1',
      },
      dirty: false,
    });
    expect(editorResponse._tabId).toBe(editorRegistration.pageId);

    const assetListResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_list_assets',
        params: {},
        target: makeEditorTarget(editorRegistration),
      }),
    );
    expect(
      (
        (assetListResponse.result as { assets?: Array<{ id?: string }> })
          .assets ?? []
      ).map((asset) => asset.id),
    ).toEqual(
      expect.arrayContaining([
        'table',
        'vase',
        'book',
        'lamp',
        'chair',
        'cube',
      ]),
    );

    for (const node of [
      {
        asset: 'vase',
        id: 'vase-1',
        transform: { position: [0.35, 0, 0.25] },
      },
      {
        asset: 'book',
        id: 'book-1',
        transform: { position: [-0.35, 0, -0.2] },
      },
      {
        asset: 'lamp',
        id: 'lamp-1',
        transform: { position: [1.4, 0, 0.6] },
      },
      {
        asset: 'chair',
        id: 'chair-1',
        transform: { position: [-1.5, 0, 0.7] },
      },
      {
        asset: 'cube',
        id: 'cube-1',
        transform: { position: [0, 0, -1.4] },
      },
    ]) {
      await waitForSuccessfulRequest(commandSocket, () => ({
        method: 'scene_add_node',
        params: { node },
        target: makeEditorTarget(editorRegistration),
      }));
    }

    for (const nodeId of ['vase-1', 'book-1']) {
      await waitForSuccessfulRequest(commandSocket, () => ({
        method: 'scene_place_on',
        params: { align: 'preserve-xz', nodeId, targetId: 'table-1' },
        target: makeEditorTarget(editorRegistration),
      }));
    }

    for (const [nodeId, target] of [
      ['chair-1', [0, 0.5, 0]],
      ['lamp-1', [0, 0.5, 0.8]],
    ] as const) {
      await waitForSuccessfulRequest(commandSocket, () => ({
        method: 'scene_look_at',
        params: { nodeId, target },
        target: makeEditorTarget(editorRegistration),
      }));
    }

    const toolScreenshotPayloads: string[] = [];
    for (const view of ['top', 'front', 'right', 'quarter'] as const) {
      const screenshotResponse = await waitForSuccessfulRequest(
        commandSocket,
        () => ({
          method: 'scene_screenshot',
          params: { height: 96, view, width: 96 },
          target: makeEditorTarget(editorRegistration),
        }),
      );
      expect(screenshotResponse.result).toMatchObject({
        camera: { view },
        mimeType: 'image/png',
      });
      const imageData = (screenshotResponse.result as { imageData?: string })
        .imageData;
      expect(imageData?.length).toBeGreaterThan(0);
      toolScreenshotPayloads.push(imageData ?? '');
    }
    expect(new Set(toolScreenshotPayloads).size).toBeGreaterThan(1);

    const validationResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_validate',
        params: {},
        target: makeEditorTarget(editorRegistration),
      }),
    );
    expect(validationResponse.result).toMatchObject({ valid: true });

    const saveResponse = await waitForSuccessfulRequest(commandSocket, () => ({
      method: 'scene_save',
      params: {},
      target: makeEditorTarget(editorRegistration),
    }));
    expect(saveResponse.result).toMatchObject({
      dirty: false,
      path: 'public/scenes/routing-smoke.iwsdk.scene.json',
    });

    const editorScreenshotResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_screenshot',
        params: { height: 96, view: 'top', width: 96 },
        target: makeEditorTarget(editorRegistration),
      }),
    );
    expect(editorScreenshotResponse.result).toMatchObject({
      camera: { view: 'top' },
      mimeType: 'image/png',
    });
    expect(
      (editorScreenshotResponse.result as { imageData?: string }).imageData
        ?.length,
    ).toBeGreaterThan(0);
    expect(editorScreenshotResponse._tabId).toBe(editorRegistration.pageId);

    await expect
      .poll(() =>
        appPage.evaluate(() =>
          (window as any).__APP_REQUESTS.map(
            (entry: { method: string }) => entry.method,
          ),
        ),
      )
      .toEqual(['app_ping']);

    await editorPage.reload({ waitUntil: 'domcontentloaded' });
    await waitForEditorRuntime(editorPage, editorErrors, 'editor reload');
    const reloadedEditorRegistration = await readPageRegistration(editorPage);
    expect(reloadedEditorRegistration.pageId).toBe(editorRegistration.pageId);
    expect(reloadedEditorRegistration.tabGeneration).toBeGreaterThan(
      editorRegistration.tabGeneration,
    );

    const staleResponse = await sendMcpRequest(commandSocket, {
      method: 'scene_screenshot',
      params: { view: 'top' },
      target: makeEditorTarget(editorRegistration),
    });
    expect(staleResponse).toMatchObject({
      error: { code: -32004 },
    });

    const freshHierarchyResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_get_hierarchy',
        params: {},
        target: makeEditorTarget(reloadedEditorRegistration),
      }),
    );
    expect(
      (
        (
          freshHierarchyResponse.result as {
            hierarchy?: Array<{ id?: string }>;
          }
        ).hierarchy ?? []
      ).map((node) => node.id),
    ).toEqual(['table-1', 'vase-1', 'book-1', 'lamp-1', 'chair-1', 'cube-1']);

    const freshEditorScreenshotResponse = await waitForSuccessfulRequest(
      commandSocket,
      () => ({
        method: 'scene_screenshot',
        params: { height: 96, view: 'current', width: 96 },
        target: makeEditorTarget(reloadedEditorRegistration),
      }),
    );
    expect(freshEditorScreenshotResponse.result).toMatchObject({
      camera: { view: 'quarter' },
      mimeType: 'image/png',
    });
    expect(
      (freshEditorScreenshotResponse.result as { imageData?: string }).imageData
        ?.length,
    ).toBeGreaterThan(0);
    expect(freshEditorScreenshotResponse._tabGeneration).toBe(
      reloadedEditorRegistration.tabGeneration,
    );

    expect(appErrors()).toEqual([]);
    expect(editorErrors()).toEqual([]);
  }, 60000);
});

function collectPageErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !isTransientViteLoadError(message.text())
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = `${request.method()} ${request.url()} ${
      request.failure()?.errorText ?? 'failed'
    }`;
    if (!isTransientViteLoadError(failure)) {
      errors.push(failure);
    }
  });
  return () => errors;
}

function isTransientViteLoadError(message: string): boolean {
  if (
    message ===
      'Failed to load resource: the server responded with a status of 500 (Internal Server Error)' ||
    message ===
      'Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)'
  ) {
    return true;
  }
  return (
    message.includes('net::ERR_ABORTED') &&
    (message.includes('/.vite/deps/') ||
      message.includes('/@fs/') ||
      message.includes('/@iwer-injection-runtime') ||
      message.includes('/@vite/client') ||
      message.includes('/src/main.js') ||
      /^GET https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/ net::ERR_ABORTED$/.test(
        message,
      ))
  );
}

async function waitForEditorRuntime(
  page: Page,
  getErrors: () => string[],
  label: string,
): Promise<void> {
  try {
    await page.waitForFunction(
      () => Boolean((window as any).IWSDK_SCENE_EDITOR),
      undefined,
      { timeout: EDITOR_STARTUP_TIMEOUT_MS },
    );
  } catch (error) {
    const diagnostics = await page
      .evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
        hasConfig: Boolean((window as any).__IWSDK_EDITOR_CONFIG),
        hasEditor: Boolean((window as any).IWSDK_SCENE_EDITOR),
        hasFrameworkRuntime: Boolean((window as any).FRAMEWORK_MCP_RUNTIME),
        hasTestHooks: Boolean((window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS),
        readyState: document.readyState,
        title: document.title,
        url: location.href,
      }))
      .catch((diagnosticError) => ({
        diagnosticError: String(diagnosticError),
      }));
    throw new Error(
      `${label} did not expose IWSDK_SCENE_EDITOR within ${EDITOR_STARTUP_TIMEOUT_MS}ms: ${String(
        error,
      )}\npage errors: ${JSON.stringify(
        getErrors(),
        null,
        2,
      )}\ndiagnostics: ${JSON.stringify(diagnostics, null, 2)}`,
    );
  }
}

async function readPageRegistration(page: Page): Promise<PageRegistration> {
  await page.waitForFunction(
    () => Boolean(sessionStorage.getItem('iwer-mcp-tab-id')),
    undefined,
    { timeout: EDITOR_STARTUP_TIMEOUT_MS },
  );
  return page.evaluate(() => {
    const pageId = sessionStorage.getItem('iwer-mcp-tab-id');
    const tabGeneration = Number(sessionStorage.getItem('iwer-mcp-gen'));
    if (!pageId || !Number.isFinite(tabGeneration)) {
      throw new Error('MCP page registration is missing');
    }
    return {
      pageId,
      sceneSessionId: (window as any).__IWSDK_SCENE_SESSION_ID,
      tabGeneration,
    };
  });
}

function makeEditorTarget(
  registration: PageRegistration,
): Record<string, unknown> {
  return {
    pageId: registration.pageId,
    role: 'editor',
    sceneSessionId: registration.sceneSessionId,
    tabGeneration: registration.tabGeneration,
  };
}

function connectCommandSocket(baseUrl: string): Promise<WebSocket> {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/__iwer_mcp';
  url.search = '';
  url.hash = '';

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out connecting to ${url.toString()}`));
    }, 10000);
    socket.once('open', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitForSuccessfulRequest(
  socket: WebSocket,
  createRequest: () => Omit<JsonRpcRequest, 'id'>,
): Promise<JsonRpcResponse> {
  const deadline = Date.now() + 10000;
  let lastResponse: JsonRpcResponse | undefined;
  while (Date.now() < deadline) {
    lastResponse = await sendMcpRequest(socket, createRequest());
    if (lastResponse.error == null) {
      return lastResponse;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for successful MCP response; last response: ${JSON.stringify(
      lastResponse,
    )}`,
  );
}

interface JsonRpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  target?: Record<string, unknown>;
}

function sendMcpRequest(
  socket: WebSocket,
  request: Omit<JsonRpcRequest, 'id'>,
): Promise<JsonRpcResponse> {
  const id = `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload: JsonRpcRequest = { id, ...request };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for MCP response ${id}`));
    }, 10000);

    const onMessage = (data: RawData) => {
      let response: JsonRpcResponse;
      try {
        response = JSON.parse(data.toString()) as JsonRpcResponse;
      } catch {
        return;
      }
      if (response.id !== id) {
        return;
      }
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(response);
    };

    socket.on('message', onMessage);
    socket.send(JSON.stringify(payload), (error) => {
      if (error) {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        reject(error);
      }
    });
  });
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
