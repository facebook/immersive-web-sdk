/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { createServer, type Server } from 'http';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { handleBrowserRun } from '../../cli/src/commands/browser.js';
import {
  describeElements,
  launchManagedBrowser,
  type ManagedBrowser,
} from '../src/headless-browser.js';

const APP_HTML = `<!doctype html>
<html>
  <body>
    <h1>Managed browser fixture</h1>
    <label for="name">Name</label>
    <input id="name" />
    <button id="action">Apply</button>
    <output id="result">idle</output>
    <input id="placeholder" placeholder="Placeholder Name" />
    <details id="details"><summary>More options</summary></details>
    <div data-testid="tab-target" tabindex="0">Tabbed target</div>
    <canvas width="200" height="100"></canvas>
    <button id="reload-during-step">Reload during interaction</button>
    <div style="height: 1800px"></div>
    <script>
      window.IWER_DEVICE = {};
      window.__IWSDK_MCP_PAGE_ID = 'desktop-fixture';
      const generation = Number(sessionStorage.getItem('generation') || '0') + 1;
      sessionStorage.setItem('generation', String(generation));
      window.__IWSDK_MCP_TAB_GENERATION = generation;
      window.fixtureState = { clicks: 0, canvasClicks: 0 };
      const bindButton = () => {
        document.querySelector('#action').addEventListener('click', () => {
          window.fixtureState.clicks += 1;
          document.querySelector('#result').textContent =
            document.querySelector('#name').value + ':' + window.fixtureState.clicks;
        });
      };
      bindButton();
      document.querySelector('canvas').addEventListener('click', () => {
        window.fixtureState.canvasClicks += 1;
      });
      document.querySelector('#reload-during-step').addEventListener('click', () => {
        window.location.reload();
      });
      window.replaceActionButton = () => {
        const current = document.querySelector('#action');
        const replacement = current.cloneNode(true);
        current.replaceWith(replacement);
        bindButton();
      };
    </script>
  </body>
</html>`;

describe('managed browser desktop development', () => {
  let server: Server;
  let origin: string;
  let workspaceRoot: string;
  let browser: ManagedBrowser;

  beforeAll(async () => {
    process.env.IWSDK_GPU = 'swiftshader';
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-browser-e2e-'));
    server = createServer((request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html');
      const requestUrl = new URL(request.url ?? '/', 'http://fixture');
      if (requestUrl.pathname === '/selector-fixture') {
        const variant = requestUrl.searchParams.get('variant');
        const controls =
          variant === 'absent-input'
            ? '<input>'
            : variant === 'invalid-input'
              ? '<input type="definitely-not-real">'
              : variant === 'input-matrix'
                ? `<input>
                   <input type="definitely-not-real">
                   <input type="checkbox">
                   <input type="radio">
                   <input type="range">
                   <input type="button">
                   <input type="submit">
                   <input type="reset">
                   <input type="email">`
                : `<canvas aria-label="Left canvas" width="100" height="100"></canvas>
                 <canvas aria-label="Right canvas" width="100" height="100"></canvas>`;
        response.end(`<!doctype html><html><body>${controls}<script>
          window.IWER_DEVICE = {};
          window.__IWSDK_MCP_PAGE_ID = 'selector-fixture';
          const generation = Number(sessionStorage.getItem('selector-generation') || '0') + 1;
          sessionStorage.setItem('selector-generation', String(generation));
          window.__IWSDK_MCP_TAB_GENERATION = generation;
          window.selectorClicks = [];
          document.querySelectorAll('canvas').forEach((canvas) => {
            canvas.addEventListener('click', () => window.selectorClicks.push(canvas.getAttribute('aria-label')));
          });
        </script></body></html>`);
        return;
      }
      response.end(APP_HTML);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (typeof address !== 'object' || address == null) {
      throw new Error('Fixture server address is unavailable');
    }
    origin = `http://127.0.0.1:${address.port}/`;
    browser = await launchManagedBrowser(
      origin,
      true,
      false,
      { height: 600, width: 800 },
      { height: 600, width: 800 },
      false,
      null,
      'iwer',
      workspaceRoot,
      true,
    );
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    await rm(workspaceRoot, { force: true, recursive: true });
    delete process.env.IWSDK_GPU;
  });

  test('discovers and drives DOM and canvas controls with rerender-safe refs', async () => {
    const snapshot = await browser.snapshotApplication();
    expect(snapshot.application).toMatchObject({
      generation: 1,
      id: 'desktop-fixture',
      url: origin,
    });
    const button = snapshot.elements.find(
      (element) => element.role === 'button' && element.name === 'Apply',
    );
    const input = snapshot.elements.find(
      (element) => element.role === 'textbox' && element.name === 'Name',
    );
    const canvas = snapshot.elements.find(
      (element) => element.role === 'canvas',
    );
    const placeholder = snapshot.elements.find(
      (element) =>
        element.role === 'textbox' && element.name === 'Placeholder Name',
    );
    const summary = snapshot.elements.find(
      (element) => element.role === 'button' && element.name === 'More options',
    );
    expect(button?.ref).toBeTruthy();
    expect(input?.ref).toBeTruthy();
    expect(canvas?.ref).toBeTruthy();
    expect(canvas?.name).toBe('');
    expect(placeholder?.ref).toBeTruthy();
    expect(summary?.ref).toBeTruthy();

    const interaction = await browser.interactApplication({
      steps: [
        { action: 'fill', ref: input!.ref, value: 'Ada' },
        { action: 'click', ref: button!.ref },
        { action: 'fill', ref: placeholder!.ref, value: 'Grace' },
        { action: 'click', ref: summary!.ref },
        {
          action: 'click',
          point: { canvasRef: canvas!.ref, x: 20, y: 20 },
        },
        { action: 'wait', text: 'Ada:1' },
      ],
    });
    expect(interaction.failure).toBeUndefined();
    expect(interaction).toMatchObject({ success: true });
    expect(interaction.completed).toHaveLength(6);

    const page = browser.page as any;
    expect(
      await page.evaluate(() => ({
        result: document.querySelector('#result')?.textContent,
        detailsOpen: document.querySelector('details')?.open,
        placeholder: (
          document.querySelector('#placeholder') as HTMLInputElement
        )?.value,
        state: (window as any).fixtureState,
      })),
    ).toEqual({
      detailsOpen: true,
      placeholder: 'Grace',
      result: 'Ada:1',
      state: { canvasClicks: 1, clicks: 1 },
    });

    await page.locator('#placeholder').evaluate((element: Element) => {
      element.removeAttribute('data-iwsdk-browser-ref');
      const duplicate = document.createElement('div');
      duplicate.id = 'placeholder';
      document.body.append(duplicate);
    });
    const semanticFallback = await browser.interactApplication({
      steps: [{ action: 'fill', ref: placeholder!.ref, value: 'Katherine' }],
    });
    expect(semanticFallback.success).toBe(true);
    expect(
      await page.evaluate(
        () =>
          (document.querySelector('input#placeholder') as HTMLInputElement)
            .value,
      ),
    ).toBe('Katherine');

    const refreshedSnapshot = await browser.snapshotApplication();
    const refreshedButton = refreshedSnapshot.elements.find(
      (element) => element.role === 'button' && element.name === 'Apply',
    );
    expect(refreshedButton?.ref).not.toBe(button!.ref);
    await page.evaluate(() => (window as any).replaceActionButton());
    const rerendered = await browser.interactApplication({
      steps: [{ action: 'click', ref: button!.ref }],
    });
    expect(rerendered.success).toBe(true);
    expect(await page.locator('#result').textContent()).toBe('Ada:2');
  });

  test('re-resolves absent and invalid input types plus labelled canvases', async () => {
    const selectorBrowser = await launchManagedBrowser(
      `${origin}selector-fixture?variant=absent-input`,
      true,
      false,
      { height: 600, width: 800 },
      { height: 600, width: 800 },
    );
    try {
      let snapshot = await selectorBrowser.snapshotApplication();
      let input = snapshot.elements.find(
        (element) => element.role === 'textbox',
      );
      expect(input?.ref).toBeTruthy();
      await expect(
        selectorBrowser.interactApplication({
          steps: [{ action: 'fill', ref: input!.ref, value: 'absent' }],
        }),
      ).resolves.toMatchObject({ success: true });

      const selectorPage = selectorBrowser.page as any;
      expect(await selectorPage.locator('input').inputValue()).toBe('absent');
      await selectorPage.goto(
        `${origin}selector-fixture?variant=invalid-input`,
      );
      snapshot = await selectorBrowser.snapshotApplication();
      input = snapshot.elements.find((element) => element.role === 'textbox');
      expect(input?.ref).toBeTruthy();
      await expect(
        selectorBrowser.interactApplication({
          steps: [{ action: 'fill', ref: input!.ref, value: 'invalid' }],
        }),
      ).resolves.toMatchObject({ success: true });
      expect(await selectorPage.locator('input').inputValue()).toBe('invalid');

      await selectorPage.goto(`${origin}selector-fixture?variant=canvases`);
      snapshot = await selectorBrowser.snapshotApplication();
      const canvases = snapshot.elements.filter(
        (element) => element.role === 'canvas',
      );
      expect(canvases.map((canvas) => canvas.name)).toEqual([
        'Left canvas',
        'Right canvas',
      ]);
      await expect(
        selectorBrowser.interactApplication({
          steps: canvases.map((canvas) => ({
            action: 'click' as const,
            point: { canvasRef: canvas.ref, x: 10, y: 10 },
          })),
        }),
      ).resolves.toMatchObject({ success: true });
      expect(
        await selectorPage.evaluate(() => (window as any).selectorClicks),
      ).toEqual(['Left canvas', 'Right canvas']);

      await selectorPage.goto(`${origin}selector-fixture?variant=input-matrix`);
      const descriptors = await selectorPage
        .locator('body')
        .evaluate(describeElements, {
          maxCandidates: 20,
          maxNodes: 20,
          maxTextLength: 50,
        });
      expect(
        descriptors.elements.map(({ role, selector }) => ({ role, selector })),
      ).toEqual([
        { role: 'textbox', selector: 'input' },
        {
          role: 'textbox',
          selector: 'input[type="definitely-not-real"]',
        },
        { role: 'checkbox', selector: 'input[type="checkbox"]' },
        { role: 'radio', selector: 'input[type="radio"]' },
        { role: 'slider', selector: 'input[type="range"]' },
        { role: 'button', selector: 'input[type="button"]' },
        { role: 'button', selector: 'input[type="submit"]' },
        { role: 'button', selector: 'input[type="reset"]' },
        { role: 'textbox', selector: 'input[type="email"]' },
      ]);
    } finally {
      await selectorBrowser.close();
    }
  }, 120_000);

  test('fingerprints the ref root after an attribute-only candidate drifts', async () => {
    const rootBrowser = await launchManagedBrowser(origin, true, false);
    try {
      const page = rootBrowser.page as any;
      const snapshot = await rootBrowser.snapshotApplication();
      const target = snapshot.elements.find(
        (element) => element.name === 'Tabbed target',
      );
      expect(target?.ref).toBeTruthy();
      await page.locator('[data-testid="tab-target"]').evaluate((element) => {
        element.removeAttribute('tabindex');
      });
      await expect(
        rootBrowser.interactApplication({
          steps: [{ action: 'hover', ref: target!.ref }],
        }),
      ).resolves.toMatchObject({ success: true });

      await page.locator('[data-testid="tab-target"]').evaluate((element) => {
        const replacement = document.createElement('button');
        replacement.dataset.testid = 'tab-target';
        replacement.textContent = 'Tabbed target';
        element.replaceWith(replacement);
      });
      await expect(
        rootBrowser.interactApplication({
          steps: [{ action: 'hover', ref: target!.ref }],
        }),
      ).resolves.toMatchObject({
        failure: { retryable: true },
        success: false,
      });
    } finally {
      await rootBrowser.close();
    }
  });

  test('returns actionable stale-ref failure evidence', async () => {
    const snapshot = await browser.snapshotApplication();
    const button = snapshot.elements.find(
      (element) => element.role === 'button',
    );
    expect(button).toBeTruthy();
    const page = browser.page as any;
    await page
      .locator('#action')
      .evaluate((element: Element) => element.remove());

    const interaction = await browser.interactApplication({
      steps: [{ action: 'click', ref: button!.ref }],
    });
    expect(interaction.success).toBe(false);
    expect(interaction.failure).toMatchObject({
      action: 'click',
      index: 0,
      retryable: true,
      screenshot: { mimeType: 'image/png' },
    });
    expect(interaction.failure?.snapshot).not.toBeNull();
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'action';
      button.textContent = 'Apply';
      document.querySelector('#result')?.before(button);
      (window as any).replaceActionButton = () => {};
      button.addEventListener('click', () => {
        (window as any).fixtureState.clicks += 1;
      });
    });
  });

  test('captures bounded structured browser diagnostics and redacts the attach endpoint', async () => {
    const page = browser.page as any;
    const endpoint = browser.getAutomationEndpoint()!;
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(
      ({ endpoint }) => {
        console.log('structured-diagnostic', {
          nested: { value: 'x'.repeat(10_000) },
        });
        console.log('automation-endpoint', endpoint);
        alert('fixture-dialog');
        void fetch('http://127.0.0.1:1/request-failure').catch(() => {});
        window.open('/popup', '_blank');
      },
      { endpoint },
    );
    const popup = await popupPromise;
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(new Blob(['fixture-download']));
      anchor.download = 'fixture.txt';
      anchor.click();
    });
    await downloadPromise;
    await popup.close();

    await expect
      .poll(
        () =>
          Array.from(new Set(browser.queryLogs().map((entry) => entry.kind))),
        { timeout: 10_000 },
      )
      .toEqual(
        expect.arrayContaining([
          'console',
          'dialog',
          'download',
          'popup',
          'requestfailed',
        ]),
      );
    const logs = browser.queryLogs();
    expect(JSON.stringify(logs)).not.toContain(endpoint);
    expect(JSON.stringify(logs)).toContain('[redacted]');
    expect(
      logs
        .flatMap((entry) => entry.args)
        .every((value) => value.length <= 4_000),
    ).toBe(true);
    expect(logs.find((entry) => entry.kind === 'requestfailed')).toMatchObject({
      method: 'GET',
      resourceType: 'fetch',
    });

    await page.evaluate(() => {
      for (let index = 0; index < 250; index += 1) {
        console.warn(`bounded-log-${index}`, { index });
      }
    });
    await expect
      .poll(() => browser.queryLogs({ pattern: 'bounded-log-249' }).length, {
        timeout: 10_000,
      })
      .toBe(1);
    const defaultLogs = browser.queryLogs();
    const cappedLogs = browser.queryLogs({ count: 10_000 });
    expect(defaultLogs.length).toBeLessThanOrEqual(100);
    expect(cappedLogs.length).toBeLessThanOrEqual(200);
    expect(
      Buffer.byteLength(JSON.stringify(cappedLogs), 'utf8'),
    ).toBeLessThanOrEqual(256 * 1024);
    expect(
      cappedLogs.every(
        (entry, index) =>
          index === 0 || entry.timestamp >= cappedLogs[index - 1]!.timestamp,
      ),
    ).toBe(true);
  });

  test('captures JPEG metadata, reload generation, and interaction profiles', async () => {
    const capture = await browser.captureRuntimeScreenshot({
      format: 'jpeg',
      quality: 80,
    });
    expect(capture.metadata).toMatchObject({
      height: 600,
      mimeType: 'image/jpeg',
      width: 800,
    });
    expect(capture.bytes.length).toBeGreaterThan(100);

    const fullPageCapture = await browser.captureRuntimeScreenshot({
      format: 'png',
      fullPage: true,
    });
    expect(fullPageCapture.metadata).toMatchObject({
      downscaled: true,
      mimeType: 'image/png',
    });
    expect(fullPageCapture.metadata.width).toBeLessThanOrEqual(800);
    expect(fullPageCapture.metadata.height).toBeLessThanOrEqual(600);

    const started = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 10_000,
      mode: 'interaction',
    });
    expect(started).toMatchObject({
      calibrated: false,
      status: 'started',
      targetDevice: null,
    });
    const snapshot = await browser.snapshotApplication();
    const input = snapshot.elements.find(
      (element) => element.role === 'textbox',
    );
    await browser.interactApplication({
      steps: [{ action: 'fill', ref: input!.ref, value: 'Profiled' }],
    });
    await (browser.page as any).waitForTimeout(50);
    const stopped = await browser.profileApplication({
      action: 'stop',
      profileId: started.profileId,
    });
    expect(stopped).toMatchObject({
      calibrated: false,
      status: 'stopped',
      targetDevice: null,
    });
    expect(stopped.summary?.frameTimeMs.sampleCount).toBeGreaterThan(0);
    expect(
      stopped.summary?.marks.some((mark) => mark.name.includes('-step-0-fill')),
    ).toBe(true);

    const reloadProfile = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 10_000,
      mode: 'rendering',
    });
    const reloaded = await browser.reloadApplication();
    expect(reloaded).toMatchObject({
      generation: 2,
      id: 'desktop-fixture',
      url: origin,
    });
    const interrupted = await browser.profileApplication({ action: 'status' });
    expect(interrupted).toMatchObject({
      profileId: reloadProfile.profileId,
      status: 'stopped',
    });
    expect(interrupted.interruptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'reload' })]),
    );

    const autoStopped = await browser.profileApplication({
      action: 'start',
      maxDurationMs: 1_000,
      mode: 'interaction',
    });
    await expect
      .poll(
        async () =>
          (await browser.profileApplication({ action: 'status' })).status,
        { timeout: 5_000 },
      )
      .toBe('stopped');
    const timedOut = await browser.profileApplication({ action: 'status' });
    expect(timedOut.profileId).toBe(autoStopped.profileId);
    expect(timedOut.interruptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'timeout' })]),
    );
  });

  test('returns retryable evidence when navigation destroys a step context', async () => {
    const interaction = await browser.interactApplication({
      steps: [
        {
          action: 'click',
          locator: { name: 'Reload during interaction', role: 'button' },
        },
      ],
    });

    expect(interaction).toMatchObject({
      failure: {
        action: 'click',
        index: 0,
        retryable: true,
      },
      success: false,
    });
    expect(interaction.failure?.snapshot).not.toBeUndefined();
    expect(interaction.failure?.screenshot).not.toBeUndefined();
  });

  test('runs an opt-in Playwright script against the same managed page', async () => {
    const automationTarget = browser.getAutomationTarget();
    expect(automationTarget?.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(automationTarget?.targetId).toMatch(/^[A-Fa-f0-9]+$/);
    const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
    const runnerWorkspace = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-browser-run-e2e-'),
    );
    try {
      const scopedModules = path.join(
        runnerWorkspace,
        'node_modules',
        '@iwsdk',
      );
      await mkdir(scopedModules, { recursive: true });
      await symlink(
        path.join(repoRoot, 'packages', 'vite-plugin-dev'),
        path.join(scopedModules, 'vite-plugin-dev'),
        'dir',
      );
      await writeFile(
        path.join(runnerWorkspace, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@iwsdk/cli': '*',
            '@iwsdk/vite-plugin-dev': '*',
          },
          name: 'browser-run-fixture',
          type: 'module',
        }),
      );
      await writeFile(
        path.join(runnerWorkspace, 'vite.config.ts'),
        'export default {};',
      );
      await mkdir(path.join(runnerWorkspace, '.iwsdk', 'runtime'), {
        recursive: true,
      });
      await writeFile(
        path.join(runnerWorkspace, '.iwsdk', 'runtime', 'session.json'),
        JSON.stringify({
          browserAutomation: {
            configured: true,
            enabled: true,
            endpoint: automationTarget!.endpoint,
            protocol: 'cdp',
            targetId: automationTarget!.targetId,
          },
          localUrl: origin,
          networkUrls: [],
          pid: process.pid,
          port: Number(new URL(origin).port),
          registeredAt: new Date().toISOString(),
          schemaVersion: 2,
          sessionId: 'browser-run-fixture',
          updatedAt: new Date().toISOString(),
          workspaceRoot: runnerWorkspace,
        }),
      );
      await writeFile(
        path.join(runnerWorkspace, 'run.mjs'),
        `export default async ({ page, frame, cdp }) => {
          let closeProtected = false;
          try { await page.close(); } catch { closeProtected = true; }
          let cdpCloseProtected = false;
          try { await cdp.send('Page.close'); } catch { cdpCloseProtected = true; }
          await frame.locator('#name').fill('Runner');
          await frame.evaluate(() => localStorage.setItem('runner-storage', 'same-session'));
          const metrics = await cdp.send('Performance.getMetrics');
          return { cdpCloseProtected, closeProtected, metrics: metrics.metrics.length, storage: await frame.evaluate(() => localStorage.getItem('runner-storage')), value: await frame.locator('#name').inputValue() };
        };`,
      );
      await (browser.page as any).evaluate(() => {
        history.replaceState({}, '', '/changed-by-runner-test');
        const decoy = document.createElement('iframe');
        decoy.id = 'workspace-runtime-frame';
        document.body.append(decoy);
      });

      const result = await handleBrowserRun(
        'run.mjs',
        {},
        {
          cwd: runnerWorkspace,
          stderr: process.stderr,
          stdout: process.stdout,
        },
      );
      expect(result.data).toMatchObject({
        operation: 'browser.run',
        result: {
          cdpCloseProtected: true,
          closeProtected: true,
          storage: 'same-session',
          value: 'Runner',
        },
        script: 'run.mjs',
      });
      expect(await (browser.page as any).locator('#name').inputValue()).toBe(
        'Runner',
      );
      expect(browser.isClosed()).toBe(false);
      expect(
        (await browser.snapshotApplication()).elements.some(
          (element) => element.role === 'textbox' && element.name === 'Name',
        ),
      ).toBe(true);

      await writeFile(
        path.join(runnerWorkspace, 'large-result.mjs'),
        `export default () => ({ value: 'x'.repeat(1024 * 1024) });`,
      );
      await expect(
        handleBrowserRun(
          'large-result.mjs',
          {},
          {
            cwd: runnerWorkspace,
            stderr: process.stderr,
            stdout: process.stdout,
          },
        ),
      ).rejects.toThrow('browser run result exceeds 1048576 bytes');

      await writeFile(
        path.join(runnerWorkspace, 'slow.mjs'),
        'await new Promise(() => {}); export default () => null;',
      );
      await expect(
        handleBrowserRun(
          'slow.mjs',
          { timeout: '100' },
          {
            cwd: runnerWorkspace,
            stderr: process.stderr,
            stdout: process.stdout,
          },
        ),
      ).rejects.toThrow('browser run timed out after 100ms');
      expect(browser.isClosed()).toBe(false);
    } finally {
      await rm(runnerWorkspace, { force: true, recursive: true });
    }
  });

  test('separates queue expiry from active timeout recovery', async () => {
    let releaseActive!: () => void;
    const active = browser.runCommandExclusive(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
      { timeoutMs: 5_000 },
    );
    await expect
      .poll(() => typeof releaseActive, { timeout: 1_000 })
      .toBe('function');

    const expiredInQueue = browser.runCommandExclusive(
      async () => 'must-not-run',
      { queueTimeoutMs: 100, timeoutMs: 5_000 },
    );
    await expect(expiredInQueue).rejects.toMatchObject({
      code: 'browser_command_queue_timeout',
      retryable: true,
    });
    expect(browser.isClosed()).toBe(false);
    releaseActive();
    await active;

    const timedOutActive = browser.runCommandExclusive(
      () => new Promise<never>(() => {}),
      { timeoutMs: 100 },
    );
    const rejectedBehindIt = browser.runCommandExclusive(
      async () => 'must-not-run',
      { queueTimeoutMs: 5_000, timeoutMs: 5_000 },
    );
    const queuedRejection = expect(rejectedBehindIt).rejects.toMatchObject({
      code: 'browser_command_aborted',
      retryable: true,
    });
    await expect(timedOutActive).rejects.toMatchObject({
      code: 'browser_command_timeout',
      retryable: true,
    });
    await queuedRejection;
    expect(browser.isClosed()).toBe(true);
  });
});
