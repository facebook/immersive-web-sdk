/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import WebSocket from 'ws';
import {
  isRuntimeBrowserCommandReady,
  type RuntimePageTarget,
  type RuntimeBrowserState,
  type RuntimeIssueCause,
  type RuntimeSession,
} from './runtime-contract.js';

const FAST_WSS_FALLBACK_TIMEOUT_MS = 1500;

type RuntimeCommandError = { message?: string; cause?: RuntimeIssueCause };
type TransportProtocol = 'ws' | 'wss';

export interface RuntimeCommandResponse {
  id?: string;
  result?: unknown;
  _tabId?: string;
  _tabGeneration?: number;
  error?: RuntimeCommandError;
}

export interface SendRuntimeCommandOptions {
  port: number;
  method: string;
  params?: unknown;
  target?: RuntimePageTarget;
  timeoutMs?: number;
  runtimeSession?: RuntimeSession | null;
}

export class RuntimeCommandExecutionError extends Error {
  issueCause?: RuntimeIssueCause;
  browser?: RuntimeBrowserState;

  constructor(
    message: string,
    options: {
      issueCause?: RuntimeIssueCause;
      browser?: RuntimeBrowserState;
    } = {},
  ) {
    super(message);
    this.name = 'RuntimeCommandExecutionError';
    this.issueCause = options.issueCause;
    this.browser = options.browser;
  }
}

class RuntimeCommandTransportError extends RuntimeCommandExecutionError {
  constructor(
    message: string,
    options: {
      issueCause?: RuntimeIssueCause;
      browser?: RuntimeBrowserState;
    } = {},
  ) {
    super(message, options);
    this.name = 'RuntimeCommandTransportError';
  }
}

function isTraceEnabled(): boolean {
  return process.env.IWSDK_RUNTIME_TRACE === '1';
}

function traceTransport(
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (!isTraceEnabled()) {
    return;
  }
  console.error(
    `[IWSDK-RUNTIME-TRACE][transport] ${event} ${JSON.stringify(details)}`,
  );
}

function getRawDataSize(data: WebSocket.RawData): number {
  if (typeof data === 'string') {
    return Buffer.byteLength(data);
  }
  if (Array.isArray(data)) {
    return data.reduce((total, chunk) => total + chunk.length, 0);
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  return data.length;
}

function getProtocolOrder(
  runtimeSession?: RuntimeSession | null,
): TransportProtocol[] {
  if (runtimeSession?.localUrl.startsWith('http://')) {
    return ['ws'];
  }
  if (runtimeSession?.localUrl.startsWith('https://')) {
    return ['wss'];
  }
  return ['wss', 'ws'];
}

function inferRuntimeIssueCause(
  message: string,
  browser: RuntimeBrowserState | undefined,
  explicitCause?: RuntimeIssueCause,
): RuntimeIssueCause | undefined {
  if (explicitCause) {
    return explicitCause;
  }

  const normalized = message.toLowerCase();
  if (browser?.status === 'launch_failed') {
    return browser.lastError?.cause ?? 'browser_launch_failed';
  }
  if (
    browser?.status === 'launching' ||
    browser?.status === 'waiting_for_connection'
  ) {
    return 'browser_not_ready';
  }
  if (browser?.status === 'disconnected') {
    return browser.lastError?.cause ?? 'connection_lost';
  }
  if (normalized.includes('browser not ready')) {
    return browser?.lastError?.cause ?? 'browser_not_ready';
  }
  if (
    normalized.includes('browser_relaunched') ||
    normalized.includes('relaunch')
  ) {
    return 'browser_relaunched';
  }
  if (
    /permission|not permitted|denied|sandbox|eacces|eperm/i.test(normalized)
  ) {
    return 'permission_denied';
  }
  if (
    normalized.includes('socket hang up') ||
    normalized.includes('closed before response') ||
    normalized.includes('request timeout') ||
    normalized.includes('econnreset') ||
    normalized.includes('econnrefused')
  ) {
    if (
      browser &&
      !isRuntimeBrowserCommandReady({
        schemaVersion: 1,
        browser,
      })
    ) {
      return 'browser_not_ready';
    }
    return browser?.connected ? 'connection_lost' : 'browser_not_ready';
  }
  return undefined;
}

async function trySendRuntimeCommand(
  protocol: TransportProtocol,
  port: number,
  method: string,
  params: unknown,
  target: RuntimePageTarget | undefined,
  timeoutMs: number,
  browser: RuntimeBrowserState | undefined,
): Promise<RuntimeCommandResponse> {
  return new Promise<RuntimeCommandResponse>((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const wsUrl = `${protocol}://127.0.0.1:${port}/__iwer_mcp`;
    const ws = new WebSocket(wsUrl, {
      rejectUnauthorized: false,
    });
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const closeSocket = () => {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };

    traceTransport('connect_start', {
      method,
      requestId,
      protocol,
      port,
      timeoutMs,
      browserStatus: browser?.status,
      bridgeConnected: browser?.connected ?? false,
      commandReady: browser
        ? isRuntimeBrowserCommandReady({
            schemaVersion: 1,
            browser,
          })
        : false,
    });

    const timeout = setTimeout(() => {
      const message = `Request timeout for ${method}`;
      traceTransport('timeout', {
        method,
        requestId,
        protocol,
        port,
      });
      closeSocket();
      finish(() =>
        reject(
          new RuntimeCommandTransportError(message, {
            issueCause: inferRuntimeIssueCause(message, browser),
            browser,
          }),
        ),
      );
    }, timeoutMs);

    ws.on('open', () => {
      const payload = JSON.stringify({
        id: requestId,
        method,
        params: params ?? {},
        ...(target ? { target } : {}),
      });
      traceTransport('open', {
        method,
        requestId,
        protocol,
        port,
      });
      ws.send(payload, (error) => {
        if (!error) {
          traceTransport('send', {
            method,
            requestId,
            protocol,
            bytes: Buffer.byteLength(payload),
          });
          return;
        }
        traceTransport('send_error', {
          method,
          requestId,
          protocol,
          message: error.message,
        });
        closeSocket();
        finish(() =>
          reject(
            new RuntimeCommandTransportError(error.message, {
              issueCause: inferRuntimeIssueCause(error.message, browser),
              browser,
            }),
          ),
        );
      });
    });

    ws.on('message', (data: WebSocket.RawData) => {
      traceTransport('message', {
        method,
        requestId,
        protocol,
        bytes: getRawDataSize(data),
      });
      try {
        const response = JSON.parse(data.toString()) as RuntimeCommandResponse;
        if (response.id !== requestId) {
          traceTransport('message_ignored', {
            method,
            requestId,
            protocol,
            responseId: response.id ?? null,
          });
          return;
        }

        closeSocket();
        if (response.error) {
          const message = response.error.message ?? 'Unknown runtime error';
          const explicitCause = response.error.cause;
          traceTransport('runtime_error', {
            method,
            requestId,
            protocol,
            message,
            cause: explicitCause ?? null,
          });
          finish(() =>
            reject(
              new RuntimeCommandExecutionError(message, {
                issueCause: inferRuntimeIssueCause(
                  message,
                  browser,
                  explicitCause,
                ),
                browser,
              }),
            ),
          );
          return;
        }
        traceTransport('response', {
          method,
          requestId,
          protocol,
        });
        finish(() => resolve(response));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        traceTransport('message_parse_error', {
          method,
          requestId,
          protocol,
          message,
        });
        closeSocket();
        finish(() =>
          reject(
            new RuntimeCommandTransportError(message, {
              issueCause: inferRuntimeIssueCause(message, browser),
              browser,
            }),
          ),
        );
      }
    });

    ws.on('error', (error: Error) => {
      traceTransport('error', {
        method,
        requestId,
        protocol,
        message: error.message,
      });
      closeSocket();
      finish(() =>
        reject(
          new RuntimeCommandTransportError(error.message, {
            issueCause: inferRuntimeIssueCause(error.message, browser),
            browser,
          }),
        ),
      );
    });

    ws.on('close', (code, reasonBuffer) => {
      const reason =
        typeof reasonBuffer === 'string'
          ? reasonBuffer
          : reasonBuffer.toString('utf8');
      traceTransport('close', {
        method,
        requestId,
        protocol,
        code,
        reason,
        settled,
      });
      if (settled) {
        return;
      }
      const message =
        reason && reason.length > 0
          ? `Connection closed before response for ${method}: ${reason}`
          : `Connection closed before response for ${method} (code ${code})`;
      finish(() =>
        reject(
          new RuntimeCommandTransportError(message, {
            issueCause: inferRuntimeIssueCause(message, browser),
            browser,
          }),
        ),
      );
    });
  });
}

export async function sendRuntimeCommand({
  port,
  method,
  params,
  target,
  timeoutMs = 30000,
  runtimeSession,
}: SendRuntimeCommandOptions): Promise<RuntimeCommandResponse> {
  const browser = runtimeSession?.browser;
  const protocolOrder = getProtocolOrder(runtimeSession);
  const firstProtocol = protocolOrder[0];
  const fallbackProtocol = protocolOrder[1];
  const firstAttemptTimeout =
    fallbackProtocol && firstProtocol === 'wss'
      ? Math.min(timeoutMs, FAST_WSS_FALLBACK_TIMEOUT_MS)
      : timeoutMs;
  const startedAt = Date.now();

  try {
    return await trySendRuntimeCommand(
      firstProtocol,
      port,
      method,
      params,
      target,
      firstAttemptTimeout,
      browser,
    );
  } catch (error) {
    if (!(error instanceof RuntimeCommandTransportError)) {
      throw error;
    }
    if (!fallbackProtocol || fallbackProtocol === firstProtocol) {
      throw error;
    }
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(timeoutMs - elapsedMs, 1);
    traceTransport('fallback_protocol', {
      method,
      from: firstProtocol,
      to: fallbackProtocol,
      elapsedMs,
      remainingMs,
      browserStatus: browser?.status,
      bridgeConnected: browser?.connected ?? false,
      commandReady: browser
        ? isRuntimeBrowserCommandReady({
            schemaVersion: 1,
            browser,
          })
        : false,
    });
    return trySendRuntimeCommand(
      fallbackProtocol,
      port,
      method,
      params,
      target,
      remainingMs,
      browser,
    );
  }
}
