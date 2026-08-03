/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { EXAMPLE_ASSET_CATALOG, copyExampleAssets } from '../src/index.js';

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

describe('@iwsdk/example-assets clean output E2E', () => {
  test('copies and serves requested catalog assets from the stable public path', async () => {
    const outputDir = await makeTempDir();
    const assetIds = EXAMPLE_ASSET_CATALOG.map((asset) => asset.id);
    const copiedFiles = await copyExampleAssets({
      assetIds,
      outDir: outputDir,
    });
    const server = await startStaticServer(outputDir);

    try {
      expect(new Set(copiedFiles.map((file) => file.assetId))).toEqual(
        new Set(['environment-desk', 'robot', 'plant-sansevieria']),
      );
      await expect(
        stat(path.join(outputDir, 'public', 'gltf')),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });

      for (const asset of EXAMPLE_ASSET_CATALOG) {
        const entryResponse = await fetch(
          `${server.origin}${asset.publicPath}`,
        );
        expect(entryResponse.status).toBe(200);
        expect(entryResponse.headers.get('content-type')).toBe(
          asset.files.find((file) => file.path === asset.entryFile)?.mimeType,
        );
        await expect(hashResponse(entryResponse)).resolves.toBe(
          asset.files.find((file) => file.path === asset.entryFile)?.sha256,
        );

        for (const file of asset.files) {
          const response = await fetch(
            `${server.origin}/iwsdk-assets/${asset.id}/${file.path}`,
          );
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toBe(file.mimeType);
          await expect(hashResponse(response)).resolves.toBe(file.sha256);
        }
      }

      const legacyFallbackResponse = await fetch(
        `${server.origin}/gltf/environmentDesk/environmentDesk.gltf`,
      );
      expect(legacyFallbackResponse.status).toBe(404);
    } finally {
      await server.close();
    }
  }, 20000);
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'iwsdk-example-assets-e2e-'),
  );
  tempDirs.push(tempDir);
  return tempDir;
}

async function hashResponse(response: Response): Promise<string> {
  return createHash('sha256')
    .update(Buffer.from(await response.arrayBuffer()))
    .digest('hex');
}

async function startStaticServer(rootDir: string): Promise<{
  close: () => Promise<void>;
  origin: string;
}> {
  const root = path.resolve(rootDir);
  const mimeTypes = new Map(
    EXAMPLE_ASSET_CATALOG.flatMap((asset) =>
      asset.files.map(
        (file) =>
          [`iwsdk-assets/${asset.id}/${file.path}`, file.mimeType] as const,
      ),
    ),
  );
  const server: Server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(
      /^\/+/,
      '',
    );
    const filePath = path.resolve(root, relativePath);

    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    try {
      const body = await readFile(filePath);
      const mimeType = mimeTypes.get(relativePath);
      if (mimeType != null) {
        response.setHeader('Content-Type', mimeType);
      }
      response.writeHead(200).end(body);
    } catch {
      if (!response.headersSent && !response.destroyed) {
        response.writeHead(404).end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
    origin: `http://127.0.0.1:${address.port}`,
  };
}
