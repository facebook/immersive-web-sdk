/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import fs from 'fs-extra';
import type { Plugin, ViteDevServer } from 'vite';
import { regenerateGLXF, createFileWatcher, cleanup } from './file-watcher.js';
import type { GLXFGenerationOptions, ProcessedGLXFOptions } from './types.js';

// Export types
export type { GLXFGenerationOptions } from './types.js';

// Track generation statistics for summary
interface GLXFGenerationStat {
  fileName: string;
  success: boolean;
  format: string[];
  generatedFiles: string[]; // Paths to generated files relative to project root
  referencedGLTFs: string[]; // GLTF files referenced within the GLXF
}

/**
 * Process and normalize plugin options with defaults
 */
function processOptions(
  options: GLXFGenerationOptions = {},
): ProcessedGLXFOptions {
  const os = process.platform;
  var metaSpatialCliPath;

  if (os === 'darwin') {
    metaSpatialCliPath =
      '/Applications/Meta Spatial Editor.app/Contents/MacOS/CLI';
  } else {
    const directoryPath = 'C:\\Program Files\\Meta Spatial Editor\\';
    const files = fs.readdirSync(directoryPath);
    metaSpatialCliPath = directoryPath + files[0] + '\\Resources\\CLI.exe';
  }

  return {
    metaSpatialDir: 'metaspatial',
    outputDir: 'generated/glxf',
    watchDebounceMs: 500,
    formats: ['glxf'] as const,
    metaSpatialCliPath: metaSpatialCliPath,
    verbose: false,
    enableWatcher: true,
    ignorePattern: /components\//,
    ...options,
  };
}

/**
 * Generate initial GLXF files for development
 */
async function generateInitialGLXF(
  pluginOptions: ProcessedGLXFOptions,
): Promise<void> {
  const watchDir = path.resolve(process.cwd(), pluginOptions.metaSpatialDir);

  console.log('🚀 Generating initial GLXF files for dev server...');

  try {
    // Find all .metaspatial files
    if (await fs.pathExists(watchDir)) {
      const files = await fs.readdir(watchDir);
      const metaSpatialFiles = files.filter(
        (file) => path.extname(file) === '.metaspatial',
      );

      if (pluginOptions.verbose) {
        console.log(
          `📋 Found ${metaSpatialFiles.length} Meta Spatial file(s) to process initially`,
        );
      }

      // Process each Meta Spatial file
      for (const file of metaSpatialFiles) {
        if (pluginOptions.verbose) {
          console.log(`🔄 Processing initially: ${file}`);
        }

        try {
          await regenerateGLXF(pluginOptions);
          console.log(`✅ Initial GLXF generated: ${file}`);
        } catch (error) {
          console.error(
            `❌ Failed to generate initial GLXF for ${file}:`,
            error,
          );
        }
      }
    } else if (pluginOptions.verbose) {
      console.log(`⚠️  Meta Spatial directory not found: ${watchDir}`);
    }
  } catch (error) {
    console.error('❌ Error during initial GLXF generation:', error);
  }
}

/**
 * Generate GLXF files during build phase
 */
async function generateBuildGLXF(
  pluginOptions: ProcessedGLXFOptions,
  generationStats: GLXFGenerationStat[],
): Promise<void> {
  if (pluginOptions.verbose) {
    console.log('🚀 Starting GLXF generation build phase...');
  }

  try {
    const metaSpatialDir = path.resolve(
      process.cwd(),
      pluginOptions.metaSpatialDir,
    );

    // Find all .metaspatial files
    if (await fs.pathExists(metaSpatialDir)) {
      const files = await fs.readdir(metaSpatialDir);
      const metaSpatialFiles = files.filter(
        (file) => path.extname(file) === '.metaspatial',
      );

      if (pluginOptions.verbose) {
        console.log(
          `📋 Found ${metaSpatialFiles.length} Meta Spatial file(s) to process`,
        );
      }

      // Process each Meta Spatial file
      for (const file of metaSpatialFiles) {
        if (pluginOptions.verbose) {
          console.log(`🔄 Processing: ${file}`);
        }

        try {
          await regenerateGLXF(pluginOptions);

          // For Meta Spatial projects, the output is typically named after the project
          // Since we regenerate all files at once, we'll track expected outputs
          const outputDir = path.resolve(
            process.cwd(),
            pluginOptions.outputDir,
          );
          const baseName = path.basename(file, '.metaspatial');
          const generatedFiles: string[] = [];

          // Check common output patterns
          const possibleOutputs = [
            path.join(outputDir, `${baseName}.glxf`),
            path.join(outputDir, 'Composition.glxf'), // Common Meta Spatial output
          ];

          for (const outputFile of possibleOutputs) {
            if (await fs.pathExists(outputFile)) {
              generatedFiles.push(path.relative(process.cwd(), outputFile));
            }
          }

          // Parse GLXF files to extract referenced GLTF assets
          const referencedGLTFs: string[] = [];
          for (const glxfFile of generatedFiles) {
            try {
              const glxfPath = path.resolve(process.cwd(), glxfFile);
              const glxfContent = await fs.readJSON(glxfPath);

              if (glxfContent.assets && Array.isArray(glxfContent.assets)) {
                for (const asset of glxfContent.assets) {
                  if (
                    asset.uri &&
                    typeof asset.uri === 'string' &&
                    asset.uri.endsWith('.gltf')
                  ) {
                    // Resolve the URI relative to the GLXF file location
                    const gltfPath = path.resolve(
                      path.dirname(glxfPath),
                      asset.uri,
                    );
                    const relativePath = path.relative(process.cwd(), gltfPath);
                    referencedGLTFs.push(relativePath);
                  }
                }
              }
            } catch (error) {
              if (pluginOptions.verbose) {
                console.warn(
                  `⚠️ Could not parse GLXF file for asset references: ${glxfFile}`,
                  error,
                );
              }
            }
          }

          // Track successful generation
          generationStats.push({
            fileName: file,
            success: true,
            format: [...pluginOptions.formats],
            generatedFiles,
            referencedGLTFs,
          });

          if (pluginOptions.verbose) {
            console.log(`✅ Generated GLXF for: ${file}`);
          }
        } catch (error) {
          // Track failed generation
          generationStats.push({
            fileName: file,
            success: false,
            format: [...pluginOptions.formats],
            generatedFiles: [],
            referencedGLTFs: [],
          });

          console.error(`❌ Failed to generate GLXF for ${file}:`, error);
        }
      }
    } else if (pluginOptions.verbose) {
      console.log(`⚠️  Meta Spatial directory not found: ${metaSpatialDir}`);
    }
  } catch (error) {
    console.error('❌ Error during GLXF build generation:', error);
  }
}

/**
 * Vite plugin for Meta Spatial file watching and GLXF generation
 * Watches Meta Spatial project files and automatically generates GLXF/GLTF assets
 */
export function generateGLXF(options: GLXFGenerationOptions = {}): Plugin {
  const pluginOptions = processOptions(options);
  let watcher: FSWatcher | null = null;
  let config: any;
  let devServer: ViteDevServer | null = null;

  // Track generation statistics for summary
  let generationStats: GLXFGenerationStat[] = [];

  return {
    name: 'generate-glxf',

    configResolved(resolvedConfig) {
      // Store the resolved config to determine dev vs build mode
      config = resolvedConfig;
    },

    async configureServer(_server) {
      if (!pluginOptions.enableWatcher) {
        return;
      }
      devServer = _server;

      const watchDir = path.resolve(
        process.cwd(),
        pluginOptions.metaSpatialDir,
      );

      if (pluginOptions.verbose) {
        console.log(`🔍 Meta Spatial watcher monitoring: ${watchDir}`);
      }

      // Generate GLXF files immediately on dev server start
      await generateInitialGLXF(pluginOptions);

      // Set up file watcher
      watcher = createFileWatcher(watchDir, pluginOptions, () =>
        devServer?.ws.send({ type: 'full-reload' }),
      );

      console.log('👁️  GLXF file watcher started - monitoring for changes...');
    },

    async buildStart() {
      // Only generate GLXF during build, not during dev server
      // config.command is 'serve' for dev, 'build' for production
      if (config.command === 'serve') {
        return;
      }

      // Reset stats for each build
      generationStats = [];
      await generateBuildGLXF(pluginOptions, generationStats);
    },

    buildEnd() {
      // Clean up watcher when build ends
      if (watcher) {
        watcher.close();
        watcher = null;
        cleanup(); // Clear any pending debounced operations
        if (pluginOptions.verbose) {
          console.log('👋 Meta Spatial file watcher closed');
        }
      }
    },

    // Display GLXF generation summary at the very end of build process
    closeBundle: {
      async handler() {
        // Only run during build
        if (config.command === 'serve') {
          return;
        }

        // Display GLXF generation summary (always show, not just in verbose mode)
        if (generationStats.length > 0) {
          const successfulGenerations = generationStats.filter(
            (stat) => stat.success,
          );
          const failedGenerations = generationStats.filter(
            (stat) => !stat.success,
          );

          console.log('\n📦 GLXF Generation Summary:');

          // Show all generated files with their referenced GLTF assets
          successfulGenerations.forEach((stat) => {
            stat.generatedFiles.forEach((glxfFile) => {
              console.log(`  - ${glxfFile}`);

              // Find the referenced GLTFs for this specific GLXF file
              const referencedForThisFile = stat.referencedGLTFs;
              if (referencedForThisFile.length > 0) {
                referencedForThisFile.forEach((gltfFile) => {
                  console.log(`    ↳ ${gltfFile}`);
                });
              }
            });
          });

          if (failedGenerations.length > 0) {
            console.log(
              `  - Failed to generate: ${failedGenerations.length} files`,
            );
            if (pluginOptions.verbose) {
              failedGenerations.forEach((stat) => {
                console.log(`    - ${stat.fileName}`);
              });
            }
          }

          console.log(''); // Extra line for spacing
        }
      },
    },
  };
}
