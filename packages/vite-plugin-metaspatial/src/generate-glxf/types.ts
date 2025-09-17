/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface GLXFAsset {
  uri: string;
  name: string;
}

export interface GLXFFile {
  assets?: GLXFAsset[];
  [key: string]: unknown;
}

export interface GLTFBuffer {
  uri?: string;
  byteLength: number;
}

export interface GLTFImage {
  uri?: string;
  mimeType?: string;
  name?: string;
}

export interface GLTFFile {
  buffers?: GLTFBuffer[];
  images?: GLTFImage[];
  textures?: unknown[];
  [key: string]: unknown;
}

export interface GLXFGenerationOptions {
  /**
   * Directory containing Meta Spatial files to watch
   * @default 'metaspatial'
   */
  metaSpatialDir?: string;

  /**
   * Output directory for generated GLXF/GLTF files
   * @default 'generated/glxf'
   */
  outputDir?: string;

  /**
   * Debounce time in milliseconds for file changes
   * Higher values batch more changes together but increase response time
   * @default 500
   */
  watchDebounceMs?: number;

  /**
   * Export formats to generate
   * @default ['glxf']
   */
  formats?: ('glxf' | 'gltf')[];

  /**
   * Path to Meta Spatial CLI executable
   * @default '/Applications/Meta Spatial Editor.app/Contents/MacOS/CLI' (macOS)
   */
  metaSpatialCliPath?: string;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;

  /**
   * Enable file watcher in development mode
   * @default true
   */
  enableWatcher?: boolean;

  /**
   * Regex pattern to ignore files/directories in the metaspatial directory
   * These files won't trigger GLXF regeneration when changed
   * @default /components\//
   * @example /components\/|\.tmp$/ to ignore components folder and .tmp files
   */
  ignorePattern?: RegExp;
}

export interface ProcessedGLXFOptions {
  metaSpatialDir: string;
  outputDir: string;
  watchDebounceMs: number;
  formats: readonly ('glxf' | 'gltf')[];
  metaSpatialCliPath: string;
  verbose: boolean;
  enableWatcher: boolean;
  ignorePattern: RegExp;
}
