/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * End-to-end integration test for the reference warmup flow.
 *
 * Spins up a real HTTP server serving corpus and model files, then exercises
 * the full warmup → status → corruption detection → repair cycle using the
 * actual functions (not mocked fetch).
 */

import { createHash } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import http from 'http';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  REFERENCE_MODEL_ONNX_URL,
  getReferenceCacheStatus,
  getReferencePackageVersion,
  resolveReferenceAssets,
  warmupReferenceAssets,
} from '../src/assets.js';
import { REFERENCE_MODEL_FILE_SOURCES } from '../src/model-contract.js';
import type { ReferenceEmbeddingModelMetadata } from '../src/types.js';

const ASSETS_PACKAGE_NAME = '@iwsdk/reference-assets';
const MODEL_FILES: Record<string, string> = {
  'config.json': '{}\n',
  'tokenizer.json': '{"version":"1.0"}\n',
  'tokenizer_config.json': '{}\n',
  'onnx/model_quantized.onnx': 'fake-onnx-binary-content',
};

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function computeFileHashes(
  files: Record<string, string>,
): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const [relativePath, contents] of Object.entries(files)) {
    hashes[relativePath] = sha256(contents);
  }
  return hashes;
}

async function createTgz(
  tempDir: string,
  rootName: string,
  files: Record<string, string>,
): Promise<{ buffer: Buffer; sha256: string; size: number }> {
  const sourceRoot = path.join(tempDir, `${rootName}-source`);
  const archivePath = path.join(tempDir, `${rootName}.tgz`);
  const archiveRoot = path.join(sourceRoot, rootName);

  await rm(sourceRoot, { recursive: true, force: true });
  await mkdir(archiveRoot, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(archiveRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
  }

  await tar.c(
    {
      cwd: sourceRoot,
      file: archivePath,
      gzip: true,
      portable: true,
      noPax: true,
      mtime: new Date(0),
    },
    [rootName],
  );

  const buffer = await readFile(archivePath);
  return {
    buffer,
    sha256: sha256(buffer),
    size: buffer.length,
  };
}

let tempDir: string;
let workspaceRoot: string;
let sharedRoot: string;
let server: http.Server;
let baseUrl: string;
let testModel: ReferenceEmbeddingModelMetadata;
let dataArchive: { buffer: Buffer; sha256: string; size: number };

describe('e2e warmup integration', () => {
  beforeAll(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `iwsdk-e2e-warmup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tempDir, { recursive: true });

    const fileHashes = computeFileHashes(MODEL_FILES);
    const modelArchive = await createTgz(tempDir, 'model', MODEL_FILES);
    testModel = {
      source: 'archive',
      format: 'transformers-js',
      archiveSha256: modelArchive.sha256,
      archiveSize: modelArchive.size,
      fileHashes,
      dtype: 'q8',
      pooling: 'mean',
      normalize: true,
    };

    const packageVersion = getReferencePackageVersion();

    dataArchive = await createTgz(tempDir, 'data', {
      'embeddings.json': `${JSON.stringify(
        {
          version: packageVersion,
          model: testModel,
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'sources/.keep': '',
    });

    const manifest = JSON.stringify({
      schemaVersion: 3,
      referenceVersion: packageVersion,
      assetsPackage: {
        name: ASSETS_PACKAGE_NAME,
        version: packageVersion,
      },
      generatedAt: new Date().toISOString(),
      assets: {
        data: {
          file: 'data.tgz',
          sha256: dataArchive.sha256,
          size: dataArchive.size,
        },
      },
    });

    const modelFilesByPath = new Map<string, string>();
    for (const file of REFERENCE_MODEL_FILE_SOURCES) {
      const contents = MODEL_FILES[file.relativePath];
      if (contents) {
        const cdnPath = new URL(file.sourceUrl).pathname;
        modelFilesByPath.set(cdnPath, contents);
      }
    }

    server = http.createServer((req, res) => {
      const url = req.url ?? '';
      if (url === '/manifest.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(manifest);
        return;
      }
      if (url === '/data.tgz') {
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(dataArchive.size),
        });
        res.end(dataArchive.buffer);
        return;
      }

      const modelBody = modelFilesByPath.get(url);
      if (modelBody !== undefined) {
        res.writeHead(200, {
          'content-length': String(Buffer.byteLength(modelBody)),
        });
        res.end(modelBody);
        return;
      }

      res.writeHead(404);
      res.end('not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    workspaceRoot = path.join(tempDir, `workspace-${Date.now()}`);
    sharedRoot = path.join(tempDir, `shared-${Date.now()}`);
    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'package.json'),
      '{ "name": "e2e-test-app", "private": true }\n',
      'utf8',
    );
    process.env.IWSDK_REFERENCE_WORKSPACE_ROOT = workspaceRoot;
    process.env.IWSDK_REFERENCE_CACHE_DIR = sharedRoot;
    process.env.IWSDK_REFERENCE_ASSETS_BASE_URL = baseUrl;

    // Redirect CDN model-file URLs to the local test server so
    // warmup downloads real HTTP responses without hitting the internet.
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        for (const file of REFERENCE_MODEL_FILE_SOURCES) {
          if (url === file.sourceUrl) {
            const cdnPath = new URL(file.sourceUrl).pathname;
            return realFetch(`${baseUrl}${cdnPath}`, init);
          }
        }
        return realFetch(url, init);
      },
    );
  });

  afterEach(async () => {
    delete process.env.IWSDK_REFERENCE_CACHE_DIR;
    delete process.env.IWSDK_REFERENCE_WORKSPACE_ROOT;
    delete process.env.IWSDK_REFERENCE_ASSETS_BASE_URL;
    vi.unstubAllGlobals();
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(sharedRoot, { recursive: true, force: true });
  });

  it(
    'full warmup → status → corruption → repair cycle',
    { timeout: 30_000 },
    async () => {
      // 1. Initial status should be not_started
      const initialStatus = await getReferenceCacheStatus();
      expect(initialStatus.initState).toBe('not_started');
      expect(initialStatus.warmupRequired).toBe(true);

      // 2. Run warmup — this downloads from the real HTTP server
      const warmupStatus = await warmupReferenceAssets();
      expect(warmupStatus.initState).toBe('ready');
      expect(warmupStatus.warmupRequired).toBe(false);
      expect(warmupStatus.dataDir).toBeTruthy();
      expect(warmupStatus.modelDir).toBeTruthy();
      expect(warmupStatus.dataSha256).toBe(dataArchive.sha256);
      expect(warmupStatus.modelSha256).toBe(testModel.archiveSha256);

      // 3. Status should show ready
      const readyStatus = await getReferenceCacheStatus();
      expect(readyStatus.initState).toBe('ready');
      expect(readyStatus.warmupRequired).toBe(false);

      // 4. resolveReferenceAssets should succeed
      const resolved = await resolveReferenceAssets();
      expect(resolved.dataDir).toBe(warmupStatus.dataDir);
      expect(resolved.modelDir).toBe(warmupStatus.modelDir);
      expect(resolved.model.fileHashes).toEqual(testModel.fileHashes);

      // 5. Verify actual model files exist and have correct content
      const configContent = await readFile(
        path.join(resolved.modelDir, 'config.json'),
        'utf8',
      );
      expect(configContent).toBe(MODEL_FILES['config.json']);
      const tokenizerContent = await readFile(
        path.join(resolved.modelDir, 'tokenizer.json'),
        'utf8',
      );
      expect(tokenizerContent).toBe(MODEL_FILES['tokenizer.json']);

      // 6. Corrupt a model file
      await writeFile(
        path.join(resolved.modelDir, 'config.json'),
        '{"corrupted": true}\n',
        'utf8',
      );

      // 7. Status should now detect corruption via per-file hash mismatch
      const corruptedStatus = await getReferenceCacheStatus();
      expect(corruptedStatus.initState).toBe('failed');
      expect(corruptedStatus.warmupRequired).toBe(true);
      expect(corruptedStatus.error?.message).toContain('corrupted');

      // 8. resolveReferenceAssets should fail
      await expect(resolveReferenceAssets()).rejects.toThrow();

      // 9. Re-run warmup to repair
      const repairedStatus = await warmupReferenceAssets();
      expect(repairedStatus.initState).toBe('ready');
      expect(repairedStatus.warmupRequired).toBe(false);

      // 10. Verify the file was actually repaired
      const repairedConfig = await readFile(
        path.join(repairedStatus.modelDir!, 'config.json'),
        'utf8',
      );
      expect(repairedConfig).toBe(MODEL_FILES['config.json']);

      // 11. Status should be ready again
      const finalStatus = await getReferenceCacheStatus();
      expect(finalStatus.initState).toBe('ready');
      expect(finalStatus.warmupRequired).toBe(false);
    },
  );

  it(
    'second warmup short-circuits when cache is already valid',
    { timeout: 30_000 },
    async () => {
      const firstWarmup = await warmupReferenceAssets();
      expect(firstWarmup.initState).toBe('ready');

      const secondWarmup = await warmupReferenceAssets();
      expect(secondWarmup.initState).toBe('ready');
      expect(secondWarmup.modelDir).toBe(firstWarmup.modelDir);
      expect(secondWarmup.dataDir).toBe(firstWarmup.dataDir);
    },
  );

  it(
    'handles old corpus format without fileHashes gracefully',
    { timeout: 15_000 },
    async () => {
      const packageVersion = getReferencePackageVersion();
      const oldModel: ReferenceEmbeddingModelMetadata = {
        source: 'archive',
        format: 'transformers-js',
        archiveSha256: testModel.archiveSha256,
        archiveSize: testModel.archiveSize,
        dtype: 'q8',
        pooling: 'mean',
        normalize: true,
      };

      const oldDataArchive = await createTgz(tempDir, 'data-old', {
        'embeddings.json': `${JSON.stringify(
          {
            version: packageVersion,
            model: oldModel,
            dimensions: 768,
            iwsdk: [],
            deps: [],
          },
          null,
          2,
        )}\n`,
        'sources/.keep': '',
      });

      const modelDir = path.join(
        sharedRoot,
        'models',
        oldModel.archiveSha256,
        'model',
      );
      await mkdir(path.join(modelDir, 'onnx'), { recursive: true });
      for (const [relativePath, contents] of Object.entries(MODEL_FILES)) {
        const absolutePath = path.join(modelDir, relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
      }

      const dataDir = path.join(
        sharedRoot,
        'corpora',
        oldDataArchive.sha256,
        'data',
      );
      await mkdir(path.join(dataDir, 'sources'), { recursive: true });
      await writeFile(
        path.join(dataDir, 'embeddings.json'),
        `${JSON.stringify(
          {
            version: packageVersion,
            model: oldModel,
            dimensions: 768,
            iwsdk: [],
            deps: [],
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const statePath = path.join(
        workspaceRoot,
        '.iwsdk',
        'reference',
        'state.json',
      );
      await mkdir(path.dirname(statePath), { recursive: true });
      await writeFile(
        statePath,
        `${JSON.stringify(
          {
            schemaVersion: 4,
            packageVersion,
            assetsPackage: {
              name: ASSETS_PACKAGE_NAME,
              version: packageVersion,
            },
            status: 'ready',
            pid: null,
            manifestUrl: `${baseUrl}/manifest.json`,
            dataDir,
            dataSha256: oldDataArchive.sha256,
            modelDir,
            modelSha256: oldModel.archiveSha256,
            modelUrl: REFERENCE_MODEL_ONNX_URL,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            error: null,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      // Old format without fileHashes should still validate (falls back to
      // file-existence checks only, no archive re-compression)
      const status = await getReferenceCacheStatus();
      expect(status.initState).toBe('ready');
      expect(status.warmupRequired).toBe(false);

      const resolved = await resolveReferenceAssets();
      expect(resolved.dataDir).toBe(dataDir);
      expect(resolved.modelDir).toBe(modelDir);
      expect(resolved.model.fileHashes).toBeUndefined();
    },
  );
});
