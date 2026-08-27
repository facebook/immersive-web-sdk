/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, readFileSync, realpathSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  isRuntimeBrowserCommandReady,
  IWSDK_RUNTIME_LAUNCH_PATH,
  IWSDK_RUNTIME_LOGS_DIR,
  IWSDK_RUNTIME_SESSION_PATH,
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type LaunchMetadata,
  type RuntimeBrowserState,
  type RuntimeSession,
  type WorkspaceRuntimeState,
} from './runtime-contract.js';

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
];
const IWSDK_PROJECT_CONFIG_NAME = 'iwsdk.config.json';

const IWSDK_APP_PACKAGE_NAMES = [
  '@iwsdk/cli',
  '@iwsdk/core',
  '@iwsdk/vite-plugin-dev',
] as const;

interface PackageJsonManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

export interface RegisterRuntimeSessionInput {
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  port: number;
  localUrl: string;
  networkUrls?: string[];
  aiMode?: string;
  browser?: RuntimeBrowserState;
}

export interface SetLaunchMetadataInput {
  workspaceRoot: string;
  pid: number;
  command: string;
  args?: string[];
  logPath?: string | null;
  scriptName?: string;
  port?: number | null;
  openBrowser?: boolean;
}

export interface ResolveWorkspaceRootOptions {
  cwd?: string;
  workspace?: string;
  requireRunning?: boolean;
}

function readPackageManifest(dirPath: string): PackageJsonManifest | null {
  try {
    const raw = readFileSync(path.join(dirPath, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJsonManifest;
  } catch {
    return null;
  }
}

function hasIwsdkDependency(manifest: PackageJsonManifest | null): boolean {
  if (!manifest) {
    return false;
  }

  const dependencyBuckets = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
  ];

  return dependencyBuckets.some((dependencies) =>
    IWSDK_APP_PACKAGE_NAMES.some(
      (packageName) => typeof dependencies?.[packageName] === 'string',
    ),
  );
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeRuntimeSession(
  workspaceRoot: string,
  session: RuntimeSession,
): Promise<RuntimeSession> {
  await writeJsonFile(getRuntimeSessionFilePath(workspaceRoot), session);
  return session;
}

async function removeIfExists(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => {});
}

export function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try {
    return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  } catch {
    return resolved;
  }
}

export function getRuntimeSessionFilePath(workspaceRoot: string): string {
  return path.join(
    normalizeWorkspaceRoot(workspaceRoot),
    IWSDK_RUNTIME_SESSION_PATH,
  );
}

export function getRuntimeLaunchFilePath(workspaceRoot: string): string {
  return path.join(
    normalizeWorkspaceRoot(workspaceRoot),
    IWSDK_RUNTIME_LAUNCH_PATH,
  );
}

export function getRuntimeLogsDir(workspaceRoot: string): string {
  return path.join(
    normalizeWorkspaceRoot(workspaceRoot),
    IWSDK_RUNTIME_LOGS_DIR,
  );
}

export async function ensureRuntimeLogsDir(
  workspaceRoot: string,
): Promise<string> {
  const logsDir = getRuntimeLogsDir(workspaceRoot);
  await mkdir(logsDir, { recursive: true });
  return logsDir;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isIwsdkAppRoot(dirPath: string): boolean {
  const normalizedDir = normalizeWorkspaceRoot(dirPath);
  if (!existsSync(path.join(normalizedDir, 'package.json'))) {
    return false;
  }

  const hasProjectConfig = existsSync(
    path.join(normalizedDir, IWSDK_PROJECT_CONFIG_NAME),
  );
  const hasViteConfig = VITE_CONFIG_NAMES.some((name) =>
    existsSync(path.join(normalizedDir, name)),
  );
  if (!hasProjectConfig && !hasViteConfig) {
    return false;
  }

  return hasIwsdkDependency(readPackageManifest(normalizedDir));
}

export function findNearestIwsdkAppRoot(
  startDir = process.cwd(),
): string | null {
  let current = normalizeWorkspaceRoot(startDir);

  while (true) {
    if (isIwsdkAppRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function registerRuntimeSession(
  input: RegisterRuntimeSessionInput,
): Promise<RuntimeSession> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const existing = await readJsonFile<RuntimeSession>(
    getRuntimeSessionFilePath(workspaceRoot),
  );
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
    browser: input.browser ?? existing?.browser,
    registeredAt: existing?.registeredAt ?? now,
    updatedAt: now,
  };
  return writeRuntimeSession(workspaceRoot, session);
}

export async function setRuntimeSessionBrowserState(
  workspaceRoot: string,
  browser: RuntimeBrowserState,
): Promise<RuntimeSession | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const existing = await readJsonFile<RuntimeSession>(
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
  return writeRuntimeSession(normalizedWorkspaceRoot, session);
}

export async function unregisterRuntimeSession(
  workspaceRoot: string,
): Promise<void> {
  await removeIfExists(getRuntimeSessionFilePath(workspaceRoot));
}

export async function getRuntimeSession(
  workspaceRoot: string,
): Promise<RuntimeSession | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const session = await readJsonFile<RuntimeSession>(
    getRuntimeSessionFilePath(normalizedWorkspaceRoot),
  );
  if (!session) {
    return null;
  }

  if (!isProcessAlive(session.pid)) {
    await unregisterRuntimeSession(normalizedWorkspaceRoot);
    return null;
  }

  return session;
}

export async function setLaunchMetadata(
  input: SetLaunchMetadataInput,
): Promise<LaunchMetadata> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const metadata: LaunchMetadata = {
    schemaVersion: IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
    workspaceRoot,
    pid: input.pid,
    command: input.command,
    args: input.args ?? [],
    logPath: input.logPath ?? null,
    scriptName: input.scriptName ?? 'dev:runtime',
    port: input.port ?? null,
    openBrowser: input.openBrowser ?? false,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(getRuntimeLaunchFilePath(workspaceRoot), metadata);
  return metadata;
}

export async function clearLaunchMetadata(
  workspaceRoot: string,
): Promise<void> {
  await removeIfExists(getRuntimeLaunchFilePath(workspaceRoot));
}

export async function getLaunchMetadata(
  workspaceRoot: string,
): Promise<LaunchMetadata | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const metadata = await readJsonFile<LaunchMetadata>(
    getRuntimeLaunchFilePath(normalizedWorkspaceRoot),
  );
  if (!metadata) {
    return null;
  }

  if (!isProcessAlive(metadata.pid)) {
    await clearLaunchMetadata(normalizedWorkspaceRoot);
    return null;
  }

  return metadata;
}

export async function getWorkspaceRuntimeState(
  workspaceRoot: string,
): Promise<WorkspaceRuntimeState> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const [session, launch] = await Promise.all([
    getRuntimeSession(normalizedWorkspaceRoot),
    getLaunchMetadata(normalizedWorkspaceRoot),
  ]);

  return {
    workspaceRoot: normalizedWorkspaceRoot,
    running: Boolean(session),
    starting: !session && Boolean(launch),
    browserConnected: Boolean(session?.browser?.connected),
    browserCommandReady: isRuntimeBrowserCommandReady(session),
    ...(session?.browser?.lastError == null
      ? {}
      : { browserIssue: session.browser.lastError }),
    session,
    launch,
  };
}

export function getRuntimeUrls(session: RuntimeSession | null): {
  local: string | null;
  network: string[];
} {
  return {
    local: session?.localUrl ?? null,
    network: session?.networkUrls ?? [],
  };
}

export function formatMissingRuntimeMessage(workspaceRoot: string): string {
  return `No running IWSDK runtime found for ${workspaceRoot}. Start the dev server with "iwsdk dev up".`;
}

export async function resolveWorkspaceRoot({
  cwd = process.cwd(),
  workspace,
  requireRunning = true,
}: ResolveWorkspaceRootOptions = {}): Promise<string> {
  const basePath = workspace ?? cwd;
  const workspaceRoot = findNearestIwsdkAppRoot(basePath);
  if (!workspaceRoot) {
    throw new Error(
      `No IWSDK app found at or above: ${workspace ?? cwd}. Run this command inside an IWSDK app.`,
    );
  }

  if (!requireRunning) {
    return workspaceRoot;
  }

  const session = await getRuntimeSession(workspaceRoot);
  if (!session) {
    throw new Error(formatMissingRuntimeMessage(workspaceRoot));
  }

  return workspaceRoot;
}
