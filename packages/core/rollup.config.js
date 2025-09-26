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
  input: 'src/index.ts',
  external: [
    'three',
    'three/examples/jsm/loaders/GLTFLoader.js',
    'three/examples/jsm/loaders/DRACOLoader.js',
    'three/examples/jsm/loaders/KTX2Loader.js',
    'three/examples/jsm/environments/RoomEnvironment.js',
    'three/examples/jsm/lines/Line2.js',
    'three/examples/jsm/lines/LineGeometry.js',
    'three/examples/jsm/utils/BufferGeometryUtils.js',
    'three-mesh-bvh',
    '@iwsdk/glxf',
    '@iwsdk/locomotor',
    '@iwsdk/xr-input',
    '@pmndrs/handle',
    '@pmndrs/pointer-events',
    '@pmndrs/uikit',
    '@pmndrs/uikit-html-parser',
    '@preact/signals-core',
    '@babylonjs/havok',
    'elics',
  ],
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
