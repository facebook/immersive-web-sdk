/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type RuntimeBrowserState,
  type RuntimeSession,
} from '../src/runtime-contract.js';
import {
  getRuntimeSessionFilePath,
  normalizeWorkspaceRoot,
} from '../src/runtime-state.js';

export async function registerRuntimeSession(input: {
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  port: number;
  localUrl: string;
  networkUrls?: string[];
  aiMode?: string;
  aiTools?: unknown[];
  browser?: RuntimeBrowserState;
  browserAutomation?: RuntimeSession['browserAutomation'];
}): Promise<RuntimeSession> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const now = new Date().toISOString();
  const session: RuntimeSession = {
    schemaVersion: IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
    sessionId: input.sessionId,
    workspaceRoot,
    pid: input.pid,
    port: input.port,
    localUrl: input.localUrl,
    networkUrls: input.networkUrls ?? [],
    aiMode: input.aiMode,
    browser: input.browser,
    browserAutomation: input.browserAutomation,
    registeredAt: now,
    updatedAt: now,
  };
  const filePath = getRuntimeSessionFilePath(workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ ...session, aiTools: input.aiTools }, null, 2)}\n`,
    'utf8',
  );
  return session;
}

export async function setRuntimeSessionBrowserState(
  workspaceRoot: string,
  browser: RuntimeBrowserState,
): Promise<void> {
  const filePath = getRuntimeSessionFilePath(workspaceRoot);
  const session = JSON.parse(
    await readFile(filePath, 'utf8'),
  ) as RuntimeSession;
  await writeFile(
    filePath,
    `${JSON.stringify(
      { ...session, browser, updatedAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

export async function unregisterRuntimeSession(
  workspaceRoot: string,
): Promise<void> {
  await rm(getRuntimeSessionFilePath(workspaceRoot), { force: true });
}
