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
        activation: 'always',
        injectOnBuild: true,
      },
      ai: { screenshotSize: { width: 500, height: 500 } },
      verbose: true,
    }),
    iwsdkExampleAssets({ assetIds: ['environment-desk', 'robot'] }),
  ],
  server: { host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
