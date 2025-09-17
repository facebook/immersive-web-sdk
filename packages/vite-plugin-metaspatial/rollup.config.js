import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  external: [
    '@babel/parser',
    '@babel/traverse',
    '@babel/types',
    'enhanced-resolve',
    'vite',
    'path',
    'fs',
    'fs-extra',
    'module',
    'child_process',
    'os',
    'chokidar',
    'xmlbuilder2',
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      declarationDir: 'dist',
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
