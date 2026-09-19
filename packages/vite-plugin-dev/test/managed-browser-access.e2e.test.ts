/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFile, writeFile } from 'fs/promises';
import { createServer, type IncomingMessage, type Server } from 'http';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  launchManagedBrowser,
  MANAGED_WORKSPACE_QUERY,
  type ManagedBrowser,
} from '../src/headless-browser.js';
import {
  createEditorTestHarness,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

interface RequestRecord {
  caseName: string;
  method: string;
  queryToken: string | undefined;
  referer: string | undefined;
  server: 'attacker' | 'managed';
  token: string | undefined;
}

function caseName(request: IncomingMessage): string {
  return (
    new URL(request.url ?? '/', 'http://fixture').searchParams.get('case') ??
    'none'
  );
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for request');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('managed browser access-header scoping', () => {
  const accessHeader = 'x-iwsdk-managed-access';
  const accessToken = 'managed-token-for-e2e';
  const records: RequestRecord[] = [];
  let attackerOrigin = '';
  let attackerServer: Server;
  let browser: ManagedBrowser;
  let managedOrigin = '';
  let managedServer: Server;

  beforeAll(async () => {
    process.env.IWSDK_GPU = 'swiftshader';
    managedServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://fixture');
      records.push({
        caseName: caseName(request),
        method: request.method ?? 'GET',
        queryToken: url.searchParams.get(MANAGED_WORKSPACE_QUERY) ?? undefined,
        referer: request.headers.referer,
        server: 'managed',
        token:
          typeof request.headers[accessHeader] === 'string'
            ? request.headers[accessHeader]
            : undefined,
      });
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader(
        'access-control-allow-methods',
        'GET, POST, PUT, OPTIONS',
      );
      response.setHeader('access-control-allow-headers', 'x-attacker');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }
      const hasTopLevelAccess =
        request.headers[accessHeader] === accessToken ||
        url.searchParams.get(MANAGED_WORKSPACE_QUERY) === accessToken;
      if (
        (url.pathname === '/' || url.pathname === '/top') &&
        !hasTopLevelAccess
      ) {
        response.statusCode = 403;
        response.end('Managed browser access required');
        return;
      }
      if (
        url.pathname === '/top' &&
        url.searchParams.get('case') === 'bootstrap-redirect'
      ) {
        response.statusCode = 302;
        response.setHeader(
          'location',
          `${attackerOrigin}/capture?case=bootstrap-redirect`,
        );
        response.end();
        return;
      }
      if (
        url.pathname === '/protected' &&
        url.searchParams.get('case') === 'redirect-out'
      ) {
        response.statusCode = 302;
        response.setHeader(
          'location',
          `${attackerOrigin}/capture?case=redirect-out`,
        );
        response.end();
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html');
      if (url.pathname === '/') {
        response.end(`<!doctype html><html><body>
          <img src="${attackerOrigin}/capture?case=bootstrap-subresource">
          <script>window.IWER_DEVICE = {};</script>
        </body></html>`);
        return;
      }
      response.end(
        '<!doctype html><script>window.IWER_DEVICE = {};</script>managed',
      );
    });
    attackerServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://fixture');
      records.push({
        caseName: caseName(request),
        method: request.method ?? 'GET',
        queryToken: url.searchParams.get(MANAGED_WORKSPACE_QUERY) ?? undefined,
        referer: request.headers.referer,
        server: 'attacker',
        token:
          typeof request.headers[accessHeader] === 'string'
            ? request.headers[accessHeader]
            : undefined,
      });
      if (url.pathname === '/redirect') {
        response.statusCode = 302;
        response.setHeader(
          'location',
          `${managedOrigin}/protected?case=redirect`,
        );
        response.end();
        return;
      }
      if (url.pathname === '/capture') {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/html');
        response.end(
          '<!doctype html><script>window.IWER_DEVICE = {};</script>',
        );
        return;
      }
      const target = url.searchParams.get('managed') ?? managedOrigin;
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html');
      if (url.pathname === '/top-attack') {
        response.end(
          `<!doctype html><script>location.href = ${JSON.stringify(
            `${target}/top?case=attacker-top`,
          )};</script>`,
        );
        return;
      }
      response.end(`<!doctype html><html><body><script>
        fetch(${JSON.stringify(
          `${target}/protected?case=simple-post`,
        )}, { method: 'POST', mode: 'no-cors' });
        fetch(${JSON.stringify(`${target}/protected?case=preflight`)}, {
          method: 'PUT',
          headers: { 'x-attacker': '1' },
        }).catch(() => {});
        const redirected = document.createElement('iframe');
        redirected.src = '/redirect';
        document.body.append(redirected);
        const nested = document.createElement('iframe');
        document.body.append(nested);
        nested.src = ${JSON.stringify(`${target}/protected?case=nested-blank`)};
      </script></body></html>`);
    });

    await Promise.all(
      [managedServer, attackerServer].map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve());
          }),
      ),
    );
    const managedAddress = managedServer.address();
    const attackerAddress = attackerServer.address();
    if (
      typeof managedAddress !== 'object' ||
      managedAddress == null ||
      typeof attackerAddress !== 'object' ||
      attackerAddress == null
    ) {
      throw new Error('Fixture server address is unavailable');
    }
    managedOrigin = `http://127.0.0.1:${managedAddress.port}`;
    attackerOrigin = `http://127.0.0.1:${attackerAddress.port}`;
    browser = await launchManagedBrowser(
      `${managedOrigin}/?case=initial`,
      true,
      false,
      { height: 600, width: 800 },
      { height: 600, width: 800 },
      false,
      {
        headerName: accessHeader,
        pathnames: ['/protected'],
        token: accessToken,
        topLevelPathnames: ['/', '/top'],
      },
      'iwer',
    );
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await Promise.all(
      [managedServer, attackerServer].map(
        (server) =>
          new Promise<void>((resolve) => server?.close(() => resolve())),
      ),
    );
    delete process.env.IWSDK_GPU;
  });

  test('bootstraps the managed page natively and scrubs query authority', async () => {
    const page = browser.page as any;
    const initial = records.find(
      (record) => record.server === 'managed' && record.caseName === 'initial',
    );
    expect(initial).toMatchObject({
      queryToken: accessToken,
      token: undefined,
    });
    expect(page.url()).toBe(`${managedOrigin}/?case=initial`);
    await waitFor(() =>
      records.some((record) => record.caseName === 'bootstrap-subresource'),
    );
    const subresource = records.find(
      (record) => record.caseName === 'bootstrap-subresource',
    );
    expect(subresource?.token).toBeUndefined();
    expect(subresource?.queryToken).toBeUndefined();
    expect(subresource?.referer).not.toContain(accessToken);

    const initialRequestCount = records.filter(
      (record) => record.server === 'managed' && record.caseName === 'initial',
    ).length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).IWER_DEVICE != null);
    await waitFor(
      () =>
        records.filter(
          (record) =>
            record.server === 'managed' && record.caseName === 'initial',
        ).length > initialRequestCount,
    );
    const reloaded = records
      .filter(
        (record) =>
          record.server === 'managed' && record.caseName === 'initial',
      )
      .at(-1);
    expect(reloaded).toMatchObject({
      queryToken: accessToken,
      token: undefined,
    });
    expect(page.url()).toBe(`${managedOrigin}/?case=initial`);
  });

  test('does not confer access to cross-origin posts, preflights, redirects, or nested frames', async () => {
    const page = browser.page as any;
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(
      (target: string) => window.open(target, '_blank'),
      `${attackerOrigin}/attack?managed=${encodeURIComponent(managedOrigin)}`,
    );
    const attacker = await popupPromise;
    await attacker.waitForLoadState('domcontentloaded');
    await waitFor(() =>
      ['simple-post', 'preflight', 'redirect', 'nested-blank'].every((name) =>
        records.some((record) => record.caseName === name),
      ),
    );
    for (const name of [
      'simple-post',
      'preflight',
      'redirect',
      'nested-blank',
    ]) {
      expect(
        records.filter((record) => record.caseName === name),
      ).not.toContainEqual(expect.objectContaining({ token: accessToken }));
    }
    await attacker.close();
  }, 15_000);

  test('allows trusted managed requests and rejects attacker top-level navigation', async () => {
    const page = browser.page as any;
    await page.evaluate(() =>
      fetch('/protected?case=trusted-post', { method: 'POST' }),
    );
    await waitFor(() =>
      records.some((record) => record.caseName === 'trusted-post'),
    );
    expect(
      records.find((record) => record.caseName === 'trusted-post')?.token,
    ).toBe(accessToken);
    expect(
      records.find((record) => record.caseName === 'initial'),
    ).toMatchObject({ queryToken: accessToken, token: undefined });

    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(
      (target: string) => window.open(target, '_blank'),
      `${managedOrigin}/top?case=attacker-popup`,
    );
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await waitFor(() =>
      records.some((record) => record.caseName === 'attacker-popup'),
    );
    expect(
      records.find((record) => record.caseName === 'attacker-popup')?.token,
    ).toBeUndefined();
    await popup.close();

    const redirectedRequest = page.waitForRequest(
      (request: any) =>
        request.url() === `${attackerOrigin}/capture?case=redirect-out`,
    );
    await page
      .evaluate(() => fetch('/protected?case=redirect-out'))
      .catch(() => {});
    const redirected = await redirectedRequest;
    expect(
      (await redirected.allHeaders())[accessHeader],
      'the redirected browser request must not inherit managed authority',
    ).toBeUndefined();
    expect(
      records.find(
        (record) =>
          record.caseName === 'redirect-out' && record.server === 'attacker',
      )?.token,
    ).toBeUndefined();
    expect(
      records.find(
        (record) =>
          record.caseName === 'redirect-out' && record.server === 'attacker',
      )?.referer,
    ).not.toContain(accessToken);

    await page.goto(
      `${attackerOrigin}/top-attack?managed=${encodeURIComponent(managedOrigin)}`,
    );
    await page.waitForURL(`${managedOrigin}/top?case=attacker-top`);
    expect(
      records.find((record) => record.caseName === 'attacker-top')?.token,
    ).toBeUndefined();

    const hostNavigation = await page.goto(
      `${managedOrigin}/top?case=host-top`,
    );
    expect(hostNavigation?.status()).toBe(403);
    expect(
      records.find((record) => record.caseName === 'host-top'),
    ).toMatchObject({ queryToken: undefined, token: undefined });
  }, 15_000);

  test('does not leak bootstrap authority through a cross-origin redirect', async () => {
    const redirectedBrowser = await launchManagedBrowser(
      `${managedOrigin}/top?case=bootstrap-redirect`,
      true,
      false,
      { height: 600, width: 800 },
      { height: 600, width: 800 },
      false,
      {
        headerName: accessHeader,
        pathnames: ['/protected'],
        token: accessToken,
        topLevelPathnames: ['/top'],
      },
      'iwer',
    );
    try {
      expect(
        records.find(
          (record) =>
            record.server === 'managed' &&
            record.caseName === 'bootstrap-redirect',
        ),
      ).toMatchObject({ queryToken: accessToken, token: undefined });
      const redirected = records.find(
        (record) =>
          record.server === 'attacker' &&
          record.caseName === 'bootstrap-redirect',
      );
      expect(redirected).toBeDefined();
      expect(JSON.stringify(redirected)).not.toContain(accessToken);
    } finally {
      await redirectedBrowser.close();
    }
  }, 30_000);

  test('reaches command readiness over a real HTTPS Vite WebSocket bridge', async () => {
    let harness: EditorTestHarness | undefined;
    try {
      harness = await createEditorTestHarness('managed-browser-bridge', {
        managedBrowser: true,
      });
      expect(harness.baseUrl).toMatch(/^https:\/\//);
      const sessionPath = path.join(
        harness.tempRoot,
        '.iwsdk/runtime/session.json',
      );
      const readBrowserState = async () => {
        try {
          const session = JSON.parse(await readFile(sessionPath, 'utf8'));
          return session.browser ?? null;
        } catch {
          return null;
        }
      };
      await expect
        .poll(readBrowserState, { interval: 100, timeout: 60_000 })
        .toMatchObject({
          commandReady: true,
          connected: true,
          status: 'connected',
        });
      const initialBridgeConnectedAt = (await readBrowserState())
        ?.lastBridgeConnectedAt;
      expect(initialBridgeConnectedAt).toBeTruthy();

      const indexPath = path.join(harness.tempRoot, 'index.html');
      const indexSource = await readFile(indexPath, 'utf8');
      await writeFile(
        indexPath,
        `${indexSource}\n<!-- force Vite full reload during managed readiness -->\n`,
        'utf8',
      );
      await expect
        .poll(
          async () => {
            const state = await readBrowserState();
            return {
              commandReady: state?.commandReady,
              connected: state?.connected,
              reconnected:
                state?.lastBridgeConnectedAt != null &&
                state.lastBridgeConnectedAt !== initialBridgeConnectedAt,
              status: state?.status,
            };
          },
          { interval: 100, timeout: 60_000 },
        )
        .toMatchObject({
          commandReady: true,
          connected: true,
          reconnected: true,
          status: 'connected',
        });

      // A bridge can connect before launchManagedBrowser's readiness wait
      // settles. Stay past the former 15-second ceiling to catch a late
      // launch_failed transition after Vite's reload.
      await new Promise((resolve) => setTimeout(resolve, 16_000));
      expect(await readBrowserState()).toMatchObject({
        commandReady: true,
        connected: true,
        status: 'connected',
      });
    } finally {
      await harness?.close();
    }
  }, 120_000);
});
