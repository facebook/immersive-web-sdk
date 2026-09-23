/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Frame, Page } from 'playwright';
import { errorMessage, parseUrl } from './internals.js';
import {
  readApplicationIdentity,
  type BrowserApplicationIdentity,
} from './page-probes.js';

export const DEFAULT_BROWSER_OPERATION_TIMEOUT_MS = 15_000;

const WORKSPACE_RESTORE_TIMEOUT_MS = 2_000;

export const WORKSPACE_RESTORE_RESERVE_MS = WORKSPACE_RESTORE_TIMEOUT_MS + 500;

export interface WorkspaceRuntimeVisibility {
  isWorkspace: boolean;
  previousView: string | null;
}

export async function showWorkspaceRuntime(
  page: Page,
): Promise<WorkspaceRuntimeVisibility> {
  return page.evaluate(async () => {
    const pathname = window.location.pathname ?? '';
    const isWorkspace =
      pathname.startsWith('/__iwsdk/workspace') ||
      document.documentElement.dataset.iwsdkWorkspaceView != null;
    if (!isWorkspace) {
      return { isWorkspace: false, previousView: null };
    }

    const previousView =
      document.documentElement.dataset.iwsdkWorkspaceView ?? null;
    const switchedToRuntime = previousView !== 'runtime';
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
      const settleDeadline = settleStartedAt + 1_500;
      const renderStatsDeadline = settleDeadline - 250;
      const settleWithinDeadline = async <T>(
        deadline: number,
        operation: () => Promise<T>,
        fallback: T,
      ): Promise<T> => {
        const remainingMs = Math.max(0, deadline - performance.now());
        if (remainingMs === 0) {
          return fallback;
        }
        let timeoutId: number | undefined;
        try {
          return await Promise.race([
            operation().catch(() => fallback),
            new Promise<T>((resolve) => {
              timeoutId = window.setTimeout(
                () => resolve(fallback),
                remainingMs,
              );
            }),
          ]);
        } finally {
          if (timeoutId != null) {
            window.clearTimeout(timeoutId);
          }
        }
      };
      while (performance.now() < renderStatsDeadline) {
        let renderReady = false;
        const runtime = (runtimeFrame.contentWindow as any)
          ?.FRAMEWORK_MCP_RUNTIME;
        if (runtime?.handles?.('get_render_stats')) {
          const stats = await settleWithinDeadline(
            renderStatsDeadline,
            () =>
              Promise.resolve().then(() =>
                runtime.dispatch('get_render_stats', {}),
              ),
            null,
          );
          renderReady =
            stats?.available === true &&
            stats?.calls > 0 &&
            stats?.meshCount > 0;
        }
        if (renderReady && performance.now() >= minimumSettleAt) {
          break;
        }
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(50, Math.max(0, renderStatsDeadline - performance.now())),
          ),
        );
      }

      await settleWithinDeadline(
        settleDeadline,
        () =>
          new Promise<void>((resolve) => {
            const runtimeWindow = runtimeFrame.contentWindow;
            if (runtimeWindow == null) {
              resolve();
              return;
            }
            runtimeWindow.requestAnimationFrame(() => {
              runtimeWindow.requestAnimationFrame(() => resolve());
            });
          }),
        undefined,
      );
    }
    return { isWorkspace: true, previousView };
  });
}

export async function restoreWorkspaceView(
  page: Page,
  visibility: WorkspaceRuntimeVisibility,
): Promise<void> {
  if (
    !visibility.isWorkspace ||
    visibility.previousView == null ||
    visibility.previousView === 'runtime'
  ) {
    return;
  }
  await page.evaluate(
    async ({ timeoutMs, view }) => {
      const button = document.querySelector<HTMLElement>(
        `[data-workspace-view-button="${view}"]`,
      );
      if (!button) {
        throw new Error(`IWSDK workspace ${view} control is unavailable`);
      }
      button.click();
      const deadline = performance.now() + timeoutMs;
      while (document.documentElement.dataset.iwsdkWorkspaceView !== view) {
        if (performance.now() >= deadline) {
          throw new Error(`IWSDK workspace ${view} view did not become ready`);
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    {
      timeoutMs: WORKSPACE_RESTORE_TIMEOUT_MS,
      view: visibility.previousView,
    },
  );
}

export async function withRuntimeView<T>(
  page: Page,
  operation: () => Promise<T>,
  onRestoreError?: (error: unknown) => void,
): Promise<T> {
  const visibility = await showWorkspaceRuntime(page);
  try {
    return await operation();
  } finally {
    await restoreWorkspaceView(page, visibility).catch((error) => {
      if (onRestoreError == null) {
        throw error;
      }
      onRestoreError(error);
    });
  }
}

export async function resolveApplicationFrame(page: Page): Promise<Frame> {
  const pathname = parseUrl(page.url())?.pathname ?? '';
  const workspacePath =
    pathname === '/__iwsdk/workspace' ||
    pathname.startsWith('/__iwsdk/workspace/');
  const workspaceDataset = workspacePath
    ? false
    : (await page
        .evaluate(
          () => document.documentElement.dataset.iwsdkWorkspaceView != null,
        )
        .catch(() => false)) === true;
  if (!workspacePath && !workspaceDataset) {
    return page.mainFrame();
  }
  const frameHandle = await page.$('#workspace-runtime-frame');
  if (frameHandle == null) {
    throw new Error('IWSDK workspace application frame is unavailable');
  }
  const frame = await frameHandle.contentFrame();
  if (frame == null) {
    throw new Error('IWSDK workspace application frame is detached');
  }
  return frame;
}

export interface BrowserApplicationMetadata {
  id: string | null;
  generation: number | null;
  outerUrl: string;
  url: string;
  workspaceFramed: boolean;
}

export interface BrowserApplicationState {
  application: BrowserApplicationMetadata;
  documentTimeOrigin: number;
  frame: Frame;
}

export async function getApplicationState(
  page: Page,
  resolvedFrame?: Frame,
): Promise<BrowserApplicationState> {
  const frame = resolvedFrame ?? (await resolveApplicationFrame(page));
  const identity = await frame
    .evaluate(readApplicationIdentity)
    .catch((error) => {
      throw Object.assign(
        new Error(
          `The current application changed while its identity was being read: ${errorMessage(
            error,
          )}`,
        ),
        { cause: error, retryable: true },
      );
    });
  return {
    application: {
      generation: identity.generation,
      id: identity.id,
      outerUrl: page.url(),
      url: frame.url(),
      workspaceFramed: frame !== page.mainFrame(),
    },
    documentTimeOrigin: identity.documentTimeOrigin,
    frame,
  };
}

export async function getApplicationMetadata(
  page: Page,
): Promise<BrowserApplicationMetadata> {
  return (await getApplicationState(page)).application;
}

export async function reloadApplicationFrame(
  page: Page,
  timeoutMs: number,
): Promise<BrowserApplicationMetadata> {
  const reloadDeadline = Date.now() + timeoutMs;
  const remainingReloadTimeMs = () =>
    Math.max(100, reloadDeadline - Date.now());
  const frame = await resolveApplicationFrame(page);
  const before = await getApplicationMetadata(page);
  const navigation = frame
    .waitForNavigation({
      timeout: remainingReloadTimeMs(),
      waitUntil: 'domcontentloaded',
    })
    .then(() => true)
    .catch(() => false);
  await frame
    .evaluate(() => window.location.reload())
    .catch((error) => {
      const message = errorMessage(error);
      if (
        !/execution context was destroyed|navigation|frame was detached/i.test(
          message,
        )
      ) {
        throw error;
      }
    });
  const navigated = await navigation;
  const reloadedFrame = await resolveApplicationFrame(page);
  await reloadedFrame
    .waitForFunction(
      ({ generation, id }) => {
        const currentId = window.__IWSDK_MCP_PAGE_ID ?? null;
        const rawGeneration = window.__IWSDK_MCP_TAB_GENERATION ?? null;
        const currentGeneration =
          rawGeneration == null ? null : Number(rawGeneration);
        return (
          currentId != null &&
          (currentId !== id ||
            generation == null ||
            (Number.isFinite(currentGeneration) &&
              currentGeneration! > generation))
        );
      },
      { generation: before.generation, id: before.id },
      { timeout: remainingReloadTimeMs() },
    )
    .catch(() => null);
  const after = await getApplicationMetadata(page);
  if (
    !navigated &&
    after.id === before.id &&
    after.generation === before.generation
  ) {
    throw new Error('Managed application reload did not navigate');
  }
  return after;
}

export function applicationIdentityChanged(
  before: BrowserApplicationIdentity,
  after: BrowserApplicationIdentity,
): boolean {
  return (
    before.documentTimeOrigin !== after.documentTimeOrigin ||
    before.id !== after.id ||
    before.generation !== after.generation
  );
}
