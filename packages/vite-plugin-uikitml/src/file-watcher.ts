/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'fs-extra';
import type { ProcessedUIKitOptions, UIKitCompilationStat } from './types.js';

// Global debounce timer for all file changes
let globalDebounceTimer: NodeJS.Timeout | null = null;

/**
 * Check if a file should be ignored based on the exclude pattern
 */
export function shouldIgnoreFile(filePath: string, exclude?: RegExp): boolean {
  if (!exclude) {
    return false;
  }
  const relativePath = path.relative(process.cwd(), filePath);
  return exclude.test(relativePath);
}

/**
 * Handle file change event and trigger debounced UIKitML compilation
 */
export async function handleFileChange(
  eventType: string,
  filePath: string,
  pluginOptions: ProcessedUIKitOptions,
  onGenerated?: (reason: 'change' | 'unlink', paths?: string[]) => void,
): Promise<void> {
  const relativePath = path.relative(process.cwd(), filePath);

  // Only process .uikitml files
  if (!pluginOptions.include.test(path.basename(filePath))) {
    return;
  }

  // Log the change
  const emoji =
    eventType === 'add' ? '➕' : eventType === 'unlink' ? '🗑️' : '📝';
  console.log(`${emoji} UIKitML file ${eventType}: ${relativePath}`);

  // Check if file should be ignored
  if (shouldIgnoreFile(filePath, pluginOptions.exclude)) {
    if (pluginOptions.verbose) {
      console.log(
        `⏭️  Ignoring ${eventType} for: ${relativePath} (matches exclude pattern)`,
      );
    }
    return;
  }

  // For unlink events, remove the generated JSON file
  if (eventType === 'unlink') {
    await handleFileUnlink(filePath, pluginOptions, onGenerated);
    return;
  }

  // Clear existing timer and set a new one (per-file debounce)
  if (globalDebounceTimer) {
    clearTimeout(globalDebounceTimer);
  }

  globalDebounceTimer = setTimeout(async () => {
    globalDebounceTimer = null;
    await compileChangedFile(filePath, pluginOptions, 'change', onGenerated);
  }, 300); // 300ms debounce
}

/**
 * Handle file deletion by removing corresponding JSON file
 */
export async function handleFileUnlink(
  filePath: string,
  pluginOptions: ProcessedUIKitOptions,
  onGenerated?: (reason: 'change' | 'unlink', paths?: string[]) => void,
): Promise<void> {
  try {
    const sourceRoot = path.resolve(process.cwd(), pluginOptions.sourceDir);
    const outputRoot = path.resolve(process.cwd(), pluginOptions.outputDir);
    const relativePath = path.relative(sourceRoot, filePath);
    const outputPath = path.join(
      outputRoot,
      relativePath.replace(/\.uikitml$/, '.json'),
    );

    if (await fs.pathExists(outputPath)) {
      await fs.remove(outputPath);
      if (pluginOptions.verbose) {
        console.log(
          `🗑️  Removed generated JSON: ${path.relative(process.cwd(), outputPath)}`,
        );
      }
      onGenerated?.('unlink', [outputPath]);
    }
  } catch (error) {
    console.error(`❌ Error removing JSON file for ${filePath}:`, error);
  }
}

/**
 * Compile a single changed UIKitML file
 */
export async function compileChangedFile(
  filePath: string,
  pluginOptions: ProcessedUIKitOptions,
  triggerType?: string,
  onGenerated?: (reason: 'change', paths?: string[]) => void,
): Promise<void> {
  try {
    const sourceRoot = path.resolve(process.cwd(), pluginOptions.sourceDir);
    const outputRoot = path.resolve(process.cwd(), pluginOptions.outputDir);
    const relativePath = path.relative(sourceRoot, filePath);
    const outputPath = path.join(
      outputRoot,
      relativePath.replace(/\.uikitml$/, '.json'),
    );

    const stat = await compileUIKitMLFile(
      filePath,
      outputPath,
      pluginOptions.verbose,
    );

    if (stat.success) {
      if (triggerType) {
        console.log(
          `✅ UIKitML file ${triggerType === 'change' ? 'recompiled' : 'compiled'}: ${relativePath}`,
        );
      }
      onGenerated?.('change', [outputPath]);
    } else {
      console.error(
        `❌ Failed to compile UIKitML file: ${relativePath} - ${stat.error}`,
      );
    }
  } catch (error) {
    console.error(
      `❌ Error during UIKitML ${triggerType ? 'recompilation' : 'compilation'}:`,
      error,
    );
  }
}

/**
 * Compile a single UIKitML file to JSON (copied from main index.ts)
 */
async function compileUIKitMLFile(
  sourcePath: string,
  outputPath: string,
  verbose = false,
): Promise<UIKitCompilationStat> {
  const fileName = path.basename(sourcePath);

  try {
    // Read the source file
    const sourceContent = await fs.readFile(sourcePath, 'utf-8');

    if (verbose) {
      console.log(`[compile-uikitml] Reading file: ${sourcePath}`);
      console.log(
        `[compile-uikitml] File content length: ${sourceContent.length} characters`,
      );
    }

    // Parse with actual @pmndrs/uikitml parser
    let parseResult;
    try {
      const { parse } = await import('@pmndrs/uikitml');
      parseResult = parse(sourceContent, {
        onError: (message: string) => {
          console.error(
            `[compile-uikitml] Parse error in ${sourcePath}: ${message}`,
          );
        },
      });

      if (verbose) {
        console.log(`[compile-uikitml] Real parse result for ${fileName}:`);
        console.log(
          `[compile-uikitml] Element type: ${typeof parseResult.element === 'string' ? 'string' : parseResult.element?.type || 'unknown'}`,
        );
        console.log(
          `[compile-uikitml] Classes found: ${Object.keys(parseResult.classes || {}).length}`,
        );
        console.log(
          `[compile-uikitml] Ranges found: ${Object.keys(parseResult.ranges || {}).length}`,
        );
      }
    } catch (error) {
      console.error(`[compile-uikitml] Error parsing UIKitML content:`, error);
      throw error;
    }

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    // Write JSON output
    const jsonOutput = JSON.stringify(parseResult, null, 2);
    await fs.writeFile(outputPath, jsonOutput, 'utf-8');

    if (verbose) {
      console.log(
        `[compile-uikitml] ✅ Compiled: ${fileName} -> ${path.basename(outputPath)}`,
      );
    }

    return {
      fileName,
      success: true,
      inputPath: sourcePath,
      outputPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[compile-uikitml] ❌ Failed to compile ${fileName}:`, error);

    return {
      fileName,
      success: false,
      inputPath: sourcePath,
      outputPath,
      error: errorMessage,
    };
  }
}

/**
 * Regenerate all UIKitML files in the source directory
 */
export async function regenerateAllUIKit(
  pluginOptions: ProcessedUIKitOptions,
  triggerType?: string,
  onGenerated?: (reason: 'change', paths?: string[]) => void,
): Promise<void> {
  try {
    const sourceRoot = path.resolve(process.cwd(), pluginOptions.sourceDir);
    const outputRoot = path.resolve(process.cwd(), pluginOptions.outputDir);

    if (pluginOptions.verbose && triggerType) {
      console.log(`🔄 Regenerating UIKitML files due to ${triggerType}`);
    }

    // Find all .uikitml files
    const files = await findUIKitMLFiles(
      sourceRoot,
      pluginOptions.include,
      pluginOptions.exclude,
      pluginOptions.verbose,
    );

    if (files.length === 0) {
      if (pluginOptions.verbose) {
        console.log(
          `[compile-uikitml] No .uikitml files found in ${pluginOptions.sourceDir}`,
        );
      }
      return;
    }

    if (pluginOptions.verbose) {
      console.log(
        `[compile-uikitml] Found ${files.length} .uikitml files to process`,
      );
    }

    const compilationStats: UIKitCompilationStat[] = [];

    // Process each file
    for (const filePath of files) {
      const relativePath = path.relative(sourceRoot, filePath);
      const outputPath = path.join(
        outputRoot,
        relativePath.replace(/\.uikitml$/, '.json'),
      );

      const stat = await compileUIKitMLFile(
        filePath,
        outputPath,
        pluginOptions.verbose,
      );
      compilationStats.push(stat);
    }

    // Print summary
    const successCount = compilationStats.filter((s) => s.success).length;
    const failureCount = compilationStats.length - successCount;

    if (triggerType) {
      console.log(
        `🎉 UIKitML ${triggerType === 'change' ? 'recompilation' : 'compilation'} complete: ${successCount} success, ${failureCount} failed`,
      );
    }

    if (successCount > 0) {
      const changed = compilationStats
        .filter((s) => s.success)
        .map((s) => s.outputPath);
      onGenerated?.('change', changed);
    }

    if (failureCount > 0 && pluginOptions.verbose) {
      console.log(`[compile-uikitml] Failed files:`);
      compilationStats
        .filter((s) => !s.success)
        .forEach((s) => console.log(`  - ${s.fileName}: ${s.error}`));
    }
  } catch (error) {
    console.error(
      `❌ Error during UIKitML ${triggerType ? 'regeneration' : 'generation'}:`,
      error,
    );
  }
}

/**
 * Find all .uikitml files in the source directory recursively
 */
async function findUIKitMLFiles(
  sourceDir: string,
  include: RegExp,
  exclude?: RegExp,
  verbose = false,
): Promise<string[]> {
  const files: string[] = [];

  if (!(await fs.pathExists(sourceDir))) {
    if (verbose) {
      console.log(`[compile-uikitml] Source directory not found: ${sourceDir}`);
    }
    return files;
  }

  async function scanDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        if (include.test(entry.name) && (!exclude || !exclude.test(fullPath))) {
          files.push(fullPath);
        }
      }
    }
  }

  try {
    await scanDirectory(sourceDir);
  } catch (error) {
    if (verbose) {
      console.warn(
        `[compile-uikitml] Error scanning directory ${sourceDir}:`,
        error,
      );
    }
  }

  return files;
}

/**
 * Create and configure file watcher
 */
export function createFileWatcher(
  watchDir: string,
  pluginOptions: ProcessedUIKitOptions,
  onGenerated?: (reason: 'change' | 'unlink', paths?: string[]) => void,
): FSWatcher {
  const watcher = chokidar.watch(watchDir, {
    // Ignore dot files and node_modules
    ignored: /(^|[\/\\])\../,
    // Don't watch initially (we only care about changes)
    ignoreInitial: true,
    // Polling for more reliable cross-platform watching
    usePolling: false,
    // Just wait for files to be written completely (debouncing handled manually)
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  // Watch for file changes
  watcher
    .on('change', (filePath: string) =>
      handleFileChange('change', filePath, pluginOptions, onGenerated),
    )
    .on('add', (filePath: string) =>
      handleFileChange('add', filePath, pluginOptions, onGenerated),
    )
    .on('unlink', (filePath: string) =>
      handleFileChange('unlink', filePath, pluginOptions, onGenerated),
    )
    .on('error', (error: unknown) => {
      console.error('🚨 UIKitML file watcher error:', error);
    })
    .on('ready', () => {
      if (pluginOptions.verbose) {
        console.log('👁️  UIKitML file watcher ready');
      }
    });

  return watcher;
}

/**
 * Clean up any pending debounced operations
 */
export function cleanup(): void {
  if (globalDebounceTimer) {
    clearTimeout(globalDebounceTimer);
    globalDebounceTimer = null;
  }
}
