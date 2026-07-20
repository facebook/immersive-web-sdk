/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { access, readFile } from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ProcessedDevOptions, InjectionBundleResult } from './types.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and customize the pre-built injection bundle
 */
export async function buildInjectionBundle(
  options: ProcessedDevOptions,
): Promise<InjectionBundleResult> {
  try {
    if (options.verbose) {
      console.log('🔄 Loading pre-built IWSDK injection bundle...');
    }

    // Load the pre-built injection bundle. Source-mode tests import this file
    // from `src/`, while published builds import it from `dist/`.
    const bundlePath = await resolveInjectionBundlePath();
    let bundleCode = await readFile(bundlePath, 'utf8');

    // Create the configuration object to inject
    const config = {
      device: options.device,
      activation:
        options.activation instanceof RegExp
          ? `/${options.activation.source}/`
          : options.activation,
      verbose: options.verbose,
      sem: options.sem || null,
      ai: options.ai || null,
      userAgentException:
        options.userAgentException instanceof RegExp
          ? `/${options.userAgentException.source}/`
          : options.userAgentException,
      iwer: options.iwer,
    };

    // Replace the CONFIG token with actual configuration
    const configReplacement = JSON.stringify(config, null, 2);
    bundleCode = bundleCode.replace(
      '"__IWSDK_DEV_CONFIG__"',
      configReplacement,
    );

    const size = Buffer.byteLength(bundleCode, 'utf8');

    if (options.verbose) {
      console.log(
        `✅ IWSDK injection bundle loaded and configured (${(size / 1024).toFixed(1)}KB)`,
      );
    }

    return { code: bundleCode, size };
  } catch (error) {
    console.error('❌ Failed to load IWSDK injection bundle:', error);
    console.error(
      'Make sure to run "pnpm build:injection" first to create the pre-built bundle.',
    );
    throw error;
  }
}

async function resolveInjectionBundlePath(): Promise<string> {
  const candidates = [
    path.resolve(__dirname, 'injection-bundle.js'),
    path.resolve(__dirname, '..', 'dist', 'injection-bundle.js'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next source/build layout.
    }
  }

  return candidates[0];
}
