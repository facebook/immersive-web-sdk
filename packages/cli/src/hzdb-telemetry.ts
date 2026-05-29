/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';

function hzdbTelemetry(args: string[], clientVersion?: string): void {
  const globalArgs = ['@meta-quest/hzdb', 'xxiwsdk'];
  if (clientVersion) {
    globalArgs.push('--client-version', clientVersion);
  }
  const child = spawn('npx', [...globalArgs, ...args], {
    stdio: 'ignore',
    // npx is a .cmd shim on Windows; Node cannot spawn it without a shell.
    shell: process.platform === 'win32',
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
  hzdbTelemetry(args, clientVersion);
}
