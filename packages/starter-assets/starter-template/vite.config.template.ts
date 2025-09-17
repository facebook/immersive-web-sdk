/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { optimizeGLTF } from '@iwsdk/vite-plugin-gltf-optimizer';
import { injectIWER } from '@iwsdk/vite-plugin-iwer';
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
    injectIWER({
      device: 'metaQuest3',
      activation: 'localhost',
      verbose: true,
      /* @template:if mode='ar' */ sem: {
        defaultScene: 'living_room',
      } /* @template:end */,
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
    optimizeGLTF({
      level: 'medium',
    }),
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
