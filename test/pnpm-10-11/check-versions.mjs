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
import { spawnSync } from 'node:child_process';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIRECTORY = path.resolve(TEST_DIRECTORY, '..', '..');
const TARGET_PNPM_VERSION = '11.22.0';
const TARGET_PACKAGE_MANAGER = `pnpm@${TARGET_PNPM_VERSION}`;
const TARGET_COREPACK_VERSION = '0.35.0';
const LEGACY_PNPM_VERSION = ['10', '18', '3'].join('.');
const LEGACY_PNPM_PIN = `pnpm@${LEGACY_PNPM_VERSION}`;
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.cmd',
  '.css',
  '.gitignore',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.pnpm-store',
  '.turbo',
  '.vite',
  'dist',
  'node_modules',
]);
const HISTORICAL_PREFIXES = [
  'docs/plans/',
  'docs/test-evidence/',
  'test/threejs-r181-r185/',
  'test/pnpm-10-11/',
];

const failures = [];

function relativePath(filePath) {
  return path.relative(ROOT_DIRECTORY, filePath).split(path.sep).join('/');
}

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  return (
    TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ||
    basename === '.editorconfig' ||
    basename === '.gitignore' ||
    basename === '.nvmrc'
  );
}

function isHistorical(relativeFilePath) {
  const normalizedPath = relativeFilePath.toLowerCase();
  return (
    HISTORICAL_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) ||
    normalizedPath.endsWith('/changelog.md')
  );
}

async function collectTextFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(filePath)));
      continue;
    }

    if (entry.isFile() && isTextFile(filePath)) files.push(filePath);
  }

  return files;
}

function readCommandVersion(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIRECTORY,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.error != null || result.status !== 0) return undefined;
  return result.stdout.trim();
}

async function readWindowsShimVersion(command) {
  if (process.platform !== 'win32') return undefined;

  const packageName = path.basename(command).replace(/\.cmd$/iu, '');
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  for (const pathEntry of pathEntries) {
    if (pathEntry.length === 0) continue;
    const packageJsonPath = path.join(
      pathEntry,
      'node_modules',
      packageName,
      'package.json',
    );
    try {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8'),
      );
      if (typeof packageJson.version === 'string') return packageJson.version;
    } catch {
      // Continue through the PATH entries.
    }
  }

  return undefined;
}

async function checkCommandVersion(label, command, args, expected, optional) {
  const actual =
    readCommandVersion(command, args) ?? (await readWindowsShimVersion(command));
  if (actual == null) {
    if (optional) {
      console.log(`${label} check skipped because the command is unavailable.`);
    } else {
      failures.push(`${label} is unavailable; expected ${expected}.`);
    }
    return;
  }

  if (actual !== expected) {
    failures.push(`${label} is ${actual}; expected ${expected}.`);
    return;
  }

  console.log(`${label} ${actual}.`);
}

const rootPackageJsonPath = path.join(ROOT_DIRECTORY, 'package.json');
const rootPackageJson = JSON.parse(
  await fs.readFile(rootPackageJsonPath, 'utf8'),
);
if (rootPackageJson.packageManager !== TARGET_PACKAGE_MANAGER) {
  failures.push(
    `package.json packageManager is ${rootPackageJson.packageManager ?? 'missing'}; expected ${TARGET_PACKAGE_MANAGER}.`,
  );
} else {
  console.log(`package.json packageManager is ${TARGET_PACKAGE_MANAGER}.`);
}

if (Object.hasOwn(rootPackageJson, 'pnpm')) {
  failures.push(
    'package.json still contains a pnpm configuration block; pnpm 11 settings belong in pnpm-workspace.yaml.',
  );
}

const workspaceConfig = await fs.readFile(
  path.join(ROOT_DIRECTORY, 'pnpm-workspace.yaml'),
  'utf8',
);
const overridesBlock = workspaceConfig.match(
  /^overrides:\r?\n([\s\S]*?)(?=^allowBuilds:)/mu,
)?.[1];
const overrideLines =
  overridesBlock?.split(/\r?\n/u).filter((line) => /^\s{2}\S/u.test(line)) ?? [];
if (overrideLines.length !== 43) {
  failures.push(
    `pnpm-workspace.yaml contains ${overrideLines.length} override entries; expected 43 after the pnpm 11 migration.`,
  );
} else {
  console.log('pnpm-workspace.yaml contains all 43 migrated overrides.');
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
await checkCommandVersion(
  'pnpm',
  pnpmCommand,
  ['--version'],
  TARGET_PNPM_VERSION,
  false,
);

const corepackCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
await checkCommandVersion(
  'Corepack',
  corepackCommand,
  ['--version'],
  TARGET_COREPACK_VERSION,
  true,
);

const textFiles = await collectTextFiles(ROOT_DIRECTORY);
const legacyPins = [];
for (const filePath of textFiles) {
  const relativeFilePath = relativePath(filePath);
  if (isHistorical(relativeFilePath)) continue;

  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (
      line.includes(LEGACY_PNPM_PIN) ||
      line.includes(`pnpm ${LEGACY_PNPM_VERSION}`) ||
      line.includes(`PNPM_VERSION="${LEGACY_PNPM_VERSION}"`)
    ) {
      legacyPins.push(`${relativeFilePath}:${index + 1}: ${line.trim()}`);
    }
  }
}

if (legacyPins.length > 0) {
  failures.push(
    `Found ${legacyPins.length} legacy pnpm ${LEGACY_PNPM_VERSION} pin(s) in active files:\n${legacyPins.map((pin) => `- ${pin}`).join('\n')}`,
  );
} else {
  console.log(
    `No pnpm ${LEGACY_PNPM_VERSION} pins remain in active files.`,
  );
}

if (failures.length > 0) {
  console.error('pnpm 10 to 11 version checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('pnpm 10 to 11 version checks passed.');
}
