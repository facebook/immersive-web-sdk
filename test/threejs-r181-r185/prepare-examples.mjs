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
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIRECTORY = path.resolve(TEST_DIRECTORY, '..', '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageManager =
  process.platform === 'win32'
    ? path.join(TEST_DIRECTORY, 'pnpm10.cmd')
    : 'pnpm';
const corepackHome = path.join(
  process.env.TEMP ?? process.env.TMP ?? ROOT_DIRECTORY,
  'iwsdk-corepack',
);
const npmCache = path.join(
  process.env.TEMP ?? process.env.TMP ?? ROOT_DIRECTORY,
  'iwsdk-npm-cache',
);
const testEnvironment = {
  ...process.env,
  CI: 'true',
  COREPACK_HOME: corepackHome,
  npm_config_cache: npmCache,
  npm_config_confirmModulesPurge: 'false',
  PATH: `${TEST_DIRECTORY}${path.delimiter}${process.env.PATH ?? ''}`,
};
const exampleDirectories = [
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
];

function run(command, args, cwd, label) {
  console.log(`\nRunning ${label}...`);
  const commandLine = [command, ...args]
    .map((value) =>
      /\s/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value,
    )
    .join(' ');
  const result = spawnSync(
    process.platform === 'win32' ? commandLine : command,
    process.platform === 'win32' ? [] : args,
    {
      cwd,
      env: testEnvironment,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    },
  );
  if (result.error != null || result.status !== 0) {
    console.error(
      `${label} failed${result.error == null ? ` with exit code ${result.status}` : `: ${result.error.message}`}.`,
    );
    return false;
  }
  return true;
}

await fs.mkdir(npmCache, { recursive: true });

function packageAlias(packageJson) {
  return `${packageJson.name.replace(/^@iwsdk\//u, 'iwsdk-')}.tgz`;
}

async function packPackage(relativeDirectory) {
  const packageDirectory = path.join(ROOT_DIRECTORY, relativeDirectory);
  const packageJsonPath = path.join(packageDirectory, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const alias = packageAlias(packageJson);
  const versionedTarball = `${alias.slice(0, -4)}-${packageJson.version}.tgz`;
  await fs.rm(path.join(packageDirectory, alias), { force: true });
  await fs.rm(path.join(packageDirectory, versionedTarball), { force: true });
  if (
    !run(
      npmCommand,
      ['pack', '--ignore-scripts', '--pack-destination', packageDirectory],
      packageDirectory,
      `pack ${relativeDirectory}`,
    )
  ) {
    return false;
  }
  const packedPath = path.join(packageDirectory, versionedTarball);
  try {
    await fs.access(packedPath);
  } catch {
    console.error(
      `Missing packed artifact: ${relativeDirectory}/${versionedTarball}`,
    );
    return false;
  }
  await fs.rename(packedPath, path.join(packageDirectory, alias));
  return true;
}

async function withStandaloneDependencies(relativeDirectory, replacements) {
  const packageDirectory = path.join(ROOT_DIRECTORY, relativeDirectory);
  const packageJsonPath = path.join(packageDirectory, 'package.json');
  const original = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(original);
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const [name, value] of Object.entries(replacements)) {
      if (packageJson[field]?.[name]?.startsWith('workspace:')) {
        packageJson[field][name] = value;
      }
    }
  }
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  try {
    return await packPackage(relativeDirectory);
  } finally {
    await fs.writeFile(packageJsonPath, original);
  }
}

let passed = true;
for (const relativeDirectory of [
  'packages/locomotor',
  'packages/scene-composition',
  'packages/xr-input',
  'packages/cli',
  'packages/reference',
]) {
  passed = (await packPackage(relativeDirectory)) && passed;
}
passed =
  (await withStandaloneDependencies('packages/core', {
    '@iwsdk/locomotor': 'file:../locomotor/iwsdk-locomotor.tgz',
    '@iwsdk/scene-composition':
      'file:../scene-composition/iwsdk-scene-composition.tgz',
    '@iwsdk/xr-input': 'file:../xr-input/iwsdk-xr-input.tgz',
  })) && passed;
passed =
  (await withStandaloneDependencies('packages/vite-plugin-dev', {
    '@iwsdk/cli': 'file:../cli/iwsdk-cli.tgz',
    '@iwsdk/core': 'file:../core/iwsdk-core.tgz',
    '@iwsdk/scene-composition':
      'file:../scene-composition/iwsdk-scene-composition.tgz',
  })) && passed;

const requiredTarballs = [
  'packages/core/iwsdk-core.tgz',
  'packages/cli/iwsdk-cli.tgz',
  'packages/reference/iwsdk-reference.tgz',
  'packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
];
for (const relativeTarball of requiredTarballs) {
  try {
    const tarball = path.join(ROOT_DIRECTORY, relativeTarball);
    const stats = await fs.stat(tarball);
    if (!stats.isFile() || stats.size === 0) throw new Error('empty');
  } catch {
    console.error(`Missing standalone package tarball: ${relativeTarball}`);
    passed = false;
  }
}

for (const exampleName of exampleDirectories) {
  const exampleDirectory = path.join(ROOT_DIRECTORY, 'examples', exampleName);
  passed =
    run(
      npmCommand,
      [
        'install',
        '--ignore-scripts',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
      ],
      exampleDirectory,
      `install examples/${exampleName}`,
    ) && passed;
}

if (!passed) {
  process.exitCode = 1;
} else {
  console.log('\nStandalone example installs completed.');
}
