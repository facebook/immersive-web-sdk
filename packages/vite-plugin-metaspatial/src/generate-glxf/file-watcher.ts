/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'fs-extra';
import { executeMetaSpatialExport } from './cli-wrapper.js';
import type { ProcessedGLXFOptions } from './types.js';

// Global debounce timer for all file changes
let globalDebounceTimer: NodeJS.Timeout | null = null;

/**
 * Check if a file should be ignored based on the ignore pattern
 */
export function shouldIgnoreFile(
  filePath: string,
  ignorePattern: RegExp,
): boolean {
  const relativePath = path.relative(process.cwd(), filePath);
  return ignorePattern.test(relativePath);
}

/**
 * Handle file change event and trigger debounced GLXF generation
 */
export async function handleFileChange(
  eventType: string,
  filePath: string,
  pluginOptions: ProcessedGLXFOptions,
  onGenerated?: (reason: 'change', paths?: string[]) => void,
): Promise<void> {
  const relativePath = path.relative(process.cwd(), filePath);

  // Log the change
  const emoji =
    eventType === 'add' ? '➕' : eventType === 'unlink' ? '🗑️' : '📝';
  console.log(`${emoji} Meta Spatial file ${eventType}: ${relativePath}`);

  // Check if file should be ignored
  if (shouldIgnoreFile(filePath, pluginOptions.ignorePattern)) {
    if (pluginOptions.verbose) {
      console.log(
        `⏭️  Ignoring ${eventType} for: ${relativePath} (matches ignore pattern)`,
      );
    }
    return;
  }

  // For unlink events, we don't need to regenerate (files are gone)
  if (eventType === 'unlink') {
    return;
  }

  // Clear existing timer and set a new one (global debounce)
  if (globalDebounceTimer) {
    clearTimeout(globalDebounceTimer);
  }

  globalDebounceTimer = setTimeout(async () => {
    globalDebounceTimer = null;
    await regenerateGLXF(pluginOptions, 'change', onGenerated);
  }, pluginOptions.watchDebounceMs);
}

/**
 * Regenerate GLXF for all Meta Spatial projects
 */
export async function regenerateGLXF(
  pluginOptions: ProcessedGLXFOptions,
  triggerType?: string,
  onGenerated?: (reason: 'change', paths?: string[]) => void,
): Promise<void> {
  try {
    const metaSpatialDir = path.resolve(
      process.cwd(),
      pluginOptions.metaSpatialDir,
    );

    if (await fs.pathExists(metaSpatialDir)) {
      const files = await fs.readdir(metaSpatialDir);
      const metaSpatialFiles = files.filter(
        (file) => path.extname(file) === '.metaspatial',
      );

      if (pluginOptions.verbose && triggerType) {
        console.log(
          `🔄 Regenerating GLXF for ${metaSpatialFiles.length} project(s) due to ${triggerType}`,
        );
      }

      // Regenerate all .metaspatial projects
      for (const file of metaSpatialFiles) {
        const projectPath = path.join(metaSpatialDir, file);
        const glxfDir = path.resolve(process.cwd(), pluginOptions.outputDir);
        const gltfDir = path.resolve(process.cwd(), 'public/gltf');

        try {
          await executeMetaSpatialExport(
            pluginOptions.metaSpatialCliPath,
            projectPath,
            glxfDir,
            gltfDir,
            pluginOptions.verbose,
          );

          if (pluginOptions.verbose) {
            console.log(
              `✅ ${triggerType ? 'Regenerated' : 'Generated'} GLXF for: ${file}`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to ${triggerType ? 'regenerate' : 'generate'} GLXF for ${file}:`,
            error,
          );
        }
      }

      if (triggerType) {
        console.log(
          `🎉 GLXF regeneration completed (triggered by ${triggerType})`,
        );
      }
      // Trigger downstream reload once regeneration has completed
      onGenerated?.('change');
    }
  } catch (error) {
    console.error(
      `❌ Error during GLXF ${triggerType ? 'regeneration' : 'generation'}:`,
      error,
    );
  }
}

/**
 * Create and configure file watcher
 */
export function createFileWatcher(
  watchDir: string,
  pluginOptions: ProcessedGLXFOptions,
  onGenerated?: (reason: 'change', paths?: string[]) => void,
): FSWatcher {
  const watcher = chokidar.watch(watchDir, {
    // Ignore dot files and node_modules
    ignored: /(^|[\\/\\])\\../,
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

  // Watch for file changes - simplified unified approach
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
      console.error('🚨 File watcher error:', error);
    })
    .on('ready', () => {
      if (pluginOptions.verbose) {
        console.log('👁️  Meta Spatial file watcher ready');
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
