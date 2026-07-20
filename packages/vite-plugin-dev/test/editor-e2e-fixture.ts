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
import { chromium, type Browser, type Page } from 'playwright';
import { createServer } from 'vite';
import { expect } from 'vitest';
import { iwsdkDev } from '../src/index.js';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
export const EDITOR_SCENE_RELATIVE_PATH =
  'public/scenes/editor-smoke.iwsdk.scene.json';
export const TEST_MANAGED_WORKSPACE_TOKEN =
  'editor-e2e-managed-workspace-token';
export const MANAGED_WORKSPACE_HEADERS = {
  'x-iwsdk-managed-workspace': TEST_MANAGED_WORKSPACE_TOKEN,
};

export interface EditorPageContext {
  errors: () => string[];
  failedRequests: string[];
  page: Page;
  responses: Array<{ status: number; url: string }>;
}

export interface EditorTestHarness {
  baseUrl: string;
  browser: Browser;
  close(): Promise<void>;
  openApp(): Promise<EditorPageContext>;
  openEditor(): Promise<EditorPageContext>;
  readScene(): Promise<any>;
  scenePath: string;
  tempRoot: string;
}

export async function createEditorTestHarness(
  prefix: string,
): Promise<EditorTestHarness> {
  const tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  await writeFixtureProject(tempRoot);
  const server = await createServer({
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
  if (!baseUrl) {
    throw new Error('Vite did not report a local URL');
  }
  const browser = await launchChromium();
  const scenePath = path.join(tempRoot, EDITOR_SCENE_RELATIVE_PATH);

  return {
    baseUrl,
    browser,
    async close() {
      await browser.close();
      await server.close();
      await rm(tempRoot, { force: true, recursive: true });
    },
    async openApp() {
      const context = await newPageContext(browser);
      await context.page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await context.page.waitForFunction(
        () => (window as any).__APP_RUNTIME_PROOF != null,
        undefined,
        { timeout: 30000 },
      );
      return context;
    },
    async openEditor() {
      const context = await newPageContext(browser, {
        managedWorkspace: true,
      });
      await context.page.goto(
        `${baseUrl}__iwsdk/workspace?scene=${EDITOR_SCENE_RELATIVE_PATH}`,
        { waitUntil: 'domcontentloaded' },
      );
      await waitForEditorReady(context.page, context.errors);
      return context;
    },
    async readScene() {
      return JSON.parse(await readFile(scenePath, 'utf8'));
    },
    scenePath,
    tempRoot,
  };
}

export async function getEditorProof(page: Page): Promise<any> {
  return page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
  );
}

export async function dispatchSceneTool(
  page: Page,
  method: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  return page.evaluate(
    ({ method: toolMethod, params: toolParams }) =>
      (window as any).IWSDK_SCENE_EDITOR.runtime.dispatch(
        toolMethod,
        toolParams,
      ),
    { method, params },
  );
}

export async function selectNode(page: Page, nodeId: string): Promise<void> {
  await page.locator(`[data-node-id="${nodeId}"]`).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
            .transformControls?.attachedNodeId,
      ),
    )
    .toBe(nodeId);
}

export async function expectRealWebGLViewport(
  context: EditorPageContext,
): Promise<any> {
  await expect
    .poll(() =>
      context.page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof().worldReady,
      ),
    )
    .toBe(true);
  const proof = await getEditorProof(context.page);
  expect(proof).toMatchObject({
    renderer: 'iwsdk-webgl',
    uses2DRenderer: false,
    webgl: true,
    worldReady: true,
  });
  expect(proof.meshCount).toBeGreaterThan(0);
  expect(proof.nodeObjectCount).toBeGreaterThan(0);

  const canvasProof = await context.page
    .locator('#scene-canvas')
    .evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        return { isCanvas: false };
      }
      const webgl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      return {
        height: canvas.height,
        isCanvas: true,
        twoD: Boolean(canvas.getContext('2d')),
        webgl: Boolean(webgl),
        width: canvas.width,
      };
    });
  expect(canvasProof).toMatchObject({
    isCanvas: true,
    twoD: false,
    webgl: true,
  });
  expect(canvasProof.width).toBeGreaterThan(100);
  expect(canvasProof.height).toBeGreaterThan(100);
  expect(await hasNonBlankCanvas(context.page, '#scene-canvas')).toBe(true);
  expect(context.errors()).toEqual([]);
  expect(
    context.failedRequests.filter(
      (entry) =>
        !entry.includes('/favicon.ico') && !entry.includes('/.well-known/'),
    ),
  ).toEqual([]);
  return proof;
}

export function hashImageData(imageData: string): string {
  return createHash('sha256').update(imageData).digest('hex');
}

async function writeFixtureProject(tempRoot: string): Promise<void> {
  await mkdir(path.join(tempRoot, 'public', 'audio'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'scenes'), { recursive: true });
  await mkdir(path.join(tempRoot, 'src'), { recursive: true });
  await writeFile(
    path.join(tempRoot, 'public', 'audio', 'ambient.wav'),
    createSilentWav(),
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
    path.join(tempRoot, EDITOR_SCENE_RELATIVE_PATH),
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
        componentSchemas: [
          {
            fields: {
              enabled: { default: true, type: 'Boolean' },
              label: { default: 'Inspectable', type: 'String' },
              offset: { default: [0, 0, 0], type: 'Vec3' },
              strength: { default: 0.5, max: 1, min: 0, type: 'Float32' },
            },
            id: 'TestInspectable',
            source: 'scene',
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
    color: #f7fbff;
    font: 13px system-ui, sans-serif;
    left: 12px;
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
    appFixtureSource(),
    'utf8',
  );
}

function createSilentWav(): Buffer {
  const channelCount = 1;
  const sampleRate = 8000;
  const bitsPerSample = 16;
  const sampleCount = Math.floor(sampleRate * 0.1);
  const blockAlign = (channelCount * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function appFixtureSource(): string {
  const coreImportUrl = `/@fs/${path
    .join(REPO_ROOT, 'packages/core/src/index.ts')
    .replace(/\\/g, '/')}`;
  return `
import { LevelTag, Transform, World } from ${JSON.stringify(coreImportUrl)};

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
    .map((entity) => ({
      components: entity
        .getComponents()
        .filter(Boolean)
        .map((component) => component.id)
        .sort(),
      id: entity.object3D.userData.iwsdkSceneNodeId,
      position: roundVec3(entity.object3D.position.toArray()),
      transformParentIndex: entity.getValue(Transform, 'parent')?.index ?? null,
    }))
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
`;
}

async function newPageContext(
  browser: Browser,
  options: { managedWorkspace?: boolean } = {},
): Promise<EditorPageContext> {
  const context = await browser.newContext({
    ...(options.managedWorkspace
      ? { extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS }
      : {}),
    viewport: { height: 720, width: 960 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const failedRequests: string[] = [];
  const responses: Array<{ status: number; url: string }> = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${
        request.failure()?.errorText ?? 'failed'
      }`,
    );
  });
  page.on('response', (response) => {
    responses.push({ status: response.status(), url: response.url() });
  });

  return {
    errors: () => [...errors],
    failedRequests,
    page,
    responses,
  };
}

async function waitForEditorReady(
  page: Page,
  getErrors: () => string[],
): Promise<void> {
  const result = await page
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
      { timeout: 20000 },
    )
    .then(
      (handle) =>
        handle.jsonValue() as Promise<{
          error?: string | null;
          ready: boolean;
        }>,
    );

  if (!result.ready) {
    throw new Error(
      `Editor failed to initialize: ${
        result.error ?? '<no error text>'
      }\n${getErrors().join('\n')}`,
    );
  }
}

async function hasNonBlankCanvas(
  page: Page,
  selector: string,
): Promise<boolean> {
  const imageDataLength = await page.locator(selector).evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return 0;
    }
    return canvas.toDataURL('image/png').length;
  });
  return imageDataLength > 1000;
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
    asset: { generator: 'iwsdk editor e2e fixture', version: '2.0' },
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
    buffers: [
      {
        byteLength: binary.byteLength,
        uri: `data:application/octet-stream;base64,${binary.toString('base64')}`,
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
