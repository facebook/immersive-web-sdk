/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
} from 'playwright';
import sharp from 'sharp';

/**
 * Log types for the server-side console capture.
 */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export interface CapturedLog {
  timestamp: number;
  level: LogLevel;
  message: string;
  args: string[];
  repeatCount?: number;
}

export interface LogQuery {
  count?: number;
  level?: LogLevel | LogLevel[];
  pattern?: string;
  since?: number;
  until?: number;
}

const MAX_LOGS = 1000;
const TRACE_PREFIX = '[IWSDK-MCP-TRACE]';

/** Map Playwright console message types to our LogLevel. */
const PLAYWRIGHT_TYPE_MAP: Record<string, LogLevel | undefined> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
  trace: 'trace',
  assert: 'error',
};

/**
 * Server-side console capture that accumulates Playwright console events.
 */
class ServerSideConsoleCapture {
  private logs: CapturedLog[] = [];

  add(level: LogLevel, message: string): void {
    // Log compaction: if the last entry has the same level + message,
    // increment repeatCount instead of adding a new entry.
    const last = this.logs[this.logs.length - 1];
    if (last && last.level === level && last.message === message) {
      last.repeatCount = (last.repeatCount ?? 1) + 1;
      last.timestamp = Date.now();
      return;
    }

    this.logs.push({
      timestamp: Date.now(),
      level,
      message,
      args: [message],
    });

    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
  }

  query(options: LogQuery = {}): CapturedLog[] {
    let result = [...this.logs];

    if (options.level) {
      const levels = Array.isArray(options.level)
        ? options.level
        : [options.level];
      if (levels.length > 0) {
        result = result.filter((log) => levels.includes(log.level));
      }
    }

    if (options.since) {
      result = result.filter((log) => log.timestamp >= options.since!);
    }
    if (options.until) {
      result = result.filter((log) => log.timestamp <= options.until!);
    }

    if (options.pattern) {
      const regex = new RegExp(options.pattern, 'i');
      result = result.filter((log) => regex.test(log.message));
    }

    if (options.count && options.count > 0) {
      result = result.slice(-options.count);
    }

    return result;
  }
}

export interface ManagedBrowser {
  close(): Promise<void>;
  page: unknown; // playwright.Page
  /** Query captured console logs. */
  queryLogs(options?: LogQuery): CapturedLog[];
  /** Read the managed browser tab identity used by MCP metadata. */
  getTabMetadata(): Promise<{ id: string | null; generation: number | null }>;
  /** Switch the managed workspace view before a browser-level capture. */
  setWorkspaceView(view: 'runtime' | 'editor' | 'split'): Promise<boolean>;
  /** Take a screenshot of the browser page via CDP. */
  screenshot(): Promise<Buffer>;
  /** Register a callback invoked when the page/browser closes unexpectedly. */
  onClose(callback: () => void): void;
  /** Whether the underlying Playwright page has been closed. */
  isClosed(): boolean;
}

export interface ManagedBrowserAccess {
  headerName: string;
  pathnames: readonly string[];
  token: string;
}

export type ManagedBrowserReadiness = 'iwer' | 'workspace';

async function closeAfterLaunchFailure(
  browser: Browser,
  context?: BrowserContext,
): Promise<void> {
  if (context) {
    try {
      await context.close();
    } catch {}
  }
  try {
    await browser.close();
  } catch {}
}

let chromiumInstalled = false;
let installPromise: Promise<void> | null = null;

/**
 * Verify the Chromium binary exists and install it automatically if missing.
 * Uses a Promise guard so concurrent callers share one install attempt.
 * On install failure the flag stays unset so the next retry can try again.
 */
async function ensureChromiumInstalled(): Promise<void> {
  if (chromiumInstalled) {
    return;
  }
  if (installPromise) {
    return installPromise;
  }

  if (
    fs.existsSync(chromium.executablePath()) ||
    findSystemChromium() != null
  ) {
    chromiumInstalled = true;
    return;
  }

  installPromise = doChromiumInstall().finally(() => {
    installPromise = null;
  });
  return installPromise;
}

async function doChromiumInstall(): Promise<void> {
  console.log(
    '\n🔧 IWSDK: Chromium browser not found. Installing (first time only)...\n',
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        chromiumInstalled = true;
        console.log('\n✅ IWSDK: Chromium installed successfully.\n');
        resolve();
      } else {
        reject(
          new Error(
            `Chromium installation failed (exit code ${code}). ` +
              'Try running manually: npx playwright install chromium',
          ),
        );
      }
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to start Chromium installer: ${err.message}. ` +
            'Try running manually: npx playwright install chromium',
        ),
      );
    });
  });
}

/**
 * Check whether a GPU device is available. On macOS/Windows this always
 * returns true (Metal/D3D11 require a GPU by definition). On Linux it
 * probes /dev/dri/ for render nodes, which works in Docker, VMs, and
 * bare-metal environments without requiring external tools.
 */
function hasGpuDevice(): boolean {
  if (os.platform() !== 'linux') {
    return true;
  }
  try {
    const entries = fs.readdirSync('/dev/dri');
    return entries.some((e) => e.startsWith('renderD') || e.startsWith('card'));
  } catch {
    return false;
  }
}

type GpuBackend = {
  kind: 'hardware' | 'swiftshader';
  useGl: string;
  useAngle: string;
  reason: 'env-override' | 'auto';
};

const VALID_GPU_VALUES = ['auto', 'gpu', 'swiftshader'];

export function findSystemChromium(): string | undefined {
  const candidates =
    os.platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : os.platform() === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Chromium\\Application\\chrome.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
          ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

/**
 * Resolve the GPU / ANGLE backend for Chromium.
 *
 * Override with IWSDK_GPU env var:
 *   - "auto"        (default) auto-detect; hardware GL when a GPU is present,
 *                    SwiftShader otherwise
 *   - "gpu"         force hardware GL (fails if no GPU)
 *   - "swiftshader" force CPU-based SwiftShader rendering
 */
function resolveGpuBackend(): GpuBackend {
  const envOverride = process.env.IWSDK_GPU?.toLowerCase();

  if (envOverride !== undefined && !VALID_GPU_VALUES.includes(envOverride)) {
    console.warn(
      `⚠️  IWSDK: Unknown IWSDK_GPU value "${process.env.IWSDK_GPU}". ` +
        'Valid values: auto, gpu, swiftshader. Falling back to auto-detect.',
    );
  }

  if (envOverride === 'swiftshader') {
    return {
      kind: 'swiftshader',
      useGl: 'angle',
      useAngle: 'swiftshader',
      reason: 'env-override',
    };
  }

  const platform = os.platform();
  if (platform === 'darwin') {
    return {
      kind: 'hardware',
      useGl: 'angle',
      useAngle: 'metal',
      reason: 'auto',
    };
  }
  if (platform === 'win32') {
    return {
      kind: 'hardware',
      useGl: 'angle',
      useAngle: 'd3d11',
      reason: 'auto',
    };
  }

  // Linux: honour explicit "gpu" override, otherwise auto-detect
  if (envOverride === 'gpu') {
    return {
      kind: 'hardware',
      useGl: 'angle',
      useAngle: 'gl',
      reason: 'env-override',
    };
  }

  if (hasGpuDevice()) {
    return { kind: 'hardware', useGl: 'angle', useAngle: 'gl', reason: 'auto' };
  }

  return {
    kind: 'swiftshader',
    useGl: 'angle',
    useAngle: 'swiftshader',
    reason: 'auto',
  };
}

export async function launchManagedBrowser(
  url: string,
  headless: boolean,
  verbose: boolean,
  viewport: { width: number; height: number } | null = null,
  screenshotSize: { width: number; height: number } = {
    width: 800,
    height: 800,
  },
  traceMcp = false,
  managedAccess: ManagedBrowserAccess | null = null,
  readiness: ManagedBrowserReadiness = 'iwer',
): Promise<ManagedBrowser> {
  await ensureChromiumInstalled();

  const backend = resolveGpuBackend();

  console.log(
    backend.kind === 'swiftshader'
      ? backend.reason === 'env-override'
        ? '🖥️  IWSDK: Using SwiftShader (software rendering) — IWSDK_GPU=swiftshader'
        : '🖥️  IWSDK: Using SwiftShader (software rendering) — no GPU detected'
      : `🖥️  IWSDK: Using hardware GPU (${backend.useAngle})`,
  );

  const browserArgs = [
    '--enable-webgl',
    `--use-gl=${backend.useGl}`,
    `--use-angle=${backend.useAngle}`,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ];
  const browserLaunchOptions: LaunchOptions = {
    args: browserArgs,
    headless,
  };
  let browser: Browser;
  const playwrightExecutableExists = fs.existsSync(chromium.executablePath());
  const systemChromium = findSystemChromium();
  const launchSystemChromium = (executablePath: string) =>
    chromium.launch({
      ...browserLaunchOptions,
      args: [...browserArgs, '--no-sandbox'],
      executablePath,
    });

  if (!playwrightExecutableExists && systemChromium != null) {
    if (verbose) {
      console.log(
        `🖥️  IWSDK: Using system Chrome because Playwright Chromium is missing (${systemChromium})`,
      );
    }
    browser = await launchSystemChromium(systemChromium);
  } else {
    try {
      browser = await chromium.launch(browserLaunchOptions);
    } catch (error) {
      if (systemChromium == null) {
        throw error;
      }
      console.warn(
        `⚠️  IWSDK: Playwright Chromium launch failed; retrying with ${systemChromium}`,
      );
      browser = await launchSystemChromium(systemChromium);
    }
  }

  const context = await browser
    .newContext({
      ignoreHTTPSErrors: true, // Accept self-signed certs (e.g. from mkcert)
      viewport, // null = freely resizable; { width, height } = fixed viewport
    })
    .catch(async (error) => {
      await closeAfterLaunchFailure(browser);
      throw error;
    });
  if (managedAccess) {
    const managedOrigin = new URL(url).origin;
    await context.route(`${managedOrigin}/**`, async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const needsAccess =
        requestUrl.origin === managedOrigin &&
        managedAccess.pathnames.includes(requestUrl.pathname);
      if (!needsAccess) {
        await route.continue();
        return;
      }
      await route.continue({
        headers: {
          ...request.headers(),
          [managedAccess.headerName]: managedAccess.token,
        },
      });
    });
  }
  const page = await context.newPage().catch(async (error) => {
    await closeAfterLaunchFailure(browser, context);
    throw error;
  });

  // Server-side console capture — accumulates logs from Playwright via CDP
  const consoleCapture = new ServerSideConsoleCapture();

  page.on('console', (msg: any) => {
    const type = msg.type() as string;
    const text = msg.text() as string;
    const level = PLAYWRIGHT_TYPE_MAP[type];

    // Accumulate into server-side buffer
    if (level) {
      consoleCapture.add(level, text);
    }

    // Also forward to Node console for debugging
    if (type === 'error') {
      console.error('[browser]', text);
    } else if (verbose || text.startsWith(TRACE_PREFIX)) {
      console.log(`[browser:${type}]`, text);
    }
  });

  // Capture uncaught page errors (with full stack traces)
  page.on('pageerror', (err: any) => {
    // err.stack already includes "ErrorName: message" as its first line
    const text =
      err.stack || (err.name ? `${err.name}: ${err.message}` : err.message);
    consoleCapture.add('error', `[uncaught] ${text}`);
    console.error('[browser:pageerror]', text);
  });

  try {
    // Capture unhandled promise rejections by re-emitting as console.error
    // (which Playwright's page.on('console') already captures via CDP)
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        // reason.stack already includes "ErrorName: message" as its first line
        const text =
          reason instanceof Error
            ? reason.stack || `${reason.name}: ${reason.message}`
            : String(reason);
        console.error(`[unhandledrejection] ${text}`);
      });
    });

    // Mark this tab as the Playwright-managed tab. The injection template
    // checks this flag and only initializes the MCP WebSocket client when
    // present, so manually-opened browser tabs are not remote-controlled.
    await page.addInitScript((traceEnabled: boolean) => {
      (window as any).__IWER_MCP_MANAGED = true;
      (window as any).__IWSDK_MCP_TRACE = traceEnabled;
    }, traceMcp);

    await page.goto(url, { waitUntil: 'commit' });

    await page.waitForFunction(
      (target: ManagedBrowserReadiness) =>
        target === 'iwer'
          ? (window as any).IWER_DEVICE !== undefined
          : (window as any).__IWSDK_SCENE_EDITOR_READY === true,
      readiness,
      { timeout: 15000 },
    );
  } catch (error) {
    await closeAfterLaunchFailure(browser, context);
    throw error;
  }

  if (verbose) {
    console.log(
      headless
        ? '🖥️  IWSDK: Headless browser launched'
        : '🖥️  IWSDK: Browser launched',
    );
  }

  // Track intentional vs unexpected closure
  let intentionalClose = false;
  let closeCallback: (() => void) | null = null;
  let closeFired = false;

  const fireCloseCallback = () => {
    if (!intentionalClose && closeCallback && !closeFired) {
      closeFired = true;
      closeCallback();
    }
  };

  page.on('close', fireCloseCallback);
  browser.on('disconnected', fireCloseCallback);

  return {
    close: async () => {
      intentionalClose = true;
      try {
        await context.close();
      } finally {
        await browser.close();
      }
    },
    page,
    queryLogs: (options?: LogQuery) => consoleCapture.query(options),
    getTabMetadata: async () =>
      page.evaluate(() => {
        const id =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('iwer-mcp-tab-id')
            : null;
        const rawGeneration =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('iwer-mcp-gen')
            : null;
        const generation =
          rawGeneration != null && rawGeneration !== ''
            ? Number(rawGeneration)
            : null;
        return {
          id,
          generation: Number.isFinite(generation) ? generation : null,
        };
      }),
    setWorkspaceView: async (view) =>
      page.evaluate(async (nextView) => {
        const pathname = window.location.pathname ?? '';
        const isWorkspace =
          pathname.startsWith('/__iwsdk/workspace') ||
          document.documentElement.dataset.iwsdkWorkspaceView != null;
        if (!isWorkspace) {
          return false;
        }

        const runtime = (window as any).IWSDK_SCENE_EDITOR?.runtime;
        if (runtime && typeof runtime.dispatch === 'function') {
          await runtime.dispatch('workspace_set_view', { view: nextView });
          return true;
        }

        (window as any).__IWSDK_WORKSPACE_VIEW = nextView;
        document.documentElement.dataset.iwsdkWorkspaceView = nextView;
        return true;
      }, view),
    screenshot: async () => {
      const raw = await page.screenshot({ type: 'png' });
      // In non-agent modes (viewport is null / freely resizable), downscale
      // the screenshot to fit within screenshotSize bounds.
      if (viewport === null) {
        return sharp(raw)
          .resize(screenshotSize.width, screenshotSize.height, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
      }
      return raw;
    },
    onClose: (callback: () => void) => {
      closeCallback = callback;
    },
    isClosed: () => (page as any).isClosed(),
  };
}
