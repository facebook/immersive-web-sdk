/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  buildDevRuntimeEnvironment,
  resolveDevSessionOptions,
} from '../src/commands/dev.js';
import { buildDevCommandHelp } from '../src/help.js';

describe('dev session options', () => {
  test('preserves headed/open defaults and clears stale session overrides', () => {
    expect(resolveDevSessionOptions({})).toEqual({
      allowBrowserAutomation: false,
      headless: false,
      open: true,
      nativeXRControl: false,
    });

    const environment = buildDevRuntimeEnvironment(
      {},
      {
        KEEP_ME: 'yes',
        IWSDK_DEV_ALLOW_BROWSER_AUTOMATION: 'true',
        IWSDK_DEV_AI_MODE: 'agent',
        IWSDK_DEV_HEADLESS: 'true',
        IWSDK_DEV_OPEN: 'false',
        IWSDK_DEV_NATIVE_XR_CONTROL: 'true',
        IWSDK_DEV_SCREENSHOT_HEIGHT: '10',
        IWSDK_DEV_SCREENSHOT_WIDTH: '10',
      },
    );
    expect(environment).toMatchObject({
      KEEP_ME: 'yes',
      IWSDK_DEV_ALLOW_BROWSER_AUTOMATION: 'false',
      IWSDK_DEV_HEADLESS: 'false',
      IWSDK_DEV_OPEN: 'true',
      IWSDK_DEV_NATIVE_XR_CONTROL: 'false',
    });
    expect(environment.IWSDK_DEV_AI_MODE).toBeUndefined();
    expect(environment.IWSDK_DEV_SCREENSHOT_WIDTH).toBeUndefined();
    expect(environment.IWSDK_DEV_SCREENSHOT_HEIGHT).toBeUndefined();
  });

  test('maps explicit AI, launch, and screenshot settings to child env', () => {
    const options = {
      aiMode: 'agent',
      allowBrowserAutomation: true,
      headless: true,
      noOpen: true,
      nativeXrControl: true,
      screenshotHeight: '720',
      screenshotWidth: '1280',
    };

    expect(resolveDevSessionOptions(options)).toEqual({
      allowBrowserAutomation: true,
      aiMode: 'agent',
      headless: true,
      open: false,
      nativeXRControl: true,
      screenshotHeight: 720,
      screenshotWidth: 1280,
    });
    expect(buildDevRuntimeEnvironment(options, {})).toEqual({
      IWSDK_DEV_ALLOW_BROWSER_AUTOMATION: 'true',
      IWSDK_DEV_AI_MODE: 'agent',
      IWSDK_DEV_HEADLESS: 'true',
      IWSDK_DEV_OPEN: 'false',
      IWSDK_DEV_NATIVE_XR_CONTROL: 'true',
      IWSDK_DEV_SCREENSHOT_HEIGHT: '720',
      IWSDK_DEV_SCREENSHOT_WIDTH: '1280',
    });
  });

  test('supports explicit headed/open choices and AI-derived launch mode', () => {
    expect(resolveDevSessionOptions({ headed: true, open: true })).toEqual({
      allowBrowserAutomation: false,
      headless: false,
      open: true,
      nativeXRControl: false,
    });
    expect(resolveDevSessionOptions({ aiMode: 'agent' })).toMatchObject({
      aiMode: 'agent',
      headless: true,
      nativeXRControl: false,
    });
    expect(resolveDevSessionOptions({ aiMode: 'collaborate' })).toMatchObject({
      aiMode: 'collaborate',
      headless: false,
    });
  });

  test('rejects conflicts and malformed session values', () => {
    expect(() =>
      resolveDevSessionOptions({ headed: true, headless: true }),
    ).toThrow('--headless and --headed cannot be used together');
    expect(() =>
      resolveDevSessionOptions({ noOpen: true, open: true }),
    ).toThrow('--open and --no-open cannot be used together');
    expect(() =>
      resolveDevSessionOptions({ aiMode: 'agent', headed: true }),
    ).toThrow('--ai-mode agent is headless and cannot use --headed');
    expect(() =>
      resolveDevSessionOptions({ aiMode: 'collaborate', headless: true }),
    ).toThrow('--ai-mode collaborate is headed and cannot use --headless');
    expect(() => resolveDevSessionOptions({ aiMode: 'oversight' })).toThrow(
      '--ai-mode must be either "agent" or "collaborate"',
    );
    expect(() => resolveDevSessionOptions({ screenshotWidth: true })).toThrow(
      '--screenshot-width requires a positive integer value',
    );
    expect(() => resolveDevSessionOptions({ open: 'false' })).toThrow(
      '--open does not take a value',
    );
  });
});

describe('dev command help', () => {
  test('documents all operator-owned launch flags and their defaults', () => {
    const help = buildDevCommandHelp('up').join('\n');

    expect(help).toContain('--ai-mode <mode>');
    expect(help).toContain('--headless');
    expect(help).toContain('--headed');
    expect(help).toContain('--open');
    expect(help).toContain('--no-open');
    expect(help).toContain('--screenshot-width <pixels>');
    expect(help).toContain('--screenshot-height <pixels>');
    expect(help).toContain('--allow-browser-automation');
    expect(help).toContain('headed (default)');
    expect(help).toContain('Open the managed browser on startup (default)');
  });
});
