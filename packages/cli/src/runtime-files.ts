/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import {
  existsSync,
  realpathSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  rmdirSync,
  rmSync,
} from 'fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'fs/promises';
import path from 'path';

const LOCK_TIMEOUT_MS = 5_000;
const mutationQueues = new Map<string, Promise<unknown>>();

async function renameRuntimeFile(
  tempPath: string,
  filePath: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tempPath, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== 'win32' ||
        attempt >= 4 ||
        !['EACCES', 'EBUSY', 'EPERM'].includes(code ?? '')
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

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
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await renameRuntimeFile(tempPath, filePath);
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

const processStarts = new Map<number, string>();

/** OS process birth identity distinguishes a live owner from a reused PID. */
export function getRuntimeProcessStart(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  const cached = processStarts.get(pid);
  if (pid === process.pid && cached) {
    return cached;
  }
  let value: string | null = null;
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const boot = readFileSync(
        '/proc/sys/kernel/random/boot_id',
        'utf8',
      ).trim();
      value = `${boot}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`;
    } else if (process.platform === 'win32') {
      value =
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
          ],
          {
            encoding: 'utf8',
            timeout: 1500,
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        ).trim() || null;
    } else {
      value =
        execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
          encoding: 'utf8',
          timeout: 1500,
          env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || null;
    }
  } catch {}
  // A transient Windows/ps failure must remain retryable. Only a positive
  // identity is stable enough to cache for the lifetime of this process.
  if (pid === process.pid && value != null) {
    processStarts.set(pid, value);
  }
  return value;
}

interface FileLockOwner {
  pid: number;
  lockId?: string;
  processStart?: string | null;
}
const liveLockOwners = new Map<string, number>();
function ownerIsDead(owner: FileLockOwner): boolean {
  if (!isRuntimeProcessAlive(owner.pid)) {
    return true;
  }
  if (owner.processStart) {
    const key = `${owner.pid}:${owner.processStart}:${owner.lockId ?? 'legacy'}`;
    if ((liveLockOwners.get(key) ?? 0) > Date.now()) {
      return false;
    }
    const current = getRuntimeProcessStart(owner.pid);
    if (current != null && current !== owner.processStart) {
      return true;
    }
    // Especially on Windows, avoid a synchronous OS query on every 25ms
    // contention poll. PID death is still checked immediately above; cached
    // liveness only delays reclamation and can never steal a live lock.
    if (liveLockOwners.size >= 128) {
      liveLockOwners.clear();
    }
    liveLockOwners.set(key, Date.now() + 1000);
  }
  return false;
}

async function reclaimFileLock(lockPath: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(lockPath);
  } catch {
    return;
  }
  if (
    entries.length === 1 &&
    (entries[0] === 'owner.json' ||
      /^owner-[a-f0-9-]+\.json$/u.test(entries[0]))
  ) {
    const ownerPath = path.join(lockPath, entries[0]);
    const owner = await readRuntimeJson<FileLockOwner>(ownerPath);
    if (
      !owner ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      !ownerIsDead(owner)
    ) {
      return;
    }
    // A successor has a different filename. A delayed reclaimer cannot remove
    // its owner file, and rmdir cannot remove a populated successor directory.
    await unlink(ownerPath).catch(() => {});
  } else if (entries.length !== 0) {
    return;
  }
  await rmdir(lockPath).catch(() => {});
}

function newLockOwner() {
  return {
    acquiredAt: Date.now(),
    pid: process.pid,
    lockId: randomUUID(),
    processStart: getRuntimeProcessStart(process.pid),
  };
}

/** Atomic publication is also used by exit-time cleanup; never publish an empty lock. */
export function tryRuntimeFileLockSync(filePath: string): (() => void) | null {
  const lockPath = getRuntimeFileLockPath(filePath);
  const owner = newLockOwner();
  const filename = `owner-${owner.lockId}.json`;
  const prepared = `${lockPath}.${owner.lockId}.prepared`;
  try {
    if (existsSync(`${lockPath}.recovery`)) {
      return null;
    }
    mkdirSync(path.dirname(lockPath), { recursive: true });
    mkdirSync(prepared, { mode: 0o700 });
    writeFileSync(path.join(prepared, filename), JSON.stringify(owner), {
      mode: 0o600,
    });
    renameSync(prepared, lockPath);
    return () => {
      try {
        unlinkSync(path.join(lockPath, filename));
      } catch {}
      try {
        rmdirSync(lockPath);
      } catch {}
    };
  } catch {
    return null;
  } finally {
    rmSync(prepared, { recursive: true, force: true });
  }
}

async function acquireRuntimeFileLock(
  filePath: string,
): Promise<() => Promise<void>> {
  const lockPath = getRuntimeFileLockPath(filePath);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner = newLockOwner();
  const filename = `owner-${owner.lockId}.json`;
  const prepared = await mkdtemp(`${lockPath}.prepared-`);
  try {
    await writeFile(path.join(prepared, filename), JSON.stringify(owner), {
      mode: 0o600,
    });
    while (true) {
      // Respect a live recovery guard left by an older CLI. New writers do not
      // need a recovery guard, so its own crash cannot create another lock layer.
      await reclaimFileLock(`${lockPath}.recovery`);
      let recoveryExists = false;
      try {
        await readdir(`${lockPath}.recovery`);
        recoveryExists = true;
      } catch {}
      try {
        if (recoveryExists) {
          throw Object.assign(new Error('Legacy recovery in progress'), {
            code: 'EEXIST',
          });
        }
        await rename(prepared, lockPath);
        await removeOrphanedTempFiles(filePath);
        return async () => {
          await unlink(path.join(lockPath, filename)).catch(() => {});
          await rmdir(lockPath).catch(() => {});
        };
      } catch (error) {
        if (
          !['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        ) {
          throw error;
        }
      }
      if (!recoveryExists) {
        await reclaimFileLock(lockPath);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out acquiring runtime state lock ${lockPath}. Inspect its owner and stop the owning process before removing an unreadable legacy lock or recovery guard.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    await rm(prepared, { recursive: true, force: true });
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
