/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { iwsdkExampleAssets } from '../src/vite.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) =>
      rm(tempDir, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('iwsdkExampleAssets Vite plugin', () => {
  test('copies requested assets into the Vite build output', async () => {
    const root = await makeTempDir();
    const plugin = iwsdkExampleAssets({ assetIds: ['plant-sansevieria'] });

    await callHook(plugin.configResolved, {
      build: { outDir: 'dist' },
      root,
    });
    await callHook(plugin.writeBundle);

    await expect(
      readFile(
        path.join(
          root,
          'dist',
          'iwsdk-assets',
          'plant-sansevieria',
          'plantSansevieria.gltf',
        ),
        'utf8',
      ),
    ).resolves.toContain('"asset"');
  });

  test('serves catalog-declared MIME types from the existing dev URL', async () => {
    const plugin = iwsdkExampleAssets({ assetIds: ['robot'] });
    let middleware:
      | ((
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void,
        ) => void | Promise<void>)
      | undefined;
    plugin.configureServer({
      middlewares: {
        use(handler) {
          middleware = handler;
        },
      },
    });
    if (middleware == null) {
      throw new Error('Expected Vite middleware to be registered');
    }

    const headers = new Map<string, string>();
    let body: Buffer | undefined;
    let status: number | undefined;
    let nextCalled = false;
    const response = {
      end(chunk?: Buffer) {
        body = chunk;
        return this;
      },
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
        return this;
      },
      writeHead(statusCode: number) {
        status = statusCode;
        return this;
      },
    } as unknown as ServerResponse;

    await middleware(
      {
        url: '/iwsdk-assets/robot/robot.gltf',
      } as IncomingMessage,
      response,
      () => {
        nextCalled = true;
      },
    );

    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe('model/gltf+json');
    expect(body?.toString('utf8')).toContain('"asset"');
    expect(nextCalled).toBe(false);
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'iwsdk-vite-assets-test-'),
  );
  tempDirs.push(tempDir);
  return tempDir;
}

async function callHook<Args extends unknown[]>(
  hook:
    | ((...args: Args) => void | Promise<void>)
    | { handler: (...args: Args) => void | Promise<void> }
    | undefined,
  ...args: Args
): Promise<void> {
  if (hook == null) {
    throw new Error('Expected Vite plugin hook to be defined');
  }
  if (typeof hook === 'function') {
    await hook(...args);
  } else {
    await hook.handler(...args);
  }
}
