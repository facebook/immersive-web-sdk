/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldProject } from '../src/scaffold.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-scaffold-'));
  tempDirs.push(tempDir);
  return tempDir;
}

describe('scaffoldProject safety', () => {
  it('rejects generated paths outside the target before writing', async () => {
    const workspace = await makeTempDir();
    const target = path.join(workspace, 'target');
    const outsidePath = path.join(workspace, 'outside.ts');
    await mkdir(target);
    const files = [
      { path: '../outside.ts', contents: 'outside' },
      { path: 'README.md', contents: 'generated' },
    ];

    await expect(
      scaffoldProject(files, target, { force: true }),
    ).rejects.toThrow('Generated output path "../outside.ts" is not safe.');
    await expect(stat(outsidePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(path.join(target, 'README.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('atomically replaces a generated hard link without changing its peer', async () => {
    const workspace = await makeTempDir();
    const target = path.join(workspace, 'target');
    await mkdir(target);
    const externalPath = path.join(workspace, 'external-readme.md');
    const targetPath = path.join(target, 'README.md');
    await writeFile(externalPath, 'preserve me', 'utf8');
    await link(externalPath, targetPath);
    const files = [{ path: 'README.md', contents: 'generated' }];

    await scaffoldProject(files, target, { force: true });

    expect(await readFile(externalPath, 'utf8')).toBe('preserve me');
    expect(await readFile(targetPath, 'utf8')).toBe('generated');
  });
});
