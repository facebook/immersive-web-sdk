/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Compression options for GLTF/GLB geometry
 */
export type GeometryCompression =
  | 'quantize'
  | 'meshopt'
  | 'draco'
  | 'both'
  | false;

/**
 * Texture compression modes
 */
export type TextureCompressionMode =
  | 'auto'
  | 'etc1s'
  | 'uastc'
  | 'mixed'
  | 'manual';

/**
 * Preset optimization levels
 */
export type OptimizationLevel = 'light' | 'medium' | 'aggressive';

/**
 * Geometry optimization options
 */
export interface GeometryOptions {
  /**
   * Compression method to use
   * @default 'meshopt'
   */
  compress?: GeometryCompression;

  /**
   * Compression quality: 0.0 = max compression, 1.0 = max quality
   * @default 0.75
   */
  quality?: number;

  /**
   * Encoding speed: 0.0 = slow/best compression, 1.0 = fast encoding (draco only)
   * @default 0.5
   */
  speed?: number;

  /**
   * Vertex precision: 0.0 = low precision, 1.0 = high precision
   * @default 0.8
   */
  precision?: number;
}

/**
 * Texture optimization options
 */
export interface TextureOptions {
  /**
   * Texture compression mode
   * @default 'auto'
   */
  mode?: TextureCompressionMode;

  /**
   * Texture quality: 0.0 = max compression, 1.0 = max quality
   * @default 0.75
   */
  quality?: number;

  /**
   * Maximum texture size in pixels
   * @default 1024
   */
  maxSize?: number;

  /**
   * Patterns for ETC1S compression (manual mode)
   */
  etc1sPatterns?: RegExp[];

  /**
   * Patterns for UASTC compression (manual mode)
   */
  uastcPatterns?: RegExp[];
}

/**
 * Main plugin options interface
 */
export interface GLTFOptimizerOptions {
  /**
   * Preset optimization level (overridden by specific options)
   * @default 'medium'
   */
  level?: OptimizationLevel;

  /**
   * Include pattern for GLTF/GLB files
   * @default /\.(gltf|glb)$/i
   */
  include?: RegExp;

  /**
   * Exclude pattern for files to skip
   * @default undefined
   */
  exclude?: RegExp;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;

  /**
   * Geometry optimization options
   */
  geometry?: GeometryOptions;

  /**
   * Texture optimization options
   */
  textures?: TextureOptions;
}

/**
 * Internal processed options with all defaults applied
 */
export interface ProcessedOptions extends Required<GLTFOptimizerOptions> {
  geometry: Required<GeometryOptions>;
  textures: Required<TextureOptions>;
}

/**
 * Texture compression parameters for gltf-transform
 */
export interface TextureCompressionParams {
  mode: 'etc1s' | 'uastc';
  quality: number;
  pattern?: string;
}

/**
 * Draco compression parameters
 */
export interface DracoParams {
  method: 'edgebreaker' | 'sequential';
  encodeSpeed: number;
  decodeSpeed: number;
  quantizationBits: {
    POSITION: number;
    NORMAL: number;
    TEXCOORD_0: number;
  };
}

/**
 * Meshopt compression parameters
 */
export interface MeshoptParams {
  level: 'medium' | 'high';
}

/**
 * Bundle asset information
 */
export interface AssetInfo {
  fileName: string;
  source: Buffer | string;
  isAsset: boolean;
}
