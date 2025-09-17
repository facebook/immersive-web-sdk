/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/injection-template.ts',
  output: {
    file: 'dist/injection-bundle.js',
    format: 'iife',
    name: 'IWERRuntime',
    inlineDynamicImports: true, // Force all imports to be inlined
    // Minify the injection bundle but preserve placeholder comments
    plugins: [
      terser({
        compress: {
          drop_console: false, // Keep console.log for debugging
        },
        mangle: {
          reserved: ['__IWER_CONFIG_REPLACEMENT_TOKEN__'], // Don't mangle the replacement token
        },
      }),
    ],
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
    json(), // Handle JSON imports
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    replace({
      'process.env.NODE_ENV': JSON.stringify('production'),
      __IS_UMD__: 'true', // Set to true to use CDN loading for scenes
      preventAssignment: true,
    }),
    replace({
      'window.__THREE__': 'window.__THREE__IWER__',
      preventAssignment: false,
    }),
  ],
  external: [], // Bundle everything now that we have JSON support
};
