/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseIntegerOption, safeJsonParse } from '../argv.js';
import { createRawOutput, createSuccess } from '../cli-results.js';
import type {
  CliOptions,
  CliRawOutput,
  CliSuccess,
  ResolvedCliIo,
} from '../cli-types.js';
import {
  isRuntimeBrowserCommandReady,
  RUNTIME_OPERATIONS,
  getRuntimeOperationByCliPath,
  resolveRuntimeOperationRequest,
  type RuntimeSession,
} from '../runtime-contract.js';
import {
  formatMissingRuntimeMessage,
  getRuntimeSession,
  resolveWorkspaceRoot,
} from '../runtime-state.js';
import {
  RuntimeCommandExecutionError,
  sendRuntimeCommand,
} from '../runtime-transport.js';

const DEFAULT_TIMEOUT_MS = 30000;
const COMMON_RUNTIME_OPTIONS = new Set([
  'help',
  'inputJson',
  'raw',
  'timeout',
  'workspace',
]);
const DIRECT_OPTION_ALIASES: Record<
  string,
  Record<string, { parameter: string; type: 'number' | 'string' | 'levels' }>
> = {
  browser_get_console_logs: {
    count: { parameter: 'count', type: 'number' },
    level: { parameter: 'level', type: 'levels' },
    pattern: { parameter: 'pattern', type: 'string' },
    since: { parameter: 'since', type: 'number' },
  },
  ecs_step: {
    count: { parameter: 'count', type: 'number' },
    frames: { parameter: 'count', type: 'number' },
    delta: { parameter: 'delta', type: 'number' },
  },
};

function parseDirectValue(
  value: string | boolean,
  option: string,
  type: 'number' | 'string' | 'levels',
): unknown {
  if (typeof value !== 'string') {
    throw new Error(`--${option} requires a value`);
  }
  if (type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`--${option} must be a number`);
    }
    return parsed;
  }
  if (type === 'levels') {
    const levels = value.split(',').map((entry) => entry.trim());
    return levels.length === 1 ? levels[0] : levels;
  }
  return value;
}

function resolveRuntimeParams(
  operationName: string,
  options: CliOptions,
): unknown {
  const aliases = DIRECT_OPTION_ALIASES[operationName] ?? {};
  const allowed = new Set([...COMMON_RUNTIME_OPTIONS, ...Object.keys(aliases)]);
  if (
    operationName === 'browser_screenshot' ||
    operationName === 'scene_screenshot' ||
    operationName === 'scene_render_file' ||
    operationName === 'ui_render_preview'
  ) {
    allowed.add('outputFile');
  }
  const unknown = Object.keys(options).filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    const flag = unknown[0].replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    throw new Error(
      `Unknown option --${flag}. Runtime parameters must be passed through --input-json; run this command with --help for its schema.`,
    );
  }

  const directEntries = Object.entries(aliases).filter(
    ([name]) => options[name] !== undefined,
  );
  if (typeof options.inputJson === 'string' && directEntries.length > 0) {
    throw new Error(
      `Do not combine --input-json with direct parameter aliases: ${directEntries.map(([name]) => `--${name}`).join(', ')}`,
    );
  }
  if (typeof options.inputJson === 'string') {
    return safeJsonParse(options.inputJson, '--input-json');
  }
  return Object.fromEntries(
    directEntries.map(([name, alias]) => [
      alias.parameter,
      parseDirectValue(options[name]!, name, alias.type),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScreenshotResult(
  value: unknown,
): value is { imageData: string; mimeType?: string } {
  return isRecord(value) && typeof value.imageData === 'string';
}

function isBrowserRelaunchedResult(value: unknown): boolean {
  return isRecord(value) && value.status === 'browser_relaunched';
}

function withBrowserStatus(
  result: unknown,
  session: RuntimeSession,
): Record<string, unknown> {
  const browser = session.browser ?? null;
  const browserConnected = Boolean(session.browser?.connected);
  const browserCommandReady = isRuntimeBrowserCommandReady(session);

  if (isRecord(result)) {
    return {
      ...result,
      browser,
      browserConnected,
      browserCommandReady,
    };
  }

  return {
    value: result,
    browser,
    browserConnected,
    browserCommandReady,
  };
}

async function saveScreenshot(
  result: { imageData: string },
  requestedPath?: string | boolean,
): Promise<string> {
  const outputPath =
    typeof requestedPath === 'string'
      ? requestedPath
      : path.join(os.tmpdir(), `iwsdk-screenshot-${Date.now()}.png`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(result.imageData, 'base64'));
  return outputPath;
}

export async function handleRuntimeOperation(
  domain: string,
  action: string | undefined,
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown> | CliRawOutput> {
  const operation = action
    ? getRuntimeOperationByCliPath(domain, action)
    : undefined;
  if (!operation) {
    const available = RUNTIME_OPERATIONS.filter(
      (entry) => entry.domain === domain,
    ).map((entry) => entry.action);
    throw new Error(
      `Unknown ${domain} command "${action}". Available: ${available.join(', ')}`,
    );
  }

  const parsedParams = resolveRuntimeParams(operation.mcpName, options);
  const command = resolveRuntimeOperationRequest(operation, parsedParams);

  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: true,
  });
  const session = await getRuntimeSession(workspaceRoot);
  if (!session) {
    throw new Error(formatMissingRuntimeMessage(workspaceRoot));
  }

  const sendOptions = {
    port: session.port,
    method: operation.wsMethod,
    params: command.params,
    target: command.target,
    timeoutMs: parseIntegerOption(
      options.timeout,
      '--timeout',
      DEFAULT_TIMEOUT_MS,
    ),
    runtimeSession: session,
  };
  let rawResult;
  try {
    rawResult = await sendRuntimeCommand(sendOptions);
    if (
      operation.mcpName === 'browser_screenshot' &&
      isBrowserRelaunchedResult(rawResult.result ?? rawResult)
    ) {
      rawResult = await sendRuntimeCommand(sendOptions);
    }
  } catch (error) {
    if (
      operation.mcpName === 'xr_accept_session' &&
      error instanceof RuntimeCommandExecutionError
    ) {
      error.message = `${error.message} Configure world.xr.offer as "once" or "always" before running iwsdk xr enter.`;
    }
    throw error;
  }

  const result =
    operation.mcpName === 'xr_get_session_status'
      ? withBrowserStatus(rawResult.result ?? rawResult, session)
      : (rawResult.result ?? rawResult);

  const isScreenshotOperation =
    operation.mcpName === 'browser_screenshot' ||
    operation.mcpName === 'scene_screenshot' ||
    operation.mcpName === 'scene_render_file' ||
    operation.mcpName === 'ui_render_preview';
  const hasExplicitScreenshotPath = typeof options.outputFile === 'string';
  if (options.outputFile === true) {
    throw new Error('--output-file requires a path');
  }

  // An explicit output path is an instruction to persist the PNG. Honor it
  // even when --raw is also present, instead of silently printing base64 and
  // ignoring the requested file.
  if (
    isScreenshotOperation &&
    isScreenshotResult(result) &&
    (hasExplicitScreenshotPath || !options.raw)
  ) {
    const screenshotPath = await saveScreenshot(result, options.outputFile);
    if (operation.mcpName === 'scene_render_file') {
      const { imageData: _imageData, ...metadata } = result;
      return createSuccess({
        workspaceRoot,
        operation: operation.id,
        result: metadata,
        screenshotPath,
      });
    }
    return createSuccess({
      workspaceRoot,
      operation: operation.id,
      screenshotPath,
    });
  }

  if (options.raw) {
    return createRawOutput(result);
  }

  return createSuccess({
    workspaceRoot,
    operation: operation.id,
    result,
  });
}
