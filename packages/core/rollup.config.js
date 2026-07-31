/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import typescript from '@rollup/plugin-typescript';

export default {
  input: ['src/index.ts', 'src/lighting/index.ts'],
  external: (id) => {
    // Mark three.js and all its subpaths as external
    if (id === 'three' || id.startsWith('three/')) {
      return true;
    }

    // Mark all other dependencies as external
    const externalDeps = [
      'three-mesh-bvh',
      '@iwsdk/glxf',
      '@iwsdk/locomotor',
      '@iwsdk/scene-composition',
      '@iwsdk/xr-input',
      '@pmndrs/handle',
      '@pmndrs/pointer-events',
      '@pmndrs/uikit',
      '@pmndrs/uikitml',
      '@preact/signals-core',
      '@babylonjs/havok',
      'elics',
    ];

    return externalDeps.some((dep) => id === dep || id.startsWith(dep + '/'));
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      declarationDir: 'dist',
    }),
    json(),
    copy({
      targets: [
        {
          src: [
            'node_modules/three/examples/jsm/libs/basis',
            'node_modules/three/examples/jsm/libs/draco',
          ],
          dest: 'dist/vendor',
        },
      ],
    }),
    resolve({
      preferBuiltins: false,
    }),
    commonjs(),
  ],
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: true,
  },
};
