/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  EXAMPLE_ASSET_CATALOG,
  EXAMPLE_ASSET_PACK_MANIFEST,
  assertExampleAssetCatalogPublishable,
  copyExampleAssets,
  getExampleAssetPublicPath,
  validateExampleAssetCatalog,
  validateExampleAssetPublication,
} from '../src/index.js';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

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

  test('validates file integrity and first-party publication evidence', async () => {
    await expect(validateExampleAssetCatalog()).resolves.toEqual({
      issues: [],
      valid: true,
    });
    await expect(validateExampleAssetPublication()).resolves.toEqual({
      issues: [],
      valid: true,
    });
    await expect(assertExampleAssetCatalogPublishable()).resolves.toBe(
      undefined,
    );

    for (const asset of EXAMPLE_ASSET_CATALOG) {
      expect(asset.origin).toMatchObject({
        author: 'Meta Platforms, Inc. and affiliates',
        status: 'verified',
      });
      expect(asset.license).toMatchObject({
        attribution: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
        spdx: 'MIT',
        status: 'verified',
      });
    }
  });

  test('publishes an immutable pack manifest with byte, hash, and MIME expectations', () => {
    expect(Object.isFrozen(EXAMPLE_ASSET_PACK_MANIFEST)).toBe(true);
    expect(EXAMPLE_ASSET_PACK_MANIFEST).toHaveLength(
      EXAMPLE_ASSET_CATALOG.reduce(
        (total, asset) => total + asset.files.length,
        0,
      ),
    );

    for (const asset of EXAMPLE_ASSET_CATALOG) {
      expect(asset.byteSize).toBe(
        asset.files.reduce((total, file) => total + file.bytes, 0),
      );
      for (const file of asset.files) {
        const packFile = {
          assetId: asset.id,
          bytes: file.bytes,
          mimeType: file.mimeType,
          path: `assets/${asset.id}/${file.path}`,
          sha256: file.sha256,
        };
        expect(EXAMPLE_ASSET_PACK_MANIFEST).toContainEqual(packFile);
        expect(
          Object.isFrozen(
            EXAMPLE_ASSET_PACK_MANIFEST.find(
              (candidate) => candidate.path === packFile.path,
            ),
          ),
        ).toBe(true);
      }
    }
  });

  test('rejects glTF resources outside the immutable catalog layout', async () => {
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-assets-validation-'),
    );

    try {
      await cp(
        path.join(PACKAGE_ROOT, 'assets'),
        path.join(tempDir, 'assets'),
        {
          recursive: true,
        },
      );
      const robotEntry = path.join(tempDir, 'assets', 'robot', 'robot.gltf');
      const document = JSON.parse(await readFile(robotEntry, 'utf8')) as {
        images?: Array<{ uri?: string }>;
      };
      const linkedImage = document.images?.find(
        (image) => image.uri != null && !image.uri.startsWith('data:'),
      );
      if (linkedImage == null) {
        throw new Error('Expected robot.gltf to link an external image');
      }
      linkedImage.uri = 'missing-texture.png';
      await writeFile(robotEntry, JSON.stringify(document));

      const result = await validateExampleAssetCatalog(tempDir);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          assetId: 'robot',
          code: 'gltf-reference',
          message:
            'external resource "missing-texture.png" is not declared in the catalog',
        }),
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test('keeps stable local public paths alongside immutable CDN paths', () => {
    expect(getExampleAssetPublicPath('robot')).toBe(
      '/iwsdk-assets/robot/robot.gltf',
    );
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
