/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const CORE_PACKAGE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'core');
const TSC_PATH = path.join(
  WORKSPACE_ROOT,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe('@iwsdk/vite-plugin-dev packed client types', () => {
  it('typechecks virtual:iwsdk-project from an external packed install', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-packed-client-types-'),
    );
    tempDirs.push(tempRoot);
    const packDir = path.join(tempRoot, 'packs');
    const appRoot = path.join(tempRoot, 'consumer');
    await mkdir(packDir, { recursive: true });

    const [pluginArchive, coreArchive] = await Promise.all([
      packPackage(PACKAGE_ROOT, path.join(packDir, 'plugin')),
      packPackage(CORE_PACKAGE_ROOT, path.join(packDir, 'core')),
    ]);
    const packedPluginRoot = path.join(
      appRoot,
      'node_modules',
      '@iwsdk',
      'vite-plugin-dev',
    );
    const packedCoreRoot = path.join(appRoot, 'node_modules', '@iwsdk', 'core');
    await Promise.all([
      extractPackage(pluginArchive, packedPluginRoot),
      extractPackage(coreArchive, packedCoreRoot),
    ]);
    const [canonicalPluginRoot, canonicalCoreRoot] = await Promise.all([
      realpath(packedPluginRoot),
      realpath(packedCoreRoot),
    ]);

    const packedPluginJson = JSON.parse(
      await readFile(path.join(packedPluginRoot, 'package.json'), 'utf8'),
    ) as {
      exports?: Record<string, { types?: string }>;
    };
    expect(packedPluginJson.exports?.['./client']?.types).toBe('./client.d.ts');
    const packedProjectSchema = JSON.parse(
      await readFile(
        path.join(
          packedCoreRoot,
          'dist',
          'schemas',
          'iwsdk-project.v1.schema.json',
        ),
        'utf8',
      ),
    );
    expect(packedProjectSchema.$id).toBe(
      'https://iwsdk.dev/schemas/iwsdk-project.v1.schema.json',
    );

    await mkdir(path.join(appRoot, 'src'), { recursive: true });
    await writeFile(
      path.join(appRoot, 'src', 'main.ts'),
      `/// <reference types="@iwsdk/vite-plugin-dev/client" />
import projectOptions, { manifest } from 'virtual:iwsdk-project';
import type { WorldOptions } from '@iwsdk/core';
import type { IwsdkProjectManifestV1 } from '@iwsdk/core/project';
import type { DevPluginOptions } from '@iwsdk/vite-plugin-dev';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;
type ProjectOptionsContract = Expect<Equal<typeof projectOptions, WorldOptions>>;
type ProjectManifestContract = Expect<Equal<typeof manifest, IwsdkProjectManifestV1>>;
type RetiredMetadataKeys = Extract<
  keyof DevPluginOptions,
  'assetManifest' | 'componentManifest'
>;
type RetiredMetadataContract = Expect<Equal<RetiredMetadataKeys, never>>;

const checkedOptions: WorldOptions = projectOptions;
const checkedManifest: IwsdkProjectManifestV1 = manifest;
const checkedVersion: 'iwsdk.project.v1' = checkedManifest.version;

void [checkedOptions, checkedVersion];
`,
    );
    await writeFile(
      path.join(appRoot, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            noEmit: true,
            skipLibCheck: true,
            strict: true,
            target: 'ES2022',
            types: ['@iwsdk/vite-plugin-dev/client'],
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [TSC_PATH, '--project', appRoot, '--listFiles'],
      {
        cwd: appRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const listedFiles = stdout
      .split(/\r?\n/u)
      .filter((entry) => entry.length > 0)
      .map((entry) => path.normalize(entry));

    expect(listedFiles).toContain(
      path.join(canonicalPluginRoot, 'client.d.ts'),
    );
    expect(listedFiles).toContain(
      path.join(canonicalCoreRoot, 'dist', 'index.d.ts'),
    );
    expect(listedFiles).toContain(
      path.join(canonicalCoreRoot, 'dist', 'project', 'index.d.ts'),
    );
    expect(stdout).not.toContain(
      path.join(WORKSPACE_ROOT, 'packages', 'vite-plugin-dev'),
    );
    expect(stdout).not.toContain(path.join(WORKSPACE_ROOT, 'packages', 'core'));
  }, 30_000);
});

async function packPackage(
  packageRoot: string,
  packDir: string,
): Promise<string> {
  await mkdir(packDir, { recursive: true });
  const before = new Set(await readdir(packDir));
  await execFileAsync(
    'corepack',
    [
      'pnpm@10.18.3',
      '--dir',
      packageRoot,
      'pack',
      '--pack-destination',
      packDir,
    ],
    {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const created = (await readdir(packDir)).filter(
    (entry) => entry.endsWith('.tgz') && !before.has(entry),
  );
  if (created.length !== 1) {
    throw new Error(
      `Expected one packed artifact from ${packageRoot}, received ${created.join(', ') || 'none'}`,
    );
  }
  return path.join(packDir, created[0]);
}

async function extractPackage(
  archivePath: string,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  await execFileAsync(
    'tar',
    ['-xzf', archivePath, '--strip-components=1', '-C', destination],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}
