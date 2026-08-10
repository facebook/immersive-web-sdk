/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  validateUIKitMLDirectory,
  validateUIKitMLSource,
} from '../src/uikitml-preflight.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('UIKitML production preflight', () => {
  it('accepts valid Horizon UIKitML', () => {
    expect(() =>
      validateUIKitMLSource(
        '<Button style="padding: 12px">Continue</Button>',
        '/public/ui/menu.uikitml',
      ),
    ).not.toThrow();
  });

  it('reports unsupported shorthand with file and source location', () => {
    expect(() =>
      validateUIKitMLSource(
        '<div style="padding: 12px 24px">Continue</div>',
        '/public/ui/menu.uikitml',
      ),
    ).toThrow(
      /Invalid UIKitML \/public\/ui\/menu\.uikitml:.*Invalid value for property "padding".*0:1/s,
    );
  });

  it('aggregates invalid files while returning valid files for watching', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-uikitml-'));
    tempDirectories.push(root);
    await mkdir(path.join(root, 'ui'), { recursive: true });
    await writeFile(path.join(root, 'ui', 'valid.uikitml'), '<div>OK</div>');
    await expect(validateUIKitMLDirectory(root)).resolves.toEqual([
      path.join(root, 'ui', 'valid.uikitml'),
    ]);

    await writeFile(
      path.join(root, 'ui', 'invalid.uikitml'),
      '<style>.card { padding: 8px 16px; }</style><div class="card" />',
    );
    await expect(validateUIKitMLDirectory(root)).rejects.toThrow(
      /invalid\.uikitml.*Invalid value for property "padding"/s,
    );
  });
});
