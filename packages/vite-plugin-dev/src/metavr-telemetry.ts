/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * MetaVR telemetry integration for IWSDK.
 *
 * Reports MCP tool calls, session lifecycle, and errors through MetaVR's
 * DeveloperTelemetry pipeline via the `metavr xxiwsdk` subcommand.
 * All calls are fire-and-forget — telemetry never blocks or breaks the tool.
 *
 * Executes MetaVR's JavaScript entrypoint with the current Node executable.
 * This avoids platform shell shims and works the same way on Windows and Unix.
 * If MetaVR is not installed in the workspace, telemetry is silently skipped.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

function resolveMetaVrEntrypoint(): string | null {
  try {
    const requireFromWorkspace = createRequire(
      path.join(process.cwd(), 'package.json'),
    );
    return requireFromWorkspace.resolve('@meta-quest/metavr/bin.js');
  } catch {
    return null;
  }
}

function metaVrTelemetry(args: string[], clientVersion?: string): void {
  const entrypoint = resolveMetaVrEntrypoint();
  if (entrypoint == null) {
    return;
  }

  const globalArgs = ['xxiwsdk'];
  if (clientVersion) {
    globalArgs.push('--client-version', clientVersion);
  }
  const child = spawn(process.execPath, [entrypoint, ...globalArgs, ...args], {
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', () => {});
  child.unref();
}

export function reportToolCall(
  toolName: string,
  success: boolean,
  durationMs: number,
  error?: string,
  sessionId?: string,
  clientVersion?: string,
): void {
  const args = [
    'tool-call',
    '--tool-name',
    toolName,
    '--duration-ms',
    String(Math.round(durationMs)),
  ];
  if (!success) {
    args.push('--failure');
  }
  if (error) {
    args.push('--error', error);
  }
  if (sessionId) {
    args.push('--session-id', sessionId);
  }
  metaVrTelemetry(args, clientVersion);
}

export function reportSessionStart(
  sessionId: string,
  opts?: {
    iwsdkVersion?: string;
    device?: string;
    port?: number;
    clientVersion?: string;
  },
): void {
  const args = ['session-start', '--session-id', sessionId];
  if (opts?.iwsdkVersion) {
    args.push('--iwsdk-version', opts.iwsdkVersion);
  }
  if (opts?.device) {
    args.push('--device', opts.device);
  }
  if (opts?.port) {
    args.push('--port', String(opts.port));
  }
  metaVrTelemetry(args, opts?.clientVersion);
}

export function reportSessionEnd(
  sessionId: string,
  opts?: { durationMs?: number; reason?: string; clientVersion?: string },
): void {
  const args = ['session-end', '--session-id', sessionId];
  if (opts?.durationMs != null) {
    args.push('--duration-ms', String(Math.round(opts.durationMs)));
  }
  if (opts?.reason) {
    args.push('--reason', opts.reason);
  }
  metaVrTelemetry(args, opts?.clientVersion);
}

export function reportError(
  type: string,
  message: string,
  opts?: { context?: string; sessionId?: string; clientVersion?: string },
): void {
  const args = ['error', '--type', type, '--message', message];
  if (opts?.context) {
    args.push('--context', opts.context);
  }
  if (opts?.sessionId) {
    args.push('--session-id', opts.sessionId);
  }
  metaVrTelemetry(args, opts?.clientVersion);
}
