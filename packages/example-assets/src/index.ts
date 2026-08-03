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
  getExpectedExampleAssetMimeType,
  type ExampleAssetCatalogEntry,
  type ExampleAssetFile,
} from './catalog.js';

export * from './catalog.js';

export type CatalogValidationIssueCode =
  | 'catalog'
  | 'gltf-reference'
  | 'integrity'
  | 'layout'
  | 'mime'
  | 'publication';

export interface CatalogValidationIssue {
  assetId: string;
  code: CatalogValidationIssueCode;
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
      addIssue(issues, asset, 'catalog', `duplicate asset id "${asset.id}"`);
    }
    seen.add(asset.id);

    validateAssetLayout(asset, issues);

    if (!asset.files.some((file) => file.path === asset.entryFile)) {
      addIssue(
        issues,
        asset,
        'catalog',
        'entry file is missing from file list',
        asset.entryFile,
      );
    }

    validateAssetBounds(asset, issues);

    let entryContents: Buffer | undefined;
    for (const file of asset.files) {
      const sourcePath = getExampleAssetSourceFilePath(
        asset.id,
        file.path,
        assetRoot,
      );
      try {
        const contents = await readFile(sourcePath);
        const actualHash = sha256(contents);
        if (contents.byteLength !== file.bytes) {
          addIssue(
            issues,
            asset,
            'integrity',
            `byte-size mismatch: expected ${file.bytes}, received ${contents.byteLength}`,
            file.path,
          );
        }
        if (actualHash !== file.sha256) {
          addIssue(
            issues,
            asset,
            'integrity',
            `hash mismatch: expected ${file.sha256}, received ${actualHash}`,
            file.path,
          );
        }
        validateFileMimeType(asset, file, contents, issues);
        if (file.path === asset.entryFile) {
          entryContents = contents;
        }
      } catch (error) {
        addIssue(
          issues,
          asset,
          'integrity',
          error instanceof Error ? error.message : String(error),
          file.path,
        );
      }
    }

    if (entryContents != null && asset.type === 'gltf') {
      validateGltfLinkedResources(asset, entryContents, issues);
    }
  }

  return {
    issues,
    valid: issues.length === 0,
  };
}

/** Validate the additional evidence required before public redistribution. */
export async function validateExampleAssetPublication(
  assetRoot = DEFAULT_ASSET_ROOT,
): Promise<CatalogValidationResult> {
  const result = await validateExampleAssetCatalog(assetRoot);
  const issues = [...result.issues];
  for (const asset of EXAMPLE_ASSET_CATALOG) {
    validateAssetPublicationMetadata(asset, issues);
  }
  return { valid: issues.length === 0, issues };
}

/** Reject assets that cannot safely be published with complete metadata. */
export async function assertExampleAssetCatalogPublishable(
  assetRoot = DEFAULT_ASSET_ROOT,
): Promise<void> {
  const result = await validateExampleAssetPublication(assetRoot);
  if (result.valid) {
    return;
  }

  const details = result.issues
    .map(
      (issue) =>
        `${issue.assetId}${issue.file == null ? '' : `/${issue.file}`} [${issue.code}]: ${issue.message}`,
    )
    .join('\n');
  throw new Error(
    `IWSDK example asset catalog is not publishable:\n${details}`,
  );
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
    addIssue(issues, asset, 'catalog', 'gltf asset is missing bounds metadata');
    return;
  }

  for (const key of ['min', 'max'] as const) {
    const value = asset.bounds[key];
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some((entry) => !Number.isFinite(entry))
    ) {
      addIssue(
        issues,
        asset,
        'catalog',
        `bounds.${key} must be a finite [x, y, z] tuple`,
      );
      return;
    }
  }

  for (let axis = 0; axis < 3; axis += 1) {
    if (asset.bounds.min[axis] > asset.bounds.max[axis]) {
      addIssue(
        issues,
        asset,
        'catalog',
        `bounds min must be less than or equal to max on axis ${axis}`,
      );
    }
  }
}

function validateAssetLayout(
  asset: ExampleAssetCatalogEntry,
  issues: CatalogValidationIssue[],
): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(asset.id)) {
    addIssue(issues, asset, 'layout', 'asset id is not a safe package segment');
  }

  const expectedSourcePath = `assets/${asset.id}`;
  if (asset.sourcePath !== expectedSourcePath) {
    addIssue(
      issues,
      asset,
      'layout',
      `sourcePath must be "${expectedSourcePath}"`,
    );
  }

  const expectedPublicPath = `/${EXAMPLE_ASSET_PUBLIC_ROOT}/${asset.id}/${asset.entryFile}`;
  if (asset.publicPath !== expectedPublicPath) {
    addIssue(
      issues,
      asset,
      'layout',
      `publicPath must be "${expectedPublicPath}"`,
    );
  }

  const filePaths = new Set<string>();
  let totalBytes = 0;
  for (const file of asset.files) {
    if (!isSafeRelativeAssetPath(file.path)) {
      addIssue(
        issues,
        asset,
        'layout',
        'file path must be a normalized relative package path',
        file.path,
      );
    }
    if (filePaths.has(file.path)) {
      addIssue(issues, asset, 'catalog', 'duplicate file path', file.path);
    }
    filePaths.add(file.path);

    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      addIssue(
        issues,
        asset,
        'catalog',
        'bytes must be a non-negative safe integer',
        file.path,
      );
    } else {
      totalBytes += file.bytes;
    }
  }

  if (!Number.isSafeInteger(asset.byteSize) || asset.byteSize !== totalBytes) {
    addIssue(
      issues,
      asset,
      'catalog',
      `byteSize must equal the declared file total ${totalBytes}`,
    );
  }
}

function validateAssetPublicationMetadata(
  asset: ExampleAssetCatalogEntry,
  issues: CatalogValidationIssue[],
): void {
  const custody = asset.custody;
  if (
    custody.kind !== 'repository-history' ||
    !isHttpUrl(custody.repositoryUrl) ||
    !/^[0-9a-f]{40}$/u.test(custody.commit) ||
    !isSafeRelativeAssetPath(custody.path)
  ) {
    addIssue(
      issues,
      asset,
      'publication',
      'repository custody must include an HTTP(S) repository URL, full commit hash, and normalized historical path',
    );
  }

  if (asset.origin.status === 'unverified') {
    addIssue(
      issues,
      asset,
      'publication',
      `origin evidence is unverified: ${asset.origin.blocker}`,
    );
  } else if (!isHttpUrl(asset.origin.sourceUrl)) {
    addIssue(
      issues,
      asset,
      'publication',
      'verified origin metadata requires an HTTP(S) source URL',
    );
  }

  if (asset.license.status === 'unverified') {
    addIssue(
      issues,
      asset,
      'publication',
      `license evidence is unverified: ${asset.license.blocker}`,
    );
  } else if (
    asset.license.spdx.trim() === '' ||
    asset.license.evidence.trim() === ''
  ) {
    addIssue(
      issues,
      asset,
      'publication',
      'verified license metadata requires SPDX and evidence fields',
    );
  }
}

function validateFileMimeType(
  asset: ExampleAssetCatalogEntry,
  file: ExampleAssetFile,
  contents: Buffer,
  issues: CatalogValidationIssue[],
): void {
  const expectedMimeType = getExpectedExampleAssetMimeType(file.path);
  if (expectedMimeType == null) {
    addIssue(
      issues,
      asset,
      'mime',
      'file extension has no supported MIME expectation',
      file.path,
    );
  } else if (file.mimeType !== expectedMimeType) {
    addIssue(
      issues,
      asset,
      'mime',
      `MIME mismatch: expected ${expectedMimeType}, received ${file.mimeType}`,
      file.path,
    );
  }

  if (file.mimeType === 'image/png' && !hasPrefix(contents, PNG_SIGNATURE)) {
    addIssue(issues, asset, 'mime', 'invalid PNG signature', file.path);
  }
  if (file.mimeType === 'image/jpeg' && !hasPrefix(contents, JPEG_SIGNATURE)) {
    addIssue(issues, asset, 'mime', 'invalid JPEG signature', file.path);
  }
}

function validateGltfLinkedResources(
  asset: ExampleAssetCatalogEntry,
  contents: Buffer,
  issues: CatalogValidationIssue[],
): void {
  let document: GltfDocument;
  try {
    document = JSON.parse(contents.toString('utf8')) as GltfDocument;
  } catch (error) {
    addIssue(
      issues,
      asset,
      'gltf-reference',
      `entry file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      asset.entryFile,
    );
    return;
  }

  if (document.asset?.version !== '2.0') {
    addIssue(
      issues,
      asset,
      'gltf-reference',
      'glTF entry must declare asset.version "2.0"',
      asset.entryFile,
    );
  }

  const catalogFiles = new Set(asset.files.map((file) => file.path));
  const linkedFiles = new Set<string>();
  const uris = [...(document.buffers ?? []), ...(document.images ?? [])]
    .map((resource) => resource.uri)
    .filter((uri): uri is string => uri != null);

  for (const uri of uris) {
    if (uri.startsWith('data:')) {
      continue;
    }

    const linkedPath = resolveGltfLinkedPath(asset.entryFile, uri);
    if (linkedPath == null) {
      addIssue(
        issues,
        asset,
        'gltf-reference',
        `unsafe external resource URI "${uri}"`,
        asset.entryFile,
      );
      continue;
    }
    linkedFiles.add(linkedPath);
    if (!catalogFiles.has(linkedPath)) {
      addIssue(
        issues,
        asset,
        'gltf-reference',
        `external resource "${uri}" is not declared in the catalog`,
        asset.entryFile,
      );
    }
  }

  for (const file of asset.files) {
    if (file.path !== asset.entryFile && !linkedFiles.has(file.path)) {
      addIssue(
        issues,
        asset,
        'gltf-reference',
        'catalog file is not linked by the glTF entry',
        file.path,
      );
    }
  }
}

interface GltfDocument {
  asset?: { version?: string };
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
}

function resolveGltfLinkedPath(
  entryFile: string,
  uri: string,
): string | undefined {
  if (
    uri.includes('\\') ||
    uri.includes('?') ||
    uri.includes('#') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(uri)
  ) {
    return undefined;
  }

  let decodedUri: string;
  try {
    decodedUri = decodeURIComponent(uri);
  } catch {
    return undefined;
  }
  if (!isSafeRelativeAssetPath(decodedUri)) {
    return undefined;
  }

  const linkedPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(entryFile), decodedUri),
  );
  return isSafeRelativeAssetPath(linkedPath) ? linkedPath : undefined;
}

function isSafeRelativeAssetPath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes('\\') &&
    !value.includes('%') &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    value.split('/').every((segment) => segment !== '' && segment !== '..')
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function addIssue(
  issues: CatalogValidationIssue[],
  asset: ExampleAssetCatalogEntry,
  code: CatalogValidationIssueCode,
  message: string,
  file?: string,
): void {
  issues.push({ assetId: asset.id, code, file, message });
}

function hasPrefix(contents: Buffer, prefix: Buffer): boolean {
  return contents.subarray(0, prefix.length).equals(prefix);
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex');

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
  return sha256(await readFile(filePath));
}

function sha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}
