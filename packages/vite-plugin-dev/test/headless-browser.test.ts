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

describe('summarizeFrameTimes', () => {
  test.each([
    {
      expected: {
        droppedFrameCount: 0,
        max: null,
        p50: null,
        p95: null,
        sampleCount: 0,
      },
      samples: [],
    },
    {
      expected: {
        droppedFrameCount: 2,
        max: 50,
        p50: 20,
        p95: 50,
        sampleCount: 4,
      },
      samples: [30, 10, 20, 50],
    },
  ])('summarizes $samples', async ({ expected, samples }) => {
    const { summarizeFrameTimes } = await import('../src/headless-browser.js');
    expect(summarizeFrameTimes(samples)).toMatchObject(expected);
  });
});

describe('launchManagedBrowser', () => {
  afterEach(() => {
    vi.useRealTimers();
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
      handleSIGHUP: true,
      handleSIGINT: true,
      handleSIGTERM: true,
      headless: true,
    });
    expect(mocks.launch.mock.calls[0]?.[0]).not.toHaveProperty(
      'executablePath',
    );
    expect(mocks.launch.mock.calls[0]?.[0]?.args).toContain(
      '--ignore-certificate-errors',
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

  test('closes a browser whose launch completes after cancellation', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    let finishLaunch!: (value: typeof browser) => void;
    mocks.launch.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLaunch = resolve;
      }),
    );
    const controller = new AbortController();
    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    const launch = launchManagedBrowser(
      'http://127.0.0.1:5173',
      true,
      false,
      null,
      { height: 800, width: 800 },
      false,
      null,
      'iwer',
      process.cwd(),
      false,
      controller.signal,
    );
    await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
    controller.abort();
    finishLaunch(browser);

    await expect(launch).rejects.toMatchObject({
      code: 'browser_launch_cancelled',
    });
    expect(browser.close).toHaveBeenCalledOnce();
    expect(browser.newContext).not.toHaveBeenCalled();
  });

  test('fires the unexpected-close callback exactly once', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    const callback = vi.fn();
    managedBrowser.onClose(callback);
    const pageClose = page.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1];
    const disconnected = browser.on.mock.calls.find(
      ([event]) => event === 'disconnected',
    )?.[1];

    pageClose?.();
    disconnected?.();

    expect(callback).toHaveBeenCalledOnce();
  });

  test('notifies an onClose listener registered after unexpected closure', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    const pageClose = page.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1];
    pageClose?.();
    const callback = vi.fn();

    managedBrowser.onClose(callback);

    expect(callback).toHaveBeenCalledOnce();
  });

  test('uses the latest onClose listener registered before closure', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    const replaced = vi.fn();
    const latest = vi.fn();
    managedBrowser.onClose(replaced);
    managedBrowser.onClose(latest);
    const pageClose = page.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1];

    pageClose?.();

    expect(replaced).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  test('does not fire the unexpected-close callback during close()', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    const callback = vi.fn();
    managedBrowser.onClose(callback);
    await managedBrowser.close();
    const pageClose = page.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1];
    const disconnected = browser.on.mock.calls.find(
      ([event]) => event === 'disconnected',
    )?.[1];

    pageClose?.();
    disconnected?.();

    expect(callback).not.toHaveBeenCalled();
  });

  test('does not queue idle close behind an unrelated active command', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    let release!: () => void;
    const activeCommand = managedBrowser.runCommandExclusive(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    await expect(
      Promise.race([
        managedBrowser.close().then(() => 'closed'),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('timed-out'), 100),
        ),
      ]),
    ).resolves.toBe('closed');
    release();
    await activeCommand;
  });

  test('bounds close when Chromium disposal does not settle', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser, context } = createMockBrowser(page);
    context.close.mockReturnValueOnce(new Promise<void>(() => {}));
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    let closed = false;
    const close = managedBrowser.close().then(() => {
      closed = true;
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await close;
    expect(closed).toBe(true);
  });

  test('concurrent close waits for the in-flight unexpected-close disposal', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const { browser, context } = createMockBrowser(page);
    let finishContextClose!: () => void;
    context.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishContextClose = resolve;
        }),
    );
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
    );
    const pageClose = page.on.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1];
    pageClose?.();
    await vi.waitFor(() => expect(finishContextClose).toBeTypeOf('function'));
    let closeSettled = false;
    const closePromise = managedBrowser.close().then(() => {
      closeSettled = true;
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);

    finishContextClose();
    await closePromise;
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
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
    expect(page.setDefaultTimeout).toHaveBeenCalledWith(15_000);
    expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(15_000);
    expect(page.screenshot).toHaveBeenCalledWith({
      fullPage: false,
      timeout: 15_000,
      type: 'png',
    });
  });

  test('bounds slow screenshots and snapshots without aborting the browser', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const frame = page.mainFrame();
    page.screenshot.mockRejectedValueOnce(new Error('Screenshot timed out'));
    const snapshotLocator = {
      evaluate: vi.fn().mockRejectedValueOnce(new Error('Snapshot timed out')),
      waitFor: vi.fn().mockResolvedValue(undefined),
    };
    frame.locator.mockReturnValueOnce(snapshotLocator);
    const { browser, context } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
      { height: 800, width: 800 },
    );

    await expect(managedBrowser.captureRuntimeScreenshot()).rejects.toThrow(
      'Screenshot timed out',
    );
    const screenshotTimeout = page.screenshot.mock.calls[0]?.[0]?.timeout;
    expect(screenshotTimeout).toBeGreaterThanOrEqual(100);
    expect(screenshotTimeout).toBeLessThanOrEqual(15_000);
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();

    await expect(managedBrowser.snapshotApplication()).rejects.toThrow(
      'Snapshot timed out',
    );
    const snapshotWait = snapshotLocator.waitFor.mock.calls[0]?.[0];
    expect(snapshotWait).toMatchObject({
      state: 'attached',
    });
    expect(snapshotWait?.timeout).toBeGreaterThanOrEqual(100);
    expect(snapshotWait?.timeout).toBeLessThanOrEqual(15_000);
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });

  test('reloads the resolved application frame through the managed host', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const frame = page.mainFrame();
    frame.evaluate
      .mockResolvedValueOnce({
        documentTimeOrigin: 1,
        generation: 1,
        id: 'tab-1',
      })
      .mockRejectedValueOnce(new Error('Execution context was destroyed'))
      .mockResolvedValueOnce({
        documentTimeOrigin: 2,
        generation: 2,
        id: 'tab-1',
      });
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
      { height: 800, width: 800 },
    );

    await expect(managedBrowser.reloadApplication()).resolves.toEqual({
      generation: 2,
      id: 'tab-1',
      outerUrl: 'http://127.0.0.1:5173/',
      url: 'http://127.0.0.1:5173/',
      workspaceFramed: false,
    });
    expect(frame.evaluate).toHaveBeenCalledWith(expect.any(Function));
    expect(frame.waitForNavigation).toHaveBeenCalledWith({
      timeout: expect.any(Number),
      waitUntil: 'domcontentloaded',
    });
    expect(
      frame.waitForNavigation.mock.calls[0]?.[0]?.timeout,
    ).toBeLessThanOrEqual(20_000);
  });

  test('reports a normal reload failure before the active command aborts', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const frame = page.mainFrame();
    frame.waitForNavigation.mockRejectedValueOnce(
      new Error('Navigation timed out'),
    );
    const { browser, context } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');
    const managedBrowser = await launchManagedBrowser(
      'http://127.0.0.1:5173/',
      true,
      false,
      { height: 800, width: 800 },
    );
    frame.waitForFunction.mockClear();
    frame.waitForFunction.mockRejectedValueOnce(
      new Error('Generation timed out'),
    );

    await expect(managedBrowser.reloadApplication()).rejects.toThrow(
      'Managed application reload did not navigate',
    );
    expect(frame.waitForNavigation).toHaveBeenCalledWith({
      timeout: expect.any(Number),
      waitUntil: 'domcontentloaded',
    });
    expect(
      frame.waitForNavigation.mock.calls[0]?.[0]?.timeout,
    ).toBeLessThanOrEqual(20_000);
    expect(
      frame.waitForFunction.mock.calls[0]?.[2]?.timeout,
    ).toBeLessThanOrEqual(20_000);
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
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
        args: expect.arrayContaining([
          '--app=about:blank',
          '--ignore-certificate-errors',
        ]),
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

    const frame = page.mainFrame();
    expect(frame.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      'workspace',
      { timeout: expect.any(Number) },
    );
    expect(
      frame.waitForFunction.mock.calls[0]?.[2]?.timeout,
    ).toBeLessThanOrEqual(45_000);

    const readinessCheck = frame.waitForFunction.mock.calls[0]?.[0] as (
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

  test('re-resolves readiness after a Vite navigation destroys the frame context', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    const initialFrame = page.mainFrame();
    initialFrame.waitForFunction.mockRejectedValueOnce(
      new Error('Execution context was destroyed during navigation'),
    );
    const reloadedFrame = {
      ...initialFrame,
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    };
    page.mainFrame
      .mockReturnValueOnce(initialFrame)
      .mockReturnValue(reloadedFrame);
    const { browser } = createMockBrowser(page);
    mocks.launch.mockResolvedValueOnce(browser);

    const { launchManagedBrowser } = await import('../src/headless-browser.js');

    await launchManagedBrowser('http://127.0.0.1:5173/', true, false);

    expect(initialFrame.waitForFunction).toHaveBeenCalledTimes(1);
    expect(reloadedFrame.waitForFunction).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).toHaveBeenCalledWith(expect.any(Number));
  });

  test('closes the browser when readiness fails', async () => {
    vi.resetModules();
    process.env.IWSDK_GPU = 'swiftshader';
    const page = createMockPage();
    page
      .mainFrame()
      .waitForFunction.mockRejectedValueOnce(new Error('not ready'));
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
    page
      .mainFrame()
      .waitForFunction.mockRejectedValueOnce(new Error('not ready'));
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

    expect(page.goto).toHaveBeenCalledWith(
      'http://127.0.0.1:5173/?__iwsdkManagedWorkspace=managed-token',
      { waitUntil: 'commit' },
    );
    expect(page.addInitScript).toHaveBeenCalledWith(
      expect.any(Function),
      '__iwsdkManagedWorkspace',
    );

    expect(browser.newContext).toHaveBeenCalledWith({
      ignoreHTTPSErrors: true,
      viewport: { height: 800, width: 800 },
    });
    expect(context.route.mock.invocationCallOrder[0]!).toBeLessThan(
      context.newPage.mock.invocationCallOrder[0]!,
    );
    expect(context.route).toHaveBeenCalledWith('**/*', expect.any(Function));

    const handler = context.route.mock.calls[0]![1];
    const protectedRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace?scene=main',
    );
    await handler(protectedRoute);
    expect(protectedRoute.fetch).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        'x-iwsdk-managed-workspace': 'managed-token',
      },
      maxRedirects: 0,
    });
    expect(protectedRoute.fulfill).toHaveBeenCalledWith({
      response: protectedRoute.response,
    });

    const topLevelRoot = createMockRoute(
      'http://127.0.0.1:5173/?__iwsdkManagedWorkspace=managed-token',
      {
        navigation: true,
        page,
      },
    );
    await handler(topLevelRoot);
    expect(topLevelRoot.continue).toHaveBeenCalledWith();
    expect(topLevelRoot.fetch).not.toHaveBeenCalled();

    const topLevelReload = createMockRoute('http://127.0.0.1:5173/', {
      navigation: true,
      page,
    });
    await handler(topLevelReload);
    expect(topLevelReload.continue).toHaveBeenCalledWith({
      url: 'http://127.0.0.1:5173/?__iwsdkManagedWorkspace=managed-token',
    });
    expect(topLevelReload.fetch).not.toHaveBeenCalled();

    const protectedDocumentNavigation = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace/files',
      { navigation: true, page },
    );
    await handler(protectedDocumentNavigation);
    expect(protectedDocumentNavigation.continue).toHaveBeenCalledWith();
    expect(protectedDocumentNavigation.fetch).not.toHaveBeenCalled();

    const iframeRoot = createMockRoute('http://127.0.0.1:5173/', {
      navigation: true,
      parentFrame: {},
    });
    await handler(iframeRoot);
    expect(iframeRoot.continue).toHaveBeenCalledWith();

    const untrustedProtectedRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace/files',
      { frameUrl: 'https://untrusted.example/' },
    );
    await handler(untrustedProtectedRoute);
    expect(untrustedProtectedRoute.continue).toHaveBeenCalledWith();

    const untrustedPreflightRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace/files',
      { frameUrl: 'https://untrusted.example/', method: 'OPTIONS' },
    );
    await handler(untrustedPreflightRoute);
    expect(untrustedPreflightRoute.continue).toHaveBeenCalledWith();

    const nestedBlankRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace/files',
      { frameUrl: 'about:blank', parentFrame: {} },
    );
    await handler(nestedBlankRoute);
    expect(nestedBlankRoute.continue).toHaveBeenCalledWith();

    const redirectedExternalRoute = createMockRoute(
      'https://attacker.example/capture',
      {
        headers: {
          accept: 'text/html',
          referer:
            'http://127.0.0.1:5173/?__iwsdkManagedWorkspace=managed-token&case=initial',
          'X-IWSDK-Managed-Workspace': 'managed-token',
        },
      },
    );
    await handler(redirectedExternalRoute);
    expect(redirectedExternalRoute.continue).toHaveBeenCalledWith({
      headers: {
        accept: 'text/html',
        referer: 'http://127.0.0.1:5173/?case=initial',
      },
    });

    const failedProtectedRoute = createMockRoute(
      'http://127.0.0.1:5173/__iwsdk/workspace/scenes',
    );
    failedProtectedRoute.fetch.mockRejectedValueOnce(new Error('fetch failed'));
    await handler(failedProtectedRoute);
    expect(failedProtectedRoute.abort).toHaveBeenCalledWith('failed');
    expect(failedProtectedRoute.continue).not.toHaveBeenCalled();

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
  options: {
    frameUrl?: string;
    headers?: Record<string, string>;
    method?: string;
    navigation?: boolean;
    page?: object;
    parentFrame?: object | null;
  } = {},
) {
  const response = { ok: true, url };
  return {
    abort: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn(),
    fetch: vi.fn().mockResolvedValue(response),
    fulfill: vi.fn(),
    request: vi.fn(() => ({
      frame: vi.fn(() => ({
        page: vi.fn(() => options.page),
        parentFrame: vi.fn(() => options.parentFrame ?? null),
        url: vi.fn(() => options.frameUrl ?? 'http://127.0.0.1:5173/'),
      })),
      headers: vi.fn(() => options.headers ?? { accept: 'text/html' }),
      isNavigationRequest: vi.fn(() => options.navigation === true),
      method: vi.fn(() => options.method ?? 'GET'),
      url: vi.fn(() => url),
    })),
    response,
  };
}

function createMockPage() {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2yZkWQAAAABJRU5ErkJggg==',
    'base64',
  );
  const frame = {
    evaluate: vi.fn().mockResolvedValue({ generation: 1, id: 'tab-1' }),
    locator: vi.fn(),
    url: vi.fn(() => 'http://127.0.0.1:5173/'),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(null),
  };
  return {
    $: vi.fn().mockResolvedValue(null),
    addInitScript: vi.fn(),
    evaluate: vi.fn().mockResolvedValue({ generation: 1, id: 'tab-1' }),
    goto: vi.fn(),
    isClosed: vi.fn(() => false),
    mainFrame: vi.fn(() => frame),
    on: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(png),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    url: vi.fn(() => 'http://127.0.0.1:5173/'),
    waitForFunction: vi.fn(),
    waitForTimeout: vi.fn(),
  };
}
