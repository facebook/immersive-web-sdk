/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
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
