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
const THREE_VERSION = '0.185.0';
const TYPES_VERSION = '0.185.1';

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`Cannot parse ${path.relative(ROOT_DIRECTORY, filePath)}: ${error}`);
    return null;
  }
}

async function findPackageJsonFiles(directory) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findPackageJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name === 'package.json') {
      results.push(entryPath);
    }
  }
  return results;
}

function dependencySections(packageJson) {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ].filter((section) => section != null);
}

function checkDependencySpec(packagePath, packageJson) {
  for (const section of dependencySections(packageJson)) {
    const threeSpec = section.three;
    if (threeSpec != null && threeSpec !== '*' && !threeSpec.startsWith('>=')) {
      assert(
        threeSpec === `npm:super-three@${THREE_VERSION}`,
        `${path.relative(ROOT_DIRECTORY, packagePath)} must use npm:super-three@${THREE_VERSION}, found ${threeSpec}`,
      );
    }

    const typesSpec = section['@types/three'];
    if (typesSpec != null) {
      assert(
        typesSpec === `^0.185.0` || typesSpec === TYPES_VERSION,
        `${path.relative(ROOT_DIRECTORY, packagePath)} must use the 0.185.x Three.js types, found ${typesSpec}`,
      );
    }
  }
}

const rootPackagePath = path.join(ROOT_DIRECTORY, 'package.json');
const rootPackage = await readJson(rootPackagePath);
if (rootPackage != null) {
  assert(
    rootPackage.pnpm?.overrides == null,
    'package.json must not keep pnpm.overrides; use pnpm-workspace.yaml',
  );
  checkDependencySpec(rootPackagePath, rootPackage);
}

const workspaceText = await fs.readFile(
  path.join(ROOT_DIRECTORY, 'pnpm-workspace.yaml'),
  'utf8',
);
assert(
  workspaceText.includes(`three: 'npm:super-three@${THREE_VERSION}'`),
  `pnpm-workspace.yaml must override three to npm:super-three@${THREE_VERSION}`,
);
assert(
  workspaceText.includes(`'@types/three': '${TYPES_VERSION}'`),
  `pnpm-workspace.yaml must override @types/three to ${TYPES_VERSION}`,
);

const packageFiles = [
  ...(await findPackageJsonFiles(path.join(ROOT_DIRECTORY, 'packages'))),
  ...(await findPackageJsonFiles(path.join(ROOT_DIRECTORY, 'examples'))),
];
for (const packagePath of packageFiles) {
  const packageJson = await readJson(packagePath);
  if (packageJson != null) checkDependencySpec(packagePath, packageJson);
}

const lockfile = await fs.readFile(
  path.join(ROOT_DIRECTORY, 'pnpm-lock.yaml'),
  'utf8',
);
assert(
  lockfile.includes(`super-three@${THREE_VERSION}`),
  `pnpm-lock.yaml must resolve super-three@${THREE_VERSION}`,
);
assert(
  !lockfile.includes('super-three@0.181.0'),
  'pnpm-lock.yaml still contains the obsolete super-three@0.181.0 resolution',
);
assert(
  !lockfile.includes("'@types/three@0.181.0"),
  'pnpm-lock.yaml still contains the obsolete @types/three@0.181.0 resolution',
);

if (failures.length > 0) {
  console.error('Three.js r181→r185 version check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Three.js r181→r185 version check passed (super-three@${THREE_VERSION}, @types/three@${TYPES_VERSION}).`,
  );
}
