/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executablePath: vi.fn(() => '/installed/playwright/chromium'),
  existsSync: vi.fn(
    (filePath: string) => filePath === '/installed/playwright/chromium',
  ),
  launch: vi.fn(),
  launchPersistentContext: vi.fn(),
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
    launchPersistentContext: mocks.launchPersistentContext,
  },
}));

describe('launchManagedBrowser', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.executablePath.mockReset();
    mocks.executablePath.mockReturnValue('/installed/playwright/chromium');
    mocks.existsSync.mockReset();
    mocks.existsSync.mockImplementation(
      (filePath: string) => filePath === '/installed/playwright/chromium',
    );
    mocks.launch.mockReset();
    mocks.launchPersistentContext.mockReset();
    mocks.platform.mockReset();
    mocks.platform.mockReturnValue('linux');
    delete process.env.IWSDK_CHROME_EXECUTABLE;
    delete process.env.IWSDK_GPU;
  });

  test('always uses Playwright Chromium even when a system executable is configured', async () => {
    vi.resetModules();
    process.env.IWSDK_CHROME_EXECUTABLE = '/approved/Google Chrome';
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser('http://127.0.0.1:5173', true, false, {
      height: 800,
      width: 800,
    });

    expect(mocks.executablePath).toHaveBeenCalled();
    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.existsSync).toHaveBeenCalledWith(
      '/installed/playwright/chromium',
    );
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.launchPersistentContext).not.toHaveBeenCalled();
    expect(mocks.launch.mock.calls[0]?.[0]).toMatchObject({
      headless: true,
    });
    expect(mocks.launch.mock.calls[0]?.[0]).not.toHaveProperty(
      'executablePath',
    );
    expect(mocks.launch.mock.calls[0]?.[0]?.args).not.toContain('--no-sandbox');
  });

  test('does not retry with system Chrome when Playwright launch fails', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    mocks.launch.mockRejectedValueOnce(new Error('Playwright Chromium failed'));

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await expect(
      launchManagedBrowser('http://127.0.0.1:5173', true, false),
    ).rejects.toThrow('Playwright Chromium failed');
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.launch.mock.calls[0]?.[0]).not.toHaveProperty(
      'executablePath',
    );
  });

  test('switches the workspace to runtime before taking a browser screenshot', async () => {
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
    await managedBrowser.captureRuntimeScreenshot();

    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(page.screenshot).toHaveBeenCalledWith({ type: 'png' });
  });

  test('waits for workspace readiness when IWER is disabled', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { context } = createMockBrowser(page);
    context.pages.mockReturnValue([page]);
    mocks.launchPersistentContext.mockResolvedValueOnce(context);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      false,
      false,
      null,
      { height: 800, width: 800 },
      false,
      null,
      'workspace',
    );

    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.launchPersistentContext).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        args: expect.arrayContaining(['--app=http://127.0.0.1:5173/']),
        headless: false,
        ignoreDefaultArgs: ['about:blank'],
        ignoreHTTPSErrors: true,
        viewport: null,
      }),
    );
    expect(context.newPage).not.toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:5173/', {
      waitUntil: 'commit',
    });

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
    context.pages.mockReturnValue([page]);
    mocks.launchPersistentContext.mockResolvedValueOnce(context);

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
    context.pages.mockReturnValue([page]);
    mocks.launchPersistentContext.mockResolvedValueOnce(context);

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

  test('scopes managed access to protected launch-origin paths', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser, context } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
      { height: 800, width: 800 },
      { height: 800, width: 800 },
      false,
      {
        headerName: 'x-iwsdk-managed-workspace',
        pathnames: [
          '/__iwsdk/workspace',
          '/__iwsdk/workspace/scenes',
          '/__iwsdk/editor/document',
        ],
        topLevelPathnames: ['/'],
        token: 'managed-token',
      },
    );

    expect(page.goto).toHaveBeenCalledWith('http://127.0.0.1:5173/', {
      waitUntil: 'commit',
    });

    expect(browser.newContext).toHaveBeenCalledWith({
      ignoreHTTPSErrors: true,
      viewport: { height: 800, width: 800 },
    });
    expect(context.route.mock.invocationCallOrder[0]!).toBeLessThan(
      context.newPage.mock.invocationCallOrder[0]!,
    );
    expect(context.route).toHaveBeenCalledWith(
      'http://127.0.0.1:5173/**',
      expect.any(Function),
    );

    const handler = context.route.mock.calls[0]![1];
    const protectedRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace?scene=main',
    );
    await handler(protectedRoute);
    expect(protectedRoute.continue).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        'x-iwsdk-managed-workspace': 'managed-token',
      },
    });

    const topLevelRoot = createMockRoute('http://127.0.0.1:5173/', {
      navigation: true,
    });
    await handler(topLevelRoot);
    expect(topLevelRoot.continue).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        'x-iwsdk-managed-workspace': 'managed-token',
      },
    });

    const iframeRoot = createMockRoute('http://127.0.0.1:5173/', {
      navigation: true,
      parentFrame: {},
    });
    await handler(iframeRoot);
    expect(iframeRoot.continue).toHaveBeenCalledWith();

    for (const requestUrl of [
      'http://127.0.0.1:5173/models/controller.glb',
      'http://127.0.0.1:5174/__iwsdk/workspace',
      'https://cdn.example.com/controller.glb',
    ]) {
      const route = createMockRoute(requestUrl);
      await handler(route);
      expect(route.continue).toHaveBeenCalledWith();
    }
  });
});

function createMockBrowser(page: ReturnType<typeof createMockPage>) {
  const context = {
    browser: vi.fn(),
    close: vi.fn(),
    newPage: vi.fn().mockResolvedValue(page),
    pages: vi.fn(() => [] as ReturnType<typeof createMockPage>[]),
    route: vi.fn(),
  };
  const browser = {
    close: vi.fn(),
    newContext: vi.fn().mockResolvedValue(context),
    on: vi.fn(),
  };
  context.browser.mockReturnValue(browser);
  return { browser, context };
}

function createMockRoute(
  url: string,
  options: { navigation?: boolean; parentFrame?: object | null } = {},
) {
  return {
    continue: vi.fn(),
    request: vi.fn(() => ({
      frame: vi.fn(() => ({
        parentFrame: vi.fn(() => options.parentFrame ?? null),
      })),
      headers: vi.fn(() => ({ accept: 'text/html' })),
      isNavigationRequest: vi.fn(() => options.navigation === true),
      url: vi.fn(() => url),
    })),
  };
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
