/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import catalogData from './catalog.json';

export type ExampleAssetType = 'gltf' | 'image' | 'audio' | 'other';

export interface ExampleAssetFile {
  path: string;
  sha256: string;
}

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
  files: ExampleAssetFile[];
  tags: string[];
  bounds?: ExampleAssetBounds;
}

export const EXAMPLE_ASSET_PUBLIC_ROOT = 'iwsdk-assets';

export const EXAMPLE_ASSET_CATALOG = catalogData as ExampleAssetCatalogEntry[];
