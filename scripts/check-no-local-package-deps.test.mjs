/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findLocalPackageDependencies } from './check-no-local-package-deps.mjs';

async function writeManifest(root, directory, manifest) {
  const packageDirectory = path.join(root, directory);
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

test('accepts registry and workspace dependencies', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'iwsdk-package-deps-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeManifest(root, 'safe', {
    name: 'safe',
    dependencies: { iwer: '^2.4.0', '@iwsdk/core': 'workspace:*' },
  });

  assert.deepEqual(await findLocalPackageDependencies(root), []);
});

test('rejects local dependency protocols in every dependency field', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'iwsdk-package-deps-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeManifest(root, 'unsafe', {
    name: 'unsafe',
    dependencies: { a: 'file:../a.tgz' },
    devDependencies: { b: 'link:../b' },
    optionalDependencies: { c: 'portal:../c' },
    peerDependencies: { d: 'file:../d' },
    bundledDependencies: { ignored: '../not-a-dependency-map' },
    overrides: { ignored: './not-a-package-field' },
  });
  await writeManifest(root, 'bare-paths', {
    name: 'bare-paths',
    dependencies: {
      e: '../e',
      f: './f.tgz',
      g: '/tmp/g',
      h: 'C:\\h',
      j: '.',
      k: '..',
    },
    devDependencies: { i: '~/i' },
  });

  assert.deepEqual(await findLocalPackageDependencies(root), [
    'bare-paths/package.json: dependencies.e=../e',
    'bare-paths/package.json: dependencies.f=./f.tgz',
    'bare-paths/package.json: dependencies.g=/tmp/g',
    'bare-paths/package.json: dependencies.h=C:\\h',
    'bare-paths/package.json: dependencies.j=.',
    'bare-paths/package.json: dependencies.k=..',
    'bare-paths/package.json: devDependencies.i=~/i',
    'unsafe/package.json: dependencies.a=file:../a.tgz',
    'unsafe/package.json: devDependencies.b=link:../b',
    'unsafe/package.json: optionalDependencies.c=portal:../c',
    'unsafe/package.json: peerDependencies.d=file:../d',
  ]);
});
