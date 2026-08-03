/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { EXAMPLE_ASSET_PACK_MANIFEST } from '../src/index.js';

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

interface NpmPackResult {
  files: Array<{ path: string; size: number }>;
}

describe('@iwsdk/example-assets package contract', () => {
  test('blocks publication unless the catalog passes the evidence gate', async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.prepublishOnly).toContain('verify:publishable');
    expect(packageJson.scripts?.['verify:publishable']).toContain(
      'assertExampleAssetCatalogPublishable',
    );
  });

  test('is independently versioned from the SDK fixed release group', async () => {
    const changesetConfig = JSON.parse(
      await readFile(
        path.join(PACKAGE_ROOT, '..', '..', '.changeset', 'config.json'),
        'utf8',
      ),
    ) as { fixed?: string[][] };

    expect(changesetConfig.fixed?.flat()).not.toContain(
      '@iwsdk/example-assets',
    );
    expect(changesetConfig.fixed?.flat()).not.toContain('@iwsdk/*');
  });

  test('packs exactly the declared asset layout and byte sizes', async () => {
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      {
        cwd: PACKAGE_ROOT,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const [packResult] = JSON.parse(stdout) as NpmPackResult[];
    expect(packResult.files.map((file) => file.path)).toContain(
      'PROVENANCE.md',
    );
    const packedAssets = packResult.files
      .filter((file) => file.path.startsWith('assets/'))
      .map((file) => ({ bytes: file.size, path: file.path }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const expectedAssets = EXAMPLE_ASSET_PACK_MANIFEST.map((file) => ({
      bytes: file.bytes,
      path: file.path,
    })).sort((left, right) => left.path.localeCompare(right.path));

    expect(packedAssets).toEqual(expectedAssets);
    for (const file of EXAMPLE_ASSET_PACK_MANIFEST) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(file.mimeType).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/u);
    }
  }, 15_000);
});
