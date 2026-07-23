/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, realpathSync } from 'fs';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  IWSDK_RUNTIME_SESSION_PATH,
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type RuntimeBrowserState,
  type RuntimeSession,
} from '@iwsdk/cli/contract';

interface RegisterRuntimeSessionInput {
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  port: number;
  localUrl: string;
  networkUrls?: string[];
  aiMode?: string;
  browser?: RuntimeBrowserState;
}

function isTraceEnabled(): boolean {
  return process.env.IWSDK_RUNTIME_TRACE === '1';
}

function traceRuntimeSession(
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (!isTraceEnabled()) {
    return;
  }
  console.error(
    `[IWSDK-RUNTIME-TRACE][session] ${event} ${JSON.stringify(details)}`,
  );
}

function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try {
    return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  } catch {
    return resolved;
  }
}

function getRuntimeSessionFilePath(workspaceRoot: string): string {
  return path.join(
    normalizeWorkspaceRoot(workspaceRoot),
    IWSDK_RUNTIME_SESSION_PATH,
  );
}

const sessionMutationQueues = new Map<string, Promise<unknown>>();

async function enqueueSessionMutation<T>(
  workspaceRoot: string,
  mutate: (normalizedWorkspaceRoot: string) => Promise<T>,
): Promise<T> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const previous =
    sessionMutationQueues.get(normalizedWorkspaceRoot) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => mutate(normalizedWorkspaceRoot));
  sessionMutationQueues.set(normalizedWorkspaceRoot, next);
  try {
    return await next;
  } finally {
    if (sessionMutationQueues.get(normalizedWorkspaceRoot) === next) {
      sessionMutationQueues.delete(normalizedWorkspaceRoot);
    }
  }
}

async function readRuntimeSession(
  filePath: string,
): Promise<RuntimeSession | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as RuntimeSession;
  } catch {
    return null;
  }
}

async function writeRuntimeSession(
  workspaceRoot: string,
  session: RuntimeSession,
): Promise<RuntimeSession> {
  const filePath = getRuntimeSessionFilePath(workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
  return session;
}

export async function registerRuntimeSession(
  input: RegisterRuntimeSessionInput,
): Promise<RuntimeSession> {
  return enqueueSessionMutation(
    input.workspaceRoot,
    async (workspaceRoot): Promise<RuntimeSession> => {
      const existing = await readRuntimeSession(
        getRuntimeSessionFilePath(workspaceRoot),
      );
      const now = new Date().toISOString();
      const hasBrowserInput = Object.prototype.hasOwnProperty.call(
        input,
        'browser',
      );
      const session: RuntimeSession = {
        schemaVersion: IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
        sessionId: input.sessionId,
        workspaceRoot,
        pid: input.pid,
        port: input.port,
        localUrl: input.localUrl,
        networkUrls: input.networkUrls ?? [],
        aiMode: input.aiMode,
        browser: hasBrowserInput ? input.browser : existing?.browser,
        registeredAt: existing?.registeredAt ?? now,
        updatedAt: now,
      };
      traceRuntimeSession('register', {
        workspaceRoot,
        port: input.port,
        browserStatus: session.browser?.status ?? null,
        bridgeConnected: session.browser?.connected ?? false,
        commandReady: session.browser?.commandReady ?? false,
      });
      return writeRuntimeSession(workspaceRoot, session);
    },
  );
}

export async function setRuntimeSessionBrowserState(
  workspaceRoot: string,
  browser: RuntimeBrowserState,
): Promise<RuntimeSession | null> {
  return enqueueSessionMutation(
    workspaceRoot,
    async (normalizedWorkspaceRoot): Promise<RuntimeSession | null> => {
      const existing = await readRuntimeSession(
        getRuntimeSessionFilePath(normalizedWorkspaceRoot),
      );
      if (!existing) {
        return null;
      }

      const session: RuntimeSession = {
        ...existing,
        browser,
        updatedAt: new Date().toISOString(),
      };
      traceRuntimeSession('set_browser_state', {
        workspaceRoot: normalizedWorkspaceRoot,
        browserStatus: browser.status,
        bridgeConnected: browser.connected,
        commandReady: browser.commandReady,
        connectedClientCount: browser.connectedClientCount,
        lastError: browser.lastError ?? null,
      });
      return writeRuntimeSession(normalizedWorkspaceRoot, session);
    },
  );
}

export async function unregisterRuntimeSession(
  workspaceRoot: string,
): Promise<void> {
  await enqueueSessionMutation(
    workspaceRoot,
    async (normalizedWorkspaceRoot) => {
      traceRuntimeSession('unregister', {
        workspaceRoot: normalizedWorkspaceRoot,
      });
      await rm(getRuntimeSessionFilePath(normalizedWorkspaceRoot), {
        force: true,
      }).catch(() => {});
    },
  );
}
