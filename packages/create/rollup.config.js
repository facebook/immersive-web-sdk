/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const external = [
  'fs',
  'fs/promises',
  'path',
  'os',
  'child_process',
  'url',
  'module',
  // keep prettier external (installed as a dependency)
  'prettier',
];

const plugins = [
  typescript({
    tsconfig: './tsconfig.json',
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    declarationDir: 'dist',
  }),
  resolve({ preferBuiltins: true }),
  json(),
  commonjs(),
];

export default [
  {
    input: 'src/cli.ts',
    external,
    plugins,
    output: {
      file: 'dist/cli.js',
      format: 'es',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  },
];
