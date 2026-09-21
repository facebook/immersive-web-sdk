/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { findCorepackPackageScripts } from './check-package-script-portability.mjs';

const fixtures = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => rm(fixture, { force: true, recursive: true })),
  );
});

async function writePackage(root, directory, manifest) {
  const packageRoot = path.join(root, 'packages', directory);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

test('rejects Corepack dependencies in package scripts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-package-scripts-'));
  fixtures.push(root);
  await writePackage(root, 'fixture', {
    name: '@iwsdk/fixture',
    scripts: {
      build: 'corepack pnpm@10.18.3 run compile',
      test: 'corepack.cmd pnpm test',
    },
  });

  assert.deepEqual(findCorepackPackageScripts(root), [
    {
      command: 'corepack pnpm@10.18.3 run compile',
      packageName: '@iwsdk/fixture',
      script: 'build',
    },
    {
      command: 'corepack.cmd pnpm test',
      packageName: '@iwsdk/fixture',
      script: 'test',
    },
  ]);
});

test('allows package-local npm composition and root Corepack entrypoints', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-package-scripts-'));
  fixtures.push(root);
  await writePackage(root, 'fixture', {
    name: '@iwsdk/fixture',
    scripts: {
      build: 'npm --prefix ../dependency run build',
      test: 'npm run build && vitest run',
    },
  });
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ scripts: { bootstrap: 'corepack pnpm install' } })}\n`,
  );

  assert.deepEqual(findCorepackPackageScripts(root), []);
});

test('current package scripts do not require Corepack', () => {
  assert.deepEqual(findCorepackPackageScripts(), []);
});
