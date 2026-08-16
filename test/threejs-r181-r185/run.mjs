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
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIRECTORY = path.resolve(TEST_DIRECTORY, '..', '..');
const nodeExecutable = process.execPath;

async function findPinnedPnpm() {
  if (process.platform !== 'win32') return 'pnpm';
  const npmCache =
    process.env.npm_config_cache ??
    path.join(process.env.LOCALAPPDATA ?? '', 'npm-cache');
  const npxDirectory = path.join(npmCache, '_npx');
  try {
    const entries = await fs.readdir(npxDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageRoot = path.join(
        npxDirectory,
        entry.name,
        'node_modules',
        'pnpm',
      );
      try {
        const packageJson = JSON.parse(
          await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
        );
        if (packageJson.version === '11.22.0') {
          return path.join(
            npxDirectory,
            entry.name,
            'node_modules',
            '.bin',
            'pnpm.cmd',
          );
        }
      } catch {
        // Keep looking through the npx cache.
      }
    }
  } catch {
    // Fall back to the pnpm command on PATH.
  }
  return 'pnpm.cmd';
}

const pinnedPnpm = await findPinnedPnpm();
const corepackHome = path.join(
  process.env.TEMP ?? process.env.TMP ?? ROOT_DIRECTORY,
  'iwsdk-corepack',
);
const testEnvironment = {
  ...process.env,
  CI: 'true',
  COREPACK_HOME: corepackHome,
  IWSDK_PNPM_BIN: pinnedPnpm,
  npm_config_confirmModulesPurge: 'false',
  PATH: `${TEST_DIRECTORY}${path.delimiter}${process.env.PATH ?? ''}`,
};

const staticChecks = [
  'check-three-version.mjs',
  'check-three-api.mjs',
  'check-licensing.mjs',
];

function run(command, args, label) {
  console.log(`\nRunning ${label}...`);
  const useWindowsShell =
    process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  const shellCommand = [command, ...args]
    .map((value) =>
      /\s/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value,
    )
    .join(' ');
  const result = spawnSync(
    useWindowsShell ? shellCommand : command,
    useWindowsShell ? [] : args,
    {
      cwd: ROOT_DIRECTORY,
      stdio: 'inherit',
      shell: useWindowsShell,
      env: testEnvironment,
    },
  );
  if (result.error != null) {
    console.error(`${label} could not start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(
      `${label} failed with exit code ${result.status ?? 'unknown'}.`,
    );
    return false;
  }
  return true;
}

let passed = true;
for (const scriptName of staticChecks) {
  passed =
    run(nodeExecutable, [path.join(TEST_DIRECTORY, scriptName)], scriptName) &&
    passed;
}

if (process.argv.includes('--full')) {
  const packageManager =
    process.platform === 'win32' ? 'pnpm10.cmd' : pinnedPnpm;
  const fullChecks = [
    {
      command: nodeExecutable,
      args: [path.join(TEST_DIRECTORY, 'check-format.mjs')],
      label: 'targeted format check',
    },
    { command: packageManager, args: ['run', 'lint'], label: 'lint' },
    {
      command: packageManager,
      args: ['-r', '--filter', '!@iwsdk/reference-assets', 'run', 'build'],
      label: 'workspace build without the optional reference corpus',
    },
    {
      command: nodeExecutable,
      args: [path.join(TEST_DIRECTORY, 'prepare-examples.mjs')],
      label: 'standalone example installs',
    },
    {
      command: nodeExecutable,
      args: [path.join(TEST_DIRECTORY, 'check-example-typecheck.mjs')],
      label: 'example typecheck',
    },
    {
      command: packageManager,
      args: ['--filter', '@iwsdk/core', 'run', 'test'],
      label: 'core migration tests',
    },
    {
      command: packageManager,
      args: ['--filter', '@iwsdk/scene-composition', 'run', 'test'],
      label: 'scene-composition migration tests',
    },
    {
      command: packageManager,
      args: ['--filter', '@iwsdk/locomotor', 'run', 'test'],
      label: 'locomotor migration tests',
    },
    {
      command: packageManager,
      args: ['--filter', '@iwsdk/xr-input', 'run', 'test'],
      label: 'xr-input migration tests',
    },
    {
      command: packageManager,
      args: ['--filter', '@iwsdk/reference', 'run', 'test'],
      label: 'reference migration tests',
    },
  ];
  for (const check of fullChecks) {
    passed = run(check.command, check.args, check.label) && passed;
  }
}

if (!passed) {
  process.exitCode = 1;
} else {
  console.log('\nAll Three.js r181→r185 checks passed.');
}
