/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkExampleAssets } from '@iwsdk/example-assets/vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { compileUIKit } from '@iwsdk/vite-plugin-uikitml';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

const useMkcert = process.env.IWSDK_DISABLE_MKCERT !== '1';

export default defineConfig({
  plugins: [
    ...(useMkcert ? [mkcert()] : []),
    iwsdkDev({
      emulator: {
        device: 'metaQuest3',
        activation: 'always',
        injectOnBuild: true,
      },
      ai: { mode: 'agent', screenshotSize: { width: 500, height: 500 } },
      verbose: true,
    }),
    iwsdkExampleAssets({
      assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    }),
    compileUIKit({ sourceDir: 'ui', outputDir: 'public/ui', verbose: true }),
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
