/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export interface CompileUIKitOptions {
  /** Source directory to watch for .uikitml files (e.g., 'ui') */
  sourceDir?: string;
  /** Output directory for generated JSON files (e.g., 'public/ui') */
  outputDir?: string;
  /** Enable file watching in development mode (default: true) */
  watch?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Include pattern for files to process (default: /\.uikitml$/) */
  include?: RegExp;
  /** Exclude pattern for files to ignore */
  exclude?: RegExp;
}

export interface ProcessedUIKitOptions {
  sourceDir: string;
  outputDir: string;
  watch: boolean;
  verbose: boolean;
  include: RegExp;
  exclude?: RegExp;
}

export interface UIKitCompilationStat {
  fileName: string;
  success: boolean;
  inputPath: string;
  outputPath: string;
  error?: string;
}
