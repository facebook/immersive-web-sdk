/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync, spawn } from 'child_process';
import { once } from 'events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { test, expect } from 'vitest';
import {
  getRuntimeProcessStart,
  tryRuntimeFileLockSync,
  withRuntimeFileLock,
} from '../src/runtime-files.js';

test('process birth identity is independent of the caller timezone', () => {
  const expected = getRuntimeProcessStart(process.pid);
  expect(expected).toBeTruthy();
  const moduleUrl = new URL('../dist/runtime-files.js', import.meta.url).href;
  const script = `import { getRuntimeProcessStart } from ${JSON.stringify(moduleUrl)}; console.log(getRuntimeProcessStart(Number(process.argv[1])));`;
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    expect(
      execFileSync(
        process.execPath,
        ['--input-type=module', '-e', script, String(process.pid)],
        {
          encoding: 'utf8',
          env: { ...process.env, TZ },
        },
      ).trim(),
    ).toBe(expected);
  }
});

test('synchronous exit cleanup publishes an owner and cannot steal an async writer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-sync-lock-'));
  const file = path.join(root, 'state.json');
  const release = tryRuntimeFileLockSync(file)!;
  try {
    expect(release).toBeTypeOf('function');
    const [name] = await readdir(`${file}.lock`);
    expect(name).toMatch(/^owner-.*\.json$/u);
    expect(
      JSON.parse(await readFile(path.join(`${file}.lock`, name), 'utf8')).pid,
    ).toBe(process.pid);
    expect(tryRuntimeFileLockSync(file)).toBeNull();
    release();
    await withRuntimeFileLock(file, async () => {
      expect(tryRuntimeFileLockSync(file)).toBeNull();
    });
  } finally {
    release();
    await rm(root, { recursive: true, force: true });
  }
});

test('a crashed lock holder is reclaimed safely by competing processes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-crashed-lock-'));
  const file = path.join(root, 'state.json');
  await writeFile(file, '0');
  const moduleUrl = new URL('../dist/runtime-files.js', import.meta.url).href;
  const script = `import { withRuntimeFileLock } from ${JSON.stringify(moduleUrl)};
    import { readFile, writeFile } from 'node:fs/promises';
    if (process.argv[2] === 'crash') {
      await withRuntimeFileLock(process.argv[1], async () => {
        process.send('locked'); await new Promise(() => setInterval(() => {}, 1000));
      });
    } else {
      for (let i=0;i<6;i++) await withRuntimeFileLock(process.argv[1], async () => {
        const value = Number(await readFile(process.argv[1], 'utf8'));
        await new Promise(resolve => setTimeout(resolve, 3));
        await writeFile(process.argv[1], String(value + 1));
      });
    }`;
  const children: ReturnType<typeof spawn>[] = [];
  const start = (mode: string) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', script, file, mode],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    children.push(child);
    return child;
  };
  try {
    const holder = start('crash');
    await once(holder, 'message');
    const crashed = once(holder, 'exit');
    holder.kill('SIGKILL');
    await crashed;
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const child = start('write');
        const [code] = await once(child, 'exit');
        return code;
      }),
    );
    expect(results).toEqual(Array(8).fill(0));
    expect(await readFile(file, 'utf8')).toBe('48');
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
      }
    }
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
