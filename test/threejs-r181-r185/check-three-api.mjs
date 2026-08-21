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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  const absolutePath = path.join(ROOT_DIRECTORY, relativePath);
  try {
    return await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    failures.push(`Cannot read ${relativePath}: ${error}`);
    return '';
  }
}

const worldInitializer = await read(
  'packages/core/src/init/world-initializer.ts',
);
assert(
  /\bTimer\b/.test(worldInitializer),
  'The render loop must use Three.js Timer.',
);
assert(
  /timer\.update\(timestamp\)/.test(worldInitializer),
  'The render loop must update Timer with the animation-loop timestamp.',
);
assert(
  /timer\.getDelta\(\)/.test(worldInitializer) &&
    /timer\.getElapsed\(\)/.test(worldInitializer),
  'The render loop must read delta and elapsed time through Timer getters.',
);
assert(
  !/new\s+Clock\s*\(/.test(worldInitializer),
  'The render loop must not instantiate the deprecated Clock API.',
);

const sceneEnvironment = await read(
  'packages/core/src/level/level-scene-environment.ts',
);
assert(
  !/\bPCFSoftShadowMap\b/.test(sceneEnvironment),
  'Scene lowering must not depend on the deprecated PCFSoftShadowMap constant.',
);
assert(
  /case\s+'pcf-soft':[\s\S]{0,220}return\s+PCFShadowMap/.test(sceneEnvironment),
  'The legacy pcf-soft scene value must resolve to PCFShadowMap.',
);

const sceneTools = await read('packages/core/src/mcp/scene-tools.ts');
assert(
  /case\s+PCFSoftShadowMap:/.test(sceneTools),
  'Runtime reporting must retain a compatibility branch for legacy shadow-map state.',
);

const lightBinding = await read('packages/core/src/lighting/light-binding.ts');
assert(
  /matrixWorldNeedsUpdate\s*=\s*true/.test(lightBinding),
  'Direct light matrix writes must signal matrixWorldNeedsUpdate for r185.',
);

const gltfLoader = await read('packages/core/src/asset/loaders/gltf-loader.ts');
assert(
  /https:\/\/unpkg\.com\/super-three@0\.\$\{REVISION\}\.0/.test(gltfLoader),
  'Decoder and transcoder fallbacks must use the super-three CDN path.',
);
assert(
  /\.detectSupport\(renderer\)/.test(gltfLoader),
  'KTX2Loader must use detectSupport(renderer).',
);
assert(
  !/\.setDecoderConfig\s*\(/.test(gltfLoader),
  'GLTF loading must not use the deprecated DRACOLoader.setDecoderConfig().',
);

const sourceRoots = [
  path.join(ROOT_DIRECTORY, 'packages'),
  path.join(ROOT_DIRECTORY, 'examples'),
];

async function scanSourceFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanSourceFiles(absolutePath);
      continue;
    }
    if (
      !entry.isFile() ||
      !/\.(?:ts|tsx|js|jsx|mjs|mts|cts)$/.test(entry.name)
    ) {
      continue;
    }
    const content = await fs.readFile(absolutePath, 'utf8');
    const relativePath = path.relative(ROOT_DIRECTORY, absolutePath);
    if (/Matrix3\.(?:translate|scale|rotate)\s*\(/.test(content)) {
      failures.push(
        `${relativePath} uses a Matrix3 transform method deprecated by r185`,
      );
    }
    if (/\.setDecoderConfig\s*\(/.test(content)) {
      failures.push(
        `${relativePath} uses DRACOLoader.setDecoderConfig(), deprecated by r185`,
      );
    }
    if (/new\s+Clock\s*\(/.test(content)) {
      failures.push(`${relativePath} instantiates the deprecated Clock API`);
    }
  }
}

for (const sourceRoot of sourceRoots) await scanSourceFiles(sourceRoot);

if (failures.length > 0) {
  console.error('Three.js r181→r185 API compatibility check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Three.js r181→r185 API compatibility check passed.');
}
