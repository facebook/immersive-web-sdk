/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BundleSource,
  DEFAULT_BUNDLE_URL,
  NpmSource,
  SDK_PACKAGES_DIR,
  resolveSource,
  type BundleManifest,
} from '../src/source.js';
import { VERSION } from '../src/version.js';

describe('resolveSource', () => {
  it('uses npm package resolution by default', () => {
    expect(resolveSource()).toBeInstanceOf(NpmSource);
    expect(resolveSource(false)).toBeInstanceOf(NpmSource);
  });

  it('uses the default or explicit remote canary bundle', () => {
    expect(resolveSource(true)).toBeInstanceOf(BundleSource);
    expect(resolveSource('https://example.com/bundle')).toBeInstanceOf(
      BundleSource,
    );
    expect(DEFAULT_BUNDLE_URL).toMatch(/^https:/u);
  });

  it('rejects local canary paths', () => {
    expect(() => resolveSource('/tmp/bundle')).toThrow(
      'Bundle URL must be an HTTP or HTTPS URL',
    );
  });
});

describe('NpmSource', () => {
  const source = new NpmSource();

  it('has no remote starter setup or local package overrides', async () => {
    expect(source.isBundleMode).toBe(false);
    expect(source.getPackageInstallSpec('@iwsdk/core')).toBeUndefined();
    expect(source.getPackageInstallSpecs()).toEqual({});
    await expect(source.prepare()).resolves.toBeUndefined();
    await expect(
      source.downloadPackages('/tmp/unused'),
    ).resolves.toBeUndefined();
    await expect(source.cleanup()).resolves.toBeUndefined();
  });
});

describe('BundleSource', () => {
  const manifest: BundleManifest = {
    schemaVersion: 1,
    sdkVersion: VERSION,
    packages: {
      '@iwsdk/cli': 'packages/cli/iwsdk-cli.tgz',
      '@iwsdk/core': 'packages/core/iwsdk-core.tgz',
    },
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/bundle.json')) {
        return response(JSON.stringify(manifest));
      }
      if (url.endsWith('.tgz')) {
        return response(new Uint8Array([1, 2, 3]));
      }
      return response('not found', false, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('validates version and exposes package-local install specs', async () => {
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();

    expect(source.getPackageInstallSpec('@iwsdk/core')).toBe(
      `file:${SDK_PACKAGES_DIR}/core/iwsdk-core.tgz`,
    );
    expect(source.getPackageInstallSpecs()).toEqual({
      '@iwsdk/cli': `file:${SDK_PACKAGES_DIR}/cli/iwsdk-cli.tgz`,
      '@iwsdk/core': `file:${SDK_PACKAGES_DIR}/core/iwsdk-core.tgz`,
    });
    expect(source.getPackageInstallSpec('@iwsdk/unknown')).toBeUndefined();
  });

  it('rejects mismatched SDK versions before scaffolding', async () => {
    fetchMock.mockResolvedValueOnce(
      response(JSON.stringify({ ...manifest, sdkVersion: '9.9.9' })),
    );
    const source = new BundleSource('https://example.com/bundle');

    await expect(source.prepare()).rejects.toThrow(
      'does not match @iwsdk/create',
    );
  });

  it('rejects unsupported schemas and unsafe package paths', async () => {
    fetchMock.mockResolvedValueOnce(
      response(JSON.stringify({ ...manifest, schemaVersion: 99 })),
    );
    await expect(
      new BundleSource('https://example.com/bundle').prepare(),
    ).rejects.toThrow('Unsupported bundle schema version: 99');

    fetchMock.mockResolvedValueOnce(
      response(
        JSON.stringify({
          ...manifest,
          packages: { '@iwsdk/core': 'packages/../../outside.tgz' },
        }),
      ),
    );
    await expect(
      new BundleSource('https://example.com/bundle').prepare(),
    ).rejects.toThrow('Invalid bundle package path');
  });

  it('downloads package bytes under the confined bundle layout', async () => {
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    const destination = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-bundle-source-'),
    );
    try {
      await source.downloadPackages(destination);
      await expect(
        readFile(path.join(destination, 'core', 'iwsdk-core.tgz')),
      ).resolves.toEqual(Buffer.from([1, 2, 3]));
      await expect(
        readFile(path.join(destination, 'cli', 'iwsdk-cli.tgz')),
      ).resolves.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });
});

function response(
  body: string | Uint8Array,
  ok = true,
  status = 200,
): Response {
  return new Response(body, { status: ok ? status : status });
}
