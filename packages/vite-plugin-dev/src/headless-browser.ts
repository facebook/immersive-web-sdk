/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
  type Page,
} from 'playwright';
import sharp from 'sharp';
import type {
  RuntimeCameraSnapshot,
  RuntimeFramingSnapshot,
} from './runtime-proof-parity.js';

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
  /** Switch to the application runtime when needed, then capture it. */
  captureRuntimeScreenshot(): Promise<Buffer>;
  /** Query captured console logs. */
  queryLogs(options?: LogQuery): CapturedLog[];
  /** Read the managed browser tab identity used by MCP metadata. */
  getTabMetadata(): Promise<{ id: string | null; generation: number | null }>;
  /** Reload the saved editor and workspace runtime, then collect publish evidence. */
  collectRuntimePublishEvidence(
    request: ManagedRuntimePublishRequest,
  ): Promise<ManagedRuntimePublishEvidence>;
  /** Inspect live scene binding, presentation, and host performance without formal review. */
  collectRuntimePreflightEvidence(
    request: ManagedRuntimePreflightRequest,
  ): Promise<ManagedRuntimePreflightEvidence>;
  /** Register a callback invoked when the page/browser closes unexpectedly. */
  onClose(callback: () => void): void;
  /** Whether the underlying Playwright page has been closed. */
  isClosed(): boolean;
}

async function showWorkspaceRuntime(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const pathname = window.location.pathname ?? '';
    const isWorkspace =
      pathname.startsWith('/__iwsdk/workspace') ||
      document.documentElement.dataset.iwsdkWorkspaceView != null;
    if (!isWorkspace) {
      return false;
    }

    const switchedToRuntime =
      document.documentElement.dataset.iwsdkWorkspaceView !== 'runtime';
    if (switchedToRuntime) {
      const runtimeButton = document.querySelector<HTMLElement>(
        '[data-workspace-view-button="runtime"]',
      );
      if (!runtimeButton) {
        throw new Error('IWSDK workspace runtime control is unavailable');
      }
      runtimeButton.click();
    }

    const deadline = performance.now() + 10_000;
    while (
      document.documentElement.dataset.iwsdkWorkspaceView !== 'runtime' ||
      (window as any).__IWSDK_WORKSPACE_RUNTIME_READY !== true
    ) {
      if (performance.now() >= deadline) {
        throw new Error('IWSDK workspace runtime view did not become ready');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (switchedToRuntime) {
      const runtimeFrame = document.getElementById('workspace-runtime-frame');
      if (!(runtimeFrame instanceof HTMLIFrameElement)) {
        throw new Error('IWSDK workspace runtime iframe is unavailable');
      }

      // The iframe load event fires before World.create() finishes loading its
      // level and before the first useful WebGL frame. Give framework runtimes
      // a short readiness window, with a bounded fallback for non-IWSDK apps.
      const settleStartedAt = performance.now();
      const minimumSettleAt = settleStartedAt + 500;
      const fallbackSettleAt = settleStartedAt + 1_500;
      while (performance.now() < fallbackSettleAt) {
        let renderReady = false;
        const runtime = (runtimeFrame.contentWindow as any)
          ?.FRAMEWORK_MCP_RUNTIME;
        if (runtime?.handles?.('get_render_stats')) {
          try {
            const stats = await runtime.dispatch('get_render_stats', {});
            renderReady =
              stats?.available === true &&
              stats?.calls > 0 &&
              stats?.meshCount > 0;
          } catch {
            // The framework bridge can exist before its world is queryable.
          }
        }
        if (renderReady && performance.now() >= minimumSettleAt) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await new Promise<void>((resolve) => {
        runtimeFrame.contentWindow!.requestAnimationFrame(() => {
          runtimeFrame.contentWindow!.requestAnimationFrame(() => resolve());
        });
      });
    }
    return true;
  });
}

export interface ManagedRuntimePublishRequest {
  expectedDocumentHash: string;
  expectedRuntimeHash: string;
  heroView?: string;
  nodeIds: string[];
}

export interface ManagedRuntimePreflightRequest {
  expectedDocumentHash: string;
  expectedRuntimeHash: string;
  sampleFrames: number;
  warmupFrames: number;
}

export interface ManagedHostPerformanceMeasurement {
  calibrated: false;
  classification: 'host-browser-diagnostic';
  droppedFrameCount: number;
  droppedFrameThresholdMs: number;
  frameTimeMs: {
    max: number | null;
    p50: number | null;
    p95: number | null;
  };
  sampleFrames: number;
  targetDevice: null;
  warmupFrames: number;
}

export interface ManagedRuntimePreflightEvidence {
  camera: RuntimeCameraSnapshot | null;
  collectedAt: number;
  editor: {
    dirty: boolean;
    documentHash: string | null;
    renderStats: Record<string, unknown>;
    runtimeHash: string | null;
  };
  environment: Record<string, unknown>;
  framing: RuntimeFramingSnapshot | null;
  hierarchyObjectCount: number;
  performance: ManagedHostPerformanceMeasurement;
  renderStats: Record<string, unknown>;
  runtimeHashes: string[];
}

export interface ManagedRuntimeNodeEvidence {
  components: unknown;
  hierarchy: Record<string, unknown> | null;
  nodeId: string;
  transform: unknown;
}

export interface ManagedRuntimePublishEvidence {
  camera: RuntimeCameraSnapshot | null;
  capture: ManagedPngCapture;
  editor: {
    beforeReload: {
      dirty: boolean;
      documentHash: string | null;
      runtimeHash: string | null;
    };
    capture: ManagedPngCapture;
    dirty: boolean;
    documentHash: string | null;
    logs: CapturedLog[];
    renderStats: Record<string, unknown>;
    runtimeHash: string | null;
  };
  renderStats: Record<string, unknown>;
  runtimeReloadStartedAt: number;
  collectedAt: number;
  environment: Record<string, unknown>;
  framing: RuntimeFramingSnapshot | null;
  hierarchy: Record<string, unknown>;
  hierarchyObjectCount: number;
  nodes: ManagedRuntimeNodeEvidence[];
  performance: ManagedHostPerformanceMeasurement;
  reloadStartedAt: number;
  runtimeHashes: string[];
}

interface ManagedPngCapture {
  bytes: Buffer;
  height: number;
  nonblank: boolean;
  sha256: string;
  width: number;
}

export interface ManagedBrowserAccess {
  headerName: string;
  pathnames: readonly string[];
  topLevelPathnames?: readonly string[];
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

  if (fs.existsSync(chromium.executablePath())) {
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

async function collectRuntimePreflightEvidence(
  page: Page,
  request: ManagedRuntimePreflightRequest,
): Promise<ManagedRuntimePreflightEvidence> {
  await showWorkspaceRuntime(page);
  return page.evaluate(
    async ({ sampleFrames, warmupFrames }) => {
      const sceneEditor = (window as any).IWSDK_SCENE_EDITOR;
      const frame = document.getElementById('workspace-runtime-frame');
      if (!sceneEditor?.session) {
        throw new Error('Managed browser is not on an open IWSDK scene editor');
      }
      if (!(frame instanceof HTMLIFrameElement)) {
        throw new Error('IWSDK workspace runtime iframe is unavailable');
      }
      const editorDocument = await sceneEditor.session.dispatch(
        'scene_get_document',
        {},
      );
      const editorRenderStats = await sceneEditor.session.dispatch(
        'scene_get_render_stats',
        {},
      );
      const runtimeDeadline = Date.now() + 20_000;
      let runtime = (frame.contentWindow as any)?.FRAMEWORK_MCP_RUNTIME;
      while (!runtime && Date.now() < runtimeDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        runtime = (frame.contentWindow as any)?.FRAMEWORK_MCP_RUNTIME;
      }
      if (!runtime) {
        throw new Error('IWSDK app runtime bridge is unavailable');
      }
      let hierarchy: any = null;
      let hierarchyEntries: any[] = [];
      let runtimeHashes = new Set<string>();
      let renderStats: any = null;
      while (Date.now() < runtimeDeadline) {
        hierarchy = await runtime.dispatch('get_scene_hierarchy', {
          maxChildren: 1000,
          maxDepth: 32,
        });
        hierarchyEntries = [];
        runtimeHashes = new Set<string>();
        const pending = [hierarchy];
        while (pending.length > 0) {
          const entry = pending.pop();
          if (entry && typeof entry === 'object') {
            hierarchyEntries.push(entry);
            if (typeof entry.runtimeHash === 'string') {
              runtimeHashes.add(entry.runtimeHash);
            }
            if (Array.isArray(entry.children)) {
              pending.push(...entry.children);
            }
          }
        }
        renderStats = runtime.handles?.('get_render_stats')
          ? await runtime.dispatch('get_render_stats', {})
          : {
              available: false,
              reason: 'runtime render-statistics bridge is unavailable',
            };
        if (runtimeHashes.size > 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const world = runtime.world;
      const camera = world?.camera;
      let cameraSnapshot = null;
      let framingSnapshot = null;
      if (camera) {
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix?.();
        const position = camera.position.clone();
        camera.getWorldPosition(position);
        const direction = camera.position.clone();
        camera.getWorldDirection(direction);
        cameraSnapshot = {
          aspect:
            typeof camera.aspect === 'number' && Number.isFinite(camera.aspect)
              ? camera.aspect
              : null,
          direction: direction.toArray(),
          far:
            typeof camera.far === 'number' && Number.isFinite(camera.far)
              ? camera.far
              : null,
          fov:
            camera.isPerspectiveCamera === true &&
            typeof camera.fov === 'number'
              ? camera.fov
              : null,
          height:
            camera.isOrthographicCamera === true &&
            typeof camera.top === 'number' &&
            typeof camera.bottom === 'number'
              ? (camera.top - camera.bottom) / (camera.zoom || 1)
              : null,
          near:
            typeof camera.near === 'number' && Number.isFinite(camera.near)
              ? camera.near
              : null,
          position: position.toArray(),
          projection:
            camera.isPerspectiveCamera === true
              ? 'perspective'
              : camera.isOrthographicCamera === true
                ? 'orthographic'
                : 'unknown',
        };

        const bounds = renderStats?.framingBounds;
        if (
          bounds &&
          Array.isArray(bounds.min) &&
          Array.isArray(bounds.max) &&
          bounds.min.length === 3 &&
          bounds.max.length === 3
        ) {
          const corners = [];
          let inFrontCornerCount = 0;
          for (const x of [bounds.min[0], bounds.max[0]]) {
            for (const y of [bounds.min[1], bounds.max[1]]) {
              for (const z of [bounds.min[2], bounds.max[2]]) {
                const worldPoint = camera.position.clone().set(x, y, z);
                const viewPoint = worldPoint
                  .clone()
                  .applyMatrix4(camera.matrixWorldInverse);
                if (viewPoint.z < 0) {
                  inFrontCornerCount += 1;
                  corners.push(worldPoint.project(camera));
                }
              }
            }
          }
          const centerWorld = camera.position
            .clone()
            .set(
              (bounds.min[0] + bounds.max[0]) / 2,
              (bounds.min[1] + bounds.max[1]) / 2,
              (bounds.min[2] + bounds.max[2]) / 2,
            );
          const centerView = centerWorld
            .clone()
            .applyMatrix4(camera.matrixWorldInverse);
          const centerNdc = centerWorld.clone().project(camera).toArray();
          if (corners.length > 0) {
            const xs = corners.map((corner) => corner.x);
            const ys = corners.map((corner) => corner.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const clippedWidth = Math.max(
              0,
              Math.min(1, maxX) - Math.max(-1, minX),
            );
            const clippedHeight = Math.max(
              0,
              Math.min(1, maxY) - Math.max(-1, minY),
            );
            framingSnapshot = {
              boundsAvailable: true,
              centerNdc:
                centerView.z < 0
                  ? [centerNdc[0], centerNdc[1], centerNdc[2]]
                  : null,
              fullyInsideViewport:
                minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
              inFrontCornerCount,
              projectedBounds: {
                max: [maxX, maxY],
                min: [minX, minY],
              },
              viewportCoverage:
                (Math.max(0, maxX - minX) * Math.max(0, maxY - minY)) / 4,
              viewportOverlap: (clippedWidth * clippedHeight) / 4,
            };
          } else {
            framingSnapshot = {
              boundsAvailable: true,
              centerNdc: null,
              fullyInsideViewport: false,
              inFrontCornerCount,
              projectedBounds: null,
              viewportCoverage: 0,
              viewportOverlap: 0,
            };
          }
        } else {
          framingSnapshot = {
            boundsAvailable: false,
            centerNdc: null,
            fullyInsideViewport: false,
            inFrontCornerCount: 0,
            projectedBounds: null,
            viewportCoverage: 0,
            viewportOverlap: 0,
          };
        }
      }

      const runtimeWindow = frame.contentWindow;
      if (runtimeWindow == null) {
        throw new Error('IWSDK app runtime window is unavailable');
      }
      const waitFrame = () =>
        new Promise<number>((resolve) =>
          runtimeWindow.requestAnimationFrame(resolve),
        );
      for (let index = 0; index < warmupFrames; index += 1) {
        await waitFrame();
      }
      const frameTimes = [];
      let previous = await waitFrame();
      for (let index = 0; index < sampleFrames; index += 1) {
        const current = await waitFrame();
        frameTimes.push(current - previous);
        previous = current;
      }
      const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
      const percentile = (percent: number) => {
        if (sortedFrameTimes.length === 0) {
          return null;
        }
        const index = Math.min(
          sortedFrameTimes.length - 1,
          Math.max(0, Math.ceil((percent / 100) * sortedFrameTimes.length) - 1),
        );
        return sortedFrameTimes[index];
      };
      const droppedFrameThresholdMs = (1000 / 60) * 1.5;
      const canvas = world?.renderer?.domElement;
      const gl =
        canvas?.getContext?.('webgl2') ||
        canvas?.getContext?.('webgl') ||
        canvas?.getContext?.('experimental-webgl');
      const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
      return {
        camera: cameraSnapshot,
        collectedAt: Date.now(),
        editor: {
          dirty: sceneEditor.session.isDirty === true,
          documentHash:
            typeof editorDocument?.documentHash === 'string'
              ? editorDocument.documentHash
              : null,
          renderStats:
            editorRenderStats && typeof editorRenderStats === 'object'
              ? editorRenderStats
              : { available: false },
          runtimeHash:
            typeof editorDocument?.runtimeHash === 'string'
              ? editorDocument.runtimeHash
              : null,
        },
        environment: {
          canvas:
            canvas == null
              ? null
              : { height: canvas.height, width: canvas.width },
          devicePixelRatio: window.devicePixelRatio,
          gpuRenderer: debugInfo
            ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : null,
          gpuVendor: debugInfo
            ? gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
            : null,
          userAgent: navigator.userAgent,
        },
        framing: framingSnapshot,
        hierarchyObjectCount: hierarchyEntries.length,
        performance: {
          calibrated: false,
          classification: 'host-browser-diagnostic',
          droppedFrameCount: frameTimes.filter(
            (frameTime) => frameTime > droppedFrameThresholdMs,
          ).length,
          droppedFrameThresholdMs,
          frameTimeMs: {
            max: frameTimes.length > 0 ? Math.max(...frameTimes) : null,
            p50: percentile(50),
            p95: percentile(95),
          },
          sampleFrames: frameTimes.length,
          targetDevice: null,
          warmupFrames,
        },
        renderStats:
          renderStats && typeof renderStats === 'object'
            ? renderStats
            : { available: false },
        runtimeHashes: [...runtimeHashes].sort(),
      };
    },
    {
      sampleFrames: request.sampleFrames,
      warmupFrames: request.warmupFrames,
    },
  ) as Promise<ManagedRuntimePreflightEvidence>;
}

async function collectRuntimePublishEvidence(
  page: Page,
  request: ManagedRuntimePublishRequest,
): Promise<ManagedRuntimePublishEvidence> {
  const editorBeforeReload = await page.evaluate(async () => {
    const sceneEditor = (window as any).IWSDK_SCENE_EDITOR;
    if (!sceneEditor?.session || !sceneEditor?.runtime) {
      throw new Error('Managed browser is not on an open IWSDK scene editor');
    }
    const result = await sceneEditor.session.dispatch('scene_get_document', {});
    return {
      dirty: sceneEditor.session.isDirty === true,
      documentHash:
        typeof result?.documentHash === 'string' ? result.documentHash : null,
      runtimeHash:
        typeof result?.runtimeHash === 'string' ? result.runtimeHash : null,
    };
  });
  if (editorBeforeReload.dirty) {
    throw Object.assign(
      new Error('Scene has unsaved editor changes; save before publishing'),
      { publishEditorState: editorBeforeReload },
    );
  }
  if (
    editorBeforeReload.documentHash !== request.expectedDocumentHash ||
    editorBeforeReload.runtimeHash !== request.expectedRuntimeHash
  ) {
    throw Object.assign(
      new Error('Managed editor hashes do not match the current scene file'),
      { publishEditorState: editorBeforeReload },
    );
  }

  const reloadStartedAt = Date.now();
  const editorLogs: CapturedLog[] = [];
  const editorProofPage = await page.context().newPage();
  editorProofPage.on('console', (message) => {
    const level = PLAYWRIGHT_TYPE_MAP[message.type()];
    if (level != null) {
      editorLogs.push({
        args: [message.text()],
        level,
        message: message.text(),
        timestamp: Date.now(),
      });
    }
  });
  editorProofPage.on('pageerror', (error) => {
    const message = error.stack || `${error.name}: ${error.message}`;
    editorLogs.push({
      args: [message],
      level: 'error',
      message: `[uncaught] ${message}`,
      timestamp: Date.now(),
    });
  });
  const reloadedEditor = await (async () => {
    try {
      await editorProofPage.goto(page.url(), { waitUntil: 'domcontentloaded' });
      await editorProofPage.waitForFunction(
        () =>
          (window as any).__IWSDK_SCENE_EDITOR_READY === true &&
          (window as any).IWSDK_SCENE_EDITOR?.session != null,
        undefined,
        { timeout: 20000 },
      );
      return await editorProofPage.evaluate(async (heroView) => {
        const sceneEditor = (window as any).IWSDK_SCENE_EDITOR;
        if (!sceneEditor?.session) {
          throw new Error('Managed editor session is unavailable after reload');
        }
        const documentResult = await sceneEditor.session.dispatch(
          'scene_get_document',
          {},
        );
        const capture = await sceneEditor.session.dispatch(
          'scene_capture_review',
          {
            height: 800,
            includeImageData: true,
            ...(heroView ? { viewId: heroView } : {}),
            width: 800,
          },
        );
        return {
          capture,
          dirty: sceneEditor.session.isDirty === true,
          documentHash:
            typeof documentResult?.documentHash === 'string'
              ? documentResult.documentHash
              : null,
          renderStats:
            capture?.renderStats && typeof capture.renderStats === 'object'
              ? capture.renderStats
              : {
                  available: false,
                  reason: 'editor capture returned no render stats',
                },
          runtimeHash:
            typeof documentResult?.runtimeHash === 'string'
              ? documentResult.runtimeHash
              : null,
        };
      }, request.heroView ?? null);
    } finally {
      await editorProofPage.close().catch(() => {});
    }
  })();
  if (
    reloadedEditor.dirty ||
    reloadedEditor.documentHash !== request.expectedDocumentHash ||
    reloadedEditor.runtimeHash !== request.expectedRuntimeHash
  ) {
    throw Object.assign(
      new Error('Reloaded editor does not match the saved scene revision'),
      {
        publishEditorState: {
          dirty: reloadedEditor.dirty,
          documentHash: reloadedEditor.documentHash,
          runtimeHash: reloadedEditor.runtimeHash,
        },
      },
    );
  }
  const editorCaptureBytes = Buffer.from(
    String(reloadedEditor.capture?.imageData ?? ''),
    'base64',
  );
  const editorCapture = await inspectPngCapture(editorCaptureBytes);
  if (reloadedEditor.capture?.screenshotSha256 !== editorCapture.sha256) {
    throw Object.assign(
      new Error('Reloaded editor capture hash does not match its PNG bytes'),
      {
        publishEditorState: {
          documentHash: reloadedEditor.documentHash,
          expectedScreenshotSha256:
            reloadedEditor.capture?.screenshotSha256 ?? null,
          screenshotSha256: editorCapture.sha256,
        },
      },
    );
  }
  const editor = {
    beforeReload: editorBeforeReload,
    capture: editorCapture,
    dirty: reloadedEditor.dirty,
    documentHash: reloadedEditor.documentHash,
    logs: editorLogs,
    renderStats: reloadedEditor.renderStats as Record<string, unknown>,
    runtimeHash: reloadedEditor.runtimeHash,
  };

  const reloadToken = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await showWorkspaceRuntime(page);
  const runtimeSource = await page.evaluate(async () => {
    const sceneEditor = (window as any).IWSDK_SCENE_EDITOR;
    const frame = document.getElementById('workspace-runtime-frame');
    if (!(frame instanceof HTMLIFrameElement) || !sceneEditor?.runtime) {
      throw new Error('IWSDK workspace runtime iframe is unavailable');
    }
    const source =
      frame.dataset.workspaceRuntimeSrc || frame.getAttribute('src') || '/';
    frame.src = 'about:blank';
    return source;
  });
  await page.waitForFunction(
    () => {
      const frame = document.getElementById('workspace-runtime-frame');
      return (
        frame instanceof HTMLIFrameElement &&
        frame.contentDocument?.URL === 'about:blank'
      );
    },
    undefined,
    { timeout: 10000 },
  );
  // Let abort/error events from the superseded generation drain before the
  // proof generation's log window begins.
  await page.waitForTimeout(500);
  const runtimeReloadStartedAt = Date.now();
  await page.evaluate(
    ({ source, token }) => {
      const frame = document.getElementById('workspace-runtime-frame');
      if (!(frame instanceof HTMLIFrameElement)) {
        throw new Error('IWSDK workspace runtime iframe is unavailable');
      }
      const url = new URL(source, window.location.href);
      url.searchParams.set('__iwsdk_publish_reload', token);
      frame.src = url.pathname + url.search + url.hash;
    },
    { source: runtimeSource, token: reloadToken },
  );
  await page.waitForTimeout(250);

  const collectLiveSnapshot = () =>
    page.evaluate(
      async ({ nodeIds, token }) => {
        const frame = document.getElementById('workspace-runtime-frame');
        const documentToken =
          frame instanceof HTMLIFrameElement
            ? new URL(frame.contentDocument?.URL ?? '').searchParams.get(
                '__iwsdk_publish_reload',
              )
            : null;
        if (documentToken !== token) {
          throw new Error('App runtime reload is still in progress');
        }
        const runtime =
          frame instanceof HTMLIFrameElement
            ? (frame.contentWindow as any)?.FRAMEWORK_MCP_RUNTIME
            : null;
        if (!runtime) {
          throw new Error(
            'IWSDK app runtime bridge is unavailable after reload',
          );
        }
        const hierarchy = await runtime.dispatch('get_scene_hierarchy', {
          maxChildren: 1000,
          maxDepth: 32,
        });
        const entries: any[] = [];
        const runtimeHashes = new Set<string>();
        const pending = [hierarchy];
        while (pending.length > 0) {
          const entry = pending.pop();
          if (entry && typeof entry === 'object') {
            entries.push(entry);
            if (typeof entry.runtimeHash === 'string') {
              runtimeHashes.add(entry.runtimeHash);
            }
            if (Array.isArray(entry.children)) {
              pending.push(...entry.children);
            }
          }
        }
        const nodes = [];
        for (const nodeId of nodeIds) {
          const entry = entries.find(
            (candidate) => candidate.sceneNodeId === nodeId,
          );
          if (!entry) {
            nodes.push({
              components: null,
              hierarchy: null,
              nodeId,
              transform: null,
            });
            continue;
          }
          const transform = await runtime.dispatch('get_object_transform', {
            nodeId,
          });
          const components =
            typeof entry.entityIndex === 'number' &&
            runtime.handles?.('ecs_query_entity')
              ? await runtime.dispatch('ecs_query_entity', {
                  entityIndex: entry.entityIndex,
                })
              : null;
          nodes.push({ components, hierarchy: entry, nodeId, transform });
        }
        const canvases = Array.from(
          frame instanceof HTMLIFrameElement
            ? (frame.contentDocument?.querySelectorAll('canvas') ?? [])
            : [],
        );
        const canvas = canvases.sort(
          (left, right) =>
            right.getBoundingClientRect().width *
              right.getBoundingClientRect().height -
            left.getBoundingClientRect().width *
              left.getBoundingClientRect().height,
        )[0] as HTMLCanvasElement | undefined;
        if (canvas?.tagName !== 'CANVAS') {
          throw new Error('App runtime did not render a canvas');
        }
        const gl = (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl')) as
          | WebGLRenderingContext
          | WebGL2RenderingContext
          | null;
        const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
        const renderStats = runtime.handles?.('get_render_stats')
          ? await runtime.dispatch('get_render_stats', {})
          : {
              available: false,
              reason: 'runtime render-statistics bridge is unavailable',
            };
        const runtimeWindow = (frame as HTMLIFrameElement).contentWindow;
        const frameTimeSamplesMs = await new Promise<number[]>((resolve) => {
          if (runtimeWindow == null) {
            resolve([]);
            return;
          }
          const samples: number[] = [];
          let previous: number | null = null;
          const sample = (timestamp: number) => {
            if (previous != null) {
              samples.push(timestamp - previous);
            }
            previous = timestamp;
            if (samples.length >= 8) {
              resolve(samples);
            } else {
              runtimeWindow.requestAnimationFrame(sample);
            }
          };
          runtimeWindow.requestAnimationFrame(sample);
        });
        return {
          canvas: {
            backingHeight: canvas.height,
            backingWidth: canvas.width,
            cssHeight: canvas.getBoundingClientRect().height,
            cssWidth: canvas.getBoundingClientRect().width,
          },
          environment: {
            devicePixelRatio: window.devicePixelRatio,
            gpuRenderer: debugInfo
              ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
              : null,
            gpuVendor: debugInfo
              ? gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
              : null,
            userAgent: navigator.userAgent,
          },
          hierarchy,
          nodes,
          renderStats: {
            ...(renderStats && typeof renderStats === 'object'
              ? renderStats
              : { available: false }),
            frameTimeSamplesMs,
          },
          runtimeHashes: [...runtimeHashes].sort(),
        };
      },
      { nodeIds: request.nodeIds, token: reloadToken },
    );

  let live: Awaited<ReturnType<typeof collectLiveSnapshot>> | null = null;
  let lastLiveError: unknown = null;
  let runtimeObservedAt: number | null = null;
  const liveDeadline = Date.now() + 20000;
  while (Date.now() < liveDeadline) {
    try {
      const candidate = await collectLiveSnapshot();
      if (candidate.runtimeHashes.length > 0) {
        runtimeObservedAt ??= Date.now();
        const allNodesPresent = candidate.nodes.every(
          (entry) => entry.hierarchy != null,
        );
        if (allNodesPresent || Date.now() - runtimeObservedAt >= 3000) {
          live = candidate;
          break;
        }
      }
    } catch (error) {
      lastLiveError = error;
    }
    await page.waitForTimeout(100);
  }
  if (live == null) {
    throw new Error(
      `App runtime did not become publish-ready: ${
        lastLiveError instanceof Error
          ? lastLiveError.message
          : String(lastLiveError ?? 'timed out')
      }`,
    );
  }

  const frameHandle = await page.$('#workspace-runtime-frame');
  const runtimeFrame = await frameHandle?.contentFrame();
  if (!runtimeFrame) {
    throw new Error('App runtime frame is unavailable for capture');
  }
  const canvases = runtimeFrame.locator('canvas');
  const canvasCount = await canvases.count();
  if (canvasCount === 0) {
    throw new Error('App runtime frame has no canvas to capture');
  }
  let bestCanvasIndex = 0;
  let bestCanvasArea = -1;
  for (let index = 0; index < canvasCount; index += 1) {
    const box = await canvases.nth(index).boundingBox();
    const area = box == null ? 0 : box.width * box.height;
    if (area > bestCanvasArea) {
      bestCanvasArea = area;
      bestCanvasIndex = index;
    }
  }
  const captureBytes = Buffer.from(
    await canvases.nth(bestCanvasIndex).screenshot({ type: 'png' }),
  );
  const capture = await inspectPngCapture(captureBytes);
  const presentation = await collectRuntimePreflightEvidence(page, {
    expectedDocumentHash: request.expectedDocumentHash,
    expectedRuntimeHash: request.expectedRuntimeHash,
    sampleFrames: 8,
    warmupFrames: 2,
  });

  return {
    camera: presentation.camera,
    capture,
    collectedAt: Date.now(),
    editor,
    environment: {
      ...live.environment,
      canvas: live.canvas,
    },
    framing: presentation.framing,
    hierarchy: live.hierarchy,
    hierarchyObjectCount: presentation.hierarchyObjectCount,
    nodes: live.nodes,
    performance: presentation.performance,
    renderStats: live.renderStats as Record<string, unknown>,
    reloadStartedAt,
    runtimeReloadStartedAt,
    runtimeHashes: live.runtimeHashes,
  };
}

async function inspectPngCapture(bytes: Buffer): Promise<ManagedPngCapture> {
  if (bytes.length === 0) {
    return {
      bytes,
      height: 0,
      nonblank: false,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      width: 0,
    };
  }
  const image = sharp(bytes);
  const [metadata, statistics] = await Promise.all([
    image.metadata(),
    image.stats(),
  ]);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const colorChannels = statistics.channels.slice(0, 3);
  return {
    bytes,
    height,
    nonblank:
      width > 1 &&
      height > 1 &&
      colorChannels.some(
        (channel) => channel.max - channel.min > 2 && channel.stdev > 0.25,
      ),
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    width,
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
  let browser: Browser;
  let context: BrowserContext;
  if (headless) {
    const browserLaunchOptions: LaunchOptions = {
      args: browserArgs,
      headless: true,
    };
    browser = await chromium.launch(browserLaunchOptions);
    context = await browser
      .newContext({
        ignoreHTTPSErrors: true,
        viewport,
      })
      .catch(async (error) => {
        await closeAfterLaunchFailure(browser);
        throw error;
      });
  } else {
    context = await chromium.launchPersistentContext('', {
      args: [...browserArgs, `--app=${url}`],
      headless: false,
      ignoreDefaultArgs: ['about:blank'],
      ignoreHTTPSErrors: true,
      viewport,
    });
    const persistentBrowser = context.browser();
    if (persistentBrowser == null) {
      await context.close().catch(() => {});
      throw new Error('Playwright app-mode browser is unavailable');
    }
    browser = persistentBrowser;
  }
  if (managedAccess) {
    const managedOrigin = new URL(url).origin;
    await context.route(`${managedOrigin}/**`, async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const isProtectedPath =
        requestUrl.origin === managedOrigin &&
        managedAccess.pathnames.includes(requestUrl.pathname);
      const isManagedTopLevelNavigation =
        requestUrl.origin === managedOrigin &&
        managedAccess.topLevelPathnames?.includes(requestUrl.pathname) ===
          true &&
        request.isNavigationRequest() &&
        request.frame().parentFrame() == null;
      const needsAccess = isProtectedPath || isManagedTopLevelNavigation;
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
  const page =
    context.pages().find((candidate) => !candidate.isClosed()) ??
    (await context.newPage().catch(async (error) => {
      await closeAfterLaunchFailure(browser, context);
      throw error;
    }));

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
    captureRuntimeScreenshot: async () => {
      await showWorkspaceRuntime(page);
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
    collectRuntimePublishEvidence: (request) =>
      collectRuntimePublishEvidence(page, request),
    collectRuntimePreflightEvidence: (request) =>
      collectRuntimePreflightEvidence(page, request),
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
        const id = window.__IWSDK_MCP_PAGE_ID ?? null;
        const rawGeneration = window.__IWSDK_MCP_TAB_GENERATION ?? null;
        const generation = rawGeneration != null ? Number(rawGeneration) : null;
        return {
          id,
          generation: Number.isFinite(generation) ? generation : null,
        };
      }),
    onClose: (callback: () => void) => {
      closeCallback = callback;
    },
    isClosed: () => (page as any).isClosed(),
  };
}
