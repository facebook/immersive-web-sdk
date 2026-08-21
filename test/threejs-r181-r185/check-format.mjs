#!/usr/bin/env node
/**
 * MIT License
 *
 * Copyright (c) 2026 Sythos (https://www.sythos.net)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * SPDX-License-Identifier: MIT
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIRECTORY = path.resolve(TEST_DIRECTORY, '..', '..');
const prettierCommand = path.join(
  ROOT_DIRECTORY,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
);

const files = [
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  '.claude/skills/iwsdk-planner/references/api-reference.md',
  'packages/core/package.json',
  'packages/core/src/asset/loaders/gltf-loader.ts',
  'packages/core/src/ecs/system.ts',
  'packages/core/src/init/world-initializer.ts',
  'packages/core/src/level/level-scene-environment.ts',
  'packages/core/src/lighting/light-binding.ts',
  'packages/core/src/mcp/scene-tools.ts',
  'packages/core/tests/level/level-scene-lowering.test.ts',
  'packages/create/src/project-files.ts',
  'packages/create/tests/project-files.test.ts',
  'packages/vite-plugin-dev/package.json',
  'scripts/check-three-version.mjs',
  'test/threejs-r181-r185/CHANGELOG.md',
  'test/threejs-r181-r185/check-licensing.mjs',
  'test/threejs-r181-r185/check-three-api.mjs',
  'test/threejs-r181-r185/check-three-version.mjs',
  'test/threejs-r181-r185/check-format.mjs',
  'test/threejs-r181-r185/check-example-typecheck.mjs',
  'test/threejs-r181-r185/prepare-examples.mjs',
  'test/threejs-r181-r185/run.mjs',
];
for (const example of [
  'audio',
  'browser-first',
  'depth-occlusion',
  'environment-raycast',
  'grab',
  'layers',
  'locomotion',
  'physics',
  'poke',
  'scene-understanding',
]) {
  files.push(`examples/${example}/package.json`);
}

const command =
  process.platform === 'win32'
    ? `"${prettierCommand}" --check ${files.map((file) => `"${file}"`).join(' ')}`
    : prettierCommand;
const args = process.platform === 'win32' ? [] : ['--check', ...files];
const result = spawnSync(command, args, {
  cwd: ROOT_DIRECTORY,
  env: { ...process.env, CI: 'true' },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error != null) {
  console.error(
    `Targeted format check could not start: ${result.error.message}`,
  );
  process.exitCode = 1;
} else if (result.status !== 0) {
  console.error(
    `Targeted format check failed with exit code ${result.status}.`,
  );
  process.exitCode = 1;
} else {
  console.log('Targeted format check passed.');
}
