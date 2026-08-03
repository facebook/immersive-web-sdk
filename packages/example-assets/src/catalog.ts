/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import catalogData from './catalog.json';

export type ExampleAssetType = 'gltf' | 'image' | 'audio' | 'other';

export interface ExampleAssetFile {
  bytes: number;
  mimeType: string;
  path: string;
  sha256: string;
}

export interface ExampleAssetRepositoryCustody {
  kind: 'repository-history';
  repositoryUrl: string;
  commit: string;
  path: string;
}

export type ExampleAssetOrigin =
  | {
      status: 'verified';
      sourceUrl: string;
      author?: string;
    }
  | {
      status: 'unverified';
      blocker: string;
    };

export type ExampleAssetLicense =
  | {
      status: 'verified';
      spdx: string;
      evidence: string;
      attribution?: string;
    }
  | {
      status: 'unverified';
      blocker: string;
    };

export interface ExampleAssetBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ExampleAssetCatalogEntry {
  id: string;
  name: string;
  type: ExampleAssetType;
  sourcePath: string;
  entryFile: string;
  publicPath: string;
  byteSize: number;
  files: ExampleAssetFile[];
  tags: string[];
  bounds?: ExampleAssetBounds;
  /** Last known repository custody; this is not evidence of authorship. */
  custody: ExampleAssetRepositoryCustody;
  origin: ExampleAssetOrigin;
  license: ExampleAssetLicense;
}

export const EXAMPLE_ASSET_PUBLIC_ROOT = 'iwsdk-assets';

export const EXAMPLE_ASSET_CATALOG = catalogData as ExampleAssetCatalogEntry[];

export interface ExampleAssetPackFile {
  readonly assetId: string;
  readonly bytes: number;
  readonly mimeType: string;
  readonly path: string;
  readonly sha256: string;
}

/** Immutable package-layout expectations for all distributable asset files. */
export const EXAMPLE_ASSET_PACK_MANIFEST: readonly ExampleAssetPackFile[] =
  Object.freeze(
    EXAMPLE_ASSET_CATALOG.flatMap((asset) =>
      asset.files.map((file) =>
        Object.freeze({
          assetId: asset.id,
          bytes: file.bytes,
          mimeType: file.mimeType,
          path: `assets/${asset.id}/${file.path}`,
          sha256: file.sha256,
        }),
      ),
    ),
  );

export function getExpectedExampleAssetMimeType(
  filePath: string,
): string | undefined {
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  switch (extension) {
    case '.gltf':
      return 'model/gltf+json';
    case '.glb':
      return 'model/gltf-binary';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.bin':
      return 'application/octet-stream';
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
      return 'audio/ogg';
    case '.wav':
      return 'audio/wav';
    default:
      return undefined;
  }
}
