/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXAMPLE_ASSET_CATALOG,
  EXAMPLE_ASSET_PUBLIC_ROOT,
  type ExampleAssetCatalogEntry,
} from './catalog.js';

export * from './catalog.js';

export interface CatalogValidationIssue {
  assetId: string;
  file?: string;
  message: string;
}

export interface CatalogValidationResult {
  valid: boolean;
  issues: CatalogValidationIssue[];
}

export interface CopyExampleAssetsOptions {
  assetIds: readonly string[];
  outDir: string;
  assetRoot?: string;
  publicRoot?: string;
  /**
   * @deprecated Use assetRoot. Kept during migration for existing scripts.
   */
  repoRoot?: string;
}

export interface CopiedExampleAssetFile {
  assetId: string;
  sourcePath: string;
  outputPath: string;
  sha256: string;
}

export function getExampleAsset(
  assetId: string,
): ExampleAssetCatalogEntry | undefined {
  return EXAMPLE_ASSET_CATALOG.find((asset) => asset.id === assetId);
}

export function getExampleAssetPublicPath(assetId: string): string {
  const asset = getRequiredExampleAsset(assetId);
  return asset.publicPath;
}

export function getExampleAssetSourceFilePath(
  assetId: string,
  filePath: string,
  assetRoot = DEFAULT_ASSET_ROOT,
): string {
  const asset = getRequiredExampleAsset(assetId);
  const file = asset.files.find((candidate) => candidate.path === filePath);
  if (file == null) {
    throw new Error(
      `Unknown file "${filePath}" for IWSDK example asset "${assetId}"`,
    );
  }
  return path.join(assetRoot, asset.sourcePath, file.path);
}

export async function validateExampleAssetCatalog(
  assetRoot = DEFAULT_ASSET_ROOT,
): Promise<CatalogValidationResult> {
  const issues: CatalogValidationIssue[] = [];
  const seen = new Set<string>();

  for (const asset of EXAMPLE_ASSET_CATALOG) {
    if (seen.has(asset.id)) {
      issues.push({
        assetId: asset.id,
        message: `duplicate asset id "${asset.id}"`,
      });
    }
    seen.add(asset.id);

    if (!asset.files.some((file) => file.path === asset.entryFile)) {
      issues.push({
        assetId: asset.id,
        file: asset.entryFile,
        message: 'entry file is missing from file list',
      });
    }

    validateAssetBounds(asset, issues);

    for (const file of asset.files) {
      const sourcePath = getExampleAssetSourceFilePath(
        asset.id,
        file.path,
        assetRoot,
      );
      try {
        const actualHash = await sha256File(sourcePath);
        if (actualHash !== file.sha256) {
          issues.push({
            assetId: asset.id,
            file: file.path,
            message: `hash mismatch: expected ${file.sha256}, received ${actualHash}`,
          });
        }
      } catch (error) {
        issues.push({
          assetId: asset.id,
          file: file.path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    issues,
    valid: issues.length === 0,
  };
}

export async function copyExampleAssets({
  assetIds,
  assetRoot,
  outDir,
  publicRoot = EXAMPLE_ASSET_PUBLIC_ROOT,
  repoRoot,
}: CopyExampleAssetsOptions): Promise<CopiedExampleAssetFile[]> {
  const copied: CopiedExampleAssetFile[] = [];
  const sourceRoot = assetRoot ?? repoRoot ?? DEFAULT_ASSET_ROOT;

  for (const assetId of assetIds) {
    const asset = getRequiredExampleAsset(assetId);
    for (const file of asset.files) {
      const sourcePath = getExampleAssetSourceFilePath(
        asset.id,
        file.path,
        sourceRoot,
      );
      const actualHash = await sha256File(sourcePath);
      if (actualHash !== file.sha256) {
        throw new Error(
          `Asset "${asset.id}" file "${file.path}" hash mismatch: expected ${file.sha256}, received ${actualHash}`,
        );
      }

      const outputPath = path.join(outDir, publicRoot, asset.id, file.path);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await copyFile(sourcePath, outputPath);
      copied.push({
        assetId: asset.id,
        outputPath,
        sha256: actualHash,
        sourcePath,
      });
    }
  }

  return copied;
}

function validateAssetBounds(
  asset: ExampleAssetCatalogEntry,
  issues: CatalogValidationIssue[],
): void {
  if (asset.type !== 'gltf') {
    return;
  }

  if (asset.bounds == null) {
    issues.push({
      assetId: asset.id,
      message: 'gltf asset is missing bounds metadata',
    });
    return;
  }

  for (const key of ['min', 'max'] as const) {
    const value = asset.bounds[key];
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some((entry) => !Number.isFinite(entry))
    ) {
      issues.push({
        assetId: asset.id,
        message: `bounds.${key} must be a finite [x, y, z] tuple`,
      });
      return;
    }
  }

  for (let axis = 0; axis < 3; axis += 1) {
    if (asset.bounds.min[axis] > asset.bounds.max[axis]) {
      issues.push({
        assetId: asset.id,
        message: `bounds min must be less than or equal to max on axis ${axis}`,
      });
    }
  }
}

const DEFAULT_ASSET_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function getRequiredExampleAsset(assetId: string): ExampleAssetCatalogEntry {
  const asset = getExampleAsset(assetId);
  if (asset == null) {
    throw new Error(`Unknown IWSDK example asset "${assetId}"`);
  }
  return asset;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}
