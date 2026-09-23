/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { rm, mkdir, lstat } from 'fs/promises';
import { createConnection, createServer, type Server } from 'net';
import path from 'path';
import {
  getRuntimeProcessStart,
  isRuntimeProcessAlive,
  normalizeWorkspaceRoot,
  readRuntimeJson,
  withRuntimeFileLock,
  writeRuntimeJson,
} from './runtime-files.js';

export interface RuntimeOwnerIdentity {
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  endpoint: string;
  processStart?: string | null;
}
export interface RuntimeOwnerLease {
  identity: RuntimeOwnerIdentity;
  release(): Promise<void>;
}
export type RuntimeOwnerErrorCode =
  | 'runtime_owner_conflict'
  | 'runtime_owner_identity_unavailable'
  | 'runtime_owner_unverified'
  | 'runtime_owner_shutdown_failed';
export class RuntimeOwnerError extends Error {
  constructor(
    message: string,
    readonly owner: RuntimeOwnerIdentity | null,
    readonly code: RuntimeOwnerErrorCode = 'runtime_owner_conflict',
  ) {
    super(message);
    this.name = 'RuntimeOwnerError';
  }
}

function runtimeOwnerRecordPath(workspaceRoot: string): string {
  return path.join(
    normalizeWorkspaceRoot(workspaceRoot),
    '.iwsdk/runtime/owner.json',
  );
}

function sameRuntimeOwner(
  expected: RuntimeOwnerIdentity,
  actual: RuntimeOwnerIdentity,
): boolean {
  return (
    expected.sessionId === actual.sessionId &&
    expected.pid === actual.pid &&
    expected.workspaceRoot === actual.workspaceRoot &&
    expected.endpoint === actual.endpoint &&
    expected.processStart != null &&
    expected.processStart === actual.processStart
  );
}

export function runtimeOwnerEndpoint(workspaceRoot: string): string {
  const key = createHash('sha256')
    .update(normalizeWorkspaceRoot(workspaceRoot))
    .digest('hex')
    .slice(0, 32);
  // Short enough for macOS sockaddr_un even with a long project path.
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\iwsdk-${key}`
    : path.join('/tmp', `iwsdk-${process.getuid?.() ?? 'user'}`, `${key}.sock`);
}

/** Read-only, bounded liveness check. Never unlinks or claims an endpoint. */
export function probeRuntimeOwner(
  endpoint: string,
): Promise<RuntimeOwnerIdentity | null> {
  return inspectRuntimeOwner(endpoint).then((result) =>
    result.state === 'live' ? result.owner : null,
  );
}

export type RuntimeOwnerObservation =
  | { state: 'live'; owner: RuntimeOwnerIdentity }
  | { state: 'absent' }
  | { state: 'unknown'; reason: string };

/** A timeout is uncertainty; only ENOENT/ECONNREFUSED proves absence. */
export function inspectRuntimeOwner(
  endpoint: string,
): Promise<RuntimeOwnerObservation> {
  return new Promise((resolve) => {
    const socket = createConnection(endpoint);
    let data = '';
    const finish = (result: RuntimeOwnerObservation) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(750, () =>
      finish({ state: 'unknown', reason: 'Owner probe timed out' }),
    );
    socket.on('error', (error: NodeJS.ErrnoException) =>
      finish(
        ['ENOENT', 'ECONNREFUSED'].includes(error.code ?? '')
          ? { state: 'absent' }
          : { state: 'unknown', reason: error.message },
      ),
    );
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.length > 4096) {
        return finish({ state: 'unknown', reason: 'Invalid owner response' });
      }
      if (!data.includes('\n')) {
        return;
      }
      try {
        const owner = JSON.parse(data) as RuntimeOwnerIdentity;
        if (
          typeof owner.sessionId !== 'string' ||
          typeof owner.workspaceRoot !== 'string' ||
          owner.endpoint !== endpoint ||
          !Number.isInteger(owner.pid) ||
          owner.pid <= 0
        ) {
          throw new Error('Invalid identity');
        }
        finish({ state: 'live', owner });
      } catch {
        finish({ state: 'unknown', reason: 'Invalid owner identity' });
      }
    });
    socket.on('end', () =>
      finish({ state: 'unknown', reason: 'Owner closed without an identity' }),
    );
  });
}

/**
 * The kernel-held IPC listener owns the workspace, not a JSON timestamp or
 * PID. Serialize bind + stale unlink under a short state-file lock so two
 * recovery attempts cannot unlink one another's live listener. Uncertain
 * state fails closed; this function never terminates another process.
 */
export async function acquireRuntimeOwner(
  workspaceRoot: string,
  sessionId: string,
): Promise<RuntimeOwnerLease> {
  workspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const endpoint = runtimeOwnerEndpoint(workspaceRoot);
  const recordPath = runtimeOwnerRecordPath(workspaceRoot);
  const processStart = getRuntimeProcessStart(process.pid);
  if (processStart == null) {
    throw new RuntimeOwnerError(
      'Cannot establish this process birth identity, so runtime ownership cannot be acquired safely. Retry startup; on Windows, verify PowerShell is available.',
      null,
      'runtime_owner_identity_unavailable',
    );
  }
  if (process.platform !== 'win32') {
    const directory = path.dirname(endpoint);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o077) !== 0
    ) {
      throw new RuntimeOwnerError(
        'Workspace owner socket directory is not private to this user.',
        null,
      );
    }
  }
  return withRuntimeFileLock(recordPath, async () => {
    const previous = await readRuntimeJson<RuntimeOwnerIdentity>(recordPath);
    const observation = await inspectRuntimeOwner(endpoint);
    if (observation.state === 'live') {
      throw new RuntimeOwnerError(
        'This workspace already has a dev runtime. Attach with iwsdk dev up, or stop it with iwsdk dev down.',
        observation.owner,
      );
    }
    if (observation.state === 'unknown') {
      throw new RuntimeOwnerError(
        `Workspace ownership is unknown at ${endpoint} (${observation.reason}). Inspect ${recordPath}; no second runtime was started.`,
        previous,
      );
    }
    if (previous?.processStart != null && isRuntimeProcessAlive(previous.pid)) {
      const birth = getRuntimeProcessStart(previous.pid);
      if (birth == null || birth === previous.processStart) {
        throw new RuntimeOwnerError(
          `The owner endpoint is missing, but runtime ${previous.sessionId} may still be alive (pid ${previous.pid}). Stop that dev process before retrying; no second runtime was started.`,
          previous,
        );
      }
    }
    const identity: RuntimeOwnerIdentity = {
      sessionId,
      workspaceRoot,
      pid: process.pid,
      endpoint,
      processStart,
    };
    const server = createServer((socket) => {
      socket.on('error', () => {});
      socket.end(`${JSON.stringify(identity)}\n`);
    });
    const bind = () =>
      new Promise<void>((resolve, reject) => {
        const failed = (error: Error) => {
          server.off('listening', ready);
          reject(error);
        };
        const ready = () => {
          server.off('error', failed);
          resolve();
        };
        server.once('error', failed);
        server.once('listening', ready);
        server.listen(endpoint);
      });
    try {
      await bind();
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'EADDRINUSE' ||
        process.platform === 'win32'
      ) {
        throw new RuntimeOwnerError(
          `Cannot acquire the workspace owner endpoint (${(error as NodeJS.ErrnoException).code}); ownership is unknown. No browser was launched.`,
          previous,
        );
      }
      // A crash can leave a socket before writing any record, or the recorded
      // PID may have been reused. Kernel refusal, under the acquisition lock,
      // establishes absence; JSON and PID liveness do not establish ownership.
      if ((await inspectRuntimeOwner(endpoint)).state !== 'absent') {
        throw new RuntimeOwnerError(
          `Owner endpoint ${endpoint} is not confirmed absent. Inspect ${recordPath}.`,
          previous,
        );
      }
      await rm(endpoint, { force: true });
      await bind();
    }
    server.on('error', () => {});
    server.unref();
    try {
      await writeRuntimeJson(recordPath, identity);
    } catch (error) {
      await closeServer(server);
      throw error;
    }
    let releasePromise: Promise<void> | undefined;
    return {
      identity,
      release: () =>
        (releasePromise ??= (async () => {
          await closeServer(server);
          await withRuntimeFileLock(recordPath, async () => {
            const current =
              await readRuntimeJson<RuntimeOwnerIdentity>(recordPath);
            if (current?.sessionId === sessionId) {
              await rm(recordPath, { force: true });
            }
          });
        })()),
    };
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

/** Stop only the runtime whose live endpoint was positively verified. */
export async function stopRuntimeOwner(
  owner: RuntimeOwnerIdentity,
  requestShutdown: () => Promise<boolean>,
  timing: { graceMs?: number; signalMs?: number } = {},
): Promise<void> {
  const recordPath = runtimeOwnerRecordPath(owner.workspaceRoot);
  const sameOwner = (value: RuntimeOwnerIdentity) =>
    sameRuntimeOwner(owner, value);
  const initial = await inspectRuntimeOwner(owner.endpoint);
  const recorded = await readRuntimeJson<RuntimeOwnerIdentity>(recordPath);
  if (
    initial.state !== 'live' ||
    !sameOwner(initial.owner) ||
    recorded == null ||
    !sameOwner(recorded)
  ) {
    throw new RuntimeOwnerError(
      `Runtime ownership could not be verified at ${owner.endpoint}; refusing PID-only termination.`,
      owner,
      'runtime_owner_unverified',
    );
  }
  const stopped = async (duration: number) => {
    const deadline = Date.now() + duration;
    do {
      const observation = await inspectRuntimeOwner(owner.endpoint);
      if (observation.state === 'live' && !sameOwner(observation.owner)) {
        return true;
      }
      if (observation.state === 'absent') {
        if (!isRuntimeProcessAlive(owner.pid)) {
          return true;
        }
        const processStart = getRuntimeProcessStart(owner.pid);
        if (processStart != null && processStart !== owner.processStart) {
          return true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    return false;
  };
  const accepted = await requestShutdown();
  // An acknowledgement can be lost after the runtime accepted shutdown. Give
  // even an unacknowledged owner time to finish cleanup before using signals.
  if (await stopped(timing.graceMs ?? (accepted ? 35000 : 5000))) {
    return;
  }
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    const observation = await inspectRuntimeOwner(owner.endpoint);
    if (observation.state === 'absent') {
      return;
    }
    if (observation.state === 'live' && !sameOwner(observation.owner)) {
      return;
    }
    const currentRecord =
      await readRuntimeJson<RuntimeOwnerIdentity>(recordPath);
    if (currentRecord == null || !sameOwner(currentRecord)) {
      throw new RuntimeOwnerError(
        `Runtime ownership record changed at ${recordPath}; refusing PID-only termination.`,
        owner,
        'runtime_owner_unverified',
      );
    }
    // The endpoint proves workspace ownership, but it is not sufficient
    // authority to signal an arbitrary PID (notably for Windows named pipes).
    // Require the independently recorded process-birth identity immediately
    // before every destructive signal so PID reuse or endpoint squatting can
    // only cause a fail-closed refusal.
    const identityMatches =
      owner.processStart != null &&
      getRuntimeProcessStart(owner.pid) === owner.processStart;
    if (!identityMatches || owner.pid === process.pid) {
      throw new RuntimeOwnerError(
        `Runtime ${owner.sessionId} did not stop, and its process identity cannot be safely signalled. Inspect ${owner.endpoint}.`,
        owner,
        'runtime_owner_unverified',
      );
    }
    try {
      process.kill(owner.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
    }
    if (await stopped(timing.signalMs ?? 5000)) {
      return;
    }
  }
  throw new RuntimeOwnerError(
    `Runtime ${owner.sessionId} is still present or unresponsive at ${owner.endpoint}; shutdown is not confirmed.`,
    owner,
    'runtime_owner_shutdown_failed',
  );
}
