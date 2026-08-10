/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iwsdkDev } from '../src/index.js';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-project-plugin-'));
  await mkdir(path.join(projectRoot, 'public', 'scenes'), { recursive: true });
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await writeFile(
    path.join(projectRoot, 'public', 'scenes', 'main.iwsdk.scene.json'),
    '{}',
  );
  await writeFile(
    path.join(projectRoot, 'src', 'assets.ts'),
    'export default {};\n',
  );
  await writeFile(
    path.join(projectRoot, 'src', 'components.ts'),
    'export default [];\n',
  );
  await writeFile(
    path.join(projectRoot, 'iwsdk.config.json'),
    `${JSON.stringify(
      {
        version: 'iwsdk.project.v1',
        scene: './public/scenes/main.iwsdk.scene.json',
        assets: { module: './src/assets' },
        components: { module: './src/components' },
        world: {
          xr: false,
          render: { near: 0.001, far: 200 },
        },
        dev: {
          emulator: {},
        },
      },
      null,
      2,
    )}\n`,
  );
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('manifest-first Vite integration', () => {
  it('validates the configurable managed-browser bridge timeout', () => {
    expect(() => iwsdkDev({ bridgeReadyTimeoutMs: 0 })).toThrow(
      'iwsdkDev().bridgeReadyTimeoutMs must be a positive integer',
    );
    expect(() => iwsdkDev({ bridgeReadyTimeoutMs: 15000 })).not.toThrow();
  });

  it('fails a production build before bundling invalid public UIKitML', async () => {
    const publicDirectory = path.join(projectRoot, 'public');
    await mkdir(path.join(publicDirectory, 'ui'), { recursive: true });
    const panelPath = path.join(publicDirectory, 'ui', 'panel.uikitml');
    await writeFile(
      panelPath,
      '<div style="padding: 12px 24px">Invalid shorthand</div>',
    );
    const plugin = iwsdkDev({ https: false });
    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      { command: 'build', mode: 'production' },
    );
    callHook(plugin.configResolved, plugin, {
      command: 'build',
      root: projectRoot,
      publicDir: publicDirectory,
      server: {},
    });

    await expect(
      callHook(plugin.buildStart, { addWatchFile: vi.fn() }),
    ).rejects.toThrow(/panel\.uikitml.*Invalid value for property "padding"/s);
  });

  it('rejects retired metadata options even when no project manifest exists', async () => {
    await rm(path.join(projectRoot, 'iwsdk.config.json'));
    const plugin = iwsdkDev({
      assetManifest: './src/assets',
    } as any);

    await expect(
      callHook(
        plugin.config,
        plugin,
        { root: projectRoot },
        { command: 'serve', mode: 'development' },
      ),
    ).rejects.toThrow(
      'iwsdkDev().assetManifest was removed in IWSDK 0.5. Declare the module path in iwsdk.config.json instead.',
    );
  });

  it('discovers project modules and emits ordinary WorldOptions', async () => {
    const plugin = iwsdkDev({ https: false });
    const userConfig: { root: string; server?: { open?: boolean } } = {
      root: projectRoot,
    };
    await callHook(plugin.config, plugin, userConfig, {
      command: 'serve',
      mode: 'development',
    });
    expect(userConfig.server?.open).toBe(false);
    callHook(plugin.configResolved, plugin, {
      command: 'serve',
      root: projectRoot,
      server: {},
    });

    const projectId = callHook(
      plugin.resolveId,
      plugin,
      'virtual:iwsdk-project',
    );
    expect(projectId).toBe('\0virtual:iwsdk-project');
    const source = await callHook(plugin.load, { resolve: vi.fn() }, projectId);
    expect(source).toContain('normalizeProjectWorldOptions(manifest)');
    expect(source).toContain('import.meta.env.BASE_URL');
    expect(source).toContain('level, assets, components');
    expect(source).toContain('"scene":"./public/scenes/main.iwsdk.scene.json"');

    const assetId = callHook(
      plugin.resolveId,
      plugin,
      '/@iwsdk-asset-manifest',
    );
    const assetSource = await callHook(
      plugin.load,
      { resolve: vi.fn() },
      assetId,
    );
    expect(assetSource).toContain(
      `/@fs/${await realpath(path.join(projectRoot, 'src', 'assets.ts'))}`,
    );
  });

  it('does not pass placeholder manifests for omitted optional modules', async () => {
    const manifestPath = path.join(projectRoot, 'iwsdk.config.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    delete manifest.assets;
    delete manifest.components;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const plugin = iwsdkDev({ https: false });

    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      { command: 'serve', mode: 'development' },
    );
    callHook(plugin.configResolved, plugin, {
      command: 'serve',
      root: projectRoot,
      server: {},
    });
    const projectId = callHook(
      plugin.resolveId,
      plugin,
      'virtual:iwsdk-project',
    );
    const source = await callHook(plugin.load, { resolve: vi.fn() }, projectId);

    expect(source).toContain(
      'const projectOptions = { ...normalized, level };',
    );
    expect(source).not.toContain('level, assets');
    expect(source).not.toContain('level, components');
  });

  it('rejects duplicate project authority in plugin options', async () => {
    const plugin = iwsdkDev({
      https: false,
      workspace: { enabled: true },
    });

    await expect(
      callHook(
        plugin.config,
        plugin,
        { root: projectRoot },
        {
          command: 'serve',
          mode: 'development',
        },
      ),
    ).rejects.toThrow(
      'iwsdk.config.json is the project authority: remove iwsdkDev().workspace and select AI/browser launch behavior through the dev command',
    );
  });

  it('accepts explicit dev-session environment overrides', async () => {
    vi.stubEnv('IWSDK_DEV_AI_MODE', 'collaborate');
    vi.stubEnv('IWSDK_DEV_HEADLESS', 'false');
    vi.stubEnv('IWSDK_DEV_OPEN', 'false');
    vi.stubEnv('IWSDK_DEV_SCREENSHOT_WIDTH', '1024');
    vi.stubEnv('IWSDK_DEV_SCREENSHOT_HEIGHT', '768');
    const plugin = iwsdkDev({ https: false });
    const userConfig = {
      root: projectRoot,
      server: { open: true },
    };

    await expect(
      callHook(plugin.config, plugin, userConfig, {
        command: 'serve',
        mode: 'development',
      }),
    ).resolves.toBeUndefined();
    expect(userConfig.server.open).toBe(false);
  });

  it('keeps IWER enabled when a Desktop manifest uses the target-independent default', async () => {
    const plugin = iwsdkDev({ https: false });
    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      {
        command: 'serve',
        mode: 'development',
      },
    );
    callHook(plugin.configResolved, plugin, {
      command: 'serve',
      root: projectRoot,
      server: {},
    });
    await callHook(plugin.buildStart, { addWatchFile: vi.fn() });

    const runtimeId = callHook(
      plugin.resolveId,
      plugin,
      '/@iwer-injection-runtime',
    );
    const runtimeSource = await callHook(
      plugin.load,
      { resolve: vi.fn() },
      runtimeId,
    );

    expect(runtimeSource).toContain('"iwer": true');
    expect(runtimeSource).toContain('"workspace": {');
  });

  it('restarts Vite when the project authority changes', async () => {
    vi.useFakeTimers();
    const plugin = iwsdkDev({ https: false });
    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      {
        command: 'serve',
        mode: 'development',
      },
    );
    const restart = vi.fn(async () => {});

    await expect(
      callHook(plugin.handleHotUpdate, plugin, {
        file: path.join(projectRoot, 'iwsdk.config.json'),
        modules: [],
        server: { restart },
      }),
    ).resolves.toEqual([]);
    expect(restart).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(restart).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not inject the development workspace into production builds', async () => {
    const manifestPath = path.join(projectRoot, 'iwsdk.config.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dev.emulator = { iwer: false, injectOnBuild: true };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = iwsdkDev({ https: false, verbose: true });
    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      {
        command: 'build',
        mode: 'production',
      },
    );
    callHook(plugin.configResolved, plugin, {
      command: 'build',
      root: projectRoot,
      server: {},
    });
    const addWatchFile = vi.fn();

    await callHook(plugin.buildStart, { addWatchFile });

    expect(addWatchFile).toHaveBeenCalledWith(
      path.join(await realpath(projectRoot), 'iwsdk.config.json'),
    );
    expect(log).toHaveBeenCalledWith(
      '⏭️  IWSDK Dev: Skipping build injection (IWER disabled)',
    );
    expect(log).not.toHaveBeenCalledWith(
      '🚀 IWSDK Dev: Starting injection bundle generation...',
    );
  });

  it('keeps production IWER injection independent from the development workspace', async () => {
    const manifestPath = path.join(projectRoot, 'iwsdk.config.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.dev.emulator = { iwer: true, injectOnBuild: true };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const plugin = iwsdkDev({ https: false });
    await callHook(
      plugin.config,
      plugin,
      { root: projectRoot },
      {
        command: 'build',
        mode: 'production',
      },
    );
    callHook(plugin.configResolved, plugin, {
      command: 'build',
      root: projectRoot,
      server: {},
    });
    await callHook(plugin.buildStart, { addWatchFile: vi.fn() });

    const runtimeId = callHook(
      plugin.resolveId,
      plugin,
      '/@iwer-injection-runtime',
    );
    const runtimeSource = await callHook(
      plugin.load,
      { resolve: vi.fn() },
      runtimeId,
    );

    expect(runtimeSource).toContain('"iwer": true');
    expect(runtimeSource).not.toContain('"workspace": {');
  });
});

function callHook(hook: unknown, context: unknown, ...args: unknown[]): any {
  if (typeof hook === 'function') {
    return hook.apply(context, args);
  }
  if (
    hook != null &&
    typeof hook === 'object' &&
    'handler' in hook &&
    typeof (hook as { handler?: unknown }).handler === 'function'
  ) {
    return (
      hook as { handler: (...values: unknown[]) => unknown }
    ).handler.apply(context, args);
  }
  throw new Error('Expected a Vite plugin hook');
}
