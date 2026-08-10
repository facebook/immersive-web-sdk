/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'child_process';
import { cp, mkdir, mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { afterEach, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => rm(fixture, { force: true, recursive: true })),
  );
});

describe('source CLI launcher', () => {
  test('explains how to build a directory-linked CLI', async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-cli-source-'));
    fixtures.push(fixture);
    const binDir = path.join(fixture, 'bin');
    await mkdir(binDir);
    const launcher = path.join(binDir, 'iwsdk.js');
    await cp(new URL('../bin/iwsdk.js', import.meta.url), launcher);

    await expect(
      execFileAsync(process.execPath, [launcher]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'corepack pnpm@10.18.3 --filter @iwsdk/cli build',
      ),
    });
  });
});
