/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { Plugin } from 'vite';
import { CompressionMapper } from './compression-mapper.js';
import { GLTFProcessor } from './gltf-processor.js';
import { PresetManager } from './preset-manager.js';
import type { GLTFOptimizerOptions, AssetInfo } from './types.js';

// Export types for users
export type {
  GLTFOptimizerOptions,
  GeometryOptions,
  TextureOptions,
  GeometryCompression,
  TextureCompressionMode,
  OptimizationLevel,
} from './types.js';

/**
 * Vite plugin for GLTF/GLB optimization during build
 * Intercepts GLTF/GLB files and applies compression using gltf-transform
 */
export function optimizeGLTF(options: GLTFOptimizerOptions = {}): Plugin {
  const processedOptions = PresetManager.processOptions(options);
  PresetManager.validateOptions(processedOptions, processedOptions.verbose);

  let processor: GLTFProcessor;
  let isInitialized = false;
  let config: any;
  let ktxAvailable: boolean | null = null;
  let warnedAboutKTX = false;

  // Track asset dependencies to prevent copying them
  const dependencyFiles = new Set<string>();

  // Track original dependency files that should be deleted after processing
  const originalFilesToCleanup = new Set<string>();

  // Track optimization statistics
  interface OptimizationStat {
    name: string;
    originalTotalSize: number;
    optimizedTotalSize: number;
  }
  const optimizationStats: OptimizationStat[] = [];

  // Shared KTX2 cache across GLTFs in this build. Key: final bundle path.
  const sharedKTXCache = new Map<string, { rank: number; buffer: Buffer }>();

  // Compute simple quality rank; higher = better.
  function computeTextureRank(filename: string): number {
    const { mode, quality } = processedOptions.textures;
    const etcQ = CompressionMapper.toETC1SParams(quality).quality; // 0-255, higher better
    const uastcLevel = CompressionMapper.toUASTCParams(quality).quality; // 0-4, 0 best
    let intended: 'etc1s' | 'uastc' = 'etc1s';
    const name = filename.toLowerCase();
    if (mode === 'uastc') {
      intended = 'uastc';
    } else if (mode === 'etc1s') {
      intended = 'etc1s';
    } else if (mode === 'mixed' || mode === 'auto') {
      if (
        /(normal|roughness|metallic|orm|occlusion|specular|bump|height)/i.test(
          name,
        )
      ) {
        intended = 'uastc';
      } else {
        intended = 'etc1s';
      }
    }
    return intended === 'uastc'
      ? 10000 + (4 - uastcLevel) * 100 + etcQ / 255
      : etcQ;
  }

  /**
   * Find all GLTF/GLB assets in the bundle
   */
  function findGLTFAssets(bundle: any): AssetInfo[] {
    const assets: AssetInfo[] = [];

    for (const [fileName, asset] of Object.entries(bundle)) {
      // Only process assets (not chunks)
      if ((asset as any).type !== 'asset') {
        continue;
      }

      // Check if file matches include pattern and not excluded
      if (!processedOptions.include.test(fileName)) {
        continue;
      }
      if (processedOptions.exclude && processedOptions.exclude.test(fileName)) {
        continue;
      }

      const assetInfo: AssetInfo = {
        fileName,
        source: (asset as any).source,
        isAsset: true,
      };

      assets.push(assetInfo);
    }

    return assets;
  }

  /**
   * Process a single GLTF/GLB asset
   */
  async function processAsset(asset: AssetInfo, bundle: any) {
    const inputBuffer = Buffer.isBuffer(asset.source)
      ? asset.source
      : Buffer.from(asset.source, 'utf8');

    // Process the GLTF/GLB file
    const optimizedBuffer = await processor.processBuffer(
      inputBuffer,
      asset.fileName,
    );

    // Update the bundle with optimized content
    bundle[asset.fileName].source = optimizedBuffer;

    // Extract and track dependency file patterns to prevent them from being copied
    trackDependencyFiles(asset.fileName, inputBuffer);
  }

  /**
   * Track dependency files (textures, bins) that should be handled by gltf-transform
   * and not copied separately to prevent conflicts
   */
  function trackDependencyFiles(gltfFileName: string, gltfBuffer: Buffer) {
    try {
      // Parse GLTF to find dependencies
      let gltfJson: any;

      if (gltfFileName.endsWith('.gltf')) {
        // Parse JSON directly for .gltf files
        gltfJson = JSON.parse(gltfBuffer.toString('utf8'));
      } else if (gltfFileName.endsWith('.glb')) {
        // Extract JSON chunk from GLB for .glb files
        const view = new DataView(gltfBuffer.buffer);
        const jsonChunkLength = view.getUint32(12, true);
        const jsonChunkStart = 20;
        const jsonBytes = gltfBuffer.subarray(
          jsonChunkStart,
          jsonChunkStart + jsonChunkLength,
        );
        gltfJson = JSON.parse(jsonBytes.toString('utf8'));
      } else {
        return; // Unknown format
      }

      const basePath = path.dirname(gltfFileName);

      // Track buffer dependencies (.bin files)
      if (gltfJson.buffers) {
        for (const buffer of gltfJson.buffers) {
          if (buffer.uri && !buffer.uri.startsWith('data:')) {
            const depPath = path.posix.join(basePath, buffer.uri);
            dependencyFiles.add(depPath);
          }
        }
      }

      // Track image dependencies (textures)
      if (gltfJson.images) {
        for (const image of gltfJson.images) {
          if (image.uri && !image.uri.startsWith('data:')) {
            const depPath = path.posix.join(basePath, image.uri);
            dependencyFiles.add(depPath);
          }
        }
      }

      if (processedOptions.verbose && dependencyFiles.size > 0) {
        console.log(
          `   Tracked ${dependencyFiles.size} dependency file(s) for exclusion`,
        );
      }
    } catch (error) {
      // Silently fail dependency tracking - optimization will still work
      if (processedOptions.verbose) {
        console.warn(
          `   Could not track dependencies for ${gltfFileName}:`,
          error,
        );
      }
    }
  }

  return {
    name: 'optimize-gltf',

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (processedOptions.verbose) {
        console.log(PresetManager.getConfigSummary(processedOptions));
      }
    },

    async buildStart() {
      // Only run during build, not dev server
      if (config.command === 'serve') {
        return;
      }

      // Preflight check for KTX-Software (ktx) CLI; degrade gracefully if missing.
      if (ktxAvailable === null) {
        ktxAvailable = await checkKTXAvailable();
        if (!ktxAvailable) {
          if (!warnedAboutKTX) {
            console.warn(
              '\n⚠️  KTX-Software not found (missing "ktx" CLI). Skipping KTX2 compression.' +
                '\n   Install from: https://github.com/KhronosGroup/KTX-Software/releases\n',
            );
            warnedAboutKTX = true;
          }
          // Force non-KTX mode so texture pipeline still runs (resize/standard compression only).
          processedOptions.textures.mode = 'manual';
        }
      }

      // Initialize processor
      if (!isInitialized) {
        processor = new GLTFProcessor(processedOptions);
        await processor.initialize();
        isInitialized = true;

        if (processedOptions.verbose) {
          console.log('🚀 GLTF Optimizer initialized');
        }
      }
    },

    generateBundle: {
      // Run late in the process to catch all assets
      order: 'post',
      async handler(_, bundle) {
        // Only run during build
        if (config.command === 'serve') {
          return;
        }

        // Process bundled GLTF assets first
        const gltfAssets = findGLTFAssets(bundle);

        if (gltfAssets.length > 0) {
          if (processedOptions.verbose) {
            console.log(
              `📋 Found ${gltfAssets.length} bundled GLTF/GLB file(s) to optimize`,
            );
          }

          // Process each GLTF/GLB file
          for (const asset of gltfAssets) {
            try {
              await processAsset(asset, bundle);
            } catch (error) {
              console.error(`❌ Failed to optimize ${asset.fileName}:`, error);
              // Continue with other assets
            }
          }

          if (processedOptions.verbose) {
            console.log('✅ Bundled GLTF optimization completed');
          }
        }

        // Process public folder GLTF files and emit them to bundle
        await processPublicSourceGLTFFiles(bundle);
      },
    },

    // Clean up original dependency files after build
    writeBundle: {
      order: 'post',
      async handler(options) {
        // Only run during build
        if (config.command === 'serve') {
          return;
        }

        await cleanupOriginalDependencies(options.dir || 'dist');
      },
    },

    // Display optimization summary at the absolute end of the build process
    closeBundle: {
      async handler() {
        // Only run during build
        if (config.command === 'serve') {
          return;
        }

        // Display optimization statistics summary at the very end (always show, not just in verbose mode)
        if (optimizationStats.length > 0) {
          console.log('\n🎯 GLTF Optimization Summary:');

          let totalOriginalSize = 0;
          let totalOptimizedSize = 0;

          for (const stat of optimizationStats) {
            const savings =
              stat.originalTotalSize > 0
                ? (
                    ((stat.originalTotalSize - stat.optimizedTotalSize) /
                      stat.originalTotalSize) *
                    100
                  ).toFixed(1)
                : '0.0';

            console.log(
              `  - ${stat.name}: ${(stat.originalTotalSize / 1024).toFixed(1)}KB → ${(stat.optimizedTotalSize / 1024).toFixed(1)}KB (${savings}% reduction)`,
            );

            totalOriginalSize += stat.originalTotalSize;
            totalOptimizedSize += stat.optimizedTotalSize;
          }

          if (optimizationStats.length > 1) {
            const totalSavings =
              totalOriginalSize > 0
                ? (
                    ((totalOriginalSize - totalOptimizedSize) /
                      totalOriginalSize) *
                    100
                  ).toFixed(1)
                : '0.0';

            console.log(
              `  📊 Total: ${(totalOriginalSize / 1024).toFixed(1)}KB → ${(totalOptimizedSize / 1024).toFixed(1)}KB (${totalSavings}% reduction)`,
            );
          }
          console.log(''); // Extra line for spacing
        }
      },
    },

    resolveId(id: string) {
      // Check if this file is a tracked dependency
      const normalizedId = path.posix.normalize(id);

      if (
        dependencyFiles.has(normalizedId) ||
        Array.from(dependencyFiles).some((dep) => normalizedId.endsWith(dep))
      ) {
        if (processedOptions.verbose) {
          console.log(`   Blocking dependency file: ${normalizedId}`);
        }

        // Return a virtual module to prevent the file from being processed
        return `virtual:gltf-dependency:${normalizedId}`;
      }

      return null;
    },

    load(id: string) {
      // Handle virtual dependency modules
      if (id.startsWith('virtual:gltf-dependency:')) {
        if (processedOptions.verbose) {
          const originalId = id.replace('virtual:gltf-dependency:', '');
          console.log(`   Skipping GLTF dependency: ${originalId}`);
        }
        return '// GLTF dependency file - handled by gltf-transform';
      }
      return null;
    },
  };

  /**
   * Checks whether the KTX-Software CLI ("ktx") is available on PATH.
   */
  function checkKTXAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const child = execFile(
          'ktx',
          ['--version'],
          { timeout: 4000 },
          (err) => {
            resolve(!err);
          },
        );
        child.on('error', () => resolve(false));
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Find all original dependency files for a GLTF file
   */
  async function findOriginalDependencies(gltfPath: string): Promise<string[]> {
    try {
      const gltfBuffer = await fs.readFile(gltfPath);
      const gltfDir = path.dirname(gltfPath);
      const dependencies: string[] = [];

      // Parse GLTF to find dependencies
      let gltfJson: any;

      if (gltfPath.endsWith('.gltf')) {
        // Parse JSON directly for .gltf files
        gltfJson = JSON.parse(gltfBuffer.toString('utf8'));
      } else if (gltfPath.endsWith('.glb')) {
        // Extract JSON chunk from GLB for .glb files
        const view = new DataView(gltfBuffer.buffer);
        const jsonChunkLength = view.getUint32(12, true);
        const jsonChunkStart = 20;
        const jsonBytes = gltfBuffer.subarray(
          jsonChunkStart,
          jsonChunkStart + jsonChunkLength,
        );
        gltfJson = JSON.parse(jsonBytes.toString('utf8'));
      } else {
        return dependencies; // Unknown format
      }

      // Find buffer dependencies (.bin files)
      if (gltfJson.buffers) {
        for (const buffer of gltfJson.buffers) {
          if (buffer.uri && !buffer.uri.startsWith('data:')) {
            const depPath = path.resolve(gltfDir, buffer.uri);
            dependencies.push(depPath);
          }
        }
      }

      // Find image dependencies (textures)
      if (gltfJson.images) {
        for (const image of gltfJson.images) {
          if (image.uri && !image.uri.startsWith('data:')) {
            const depPath = path.resolve(gltfDir, image.uri);
            dependencies.push(depPath);
          }
        }
      }

      return dependencies;
    } catch (_) {
      // Silently fail dependency finding - optimization will still work
      return [];
    }
  }

  /**
   * Process GLTF files from public folder source and emit to bundle
   */
  async function processPublicSourceGLTFFiles(bundle: any) {
    try {
      const publicDir = config.publicDir || 'public';
      const gltfPattern = path
        .join(publicDir, '**/gltf/**/*.{gltf,glb}')
        .replace(/\\/g, '/');
      const sourceGltfFiles = await glob(gltfPattern, {
        ignore: ['**/node_modules/**'],
        absolute: true,
      });

      if (sourceGltfFiles.length === 0) {
        if (processedOptions.verbose) {
          console.log('📋 No public/gltf source files found to process');
        }
        return;
      }

      if (processedOptions.verbose) {
        console.log(
          `📋 Found ${sourceGltfFiles.length} public/gltf source file(s) to process`,
        );
      }

      // Process each source GLTF/GLB file and emit to bundle
      for (const filePath of sourceGltfFiles) {
        try {
          await processPublicSourceGLTFFile(filePath, bundle);
        } catch (error) {
          console.error(
            `❌ Failed to process public source GLTF ${filePath}:`,
            error,
          );
          // Continue with other files
        }
      }

      if (processedOptions.verbose) {
        console.log('✅ Public source GLTF processing completed');
      }
    } catch (error) {
      console.error('❌ Error processing public source GLTF assets:', error);
    }
  }

  /**
   * Process a single public source GLTF file and emit to bundle
   */
  async function processPublicSourceGLTFFile(filePath: string, bundle: any) {
    if (processedOptions.verbose) {
      console.log(
        `🔄 Processing public source GLTF: ${path.basename(filePath)}`,
      );
    }

    try {
      const publicDir = config.publicDir || 'public';
      const relativePath = path
        .relative(publicDir, filePath)
        .replace(/\\/g, '/');
      const gltfName = path.basename(filePath);

      // Calculate original total size (GLTF + all dependencies)
      const inputBuffer = await fs.readFile(filePath);
      let originalTotalSize = inputBuffer.length;

      // Find and measure all original dependency files
      const originalDependencies = await findOriginalDependencies(filePath);
      // Track original image dependencies locally; we'll only schedule cleanup if KTX2 was emitted
      const originalImageDeps: string[] = [];
      for (const depPath of originalDependencies) {
        try {
          const depBuffer = await fs.readFile(depPath);
          originalTotalSize += depBuffer.length;

          // Keep a list of original image files; only delete later if we emitted KTX2
          if (/\.(png|jpg|jpeg)$/i.test(depPath)) {
            const relativeDepPath = path
              .relative(publicDir, depPath)
              .replace(/\\/g, '/');
            originalImageDeps.push(relativeDepPath);
          }
        } catch (_) {
          // Dependency file might not exist, skip
        }
      }

      if (processedOptions.verbose) {
        console.log(
          `   📋 Original total size: ${(originalTotalSize / 1024).toFixed(1)}KB`,
        );
        console.log(`   🔄 Processing with gltf-transform...`);
      }

      // Process with gltf-transform and get both buffer and resources
      const result = await processor.processFile(filePath, true);
      let optimizedBuffer = result.buffer;
      let resources = result.resources;

      // Detect if any KTX2 textures were emitted for this GLTF
      const ktx2Emitted = Object.keys(resources).some((uri) =>
        uri.toLowerCase().endsWith('.ktx2'),
      );

      // Adjust external resources: always namespace .bin; only rewrite images to KTX2 when such textures were emitted
      // Only applies to .gltf JSON (GLB uses embedded resources)
      const isGLTFJson = gltfName.toLowerCase().endsWith('.gltf');
      if (isGLTFJson) {
        const baseName = path.basename(gltfName, path.extname(gltfName));
        const binPrefix = `${baseName}_bin/`;

        try {
          const json = JSON.parse(optimizedBuffer.toString('utf8'));

          // Prefix buffer URIs (namespace .bin only)
          if (Array.isArray(json.buffers)) {
            for (const buf of json.buffers) {
              if (
                buf.uri &&
                typeof buf.uri === 'string' &&
                !buf.uri.startsWith('data:')
              ) {
                buf.uri = binPrefix + buf.uri.replace(/^\.\//, '');
              }
            }
          }

          // Only rewrite image URIs to flat .ktx2 basenames if KTX2 textures were actually emitted.
          if (ktx2Emitted && Array.isArray(json.images)) {
            for (const img of json.images) {
              if (
                img.uri &&
                typeof img.uri === 'string' &&
                !img.uri.startsWith('data:')
              ) {
                const b = path.posix
                  .basename(img.uri)
                  .replace(/\.[^.]+$/i, '')
                  .concat('.ktx2');
                img.uri = b;
              }
            }
          }

          optimizedBuffer = Buffer.from(JSON.stringify(json));

          // Remap resources:
          // - Always namespace .bin under <basename>_bin/
          // - If KTX2 was emitted, flatten .ktx2 next to the .gltf and namespace any non-ktx2 leftovers
          // - If no KTX2, keep non-.bin resources at their original URIs
          const remapped: Record<string, Buffer> = {} as any;
          for (const [uri, buf] of Object.entries(resources)) {
            const bare = uri.replace(/^\.\//, '');
            const lower = bare.toLowerCase();
            if (lower.endsWith('.bin')) {
              const newUri = binPrefix + bare;
              remapped[newUri] = buf as Buffer;
            } else if (lower.endsWith('.ktx2')) {
              const outName = path.posix.basename(bare);
              remapped[outName] = buf as Buffer;
            } else if (ktx2Emitted) {
              const newUri = binPrefix + bare;
              remapped[newUri] = buf as Buffer;
            } else {
              remapped[bare] = buf as Buffer;
            }
          }
          resources = remapped;
        } catch (e) {
          // If JSON parse fails, skip namespacing to avoid corrupting output
          if (processedOptions.verbose) {
            console.warn(
              `   ⚠️ Failed to namespace resources for ${gltfName}:`,
              (e as Error).message,
            );
          }
        }
      }

      // Calculate optimized total size (GLTF + all optimized resources)
      let optimizedTotalSize = optimizedBuffer.length;
      for (const resourceBuffer of Object.values(resources)) {
        optimizedTotalSize += (resourceBuffer as Buffer).length;
      }

      // Store optimization statistics
      optimizationStats.push({
        name: gltfName,
        originalTotalSize,
        optimizedTotalSize,
      });

      if (processedOptions.verbose) {
        const savings =
          originalTotalSize > 0
            ? (
                ((originalTotalSize - optimizedTotalSize) / originalTotalSize) *
                100
              ).toFixed(1)
            : '0.0';
        console.log(`   💾 Emitting to bundle: ${relativePath}`);
        console.log(
          `✅ ${gltfName}: ${(originalTotalSize / 1024).toFixed(1)}KB → ${(optimizedTotalSize / 1024).toFixed(1)}KB (${savings}% reduction)`,
        );
      }

      // Emit the optimized GLTF file to the bundle
      bundle[relativePath] = {
        fileName: relativePath,
        source: optimizedBuffer,
        type: 'asset',
        name: path.basename(filePath),
      };

      // Emit all external resources (textures, buffers) to the bundle
      const resourceDir = path.dirname(relativePath);
      for (const [uri, resourceBuffer] of Object.entries(resources)) {
        const resourcePath = path.posix.join(resourceDir, uri);
        const isKTX2 = uri.toLowerCase().endsWith('.ktx2');

        if (isKTX2) {
          const rank = computeTextureRank(uri);
          const cached = sharedKTXCache.get(resourcePath);
          if (!cached || rank > cached.rank) {
            sharedKTXCache.set(resourcePath, {
              rank,
              buffer: resourceBuffer as Buffer,
            });
            bundle[resourcePath] = {
              fileName: resourcePath,
              source: resourceBuffer,
              type: 'asset',
              name: uri,
            };
            if (processedOptions.verbose) {
              console.log(
                `   📎 Emitted/updated KTX2: ${resourcePath} (rank ${rank})`,
              );
            }
          } else if (processedOptions.verbose) {
            console.log(
              `   🔁 Reused existing KTX2: ${resourcePath} (kept rank ${cached.rank}, new ${rank})`,
            );
          }
        } else {
          bundle[resourcePath] = {
            fileName: resourcePath,
            source: resourceBuffer,
            type: 'asset',
            name: uri,
          };
          if (processedOptions.verbose) {
            console.log(`   📎 Emitted resource to bundle: ${resourcePath}`);
          }
        }
      }

      // Only schedule deletion of original images if we actually emitted KTX2 textures
      if (ktx2Emitted && originalImageDeps.length > 0) {
        for (const rel of originalImageDeps) {
          originalFilesToCleanup.add(rel);
        }
      }
    } catch (error) {
      console.error(
        `❌ Detailed error processing source GLTF ${filePath}:`,
        error,
      );
      const err = error as Error;
      console.error(`   Error type: ${err.constructor.name}`);
      console.error(`   Error message: ${err.message}`);
      if (err.stack) {
        console.error(`   Stack trace: ${err.stack}`);
      }
      throw error;
    }
  }

  /**
   * Clean up original dependency files from the output directory
   * This removes PNG/JPG files that have been replaced with KTX2
   * and .bin files that have been replaced/optimized during processing
   */
  async function cleanupOriginalDependencies(outputDir: string) {
    if (originalFilesToCleanup.size === 0) {
      return;
    }

    try {
      if (processedOptions.verbose) {
        console.log(
          `🗑️  Cleaning up ${originalFilesToCleanup.size} original dependency file(s)`,
        );
      }

      for (const relativeFilePath of originalFilesToCleanup) {
        const filePath = path.resolve(outputDir, relativeFilePath);

        try {
          await fs.unlink(filePath);
          if (processedOptions.verbose) {
            console.log(`   🗑️  Deleted: ${relativeFilePath}`);
          }
        } catch (_) {
          // File might not exist or be locked, skip silently
          if (processedOptions.verbose) {
            console.log(`   ⚠️  Could not delete: ${relativeFilePath}`);
          }
        }
      }
    } catch (error) {
      if (processedOptions.verbose) {
        console.warn('⚠️  Error during dependency cleanup:', error);
      }
    }
  }
}
