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

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIRECTORY = path.resolve(TEST_DIRECTORY, '..', '..');
const failures = [];

const migrationFiles = [
  'packages/core/src/init/world-initializer.ts',
  'packages/core/src/level/level-scene-environment.ts',
  'packages/core/src/mcp/scene-tools.ts',
  'packages/core/src/lighting/light-binding.ts',
  'packages/core/src/asset/loaders/gltf-loader.ts',
  'packages/core/src/ecs/system.ts',
  'packages/core/tests/level/level-scene-lowering.test.ts',
  'packages/create/src/project-files.ts',
  'packages/create/tests/project-files.test.ts',
  'scripts/check-three-version.mjs',
  '.claude/skills/iwsdk-planner/references/api-reference.md',
];

for (const relativePath of migrationFiles) {
  const absolutePath = path.join(ROOT_DIRECTORY, relativePath);
  let content;
  try {
    content = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    failures.push(`Cannot read ${relativePath}: ${error}`);
    continue;
  }

  if (/\.(?:json)$/iu.test(relativePath)) {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(`Invalid JSON in ${relativePath}: ${error}`);
    }
  }

  if (/\.(?:ts|tsx|js|jsx|mjs|mts|cts|sh)$/iu.test(relativePath)) {
    if (!content.includes('SPDX-License-Identifier: MIT')) {
      failures.push(`${relativePath} is missing SPDX-License-Identifier: MIT`);
    }
    if (!content.includes('Sythos')) {
      failures.push(`${relativePath} is missing Sythos attribution`);
    }
  }
}

const jsonFiles = [
  'package.json',
  'packages/core/package.json',
  'packages/vite-plugin-dev/package.json',
  'examples/audio/package.json',
  'examples/browser-first/package.json',
  'examples/depth-occlusion/package.json',
  'examples/environment-raycast/package.json',
  'examples/grab/package.json',
  'examples/layers/package.json',
  'examples/locomotion/package.json',
  'examples/physics/package.json',
  'examples/poke/package.json',
  'examples/scene-understanding/package.json',
];
for (const relativePath of jsonFiles) {
  try {
    JSON.parse(
      await fs.readFile(path.join(ROOT_DIRECTORY, relativePath), 'utf8'),
    );
  } catch (error) {
    failures.push(`Invalid JSON in ${relativePath}: ${error}`);
  }
}

const lockfile = await fs.readFile(
  path.join(ROOT_DIRECTORY, 'pnpm-lock.yaml'),
  'utf8',
);
if (!/^lockfileVersion:\s*['"]?9\.0['"]?/mu.test(lockfile)) {
  failures.push('pnpm-lock.yaml is missing the lockfileVersion 9.0 header');
}
if (/^(?:#|\/\*)\s*(?:Copyright|SPDX)/mu.test(lockfile)) {
  failures.push('pnpm-lock.yaml contains a source-file license comment');
}

const taskTestFiles = await fs.readdir(TEST_DIRECTORY);
const requiredMitHeaderTokens = [
  'MIT License',
  'Permission is hereby granted, free of charge',
  'THE SOFTWARE IS PROVIDED "AS IS"',
  'SPDX-License-Identifier: MIT',
  'Copyright (c) 2026 Sythos (https://www.sythos.net)',
];
for (const fileName of taskTestFiles) {
  if (!/\.(?:mjs|js|ts|cmd)$/iu.test(fileName)) continue;
  const relativePath = path.posix.join('test/threejs-r181-r185', fileName);
  const content = await fs.readFile(
    path.join(TEST_DIRECTORY, fileName),
    'utf8',
  );
  for (const token of requiredMitHeaderTokens) {
    if (!content.includes(token)) {
      failures.push(`${relativePath} is missing MIT header text: ${token}`);
    }
  }
}

const changelogPath = path.join(TEST_DIRECTORY, 'CHANGELOG.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
for (const token of requiredMitHeaderTokens) {
  if (!changelog.includes(token)) {
    failures.push(
      `test/threejs-r181-r185/CHANGELOG.md is missing MIT header text: ${token}`,
    );
  }
}

if (failures.length > 0) {
  console.error('Three.js r181→r185 licensing check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Three.js r181→r185 licensing and file-validity check passed.');
}
