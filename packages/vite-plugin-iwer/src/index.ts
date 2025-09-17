/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Plugin } from 'vite';
import { buildInjectionBundle } from './injection-bundler.js';
import type {
  IWERPluginOptions,
  ProcessedIWEROptions,
  InjectionBundleResult,
} from './types.js';

// Export types for users
export type { IWERPluginOptions, SEMOptions } from './types.js';

/**
 * Process and normalize plugin options with defaults
 */
function processOptions(options: IWERPluginOptions = {}): ProcessedIWEROptions {
  const processed: ProcessedIWEROptions = {
    device: options.device || 'metaQuest3',
    injectOnBuild: options.injectOnBuild || false,
    activation: options.activation || 'localhost',
    verbose: options.verbose || false,
    userAgentException:
      options.userAgentException || new RegExp('OculusBrowser'),
  };

  // Process SEM options if provided
  if (options.sem) {
    processed.sem = {
      defaultScene: options.sem.defaultScene || 'living_room',
    };
  }

  return processed;
}

/**
 * Vite plugin for IWER (Immersive Web Emulation Runtime) injection
 * Injects WebXR emulation runtime during development and optionally during build
 */
export function injectIWER(options: IWERPluginOptions = {}): Plugin {
  const pluginOptions = processOptions(options);
  let injectionBundle: InjectionBundleResult | null = null;
  let config: any;
  const VIRTUAL_ID = '/@iwer-injection-runtime';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'inject-iwer',

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (pluginOptions.verbose) {
        console.log('🔧 IWER Plugin Configuration:');
        console.log(`  - Device: ${pluginOptions.device}`);
        console.log(
          `  - SEM: ${pluginOptions.sem ? 'enabled (' + pluginOptions.sem.defaultScene + ')' : 'disabled'}`,
        );
        console.log(`  - Activation: ${pluginOptions.activation}`);
        if (pluginOptions.userAgentException) {
          console.log('  - UA exception: enabled');
        }
        console.log(`  - Inject on build: ${pluginOptions.injectOnBuild}`);
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!injectionBundle) {
          return 'console.warn("[IWER Plugin] Runtime not available - injection bundle not loaded");';
        }
        return injectionBundle.code;
      }
    },

    async buildStart() {
      // Determine if we should generate injection script
      const shouldInject =
        config.command === 'serve' ||
        (config.command === 'build' && pluginOptions.injectOnBuild);

      if (!shouldInject) {
        if (pluginOptions.verbose && config.command === 'build') {
          console.log(
            '⏭️  IWER Plugin: Skipping build injection (injectOnBuild: false)',
          );
        }
        return;
      }

      try {
        if (pluginOptions.verbose) {
          console.log(
            '🚀 IWER Plugin: Starting injection bundle generation...',
          );
        }

        injectionBundle = await buildInjectionBundle(pluginOptions);

        if (pluginOptions.verbose) {
          console.log('✅ IWER Plugin: Injection bundle ready');
        }
      } catch (error) {
        console.error(
          '❌ IWER Plugin: Failed to generate injection bundle:',
          error,
        );
        // Continue without injection rather than failing the build
      }
    },

    transformIndexHtml: {
      order: 'pre', // Run before other HTML transformations
      handler(html) {
        // Check if we should inject
        const shouldInject =
          config.command === 'serve' ||
          (config.command === 'build' && pluginOptions.injectOnBuild);

        if (!shouldInject || !injectionBundle) {
          return html;
        }

        if (pluginOptions.verbose) {
          console.log('💉 IWER Plugin: Injecting runtime script into HTML');
        }

        // Inject the script using Vite's tag API for robustness
        return {
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module', src: VIRTUAL_ID },
              injectTo: 'head',
            },
          ],
        } as any;
      },
    },

    // Display summary at the end of build process
    closeBundle: {
      order: 'post',
      async handler() {
        // Only show summary when injection actually happened
        const shouldInject =
          config.command === 'serve' ||
          (config.command === 'build' && pluginOptions.injectOnBuild);

        if (shouldInject && injectionBundle) {
          const mode = config.command === 'serve' ? 'Development' : 'Build';
          console.log(`\n🥽 IWER Plugin Summary (${mode}):`);
          console.log(`  - Device: ${pluginOptions.device}`);
          console.log(
            `  - Runtime injected: ${(injectionBundle.size / 1024).toFixed(1)}KB`,
          );
          console.log(`  - Activation mode: ${pluginOptions.activation}`);

          if (pluginOptions.sem) {
            console.log(
              `  - SEM environment: ${pluginOptions.sem.defaultScene}`,
            );
          }

          if (pluginOptions.activation === 'localhost') {
            console.log(
              '  - Note: Runtime only activates on localhost/local networks',
            );
          }

          console.log(''); // Extra line for spacing
        }
      },
    },
  };
}
