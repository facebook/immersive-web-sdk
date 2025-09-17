/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import fs from 'fs-extra';
import type { Plugin } from 'vite';
import { parseComponentsFromCode } from './component-parser.js';
import type {
  ComponentMetadata,
  EnumDefinition,
  PluginOptions,
} from './types.js';
import {
  generateXMLFiles,
  generateIncrementalCustomXML,
} from './xml-generator.js';

export interface ComponentDiscoveryOptions {
  /**
   * Output directory for generated XML files
   * @default 'generated/components'
   */
  outputDir?: string;

  /**
   * File pattern to include
   * @default /\.(js|ts|jsx|tsx)$/
   */
  include?: RegExp;

  /**
   * File pattern to exclude
   * @default /node_modules/
   */
  exclude?: RegExp;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;

  /**
   * Clean output directory before generating new files
   * @default true
   */
  clean?: boolean;

  /**
   * Additional node_modules packages to scan (advanced)
   * Most users won't need this - only specify if you have framework
   * components in specific packages that should be included despite
   * being in node_modules
   * @default ['@iwsdk']
   */
  scanPackages?: string[];

  /**
   * Include XML declaration header in generated files
   * @default false
   */
  includeXmlDeclaration?: boolean;

  /** Enable dev watcher for incremental updates (serve mode) */
  enableWatcher?: boolean;
  /** Debounce delay (ms) for dev watcher */
  watchDebounceMs?: number;
}

/**
 * Vite plugin for ECS component discovery and XML generation
 * Discovers framework components and generates XML definitions for Meta Spatial SDK integration
 */
export function discoverComponents(
  options: ComponentDiscoveryOptions = {},
): Plugin {
  const pluginOptions: PluginOptions = {
    outputDir: 'generated/components',
    include: /\.(js|ts|jsx|tsx)$/,
    exclude: /node_modules/,
    verbose: false,
    clean: true,
    scanPackages: ['@iwsdk'],
    includeXmlDeclaration: false,
    ...options,
  };

  let discoveredComponents: ComponentMetadata[] = [];
  let discoveredEnums = new Map<string, EnumDefinition>();
  let hasEmitted = false;
  let config: any;
  let watcher: FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  return {
    name: 'discover-components',

    configResolved(resolvedConfig) {
      // Store the resolved config to determine dev vs build mode
      config = resolvedConfig;
    },

    async configureServer(_server) {
      const enableWatcher = options.enableWatcher ?? true;
      const watchDebounceMs = options.watchDebounceMs ?? 500;
      if (!enableWatcher) {
        return;
      }

      // Initial full scan on dev start (includes framework packages)
      await runFullScanDev(pluginOptions, config);

      // Watch project files only (exclude node_modules and generated outputDir) for incremental updates
      const watchRoot = path.resolve(process.cwd(), config.root || '.');
      const outAbs = path.resolve(process.cwd(), pluginOptions.outputDir);
      const isIgnored = (fp: string) => {
        const abs = path.resolve(fp);
        if (abs.startsWith(outAbs)) {
          return true;
        } // ignore generated XML output
        if (abs.includes(`${path.sep}node_modules${path.sep}`)) {
          return true;
        }
        // ignore dotfiles by filename
        if (path.basename(abs).startsWith('.')) {
          return true;
        }
        return false;
      };
      watcher = chokidar.watch(watchRoot, {
        ignored: isIgnored,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

      const schedule = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
          debounceTimer = null;
          try {
            await runIncrementalCustomScanDev(pluginOptions, config);
          } catch (e) {
            console.error('❌ Component incremental discovery failed:', e);
          }
        }, watchDebounceMs);
      };

      const onFileEvent = (file: string) => {
        // Filter by include pattern and ignore lists
        if (isIgnored(file)) {
          return;
        }
        if (!pluginOptions.include.test(file)) {
          return;
        }
        schedule();
      };
      watcher
        .on('add', onFileEvent)
        .on('change', onFileEvent)
        .on('unlink', onFileEvent);
      console.log('👁️  Component discovery watcher started');
    },

    buildStart() {
      // Only process during build, not during dev server
      // config.command is 'serve' for dev, 'build' for production
      if (config.command === 'serve') {
        return;
      }

      // Reset for each build
      discoveredComponents = [];
      discoveredEnums.clear();
      hasEmitted = false;
    },

    transform(code: string, id: string) {
      // Only process during build, not during dev server
      // config.command is 'serve' for dev, 'build' for production
      if (config.command === 'serve') {
        return;
      }

      // Process modules during transform phase with error handling
      try {
        if (shouldProcessModule(id, pluginOptions)) {
          const components = parseComponentsFromCode(
            code,
            id,
            discoveredEnums,
            pluginOptions,
          );

          // Validate discovered components before adding
          const validComponents = components.filter((component) => {
            if (!component || !component.exportName) {
              if (pluginOptions.verbose) {
                console.warn(`Invalid component discovered in ${id}`);
              }
              return false;
            }
            return true;
          });

          const srcType = isFrameworkPackage(id, pluginOptions)
            ? 'framework'
            : 'custom';
          validComponents.forEach((c) => (c.source = srcType));
          discoveredComponents.push(...validComponents);
        }
      } catch (error) {
        if (pluginOptions.verbose) {
          console.warn(
            `Failed to process module ${id}:`,
            (error as Error).message,
          );
        }
        // Continue processing other modules instead of failing the build
      }
      return null; // Don't transform the code
    },

    buildEnd() {
      // Only process during build, not during dev server
      // config.command is 'serve' for dev, 'build' for production
      if (config.command === 'serve') {
        return;
      }

      if (!hasEmitted) {
        try {
          if (pluginOptions.verbose) {
            console.log(
              `Final component count: ${discoveredComponents.length}`,
            );
          }

          generateXMLFiles(
            discoveredComponents,
            discoveredEnums,
            pluginOptions,
          );
          hasEmitted = true;
        } catch (error) {
          console.error(
            `❌ Failed to generate XML files:`,
            (error as Error).message,
          );
          // Reset state for next build attempt
          discoveredComponents = [];
          discoveredEnums.clear();
          hasEmitted = false;
        }
      }
    },

    // Display component discovery summary at the very end of build process
    closeBundle: {
      async handler() {
        // Only run during build
        if (config.command === 'serve') {
          return;
        }

        // Display component discovery summary (always show, not just in verbose mode)
        if (discoveredComponents.length > 0) {
          console.log('\n🔍 Component Discovery Summary:');
          console.log(
            `  - Discovered ${discoveredComponents.length} components`,
          );
          console.log(`  - Generated XML files in ${pluginOptions.outputDir}/`);

          if (discoveredEnums.size > 0) {
            console.log(
              `  - Discovered ${discoveredEnums.size} enum definitions`,
            );
          }

          // Show detailed component breakdown only in verbose mode
          if (pluginOptions.verbose) {
            console.log('  - Components by source file:');
            discoveredComponents.forEach((comp) => {
              // Get relative path from project root
              const relativePath = path.relative(config.root, comp.file);
              console.log(`    ${comp.exportName}: ${relativePath}`);
            });
          }
          console.log(''); // Extra line for spacing
        }
      },
    },
  };
}

function shouldProcessModule(id: string, options: PluginOptions): boolean {
  // Input validation
  if (!id || typeof id !== 'string') {
    if (options.verbose) {
      console.warn(`Invalid module id provided: ${id}`);
    }
    return false;
  }

  // Security check: prevent path traversal attacks
  const normalizedId = path.normalize(id);
  if (normalizedId.includes('..')) {
    console.warn(`Suspicious path detected, rejecting: ${id}`);
    return false;
  }

  // Always allow framework packages even if they're in node_modules
  if (isFrameworkPackage(normalizedId, options)) {
    return options.include.test(normalizedId);
  }

  // Apply normal exclude/include logic for other files
  if (options.exclude.test(normalizedId)) {
    return false;
  }
  if (!options.include.test(normalizedId)) {
    return false;
  }

  return true;
}

function isFrameworkPackage(id: string, options: PluginOptions): boolean {
  // Input validation
  if (!id || typeof id !== 'string') {
    return false;
  }
  if (!options.scanPackages || !Array.isArray(options.scanPackages)) {
    return false;
  }

  // Security check: ensure package names are safe
  return options.scanPackages.some((pkg) => {
    if (!pkg || typeof pkg !== 'string') {
      return false;
    }
    if (pkg.includes('..') || pkg.includes('/')) {
      return false;
    }
    const pattern = `node_modules/${pkg}/`;
    return id.includes(pattern);
  });
}

// -------- Dev scanning helpers ---------
async function runFullScanDev(pluginOptions: PluginOptions, config: any) {
  try {
    const { components, enums } = await scanSources(
      config.root || process.cwd(),
      pluginOptions,
      /*includeFramework*/ true,
    );
    await generateXMLFiles(components, enums, {
      ...pluginOptions,
      clean: true,
    } as any);
    console.log('✅ Initial component XML generated');
  } catch (e) {
    console.error('❌ Initial component discovery failed:', e);
  }
}

async function runIncrementalCustomScanDev(
  pluginOptions: PluginOptions,
  config: any,
) {
  const { components, enums } = await scanSources(
    config.root || process.cwd(),
    pluginOptions,
    /*includeFramework*/ false,
  );
  const customComponents = components.filter((c) => c.source !== 'framework');
  await generateIncrementalCustomXML(customComponents, enums, pluginOptions);
}

async function scanSources(
  rootDir: string,
  pluginOptions: PluginOptions,
  includeFramework: boolean,
) {
  const components: ComponentMetadata[] = [];
  const enums = new Map<string, EnumDefinition>();

  // Walk project files (exclude node_modules)
  await walkDir(rootDir, async (file) => {
    if (pluginOptions.exclude.test(file)) {
      return;
    }
    if (!pluginOptions.include.test(file)) {
      return;
    }
    const code = await fs.readFile(file, 'utf8').catch(() => null as any);
    if (!code) {
      return;
    }
    const parsed = parseComponentsFromCode(code, file, enums, pluginOptions);
    parsed.forEach((c) => (c.source = 'custom'));
    components.push(...parsed);
  });

  // Optionally include framework packages under node_modules/<scanPackages>
  if (includeFramework && pluginOptions.scanPackages?.length) {
    for (const pkg of pluginOptions.scanPackages) {
      const pkgDir = path.resolve(process.cwd(), 'node_modules', pkg);
      if (!(await fs.pathExists(pkgDir))) {
        continue;
      }
      await walkDir(pkgDir, async (file) => {
        if (!pluginOptions.include.test(file)) {
          return;
        }
        const code = await fs.readFile(file, 'utf8').catch(() => null as any);
        if (!code) {
          return;
        }
        const parsed = parseComponentsFromCode(
          code,
          file,
          enums,
          pluginOptions,
        );
        parsed.forEach((c) => (c.source = 'framework'));
        components.push(...parsed);
      });
    }
  }

  return { components, enums };
}

async function walkDir(
  dir: string,
  onFile: (filePath: string) => Promise<void>,
) {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (entry === 'node_modules') {
      continue;
    } // skip in project tree
    // Skip known generated components locations to avoid loops
    if (
      (entry === 'metaspatial' &&
        (await fs.pathExists(path.join(full, 'components')))) ||
      (entry === 'generated' &&
        (await fs.pathExists(path.join(full, 'components'))))
    ) {
      continue;
    }
    const stat = await fs.stat(full).catch(() => null as any);
    if (!stat) {
      continue;
    }
    if (stat.isDirectory()) {
      await walkDir(full, onFile);
    } else if (stat.isFile()) {
      await onFile(full);
    }
  }
}
