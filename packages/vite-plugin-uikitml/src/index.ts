/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import { parse } from '@pmndrs/uikitml';
import type { FSWatcher } from 'chokidar';
import fs from 'fs-extra';
import type { Plugin, ViteDevServer } from 'vite';
import {
  regenerateAllUIKit,
  createFileWatcher,
  cleanup,
} from './file-watcher.js';
import type {
  CompileUIKitOptions,
  ProcessedUIKitOptions,
  UIKitCompilationStat,
} from './types.js';

// Export types
export type { CompileUIKitOptions } from './types.js';

/**
 * Process and normalize plugin options with defaults
 */
function processOptions(
  options: CompileUIKitOptions = {},
): ProcessedUIKitOptions {
  return {
    sourceDir: 'ui',
    outputDir: 'public/ui',
    watch: true,
    verbose: false,
    include: /\.uikitml$/,
    ...options,
  };
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
 * Compile a single UIKitML file to JSON
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

    let parseResult;
    try {
      // Import and use the parser from UIKitML
      parseResult = parse(sourceContent, {
        onError: (message: string) => {
          console.error(
            `[compile-uikitml] Parse error in ${sourcePath}: ${message}`,
          );
        },
      });
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
 * Compile all UIKitML files in the source directory (for build mode with stats tracking)
 */
async function compileAllUIKitMLFilesBuild(
  pluginOptions: ProcessedUIKitOptions,
  compilationStats: UIKitCompilationStat[],
): Promise<void> {
  const { sourceDir, outputDir, include, exclude, verbose } = pluginOptions;
  const sourceRoot = path.resolve(process.cwd(), sourceDir);
  const outputRoot = path.resolve(process.cwd(), outputDir);

  if (verbose) {
    console.log(`[compile-uikitml] 🚀 Starting UIKitML compilation...`);
    console.log(`[compile-uikitml] Source dir: ${sourceRoot}`);
    console.log(`[compile-uikitml] Output dir: ${outputRoot}`);
  }

  // Find all .uikitml files
  const files = await findUIKitMLFiles(sourceRoot, include, exclude, verbose);

  if (files.length === 0) {
    if (verbose) {
      console.log(`[compile-uikitml] No .uikitml files found in ${sourceDir}`);
    }
    return;
  }

  console.log(
    `[compile-uikitml] Found ${files.length} .uikitml files to compile`,
  );

  // Process each file
  for (const filePath of files) {
    const relativePath = path.relative(sourceRoot, filePath);
    const outputPath = path.join(
      outputRoot,
      relativePath.replace(/\.uikitml$/, '.json'),
    );

    const stat = await compileUIKitMLFile(filePath, outputPath, verbose);
    compilationStats.push(stat);
  }

  // Print immediate summary (for verbose mode during build)
  if (verbose) {
    const successCount = compilationStats.filter((s) => s.success).length;
    const failureCount = compilationStats.length - successCount;
    console.log(
      `[compile-uikitml] ✅ Compilation complete: ${successCount} success, ${failureCount} failed`,
    );

    if (failureCount > 0) {
      console.log(`[compile-uikitml] Failed files:`);
      compilationStats
        .filter((s) => !s.success)
        .forEach((s) => console.log(`  - ${s.fileName}: ${s.error}`));
    }
  }
}

/**
 * Generate initial UIKitML files for development
 */
async function generateInitialUIKit(
  pluginOptions: ProcessedUIKitOptions,
): Promise<void> {
  const watchDir = path.resolve(process.cwd(), pluginOptions.sourceDir);

  console.log('🚀 Generating initial UIKitML files for dev server...');

  try {
    if (await fs.pathExists(watchDir)) {
      await regenerateAllUIKit(pluginOptions);
    } else if (pluginOptions.verbose) {
      console.log(`⚠️  UIKitML source directory not found: ${watchDir}`);
    }
  } catch (error) {
    console.error('❌ Error during initial UIKitML generation:', error);
  }
}

/**
 * Main Vite plugin function
 */
export function compileUIKit(options: CompileUIKitOptions = {}): Plugin {
  const pluginOptions = processOptions(options);
  let config: any;
  let watcher: FSWatcher | null = null;
  let compilationStats: UIKitCompilationStat[] = [];
  // Gate first requests until initial compile completes
  let initialReadyResolve: (() => void) | null = null;
  const initialReady: Promise<void> = new Promise((resolve) => {
    initialReadyResolve = resolve;
  });
  let devServer: ViteDevServer | null = null;

  return {
    name: 'compile-uikitml',

    configResolved(resolvedConfig) {
      // Store the resolved config to determine dev vs build mode
      config = resolvedConfig;
      if (pluginOptions.verbose) {
        console.log(
          `[compile-uikitml] Plugin initialized with options:`,
          pluginOptions,
        );
        console.log(`[compile-uikitml] Vite command: ${config.command}`);
        console.log(`[compile-uikitml] Vite mode: ${config.mode}`);
      }
    },

    async configureServer(_server) {
      if (!pluginOptions.watch) {
        return;
      }
      devServer = _server;

      const watchDir = path.resolve(process.cwd(), pluginOptions.sourceDir);

      if (pluginOptions.verbose) {
        console.log(`🔍 UIKitML watcher monitoring: ${watchDir}`);
      }

      // Insert a tiny gate so any incoming request awaits initial generation
      const gate = async (_req: any, _res: any, next: any) => {
        await initialReady;
        next();
      };
      // Prefer to prepend gate to the middleware stack so it runs first
      const stack: any[] = (_server as any)?.middlewares?.stack;
      if (Array.isArray(stack)) {
        stack.splice(0, 0, { route: '', handle: gate });
      } else {
        _server.middlewares.use(gate);
      }

      // Generate initial files for dev server (awaited)
      await generateInitialUIKit(pluginOptions);
      initialReadyResolve?.();

      // Set up file watcher for changes
      watcher = createFileWatcher(watchDir, pluginOptions, () =>
        devServer?.ws.send({ type: 'full-reload' }),
      );
      console.log(
        '👁️  UIKitML file watcher started - monitoring for changes...',
      );
    },

    async buildStart() {
      // Only generate UIKit files during build, not during dev server
      // config.command is 'serve' for dev, 'build' for production
      if (config?.command === 'serve') {
        return;
      }

      // Reset stats for each build
      compilationStats = [];

      // This runs at the start of the build process
      await compileAllUIKitMLFilesBuild(pluginOptions, compilationStats);
    },

    buildEnd() {
      // Clean up file watcher and pending operations
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      cleanup();
    },

    // Display UIKitML compilation summary at the very end of build process
    closeBundle: {
      async handler() {
        // Only run during build
        if (config?.command === 'serve') {
          return;
        }

        // Display UIKitML compilation summary (always show, not just in verbose mode)
        if (compilationStats.length > 0) {
          const successfulCompilations = compilationStats.filter(
            (stat) => stat.success,
          );
          const failedCompilations = compilationStats.filter(
            (stat) => !stat.success,
          );

          console.log('\n🎨 UIKitML Compilation Summary:');

          // Show all successfully compiled files
          successfulCompilations.forEach((stat) => {
            const relativePath = path.relative(process.cwd(), stat.outputPath);
            console.log(`  - ${relativePath}`);
          });

          // Show failed compilations if any
          if (failedCompilations.length > 0) {
            console.log('\n❌ Failed compilations:');
            failedCompilations.forEach((stat) => {
              console.log(`  - ${stat.fileName}: ${stat.error}`);
            });
          }

          // Show total count
          console.log(
            `\n📊 Total: ${successfulCompilations.length} compiled, ${failedCompilations.length} failed`,
          );
        }
      },
    },
  };
}
