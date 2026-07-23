/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executablePath: vi.fn(() => '/missing/playwright/headless-shell'),
  existsSync: vi.fn(
    (filePath: string) => filePath === '/usr/bin/google-chrome-stable',
  ),
  launch: vi.fn(),
  platform: vi.fn(() => 'linux'),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: mocks.existsSync,
  };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    platform: mocks.platform,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    executablePath: mocks.executablePath,
    launch: mocks.launch,
  },
}));

describe('launchManagedBrowser', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.executablePath.mockReset();
    mocks.executablePath.mockReturnValue('/missing/playwright/headless-shell');
    mocks.existsSync.mockReset();
    mocks.existsSync.mockImplementation(
      (filePath: string) => filePath === '/usr/bin/google-chrome-stable',
    );
    mocks.launch.mockReset();
    mocks.platform.mockReset();
    mocks.platform.mockReturnValue('linux');
    delete process.env.IWSDK_GPU;
  });

  test('uses system Chrome directly when Playwright headless shell is missing', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser, context } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173',
      true,
      false,
      { height: 800, width: 800 },
    );

    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.launch.mock.calls[0]?.[0]).toMatchObject({
      executablePath: '/usr/bin/google-chrome-stable',
      headless: true,
    });
    expect(mocks.launch.mock.calls[0]?.[0]?.args).toContain('--no-sandbox');
    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:5173', {
      waitUntil: 'commit',
    });

    await managedBrowser.close();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('retries with system Chrome when Playwright launch unexpectedly fails', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    mocks.executablePath.mockReturnValue(
      '/installed/playwright/headless-shell',
    );
    mocks.existsSync.mockImplementation(
      (filePath: string) =>
        filePath === '/installed/playwright/headless-shell' ||
        filePath === '/usr/bin/google-chrome-stable',
    );
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch
      .mockRejectedValueOnce(new Error('Chromium launch failed'))
      .mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser('http://127.0.0.1:5173', true, false, {
      height: 800,
      width: 800,
    });

    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[0]?.[0]).toMatchObject({
      headless: true,
    });
    expect(mocks.launch.mock.calls[0]?.[0]).not.toHaveProperty(
      'executablePath',
    );
    expect(mocks.launch.mock.calls[1]?.[0]).toMatchObject({
      executablePath: '/usr/bin/google-chrome-stable',
      headless: true,
    });
    expect(mocks.launch.mock.calls[1]?.[0]?.args).toContain('--no-sandbox');
  });

  test('exposes a managed workspace view switch hook for screenshot targeting', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/__iwsdk/workspace',
      true,
      false,
      { height: 800, width: 800 },
    );
    await managedBrowser.setWorkspaceView('runtime');

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 'runtime');
  });

  test('waits for workspace readiness when IWER is disabled', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser(
      'http://127.0.0.1:5173/__iwsdk/workspace',
      false,
      false,
      null,
      { height: 800, width: 800 },
      false,
      null,
      'workspace',
    );

    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      'workspace',
      { timeout: 15000 },
    );

    const readinessCheck = page.waitForFunction.mock.calls[0]?.[0] as (
      target: string,
    ) => boolean;
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { IWSDK_SCENE_EDITOR: {} },
    });
    try {
      expect(readinessCheck('workspace')).toBe(false);
      (globalThis.window as any).__IWSDK_SCENE_EDITOR_READY = true;
      expect(readinessCheck('workspace')).toBe(true);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: previousWindow,
        });
      }
    }
  });

  test('closes the browser when readiness fails', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    page.waitForFunction.mockRejectedValueOnce(new Error('not ready'));
    const { browser, context } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await expect(
      launchManagedBrowser(
        'http://127.0.0.1:5173/__iwsdk/workspace',
        false,
        false,
        null,
        { height: 800, width: 800 },
        false,
        null,
        'workspace',
      ),
    ).rejects.toThrow('not ready');

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  test('preserves the readiness error when cleanup also fails', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    page.waitForFunction.mockRejectedValueOnce(new Error('not ready'));
    const { browser, context } = createMockBrowser(page);
    context.close.mockRejectedValueOnce(new Error('context cleanup failed'));
    browser.close.mockRejectedValueOnce(new Error('browser cleanup failed'));
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await expect(
      launchManagedBrowser(
        'http://127.0.0.1:5173/__iwsdk/workspace',
        false,
        false,
        null,
        { height: 800, width: 800 },
        false,
        null,
        'workspace',
      ),
    ).rejects.toThrow('not ready');

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});

function createMockBrowser(page: ReturnType<typeof createMockPage>) {
  const context = {
    close: vi.fn(),
    newPage: vi.fn().mockResolvedValue(page),
  };
  const browser = {
    close: vi.fn(),
    newContext: vi.fn().mockResolvedValue(context),
    on: vi.fn(),
  };
  return { browser, context };
}

function createMockPage() {
  return {
    addInitScript: vi.fn(),
    evaluate: vi.fn().mockResolvedValue({ generation: 1, id: 'tab-1' }),
    goto: vi.fn(),
    isClosed: vi.fn(() => false),
    on: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png')),
    waitForFunction: vi.fn(),
  };
}
