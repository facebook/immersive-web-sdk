/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkExampleAssets } from '@iwsdk/example-assets/vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    iwsdkDev({
      assetManifest: './src/assets.ts',
      componentManifest: './src/components.ts',
      emulator: {
        device: 'metaQuest3',
        /* @template:if mode='ar' */
        environment: 'living_room',
        /* @template:end */
        /* @template:if mode='browser' */
        // Browser starters exercise IWSDK's native non-XR input path. The
        // managed editor uses its own command bridge and does not require IWER.
        iwer: false,
        /* @template:else */
        // IWER is injected during `dev` by default. Real headset browsers are
        // skipped automatically.
        iwer: true,
        /* @template:end */
      },
      /* @template:if mode='browser' */
      workspace: { enabled: true },
      /* @template:else */
      ai: {},
      /* @template:end */
      verbose: true,
    }),
    iwsdkExampleAssets({
      assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    }),
  ],
  // The IWSDK plugin launches the configured managed browser. Disable Vite's
  // independent opener so it does not create a second unmanaged tab.
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
