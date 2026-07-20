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
        /* @template:if mode='ar' */
        environment: 'living_room',
        /* @template:end */
        // The IWER WebXR emulator is injected during `dev` by default (real
        // headset browsers like OculusBrowser are skipped automatically). Set
        // `iwer: false` to disable it and use only native WebXR.
        iwer: true,
      },
      ai: { mode: 'agent' },
      verbose: true,
    }),
    iwsdkExampleAssets({
      assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    }),
    compileUIKit({ sourceDir: 'ui', outputDir: 'public/ui', verbose: true }),
  ],
  server: { host: '0.0.0.0', port: 8081, open: true },
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
