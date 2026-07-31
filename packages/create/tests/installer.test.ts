/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import crossSpawn from 'cross-spawn';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installDependenciesFromBundle } from '../src/installer.js';
import type { ResolvedSource } from '../src/source.js';

// Mock cross-spawn before importing installer
vi.mock('cross-spawn', () => {
  const { EventEmitter } = require('events');
  let nextExitCode = 0;
  return {
    default: vi.fn(() => {
      const child = new EventEmitter();
      // Emit exit on next tick so the promise handler is attached first
      process.nextTick(() => child.emit('exit', nextExitCode));
      return child;
    }),
    spawn: vi.fn(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', nextExitCode));
      return child;
    }),
    __setExitCode: (code: number) => {
      nextExitCode = code;
    },
  };
});

/** Create a fake ResolvedSource that maps known packages to file: paths */
function makeFakeSource(packageMap: Record<string, string>): ResolvedSource {
  return {
    isBundleMode: true,
    prepare: async () => {},
    fetchIndex: async () => [],
    fetchRecipe: async () => ({ name: 'fake' }),
    getPackageInstallSpec: (name: string) => packageMap[name],
    getPackageInstallSpecs: () => packageMap,
    downloadPackages: async () => {},
    resolveRecipeUrls: (recipe) => recipe,
    cleanup: async () => {},
  };
}

describe('installDependenciesFromBundle', () => {
  let tmpDir: string;
  let pkgPath: string;

  const originalPkg = {
    name: 'test-app',
    dependencies: {
      '@iwsdk/core': '^0.1.0',
      '@iwsdk/starter-assets': '^0.1.0',
      three: '^0.165.0',
      vite: '^5.0.0',
    },
    devDependencies: {
      '@iwsdk/cli': '^0.1.0',
      '@iwsdk/vite-plugin-dev': '^0.1.0',
      vitest: '^2.0.0',
    },
  };

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'installer-test-'));
    pkgPath = path.join(tmpDir, 'package.json');
    await fsp.writeFile(pkgPath, JSON.stringify(originalPkg, null, 2) + '\n');

    // Reset exit code to success
    const mock = await import('cross-spawn');
    (mock as any).__setExitCode(0);
    vi.mocked(crossSpawn).mockClear();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('rewrites @iwsdk/* deps in both dependencies and devDependencies to file: paths', async () => {
    const source = makeFakeSource({
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
      '@iwsdk/starter-assets':
        'file:.sdk-packages/starter-assets/iwsdk-starter-assets.tgz',
      '@iwsdk/cli': 'file:.sdk-packages/cli/iwsdk-cli.tgz',
      '@iwsdk/vite-plugin-dev':
        'file:.sdk-packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
    });

    await installDependenciesFromBundle(tmpDir, source);

    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    expect(pkg.dependencies['@iwsdk/core']).toBe(
      'file:.sdk-packages/core/iwsdk-core.tgz',
    );
    expect(pkg.dependencies['@iwsdk/starter-assets']).toBe(
      'file:.sdk-packages/starter-assets/iwsdk-starter-assets.tgz',
    );
    expect(pkg.devDependencies['@iwsdk/cli']).toBe(
      'file:.sdk-packages/cli/iwsdk-cli.tgz',
    );
    expect(pkg.devDependencies['@iwsdk/vite-plugin-dev']).toBe(
      'file:.sdk-packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
    );
  });

  it('leaves non-@iwsdk/* deps untouched', async () => {
    const source = makeFakeSource({
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
      '@iwsdk/starter-assets':
        'file:.sdk-packages/starter-assets/iwsdk-starter-assets.tgz',
      '@iwsdk/cli': 'file:.sdk-packages/cli/iwsdk-cli.tgz',
      '@iwsdk/vite-plugin-dev':
        'file:.sdk-packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
    });

    await installDependenciesFromBundle(tmpDir, source);

    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    expect(pkg.dependencies['three']).toBe('^0.165.0');
    expect(pkg.dependencies['vite']).toBe('^5.0.0');
    expect(pkg.devDependencies['vitest']).toBe('^2.0.0');
  });

  it('does NOT restore original package.json — file: paths remain permanently', async () => {
    const source = makeFakeSource({
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
    });

    await installDependenciesFromBundle(tmpDir, source);

    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    // file: path should still be there after install
    expect(pkg.dependencies['@iwsdk/core']).toBe(
      'file:.sdk-packages/core/iwsdk-core.tgz',
    );
  });

  it('adds bundle overrides for transitive @iwsdk/* packages without conflicting with direct deps', async () => {
    const source = makeFakeSource({
      '@iwsdk/cli': 'file:.sdk-packages/cli/iwsdk-cli.tgz',
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
      '@iwsdk/scene-composition':
        'file:.sdk-packages/scene-composition/iwsdk-scene-composition.tgz',
      '@iwsdk/vite-plugin-dev':
        'file:.sdk-packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
    });

    await installDependenciesFromBundle(tmpDir, source);

    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    expect(pkg.dependencies['@iwsdk/core']).toBe(
      'file:.sdk-packages/core/iwsdk-core.tgz',
    );
    expect(pkg.devDependencies['@iwsdk/cli']).toBe(
      'file:.sdk-packages/cli/iwsdk-cli.tgz',
    );
    expect(pkg.overrides).toMatchObject({
      '@iwsdk/scene-composition':
        'file:.sdk-packages/scene-composition/iwsdk-scene-composition.tgz',
    });
    expect(pkg.overrides).not.toHaveProperty('@iwsdk/cli');
    expect(pkg.overrides).not.toHaveProperty('@iwsdk/core');
  });

  it('does NOT restore package.json after install failure', async () => {
    const mock = await import('cross-spawn');
    (mock as any).__setExitCode(1);

    const source = makeFakeSource({
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
    });

    await expect(installDependenciesFromBundle(tmpDir, source)).rejects.toThrow(
      'Install failed',
    );

    // file: path should still be in package.json (no restore)
    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    expect(pkg.dependencies['@iwsdk/core']).toBe(
      'file:.sdk-packages/core/iwsdk-core.tgz',
    );
  });

  it('skips @iwsdk/* deps when source returns undefined', async () => {
    // Source only knows about core, not starter-assets or devDeps
    const source = makeFakeSource({
      '@iwsdk/core': 'file:.sdk-packages/core/iwsdk-core.tgz',
    });

    await installDependenciesFromBundle(tmpDir, source);

    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    expect(pkg.dependencies['@iwsdk/core']).toBe(
      'file:.sdk-packages/core/iwsdk-core.tgz',
    );
    // starter-assets should remain unchanged since source doesn't know it
    expect(pkg.dependencies['@iwsdk/starter-assets']).toBe('^0.1.0');
    // devDeps should also remain unchanged
    expect(pkg.devDependencies['@iwsdk/cli']).toBe('^0.1.0');
    expect(pkg.devDependencies['@iwsdk/vite-plugin-dev']).toBe('^0.1.0');
  });
});
