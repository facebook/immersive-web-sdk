/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  EXAMPLE_ASSET_CATALOG,
  copyExampleAssets,
  getExampleAssetPublicPath,
  validateExampleAssetCatalog,
} from '../src/index.js';

describe('@iwsdk/example-assets catalog', () => {
  test('has unique ids and stable public paths for the duplicate starter assets', () => {
    const ids = EXAMPLE_ASSET_CATALOG.map((asset) => asset.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['environment-desk', 'robot', 'plant-sansevieria']);
    expect(getExampleAssetPublicPath('environment-desk')).toBe(
      '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    );
  });

  test('provides bounds metadata for placement helpers', () => {
    for (const asset of EXAMPLE_ASSET_CATALOG) {
      expect(asset.bounds, `${asset.id} is missing bounds`).toBeDefined();
      const bounds = asset.bounds;
      if (bounds == null) {
        throw new Error(`${asset.id} is missing bounds`);
      }

      expect(bounds.min).toHaveLength(3);
      expect(bounds.max).toHaveLength(3);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Number.isFinite(bounds.min[axis])).toBe(true);
        expect(Number.isFinite(bounds.max[axis])).toBe(true);
        expect(bounds.min[axis]).toBeLessThanOrEqual(bounds.max[axis]);
      }
    }

    expect(
      EXAMPLE_ASSET_CATALOG.find((asset) => asset.id === 'plant-sansevieria')
        ?.bounds,
    ).toEqual({
      max: [0.14463400840759277, 0.4789590835571289, 0.13743270933628082],
      min: [-0.14591170847415924, -0.0010799765586853027, -0.18947772681713104],
    });
  });

  test('points every catalog file at an existing file with a matching hash', async () => {
    await expect(validateExampleAssetCatalog()).resolves.toEqual({
      issues: [],
      valid: true,
    });
  });

  test('copies only requested assets to the stable public asset root', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-assets-test-'));

    try {
      const copied = await copyExampleAssets({
        assetIds: ['robot'],
        outDir: tempDir,
      });

      expect(
        copied.map((file) => path.relative(tempDir, file.outputPath)),
      ).toEqual([
        'iwsdk-assets/robot/288d754a3fb5199c07278aa1e889259c.png',
        'iwsdk-assets/robot/82f7622c553a011ccb45883b167253b8.png',
        'iwsdk-assets/robot/86677bb00f5b899e5b8123e68b1e4d7b.png',
        'iwsdk-assets/robot/c6378ca88952228817e344695bd6ec8c.png',
        'iwsdk-assets/robot/cf3bcdd483ef6bf07dc1fba58d988ef6.png',
        'iwsdk-assets/robot/robot.gltf',
      ]);
      await expect(
        readFile(
          path.join(tempDir, 'iwsdk-assets', 'robot', 'robot.gltf'),
          'utf8',
        ),
      ).resolves.toContain('"asset"');
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test('rejects unknown asset ids before copying', async () => {
    await expect(
      copyExampleAssets({
        assetIds: ['missing-asset'],
        outDir: os.tmpdir(),
      }),
    ).rejects.toThrow('Unknown IWSDK example asset "missing-asset"');
  });
});
