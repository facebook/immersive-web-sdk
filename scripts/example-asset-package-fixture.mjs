/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_ROOT, '..');
const DEFAULT_PACKAGE_ROOT = path.join(REPO_ROOT, 'packages', 'example-assets');
const DEFAULT_ROUTE_ORIGIN = 'https://iwsdk-example-assets.invalid';

/**
 * Pack and extract @iwsdk/example-assets, then expose its exact asset payload
 * through a Playwright route. The fixture never serves source-tree bytes.
 */
export async function createPackedExampleAssetFixture({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  routeOrigin = DEFAULT_ROUTE_ORIGIN,
} = {}) {
  const resolvedPackageRoot = await realpath(packageRoot);
  const packageManifest = JSON.parse(
    await readFile(path.join(resolvedPackageRoot, 'package.json'), 'utf8'),
  );
  const catalog = JSON.parse(
    await readFile(
      path.join(resolvedPackageRoot, 'src', 'catalog.json'),
      'utf8',
    ),
  );
  assertExactVersion(packageManifest.version);

  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'iwsdk-example-assets-pack-'),
  );
  try {
    const { stdout } = await execFileAsync(
      'npm',
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        temporaryRoot,
      ],
      {
        cwd: resolvedPackageRoot,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const packResults = JSON.parse(stdout);
    const packedFileName = packResults?.[0]?.filename;
    if (
      typeof packedFileName !== 'string' ||
      path.basename(packedFileName) !== packedFileName ||
      !packedFileName.endsWith('.tgz')
    ) {
      throw new Error(
        `npm pack returned an invalid example-assets filename: ${JSON.stringify(packedFileName)}`,
      );
    }

    const extractRoot = path.join(temporaryRoot, 'extracted');
    await mkdir(extractRoot);
    await execFileAsync('tar', [
      '-xzf',
      path.join(temporaryRoot, packedFileName),
      '-C',
      extractRoot,
    ]);
    const packedPackageRoot = await realpath(path.join(extractRoot, 'package'));
    await assertPackageReleaseFiles(packedPackageRoot);
    const assetRoot = await realpath(path.join(packedPackageRoot, 'assets'));
    const fileMap = await buildPackedFileMap(catalog, assetRoot);
    const baseUrl = normalizeBaseUrl(
      `${routeOrigin}/npm/@iwsdk/example-assets@${packageManifest.version}/assets/`,
    );

    return {
      assetRoot,
      baseUrl,
      catalog,
      close: () => rm(temporaryRoot, { force: true, recursive: true }),
      fileMap,
      packageRoot: packedPackageRoot,
      version: packageManifest.version,
      /** Install one exact-base route and return its immutable request log. */
      async installRoute(page, options = {}) {
        const routeBaseUrl = normalizeBaseUrl(options.baseUrl ?? baseUrl);
        const allowedAssetIds =
          options.assetIds == null ? null : new Set(options.assetIds);
        const requests = [];
        const matcher = (url) => url.href.startsWith(routeBaseUrl);
        const handler = async (route) => {
          const requestUrl = route.request().url();
          const relativePath = relativeAssetRequestPath(
            requestUrl,
            routeBaseUrl,
          );
          const file =
            relativePath == null ? undefined : fileMap.get(relativePath);
          const assetId = relativePath?.split('/', 1)[0];
          requests.push({
            assetId: assetId ?? null,
            path: relativePath ?? null,
            url: requestUrl,
          });
          if (
            file == null ||
            (allowedAssetIds != null && !allowedAssetIds.has(file.assetId))
          ) {
            await route.fulfill({
              body: 'Unknown @iwsdk/example-assets package path',
              contentType: 'text/plain; charset=utf-8',
              status: 404,
            });
            return;
          }
          await route.fulfill({
            body: await readFile(file.absolutePath),
            contentType: file.mimeType,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=31536000, immutable',
              ETag: `"${file.sha256}"`,
            },
            status: 200,
          });
        };
        await page.route(matcher, handler);
        return {
          baseUrl: routeBaseUrl,
          requests,
          uninstall: () => page.unroute(matcher, handler),
        };
      },
    };
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
}

async function assertPackageReleaseFiles(packageRoot) {
  const [license, provenance, readme] = await Promise.all([
    readFile(path.join(packageRoot, 'LICENSE'), 'utf8'),
    readFile(path.join(packageRoot, 'PROVENANCE.md'), 'utf8'),
    readFile(path.join(packageRoot, 'README.md'), 'utf8'),
  ]);
  if (!license.includes('MIT License')) {
    throw new Error('Packed example-assets LICENSE is not the MIT license');
  }
  if (!provenance.includes('first-party IWSDK assets')) {
    throw new Error(
      'Packed example-assets provenance does not record first-party ownership',
    );
  }
  if (!readme.includes('@iwsdk/example-assets')) {
    throw new Error('Packed example-assets README is missing its package name');
  }
}

async function buildPackedFileMap(catalog, assetRoot) {
  const files = new Map();
  for (const asset of catalog) {
    for (const file of asset.files) {
      const relativePath = `${asset.id}/${file.path}`;
      const absolutePath = path.resolve(assetRoot, relativePath);
      assertPathInside(assetRoot, absolutePath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        throw new Error(`Packed example asset is not a file: ${relativePath}`);
      }
      const contents = await readFile(absolutePath);
      const sha256 = createHash('sha256').update(contents).digest('hex');
      if (contents.byteLength !== file.bytes || sha256 !== file.sha256) {
        throw new Error(
          `Packed example asset differs from its catalog: ${relativePath}`,
        );
      }
      files.set(relativePath, {
        absolutePath,
        assetId: asset.id,
        bytes: file.bytes,
        mimeType: file.mimeType,
        sha256,
      });
    }
  }
  return files;
}

function relativeAssetRequestPath(requestUrl, baseUrl) {
  if (!requestUrl.startsWith(baseUrl)) {
    return undefined;
  }
  let relativePath;
  try {
    relativePath = decodeURIComponent(requestUrl.slice(baseUrl.length));
  } catch {
    return undefined;
  }
  if (
    relativePath.length === 0 ||
    relativePath.includes('\\') ||
    relativePath.includes('?') ||
    relativePath.includes('#') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath
      .split('/')
      .some((segment) => segment === '' || segment === '..')
  ) {
    return undefined;
  }
  return relativePath;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Example asset route base URL must use HTTP or HTTPS');
  }
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

function assertExactVersion(version) {
  if (
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
  ) {
    throw new Error(
      `@iwsdk/example-assets must have one exact semver; received ${JSON.stringify(version)}`,
    );
  }
}

function assertPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Packed example asset path escapes its root: ${candidate}`);
  }
}
