import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import worker64 from 'rollup-plugin-worker64';

export default {
  input: 'src/index.ts',
  external: [
    'three',
    'three-mesh-bvh',
    'three/examples/jsm/utils/BufferGeometryUtils.js',
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      declarationDir: 'dist',
    }),

    // Worker asset plugin - detects and transforms Worker patterns
    worker64({ minify: true }),
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
