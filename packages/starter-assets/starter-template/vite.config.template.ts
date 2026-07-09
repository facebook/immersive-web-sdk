/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
/* @template:if kind='metaspatial' */
import {
  discoverComponents,
  generateGLXF,
} from '@iwsdk/vite-plugin-metaspatial';
/* @template:end */
import { compileUIKit } from '@iwsdk/vite-plugin-uikitml';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [
    mkcert(),
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
    /* @template:if kind='metaspatial' */
    discoverComponents({
      outputDir: 'metaspatial/components',
      include: /\.(js|ts|jsx|tsx)$/,
      exclude: /node_modules/,
      verbose: false,
    }),
    generateGLXF({
      metaSpatialDir: 'metaspatial',
      outputDir: 'public/glxf',
      verbose: false,
      enableWatcher: true,
    }),
    /* @template:end */
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
