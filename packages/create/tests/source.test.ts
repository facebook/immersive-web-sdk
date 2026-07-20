/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Recipe } from '@pmndrs/chef';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveSource,
  NpmSource,
  BundleSource,
  SDK_PACKAGES_DIR,
} from '../src/source.js';
import type { BundleManifest } from '../src/source.js';

describe('resolveSource', () => {
  it('returns NpmSource when no flag given', () => {
    const source = resolveSource();
    expect(source).toBeInstanceOf(NpmSource);
  });

  it('returns NpmSource when flag is undefined', () => {
    const source = resolveSource(undefined);
    expect(source).toBeInstanceOf(NpmSource);
  });

  it('returns NpmSource when flag is false', () => {
    const source = resolveSource(false);
    expect(source).toBeInstanceOf(NpmSource);
  });

  it('returns BundleSource with DEFAULT_BUNDLE_URL when flag is true (bare --canary)', () => {
    const source = resolveSource(true);
    expect(source).toBeInstanceOf(BundleSource);
  });

  it('returns BundleSource when an http URL is given', () => {
    const source = resolveSource('http://example.com/bundle');
    expect(source).toBeInstanceOf(BundleSource);
  });

  it('returns BundleSource when an https URL is given', () => {
    const source = resolveSource('https://example.com/bundle');
    expect(source).toBeInstanceOf(BundleSource);
  });

  it('throws when a local path is given', () => {
    expect(() => resolveSource('/some/local/path')).toThrow(
      'Bundle URL must be an HTTP or HTTPS URL',
    );
  });
});

describe('NpmSource', () => {
  const source = new NpmSource();

  it('isBundleMode is false', () => {
    expect(source.isBundleMode).toBe(false);
  });

  it('getPackageInstallSpec returns undefined', () => {
    expect(source.getPackageInstallSpec('@iwsdk/core')).toBeUndefined();
    expect(source.getPackageInstallSpec('anything')).toBeUndefined();
  });

  it('getPackageInstallSpecs returns an empty map', () => {
    expect(source.getPackageInstallSpecs()).toEqual({});
  });

  it('prepare() is a no-op', async () => {
    await expect(source.prepare()).resolves.toBeUndefined();
  });

  it('cleanup() is a no-op', async () => {
    await expect(source.cleanup()).resolves.toBeUndefined();
  });

  it('downloadPackages() is a no-op', async () => {
    await expect(source.downloadPackages('/tmp/fake')).resolves.toBeUndefined();
  });
});

describe('NpmSource.resolveRecipeUrls', () => {
  const source = new NpmSource();

  it('prepends jsDelivr CDN base to relative url edits', () => {
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/audio/chime.mp3': { url: 'assets/abc123-chime.mp3' },
        'src/index.ts': { lines: ['console.log("hello")'] },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect((resolved.edits!['public/audio/chime.mp3'] as any).url).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/.*\/assets\/abc123-chime\.mp3$/,
    );
  });

  it('leaves absolute URLs unchanged', () => {
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/model.glb': {
          url: 'https://other-cdn.example.com/model.glb',
        },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect((resolved.edits!['public/model.glb'] as any).url).toBe(
      'https://other-cdn.example.com/model.glb',
    );
  });

  it('passes through non-URL edits unchanged', () => {
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'src/index.ts': { lines: ['line1', 'line2'] },
        '@appName': 'my-app',
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect(resolved.edits!['src/index.ts']).toEqual({
      lines: ['line1', 'line2'],
    });
    expect(resolved.edits!['@appName']).toBe('my-app');
  });

  it('returns same recipe if no URL edits exist', () => {
    const recipe: Recipe = {
      name: 'test',
      edits: {
        '@appName': 'my-app',
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect(resolved).toBe(recipe); // same reference — no mutation needed
  });
});

describe('BundleSource', () => {
  const manifest: BundleManifest = {
    schemaVersion: 1,
    sdkVersion: '0.1.0',
    packages: {
      '@iwsdk/cli': 'packages/cli/iwsdk-cli.tgz',
      '@iwsdk/core': 'packages/core/iwsdk-core.tgz',
      '@iwsdk/starter-assets':
        'packages/starter-assets/iwsdk-starter-assets.tgz',
    },
  };

  const recipesIndex = [
    {
      id: 'vr-manual-ts',
      name: 'VR Manual (TS)',
      recipe: 'vr-manual-ts.recipe.json',
    },
  ];

  const recipeContent = {
    name: 'vr-manual-ts',
    edits: {
      'src/index.ts': { lines: ['console.log("hello")'] },
    },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(body: string, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  }

  function setupManifestFetch(m = manifest) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/bundle.json')) {
        return mockFetchResponse(JSON.stringify(m));
      }
      if (url.endsWith('/recipes/index.json')) {
        return mockFetchResponse(JSON.stringify(recipesIndex));
      }
      if (url.endsWith('.recipe.json')) {
        return mockFetchResponse(JSON.stringify(recipeContent));
      }
      return mockFetchResponse('Not Found', false, 404);
    });
  }

  it('throws on non-HTTP URL', () => {
    expect(() => new BundleSource('/local/path')).toThrow(
      'Bundle URL must be an HTTP or HTTPS URL',
    );
  });

  it('isBundleMode is true', () => {
    const source = new BundleSource('https://example.com/bundle');
    expect(source.isBundleMode).toBe(true);
  });

  it('prepare() fetches and validates bundle.json', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/bundle/bundle.json',
    );
  });

  it('prepare() throws on unsupported schemaVersion', async () => {
    setupManifestFetch({ ...manifest, schemaVersion: 99 });
    const source = new BundleSource('https://example.com/bundle');
    await expect(source.prepare()).rejects.toThrow(
      'Unsupported bundle schema version: 99',
    );
  });

  it('prepare() throws when fetch fails', async () => {
    fetchMock.mockResolvedValue(mockFetchResponse('', false, 500));
    const source = new BundleSource('https://example.com/bundle');
    await expect(source.prepare()).rejects.toThrow('HTTP 500');
  });

  it('fetchIndex() fetches recipes/index.json', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    const index = await source.fetchIndex();
    expect(index).toEqual(recipesIndex);
  });

  it('fetchRecipe() fetches recipe JSON', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    const recipe = await source.fetchRecipe('vr-manual-ts.recipe.json');
    expect(recipe).toEqual(recipeContent);
  });

  it('getPackageInstallSpec() returns file: path for known packages', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    expect(source.getPackageInstallSpec('@iwsdk/cli')).toBe(
      `file:${SDK_PACKAGES_DIR}/cli/iwsdk-cli.tgz`,
    );
    expect(source.getPackageInstallSpec('@iwsdk/core')).toBe(
      `file:${SDK_PACKAGES_DIR}/core/iwsdk-core.tgz`,
    );
    expect(source.getPackageInstallSpec('@iwsdk/starter-assets')).toBe(
      `file:${SDK_PACKAGES_DIR}/starter-assets/iwsdk-starter-assets.tgz`,
    );
  });

  it('getPackageInstallSpec() returns undefined for unknown packages', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    expect(source.getPackageInstallSpec('@iwsdk/unknown')).toBeUndefined();
    expect(source.getPackageInstallSpec('three')).toBeUndefined();
  });

  it('getPackageInstallSpecs() returns every package from the manifest', async () => {
    setupManifestFetch();
    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    expect(source.getPackageInstallSpecs()).toEqual({
      '@iwsdk/cli': `file:${SDK_PACKAGES_DIR}/cli/iwsdk-cli.tgz`,
      '@iwsdk/core': `file:${SDK_PACKAGES_DIR}/core/iwsdk-core.tgz`,
      '@iwsdk/starter-assets': `file:${SDK_PACKAGES_DIR}/starter-assets/iwsdk-starter-assets.tgz`,
    });
  });

  it('cleanup() is a no-op', async () => {
    const source = new BundleSource('https://example.com/bundle');
    await expect(source.cleanup()).resolves.toBeUndefined();
  });
});

describe('BundleSource.resolveRecipeUrls', () => {
  it('prepends bundle base URL to relative url edits', () => {
    const source = new BundleSource('https://my-cdn.example.com/sdk');
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/audio/chime.mp3': { url: 'assets/abc123-chime.mp3' },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect((resolved.edits!['public/audio/chime.mp3'] as any).url).toBe(
      'https://my-cdn.example.com/sdk/assets/abc123-chime.mp3',
    );
  });

  it('leaves absolute URLs unchanged', () => {
    const source = new BundleSource('https://my-cdn.example.com/sdk');
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/model.glb': {
          url: 'https://other-cdn.example.com/model.glb',
        },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect((resolved.edits!['public/model.glb'] as any).url).toBe(
      'https://other-cdn.example.com/model.glb',
    );
  });

  it('handles recipes with no edits', () => {
    const source = new BundleSource('https://my-cdn.example.com/sdk');
    const recipe: Recipe = { name: 'test' };
    const resolved = source.resolveRecipeUrls(recipe);
    expect(resolved).toBe(recipe); // same reference
  });

  it('does not mutate original recipe', () => {
    const source = new BundleSource('https://my-cdn.example.com/sdk');
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/audio/chime.mp3': { url: 'assets/abc123-chime.mp3' },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect(resolved).not.toBe(recipe);
    expect((recipe.edits!['public/audio/chime.mp3'] as any).url).toBe(
      'assets/abc123-chime.mp3',
    );
  });

  it('handles trailing slash in base URL', () => {
    const source = new BundleSource('https://my-cdn.example.com/sdk/');
    const recipe: Recipe = {
      name: 'test',
      edits: {
        'public/audio/chime.mp3': { url: 'assets/abc123-chime.mp3' },
      },
    };
    const resolved = source.resolveRecipeUrls(recipe);
    expect((resolved.edits!['public/audio/chime.mp3'] as any).url).toBe(
      'https://my-cdn.example.com/sdk/assets/abc123-chime.mp3',
    );
  });
});

describe('BundleSource.downloadPackages', () => {
  const manifest: BundleManifest = {
    schemaVersion: 1,
    sdkVersion: '0.1.0',
    packages: {
      '@iwsdk/core': 'packages/core/iwsdk-core.tgz',
      '@iwsdk/glxf': 'packages/glxf/iwsdk-glxf.tgz',
    },
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(
    body: string | ArrayBuffer,
    ok = true,
    status = 200,
  ) {
    return {
      ok,
      status,
      text: async () => (typeof body === 'string' ? body : ''),
      json: async () => (typeof body === 'string' ? JSON.parse(body) : {}),
      arrayBuffer: async () =>
        typeof body === 'string' ? new TextEncoder().encode(body).buffer : body,
    };
  }

  it('throws if prepare() was not called', async () => {
    const source = new BundleSource('https://example.com/bundle');
    await expect(source.downloadPackages('/tmp/dest')).rejects.toThrow(
      'prepare() must be called before downloadPackages()',
    );
  });

  it('downloads tgz files preserving subdirectory hierarchy', async () => {
    const fsp = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dl-test-'));

    const fakeTgzContent = new Uint8Array([1, 2, 3, 4]).buffer;

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/bundle.json')) {
        return mockFetchResponse(JSON.stringify(manifest));
      }
      if (url.endsWith('.tgz')) {
        return mockFetchResponse(fakeTgzContent);
      }
      return mockFetchResponse('Not Found', false, 404);
    });

    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    await source.downloadPackages(tmpDir);

    // Verify files were created in the correct subdirectories
    const fs = await import('fs');
    expect(fs.existsSync(path.join(tmpDir, 'core', 'iwsdk-core.tgz'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, 'glxf', 'iwsdk-glxf.tgz'))).toBe(
      true,
    );

    // Verify content
    const content = await fsp.readFile(
      path.join(tmpDir, 'core', 'iwsdk-core.tgz'),
    );
    expect(content).toEqual(Buffer.from(new Uint8Array([1, 2, 3, 4])));

    // Cleanup
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws on HTTP error during download', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/bundle.json')) {
        return mockFetchResponse(JSON.stringify(manifest));
      }
      return mockFetchResponse('Server Error', false, 500);
    });

    const fsp = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dl-test-'));

    const source = new BundleSource('https://example.com/bundle');
    await source.prepare();
    await expect(source.downloadPackages(tmpDir)).rejects.toThrow('HTTP 500');

    await fsp.rm(tmpDir, { recursive: true, force: true });
  });
});
