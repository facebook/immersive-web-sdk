/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

// `@iwsdk/cli/contract` is bundled on purpose so the published plugin remains
// self-contained at runtime.

// Plugin build config
const pluginConfig = {
  input: {
    index: 'src/index.ts',
    'editor/scene-editor-session': 'src/editor/scene-editor-session.ts',
    'editor/editor-workspace': 'src/editor/editor-workspace.tsx',
  },
  output: [
    {
      dir: 'dist',
      entryFileNames: '[name].js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  external: [
    'vite',
    'path',
    'fs',
    'fs/promises',
    'fs-extra',
    'child_process',
    'util',
    'url',
    'rollup',
    '@rollup/plugin-commonjs',
    '@rollup/plugin-node-resolve',
    '@rollup/plugin-typescript',
    '@rollup/plugin-json',
    'iwer',
    '@iwer/devui',
    '@iwer/sem',
    '@vitejs/plugin-basic-ssl',
    'ws',
    'playwright',
    'sharp',
    'os',
    'crypto',
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};

export default [pluginConfig];
