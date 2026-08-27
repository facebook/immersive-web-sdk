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
import {
  parseIntegerOption,
  parseOptionalPositiveIntegerOption,
  safeJsonParse,
} from '../argv.js';
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
  type RuntimeBrowserState,
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
  getRuntimeUrls,
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

export type DevAiMode = 'agent' | 'collaborate';

export interface ResolvedDevSessionOptions {
  aiMode?: DevAiMode;
  headless: boolean;
  open: boolean;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

const DEV_SESSION_ENV_NAMES = {
  aiMode: 'IWSDK_DEV_AI_MODE',
  headless: 'IWSDK_DEV_HEADLESS',
  open: 'IWSDK_DEV_OPEN',
  screenshotHeight: 'IWSDK_DEV_SCREENSHOT_HEIGHT',
  screenshotWidth: 'IWSDK_DEV_SCREENSHOT_WIDTH',
} as const;

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

function writeRuntimeUrls(
  io: ResolvedCliIo,
  message: string,
  session: RuntimeSession,
): void {
  io.stdout.write(`[IWSDK] ${message} ${session.localUrl}\n`);
  for (const networkUrl of session.networkUrls ?? []) {
    io.stdout.write(`[IWSDK] Network URL: ${networkUrl}\n`);
  }
}

async function wasWorkspaceStoppedExternally(
  workspaceRoot: string,
  timeoutMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    const state = await getWorkspaceRuntimeState(workspaceRoot);
    if (!state.session && !state.launch) {
      return true;
    }
    await sleep(50);
  } while (Date.now() < deadline);
  return false;
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

async function probeBrowserCommandReady(
  session: RuntimeSession,
  timeoutMs: number,
): Promise<{
  ready: boolean;
  browser?: RuntimeBrowserState;
  browserIssue?: RuntimeIssueInfo;
}> {
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
    const result = isBrowserProbeResult(response.result)
      ? response.result
      : undefined;
    const ready = result?.commandReady ?? false;
    traceDev('probe_result', {
      port: session.port,
      ready,
      result: result ?? null,
    });
    return { ready, ...(result == null ? {} : { browser: result.browser }) };
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

function readBooleanFlag(
  value: CliOptions[string] | undefined,
  label: string,
): boolean {
  if (value == null || value === false) {
    return false;
  }
  if (value !== true) {
    throw new Error(`${label} does not take a value`);
  }
  return true;
}

function readAiMode(
  value: CliOptions[string] | undefined,
): DevAiMode | undefined {
  if (value == null) {
    return undefined;
  }
  if (value === 'agent' || value === 'collaborate') {
    return value;
  }
  throw new Error('--ai-mode must be either "agent" or "collaborate"');
}

/** Parse and validate launch-time choices owned by the dev command. */
export function resolveDevSessionOptions(
  options: CliOptions,
): ResolvedDevSessionOptions {
  const aiMode = readAiMode(options.aiMode);
  const headlessRequested = readBooleanFlag(options.headless, '--headless');
  const headedRequested = readBooleanFlag(options.headed, '--headed');
  const openRequested = readBooleanFlag(options.open, '--open');
  const noOpenRequested = readBooleanFlag(options.noOpen, '--no-open');

  if (headlessRequested && headedRequested) {
    throw new Error('--headless and --headed cannot be used together');
  }
  if (openRequested && noOpenRequested) {
    throw new Error('--open and --no-open cannot be used together');
  }
  if (aiMode === 'agent' && headedRequested) {
    throw new Error('--ai-mode agent is headless and cannot use --headed');
  }
  if (aiMode === 'collaborate' && headlessRequested) {
    throw new Error(
      '--ai-mode collaborate is headed and cannot use --headless',
    );
  }

  const screenshotWidth = parseOptionalPositiveIntegerOption(
    options.screenshotWidth,
    '--screenshot-width',
  );
  const screenshotHeight = parseOptionalPositiveIntegerOption(
    options.screenshotHeight,
    '--screenshot-height',
  );

  return {
    ...(aiMode == null ? {} : { aiMode }),
    headless: headlessRequested || aiMode === 'agent',
    open: !noOpenRequested,
    ...(screenshotWidth == null ? {} : { screenshotWidth }),
    ...(screenshotHeight == null ? {} : { screenshotHeight }),
  };
}

/** Build the child environment without retaining stale session overrides. */
export function buildDevRuntimeEnvironment(
  options: CliOptions,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const session = resolveDevSessionOptions(options);
  const environment = { ...baseEnvironment };
  for (const name of Object.values(DEV_SESSION_ENV_NAMES)) {
    delete environment[name];
  }

  environment[DEV_SESSION_ENV_NAMES.headless] = String(session.headless);
  environment[DEV_SESSION_ENV_NAMES.open] = String(session.open);
  if (session.aiMode != null) {
    environment[DEV_SESSION_ENV_NAMES.aiMode] = session.aiMode;
  }
  if (session.screenshotWidth != null) {
    environment[DEV_SESSION_ENV_NAMES.screenshotWidth] = String(
      session.screenshotWidth,
    );
  }
  if (session.screenshotHeight != null) {
    environment[DEV_SESSION_ENV_NAMES.screenshotHeight] = String(
      session.screenshotHeight,
    );
  }
  return environment;
}

export function shouldOpenExternalBrowser(
  openRequested: boolean,
  session: Pick<RuntimeSession, 'browser'>,
): boolean {
  return openRequested && session.browser == null;
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
      if (!session.browser || isRuntimeBrowserCommandReady(session)) {
        return { session, exit: null, browserReady: true };
      }
      if (session.browser.status === 'not_launched') {
        return {
          session,
          exit: null,
          // The server is ready; browser-dependent commands remain explicitly
          // unavailable by operator choice.
          browserReady: true,
          browserIssue: session.browser.lastError,
        };
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

      if (session.browser) {
        const remainingMs = Math.max(deadline - Date.now(), 1);
        const probe = await probeBrowserCommandReady(
          session,
          Math.min(remainingMs, 2500),
        );
        if (probe.ready) {
          const refreshedSession = await getRuntimeSession(workspaceRoot);
          const resolvedSession = refreshedSession ?? session;
          return {
            session:
              isRuntimeBrowserCommandReady(resolvedSession) || !probe.browser
                ? resolvedSession
                : {
                    ...resolvedSession,
                    browser: probe.browser,
                    updatedAt: new Date().toISOString(),
                  },
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
      lastSession && isRuntimeBrowserCommandReady(lastSession),
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
  const devSessionOptions = resolveDevSessionOptions(options);
  const workspaceRoot = await resolveWorkspaceRoot({
    cwd: io.cwd,
    workspace:
      typeof options.workspace === 'string' ? options.workspace : undefined,
    requireRunning: false,
  });

  const timeoutMs = parseIntegerOption(options.timeout, '--timeout', 60000);
  const foreground = isForegroundLaunch(options);
  const openBrowser = devSessionOptions.open;
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
    if (shouldOpenExternalBrowser(openBrowser, waitResult.session)) {
      await openUrl(waitResult.session.localUrl);
    }
    const adapters = await readAdapterStatus(workspaceRoot);
    if (foreground) {
      writeRuntimeUrls(io, 'Runtime already running at', waitResult.session);
      return null;
    }
    return createSuccess({
      action: 'attached',
      workspaceRoot,
      runtimeUrls: getRuntimeUrls(waitResult.session),
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
    env: buildDevRuntimeEnvironment(options),
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

  if (shouldOpenExternalBrowser(openBrowser, waitResult.session)) {
    await openUrl(waitResult.session.localUrl);
  }

  if (foreground) {
    writeRuntimeUrls(io, 'Runtime ready at', waitResult.session);
    const exit = await childExitPromise;
    if (
      isAbnormalChildExit(exit) &&
      !(await wasWorkspaceStoppedExternally(workspaceRoot))
    ) {
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
    runtimeUrls: getRuntimeUrls(waitResult.session),
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

  const openedExternally = shouldOpenExternalBrowser(true, session);
  if (openedExternally) {
    await openUrl(session.localUrl);
  }

  return createSuccess({
    workspaceRoot,
    opened: openedExternally ? session.localUrl : null,
    managedBrowser: session.browser != null,
    browserConnected: Boolean(session.browser?.connected),
    browserCommandReady: isRuntimeBrowserCommandReady(session),
    browser: session.browser ?? null,
    ...(session.browser?.status === 'not_launched'
      ? {
          actionRequired:
            'Run "iwsdk dev restart --open" to launch the managed browser.',
        }
      : {}),
  });
}

export async function handleDevStatus(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  return handleStatus(options, io);
}
