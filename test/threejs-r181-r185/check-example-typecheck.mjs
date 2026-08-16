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
const examplesDirectory = path.join(ROOT_DIRECTORY, 'examples');
const failures = [];

const entries = await fs.readdir(examplesDirectory, { withFileTypes: true });
for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
  const exampleDirectory = path.join(examplesDirectory, entry.name);
  try {
    await fs.access(path.join(exampleDirectory, 'tsconfig.json'));
  } catch {
    continue;
  }

  console.log(`Type-checking examples/${entry.name}...`);
  const localTscCommand = path.join(
    exampleDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
  const rootTscCommand = path.join(
    ROOT_DIRECTORY,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
  let tscCommand = rootTscCommand;
  try {
    await fs.access(localTscCommand);
    tscCommand = localTscCommand;
  } catch {
    // Fall back to the workspace TypeScript binary for a diagnostic result.
  }
  const command =
    process.platform === 'win32' ? `"${tscCommand}" --noEmit` : tscCommand;
  const result = spawnSync(
    command,
    process.platform === 'win32' ? [] : ['--noEmit'],
    {
      cwd: exampleDirectory,
      env: { ...process.env, CI: 'true' },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    },
  );
  if (result.error != null || result.status !== 0) {
    failures.push(`examples/${entry.name}`);
  }
}

if (failures.length > 0) {
  console.error('Example typecheck failed for:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('All example typechecks passed.');
}
