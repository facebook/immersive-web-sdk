/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createServer } from 'vite';
import { test, expect, vi } from 'vitest';
import {
  inspectRuntimeOwner,
  runtimeOwnerEndpoint,
} from '../../cli/src/runtime-owner.js';
import { getRuntimeSession } from '../../cli/src/runtime-state.js';
import { iwsdkDev } from '../src/index.js';
import { unusedPort } from './unused-port.js';

const control = vi.hoisted(() => ({
  launchMs: 0,
  closeMs: 0,
  live: 0,
  maximum: 0,
  launches: 0,
}));
vi.mock('../src/headless-browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/headless-browser.js')>()),
  ensureChromiumInstalled: async () => {},
  launchManagedBrowser: async () => {
    control.launches++;
    await new Promise((resolve) => setTimeout(resolve, control.launchMs));
    control.live++;
    control.maximum = Math.max(control.maximum, control.live);
    let closed = false;
    let closing: Promise<void> | undefined;
    return {
      isClosed: () => closed,
      onClose: () => {},
      close: () =>
        (closing ??= new Promise<void>((resolve) =>
          setTimeout(() => {
            closed = true;
            control.live--;
            resolve();
          }, control.closeMs),
        )),
      getAutomationTarget: () => null,
      getAutomationEndpoint: () => null,
      getTabMetadata: async () => ({ id: null, generation: null }),
    };
  },
}));

test.each([
  {
    name: 'slow browser cleanup',
    launchMs: 0,
    closeMs: 2300,
    initialState: 'running',
  },
  {
    name: 'restart during launch',
    launchMs: 3000,
    closeMs: 20,
    initialState: 'launching',
  },
])(
  '$name hands ownership to the replacement only after disposal',
  async ({ launchMs, closeMs, initialState }) => {
    Object.assign(control, {
      launchMs,
      closeMs,
      live: 0,
      maximum: 0,
      launches: 0,
    });
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-restart-browser-'),
    );
    await writeFile(path.join(root, 'index.html'), '<h1>alive</h1>');
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        iwsdkDev({
          https: false,
          iwer: false,
          workspace: { enabled: true, open: true, headless: true },
        }),
      ],
      server: { host: '127.0.0.1', port: await unusedPort() },
    });
    try {
      await server.listen();
      await expect
        .poll(
          async () =>
            (await getRuntimeSession(root))?.browser?.lifecycle?.state,
        )
        .toBe(initialState);
      await expect.poll(() => control.launches).toBe(1);
      const before = (await getRuntimeSession(root))!;
      await server.restart();
      await expect
        .poll(
          async () =>
            (await getRuntimeSession(root))?.browser?.lifecycle?.state,
          { timeout: 10000 },
        )
        .toBe('running');
      const after = (await getRuntimeSession(root))!;
      expect(after.sessionId).not.toBe(before.sessionId);
      expect(after.port).toBe(before.port);
      expect(
        await (await fetch(`http://127.0.0.1:${after.port}`)).text(),
      ).toContain('alive');
      expect(control.maximum).toBe(1);
    } finally {
      server.httpServer?.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
    expect(control.live).toBe(0);
  },
  20000,
);

test('a restart that exceeds cleanup deadline retains ownership until late disposal', async () => {
  Object.assign(control, {
    launchMs: 0,
    closeMs: 31500,
    live: 0,
    maximum: 0,
    launches: 0,
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-late-cleanup-'));
  await writeFile(path.join(root, 'index.html'), '<h1>alive</h1>');
  const port = await unusedPort();
  const create = (open: boolean) =>
    createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        iwsdkDev({
          https: false,
          iwer: false,
          workspace: { enabled: true, open, headless: true },
        }),
      ],
      server: { host: '127.0.0.1', port },
    });
  const first = await create(true);
  let next: Awaited<ReturnType<typeof create>> | undefined;
  try {
    await first.listen();
    await expect.poll(() => control.live).toBe(1);
    await expect(first.restart()).rejects.toThrow(/cleanup/i);
    expect((await inspectRuntimeOwner(runtimeOwnerEndpoint(root))).state).toBe(
      'live',
    );
    expect(control.maximum).toBe(1);
    await expect.poll(() => control.live, { timeout: 5000 }).toBe(0);
    await expect
      .poll(
        async () =>
          (await inspectRuntimeOwner(runtimeOwnerEndpoint(root))).state,
        { timeout: 5000 },
      )
      .toBe('absent');
    next = await create(false);
    await next.listen();
    expect((await fetch(`http://127.0.0.1:${port}/`)).ok).toBe(true);
  } finally {
    await next?.close();
    await first.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}, 45000);
