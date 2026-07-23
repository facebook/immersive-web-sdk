/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isValidProjectTarget,
  resolveProjectTarget,
  targetHasContent,
} from '../src/project-target.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

describe('project target', () => {
  it('uses dot for in-place scaffolding and derives a package name', () => {
    const cwd = path.join(os.tmpdir(), 'My Cloud Repository');

    expect(resolveProjectTarget(' . ', cwd)).toEqual({
      appName: 'my-cloud-repository',
      displayPath: '.',
      inPlace: true,
      outDir: cwd,
    });
  });

  it('keeps named projects in a child directory', () => {
    expect(resolveProjectTarget('my-app', '/workspace')).toEqual({
      appName: 'my-app',
      displayPath: 'my-app',
      inPlace: false,
      outDir: path.join('/workspace', 'my-app'),
    });
  });

  it('accepts dot but rejects parent and nested paths', () => {
    expect(isValidProjectTarget('.')).toBe(true);
    expect(isValidProjectTarget('my-app')).toBe(true);
    expect(isValidProjectTarget('..')).toBe(false);
    expect(isValidProjectTarget('./app')).toBe(false);
  });

  it('detects every existing entry, including repository metadata', () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwsdk-target-'));
    tempDirs.push(targetDir);
    const target = resolveProjectTarget('.', targetDir);

    expect(targetHasContent(target)).toBe(false);
    fs.mkdirSync(path.join(targetDir, '.git'));
    expect(targetHasContent(target)).toBe(true);
  });

  it('rejects an existing target that is not a directory', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'iwsdk-target-'));
    tempDirs.push(cwd);
    fs.writeFileSync(path.join(cwd, 'my-app'), 'not a directory');

    expect(() => targetHasContent(resolveProjectTarget('my-app', cwd))).toThrow(
      'Target "my-app" is not a directory.',
    );
  });
});
