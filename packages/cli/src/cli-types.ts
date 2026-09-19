/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type CliOptionValue = string | boolean;
export type CliOptions = Record<string, CliOptionValue>;

export type CliSuccess<T = unknown> = { ok: true; data: T };
export type CliRawOutput = { __raw: true; value: unknown };
export type CliFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type CliCommandResult =
  | CliSuccess<unknown>
  | CliFailure
  | CliRawOutput
  | number
  | null
  | undefined;

export interface ParsedArgv {
  positionals: string[];
  options: CliOptions;
}

export interface CliIo {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  cwd?: string;
}

export interface ResolvedCliIo {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
}
