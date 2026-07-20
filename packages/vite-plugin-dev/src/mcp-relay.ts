/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Minimal WebSocket interface used by the relay.
 * Compatible with both the `ws` library and the browser WebSocket API.
 */
export interface RelayWebSocket {
  readyState: number;
  send(data: string): void;
}

/** WebSocket OPEN readyState constant */
const WS_OPEN = 1;

export type RelayPageRole = 'app' | 'editor' | 'preview';

export interface RelayPageTarget {
  role?: RelayPageRole;
  pageId?: string;
  tabGeneration?: number;
  sceneSessionId?: string;
}

export interface RelayClientMetadata {
  pageId: string;
  role: RelayPageRole;
  tabGeneration: number;
  sceneSessionId?: string;
}

export interface RelayOptions {
  verbose?: boolean;
}

export interface RelayHandler {
  /**
   * Handle an incoming message from a connected client.
   * Routes requests to all other clients and deduplicates responses
   * using first-response-wins semantics.
   */
  onMessage(
    senderWs: RelayWebSocket,
    data: string,
    clients: Set<RelayWebSocket>,
  ): void;

  /** Register or update metadata for a browser/runtime bridge client. */
  registerBrowserClient(
    ws: RelayWebSocket,
    metadata: RelayClientMetadata,
  ): void;

  /** Remove a client and any associated metadata. */
  unregisterClient(ws: RelayWebSocket): void;

  /** Number of pending (unresolved) relay requests. */
  pendingCount(): number;

  /** Clean up stale pending entries older than `maxAgeMs`. */
  cleanStale(maxAgeMs: number): void;
}

/**
 * Create a relay handler that implements first-response-wins message routing.
 *
 * When multiple browser tabs are connected, a request from the MCP server is
 * broadcast to all tabs. Each tab processes it and responds. The relay
 * forwards only the FIRST response for each request ID and silently drops
 * duplicates.
 */
export function createRelayHandler(options?: RelayOptions): RelayHandler {
  const verbose = options?.verbose ?? false;

  // Track pending request IDs for first-response-wins deduplication.
  const pendingRelayRequests = new Map<
    string,
    {
      sourceWs: RelayWebSocket;
      targetClients?: Set<RelayWebSocket>;
      timestamp: number;
    }
  >();
  const browserClients = new Map<RelayWebSocket, RelayClientMetadata>();

  function onMessage(
    senderWs: RelayWebSocket,
    data: string,
    clients: Set<RelayWebSocket>,
  ): void {
    let parsed: {
      id?: string;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: unknown;
      target?: RelayPageTarget;
    } | null = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON — broadcast as-is for backward compatibility
    }

    if (parsed && typeof parsed.id === 'string') {
      const isRequest = typeof parsed.method === 'string';
      const isResponse =
        !parsed.method &&
        (parsed.result !== undefined || parsed.error !== undefined);

      if (isRequest) {
        const targetClients = resolveRequestTargets(senderWs, parsed, clients);
        if (targetClients.length === 0) {
          sendNoTargetError(senderWs, parsed.id, parsed);
          return;
        }

        // Track this request for deduplication
        pendingRelayRequests.set(parsed.id, {
          targetClients: new Set(targetClients),
          timestamp: Date.now(),
          sourceWs: senderWs,
        });

        targetClients.forEach((client) => {
          client.send(data);
        });
        return;
      }

      if (isResponse) {
        const pending = pendingRelayRequests.get(parsed.id);
        if (pending) {
          if (
            pending.targetClients != null &&
            !pending.targetClients.has(senderWs)
          ) {
            if (verbose) {
              console.log(
                `[MCP-IWER] Response for ${parsed.id} dropped from non-target client`,
              );
            }
            return;
          }
          // First response wins — forward to the original requester
          pendingRelayRequests.delete(parsed.id);
          if (pending.sourceWs.readyState === WS_OPEN) {
            pending.sourceWs.send(data);
          }
          if (verbose) {
            console.log(
              `[MCP-IWER] Response for ${parsed.id} forwarded (first-wins)`,
            );
          }
        } else if (verbose) {
          console.log(`[MCP-IWER] Duplicate response for ${parsed.id} dropped`);
        }
        return;
      }
    }

    // Unknown message shape — broadcast for backward compatibility
    clients.forEach((client) => {
      if (client !== senderWs && client.readyState === WS_OPEN) {
        client.send(data);
      }
    });
  }

  function registerBrowserClient(
    ws: RelayWebSocket,
    metadata: RelayClientMetadata,
  ): void {
    browserClients.set(ws, metadata);
  }

  function unregisterClient(ws: RelayWebSocket): void {
    browserClients.delete(ws);
    for (const [id, pending] of pendingRelayRequests) {
      if (pending.sourceWs === ws) {
        pendingRelayRequests.delete(id);
        continue;
      }

      if (pending.targetClients?.delete(ws) === true) {
        if (pending.targetClients.size === 0) {
          pendingRelayRequests.delete(id);
          sendTargetDisconnectedError(pending.sourceWs, id);
        }
      }
    }
  }

  function pendingCount(): number {
    return pendingRelayRequests.size;
  }

  function cleanStale(maxAgeMs: number): void {
    const now = Date.now();
    for (const [id, entry] of pendingRelayRequests) {
      if (now - entry.timestamp > maxAgeMs) {
        pendingRelayRequests.delete(id);
      }
    }
  }

  function resolveRequestTargets(
    senderWs: RelayWebSocket,
    parsed: {
      method?: string;
      params?: unknown;
      target?: RelayPageTarget;
    },
    clients: Set<RelayWebSocket>,
  ): RelayWebSocket[] {
    const candidates = Array.from(clients).filter(
      (client) => client !== senderWs && client.readyState === WS_OPEN,
    );
    const browserCandidates = candidates.filter((client) =>
      browserClients.has(client),
    );
    const target = getRequestTarget(parsed);

    if (target != null) {
      return browserCandidates.filter((client) =>
        matchesTarget(browserClients.get(client), target),
      );
    }

    const appClients = browserCandidates.filter(
      (client) => browserClients.get(client)?.role === 'app',
    );
    if (appClients.length > 0) {
      return appClients;
    }

    return browserCandidates.length > 0 ? browserCandidates : candidates;
  }

  function getRequestTarget(parsed: {
    target?: RelayPageTarget;
    params?: unknown;
  }): RelayPageTarget | undefined {
    if (isRelayPageTarget(parsed.target)) {
      return parsed.target;
    }

    return undefined;
  }

  function matchesTarget(
    metadata: RelayClientMetadata | undefined,
    target: RelayPageTarget,
  ): boolean {
    if (metadata == null) {
      return false;
    }
    if (target.role != null && metadata.role !== target.role) {
      return false;
    }
    if (target.pageId != null && metadata.pageId !== target.pageId) {
      return false;
    }
    if (
      target.tabGeneration != null &&
      metadata.tabGeneration !== target.tabGeneration
    ) {
      return false;
    }
    if (
      target.sceneSessionId != null &&
      metadata.sceneSessionId !== target.sceneSessionId
    ) {
      return false;
    }
    return true;
  }

  function sendNoTargetError(
    sourceWs: RelayWebSocket,
    requestId: string,
    parsed: { target?: RelayPageTarget },
  ): void {
    if (sourceWs.readyState !== WS_OPEN) {
      return;
    }
    sourceWs.send(
      JSON.stringify({
        id: requestId,
        error: {
          code: -32004,
          message: `No connected browser page matches target ${JSON.stringify(
            parsed.target ?? {},
          )}`,
        },
      }),
    );
  }

  function sendTargetDisconnectedError(
    sourceWs: RelayWebSocket,
    requestId: string,
  ): void {
    if (sourceWs.readyState !== WS_OPEN) {
      return;
    }
    sourceWs.send(
      JSON.stringify({
        id: requestId,
        error: {
          code: -32004,
          message:
            'All target browser pages disconnected before responding to the request',
        },
      }),
    );
  }

  return {
    cleanStale,
    onMessage,
    pendingCount,
    registerBrowserClient,
    unregisterClient,
  };
}

function isRelayPageTarget(value: unknown): value is RelayPageTarget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const target = value as RelayPageTarget;
  return (
    target.role === 'app' ||
    target.role === 'editor' ||
    target.role === 'preview' ||
    typeof target.pageId === 'string' ||
    typeof target.tabGeneration === 'number' ||
    typeof target.sceneSessionId === 'string'
  );
}
