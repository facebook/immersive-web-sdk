/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { type RuntimeBrowserState } from '@iwsdk/cli/contract';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  registerRuntimeSession,
  unregisterRuntimeSession,
} from './runtime-session-fixture.js';

const CLI_PATH = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const CLI_PACKAGE_VERSION = (
  JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string }
).version;

// Stands in for @meta-quest/metavr: records each telemetry invocation instead
// of reporting it.
const FAKE_METAVR_BIN = `const fs = require('fs');
const path = require('path');
fs.appendFileSync(
  path.join(__dirname, 'calls.jsonl'),
  JSON.stringify(process.argv.slice(2)) + '\\n',
);
`;

// Telemetry is reported from a separate child process, so give a duplicate
// report time to land before asserting that none arrived.
const DUPLICATE_REPORT_GRACE_MS = 750;

type RuntimeResponse = {
  result?: unknown;
  error?: { message?: string };
  _tabId?: string;
  _tabGeneration?: number;
};

let tempDir: string;
let appRoot: string;
let callsPath: string;

async function createAppFixture(root: string) {
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        private: true,
        devDependencies: {
          '@iwsdk/vite-plugin-dev': 'workspace:*',
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(root, 'vite.config.ts'),
    'export default {}\n',
    'utf8',
  );
  await writeFile(path.join(root, 'src', 'main.ts'), 'export {};\n', 'utf8');
}

async function installFakeMetaVr(root: string): Promise<string> {
  const packageRoot = path.join(root, 'node_modules', '@meta-quest', 'metavr');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: '@meta-quest/metavr', version: '0.0.0-test' }) +
      '\n',
    'utf8',
  );
  await writeFile(path.join(packageRoot, 'bin.js'), FAKE_METAVR_BIN, 'utf8');
  return path.join(packageRoot, 'calls.jsonl');
}

function createBrowserState(): RuntimeBrowserState {
  return {
    status: 'connected',
    connected: true,
    commandReady: true,
    connectedClientCount: 1,
    lastTransitionAt: new Date().toISOString(),
  };
}

async function startRuntimeFixture(
  workspaceRoot: string,
  handler: () => RuntimeResponse,
) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  server.on('connection', (socket) => {
    socket.on('message', (chunk) => {
      const request = JSON.parse(chunk.toString()) as { id: string };
      socket.send(JSON.stringify({ id: request.id, ...handler() }));
    });
  });

  await registerRuntimeSession({
    sessionId: `session-${path.basename(workspaceRoot)}`,
    workspaceRoot,
    pid: process.pid,
    port,
    localUrl: `http://localhost:${port}`,
    aiMode: 'agent',
    aiTools: ['claude'],
    browser: createBrowserState(),
  });

  return {
    async close() {
      await unregisterRuntimeSession(workspaceRoot);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function runCli(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function callMcpTool(
  cwd: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, 'mcp', 'stdio'],
    cwd,
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'telemetry-parity-test',
    version: '1.0.0',
  });
  await client.connect(transport);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await transport.close();
  }
}

async function readTelemetryCalls(): Promise<string[][]> {
  let text: string;
  try {
    text = await readFile(callsPath, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

async function waitForTelemetryCalls(
  count: number,
  timeoutMs = 10_000,
): Promise<string[][]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const calls = await readTelemetryCalls();
    if (calls.length >= count) {
      return calls;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} telemetry calls, saw ${calls.length}: ${JSON.stringify(calls)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function expectNoFurtherTelemetryCalls(count: number) {
  await new Promise((resolve) =>
    setTimeout(resolve, DUPLICATE_REPORT_GRACE_MS),
  );
  expect(await readTelemetryCalls()).toHaveLength(count);
}

// Durations differ between runs, so compare everything else.
function withoutDuration(call: string[]): string[] {
  const index = call.indexOf('--duration-ms');
  expect(index).toBeGreaterThan(-1);
  expect(call[index + 1]).toMatch(/^\d+$/);
  return [...call.slice(0, index + 1), '<ms>', ...call.slice(index + 2)];
}

function toolCall(toolName: string, ...rest: string[]): string[] {
  return [
    'xxiwsdk',
    '--client-version',
    CLI_PACKAGE_VERSION,
    'tool-call',
    '--tool-name',
    toolName,
    '--duration-ms',
    '<ms>',
    ...rest,
  ];
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-telemetry-parity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  appRoot = path.join(tempDir, 'apps', 'app-a');
  await createAppFixture(appRoot);
  // Installed above the app so that commands run outside it still find it.
  callsPath = await installFakeMetaVr(tempDir);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('runtime operation telemetry from MCP and CLI', () => {
  test('reports a successful operation identically', async () => {
    const runtime = await startRuntimeFixture(appRoot, () => ({
      result: { sessionOffered: false, sessionActive: false },
      _tabId: 'tab-1',
      _tabGeneration: 1,
    }));

    try {
      const cli = await runCli(['xr', 'status'], path.join(appRoot, 'src'));
      expect(cli.exitCode, cli.stderr).toBe(0);
      await waitForTelemetryCalls(1);

      const mcp = await callMcpTool(appRoot, 'xr_get_session_status');
      expect(mcp.isError).not.toBe(true);

      const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
      const expected = toolCall(
        'xr_get_session_status',
        '--session-id',
        'session-app-a',
      );
      expect(withoutDuration(cliCall!)).toEqual(expected);
      expect(withoutDuration(mcpCall!)).toEqual(expected);
      await expectNoFurtherTelemetryCalls(2);
    } finally {
      await runtime.close();
    }
  });

  test('reports a runtime failure identically without its message or cause', async () => {
    const runtime = await startRuntimeFixture(appRoot, () => ({
      error: {
        message: "Component 'PlayerHealth' not found in registry.",
        cause: 'PlayerHealth',
      },
    }));

    try {
      const cli = await runCli(['xr', 'status'], appRoot);
      expect(cli.exitCode).toBe(1);
      await waitForTelemetryCalls(1);

      const mcp = await callMcpTool(appRoot, 'xr_get_session_status');
      expect(mcp.isError).toBe(true);

      const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
      const expected = toolCall(
        'xr_get_session_status',
        '--failure',
        '--error=runtime_error',
        '--session-id',
        'session-app-a',
      );
      expect(withoutDuration(cliCall!)).toEqual(expected);
      expect(withoutDuration(mcpCall!)).toEqual(expected);
      await expectNoFurtherTelemetryCalls(2);
    } finally {
      await runtime.close();
    }
  });

  test('reports a missing runtime identically', async () => {
    const cli = await runCli(['xr', 'status'], appRoot);
    expect(cli.exitCode).toBe(1);
    await waitForTelemetryCalls(1);

    const mcp = await callMcpTool(appRoot, 'xr_get_session_status');
    expect(mcp.isError).toBe(true);

    const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
    const expected = toolCall(
      'xr_get_session_status',
      '--failure',
      '--error=no_runtime',
    );
    expect(withoutDuration(cliCall!)).toEqual(expected);
    expect(withoutDuration(mcpCall!)).toEqual(expected);
    await expectNoFurtherTelemetryCalls(2);
  });

  test('reports an operation run outside an IWSDK app identically', async () => {
    const cli = await runCli(['xr', 'status'], tempDir);
    expect(cli.exitCode).toBe(1);
    await waitForTelemetryCalls(1);

    const mcp = await callMcpTool(tempDir, 'xr_get_session_status');
    expect(mcp.isError).toBe(true);

    const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
    const expected = toolCall(
      'xr_get_session_status',
      '--failure',
      '--error=no_app',
    );
    expect(withoutDuration(cliCall!)).toEqual(expected);
    expect(withoutDuration(mcpCall!)).toEqual(expected);
    await expectNoFurtherTelemetryCalls(2);
  });

  test('reports a denied xr enter identically despite the CLI advice', async () => {
    const runtime = await startRuntimeFixture(appRoot, () => ({
      error: { message: 'Denied' },
    }));

    try {
      const cli = await runCli(['xr', 'enter'], appRoot);
      expect(cli.exitCode).toBe(1);
      expect(cli.stderr).toContain('Configure world.xr.offer');
      await waitForTelemetryCalls(1);

      const mcp = await callMcpTool(appRoot, 'xr_accept_session');
      expect(mcp.isError).toBe(true);

      const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
      const expected = toolCall(
        'xr_accept_session',
        '--failure',
        '--error=permission_denied',
        '--session-id',
        'session-app-a',
      );
      expect(withoutDuration(cliCall!)).toEqual(expected);
      expect(withoutDuration(mcpCall!)).toEqual(expected);
      await expectNoFurtherTelemetryCalls(2);
    } finally {
      await runtime.close();
    }
  });

  test.each([
    ['with a running runtime', true],
    ['without a running runtime', false],
  ])(
    'reports invalid parameters identically %s',
    async (_label, withRuntime) => {
      const runtime = withRuntime
        ? await startRuntimeFixture(appRoot, () => ({ result: { ok: true } }))
        : undefined;

      try {
        const cli = await runCli(
          ['xr', 'get-transform', '--input-json', '{}'],
          appRoot,
        );
        expect(cli.exitCode).toBe(1);
        await waitForTelemetryCalls(1);

        const mcp = await callMcpTool(appRoot, 'xr_get_transform');
        expect(mcp.isError).toBe(true);

        const [cliCall, mcpCall] = await waitForTelemetryCalls(2);
        const expected = toolCall(
          'xr_get_transform',
          '--failure',
          '--error=invalid_input',
        );
        expect(withoutDuration(cliCall!)).toEqual(expected);
        expect(withoutDuration(mcpCall!)).toEqual(expected);
        await expectNoFurtherTelemetryCalls(2);
      } finally {
        await runtime?.close();
      }
    },
  );

  test('reports a CLI command with invalid input as a failed operation', async () => {
    const runtime = await startRuntimeFixture(appRoot, () => ({
      result: { ok: true },
    }));

    try {
      const cli = await runCli(
        ['browser', 'screenshot', '--input-json', '{not json'],
        appRoot,
      );
      expect(cli.exitCode).toBe(1);

      const [call] = await waitForTelemetryCalls(1);
      expect(withoutDuration(call!)).toEqual(
        toolCall('browser_screenshot', '--failure', '--error=invalid_input'),
      );
      await expectNoFurtherTelemetryCalls(1);
    } finally {
      await runtime.close();
    }
  });

  test('does not report unknown commands or tools', async () => {
    const runtime = await startRuntimeFixture(appRoot, () => ({
      result: { ok: true },
    }));

    try {
      const cli = await runCli(['xr', 'not-a-command'], appRoot);
      expect(cli.exitCode).toBe(1);

      const mcp = await callMcpTool(appRoot, 'not_a_tool');
      expect(mcp.isError).toBe(true);

      await expectNoFurtherTelemetryCalls(0);
    } finally {
      await runtime.close();
    }
  });
});
