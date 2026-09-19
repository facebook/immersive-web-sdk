/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import path from 'path';

const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
let writeSequence = 0;
const mutationQueues = new Map<string, Promise<unknown>>();

export function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try {
    return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  } catch {
    return resolved;
  }
}

export function getRuntimeFilePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  return path.join(normalizeWorkspaceRoot(workspaceRoot), relativePath);
}

export async function readRuntimeJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function writeRuntimeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${++writeSequence}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

export async function removeRuntimeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => {});
}

export function isRuntimeProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function getRuntimeFileLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

async function removeOrphanedTempFiles(filePath: string): Promise<void> {
  const directory = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.`;
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.tmp'))
      .map((entry) =>
        rm(path.join(directory, entry), { force: true }).catch(() => {}),
      ),
  );
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const [owner, lockStat] = await Promise.all([
      readRuntimeJson<{ acquiredAt?: number; pid?: number }>(
        path.join(lockPath, 'owner.json'),
      ),
      stat(lockPath),
    ]);
    const acquiredAt = owner?.acquiredAt ?? lockStat.mtimeMs;
    return (
      Date.now() - acquiredAt >= STALE_LOCK_MS ||
      (owner?.pid != null && !isRuntimeProcessAlive(owner.pid))
    );
  } catch {
    return false;
  }
}

async function acquireRuntimeFileLock(
  filePath: string,
): Promise<() => Promise<void>> {
  const lockPath = getRuntimeFileLockPath(filePath);
  const recoveryPath = `${lockPath}.recovery`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  const lockId = randomUUID();
  await mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const recoveryStat = await stat(recoveryPath);
      if (Date.now() - recoveryStat.mtimeMs >= STALE_LOCK_MS) {
        await rm(recoveryPath, { force: true, recursive: true }).catch(
          () => {},
        );
      } else {
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out acquiring runtime state lock for ${filePath}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      await mkdir(lockPath);
      try {
        await writeFile(
          path.join(lockPath, 'owner.json'),
          `${JSON.stringify({ acquiredAt: Date.now(), lockId, pid: process.pid })}\n`,
          'utf8',
        );
      } catch (error) {
        await rm(lockPath, { force: true, recursive: true }).catch(() => {});
        throw error;
      }
      await removeOrphanedTempFiles(filePath);
      return async () => {
        const owner = await readRuntimeJson<{ lockId?: string }>(
          path.join(lockPath, 'owner.json'),
        );
        if (owner?.lockId === lockId) {
          await rm(lockPath, { force: true, recursive: true });
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    if (await isStaleLock(lockPath)) {
      try {
        await mkdir(recoveryPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        continue;
      }
      try {
        if (await isStaleLock(lockPath)) {
          await rm(lockPath, { force: true, recursive: true });
        }
      } finally {
        await rm(recoveryPath, { force: true, recursive: true }).catch(
          () => {},
        );
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out acquiring runtime state lock for ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function withRuntimeFileLock<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = mutationQueues.get(filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const release = await acquireRuntimeFileLock(filePath);
      try {
        return await operation();
      } finally {
        await release().catch(() => {});
      }
    });
  mutationQueues.set(filePath, next);
  try {
    return await next;
  } finally {
    if (mutationQueues.get(filePath) === next) {
      mutationQueues.delete(filePath);
    }
  }
}
