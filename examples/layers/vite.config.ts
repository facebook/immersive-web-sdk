/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [
    mkcert(),
    iwsdkDev({
      emulator: {
        device: 'metaQuest3',
        activation: 'always',
        injectOnBuild: true,
      },
      ai: { screenshotSize: { width: 500, height: 500 } },
      verbose: true,
    }),
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
