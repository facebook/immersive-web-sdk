/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { access, mkdtemp, readFile, rm, stat } from 'fs/promises';
import { createServer, type Server } from 'http';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  collectRuntimePreflightEvidence,
  collectRuntimePublishEvidence,
  launchManagedBrowser,
  type ManagedBrowser,
} from '../src/headless-browser.js';
import {
  restoreWorkspaceView,
  showWorkspaceRuntime,
} from '../src/managed-browser/application-surface.js';

const DOCUMENT_HASH = 'document-hash-for-evidence';
const RUNTIME_HASH = 'runtime-hash-for-evidence';
const EDITOR_CAPTURE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z8DwH4QZYAwAR8oH+Xm0fdIAAAAASUVORK5CYII=';
const EDITOR_CAPTURE_SHA256 = `sha256:${createHash('sha256')
  .update(Buffer.from(EDITOR_CAPTURE_BASE64, 'base64'))
  .digest('hex')}`;
const MANAGED_ACCESS_HEADER = 'x-iwsdk-managed-workspace';
const MANAGED_ACCESS_QUERY = '__iwsdkManagedWorkspace';
const MANAGED_ACCESS_TOKEN = 'workspace-evidence-access-token';

interface AccessRecord {
  accessHeader?: string;
  accessQuery?: string;
  host: 'attacker' | 'managed';
  pathname: string;
  referer?: string;
}

const WORKSPACE_HTML = `<!doctype html>
<html data-iwsdk-workspace-view="editor">
  <body>
    <nav class="workspace-view-switcher" style="background:#ff00ff;height:40px;position:fixed;right:0;top:0;width:80px;z-index:30">
      <button data-workspace-view-button="runtime">Runtime</button>
      <button data-workspace-view-button="editor">Editor</button>
    </nav>
    <main id="editor">
      Editor view
      <input id="editor-focus" aria-label="Editor focus" />
    </main>
    <iframe id="workspace-runtime-frame" title="Application runtime" src="/runtime" width="800" height="600" style="border: 0"></iframe>
    <img alt="attacker probe" src="__ATTACKER_ORIGIN__/pixel.png" />
    <script>
      window.__IWSDK_SCENE_EDITOR_READY = true;
      window.__IWSDK_WORKSPACE_RUNTIME_READY = true;
      const recordDispatch = (owner, method) => {
        const calls = JSON.parse(localStorage.getItem('evidence-dispatches') || '[]');
        calls.push(owner + ':' + method);
        localStorage.setItem('evidence-dispatches', JSON.stringify(calls));
      };
      window.IWSDK_SCENE_EDITOR = {
        runtime: {},
        session: {
          isDirty: false,
          dispatch: async (method, params) => {
            recordDispatch('editor', method);
            if (method === 'scene_get_document') {
              return {
                documentHash: ${JSON.stringify(DOCUMENT_HASH)},
                runtimeHash: ${JSON.stringify(RUNTIME_HASH)},
              };
            }
            if (method === 'scene_get_render_stats') {
              return { available: true, meshCount: 2, source: 'editor' };
            }
            if (method === 'scene_capture_review') {
              localStorage.setItem('evidence-hero-view', params.viewId || '');
              return {
                imageData: ${JSON.stringify(EDITOR_CAPTURE_BASE64)},
                renderStats: { available: true, meshCount: 2, source: 'capture' },
                screenshotSha256: ${JSON.stringify(EDITOR_CAPTURE_SHA256)},
                viewId: params.viewId || null,
              };
            }
            throw new Error('Unexpected editor dispatch: ' + method);
          },
        },
      };
      const editor = document.querySelector('#editor');
      const frame = document.querySelector('#workspace-runtime-frame');
      const setView = (view) => {
        document.documentElement.dataset.iwsdkWorkspaceView = view;
        editor.style.display = view === 'editor' ? 'block' : 'none';
        frame.style.display = view === 'runtime' ? 'block' : 'none';
      };
      for (const button of document.querySelectorAll('[data-workspace-view-button]')) {
        button.addEventListener('click', () => setView(button.dataset.workspaceViewButton));
      }
      window.keyboardEvents = [];
      for (const type of ['keydown', 'keyup']) {
        document.addEventListener(type, (event) => {
          window.keyboardEvents.push({
            code: event.code,
            targetId: event.target?.id || null,
            type: event.type,
          });
        });
      }
      setView('editor');
      console.log('editor evidence fixture ready');
    </script>
  </body>
</html>`;

const RUNTIME_HTML = `<!doctype html>
<html>
  <body>
    <form id="form">
      <label for="workspace-name">Name</label>
      <input id="workspace-name" />
      <label><input id="enabled" type="checkbox" /> Enabled</label>
      <label for="mode">Mode</label>
      <select id="mode"><option>basic</option><option>advanced</option></select>
      <label for="level">Level</label>
      <input id="level" type="range" min="0" max="10" value="5" />
      <button type="submit">Submit</button>
    </form>
    <output id="status">idle</output>
    <canvas id="surface" width="200" height="100" aria-label="Workspace canvas"></canvas>
    <canvas id="gl-surface" width="300" height="150" aria-label="WebGL canvas"></canvas>
    <script>
      window.IWER_DEVICE = {};
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
        const count = Number(sessionStorage.getItem('evidence-raf-count') || '0') + 1;
        sessionStorage.setItem('evidence-raf-count', String(count));
        callback(timestamp);
      });
      window.__IWSDK_MCP_PAGE_ID = 'workspace-runtime';
      const generation = Number(sessionStorage.getItem('workspace-generation') || '0') + 1;
      sessionStorage.setItem('workspace-generation', String(generation));
      window.__IWSDK_MCP_TAB_GENERATION = generation;
      window.keyboardEvents = [];
      for (const type of ['keydown', 'keyup']) {
        document.addEventListener(type, (event) => {
          window.keyboardEvents.push({
            code: event.code,
            targetId: event.target?.id || null,
            type: event.type,
          });
        });
      }
      const recordDispatch = (method) => {
        const calls = JSON.parse(localStorage.getItem('evidence-dispatches') || '[]');
        calls.push('runtime:' + method);
        localStorage.setItem('evidence-dispatches', JSON.stringify(calls));
      };
      const hierarchy = {
        children: [{
          children: [],
          entityIndex: 7,
          name: 'Evidence Node',
          runtimeHash: ${JSON.stringify(RUNTIME_HASH)},
          sceneNodeId: 'node-1',
        }],
        name: 'Evidence Root',
        runtimeHash: ${JSON.stringify(RUNTIME_HASH)},
      };
      window.evidenceHierarchyCalls = 0;
      window.FRAMEWORK_MCP_RUNTIME = {
        handles: (method) =>
          method === 'get_render_stats' || method === 'ecs_query_entity',
        dispatch: async (method, params) => {
          recordDispatch(method);
          if (method === 'get_scene_hierarchy') {
            window.evidenceHierarchyCalls += 1;
            const mode = localStorage.getItem('evidence-runtime-mode');
            if (mode === 'never-ready') {
              return { children: [], name: 'Not Ready Root' };
            }
            if (
              mode === 'missing-hash-once' &&
              window.evidenceHierarchyCalls === 1
            ) {
              return {
                children: [{ ...hierarchy.children[0], runtimeHash: undefined }],
                name: hierarchy.name,
              };
            }
            if (
              mode === 'missing-node-once' &&
              window.evidenceHierarchyCalls === 1
            ) {
              return { children: [], name: hierarchy.name, runtimeHash: ${JSON.stringify(RUNTIME_HASH)} };
            }
            return hierarchy;
          }
          if (method === 'get_render_stats') {
            const framingMode = localStorage.getItem('evidence-framing-mode');
            return {
              available: true,
              calls: 1,
              ...(framingMode === 'unavailable'
                ? {}
                : {
                    framingBounds:
                      framingMode === 'degenerate'
                        ? { min: [0, 0, 0], max: [0, 0, 0] }
                        : { min: [-1, -1, -1], max: [1, 1, 1] },
                  }),
              meshCount: 2,
            };
          }
          if (method === 'get_object_transform') {
            return { nodeId: params.nodeId, position: [1, 2, 3] };
          }
          if (method === 'ecs_query_entity') {
            return { components: [{ id: 'Transform' }], entityIndex: params.entityIndex };
          }
          throw new Error('Unexpected runtime dispatch: ' + method);
        },
        world: { camera: null, renderer: { domElement: null } },
      };
      window.workspaceState = { canvasClicks: 0, drags: 0, submits: 0 };
      document.querySelector('#form').addEventListener('submit', (event) => {
        event.preventDefault();
        window.workspaceState.submits += 1;
        history.pushState({}, '', '/runtime/submitted?done=1#ok');
        document.querySelector('#status').textContent =
          document.querySelector('#workspace-name').value + ':submitted';
      });
      document.querySelector('#workspace-name').addEventListener('keydown', (event) => {
        if (event.key === 'Escape') document.querySelector('#status').textContent = 'escaped';
      });
      const surface = document.querySelector('#surface');
      const surfaceContext = surface.getContext('2d');
      surfaceContext.fillStyle = '#ef4444';
      surfaceContext.fillRect(0, 0, surface.width / 2, surface.height);
      surfaceContext.fillStyle = '#3b82f6';
      surfaceContext.fillRect(
        surface.width / 2,
        0,
        surface.width / 2,
        surface.height,
      );
      let dragging = false;
      let moved = false;
      surface.addEventListener('click', () => window.workspaceState.canvasClicks += 1);
      surface.addEventListener('pointerdown', () => {
        dragging = true;
        moved = false;
      });
      surface.addEventListener('pointermove', () => {
        if (dragging) moved = true;
      });
      surface.addEventListener('pointerup', () => {
        if (dragging && moved) window.workspaceState.drags += 1;
        dragging = false;
      });
      const glSurface = document.querySelector('#gl-surface');
      const gl = glSurface.getContext('webgl');
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, glSurface.width / 2, glSurface.height);
      gl.clearColor(1, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.scissor(
        glSurface.width / 2,
        0,
        glSurface.width / 2,
        glSurface.height,
      );
      gl.clearColor(0, 0, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
      window.FRAMEWORK_MCP_RUNTIME.world.renderer.domElement = glSurface;
    </script>
    <script type="module">
      import { PerspectiveCamera } from '/three.module.js';
      const camera = new PerspectiveCamera(60, 2, 0.1, 100);
      const setCamera = (mode) => {
        localStorage.setItem('evidence-framing-mode', mode);
        camera.position.set(0, 0, 5);
        camera.lookAt(mode === 'away' ? 0 : 0, 0, mode === 'away' ? 10 : 0);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
      };
      setCamera('normal');
      window.setEvidenceFramingMode = setCamera;
      window.FRAMEWORK_MCP_RUNTIME.world.camera = camera;
    </script>
  </body>
</html>`;

describe('managed browser workspace application surface', () => {
  const accessRecords: AccessRecord[] = [];
  let attackerOrigin: string;
  let attackerServer: Server;
  let browser: ManagedBrowser;
  let origin: string;
  let server: Server;
  let workspaceRoot: string;

  beforeAll(async () => {
    process.env.IWSDK_GPU = 'swiftshader';
    const threeModuleUrl = new URL(import.meta.resolve('three'));
    const [threeModuleSource, threeCoreSource] = await Promise.all([
      readFile(threeModuleUrl, 'utf8'),
      readFile(new URL('./three.core.js', threeModuleUrl), 'utf8'),
    ]);
    workspaceRoot = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-browser-workspace-e2e-'),
    );
    attackerServer = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://fixture');
      accessRecords.push({
        accessHeader:
          typeof request.headers[MANAGED_ACCESS_HEADER] === 'string'
            ? request.headers[MANAGED_ACCESS_HEADER]
            : undefined,
        accessQuery:
          requestUrl.searchParams.get(MANAGED_ACCESS_QUERY) ?? undefined,
        host: 'attacker',
        pathname: requestUrl.pathname,
        referer: request.headers.referer,
      });
      response.statusCode = 200;
      response.setHeader('content-type', 'image/png');
      response.end(Buffer.from(EDITOR_CAPTURE_BASE64, 'base64'));
    });
    server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://fixture');
      const accessHeader =
        typeof request.headers[MANAGED_ACCESS_HEADER] === 'string'
          ? request.headers[MANAGED_ACCESS_HEADER]
          : undefined;
      const accessQuery =
        requestUrl.searchParams.get(MANAGED_ACCESS_QUERY) ?? undefined;
      accessRecords.push({
        accessHeader,
        accessQuery,
        host: 'managed',
        pathname: requestUrl.pathname,
        referer: request.headers.referer,
      });
      if (requestUrl.pathname === '/three.module.js') {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/javascript');
        response.end(threeModuleSource);
        return;
      }
      if (requestUrl.pathname === '/three.core.js') {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/javascript');
        response.end(threeCoreSource);
        return;
      }
      if (
        requestUrl.pathname === '/__iwsdk/workspace' &&
        accessHeader !== MANAGED_ACCESS_TOKEN &&
        accessQuery !== MANAGED_ACCESS_TOKEN
      ) {
        response.statusCode = 401;
        response.end('Managed workspace access required');
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html');
      response.end(
        requestUrl.pathname.startsWith('/runtime')
          ? RUNTIME_HTML
          : WORKSPACE_HTML.replaceAll('__ATTACKER_ORIGIN__', attackerOrigin),
      );
    });
    await new Promise<void>((resolve, reject) => {
      attackerServer.once('error', reject);
      attackerServer.listen(0, '127.0.0.1', () => resolve());
    });
    const attackerAddress = attackerServer.address();
    if (typeof attackerAddress !== 'object' || attackerAddress == null) {
      throw new Error('Attacker fixture server address is unavailable');
    }
    attackerOrigin = `http://127.0.0.1:${attackerAddress.port}`;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (typeof address !== 'object' || address == null) {
      throw new Error('Fixture server address is unavailable');
    }
    origin = `http://127.0.0.1:${address.port}`;
    browser = await launchManagedBrowser(
      `${origin}/__iwsdk/workspace`,
      true,
      false,
      null,
      { height: 300, width: 400 },
      false,
      {
        headerName: MANAGED_ACCESS_HEADER,
        pathnames: [],
        token: MANAGED_ACCESS_TOKEN,
        topLevelPathnames: ['/__iwsdk/workspace'],
      },
      'workspace',
      workspaceRoot,
      false,
    );
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await Promise.all(
      [server, attackerServer].map(
        (fixtureServer) =>
          new Promise<void>((resolve) => fixtureServer?.close(() => resolve())),
      ),
    );
    await rm(workspaceRoot, { force: true, recursive: true });
    delete process.env.IWSDK_GPU;
  });

  test('targets the hidden application frame and restores the editor after a batch', async () => {
    const page = browser.page as any;
    expect(page.url()).toBe(`${origin}/__iwsdk/workspace`);
    expect(
      accessRecords.find(
        (record) =>
          record.host === 'managed' && record.pathname === '/__iwsdk/workspace',
      ),
    ).toMatchObject({
      accessHeader: undefined,
      accessQuery: MANAGED_ACCESS_TOKEN,
    });
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');

    const snapshot = await browser.snapshotApplication();
    expect(snapshot.application).toMatchObject({
      id: 'workspace-runtime',
      outerUrl: `${origin}/__iwsdk/workspace`,
      url: `${origin}/runtime`,
      workspaceFramed: true,
    });
    const input = snapshot.elements.find(
      (element) => element.role === 'textbox' && element.name === 'Name',
    );
    const checkbox = snapshot.elements.find(
      (element) => element.role === 'checkbox',
    );
    const select = snapshot.elements.find(
      (element) => element.role === 'combobox',
    );
    const slider = snapshot.elements.find(
      (element) => element.role === 'slider',
    );
    const canvas = snapshot.elements.find(
      (element) => element.name === 'Workspace canvas',
    );
    expect(input?.visible).toBe(false);

    const interaction = await browser.interactApplication({
      timeoutMs: 15_000,
      steps: [
        { action: 'fill', ref: input!.ref, value: 'Workspace' },
        { action: 'wait', ref: input!.ref, state: 'focused' },
        { action: 'check', ref: checkbox!.ref },
        { action: 'select', ref: select!.ref, value: 'advanced' },
        { action: 'press', key: 'ArrowRight', ref: slider!.ref },
        {
          action: 'click',
          point: { canvasRef: canvas!.ref, x: 20, y: 20 },
        },
        {
          action: 'drag',
          point: { canvasRef: canvas!.ref, x: 30, y: 30 },
          targetPoint: { canvasRef: canvas!.ref, x: 100, y: 60 },
        },
        { action: 'press', key: 'Enter', ref: input!.ref },
        { action: 'wait', path: '/runtime/submitted?done=1#ok' },
      ],
    });
    expect(
      interaction,
      JSON.stringify(interaction.failure, null, 2),
    ).toMatchObject({ success: true });
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(
      await frame.evaluate(() => ({
        checked: (document.querySelector('#enabled') as HTMLInputElement)
          .checked,
        level: (document.querySelector('#level') as HTMLInputElement).value,
        mode: (document.querySelector('#mode') as HTMLSelectElement).value,
        state: (window as any).workspaceState,
      })),
    ).toEqual({
      checked: true,
      level: '6',
      mode: 'advanced',
      state: { canvasClicks: 2, drags: 1, submits: 1 },
    });
  }, 30_000);

  test('characterizes trusted pointer, form, and conditional-wait actions', async () => {
    const snapshot = await browser.snapshotApplication();
    const input = snapshot.elements.find(
      (element) => element.role === 'textbox' && element.name === 'Name',
    )!;
    const checkbox = snapshot.elements.find(
      (element) => element.role === 'checkbox',
    )!;
    const select = snapshot.elements.find(
      (element) => element.role === 'combobox',
    )!;
    const submit = snapshot.elements.find(
      (element) => element.role === 'button' && element.name === 'Submit',
    )!;
    const canvas = snapshot.elements.find(
      (element) => element.name === 'Workspace canvas',
    )!;

    const first = await browser.interactApplication({
      steps: [
        { action: 'fill', ref: input.ref, value: 'A' },
        { action: 'type', ref: input.ref, value: 'B' },
        { action: 'clear', ref: input.ref },
        { action: 'press', key: 'x', ref: input.ref },
        { action: 'check', ref: checkbox.ref },
        { action: 'uncheck', ref: checkbox.ref },
        { action: 'select', ref: select.ref, value: 'advanced' },
        { action: 'hover', ref: submit.ref },
        { action: 'click', ref: submit.ref },
        { action: 'doubleClick', ref: submit.ref },
      ],
    });
    expect(first.success).toBe(true);
    expect(first.completed.map((step) => step.action)).toEqual([
      'fill',
      'type',
      'clear',
      'press',
      'check',
      'uncheck',
      'select',
      'hover',
      'click',
      'doubleClick',
    ]);

    const second = await browser.interactApplication({
      steps: [
        {
          action: 'pointerMove',
          point: { canvasRef: canvas.ref, x: 10, y: 10 },
        },
        { action: 'pointerDown' },
        { action: 'pointerUp' },
        { action: 'wheel', deltaX: 1, deltaY: 2 },
        { action: 'scroll', deltaY: 5, ref: input.ref },
        {
          action: 'drag',
          point: { canvasRef: canvas.ref, x: 10, y: 10 },
          targetPoint: { canvasRef: canvas.ref, x: 80, y: 40 },
        },
        { action: 'wait', ref: input.ref, state: 'visible' },
      ],
    });
    expect(second.success).toBe(true);
    expect(second.completed.map((step) => step.action)).toEqual([
      'pointerMove',
      'pointerDown',
      'pointerUp',
      'wheel',
      'scroll',
      'drag',
      'wait',
    ]);
  }, 30_000);

  test('serializes screenshot and reload view mutations deterministically', async () => {
    const page = browser.page as any;
    const [capture, reload] = await Promise.all([
      browser.captureRuntimeScreenshot({ format: 'png' }),
      browser.reloadApplication(),
    ]);
    expect(capture.metadata).toMatchObject({
      downscaled: true,
      mimeType: 'image/png',
      width: 400,
      workspaceFramed: true,
    });
    expect(capture.metadata.width).toBeLessThanOrEqual(400);
    expect(capture.metadata.height).toBeGreaterThan(0);
    expect(capture.metadata.height).toBeLessThanOrEqual(300);
    const { data, info } = await sharp(capture.bytes).raw().toBuffer({
      resolveWithObject: true,
    });
    const overlayPixel =
      (5 * info.width + Math.max(0, info.width - 5)) * info.channels;
    expect([...data.subarray(overlayPixel, overlayPixel + 3)]).not.toEqual([
      255, 0, 255,
    ]);
    expect(reload.generation).toBe(2);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('captures animated framed and referenced surfaces without element screenshots', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    const snapshot = await browser.snapshotApplication();
    const submit = snapshot.elements.find(
      (element) => element.role === 'button' && element.name === 'Submit',
    );
    expect(frame).toBeDefined();
    expect(submit?.ref).toBeTruthy();

    await page.locator('#workspace-runtime-frame').evaluate((element) => {
      element.animate(
        [{ transform: 'translateX(0px)' }, { transform: 'translateX(2px)' }],
        { direction: 'alternate', duration: 40, iterations: Infinity },
      );
    });
    await frame
      .locator('button[type="submit"]')
      .evaluate((element: Element) => {
        element.animate(
          [{ transform: 'translateX(0px)' }, { transform: 'translateX(2px)' }],
          { direction: 'alternate', duration: 40, iterations: Infinity },
        );
      });

    try {
      const framed = await browser.captureRuntimeScreenshot({ format: 'png' });
      const fullPage = await browser.captureRuntimeScreenshot({
        format: 'png',
        fullPage: true,
      });
      const referenced = await browser.captureRuntimeScreenshot({
        format: 'png',
        ref: submit!.ref,
      });

      for (const capture of [framed, fullPage]) {
        expect(capture.metadata.workspaceFramed).toBe(true);
        expect(capture.metadata.height).toBeGreaterThan(0);
        expect(capture.metadata.height).toBeLessThanOrEqual(300);
        expect(capture.metadata.width).toBeGreaterThan(0);
        expect(capture.metadata.width).toBeLessThanOrEqual(400);
      }
      expect(referenced.metadata.height).toBeGreaterThan(0);
      expect(referenced.metadata.height).toBeLessThanOrEqual(300);
      expect(referenced.metadata.width).toBeGreaterThan(0);
      expect(referenced.metadata.width).toBeLessThanOrEqual(400);
    } finally {
      await page.evaluate(() =>
        document.getAnimations().forEach((animation) => animation.cancel()),
      );
      await frame.evaluate(() =>
        document
          .getAnimations()
          .forEach((animation: Animation) => animation.cancel()),
      );
    }
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('captures an animated overflowing frame as a full document and restores scroll', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'smooth';
      const bands = document.createElement('div');
      bands.id = 'full-page-bands';
      bands.innerHTML = [
        '<div style="height:600px;background:#ff0000"></div>',
        '<div style="height:600px;background:#00ff00"></div>',
        '<div style="height:600px;background:#0000ff"></div>',
      ].join('');
      document.body.append(bands);
      bands.animate([{ opacity: 0.98 }, { opacity: 1 }], {
        direction: 'alternate',
        duration: 40,
        iterations: Infinity,
      });
      window.scrollTo({ behavior: 'instant', left: 0, top: 137 });
    });

    try {
      const initialScroll = await frame.evaluate(() => window.scrollY);
      const viewport = await browser.captureRuntimeScreenshot({
        format: 'png',
      });
      const fullPage = await browser.captureRuntimeScreenshot({
        format: 'png',
        fullPage: true,
      });
      expect(await frame.evaluate(() => window.scrollY)).toBe(initialScroll);
      expect(fullPage.metadata.height).toBe(300);
      expect(fullPage.metadata.width).toBeLessThan(viewport.metadata.width);

      const { data, info } = await sharp(fullPage.bytes).raw().toBuffer({
        resolveWithObject: true,
      });
      const offset =
        ((info.height - 5) * info.width + Math.floor(info.width / 2)) *
        info.channels;
      const [red, green, blue] = data.subarray(offset, offset + 3);
      expect(red).toBeLessThan(16);
      expect(green).toBeLessThan(16);
      expect(blue).toBeGreaterThan(240);
    } finally {
      await frame.evaluate(() => {
        document.getElementById('full-page-bands')?.remove();
        document.documentElement.style.scrollBehavior = '';
        window.scrollTo(0, 0);
      });
    }
  }, 30_000);

  test('captures classic-scrollbar and fractional-scale frames without seams', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await page.locator('#workspace-runtime-frame').evaluate((element) => {
      Object.assign((element as HTMLElement).style, {
        transform: 'scale(0.997)',
        transformOrigin: 'top left',
      });
    });
    await frame.evaluate(() => {
      document.documentElement.style.background = '#000';
      document.documentElement.style.overflowY = 'scroll';
      document.documentElement.style.scrollbarGutter = 'stable';
      document.body.style.background = '#000';
      document.body.style.margin = '0';
      const cover = document.createElement('div');
      cover.id = 'fractional-full-page-cover';
      Object.assign(cover.style, {
        background: '#000',
        height: '1800px',
        left: '0',
        position: 'absolute',
        top: '0',
        width: '100%',
        zIndex: '1000',
      });
      document.body.append(cover);
    });

    try {
      const capture = await browser.captureRuntimeScreenshot({
        format: 'png',
        fullPage: true,
      });
      const { data, info } = await sharp(capture.bytes).raw().toBuffer({
        resolveWithObject: true,
      });
      const x = Math.floor(info.width / 2);
      for (let y = 1; y < info.height - 1; y += 1) {
        const offset = (y * info.width + x) * info.channels;
        expect(Math.max(...data.subarray(offset, offset + 3))).toBeLessThan(32);
      }
    } finally {
      await page.locator('#workspace-runtime-frame').evaluate((element) => {
        (element as HTMLElement).style.transform = '';
        (element as HTMLElement).style.transformOrigin = '';
      });
      await frame.evaluate(() => {
        document.getElementById('fractional-full-page-cover')?.remove();
        document.documentElement.style.background = '';
        document.documentElement.style.overflowY = '';
        document.documentElement.style.scrollbarGutter = '';
        document.body.style.background = '';
        document.body.style.margin = '';
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      });
    }
  }, 30_000);

  test('normalizes native device-pixel tiles before full-page stitching', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      const bands = document.createElement('div');
      bands.id = 'hidpi-full-page-bands';
      bands.innerHTML = [
        '<div style="height:600px;background:#ff0000"></div>',
        '<div style="height:600px;background:#0000ff"></div>',
      ].join('');
      document.body.append(bands);
    });

    const originalScreenshot = page.screenshot.bind(page);
    const screenshot = vi
      .spyOn(page, 'screenshot')
      .mockImplementation(async (options: any) => {
        const bytes = Buffer.from(await originalScreenshot(options));
        if (options?.clip == null || options.scale !== 'css') {
          return bytes;
        }
        const metadata = await sharp(bytes).metadata();
        return sharp(bytes)
          .resize((metadata.width ?? 1) * 2, (metadata.height ?? 1) * 2, {
            fit: 'fill',
            kernel: 'nearest',
          })
          .png()
          .toBuffer();
      });

    try {
      const capture = await browser.captureRuntimeScreenshot({
        format: 'png',
        fullPage: true,
      });
      expect(capture.metadata).toMatchObject({
        height: 300,
        width: expect.any(Number),
        workspaceFramed: true,
      });
      expect(capture.metadata.width).toBeLessThanOrEqual(400);
    } finally {
      screenshot.mockRestore();
      await frame.evaluate(() => {
        document.getElementById('hidpi-full-page-bands')?.remove();
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      });
    }
  }, 30_000);

  test('scrolls offscreen frames and partial refs into view, then restores scroll', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'workspace-offscreen-spacer';
      spacer.style.height = '700px';
      document.body.prepend(spacer);
      window.scrollTo(0, 0);
    });
    await frame.evaluate(() => {
      document.body.style.minHeight = '700px';
      const button = document.createElement('button');
      button.id = 'partial-screenshot-target';
      button.textContent = 'Partial screenshot target';
      Object.assign(button.style, {
        height: '80px',
        left: '20px',
        position: 'absolute',
        top: '560px',
        width: '120px',
      });
      document.body.append(button);
      window.scrollTo(0, 0);
    });

    try {
      await expect(
        browser.captureRuntimeScreenshot({ format: 'png' }),
      ).resolves.toMatchObject({ metadata: { workspaceFramed: true } });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const snapshot = await browser.snapshotApplication();
      const target = snapshot.elements.find(
        (element) => element.name === 'Partial screenshot target',
      );
      expect(target?.ref).toBeTruthy();
      const capture = await browser.captureRuntimeScreenshot({
        format: 'png',
        ref: target!.ref,
      });
      expect(capture.metadata).toMatchObject({ height: 80, width: 120 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await frame.evaluate(() => window.scrollY)).toBe(0);
    } finally {
      await page.evaluate(() => {
        document.getElementById('workspace-offscreen-spacer')?.remove();
        window.scrollTo(0, 0);
      });
      await frame.evaluate(() => {
        document.getElementById('partial-screenshot-target')?.remove();
        document.body.style.minHeight = '';
        window.scrollTo(0, 0);
      });
    }
  }, 30_000);

  test('rejects oversized framed full-page captures before allocation', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      document.body.style.minHeight = '41000px';
    });
    try {
      const error = await browser
        .captureRuntimeScreenshot({ fullPage: true })
        .then(
          () => null,
          (reason) => reason,
        );
      expect(error).toMatchObject({
        code: 'browser_screenshot_too_large',
        retryable: false,
      });
      expect(error).toHaveProperty(
        'message',
        expect.stringContaining('exceeds full-page screenshot limits'),
      );
    } finally {
      await frame.evaluate(() => {
        document.body.style.minHeight = '';
        window.scrollTo(0, 0);
      });
    }
  }, 10_000);

  test('rejects oversized refs without inviting a retry and restores scroll', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      const target = document.createElement('button');
      target.id = 'oversized-screenshot-target';
      target.textContent = 'Oversized screenshot target';
      Object.assign(target.style, {
        height: '900px',
        width: '120px',
      });
      document.body.append(target);
      window.scrollTo({ behavior: 'instant', left: 0, top: 91 });
    });

    try {
      const initialScroll = await frame.evaluate(() => window.scrollY);
      const snapshot = await browser.snapshotApplication();
      const target = snapshot.elements.find(
        (element) => element.name === 'Oversized screenshot target',
      );
      expect(target?.ref).toBeTruthy();
      const error = await browser
        .captureRuntimeScreenshot({ format: 'png', ref: target!.ref })
        .then(
          () => null,
          (reason) => reason,
        );
      expect(error).toMatchObject({
        code: 'browser_screenshot_target_too_large',
        retryable: false,
      });
      expect(await frame.evaluate(() => window.scrollY)).toBe(initialScroll);
    } finally {
      await frame.evaluate(() => {
        document.getElementById('oversized-screenshot-target')?.remove();
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      });
    }
  }, 10_000);

  test('reserves a double-animation-frame budget after render stats stall', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      const target = window as any;
      const runtime = target.FRAMEWORK_MCP_RUNTIME;
      target.__IWSDK_TEST_ORIGINAL_DISPATCH = runtime.dispatch;
      target.__IWSDK_TEST_ORIGINAL_RAF = window.requestAnimationFrame;
      target.__IWSDK_TEST_RAF_CALLS = 0;
      runtime.dispatch = (method: string, params: unknown) =>
        method === 'get_render_stats'
          ? new Promise(() => {})
          : target.__IWSDK_TEST_ORIGINAL_DISPATCH.call(runtime, method, params);
      window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        return window.setTimeout(() => {
          target.__IWSDK_TEST_RAF_CALLS += 1;
          callback(performance.now());
        }, 50);
      }) as typeof window.requestAnimationFrame;
    });

    let visibility: Awaited<ReturnType<typeof showWorkspaceRuntime>> | null =
      null;
    const startedAt = Date.now();
    try {
      visibility = await showWorkspaceRuntime(page);
      expect(
        await frame.evaluate(() => (window as any).__IWSDK_TEST_RAF_CALLS),
      ).toBe(2);
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await frame.evaluate(() => {
        const target = window as any;
        target.FRAMEWORK_MCP_RUNTIME.dispatch =
          target.__IWSDK_TEST_ORIGINAL_DISPATCH;
        window.requestAnimationFrame = target.__IWSDK_TEST_ORIGINAL_RAF;
        delete target.__IWSDK_TEST_ORIGINAL_DISPATCH;
        delete target.__IWSDK_TEST_ORIGINAL_RAF;
        delete target.__IWSDK_TEST_RAF_CALLS;
      });
      if (visibility != null) {
        await restoreWorkspaceView(page, visibility);
      }
    }
  }, 10_000);

  test('bounds workspace settling when render stats and animation frames stall', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      const target = window as any;
      const runtime = target.FRAMEWORK_MCP_RUNTIME;
      target.__IWSDK_TEST_ORIGINAL_DISPATCH = runtime.dispatch;
      target.__IWSDK_TEST_ORIGINAL_RAF = window.requestAnimationFrame;
      runtime.dispatch = (method: string, params: unknown) =>
        method === 'get_render_stats'
          ? new Promise(() => {})
          : target.__IWSDK_TEST_ORIGINAL_DISPATCH.call(runtime, method, params);
      window.requestAnimationFrame = (() =>
        1) as typeof window.requestAnimationFrame;
    });

    const startedAt = Date.now();
    try {
      await expect(
        browser.captureRuntimeScreenshot({ format: 'png' }),
      ).resolves.toMatchObject({ metadata: { workspaceFramed: true } });
    } finally {
      await frame.evaluate(() => {
        const target = window as any;
        target.FRAMEWORK_MCP_RUNTIME.dispatch =
          target.__IWSDK_TEST_ORIGINAL_DISPATCH;
        window.requestAnimationFrame = target.__IWSDK_TEST_ORIGINAL_RAF;
        delete target.__IWSDK_TEST_ORIGINAL_DISPATCH;
        delete target.__IWSDK_TEST_ORIGINAL_RAF;
      });
    }
    expect(Date.now() - startedAt).toBeLessThan(4_000);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 10_000);

  test('serializes interaction, screenshot, and reload without leaking workspace view state', async () => {
    const page = browser.page as any;
    const before = await browser.getTabMetadata();
    const [interaction, capture, reload] = await Promise.all([
      browser.interactApplication({
        steps: [
          {
            action: 'fill',
            locator: { name: 'Name', role: 'textbox' },
            value: 'Serialized',
          },
        ],
      }),
      browser.captureRuntimeScreenshot({ format: 'png' }),
      browser.reloadApplication(),
    ]);

    expect(interaction.success).toBe(true);
    expect(capture.bytes.length).toBeGreaterThan(0);
    expect(reload.generation).not.toBe(before.generation);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('routes page-scoped keyboard actions to the framed application', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();

    await page.locator('#editor-focus').focus();
    await page.evaluate(() => {
      (window as any).keyboardEvents = [];
    });
    await frame.evaluate(() => {
      (window as any).keyboardEvents = [];
    });

    const interaction = await browser.interactApplication({
      steps: [
        { action: 'press', key: 'KeyQ' },
        { action: 'keyDown', key: 'KeyW' },
        { action: 'wait', durationMs: 20 },
        { action: 'keyUp', key: 'KeyW' },
      ],
    });

    expect(interaction.success).toBe(true);
    expect(await page.evaluate(() => (window as any).keyboardEvents)).toEqual(
      [],
    );
    expect(await frame.evaluate(() => (window as any).keyboardEvents)).toEqual([
      expect.objectContaining({ code: 'KeyQ', type: 'keydown' }),
      expect.objectContaining({ code: 'KeyQ', type: 'keyup' }),
      expect.objectContaining({ code: 'KeyW', type: 'keydown' }),
      expect.objectContaining({ code: 'KeyW', type: 'keyup' }),
    ]);

    await page.locator('#editor-focus').focus();
    await page.evaluate(() => {
      (window as any).keyboardEvents = [];
    });
    await frame.evaluate(() => {
      (window as any).keyboardEvents = [];
      const stealFocus = (event: KeyboardEvent) => {
        if (event.code !== 'KeyA') {
          return;
        }
        window.removeEventListener('keydown', stealFocus);
        (
          window.parent.document.querySelector(
            '#editor-focus',
          ) as HTMLElement | null
        )?.focus();
      };
      window.addEventListener('keydown', stealFocus);
    });

    const releasedAfterFocusLoss = await browser.interactApplication({
      steps: [
        { action: 'keyDown', key: 'KeyA' },
        { action: 'wait', durationMs: 20 },
      ],
    });

    expect(releasedAfterFocusLoss.success).toBe(true);
    expect(await page.evaluate(() => (window as any).keyboardEvents)).toEqual(
      [],
    );
    expect(await frame.evaluate(() => (window as any).keyboardEvents)).toEqual([
      expect.objectContaining({ code: 'KeyA', type: 'keydown' }),
      expect.objectContaining({ code: 'KeyA', type: 'keyup' }),
    ]);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('focuses held-key targets and releases keys after malformed raw steps', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    await frame.evaluate(() => {
      (window as any).keyboardEvents = [];
    });

    const targeted = await browser.interactApplication({
      steps: [
        {
          action: 'keyDown',
          key: 'KeyZ',
          locator: { name: 'Name', role: 'textbox' },
        },
        { action: 'wait', durationMs: 20 },
        {
          action: 'keyUp',
          key: 'KeyZ',
          locator: { name: 'Name', role: 'textbox' },
        },
      ],
    });

    expect(targeted.success).toBe(true);
    expect(await frame.evaluate(() => (window as any).keyboardEvents)).toEqual([
      expect.objectContaining({
        code: 'KeyZ',
        targetId: 'workspace-name',
        type: 'keydown',
      }),
      expect.objectContaining({
        code: 'KeyZ',
        targetId: 'workspace-name',
        type: 'keyup',
      }),
    ]);

    const snapshot = await browser.snapshotApplication();
    const canvas = snapshot.elements.find(
      (element) =>
        element.tag === 'canvas' && element.name === 'Workspace canvas',
    );
    expect(canvas?.ref).toBeTruthy();
    await page.locator('#editor-focus').focus();
    await page.evaluate(() => {
      (window as any).keyboardEvents = [];
    });
    await frame.evaluate(() => {
      (window as any).keyboardEvents = [];
    });

    const targetedCanvas = await browser.interactApplication({
      steps: [
        { action: 'keyDown', key: 'KeyC', ref: canvas!.ref },
        { action: 'keyUp', key: 'KeyC', ref: canvas!.ref },
      ],
    });
    expect(targetedCanvas.success).toBe(true);
    expect(await page.evaluate(() => (window as any).keyboardEvents)).toEqual(
      [],
    );
    expect(await frame.evaluate(() => (window as any).keyboardEvents)).toEqual([
      expect.objectContaining({ code: 'KeyC', type: 'keydown' }),
      expect.objectContaining({ code: 'KeyC', type: 'keyup' }),
    ]);

    await frame.evaluate(() => {
      (window as any).keyboardEvents = [];
    });
    const failedAfterKeyDown = await browser.interactApplication({
      steps: [
        { action: 'keyDown', key: 'KeyX' },
        { action: 'click', ref: 'missing-ref' },
      ],
    });
    expect(failedAfterKeyDown).toMatchObject({
      failure: {
        action: 'click',
        index: 1,
        message: 'Unknown or stale browser ref: missing-ref',
      },
      success: false,
    });
    expect(await frame.evaluate(() => (window as any).keyboardEvents)).toEqual([
      expect.objectContaining({ code: 'KeyX', type: 'keydown' }),
      expect.objectContaining({ code: 'KeyX', type: 'keyup' }),
    ]);

    await frame.evaluate(() => {
      (document.querySelector('#workspace-name') as HTMLInputElement).value =
        'before-validation';
    });
    const targetedDuration = await browser.interactApplication({
      steps: [
        {
          action: 'fill',
          locator: { name: 'Name', role: 'textbox' },
          value: 'should-not-run',
        },
        {
          action: 'wait',
          durationMs: 20,
          locator: { name: 'Name', role: 'textbox' },
        },
      ],
    });
    expect(targetedDuration).toMatchObject({
      failure: {
        index: 1,
        message:
          'wait durationMs cannot be combined with a wait condition or target',
      },
      success: false,
    });
    expect(
      await frame.evaluate(
        () =>
          (document.querySelector('#workspace-name') as HTMLInputElement).value,
      ),
    ).toBe('before-validation');
  }, 30_000);

  test('bounds frame focus and held-key cleanup by the interaction timeout', async () => {
    const page = browser.page as any;
    const frame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    expect(frame).toBeDefined();
    const originalEvaluate = frame.evaluate.bind(frame);
    let focusCalls = 0;
    const evaluate = vi
      .spyOn(frame, 'evaluate')
      .mockImplementation((pageFunction: any, argument?: any) => {
        if (String(pageFunction).includes('window.focus')) {
          focusCalls += 1;
          if (focusCalls > 1) {
            return new Promise(() => {});
          }
        }
        return originalEvaluate(pageFunction, argument);
      });

    try {
      const startedAt = Date.now();
      const result = await browser.interactApplication({
        steps: [
          { action: 'keyDown', key: 'KeyT' },
          { action: 'wait', durationMs: 1000 },
        ],
        timeoutMs: 500,
      });
      const elapsedMs = Date.now() - startedAt;
      expect(result).toMatchObject({
        failure: {
          action: 'wait',
          index: 1,
          message: 'wait durationMs exceeds the remaining batch budget',
        },
        success: false,
      });
      expect(elapsedMs).toBeLessThan(1500);
    } finally {
      evaluate.mockRestore();
      await page.keyboard.up('KeyT').catch(() => {});
    }
  }, 30_000);

  test('serializes evidence collectors with interaction, screenshot, and profiling', async () => {
    const page = browser.page as any;
    const nested = await browser.runCommandExclusive(
      async () => ({
        preflight: await browser.collectRuntimePreflightEvidence({
          sampleFrames: 1,
          warmupFrames: 0,
        }),
        publish: await browser.collectRuntimePublishEvidence({
          expectedDocumentHash: DOCUMENT_HASH,
          expectedRuntimeHash: RUNTIME_HASH,
          nodeIds: [],
        }),
      }),
      { queueTimeoutMs: 120_000, timeoutMs: 120_000 },
    );
    expect(nested.preflight.runtimeHashes).toEqual([RUNTIME_HASH]);
    expect(nested.publish.runtimeHashes).toEqual([RUNTIME_HASH]);

    const profile = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 15_000,
      mode: 'interaction',
    });
    const [preflight, interaction, screenshot] = await Promise.all([
      browser.collectRuntimePreflightEvidence({
        sampleFrames: 1,
        warmupFrames: 0,
      }),
      browser.interactApplication({
        steps: [
          {
            action: 'fill',
            locator: { name: 'Name', role: 'textbox' },
            value: 'Serialized evidence',
          },
        ],
      }),
      browser.captureRuntimeScreenshot({ format: 'png' }),
    ]);
    expect(preflight.runtimeHashes).toEqual([RUNTIME_HASH]);
    expect(interaction.success).toBe(true);
    expect(screenshot.bytes.length).toBeGreaterThan(0);
    await expect(
      browser.profileApplication({
        action: 'stop',
        profileId: profile.profileId,
      }),
    ).resolves.toMatchObject({ status: 'stopped' });
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 120_000);

  test('returns structured failure when a nested command exhausts its active budget', async () => {
    const page = browser.page as any;
    const result = await browser.runCommandExclusive(
      async () => {
        await page.waitForTimeout(600);
        return browser.interactApplication({
          steps: [
            {
              action: 'click',
              locator: { name: 'Submit', role: 'button' },
            },
          ],
        });
      },
      { timeoutMs: 3_000 },
    );

    expect(result).toMatchObject({
      completed: [],
      failure: {
        action: 'click',
        index: 0,
        retryable: true,
      },
      success: false,
    });
    expect(browser.isClosed()).toBe(false);
  });

  test('keeps runtime visible for profiles and writes a bounded trace artifact', async () => {
    const page = browser.page as any;
    const started = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 10_000,
      mode: 'trace',
    });
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('runtime');
    const interaction = await browser.interactApplication({
      steps: [
        {
          action: 'fill',
          locator: { name: 'Name', role: 'textbox' },
          value: 'Traced',
        },
      ],
    });
    expect(interaction.success).toBe(true);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('runtime');

    const stopped = await browser.profileApplication({
      action: 'stop',
      profileId: started.profileId,
    });
    expect(stopped).toMatchObject({
      calibrated: false,
      status: 'stopped',
      targetDevice: null,
    });
    expect(stopped.artifact?.path).toMatch(
      /^\.iwsdk\/artifacts\/browser\/profile-.+\.zip$/,
    );
    const artifactPath = path.join(workspaceRoot, stopped.artifact!.path);
    await expect(access(artifactPath)).resolves.toBeUndefined();
    expect((await stat(artifactPath)).size).toBeLessThanOrEqual(
      100 * 1024 * 1024,
    );
    expect(
      stopped.summary?.marks.some((mark) => mark.name.includes('-step-0-fill')),
    ).toBe(true);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('clamps interaction steps to a nearly elapsed profile deadline', async () => {
    const page = browser.page as any;
    const started = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 1_000,
      mode: 'interaction',
    });
    await page.waitForTimeout(800);
    const interactionStartedAt = Date.now();
    const interaction = await browser.interactApplication({
      timeoutMs: 5_000,
      steps: [{ action: 'wait', text: 'never-present-profile-deadline' }],
    });

    expect(interaction).toMatchObject({
      failure: { action: 'wait', index: 0, retryable: true },
      success: false,
    });
    expect(Date.now() - interactionStartedAt).toBeLessThan(1_500);
    await expect(
      browser.profileApplication({
        action: 'status',
        profileId: started.profileId,
      }),
    ).resolves.toMatchObject({ status: 'stopped' });
  }, 10_000);

  test('characterizes direct runtime preflight evidence and dispatch order', async () => {
    const page = browser.page as any;
    await page.evaluate(() => localStorage.removeItem('evidence-dispatches'));

    const evidence = await collectRuntimePreflightEvidence(page, {
      sampleFrames: 4,
      warmupFrames: 2,
    });

    expect(evidence).toMatchObject({
      camera: {
        aspect: 2,
        direction: [-0, -0, -1],
        far: 100,
        fov: 60,
        height: null,
        near: 0.1,
        position: [0, 0, 5],
        projection: 'perspective',
      },
      editor: {
        dirty: false,
        documentHash: DOCUMENT_HASH,
        renderStats: { available: true, meshCount: 2, source: 'editor' },
        runtimeHash: RUNTIME_HASH,
      },
      environment: {
        canvas: { height: 150, width: 300 },
        devicePixelRatio: expect.any(Number),
        gpuRenderer: expect.any(String),
        gpuVendor: expect.any(String),
        userAgent: expect.any(String),
      },
      framing: {
        boundsAvailable: true,
        centerNdc: [0, 0, expect.any(Number)],
        fullyInsideViewport: true,
        inFrontCornerCount: 8,
        projectedBounds: {
          max: [expect.any(Number), expect.any(Number)],
          min: [expect.any(Number), expect.any(Number)],
        },
        viewportCoverage: expect.any(Number),
        viewportOverlap: expect.any(Number),
      },
      hierarchyObjectCount: 2,
      performance: {
        calibrated: false,
        classification: 'host-browser-diagnostic',
        droppedFrameCount: expect.any(Number),
        droppedFrameThresholdMs: expect.any(Number),
        frameTimeMs: {
          max: expect.any(Number),
          p50: expect.any(Number),
          p95: expect.any(Number),
        },
        sampleFrames: 4,
        targetDevice: null,
        warmupFrames: 2,
      },
      renderStats: { available: true, calls: 1, meshCount: 2 },
      runtimeHashes: [RUNTIME_HASH],
    });
    expect(evidence.collectedAt).toEqual(expect.any(Number));
    expect(evidence.framing?.centerNdc?.[2]).toBeCloseTo(0.961961961961962);
    expect(evidence.framing?.projectedBounds?.min[0]).toBeCloseTo(
      -0.21650635094610968,
    );
    expect(evidence.framing?.projectedBounds?.max[1]).toBeCloseTo(
      0.43301270189221935,
    );
    expect(evidence.framing?.viewportCoverage).toBeCloseTo(0.09375);
    expect(evidence.framing?.viewportOverlap).toBeCloseTo(0.09375);
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
    const dispatches = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('evidence-dispatches') || '[]'),
    );
    expect(
      dispatches.slice(dispatches.indexOf('editor:scene_get_document')),
    ).toEqual([
      'editor:scene_get_document',
      'editor:scene_get_render_stats',
      'runtime:get_scene_hierarchy',
      'runtime:get_render_stats',
    ]);
  }, 30_000);

  test('characterizes perspective framing edge cases', async () => {
    const page = browser.page as any;
    const runtimeFrame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    const collectForMode = async (mode: string) => {
      await runtimeFrame.evaluate((nextMode: string) => {
        (window as any).setEvidenceFramingMode(nextMode);
      }, mode);
      return collectRuntimePreflightEvidence(page, {
        sampleFrames: 1,
        warmupFrames: 0,
      });
    };

    const away = await collectForMode('away');
    expect(away.camera).toMatchObject({
      direction: [-0, -0, 1],
      projection: 'perspective',
    });
    expect(away.framing).toEqual({
      boundsAvailable: true,
      centerNdc: null,
      fullyInsideViewport: false,
      inFrontCornerCount: 0,
      projectedBounds: null,
      viewportCoverage: 0,
      viewportOverlap: 0,
    });

    const degenerate = await collectForMode('degenerate');
    expect(degenerate.framing).toMatchObject({
      boundsAvailable: true,
      fullyInsideViewport: true,
      inFrontCornerCount: 8,
      projectedBounds: { max: [0, 0], min: [0, 0] },
      viewportCoverage: 0,
      viewportOverlap: 0,
    });

    const unavailable = await collectForMode('unavailable');
    expect(unavailable.framing).toEqual({
      boundsAvailable: false,
      centerNdc: null,
      fullyInsideViewport: false,
      inFrontCornerCount: 0,
      projectedBounds: null,
      viewportCoverage: 0,
      viewportOverlap: 0,
    });
    await runtimeFrame.evaluate(() => {
      (window as any).setEvidenceFramingMode('normal');
    });
  }, 30_000);

  test('retries missing runtime hashes and representative nodes', async () => {
    const page = browser.page as any;
    const runtimeFrame = page
      .frames()
      .find((candidate: any) => candidate.url().includes('/runtime'));
    await page.evaluate(() => {
      localStorage.setItem('evidence-runtime-mode', 'missing-hash-once');
    });
    await runtimeFrame.evaluate(() => {
      (window as any).evidenceHierarchyCalls = 0;
    });
    await expect(
      collectRuntimePreflightEvidence(page, {
        sampleFrames: 1,
        warmupFrames: 0,
      }),
    ).resolves.toMatchObject({ runtimeHashes: [RUNTIME_HASH] });
    expect(
      await runtimeFrame.evaluate(() => (window as any).evidenceHierarchyCalls),
    ).toBeGreaterThanOrEqual(2);

    await page.evaluate(() => {
      localStorage.setItem('evidence-runtime-mode', 'missing-node-once');
      localStorage.removeItem('evidence-dispatches');
    });
    await runtimeFrame.evaluate(() => {
      sessionStorage.setItem('evidence-raf-count', '0');
    });
    const publish = await collectRuntimePublishEvidence(
      page,
      {
        expectedDocumentHash: DOCUMENT_HASH,
        expectedRuntimeHash: RUNTIME_HASH,
        nodeIds: ['node-1'],
      },
      MANAGED_ACCESS_TOKEN,
    );
    expect(publish.nodes[0]).toMatchObject({
      hierarchy: expect.objectContaining({ sceneNodeId: 'node-1' }),
      nodeId: 'node-1',
    });
    const dispatches = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('evidence-dispatches') || '[]'),
    );
    expect(
      dispatches.filter(
        (entry: string) => entry === 'runtime:get_scene_hierarchy',
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      Number(
        await runtimeFrame.evaluate(() =>
          sessionStorage.getItem('evidence-raf-count'),
        ),
      ),
    ).toBeLessThanOrEqual(13);
    await page.evaluate(() => {
      localStorage.removeItem('evidence-runtime-mode');
    });
  }, 45_000);

  test('reports publish-not-ready after bounded retries', async () => {
    const page = browser.page as any;
    await page.evaluate(() => {
      localStorage.setItem('evidence-runtime-mode', 'never-ready');
    });
    try {
      await expect(
        collectRuntimePublishEvidence(
          page,
          {
            expectedDocumentHash: DOCUMENT_HASH,
            expectedRuntimeHash: RUNTIME_HASH,
            nodeIds: [],
          },
          MANAGED_ACCESS_TOKEN,
        ),
      ).rejects.toThrow('App runtime did not become publish-ready');
    } finally {
      await page.evaluate(() => {
        localStorage.removeItem('evidence-runtime-mode');
      });
    }
    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');
  }, 30_000);

  test('characterizes direct publish evidence, canvas choice, and logs', async () => {
    const page = browser.page as any;
    accessRecords.length = 0;
    await page.evaluate(() => localStorage.removeItem('evidence-dispatches'));
    const crossOriginRequests: Array<
      Promise<{ headers: Record<string, string>; url: string }>
    > = [];
    const recordCrossOriginRequest = (request: any) => {
      if (request.url().startsWith(attackerOrigin)) {
        crossOriginRequests.push(
          request.allHeaders().then((headers: Record<string, string>) => ({
            headers,
            url: request.url(),
          })),
        );
      }
    };
    page.context().on('request', recordCrossOriginRequest);

    const evidence = await collectRuntimePublishEvidence(
      page,
      {
        expectedDocumentHash: DOCUMENT_HASH,
        expectedRuntimeHash: RUNTIME_HASH,
        heroView: 'hero',
        nodeIds: ['node-1'],
      },
      MANAGED_ACCESS_TOKEN,
    ).finally(() => page.context().off('request', recordCrossOriginRequest));

    expect(
      await page.locator('html').getAttribute('data-iwsdk-workspace-view'),
    ).toBe('editor');

    expect(evidence).toMatchObject({
      camera: expect.objectContaining({
        fov: 60,
        projection: 'perspective',
      }),
      capture: {
        height: 150,
        nonblank: true,
        sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        width: 300,
      },
      editor: {
        beforeReload: {
          dirty: false,
          documentHash: DOCUMENT_HASH,
          runtimeHash: RUNTIME_HASH,
        },
        capture: {
          height: 2,
          nonblank: false,
          sha256: EDITOR_CAPTURE_SHA256,
          width: 2,
        },
        dirty: false,
        documentHash: DOCUMENT_HASH,
        renderStats: { available: true, meshCount: 2, source: 'capture' },
        runtimeHash: RUNTIME_HASH,
      },
      environment: {
        canvas: {
          backingHeight: 150,
          backingWidth: 300,
          cssHeight: 150,
          cssWidth: 300,
        },
        devicePixelRatio: expect.any(Number),
        gpuRenderer: expect.any(String),
        gpuVendor: expect.any(String),
        userAgent: expect.any(String),
      },
      framing: expect.objectContaining({
        boundsAvailable: true,
        fullyInsideViewport: true,
        inFrontCornerCount: 8,
      }),
      hierarchy: {
        children: [expect.objectContaining({ sceneNodeId: 'node-1' })],
      },
      hierarchyObjectCount: 2,
      nodes: [
        {
          components: {
            components: [{ id: 'Transform' }],
            entityIndex: 7,
          },
          hierarchy: expect.objectContaining({
            entityIndex: 7,
            sceneNodeId: 'node-1',
          }),
          nodeId: 'node-1',
          transform: { nodeId: 'node-1', position: [1, 2, 3] },
        },
      ],
      performance: {
        calibrated: false,
        classification: 'host-browser-diagnostic',
        sampleFrames: 8,
        targetDevice: null,
        warmupFrames: 2,
      },
      renderStats: {
        available: true,
        calls: 1,
        frameTimeSamplesMs: expect.any(Array),
        meshCount: 2,
      },
      runtimeHashes: [RUNTIME_HASH],
    });
    expect(evidence.capture.bytes).toBeInstanceOf(Buffer);
    expect(evidence.editor.capture.bytes).toBeInstanceOf(Buffer);
    expect(evidence.editor.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'console',
          level: 'log',
          message: 'editor evidence fixture ready',
        }),
      ]),
    );
    expect(evidence.reloadStartedAt).toEqual(expect.any(Number));
    expect(evidence.runtimeReloadStartedAt).toEqual(expect.any(Number));
    expect(evidence.collectedAt).toBeGreaterThanOrEqual(
      evidence.runtimeReloadStartedAt,
    );
    expect(evidence.renderStats.frameTimeSamplesMs).toHaveLength(8);
    expect(
      await page.evaluate(() => localStorage.getItem('evidence-hero-view')),
    ).toBe('hero');
    const dispatches = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('evidence-dispatches') || '[]'),
    );
    const publishDispatches = dispatches.slice(
      dispatches.indexOf('editor:scene_get_document'),
    );
    const hierarchyIndex = publishDispatches.indexOf(
      'runtime:get_scene_hierarchy',
    );
    expect(
      publishDispatches
        .slice(3, hierarchyIndex)
        .every((entry: string) => entry === 'runtime:get_render_stats'),
    ).toBe(true);
    expect(publishDispatches.slice(0, 3)).toEqual([
      'editor:scene_get_document',
      'editor:scene_get_document',
      'editor:scene_capture_review',
    ]);
    expect(publishDispatches.slice(hierarchyIndex)).toEqual([
      'runtime:get_scene_hierarchy',
      'runtime:get_object_transform',
      'runtime:ecs_query_entity',
      'runtime:get_render_stats',
    ]);
    expect(
      accessRecords.some(
        (record) =>
          record.host === 'managed' &&
          record.pathname === '/__iwsdk/workspace' &&
          record.accessQuery === MANAGED_ACCESS_TOKEN,
      ),
    ).toBe(true);
    const observedCrossOriginRequests = await Promise.all(crossOriginRequests);
    expect(observedCrossOriginRequests.length).toBeGreaterThan(0);
    for (const record of [
      ...accessRecords.filter((entry) => entry.host === 'attacker'),
      ...observedCrossOriginRequests,
    ]) {
      expect(JSON.stringify(record)).not.toContain(MANAGED_ACCESS_TOKEN);
    }
    expect(JSON.stringify(evidence.editor.logs)).not.toContain(
      MANAGED_ACCESS_TOKEN,
    );
  }, 45_000);

  test('preserves editor state on publish evidence precondition errors', async () => {
    const page = browser.page as any;
    await page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR.session.isDirty = true;
    });
    const dirtyError = await collectRuntimePublishEvidence(page, {
      expectedDocumentHash: DOCUMENT_HASH,
      expectedRuntimeHash: RUNTIME_HASH,
      nodeIds: [],
    }).catch((error) => error);
    expect(dirtyError).toMatchObject({
      message: 'Scene has unsaved editor changes; save before publishing',
      publishEditorState: {
        dirty: true,
        documentHash: DOCUMENT_HASH,
        runtimeHash: RUNTIME_HASH,
      },
    });

    await page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR.session.isDirty = false;
    });
    const hashError = await collectRuntimePublishEvidence(page, {
      expectedDocumentHash: 'stale-document-hash',
      expectedRuntimeHash: RUNTIME_HASH,
      nodeIds: [],
    }).catch((error) => error);
    expect(hashError).toMatchObject({
      message: 'Managed editor hashes do not match the current scene file',
      publishEditorState: {
        dirty: false,
        documentHash: DOCUMENT_HASH,
        runtimeHash: RUNTIME_HASH,
      },
    });
  });

  test('keeps successful host results when workspace restoration fails', async () => {
    const page = browser.page as any;
    const forceUnrestorableEditorView = () =>
      page.evaluate(() => {
        document
          .querySelector('[data-workspace-view-button="editor"]')
          ?.remove();
        document.documentElement.dataset.iwsdkWorkspaceView = 'editor';
        const editor = document.querySelector<HTMLElement>('#editor');
        const frame = document.querySelector<HTMLElement>(
          '#workspace-runtime-frame',
        );
        if (editor) {
          editor.style.display = 'block';
        }
        if (frame) {
          frame.style.display = 'none';
        }
      });

    await forceUnrestorableEditorView();
    await expect(
      browser.captureRuntimeScreenshot({ format: 'png' }),
    ).resolves.toMatchObject({ metadata: { mimeType: 'image/png' } });

    await forceUnrestorableEditorView();
    await expect(
      browser.interactApplication({
        steps: [
          {
            action: 'fill',
            locator: { name: 'Name', role: 'textbox' },
            value: 'Restore warning',
          },
        ],
      }),
    ).resolves.toMatchObject({ success: true });

    expect(
      browser
        .queryLogs({ level: 'warn' })
        .some((entry) => entry.message.includes('could not be restored')),
    ).toBe(true);
  }, 30_000);

  test('cleans up an active profile when the application frame disappears', async () => {
    const page = browser.page as any;
    const started = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 10_000,
      mode: 'rendering',
    });
    await page
      .locator('#workspace-runtime-frame')
      .evaluate((frame: Element) => frame.remove());

    const stopped = await browser.profileApplication({
      action: 'stop',
      profileId: started.profileId,
    });
    expect(stopped.status).toBe('stopped');
    expect(stopped.interruptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'application-frame-unavailable' }),
      ]),
    );
    await expect(
      browser.profileApplication({ action: 'status' }),
    ).resolves.toMatchObject({
      profileId: started.profileId,
      status: 'stopped',
    });
  }, 30_000);
});
