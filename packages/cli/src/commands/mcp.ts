/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSuccess } from '../cli-results.js';
import type { CliOptions, CliSuccess, ResolvedCliIo } from '../cli-types.js';
import { startRuntimeMcpStdioServer } from '../mcp-stdio.js';
import { RUNTIME_OPERATIONS } from '../runtime-contract.js';
import { getRuntimeSession, resolveWorkspaceRoot } from '../runtime-state.js';
import { detectWorkspaceForStatus } from './status.js';

export async function handleMcpInspect(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<CliSuccess<unknown>> {
  const workspaceRoot = await detectWorkspaceForStatus(
    io.cwd,
    options.workspace,
  );
  const session = workspaceRoot ? await getRuntimeSession(workspaceRoot) : null;
  const requestedTool = typeof options.tool === 'string' ? options.tool : null;

  if (requestedTool) {
    const operation = RUNTIME_OPERATIONS.find(
      (entry) => entry.mcpName === requestedTool,
    );
    if (!operation) {
      throw new Error(
        `Unknown runtime tool "${requestedTool}". Available: ${RUNTIME_OPERATIONS.map((entry) => entry.mcpName).join(', ')}`,
      );
    }

    return createSuccess({
      workspaceRoot,
      session,
      tool: {
        cliPath: operation.cliPath.join(' '),
        mcpName: operation.mcpName,
        wsMethod: operation.wsMethod,
        description: operation.description,
        inputSchema: operation.inputSchema,
      },
    });
  }

  return createSuccess({
    workspaceRoot,
    session,
    tools: RUNTIME_OPERATIONS.map((operation) => ({
      cliPath: operation.cliPath.join(' '),
      mcpName: operation.mcpName,
      wsMethod: operation.wsMethod,
      description: operation.description,
    })),
  });
}

export async function handleMcpStdio(
  options: CliOptions,
  io: ResolvedCliIo,
): Promise<null> {
  await startRuntimeMcpStdioServer({
    serverName: 'iwsdk-runtime',
    resolveSession: async () => {
      const workspaceRoot = await resolveWorkspaceRoot({
        cwd: io.cwd,
        workspace:
          typeof options.workspace === 'string' ? options.workspace : undefined,
        requireRunning: true,
      });
      return getRuntimeSession(workspaceRoot);
    },
  });
  return null;
}
