/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackedExampleAssetFixture } from './example-asset-package-fixture.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_PATH = path.join(
  REPO_ROOT,
  'packages',
  'example-assets',
  'src',
  'catalog.json',
);
const PACKAGE_PATH = path.join(
  REPO_ROOT,
  'packages',
  'example-assets',
  'package.json',
);
const DEFAULT_TIMEOUT_MS = 60_000;
const TEST_ORIGIN = 'http://127.0.0.1';

await main();

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const packageManifest = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
  options.version ??= packageManifest.version;
  let packedFixture;
  let localAssetServer;
  try {
    if (options.localPackage) {
      packedFixture = await createPackedExampleAssetFixture();
      localAssetServer = await startLocalAssetServer(
        catalog,
        packedFixture.assetRoot,
      );
    } else {
      assertPublicationEvidence(catalog);
    }

    const baseUrl = normalizeBaseUrl(
      localAssetServer?.baseUrl ??
        options.baseUrl ??
        `https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@${options.version}/assets/`,
    );
    const fileResults = [];
    const responseBytes = new Map();

    for (const asset of catalog) {
      for (const file of asset.files) {
        const url = new URL(`${asset.id}/${file.path}`, baseUrl).href;
        const response = await fetchWithTimeout(url, {
          headers: { Origin: TEST_ORIGIN },
          timeoutMs: options.timeoutMs,
        });
        if (!response.ok) {
          throw new Error(
            `CDN request failed for ${asset.id}/${file.path}: ${response.status} ${response.statusText} (${url})`,
          );
        }
        assertCors(response, url);
        assertMimeType(response, file.mimeType, url);
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (bytes.byteLength !== file.bytes) {
          throw new Error(
            `CDN byte-size mismatch for ${url}: expected ${file.bytes}, received ${bytes.byteLength}`,
          );
        }
        if (sha256 !== file.sha256) {
          throw new Error(
            `CDN SHA-256 mismatch for ${url}: expected ${file.sha256}, received ${sha256}`,
          );
        }
        responseBytes.set(`${asset.id}/${file.path}`, bytes);
        fileResults.push({
          assetId: asset.id,
          bytes: bytes.byteLength,
          mimeType: normalizeMimeType(response.headers.get('content-type')),
          path: file.path,
          sha256,
          url,
        });
      }
      assertGltfReferences(asset, responseBytes);
    }

    const browserResults = options.skipBrowser
      ? []
      : await verifyColdBrowserLoads(catalog, baseUrl, options.timeoutMs);
    const report = {
      baseUrl,
      browser: browserResults,
      checkedAt: new Date().toISOString(),
      files: fileResults,
      package: '@iwsdk/example-assets',
      version: options.version,
    };

    if (options.reportPath != null) {
      const reportPath = path.resolve(options.reportPath);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(
        reportPath,
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8',
      );
    }

    console.log(
      `Example-assets CDN release check passed: ${catalog.length} models, ${fileResults.length} files, ${browserResults.length} cold browser loads (${baseUrl})`,
    );
  } finally {
    await localAssetServer?.close();
    await packedFixture?.close();
  }
}

function parseArguments(args) {
  let baseUrl;
  let localPackage = false;
  let reportPath;
  let skipBrowser = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let version;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '--skip-browser') {
      skipBrowser = true;
      continue;
    }
    if (argument === '--local-package') {
      localPackage = true;
      continue;
    }
    const value = args[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    index++;
    if (argument === '--base-url') {
      baseUrl = value;
    } else if (argument === '--report') {
      reportPath = value;
    } else if (argument === '--timeout') {
      timeoutMs = Number(value);
    } else if (argument === '--version') {
      version = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (version == null && !localPackage) {
    throw new Error('--version is required');
  }
  if (
    version != null &&
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
  ) {
    throw new Error(
      `--version must be one exact semver without a range or tag; received ${JSON.stringify(version)}`,
    );
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('--timeout must be a positive integer');
  }
  if (localPackage && baseUrl != null) {
    throw new Error('--local-package cannot be combined with --base-url');
  }
  return {
    baseUrl,
    localPackage,
    reportPath,
    skipBrowser,
    timeoutMs,
    version,
  };
}

function assertPublicationEvidence(catalogEntries) {
  const missing = [];
  for (const asset of catalogEntries) {
    if (asset.origin?.status !== 'verified') {
      missing.push(`${asset.id}: original source is not verified`);
    }
    if (asset.license?.status !== 'verified') {
      missing.push(`${asset.id}: redistribution license is not verified`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Refusing public CDN verification before the publication evidence gate passes:\n${missing.join('\n')}`,
    );
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('--base-url must use http or https');
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: 'no-store',
      headers,
      redirect: 'error',
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`CDN request failed for ${url}: ${errorMessage(error)}`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

function assertCors(response, url) {
  const value = response.headers.get('access-control-allow-origin');
  if (value !== '*' && value !== TEST_ORIGIN) {
    throw new Error(
      `CDN CORS header for ${url} must allow browser loading; received ${JSON.stringify(value)}`,
    );
  }
}

function assertMimeType(response, expected, url) {
  const actual = normalizeMimeType(response.headers.get('content-type'));
  if (actual !== expected) {
    throw new Error(
      `CDN MIME mismatch for ${url}: expected ${expected}, received ${actual ?? 'no content-type'}`,
    );
  }
}

function normalizeMimeType(value) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || undefined;
}

function assertGltfReferences(asset, bytesByPath) {
  if (asset.type !== 'gltf') {
    return;
  }
  const key = `${asset.id}/${asset.entryFile}`;
  const entry = bytesByPath.get(key);
  if (entry == null) {
    throw new Error(`Missing downloaded glTF entry bytes for ${key}`);
  }
  const document = JSON.parse(entry.toString('utf8'));
  const references = [
    ...(document.buffers ?? []).map((buffer) => buffer.uri),
    ...(document.images ?? []).map((image) => image.uri),
  ].filter(
    (uri) =>
      typeof uri === 'string' &&
      !uri.startsWith('data:') &&
      !uri.startsWith('blob:'),
  );
  const declared = new Set(asset.files.map((file) => file.path));
  for (const uri of references) {
    const decoded = decodeURIComponent(uri);
    if (
      decoded.startsWith('/') ||
      decoded.includes('\\') ||
      decoded.split('/').some((segment) => segment === '..')
    ) {
      throw new Error(
        `glTF ${asset.id}/${asset.entryFile} contains an escaping resource URI: ${uri}`,
      );
    }
    if (!declared.has(decoded)) {
      throw new Error(
        `glTF ${asset.id}/${asset.entryFile} references undeclared resource ${uri}`,
      );
    }
    if (!bytesByPath.has(`${asset.id}/${decoded}`)) {
      throw new Error(
        `glTF ${asset.id}/${asset.entryFile} dependency was not downloaded: ${uri}`,
      );
    }
  }
}

async function verifyColdBrowserLoads(catalogEntries, baseUrl, timeoutMs) {
  const threePackageRoot = await resolveThreePackageRoot();
  const server = await startBrowserHarnessServer(threePackageRoot);
  const requireFromPlugin = createRequire(
    path.join(REPO_ROOT, 'packages', 'vite-plugin-dev', 'package.json'),
  );
  const { chromium } = requireFromPlugin('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        pageErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(server.origin, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const entries = catalogEntries.map((asset) => ({
      assetId: asset.id,
      url: new URL(`${asset.id}/${asset.entryFile}`, baseUrl).href,
    }));
    const results = await page.evaluate(
      async ({ entries: browserEntries, timeout }) => {
        const { GLTFLoader } = await import(
          '/three/examples/jsm/loaders/GLTFLoader.js'
        );
        const loader = new GLTFLoader();
        const output = [];
        for (const entry of browserEntries) {
          const timer = new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timed out loading ${entry.url}`)),
              timeout,
            ),
          );
          const gltf = await Promise.race([loader.loadAsync(entry.url), timer]);
          let meshCount = 0;
          gltf.scene.traverse((object) => {
            if (object.isMesh) {
              meshCount++;
            }
          });
          if (meshCount === 0) {
            throw new Error(`${entry.assetId} loaded without any meshes`);
          }
          output.push({ assetId: entry.assetId, meshCount, url: entry.url });
        }
        return output;
      },
      { entries, timeout: timeoutMs },
    );
    if (pageErrors.length > 0) {
      throw new Error(
        `Cold browser model load logged errors:\n${pageErrors.join('\n')}`,
      );
    }
    return results;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function resolveThreePackageRoot() {
  const requireFromCore = createRequire(
    path.join(REPO_ROOT, 'packages', 'core', 'package.json'),
  );
  const entrypoint = requireFromCore.resolve('three');
  return realpath(path.resolve(path.dirname(entrypoint), '..'));
}

async function startBrowserHarnessServer(threePackageRoot) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html>
<html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script></head><body></body></html>`);
      return;
    }
    if (!requestUrl.pathname.startsWith('/three/')) {
      response.writeHead(404).end();
      return;
    }
    const relativePath = decodeURIComponent(
      requestUrl.pathname.slice('/three/'.length),
    );
    const filePath = path.resolve(threePackageRoot, relativePath);
    if (
      filePath === threePackageRoot ||
      !filePath.startsWith(`${threePackageRoot}${path.sep}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        'Content-Type',
        filePath.endsWith('.js')
          ? 'text/javascript'
          : 'application/octet-stream',
      );
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    origin,
  };
}

async function startLocalAssetServer(catalogEntries, assetRoot) {
  const mimeTypes = new Map(
    catalogEntries.flatMap((asset) =>
      asset.files.map((file) => [
        `/assets/${asset.id}/${file.path}`,
        file.mimeType,
      ]),
    ),
  );
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const mimeType = mimeTypes.get(requestUrl.pathname);
    if (mimeType == null) {
      response.writeHead(404).end();
      return;
    }
    const relativePath = decodeURIComponent(
      requestUrl.pathname.slice('/assets/'.length),
    );
    const filePath = path.resolve(assetRoot, relativePath);
    if (
      filePath === assetRoot ||
      !filePath.startsWith(`${assetRoot}${path.sep}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Content-Type', mimeType);
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  server.unref();
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/assets/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
