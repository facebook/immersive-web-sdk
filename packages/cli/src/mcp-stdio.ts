/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { reportToolCall } from './hzdb-telemetry.js';
import {
  isRuntimeBrowserCommandReady,
  RUNTIME_MCP_TOOLS,
  RUNTIME_OPERATIONS,
  resolveRuntimeOperationRequest,
  type RuntimeSession,
} from './runtime-contract.js';
import {
  RuntimeCommandExecutionError,
  sendRuntimeCommand,
  type RuntimeCommandResponse,
} from './runtime-transport.js';

type JsonObject = Record<string, unknown>;
type McpTextContent = { type: 'text'; text: string };
type McpImageContent = { type: 'image'; data: string; mimeType: string };

export interface StartRuntimeMcpStdioServerOptions {
  serverName?: string;
  version?: string;
  resolveSession: () => Promise<RuntimeSession | null>;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createTabMetadataText(
  tabId: string,
  tabGeneration?: number,
): McpTextContent {
  return {
    type: 'text',
    text: JSON.stringify(
      { _tab: { id: tabId, generation: tabGeneration } },
      null,
      2,
    ),
  };
}

function createTabTracker() {
  let lastTabId: string | null = null;
  let lastTabGeneration: number | null = null;

  return {
    processResponse(rawResponse: RuntimeCommandResponse) {
      const result = rawResponse.result ?? rawResponse;
      const tabId = rawResponse._tabId;
      const tabGeneration = rawResponse._tabGeneration;
      const previousTabId = lastTabId;
      const previousTabGeneration = lastTabGeneration;
      const tabChanged =
        previousTabId !== null && tabId != null && tabId !== previousTabId;
      const tabReloaded =
        previousTabId !== null &&
        previousTabId === tabId &&
        previousTabGeneration !== null &&
        typeof tabGeneration === 'number' &&
        tabGeneration !== previousTabGeneration;

      if (tabId) {
        lastTabId = tabId;
        lastTabGeneration =
          typeof tabGeneration === 'number' ? tabGeneration : null;
      }

      const content: McpTextContent[] = [];
      if (tabChanged || tabReloaded) {
        content.push({
          type: 'text',
          text: `WARNING: ${
            tabChanged
              ? `Active browser tab changed (previous: ${previousTabId}, current: ${tabId})`
              : `Active browser tab reloaded (tab: ${tabId}, generation: ${previousTabGeneration} -> ${tabGeneration})`
          }. All previously cached state (device positions, scene hierarchy, ECS snapshots) is now invalid. Re-query any state you need before proceeding.`,
        });
      }

      const normalizedResult = Array.isArray(result)
        ? result
        : isRecord(result)
          ? result
          : { value: result };

      if (Array.isArray(normalizedResult)) {
        content.push({
          type: 'text',
          text: JSON.stringify(normalizedResult, null, 2),
        });
        if (tabId) {
          content.push(createTabMetadataText(tabId, tabGeneration));
        }
        return { content };
      }

      content.push({
        type: 'text',
        text: JSON.stringify(
          {
            ...normalizedResult,
            ...(tabId
              ? { _tab: { id: tabId, generation: tabGeneration } }
              : {}),
          },
          null,
          2,
        ),
      });

      return { content };
    },
  };
}

function withBrowserStatus(
  result: unknown,
  session: RuntimeSession,
): JsonObject {
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

function createErrorContent(
  message: string,
  options: {
    cause?: string;
    browser?: RuntimeSession['browser'] | null;
    details?: Record<string, unknown>;
  } = {},
): McpTextContent[] {
  const payload = {
    message,
    ...(options.details ?? {}),
    ...(options.cause ? { cause: options.cause } : {}),
    ...(options.browser !== undefined ? { browser: options.browser } : {}),
  };

  return [{ type: 'text', text: JSON.stringify(payload, null, 2) }];
}

export async function startRuntimeMcpStdioServer({
  serverName = 'iwsdk',
  version = '1.0.0',
  resolveSession,
}: StartRuntimeMcpStdioServerOptions): Promise<void> {
  const tabTracker = createTabTracker();
  const server = new Server(
    {
      name: serverName,
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: RUNTIME_MCP_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const operation = RUNTIME_OPERATIONS.find(
      (entry) => entry.mcpName === name,
    );
    const startTime = Date.now();

    if (!operation) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    let session: RuntimeSession | null;
    try {
      session = await resolveSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportToolCall(
        name,
        false,
        Date.now() - startTime,
        message.slice(0, 30),
        undefined,
        version,
      );
      return {
        content: [
          { type: 'text', text: `Failed to resolve IWSDK runtime: ${message}` },
        ],
        isError: true,
      };
    }

    if (!session) {
      reportToolCall(
        name,
        false,
        Date.now() - startTime,
        'no active runtime',
        undefined,
        version,
      );
      return {
        content: [
          {
            type: 'text',
            text: 'No active IWSDK runtime found. Start the dev server with "iwsdk dev up" or use "iwsdk dev status" to inspect the current workspace.',
          },
        ],
        isError: true,
      };
    }

    try {
      const command = resolveRuntimeOperationRequest(operation, args);
      const rawResponse = await sendRuntimeCommand({
        port: session.port,
        method: operation.wsMethod,
        params: command.params,
        target: command.target,
        runtimeSession: session,
      });
      reportToolCall(
        name,
        true,
        Date.now() - startTime,
        undefined,
        session.sessionId,
        version,
      );

      const normalizedResponse =
        name === 'xr_get_session_status'
          ? {
              ...rawResponse,
              result: withBrowserStatus(
                rawResponse.result ?? rawResponse,
                session,
              ),
            }
          : rawResponse;
      const result = normalizedResponse.result ?? normalizedResponse;
      if (
        (name === 'browser_screenshot' ||
          name === 'scene_screenshot' ||
          name === 'scene_render_file') &&
        isRecord(result) &&
        typeof result.imageData === 'string' &&
        typeof result.mimeType === 'string'
      ) {
        const image: McpImageContent = {
          type: 'image',
          data: result.imageData,
          mimeType: result.mimeType,
        };
        if (name === 'scene_render_file') {
          const { imageData: _imageData, ...metadata } = result;
          const content: Array<McpTextContent | McpImageContent> = [
            { type: 'text', text: JSON.stringify(metadata, null, 2) },
            image,
          ];
          if (normalizedResponse._tabId != null) {
            content.push(
              createTabMetadataText(
                normalizedResponse._tabId,
                normalizedResponse._tabGeneration,
              ),
            );
          }
          return { content };
        }
        const content: McpImageContent[] = [image];
        return { content };
      }

      return tabTracker.processResponse(normalizedResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportToolCall(
        name,
        false,
        Date.now() - startTime,
        message.slice(0, 30),
        session.sessionId,
        version,
      );
      if (error instanceof RuntimeCommandExecutionError) {
        return {
          content: createErrorContent(message, {
            cause: error.issueCause,
            browser: error.browser ?? null,
            details: error.details,
          }),
          isError: true,
        };
      }
      return {
        content: createErrorContent(message),
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
