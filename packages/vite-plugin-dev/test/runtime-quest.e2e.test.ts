/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from 'child_process';
import { appendFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { test, expect } from 'vitest';
import { getRuntimeSession } from '../../cli/src/runtime-state.js';
import { sendRuntimeCommand } from '../../cli/src/runtime-transport.js';
import { createEditorTestHarness } from './editor-e2e-fixture.js';

// Explicit opt-in only: the operator owns device wake, prompts and tracking.
const serial = process.env.IWSDK_QUEST_SERIAL;
test
  .skipIf(!serial)
  .each(['presenting-1', 'ending-1', 'presenting-2', 'ending-2'])(
  'native Quest explicit target, ECS, and reload with managed default: %s',
  async (scenario) => {
    const previousGpu = process.env.IWSDK_GPU;
    const previousNativeControl = process.env.IWSDK_DEV_NATIVE_XR_CONTROL;
    process.env.IWSDK_DEV_NATIVE_XR_CONTROL = 'true';
    const previousHeadless = process.env.IWSDK_DEV_HEADLESS;
    process.env.IWSDK_DEV_HEADLESS = 'true';
    process.env.IWSDK_GPU = 'swiftshader';
    let harness: Awaited<ReturnType<typeof createEditorTestHarness>>;
    try {
      harness = await createEditorTestHarness('native-quest-routing', {
        managedBrowser: true,
        https: false,
        nativeXR: true,
      });
    } catch (error) {
      if (previousNativeControl == null) {
        delete process.env.IWSDK_DEV_NATIVE_XR_CONTROL;
      } else {
        process.env.IWSDK_DEV_NATIVE_XR_CONTROL = previousNativeControl;
      }
      if (previousGpu == null) {
        delete process.env.IWSDK_GPU;
      } else {
        process.env.IWSDK_GPU = previousGpu;
      }
      throw error;
    } finally {
      if (previousHeadless == null) {
        delete process.env.IWSDK_DEV_HEADLESS;
      } else {
        process.env.IWSDK_DEV_HEADLESS = previousHeadless;
      }
    }
    const adb = (...args: string[]) =>
      execFileSync('adb', ['-s', serial!, ...args], {
        encoding: 'utf8',
        timeout: 15000,
      });
    let port: number | undefined;
    let debugPort: number | undefined;
    let deviceBrowser: Browser | undefined;
    let devicePage: Page | undefined;
    let reverseCreated = false;
    const command = async (method: string, params = {}, target?: any) => {
      const session = (await getRuntimeSession(harness.tempRoot))!;
      return sendRuntimeCommand({
        port: session.port,
        runtimeSession: session,
        method,
        params,
        target,
        timeoutMs: 60000,
      });
    };
    const status = async () =>
      (await command('runtime_get_status')).result as any;
    try {
      await expect
        .poll(
          async () =>
            (await status()).targets.some(
              (target: any) =>
                target.deviceClass === 'managed' &&
                target.role === 'app' &&
                target.commandReady,
            ),
          { timeout: 60000 },
        )
        .toBe(true);
      const session = (await getRuntimeSession(harness.tempRoot))!;
      port = session.port;
      const mappings = adb('reverse', '--list');
      if (
        !mappings
          .split('\n')
          .some((line) => line.split(/\s+/)[1] === `tcp:${port}`)
      ) {
        adb('reverse', `tcp:${port}`, `tcp:${port}`);
        reverseCreated = true;
      } else if (
        !mappings
          .split('\n')
          .some((line) => line.trim().endsWith(`tcp:${port} tcp:${port}`))
      ) {
        throw new Error(
          `Existing reverse for port ${port} belongs to another target`,
        );
      }
      const pair = (
        await command('runtime_pair_headset', { headsetId: serial })
      ).result as any;
      // Exercise normal URLs, hash routes, and the otherwise easy-to-miss
      // empty fragment. All must load a new document and keep the app address.
      pair.url +=
        scenario === 'presenting-2'
          ? '#'
          : scenario === 'ending-2'
            ? '&q=a%20b&debug&path=/levels/2&tags=a,b#native-check'
            : scenario === 'ending-1'
              ? '#native-check'
              : '';
      await writeFile(
        path.join(os.tmpdir(), 'iwsdk-quest-run.json'),
        JSON.stringify(
          { serial, port, url: pair.url, workspace: harness.tempRoot },
          null,
          2,
        ),
      );
      adb(
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        // adb shell joins arguments into a remote shell command. Protect raw
        // query separators (and quotes) instead of letting the shell parse them.
        `'${pair.url.replaceAll("'", "'\\''")}'`,
        'com.oculus.browser',
      );
      const physical = async () =>
        (await status()).targets.find(
          (target: any) =>
            target.headsetId === serial &&
            target.role === 'app' &&
            target.commandReady,
        );
      await expect
        .poll(physical, { timeout: 150000, interval: 1000 })
        .toBeTruthy();
      const before = await physical();
      debugPort = Number(
        adb('forward', 'tcp:0', 'localabstract:chrome_devtools_remote').trim(),
      );
      deviceBrowser = await chromium.connectOverCDP(
        `http://127.0.0.1:${debugPort}`,
      );
      devicePage = deviceBrowser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url() === pair.url);
      expect(devicePage).toBeTruthy();
      const nativeLog = path.join(os.tmpdir(), 'iwsdk-quest-browser.log');
      await writeFile(nativeLog, '');
      const log = (message: string) =>
        void appendFile(nativeLog, `${message}\n`).catch(() => {});
      devicePage!.on('console', (message) =>
        log(`${message.type()}: ${message.text()}`),
      );
      devicePage!.on('pageerror', (error) => log(`pageerror: ${error.stack}`));
      devicePage!.on('requestfailed', (request) =>
        log(`requestfailed: ${request.url()} ${request.failure()?.errorText}`),
      );
      const cdp = await devicePage!.context().newCDPSession(devicePage!);
      await cdp.send('Runtime.evaluate', {
        expression: 'window.__APP_WORLD.launchXR()',
        userGesture: true,
      });
      await cdp.detach();
      // The operator uses MetaVR to accept the browser permission prompt;
      // this assertion independently observes the actual native session.
      await expect
        .poll(
          () =>
            devicePage!.evaluate(() =>
              Boolean((window as any).__APP_WORLD?.renderer.xr.isPresenting),
            ),
          { timeout: 150000, interval: 1000 },
        )
        .toBe(true);
      const xr = await devicePage!.evaluate(() => ({
        presenting: (window as any).__APP_WORLD.renderer.xr.isPresenting,
        emulation: (window as any).__IWSDK_EMULATION_PROFILE?.active,
        runtime: (window as any).__IWSDK_EMULATION_PROFILE?.runtime,
        nativeOverrideInstalled: (window as any).IWER_NATIVE_OVERRIDE
          ?.installed,
        userAgent: navigator.userAgent,
        reloadHook: typeof (window as any).FRAMEWORK_MCP_RUNTIME
          ?.prepareForReload,
        worldSession: Boolean((window as any).__APP_WORLD.session),
      }));
      expect(xr.runtime).toBe('IWER-native-override');
      expect(xr.nativeOverrideInstalled).toBe(true);
      expect(xr.userAgent).toContain('OculusBrowser');
      await writeFile(
        path.join(os.tmpdir(), `iwsdk-quest-xr-proof-${scenario}.json`),
        JSON.stringify({ serial, before, xr }, null, 2),
      );
      const systems = await command(
        'ecs_list_systems',
        {},
        before.runtimeTarget,
      );
      expect(systems.error).toBeUndefined();
      await expect(
        command('browser_snapshot', {}, before.runtimeTarget),
      ).rejects.toMatchObject({
        details: { code: 'unsupported_on_target', outcome: 'not_executed' },
      });
      const managedBefore = (await status()).targets.find(
        (target: any) =>
          target.deviceClass === 'managed' && target.role === 'app',
      );
      expect((await command('browser_snapshot')).error).toBeUndefined();
      // Exercise the native adapter's fire-and-forget exit immediately before
      // reload. The unit test pins the pending-event race deterministically.
      if (scenario.startsWith('ending')) {
        expect(
          (await command('end_session', {}, before.runtimeTarget)).error,
        ).toBeUndefined();
      }
      expect(
        (await command('reload_page', {}, before.runtimeTarget)).error,
      ).toBeUndefined();
      await expect
        .poll(async () => (await physical())?.tabGeneration, { timeout: 60000 })
        .toBeGreaterThan(before.tabGeneration);
      const after = await physical();
      expect(after.pageId).toBe(before.pageId);
      expect(devicePage!.url()).toBe(pair.url);
      await expect(
        command('ecs_list_systems', {}, before.runtimeTarget),
      ).rejects.toMatchObject({ details: { code: 'stale_browser_tab' } });
      expect(
        (await command('ecs_list_systems', {}, after.runtimeTarget)).error,
      ).toBeUndefined();
      const managedAfter = (await status()).targets.find(
        (target: any) =>
          target.deviceClass === 'managed' && target.role === 'app',
      );
      expect(managedAfter.runtimeTarget).toEqual(managedBefore.runtimeTarget);
      await writeFile(
        path.join(os.tmpdir(), `iwsdk-quest-validation-${scenario}.json`),
        JSON.stringify(
          {
            serial,
            before,
            after,
            systems: systems.result,
            xr,
            managedUnaffected: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await devicePage?.close().catch(() => {});
      await deviceBrowser?.close().catch(() => {});
      try {
        try {
          if (debugPort != null) {
            adb('forward', '--remove', `tcp:${debugPort}`);
          }
        } finally {
          if (reverseCreated && port != null) {
            adb('reverse', '--remove', `tcp:${port}`);
          }
        }
      } finally {
        try {
          await harness.close();
        } finally {
          if (previousNativeControl == null) {
            delete process.env.IWSDK_DEV_NATIVE_XR_CONTROL;
          } else {
            process.env.IWSDK_DEV_NATIVE_XR_CONTROL = previousNativeControl;
          }
          if (previousGpu == null) {
            delete process.env.IWSDK_GPU;
          } else {
            process.env.IWSDK_GPU = previousGpu;
          }
        }
      }
    }
  },
  600000,
);
