/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn, type ChildProcess } from 'child_process';
import { closeSync, existsSync, openSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { parseIntegerOption, safeJsonParse } from '../argv.js';
import { createFailure, createSuccess } from '../cli-results.js';
import type {
  CliFailure,
  CliOptions,
  CliSuccess,
  ResolvedCliIo,
} from '../cli-types.js';
import {
  hasRuntimeBrowserCommandReadyContract,
  INTERNAL_BROWSER_PROBE_METHOD,
  isRuntimeBrowserCommandReady,
  type RuntimeBrowserProbeResult,
  type RuntimeIssueInfo,
  type RuntimeSession,
} from '../runtime-contract.js';
import {
  clearLaunchMetadata,
  ensureRuntimeLogsDir,
  formatMissingRuntimeMessage,
  getLaunchMetadata,
  getRuntimeSession,
  getWorkspaceRuntimeState,
  resolveWorkspaceRoot,
  setLaunchMetadata,
} from '../runtime-state.js';
import {
  RuntimeCommandExecutionError,
  sendRuntimeCommand,
} from '../runtime-transport.js';
import { readAdapterStatus } from './adapter.js';
import { handleStatus } from './status.js';

interface PackageJsonManifest {
  packageManager?: string;
  scripts?: Record<string, string>;
}

export interface ProcessExitResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * A child process exited cleanly only when it reported exit code 0 and was not
 * terminated by a signal. A signal kill reports `exitCode === null` (with
 * `signal` set), so a plain `exit.exitCode !== 0` check silently treats
 * signal-terminated processes as success — hiding crashes from the CLI caller.
 */
export function isAbnormalChildExit(exit: ProcessExitResult): boolean {
  return !(exit.exitCode === 0 && exit.signal === null);
}

/** Human-readable reason for an abnormal child exit (code vs. signal). */
export function describeChildExit(exit: ProcessExitResult): string {
  if (exit.signal !== null) {
    return `Dev server terminated by signal ${exit.signal}`;
  }
  if (exit.exitCode !== null) {
    return `Dev server exited with code ${exit.exitCode}`;
  }
  return 'Dev server exited abnormally';
}

interface WaitForRuntimeSessionResult {
  session: RuntimeSession | null;
  exit: ProcessExitResult | null;
  browserReady: boolean;
  browserIssue?: RuntimeIssueInfo;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTraceEnabled(): boolean {
  return process.env.IWSDK_RUNTIME_TRACE === '1';
}

function traceDev(event: string, details: Record<string, unknown> = {}): void {
  if (!isTraceEnabled()) {
    return;
  }
  console.error(
    `[IWSDK-RUNTIME-TRACE][dev] ${event} ${JSON.stringify(details)}`,
  );
}

function isBrowserProbeResult(
  value: unknown,
): value is RuntimeBrowserProbeResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as RuntimeBrowserProbeResult).bridgeConnected === 'boolean' &&
    typeof (value as RuntimeBrowserProbeResult).commandReady === 'boolean' &&
    typeof (value as RuntimeBrowserProbeResult).waitedForBridgeMs ===
      'number' &&
    typeof (value as RuntimeBrowserProbeResult).browser === 'object'
  );
}

function isWorkspaceBrowserReady(session: RuntimeSession): boolean {
  if (session.aiMode || !session.browser) {
    return false;
  }

  return (
    session.browser.status === 'waiting_for_connection' ||
    session.browser.status === 'connected'
  );
}

async function probeBrowserCommandReady(
  session: RuntimeSession,
  timeoutMs: number,
): Promise<{ ready: boolean; browserIssue?: RuntimeIssueInfo }> {
  if (!session.browser) {
    return { ready: true };
  }
  const usesCommandReadyContract =
    hasRuntimeBrowserCommandReadyContract(session);
  const browserReady = isRuntimeBrowserCommandReady(session);

  traceDev('probe_start', {
    port: session.port,
    timeoutMs,
    browserStatus: session.browser.status,
    bridgeConnected: session.browser.connected,
    commandReady: browserReady,
    usesCommandReadyContract,
  });

  if (!usesCommandReadyContract) {
    return { ready: browserReady };
  }

  try {
    const response = await sendRuntimeCommand({
      port: session.port,
      method: INTERNAL_BROWSER_PROBE_METHOD,
      timeoutMs,
      runtimeSession: session,
    });
    const ready = isBrowserProbeResult(response.result)
      ? response.result.commandReady
      : false;
    traceDev('probe_result', {
      port: session.port,
      ready,
      result: isBrowserProbeResult(response.result) ? response.result : null,
    });
    return { ready };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof RuntimeCommandExecutionError
        ? error.issueCause
        : session.browser.lastError?.cause;
    traceDev('probe_error', {
      port: session.port,
      message,
      cause: cause ?? null,
    });
    return {
      ready: false,
      browserIssue: {
        cause: cause ?? 'browser_not_ready',
        message,
        at: new Date().toISOString(),
      },
    };
  }
}

async function readPackageManifest(
  workspaceRoot: string,
): Promise<PackageJsonManifest> {
  return safeJsonParse<PackageJsonManifest>(
    await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'),
    'package.json',
  );
}

async function detectPackageManager(workspaceRoot: string): Promise<string> {
  const packageJson = await readPackageManifest(workspaceRoot);

  if (typeof packageJson.packageManager === 'string') {
    return packageJson.packageManager.split('@')[0];
  }

  if (existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(path.join(workspaceRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (
    existsSync(path.join(workspaceRoot, 'bun.lockb')) ||
    existsSync(path.join(workspaceRoot, 'bun.lock'))
  ) {
    return 'bun';
  }

  return 'npm';
}

async function resolveDevRuntimeScript(workspaceRoot: string): Promise<string> {
  const packageJson = await readPackageManifest(workspaceRoot);
  const scripts = packageJson.scripts ?? {};
  if (typeof scripts['dev:runtime'] === 'string') {
    return 'dev:runtime';
  }
  throw new Error(
    'Missing required "dev:runtime" script. This workspace must define an internal runtime script for "iwsdk dev up".',
  );
}

function isOpenRequested(options: CliOptions): boolean {
  return options.open === true;
}

function isForegroundLaunch(options: CliOptions): boolean {
  return options.foreground === true;
}

function getRunScriptArgs(
  packageManager: string,
  scriptName: string,
): string[] {
  switch (packageManager) {
    case 'yarn':
      return [scriptName];
    case 'bun':
      return ['run', scriptName];
    case 'pnpm':
    case 'npm':
    default:
      return ['run', scriptName];
  }
}

async function ensureLogPath(workspaceRoot: string): Promise<string> {
  const logsDir = await ensureRuntimeLogsDir(workspaceRoot);
  return path.join(logsDir, `dev-${Date.now()}.log`);
}

async function waitForRuntimeSession(
  workspaceRoot: string,
  timeoutMs: number,
  getChildExit?: () => ProcessExitResult | null,
): Promise<WaitForRuntimeSessionResult> {
  const deadline = Date.now() + timeoutMs;
  let lastSession: RuntimeSession | null = null;
  let lastBrowserIssue: RuntimeIssueInfo | undefined;

  while (Date.now() < deadline) {
    const session = await getRuntimeSession(workspaceRoot);
    if (session) {
      lastSession = session;
      if (
        !session.browser ||
        isWorkspaceBrowserReady(session) ||
        isRuntimeBrowserCommandReady(session)
      ) {
        return { session, exit: null, browserReady: true };
      }
      if (session.browser.status === 'launch_failed') {
        return {
          session,
          exit: null,
          browserReady: false,
          browserIssue: session.browser.lastError ?? {
            cause: 'browser_launch_failed',
            message: 'Managed browser launch failed.',
            at: session.browser.lastTransitionAt,
          },
        };
      }

      if (session.aiMode) {
        const remainingMs = Math.max(deadline - Date.now(), 1);
        const probe = await probeBrowserCommandReady(
          session,
          Math.min(remainingMs, 2500),
        );
        if (probe.ready) {
          const refreshedSession = await getRuntimeSession(workspaceRoot);
          return {
            session: refreshedSession ?? session,
            exit: null,
            browserReady: true,
          };
        }
        if (probe.browserIssue) {
          lastBrowserIssue = probe.browserIssue;
        }
      }
    }

    const exit = getChildExit?.() ?? null;
    if (exit) {
      return {
        session: lastSession,
        exit,
        browserReady: false,
        browserIssue: lastBrowserIssue ?? lastSession?.browser?.lastError,
      };
    }
    await sleep(250);
  }

  return {
    session: lastSession,
    exit: null,
    browserReady: Boolean(
      lastSession &&
        (isWorkspaceBrowserReady(lastSession) ||
          isRuntimeBrowserCommandReady(lastSession)),
    ),
    browserIssue:
      lastBrowserIssue ??
      (lastSession?.browser
        ? (lastSession.browser.lastError ?? {
            cause:
              lastSession.browser.status === 'disconnected'
                ? 'connection_lost'
                : 'browser_not_ready',
            message:
              lastSession.browser.status === 'disconnected'
                ? 'Managed browser runtime disconnected before becoming ready.'
                : lastSession.browser.connected
                  ? 'Managed browser bridge connected, but the command path did not finish warming up before the timeout elapsed.'
                  : 'Managed browser did not finish connecting before the timeout elapsed.',
            at: lastSession.browser.lastTransitionAt,
          })
        : undefined),
  };
}

function waitForChildExit(child: ChildProcess): Promise<ProcessExitResult> {
  return new Promise((resolve) => {
    child.once('error', () => {
      resolve({ exitCode: 1, signal: null });
    });
    child.once('exit', (exitCode, signal) => {
      resolve({ exitCode, signal });
    });
  });
}

function getOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }
  return { command: 'xdg-open', args: [url] };
}

async function openUrl(url: string): Promise<void> {
  const command = getOpenCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', (error) => {
      reject(new Error(`Failed to open browser URL ${url}: ${error.message}`));
    });
    child.once('spawn', () => {
      resolve();
    });

    child.unref();
  });
}

async function terminateRuntimeWorkspace(
  workspaceRoot: string,
): Promise<unknown> {
  const state = await getWorkspaceRuntimeState(workspaceRoot);
  const pids = Array.from(
    new Set(
      [state.session?.pid, state.launch?.pid].filter(
        (value): value is number => typeof value === 'number',
      ),
    ),
  );

  if (pids.length === 0) {
    return {
      stopped: false,
      workspaceRoot,
      session: state.session,
      launch: state.launch,
    };
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const freshState = await getWorkspaceRuntimeState(workspaceRoot);
    if (!freshState.session && !freshState.launch) {
      await clearLaunchMetadata(workspaceRoot);
      return {
        stopped: true,
        workspaceRoot,
      };
    }
    await sleep(250);
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }

  await clearLaunchMetadata(workspaceRoot);
  return {
    stopped: true,
    workspaceRoot,
    forced: true,
  };
}

export async function handleDevUp(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown> | CliFailure | null> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });

  const timeoutMs = parseIntegerOption(options.timeout, '--timeout', 60000);
  const foreground = isForegroundLaunch(options);
  const openBrowser = isOpenRequested(options);
  const existingSession = await getRuntimeSession(workspaceRoot);
  if (existingSession) {
    const waitResult = await waitForRuntimeSession(workspaceRoot, timeoutMs);
    const launch = await getLaunchMetadata(workspaceRoot);
    if (!waitResult.session) {
      return createFailure(
        formatMissingRuntimeMessage(workspaceRoot),
        'dev_up_missing_runtime',
        {
          workspaceRoot,
          launch,
        },
      );
    }
    if (!waitResult.browserReady) {
      return createFailure(
        waitResult.browserIssue?.message ??
          `Managed browser did not become ready within ${timeoutMs}ms`,
        'dev_browser_not_ready',
        {
          workspaceRoot,
          logPath: launch?.logPath ?? null,
          scriptName: launch?.scriptName,
          session: waitResult.session,
          browser: waitResult.session.browser ?? null,
          cause: waitResult.browserIssue?.cause,
        },
      );
    }
    if (openBrowser) {
      await openUrl(waitResult.session.localUrl);
    }
    const adapters = await readAdapterStatus(workspaceRoot);
    if (foreground) {
      io.stdout.write(
        `[IWSDK] Runtime already running at ${waitResult.session.localUrl}\n`,
      );
      return null;
    }
    return createSuccess({
      action: 'attached',
      workspaceRoot,
      session: waitResult.session,
      launch,
      adapters,
    });
  }

  const packageManager = await detectPackageManager(workspaceRoot);
  const scriptName = await resolveDevRuntimeScript(workspaceRoot);
  const logPath = foreground ? null : await ensureLogPath(workspaceRoot);
  const stdoutFd = logPath ? openSync(logPath, 'a') : -1;
  const spawnArgs = getRunScriptArgs(packageManager, scriptName);

  const child = spawn(packageManager, spawnArgs, {
    cwd: workspaceRoot,
    detached: !foreground,
    stdio: foreground ? 'inherit' : ['ignore', stdoutFd, stdoutFd],
    env: process.env,
    // npm/pnpm/yarn are .cmd shims on Windows; Node cannot spawn them without a shell.
    shell: process.platform === 'win32',
  });
  const childExitPromise = waitForChildExit(child);
  let childExit: ProcessExitResult | null = null;
  void childExitPromise.then((result) => {
    childExit = result;
  });

  if (!foreground) {
    closeSync(stdoutFd);
    child.unref();
  }

  if (typeof child.pid !== 'number') {
    throw new Error('Failed to start the dev process');
  }

  await setLaunchMetadata({
    workspaceRoot,
    pid: child.pid,
    command: packageManager,
    args: spawnArgs,
    logPath,
    scriptName,
    port: null,
    openBrowser,
  });

  const waitResult = await waitForRuntimeSession(
    workspaceRoot,
    timeoutMs,
    () => childExit,
  );

  if (!waitResult.session) {
    if (waitResult.exit) {
      await clearLaunchMetadata(workspaceRoot);
      return createFailure(
        'Dev server exited before registering a runtime session',
        'dev_up_exit',
        {
          workspaceRoot,
          logPath,
          exitCode: waitResult.exit.exitCode,
          signal: waitResult.exit.signal,
          scriptName,
        },
      );
    }

    return createFailure(
      `Dev server did not register a runtime session within ${timeoutMs}ms`,
      'dev_up_timeout',
      {
        workspaceRoot,
        logPath,
        scriptName,
      },
    );
  }

  await setLaunchMetadata({
    workspaceRoot,
    pid: waitResult.session.pid,
    command: packageManager,
    args: spawnArgs,
    logPath,
    scriptName,
    port: waitResult.session.port,
    openBrowser,
  });

  if (!waitResult.browserReady) {
    return createFailure(
      waitResult.browserIssue?.message ??
        `Managed browser did not become ready within ${timeoutMs}ms`,
      'dev_browser_not_ready',
      {
        workspaceRoot,
        logPath,
        scriptName,
        session: waitResult.session,
        browser: waitResult.session?.browser ?? null,
        cause: waitResult.browserIssue?.cause,
      },
    );
  }

  const launch = await getLaunchMetadata(workspaceRoot);
  const adapters = await readAdapterStatus(workspaceRoot);

  if (openBrowser) {
    await openUrl(waitResult.session.localUrl);
  }

  if (foreground) {
    io.stdout.write(
      `[IWSDK] Runtime ready at ${waitResult.session.localUrl}\n`,
    );
    const exit = await childExitPromise;
    if (isAbnormalChildExit(exit)) {
      return createFailure(describeChildExit(exit), 'dev_up_exit', {
        workspaceRoot,
        session: waitResult.session,
        exitCode: exit.exitCode,
        signal: exit.signal,
        scriptName,
      });
    }
    return null;
  }

  return createSuccess({
    action: 'started',
    workspaceRoot,
    session: waitResult.session,
    launch,
    logPath,
    adapters,
  });
}

export async function handleDevDown(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });
  return createSuccess(await terminateRuntimeWorkspace(workspaceRoot));
}

export async function handleDevRestart(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown> | CliFailure | null> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });

  await terminateRuntimeWorkspace(workspaceRoot);
  return handleDevUp({ ...options, workspace: workspaceRoot }, io);
}

export async function handleDevLogs(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });
  const launch = await getLaunchMetadata(workspaceRoot);
  if (!launch?.logPath || !existsSync(launch.logPath)) {
    return createSuccess({
      workspaceRoot,
      logPath: launch?.logPath ?? null,
      available: false,
    });
  }

  const tailLines = parseIntegerOption(options.tail, '--tail', 200);
  const content = await readFile(launch.logPath, 'utf8');
  const lines = content.trimEnd().split('\n');
  return createSuccess({
    workspaceRoot,
    logPath: launch.logPath,
    available: true,
    tail: lines.slice(-tailLines).join('\n'),
  });
}

export async function handleDevOpen(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
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

  await openUrl(session.localUrl);

  return createSuccess({
    workspaceRoot,
    opened: session.localUrl,
    browserConnected: Boolean(session.browser?.connected),
    browserCommandReady: isRuntimeBrowserCommandReady(session),
    browser: session.browser ?? null,
  });
}

export async function handleDevStatus(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  return handleStatus(options, io);
}
