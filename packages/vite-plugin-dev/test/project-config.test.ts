/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadIwsdkProject,
  resolveProjectModulePath,
} from '../src/project-config.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-project-config-'));
  await mkdir(path.join(projectRoot, 'public', 'scenes'), { recursive: true });
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'public', 'scenes', 'main.iwsdk.scene.json'),
    '{}',
  );
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('project config discovery', () => {
  it('returns null when a project has not adopted the manifest', () => {
    expect(loadIwsdkProject(projectRoot)).toBeNull();
  });

  it('parses a valid manifest and resolves its existing confined scene', async () => {
    await writeProjectConfig({
      version: 'iwsdk.project.v1',
      scene: './public/scenes/main.iwsdk.scene.json',
      world: { xr: false },
    });

    const canonicalRoot = await realpath(projectRoot);
    expect(loadIwsdkProject(projectRoot)).toMatchObject({
      configPath: path.join(canonicalRoot, 'iwsdk.config.json'),
      manifest: { version: 'iwsdk.project.v1' },
      scenePath: path.join(
        canonicalRoot,
        'public',
        'scenes',
        'main.iwsdk.scene.json',
      ),
    });
  });

  it('reports malformed JSON, schema issues, and missing scenes', async () => {
    await writeFile(path.join(projectRoot, 'iwsdk.config.json'), '{');
    expect(() => loadIwsdkProject(projectRoot)).toThrow(
      'must contain valid JSON',
    );

    await writeProjectConfig({
      version: 'future',
      scene: './public/scenes/main.iwsdk.scene.json',
      world: { xr: false },
    });
    expect(() => loadIwsdkProject(projectRoot)).toThrow(
      '$.version: unsupported project manifest version',
    );

    await writeProjectConfig({
      version: 'iwsdk.project.v1',
      scene: './public/scenes/missing.iwsdk.scene.json',
      world: { xr: false },
    });
    expect(() => loadIwsdkProject(projectRoot)).toThrow(
      'Project scene was not found',
    );
  });
});

describe('project manifest module resolution', () => {
  it('resolves every supported extensionless source form', async () => {
    for (const extension of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']) {
      const source = `assets-${extension.slice(1)}`;
      const expected = path.join(projectRoot, 'src', `${source}${extension}`);
      await writeFile(expected, 'export default {};\n');
      expect(
        resolveProjectModulePath(projectRoot, `./src/${source}`, 'Asset'),
      ).toBe(await realpath(expected));
    }
  });

  it('rejects missing, ambiguous, and symlink-escaped modules', async () => {
    expect(() =>
      resolveProjectModulePath(projectRoot, './src/missing', 'Asset'),
    ).toThrow('Asset manifest module was not found');

    await writeFile(path.join(projectRoot, 'src', 'assets.ts'), 'export {};');
    await writeFile(path.join(projectRoot, 'src', 'assets.js'), 'export {};');
    expect(() =>
      resolveProjectModulePath(projectRoot, './src/assets', 'Asset'),
    ).toThrow('is ambiguous');

    const outside = path.join(path.dirname(projectRoot), 'outside-assets.ts');
    await writeFile(outside, 'export default {};');
    await symlink(outside, path.join(projectRoot, 'src', 'escaped.ts'));
    expect(() =>
      resolveProjectModulePath(projectRoot, './src/escaped', 'Asset'),
    ).toThrow('must stay inside the project root');
    await rm(outside, { force: true });
  });
});

async function writeProjectConfig(value: unknown): Promise<void> {
  await writeFile(
    path.join(projectRoot, 'iwsdk.config.json'),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
