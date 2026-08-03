/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type Page } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'vite';
import { expect } from 'vitest';
import { iwsdkDev } from '../src/index.js';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const fixtureRequire = createRequire(import.meta.url);
const coreRequire = createRequire(
  fixtureRequire.resolve('@iwsdk/core/package.json'),
);
const uikitRequire = createRequire(
  coreRequire.resolve('@pmndrs/uikit/package.json'),
);
const MSDF_GENERATOR_ENTRY = path.join(
  path.dirname(uikitRequire.resolve('@zappar/msdf-generator/worker.js')),
  'index.js',
);
const SCENE_COMPOSITION_ENTRY = fixtureRequire.resolve(
  '@iwsdk/scene-composition',
);
const CORE_PROJECT_ENTRY = path.join(
  REPO_ROOT,
  'packages/core/src/project/index.ts',
);
const THREE_PACKAGE_ROOT = path.resolve(
  path.dirname(fixtureRequire.resolve('three')),
  '..',
);
const THREE_ENTRY = path.join(THREE_PACKAGE_ROOT, 'build/three.module.js');
const THREE_VIEWPORT_GIZMO_ENTRY = fixtureRequire.resolve(
  'three-viewport-gizmo',
);
const ORBIT_CONTROLS_ENTRY = fixtureRequire.resolve(
  'three/examples/jsm/controls/OrbitControls.js',
);
const TRANSFORM_CONTROLS_ENTRY = fixtureRequire.resolve(
  'three/examples/jsm/controls/TransformControls.js',
);
export const EDITOR_SCENE_RELATIVE_PATH =
  'public/scenes/editor-smoke.iwsdk.scene.json';
export const EDITOR_REFERENCE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#dbeafe"/><circle cx="32" cy="32" r="18" fill="#c96d52"/></svg>';
export const EDITOR_GARDEN_REFERENCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">
  <rect width="512" height="384" fill="#d9e4d2"/>
  <rect x="0" y="0" width="512" height="185" fill="#5d7a45"/>
  <path d="M72 384 128 190 395 190 456 384Z" fill="#8b8173"/>
  <path d="M231 384 247 198 286 198 310 384Z" fill="#a39a8b"/>
  <g fill="#355d31"><circle cx="45" cy="138" r="52"/><circle cx="465" cy="142" r="60"/><circle cx="345" cy="95" r="54"/><circle cx="170" cy="105" r="45"/></g>
  <g fill="#486f3b"><circle cx="80" cy="210" r="35"/><circle cx="430" cy="218" r="38"/><circle cx="350" cy="172" r="31"/></g>
  <g fill="#8b5d3e" stroke="#4b3527" stroke-width="6"><path d="M142 248h78l-8 56h-62z"/><path d="m146 246 7-58h64l2 58"/><path d="M316 248h78l-8 56h-62z"/><path d="m320 246 7-58h64l2 58"/></g>
  <g fill="#7c5439" stroke="#4b3527" stroke-width="5"><ellipse cx="268" cy="263" rx="42" ry="16"/><rect x="260" y="264" width="16" height="42"/></g>
  <g fill="#b9783f" stroke="#6a472d" stroke-width="4"><ellipse cx="252" cy="322" rx="42" ry="22"/><circle cx="291" cy="307" r="19"/><path d="M215 320q-30-28-36-2" fill="none" stroke-width="9"/><rect x="228" y="333" width="9" height="31"/><rect x="270" y="333" width="9" height="31"/></g>
  <g fill="#d9849d"><circle cx="36" cy="265" r="7"/><circle cx="65" cy="294" r="7"/><circle cx="105" cy="252" r="7"/><circle cx="419" cy="274" r="7"/><circle cx="456" cy="303" r="7"/><circle cx="482" cy="255" r="7"/></g>
  <rect x="458" y="15" width="18" height="120" fill="#6b4930"/><circle cx="467" cy="28" r="70" fill="#48703b"/>
</svg>`;
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

export interface EditorTestHarnessOptions {
  managedBrowser?: boolean;
}

export async function createEditorTestHarness(
  prefix: string,
  options: EditorTestHarnessOptions = {},
): Promise<EditorTestHarness> {
  const tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  await writeFixtureProject(tempRoot, options);
  const previousAiMode = process.env.IWSDK_DEV_AI_MODE;
  const previousOpen = process.env.IWSDK_DEV_OPEN;
  if (options.managedBrowser) {
    process.env.IWSDK_DEV_AI_MODE = 'agent';
    delete process.env.IWSDK_DEV_OPEN;
  } else {
    delete process.env.IWSDK_DEV_AI_MODE;
    process.env.IWSDK_DEV_OPEN = 'false';
  }
  let server: Awaited<ReturnType<typeof createServer>>;
  try {
    server = await createServer({
      cacheDir: path.join(tempRoot, '.vite'),
      logLevel: 'silent',
      plugins: [iwsdkDev()],
      resolve: {
        // The fixture uses IWSDK source from outside its temporary app root,
        // whereas a real installed app resolves this transitive dependency from
        // its own node_modules directory.
        alias: [
          {
            find: '@iwsdk/core/project',
            replacement: CORE_PROJECT_ENTRY,
          },
          {
            find: '@iwsdk/scene-composition',
            replacement: SCENE_COMPOSITION_ENTRY,
          },
          {
            find: 'three-viewport-gizmo',
            replacement: THREE_VIEWPORT_GIZMO_ENTRY,
          },
          {
            find: 'three/examples/jsm/controls/OrbitControls.js',
            replacement: ORBIT_CONTROLS_ENTRY,
          },
          {
            find: 'three/examples/jsm/controls/TransformControls.js',
            replacement: TRANSFORM_CONTROLS_ENTRY,
          },
          {
            find: /^three\/(.*)$/,
            replacement: `${THREE_PACKAGE_ROOT}/$1`,
          },
          { find: /^three$/, replacement: THREE_ENTRY },
          {
            find: '@zappar/msdf-generator',
            replacement: MSDF_GENERATOR_ENTRY,
          },
        ],
      },
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
  } finally {
    if (previousAiMode == null) {
      delete process.env.IWSDK_DEV_AI_MODE;
    } else {
      process.env.IWSDK_DEV_AI_MODE = previousAiMode;
    }
    if (previousOpen == null) {
      delete process.env.IWSDK_DEV_OPEN;
    } else {
      process.env.IWSDK_DEV_OPEN = previousOpen;
    }
  }
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
      await context.page
        .waitForFunction(
          () => (window as any).__APP_RUNTIME_PROOF != null,
          undefined,
          { timeout: 30000 },
        )
        .catch((error) => {
          throw new Error(
            `App fixture did not become ready: ${String(error)}\n${context
              .errors()
              .join('\n')}\n${context.failedRequests.join('\n')}`,
          );
        });
      return context;
    },
    async openEditor() {
      const context = await newPageContext(browser, {
        managedWorkspace: true,
      });
      await context.page.goto(`${baseUrl}__iwsdk/workspace`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForEditorReady(context.page, context.errors);
      await context.page
        .locator('[data-workspace-view-button="editor"]')
        .click();
      await context.page.waitForFunction(
        () => document.documentElement.dataset.iwsdkWorkspaceView === 'editor',
      );
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

export async function addComponentViaPicker(
  page: Page,
  componentId: string,
): Promise<void> {
  await page.locator('#add-component').click();
  const dialog = page.locator('#component-picker-dialog');
  await expect.poll(() => dialog.getAttribute('open')).not.toBeNull();
  await dialog.locator('#component-picker-search').fill(componentId);
  await dialog
    .locator(`[data-component-picker-option="${componentId}"]`)
    .click();
  await expect.poll(() => dialog.getAttribute('open')).toBeNull();
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
      const debugInfo = webgl?.getExtension('WEBGL_debug_renderer_info');
      return {
        height: canvas.height,
        isCanvas: true,
        renderer: debugInfo
          ? webgl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : null,
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
  expect(String(canvasProof.renderer).toLowerCase()).not.toContain(
    'swiftshader',
  );
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

async function writeFixtureProject(
  tempRoot: string,
  _options: EditorTestHarnessOptions,
): Promise<void> {
  await mkdir(path.join(tempRoot, 'public', 'audio'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'scenes'), { recursive: true });
  await mkdir(path.join(tempRoot, 'public', 'ui'), { recursive: true });
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
    path.join(tempRoot, 'public', 'assets', 'reference.svg'),
    EDITOR_REFERENCE_SVG,
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, 'public', 'assets', 'garden-reference.svg'),
    EDITOR_GARDEN_REFERENCE_SVG,
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, 'public', 'ui', 'welcome.uikitml'),
    `<style>
  .panel { flex-direction: column; padding: 18px; width: 240px; background-color: #f5f7fa; border-radius: 14px; }
  .title { color: #18202a; font-size: 24px; font-weight: 700; margin-bottom: 8px; }
  .body { color: #425466; font-size: 14px; }
</style>
<div class="panel">
  <div id="title" class="title">Welcome panel</div>
  <div class="body">A UIKitML asset rendered by the editor.</div>
</div>`,
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, EDITOR_SCENE_RELATIVE_PATH),
    JSON.stringify(
      {
        components: {
          'com.iwsdk.components.DomeGradient': {
            equator: [0.6584, 0.7084, 0.7913, 1],
            ground: [0.807, 0.7758, 0.7454, 1],
            intensity: 1,
            sky: [0.2423, 0.6172, 0.8308, 1],
          },
          'com.iwsdk.components.IBLGradient': {
            equator: [0.6584, 0.7084, 0.7913, 1],
            ground: [0.807, 0.7758, 0.7454, 1],
            intensity: 1,
            sky: [0.6902, 0.749, 0.7843, 1],
          },
        },
        nodes: [
          {
            content: { asset: 'table', type: 'asset' },
            id: 'table-1',
            transform: { position: [0, 0, 0] },
          },
        ],
        resources: {},
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
    path.join(tempRoot, 'src', 'assets.js'),
    assetManifestFixtureSource(),
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, 'src', 'components.js'),
    componentManifestFixtureSource(),
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, 'src', 'main.js'),
    appFixtureSource(),
    'utf8',
  );
  await writeFile(
    path.join(tempRoot, 'iwsdk.config.json'),
    `${JSON.stringify(
      {
        version: 'iwsdk.project.v1',
        scene: `./${EDITOR_SCENE_RELATIVE_PATH}`,
        assets: { module: './src/assets' },
        components: { module: './src/components' },
        world: {
          xr: false,
          input: { canvasPointerEvents: false },
          render: {
            camera: { lookAt: [0, 0, 0], position: [3, 2.5, 5] },
          },
          features: {
            camera: false,
            environmentRaycast: false,
            grabbing: false,
            locomotion: false,
            physics: false,
            sceneUnderstanding: false,
            spatialUI: true,
          },
        },
        dev: {
          emulator: { iwer: true },
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function componentManifestFixtureSource(): string {
  const coreImportUrl = `/@fs/${path
    .join(REPO_ROOT, 'packages/core/src/index.ts')
    .replace(/\\/g, '/')}`;
  return `
import { createComponent, defineComponents, Types } from ${JSON.stringify(coreImportUrl)};

export const TestInspectable = createComponent('TestInspectable', {
  enabled: { default: true, type: Types.Boolean },
  label: { default: 'Inspectable', type: Types.String },
  offset: { default: [0, 0, 0], type: Types.Vec3 },
  strength: { default: 0.5, max: 1, min: 0, type: Types.Float32 },
});

export default defineComponents([TestInspectable]);
`;
}

function assetManifestFixtureSource(): string {
  const coreImportUrl = `/@fs/${path
    .join(REPO_ROOT, 'packages/core/src/index.ts')
    .replace(/\\/g, '/')}`;
  return `
import {
  AssetType,
  BoxGeometry,
  defineAssets,
  Mesh,
  MeshStandardMaterial,
} from ${JSON.stringify(coreImportUrl)};

const proceduralPlinth = new Mesh(
  new BoxGeometry(0.6, 0.2, 0.6),
  new MeshStandardMaterial({ color: 0x2f7d69, roughness: 0.7 }),
);
proceduralPlinth.name = 'Procedural plinth';

export default defineAssets({
  table: {
    name: 'Table',
    type: AssetType.GLTF,
    url: '/assets/table.gltf',
  },
  vase: {
    name: 'Vase',
    type: AssetType.GLTF,
    url: '/assets/vase.gltf',
  },
  'welcome-panel': {
    name: 'Welcome panel',
    type: AssetType.UIKitML,
    url: '/ui/welcome.uikitml',
  },
  'procedural-plinth': proceduralPlinth,
});
`;
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
import projectOptions from 'virtual:iwsdk-project';

const host = document.getElementById('app-root');
const status = document.getElementById('app-status');

function roundVec3(values) {
  return Array.from(values).map((value) => Number(value.toFixed(4)));
}

function primitiveGeometryProof(object) {
  if (object.isMesh !== true || !object.geometry) {
    return null;
  }
  const parameters = object.geometry.parameters || {};
  return {
    depth: parameters.depth ?? null,
    height: parameters.height ?? null,
    radius: parameters.radius ?? null,
    radiusBottom: parameters.radiusBottom ?? null,
    radiusTop: parameters.radiusTop ?? null,
    type: object.geometry.type,
    width: parameters.width ?? null,
  };
}

function primitiveMaterialProof(object) {
  if (object.isMesh !== true || !object.material) {
    return null;
  }
  const material = Array.isArray(object.material)
    ? object.material[0]
    : object.material;
  return {
    color: material?.color ? '#' + material.color.getHexString() : null,
    metalness: material?.metalness ?? null,
    opacity: material?.opacity ?? null,
    roughness: material?.roughness ?? null,
    transparent: material?.transparent ?? null,
    type: material?.type ?? null,
  };
}

function sceneNodeObjects(world) {
  const nodes = [];
  world.getActiveRoot().traverse((object) => {
    const nodeId = object.userData?.iwsdkSceneNodeId;
    if (
      typeof nodeId !== 'string' ||
      object.parent?.userData?.iwsdkSceneNodeId === nodeId
    ) {
      return;
    }
    nodes.push({
      assetId: object.userData.iwsdkSceneAssetId,
      castShadow: object.castShadow,
      geometry: primitiveGeometryProof(object),
      id: nodeId,
      isMesh: object.isMesh === true,
      material: primitiveMaterialProof(object),
      name: object.name,
      position: roundVec3(object.position.toArray()),
      primitive: object.userData.iwsdkScenePrimitive ?? null,
      primitiveType:
        object.userData.iwsdkScenePrimitive?.geometry?.type ??
        object.userData.iwsdkScenePrimitive?.type ??
        null,
      receiveShadow: object.receiveShadow,
      rotationDeg: roundVec3(
        object.rotation.toArray().slice(0, 3).map((value) => value * 180 / Math.PI),
      ),
      runtimeHash: object.userData.iwsdkSceneRuntimeHash ?? null,
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
  const world = await World.create(host, projectOptions);
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
    ignoreHTTPSErrors: true,
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

export async function hasNonBlankCanvas(
  page: Page,
  selector: string,
): Promise<boolean> {
  const imageData =
    selector === '#scene-canvas'
      ? await page.evaluate(async () => {
          const runtime = (window as any).IWSDK_SCENE_EDITOR?.runtime;
          if (runtime == null) {
            return '';
          }
          const result = await runtime.dispatch('scene_screenshot', {
            view: 'current',
          });
          return result?.imageData ?? '';
        })
      : await page.locator(selector).evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) {
            return '';
          }
          const appWorld = (window as any).__APP_WORLD;
          if (canvas.id === 'app-canvas' && appWorld?.renderer?.render) {
            appWorld.renderer.render(appWorld.scene, appWorld.camera);
          }
          return canvas.toDataURL('image/png');
        });
  const encoded = imageData.includes(',')
    ? imageData.split(',', 2)[1]
    : imageData;
  if (encoded == null || encoded.length < 1000) {
    return false;
  }

  const { data, info } = await sharp(Buffer.from(encoded, 'base64'))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let minLuminance = 255;
  let maxLuminance = 0;
  for (let offset = 0; offset < data.length; offset += channels) {
    const red = data[offset] ?? 0;
    const green = data[offset + Math.min(1, channels - 1)] ?? red;
    const blue = data[offset + Math.min(2, channels - 1)] ?? red;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
  }
  return maxLuminance - minLuminance > 8;
}

async function launchChromium(): Promise<Browser> {
  return chromium.launch({
    args: ['--enable-webgl', '--use-angle=metal'],
    channel: 'chromium',
    headless: true,
  });
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
