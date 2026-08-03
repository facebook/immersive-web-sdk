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
  /** Grace period for a role-only target to reconnect during page navigation. */
  targetReconnectGraceMs?: number;
}

interface PendingRelayRequest {
  sourceWs: RelayWebSocket;
  targetClients?: Set<RelayWebSocket>;
  timestamp: number;
  requestData?: string;
  reconnectTarget?: RelayPageTarget;
  reconnectTimer?: ReturnType<typeof setTimeout>;
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
  const targetReconnectGraceMs = options?.targetReconnectGraceMs ?? 3_000;

  // Track pending request IDs for first-response-wins deduplication.
  const pendingRelayRequests = new Map<string, PendingRelayRequest>();
  const browserClients = new Map<RelayWebSocket, RelayClientMetadata>();
  const latestGenerationByPageId = new Map<string, number>();

  function isLatestBrowserClient(ws: RelayWebSocket): boolean {
    const metadata = browserClients.get(ws);
    return (
      metadata != null &&
      metadata.tabGeneration === latestGenerationByPageId.get(metadata.pageId)
    );
  }

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
          const reconnectTarget = reconnectableTarget(parsed.target);
          if (reconnectTarget != null) {
            const entry: PendingRelayRequest = {
              reconnectTarget,
              requestData: data,
              sourceWs: senderWs,
              targetClients: new Set<RelayWebSocket>(),
              timestamp: Date.now(),
            };
            pendingRelayRequests.set(parsed.id, entry);
            entry.reconnectTimer = setTimeout(() => {
              if (pendingRelayRequests.get(parsed!.id!) !== entry) {
                return;
              }
              pendingRelayRequests.delete(parsed!.id!);
              sendNoTargetError(senderWs, parsed!.id!, parsed!);
            }, targetReconnectGraceMs);
            return;
          }
          sendNoTargetError(senderWs, parsed.id, parsed);
          return;
        }

        // Track this request for deduplication
        pendingRelayRequests.set(parsed.id, {
          ...(reconnectableTarget(parsed.target) == null
            ? {}
            : {
                reconnectTarget: parsed.target,
                requestData: data,
              }),
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
            browserClients.has(senderWs) &&
            !isLatestBrowserClient(senderWs)
          ) {
            if (verbose) {
              console.log(
                `[MCP-IWER] Response for ${parsed.id} dropped from stale tab generation`,
              );
            }
            return;
          }
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
          if (pending.reconnectTimer != null) {
            clearTimeout(pending.reconnectTimer);
          }
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
    latestGenerationByPageId.set(
      metadata.pageId,
      Math.max(
        latestGenerationByPageId.get(metadata.pageId) ?? 0,
        metadata.tabGeneration,
      ),
    );
    for (const pending of pendingRelayRequests.values()) {
      if (
        pending.reconnectTarget == null ||
        pending.requestData == null ||
        pending.targetClients == null ||
        pending.targetClients.size !== 0 ||
        !isLatestBrowserClient(ws) ||
        !matchesTarget(metadata, pending.reconnectTarget)
      ) {
        continue;
      }
      if (pending.reconnectTimer != null) {
        clearTimeout(pending.reconnectTimer);
        pending.reconnectTimer = undefined;
      }
      pending.targetClients.add(ws);
      ws.send(pending.requestData);
    }
  }

  function unregisterClient(ws: RelayWebSocket): void {
    const removedMetadata = browserClients.get(ws);
    browserClients.delete(ws);
    if (removedMetadata != null) {
      const remainingGenerations = [...browserClients.values()]
        .filter((metadata) => metadata.pageId === removedMetadata.pageId)
        .map((metadata) => metadata.tabGeneration);
      if (remainingGenerations.length === 0) {
        latestGenerationByPageId.delete(removedMetadata.pageId);
      }
    }
    for (const [id, pending] of pendingRelayRequests) {
      if (pending.sourceWs === ws) {
        if (pending.reconnectTimer != null) {
          clearTimeout(pending.reconnectTimer);
        }
        pendingRelayRequests.delete(id);
        continue;
      }

      if (pending.targetClients?.delete(ws) === true) {
        if (pending.targetClients.size === 0) {
          if (pending.reconnectTarget != null && pending.requestData != null) {
            pending.timestamp = Date.now();
            pending.reconnectTimer = setTimeout(() => {
              if (pendingRelayRequests.get(id) !== pending) {
                return;
              }
              pendingRelayRequests.delete(id);
              sendTargetDisconnectedError(pending.sourceWs, id);
            }, targetReconnectGraceMs);
          } else {
            pendingRelayRequests.delete(id);
            sendTargetDisconnectedError(pending.sourceWs, id);
          }
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
        if (entry.reconnectTimer != null) {
          clearTimeout(entry.reconnectTimer);
        }
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
      isLatestBrowserClient(client),
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
    const stalePrecondition =
      parsed.target?.pageId != null || parsed.target?.tabGeneration != null;
    sourceWs.send(
      JSON.stringify({
        id: requestId,
        error: {
          code: -32004,
          message: stalePrecondition
            ? `Browser tab precondition failed; no current page matches ${JSON.stringify(parsed.target ?? {})}. Re-query state and retry with its _tab value.`
            : `No connected browser page matches target ${JSON.stringify(parsed.target ?? {})}`,
          ...(stalePrecondition
            ? {
                data: {
                  code: 'stale_browser_tab',
                  expectedTab: parsed.target,
                },
              }
            : {}),
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

function reconnectableTarget(
  target: RelayPageTarget | undefined,
): RelayPageTarget | undefined {
  if (
    target?.role == null ||
    target.pageId != null ||
    target.tabGeneration != null ||
    target.sceneSessionId != null
  ) {
    return undefined;
  }
  return { role: target.role };
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
