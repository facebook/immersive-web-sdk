/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, readFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import {
  isRuntimeBrowserCommandReady,
  IWSDK_RUNTIME_LAUNCH_PATH,
  IWSDK_RUNTIME_LOGS_DIR,
  IWSDK_RUNTIME_SESSION_PATH,
  IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
  type LaunchMetadata,
  type RuntimeSession,
  type WorkspaceRuntimeState,
} from './runtime-contract.js';
import {
  getRuntimeFilePath,
  isRuntimeProcessAlive,
  normalizeWorkspaceRoot,
  readRuntimeJson,
  removeRuntimeFile,
  withRuntimeFileLock,
  writeRuntimeJson,
} from './runtime-files.js';

export { normalizeWorkspaceRoot } from './runtime-files.js';

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

export interface SetLaunchMetadataInput {
  claimId?: string;
  phase?: LaunchMetadata['phase'];
  workspaceRoot: string;
  pid: number;
  launcherPid?: number;
  processGroupId?: number;
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

export function getRuntimeSessionFilePath(workspaceRoot: string): string {
  return getRuntimeFilePath(workspaceRoot, IWSDK_RUNTIME_SESSION_PATH);
}

export function getRuntimeLaunchFilePath(workspaceRoot: string): string {
  return getRuntimeFilePath(workspaceRoot, IWSDK_RUNTIME_LAUNCH_PATH);
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

export const isProcessAlive = isRuntimeProcessAlive;

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

export async function getRuntimeSession(
  workspaceRoot: string,
): Promise<RuntimeSession | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const filePath = getRuntimeSessionFilePath(normalizedWorkspaceRoot);
  return withRuntimeFileLock(filePath, async () => {
    const session = await readRuntimeJson<RuntimeSession>(filePath);
    if (!session) {
      return null;
    }
    if (!isProcessAlive(session.pid)) {
      await removeRuntimeFile(filePath);
      return null;
    }
    return session;
  });
}

function createLaunchMetadata(
  input: SetLaunchMetadataInput,
  createdAt = new Date().toISOString(),
): LaunchMetadata {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  return {
    schemaVersion: IWSDK_RUNTIME_STATE_SCHEMA_VERSION,
    ...(input.claimId == null ? {} : { claimId: input.claimId }),
    ...(input.phase == null ? {} : { phase: input.phase }),
    workspaceRoot,
    pid: input.pid,
    ...(input.launcherPid == null ? {} : { launcherPid: input.launcherPid }),
    ...(input.processGroupId == null
      ? {}
      : { processGroupId: input.processGroupId }),
    command: input.command,
    args: input.args ?? [],
    logPath: input.logPath ?? null,
    scriptName: input.scriptName ?? 'dev:runtime',
    port: input.port ?? null,
    openBrowser: input.openBrowser ?? false,
    createdAt,
  };
}

export async function claimLaunchMetadata(
  input: SetLaunchMetadataInput & { claimId: string },
): Promise<{ acquired: boolean; metadata: LaunchMetadata }> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const filePath = getRuntimeLaunchFilePath(workspaceRoot);
  const metadata = createLaunchMetadata({
    ...input,
    phase: 'starting',
    workspaceRoot,
  });
  return withRuntimeFileLock(filePath, async () => {
    const existing = await readRuntimeJson<LaunchMetadata>(filePath);
    if (existing != null && isProcessAlive(existing.pid)) {
      return { acquired: false, metadata: existing };
    }
    await writeRuntimeJson(filePath, metadata);
    return { acquired: true, metadata };
  });
}

export async function setLaunchMetadata(
  input: SetLaunchMetadataInput,
  expectedClaimId?: string,
): Promise<LaunchMetadata | null> {
  const workspaceRoot = normalizeWorkspaceRoot(input.workspaceRoot);
  const filePath = getRuntimeLaunchFilePath(workspaceRoot);
  return withRuntimeFileLock(filePath, async () => {
    const existing = await readRuntimeJson<LaunchMetadata>(filePath);
    if (expectedClaimId != null && existing?.claimId !== expectedClaimId) {
      return null;
    }
    const metadata = createLaunchMetadata(
      { ...input, workspaceRoot },
      existing != null && existing.claimId === input.claimId
        ? existing.createdAt
        : new Date().toISOString(),
    );
    await writeRuntimeJson(filePath, metadata);
    return metadata;
  });
}

export async function clearLaunchMetadata(
  workspaceRoot: string,
  expectedClaimId?: string,
  expectedPhase?: LaunchMetadata['phase'],
): Promise<boolean> {
  const filePath = getRuntimeLaunchFilePath(workspaceRoot);
  return withRuntimeFileLock(filePath, async () => {
    const existing = await readRuntimeJson<LaunchMetadata>(filePath);
    if (
      (expectedClaimId == null || existing?.claimId === expectedClaimId) &&
      (expectedPhase == null || existing?.phase === expectedPhase)
    ) {
      await removeRuntimeFile(filePath);
      return true;
    }
    return false;
  });
}

export async function getLaunchMetadata(
  workspaceRoot: string,
): Promise<LaunchMetadata | null> {
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const filePath = getRuntimeLaunchFilePath(normalizedWorkspaceRoot);
  return withRuntimeFileLock(filePath, async () => {
    const metadata = await readRuntimeJson<LaunchMetadata>(filePath);
    if (!metadata) {
      return null;
    }
    if (!isProcessAlive(metadata.pid)) {
      await removeRuntimeFile(filePath);
      return null;
    }
    return metadata;
  });
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
