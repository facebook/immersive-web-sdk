/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import * as path from 'path';
import {
  INTERNAL_BROWSER_PROBE_METHOD,
  type RuntimeBrowserProbeResult,
  type RuntimeBrowserState,
  type RuntimeIssueCause,
  type RuntimeIssueInfo,
} from '@iwsdk/cli/contract';
import {
  CURRENT_SCENE_VERSION,
  parseSceneDocument,
  serializeSceneDocument,
  type SceneDocument,
} from '@iwsdk/scene-composition';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { createUnavailableBrowserRpcError } from './browser-rpc-errors.js';
import {
  createEditorRuntimeModuleSource,
  createEditorShellHtml,
  getCoreModuleImport,
  getEditorSessionModuleImport,
} from './editor/editor-runtime-source.js';
import { EDITOR_SHELL_CSS } from './editor/editor-shell-styles.js';
import {
  launchManagedBrowser,
  type ManagedBrowser,
} from './headless-browser.js';
import { reportSessionStart, reportSessionEnd } from './hzdb-telemetry.js';
import { buildInjectionBundle } from './injection-bundler.js';
import { createRelayHandler } from './mcp-relay.js';
import {
  registerRuntimeSession,
  setRuntimeSessionBrowserState,
  unregisterRuntimeSession,
} from './runtime-session.js';
import type {
  DevPluginOptions,
  ProcessedDevOptions,
  InjectionBundleResult,
  AiMode,
} from './types.js';

// Export types for users
export type {
  DevPluginOptions,
  AiOptions,
  AiMode,
  EmulatorOptions,
  WorkspaceOptions,
  ProcessedDevOptions,
  IWERPluginOptions,
  SEMOptions,
  AiTool,
} from './types.js';

/**
 * Derive internal headless / devUI / viewport settings from the AI mode.
 */
const MODE_SETTINGS: Record<
  AiMode,
  { headless: boolean; devUI: boolean; fixedViewport: boolean }
> = {
  agent: { headless: true, devUI: false, fixedViewport: true },
  oversight: { headless: false, devUI: false, fixedViewport: false },
  collaborate: { headless: false, devUI: true, fixedViewport: false },
};

const VIRTUAL_ID = '/@iwer-injection-runtime';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;
const EDITOR_RUNTIME_ID = '/@iwsdk-editor-runtime';
const RESOLVED_EDITOR_RUNTIME_ID = '\0' + EDITOR_RUNTIME_ID;
const EDITOR_STYLESHEET_ID = '/@iwsdk-editor-styles.css';
const RESOLVED_EDITOR_STYLESHEET_ID = '\0' + EDITOR_STYLESHEET_ID;
const EDITOR_ROUTE = '/__iwsdk/editor';
const WORKSPACE_ROUTE = '/__iwsdk/workspace';
const WORKSPACE_SCENES_ROUTE = `${WORKSPACE_ROUTE}/scenes`;
const MANAGED_WORKSPACE_HEADER = 'x-iwsdk-managed-workspace';
const MANAGED_WORKSPACE_QUERY = '__iwsdkManagedWorkspace';
const SCENE_ROOT_RELATIVE_PATH = path.join('public', 'scenes');
const SCENE_FILE_SUFFIX = '.iwsdk.scene.json';

/**
 * Process and normalize plugin options with defaults
 */
function processOptions(options: DevPluginOptions = {}): ProcessedDevOptions {
  const emulator = options.emulator ?? {};
  const processed: ProcessedDevOptions = {
    device: emulator.device || 'metaQuest3',
    injectOnBuild: emulator.injectOnBuild || false,
    activation: emulator.activation || 'localhost',
    verbose: options.verbose || false,
    userAgentException:
      emulator.userAgentException || new RegExp('OculusBrowser'),
    iwer: emulator.iwer ?? true,
  };

  // Process SEM options from emulator.environment
  if (emulator.environment) {
    processed.sem = {
      defaultScene: emulator.environment,
    };
  }

  const normalizeScreenshotSize = (input?: {
    width?: number;
    height?: number;
  }) => {
    const width = input?.width;
    const height = input?.height;
    return {
      width: width ?? height ?? 800,
      height: height ?? width ?? 800,
    };
  };

  // AI agent tooling drives the page through the injected IWER runtime/MCP
  // bridge, so it cannot work when IWER injection is disabled (`iwer: false`).
  // Warn and skip the AI path rather than launching a managed browser + MCP
  // server that wait for a bridge that will never connect.
  if (options.ai && processed.iwer === false) {
    console.warn(
      '[IWSDK Dev] `ai` was requested but `emulator.iwer` is false. AI agent ' +
        'tooling requires the injected IWER runtime bridge, so it has been ' +
        'disabled. Set `emulator.iwer: true` (the default) to use AI features.',
    );
  }

  // AI is opt-in: omit `ai` to disable AI mode. Workspace may still be enabled
  // separately for manual editor workflows.
  if (options.ai && processed.iwer !== false) {
    const mode = options.ai.mode ?? 'agent';
    const settings = MODE_SETTINGS[mode];
    if (!settings) {
      const valid = Object.keys(MODE_SETTINGS).join(', ');
      throw new Error(
        `[IWSDK] Invalid ai.mode "${mode}". Valid modes: ${valid}`,
      );
    }
    const screenshotSize = normalizeScreenshotSize(options.ai.screenshotSize);

    processed.ai = {
      mode,
      headless: settings.headless,
      devUI: settings.devUI,
      viewport: settings.fixedViewport ? screenshotSize : null,
      screenshotSize,
    };
  }

  if (options.ai || options.workspace?.enabled) {
    const screenshotSize =
      processed.ai?.screenshotSize ??
      normalizeScreenshotSize(options.workspace?.screenshotSize);
    const headless =
      processed.ai?.headless ?? options.workspace?.headless ?? false;
    processed.workspace = {
      enabled: true,
      open: options.workspace?.open ?? true,
      headless,
      devUI: processed.ai?.devUI ?? true,
      viewport: processed.ai ? processed.ai.viewport : null,
      screenshotSize,
    };
  }

  return processed;
}

/**
 * Vite plugin for IWSDK development — XR emulation, AI agent tooling, and Playwright browser
 */
export function iwsdkDev(options: DevPluginOptions = {}): Plugin {
  const pluginOptions = processOptions(options);
  let injectionBundle: InjectionBundleResult | null = null;
  let config: ResolvedConfig;
  let mcpWss: WebSocketServer | null = null;
  let mcpClients: Set<WebSocket> | null = null;
  let managedBrowser: ManagedBrowser | null = null;
  const managedWorkspaceToken =
    process.env.NODE_ENV === 'test' &&
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN
      ? process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN
      : randomUUID();

  return {
    name: 'iwsdk-dev',

    config(userConfig) {
      // In oversight/collaborate mode the Playwright window IS the visible
      // browser, so suppress Vite's auto-open to avoid a duplicate tab.
      if (
        pluginOptions.workspace &&
        pluginOptions.workspace.open &&
        !pluginOptions.workspace.headless
      ) {
        if (userConfig.server) {
          userConfig.server.open = false;
        } else {
          userConfig.server = { open: false };
        }
      }
    },

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (pluginOptions.verbose) {
        console.log('🔧 IWSDK Dev Configuration:');
        console.log(`  - Device: ${pluginOptions.device}`);
        console.log(
          `  - SEM: ${pluginOptions.sem ? 'enabled (' + pluginOptions.sem.defaultScene + ')' : 'disabled'}`,
        );
        console.log(
          `  - AI: ${pluginOptions.ai ? `enabled (${pluginOptions.ai.mode} mode)` : 'disabled'}`,
        );
        console.log(
          `  - Workspace: ${pluginOptions.workspace ? `enabled (${pluginOptions.workspace.headless ? 'headless' : 'headed'})` : 'disabled'}`,
        );
        console.log(`  - Activation: ${pluginOptions.activation}`);
        if (pluginOptions.userAgentException) {
          console.log('  - UA exception: enabled');
        }
        console.log(`  - Inject on build: ${pluginOptions.injectOnBuild}`);
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const pathname = getRequestPathname(request.url);
        const isManagedWorkspaceRequest = hasManagedWorkspaceAccess(
          request,
          managedWorkspaceToken,
        );

        if (pathname === `${EDITOR_ROUTE}/document`) {
          if (!isManagedWorkspaceRequest) {
            sendJsonError(
              response,
              403,
              'The IWSDK scene editor document endpoint is only available in the managed workspace browser.',
            );
            return;
          }
          handleEditorDocumentRequest(request, response, config.root);
          return;
        }

        if (pathname === EDITOR_STYLESHEET_ID) {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/css; charset=utf-8');
          response.end(EDITOR_SHELL_CSS);
          return;
        }

        if (pathname === WORKSPACE_SCENES_ROUTE) {
          if (!isManagedWorkspaceRequest) {
            sendJsonError(
              response,
              403,
              'IWSDK scene file management is only available in the managed workspace browser.',
            );
            return;
          }
          handleWorkspaceScenesRequest(request, response, config.root);
          return;
        }

        if (pathname === WORKSPACE_ROUTE) {
          if (!isManagedWorkspaceRequest) {
            redirectToRuntimeApp(response);
            return;
          }

          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(
            createEditorShellHtml(
              VIRTUAL_ID,
              EDITOR_RUNTIME_ID,
              EDITOR_STYLESHEET_ID,
              `${EDITOR_ROUTE}/document${getRequestSearch(request.url)}`,
              {
                sceneFilesUrl: WORKSPACE_SCENES_ROUTE,
                workspaceRoute: WORKSPACE_ROUTE,
              },
            ),
          );
          return;
        }

        if (pathname === EDITOR_ROUTE) {
          if (!isManagedWorkspaceRequest) {
            redirectToRuntimeApp(response);
            return;
          }

          redirectToWorkspace(response, request.url);
          return;
        }

        next();
      });

      if (!pluginOptions.workspace) {
        return;
      }

      // Closure-scoped state for browser auto-recovery
      let browserLaunchPromise: Promise<void> | null = null;
      let browserCommandReadyPromise: Promise<{
        browser: ManagedBrowser | null;
        relaunched: boolean;
        bridgeConnected: boolean;
        waitedForBridgeMs: number;
      }> | null = null;
      let browserRuntimeClients: Set<WebSocket> | null = null;
      let serverShuttingDown = false;
      let browserUrl = '';
      let consecutiveFailures = 0;
      let currentBrowserState: RuntimeBrowserState | null = null;
      const MAX_LAUNCH_FAILURES = 3;
      const BRIDGE_READY_TIMEOUT_MS = 5000;
      const traceEnabled = process.env.IWSDK_RUNTIME_TRACE === '1';
      const wsConnectionIds = new WeakMap<WebSocket, string>();
      const wsConnectionKinds = new WeakMap<WebSocket, 'command' | 'bridge'>();

      const traceRuntime = (
        event: string,
        details: Record<string, unknown> = {},
      ): void => {
        if (!traceEnabled) {
          return;
        }
        console.error(
          `[IWSDK-RUNTIME-TRACE][vite] ${event} ${JSON.stringify(details)}`,
        );
      };

      const getConnectionId = (ws: WebSocket): string =>
        wsConnectionIds.get(ws) ?? 'unknown';

      const getConnectionKind = (ws: WebSocket): 'command' | 'bridge' =>
        wsConnectionKinds.get(ws) ?? 'command';

      const markConnectionKind = (
        ws: WebSocket,
        kind: 'command' | 'bridge',
      ): void => {
        wsConnectionKinds.set(ws, kind);
      };

      const createBrowserIssue = (
        cause: RuntimeIssueCause,
        message: string,
      ): RuntimeIssueInfo => ({
        cause,
        message,
        at: new Date().toISOString(),
      });

      const classifyBrowserLaunchFailure = (
        message: string,
      ): RuntimeIssueCause =>
        /permission|not permitted|denied|sandbox|eacces|eperm/i.test(message)
          ? 'permission_denied'
          : 'browser_launch_failed';

      const createBrowserState = (
        status: RuntimeBrowserState['status'],
        options: {
          connected?: boolean;
          commandReady?: boolean;
          connectedClientCount?: number;
          lastError?: RuntimeIssueInfo;
          lastBridgeConnectedAt?: string;
          lastCommandReadyAt?: string;
        } = {},
        previous: RuntimeBrowserState | null = currentBrowserState,
      ): RuntimeBrowserState => {
        const connectedClientCount =
          options.connectedClientCount ?? browserRuntimeClients?.size ?? 0;
        const connected = options.connected ?? status === 'connected';
        const commandReady = options.commandReady ?? false;

        return {
          status,
          connected,
          commandReady,
          connectedClientCount,
          lastTransitionAt: new Date().toISOString(),
          ...((options.lastBridgeConnectedAt ?? previous?.lastBridgeConnectedAt)
            ? {
                lastBridgeConnectedAt:
                  options.lastBridgeConnectedAt ??
                  previous?.lastBridgeConnectedAt,
              }
            : {}),
          ...((options.lastCommandReadyAt ?? previous?.lastCommandReadyAt)
            ? {
                lastCommandReadyAt:
                  options.lastCommandReadyAt ?? previous?.lastCommandReadyAt,
              }
            : {}),
          ...(options.lastError ? { lastError: options.lastError } : {}),
        };
      };

      // An unopened workspace has no managed browser lifecycle yet. Omitting
      // browser state lets `iwsdk dev up` report the registered runtime while
      // preserving lazy launch on the first browser command.
      currentBrowserState = pluginOptions.workspace.open
        ? createBrowserState('launching', { connected: false }, null)
        : null;

      const publishBrowserState = (browser: RuntimeBrowserState): void => {
        currentBrowserState = browser;
        traceRuntime('browser_state', {
          status: browser.status,
          bridgeConnected: browser.connected,
          commandReady: browser.commandReady,
          connectedClientCount: browser.connectedClientCount,
          lastError: browser.lastError ?? null,
        });
        void setRuntimeSessionBrowserState(config.root, browser).catch(
          (error) => {
            console.error('[IWSDK Dev] Failed to update browser state:', error);
          },
        );
      };

      /**
       * Launch (or re-launch) the Playwright-managed browser.
       * Guards against concurrent launches via `browserLaunchPromise`.
       * Stops retrying after MAX_LAUNCH_FAILURES consecutive failures.
       */
      const launchBrowser = (): Promise<void> => {
        if (browserLaunchPromise) {
          return browserLaunchPromise;
        }

        browserLaunchPromise = (async () => {
          publishBrowserState(createBrowserState('launching'));
          traceRuntime('browser_launch_start', {
            browserUrl,
            headless: pluginOptions.workspace!.headless,
          });
          try {
            const browser = await launchManagedBrowser(
              browserUrl,
              pluginOptions.workspace!.headless,
              pluginOptions.verbose,
              pluginOptions.workspace!.viewport,
              pluginOptions.workspace!.screenshotSize,
              traceEnabled,
              {
                headerName: MANAGED_WORKSPACE_HEADER,
                token: managedWorkspaceToken,
              },
              pluginOptions.ai ? 'iwer' : 'workspace',
            );
            managedBrowser = browser;
            consecutiveFailures = 0;
            traceRuntime('browser_launch_success', {
              browserRuntimeClients: browserRuntimeClients?.size ?? 0,
            });
            publishBrowserState(
              createBrowserState(
                (browserRuntimeClients?.size ?? 0) > 0
                  ? 'connected'
                  : 'waiting_for_connection',
                {
                  connected: (browserRuntimeClients?.size ?? 0) > 0,
                  commandReady: false,
                  lastBridgeConnectedAt:
                    (browserRuntimeClients?.size ?? 0) > 0
                      ? new Date().toISOString()
                      : undefined,
                },
              ),
            );

            // On unexpected close, mark as null. The browser will be
            // relaunched lazily on the next MCP request via ensureBrowser().
            browser.onClose(() => {
              managedBrowser = null;
              browserCommandReadyPromise = null;
              traceRuntime('browser_closed', {
                serverShuttingDown,
              });
              publishBrowserState(
                createBrowserState('disconnected', {
                  connected: false,
                  commandReady: false,
                  lastError: createBrowserIssue(
                    'connection_lost',
                    'Managed browser closed unexpectedly. It will relaunch on the next MCP request.',
                  ),
                }),
              );
              if (!serverShuttingDown) {
                console.log(
                  '🔄 IWSDK: Browser closed. Will relaunch on next MCP request.',
                );
              }
            });
          } catch (error) {
            consecutiveFailures++;
            const message =
              error instanceof Error ? error.message : String(error);
            traceRuntime('browser_launch_failed', {
              consecutiveFailures,
              message,
            });
            publishBrowserState(
              createBrowserState('launch_failed', {
                connected: false,
                commandReady: false,
                lastError: createBrowserIssue(
                  classifyBrowserLaunchFailure(message),
                  message,
                ),
              }),
            );
            console.error('❌ IWSDK: Failed to launch browser:', error);
            if (consecutiveFailures >= MAX_LAUNCH_FAILURES) {
              console.error(
                `❌ IWSDK: ${MAX_LAUNCH_FAILURES} consecutive launch failures, giving up. ` +
                  'Restart the dev server to retry.',
              );
            }
          } finally {
            browserLaunchPromise = null;
          }
        })();

        return browserLaunchPromise;
      };

      /**
       * Return the current managed browser, re-launching if it was closed.
       * `relaunched` is true when the browser was just freshly launched
       * (meaning the previous page state was lost).
       */
      const ensureBrowser = async (): Promise<{
        browser: ManagedBrowser | null;
        relaunched: boolean;
      }> => {
        const current = managedBrowser;
        if (current && !current.isClosed()) {
          traceRuntime('ensure_browser_reuse', {
            browserRuntimeClients: browserRuntimeClients?.size ?? 0,
          });
          return { browser: current, relaunched: false };
        }
        managedBrowser = null;
        if (consecutiveFailures >= MAX_LAUNCH_FAILURES) {
          traceRuntime('ensure_browser_aborted', {
            consecutiveFailures,
          });
          return { browser: null, relaunched: false };
        }
        await launchBrowser();
        traceRuntime('ensure_browser_relaunch_result', {
          relaunched: managedBrowser !== null,
          browserRuntimeClients: browserRuntimeClients?.size ?? 0,
        });
        return { browser: managedBrowser, relaunched: managedBrowser !== null };
      };

      const waitForBridgeConnection = async (
        timeoutMs: number,
        reason: string,
      ): Promise<number> => {
        const startedAt = Date.now();
        traceRuntime('bridge_wait_start', {
          reason,
          timeoutMs,
          browserRuntimeClients: browserRuntimeClients?.size ?? 0,
        });
        while (Date.now() - startedAt < timeoutMs) {
          if ((browserRuntimeClients?.size ?? 0) > 0) {
            const waitedForBridgeMs = Date.now() - startedAt;
            traceRuntime('bridge_wait_ready', {
              reason,
              waitedForBridgeMs,
            });
            return waitedForBridgeMs;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const waitedForBridgeMs = Date.now() - startedAt;
        traceRuntime('bridge_wait_timeout', {
          reason,
          waitedForBridgeMs,
        });
        return waitedForBridgeMs;
      };

      const ensureBrowserCommandReady = async (
        reason: string,
      ): Promise<{
        browser: ManagedBrowser | null;
        relaunched: boolean;
        bridgeConnected: boolean;
        waitedForBridgeMs: number;
      }> => {
        if (browserCommandReadyPromise) {
          return browserCommandReadyPromise;
        }

        browserCommandReadyPromise = (async () => {
          const { browser, relaunched } = await ensureBrowser();
          if (!browser) {
            return {
              browser: null,
              relaunched: false,
              bridgeConnected: false,
              waitedForBridgeMs: 0,
            };
          }

          const needsBridgeWait =
            relaunched ||
            !currentBrowserState?.connected ||
            currentBrowserState?.commandReady === false;
          const waitedForBridgeMs = needsBridgeWait
            ? await waitForBridgeConnection(BRIDGE_READY_TIMEOUT_MS, reason)
            : 0;
          const bridgeConnected = (browserRuntimeClients?.size ?? 0) > 0;

          if (bridgeConnected) {
            publishBrowserState(
              createBrowserState('connected', {
                connected: true,
                commandReady: true,
                connectedClientCount: browserRuntimeClients!.size,
                lastBridgeConnectedAt:
                  currentBrowserState?.lastBridgeConnectedAt ??
                  new Date().toISOString(),
                lastCommandReadyAt: new Date().toISOString(),
              }),
            );
          } else {
            publishBrowserState(
              createBrowserState('waiting_for_connection', {
                connected: false,
                commandReady: false,
                connectedClientCount: 0,
                lastError: createBrowserIssue(
                  relaunched ? 'browser_relaunched' : 'browser_not_ready',
                  relaunched
                    ? 'Browser relaunched and is waiting for the runtime bridge to reconnect.'
                    : 'Managed browser bridge has not connected yet.',
                ),
              }),
            );
          }

          traceRuntime('browser_command_ready_result', {
            reason,
            relaunched,
            bridgeConnected,
            waitedForBridgeMs,
          });

          return {
            browser,
            relaunched,
            bridgeConnected,
            waitedForBridgeMs,
          };
        })().finally(() => {
          browserCommandReadyPromise = null;
        });

        return browserCommandReadyPromise;
      };

      // Initialize WebSocket server and client tracking
      mcpClients = new Set();
      browserRuntimeClients = new Set();
      mcpWss = new WebSocketServer({ noServer: true });

      // First-response-wins relay handler (extracted for testability)
      const relay = createRelayHandler({
        verbose: pluginOptions.verbose,
      });

      // Clean up stale entries every 60 seconds
      const relayCleanupInterval = setInterval(() => {
        relay.cleanStale(60000);
      }, 60000);
      relayCleanupInterval.unref();

      const BROWSER_RELAUNCHED_RESULT = {
        status: 'browser_relaunched',
        message:
          'Browser was closed and has been relaunched. ' +
          'The page state has been reset — please retry your request.',
      };

      const sendWsJson = (
        ws: WebSocket,
        payload: Record<string, unknown>,
        context: string,
      ): void => {
        if (ws.readyState !== WebSocket.OPEN) {
          traceRuntime('ws_send_skipped', {
            connectionId: getConnectionId(ws),
            kind: getConnectionKind(ws),
            context,
            readyState: ws.readyState,
          });
          return;
        }
        traceRuntime('ws_send', {
          connectionId: getConnectionId(ws),
          kind: getConnectionKind(ws),
          context,
          id: payload.id ?? null,
        });
        ws.send(JSON.stringify(payload));
      };

      const sendUnavailableBrowser = (
        ws: WebSocket,
        requestId: string,
        context: string,
      ): void => {
        sendWsJson(
          ws,
          {
            id: requestId,
            error: createUnavailableBrowserRpcError(currentBrowserState),
          },
          context,
        );
      };

      const sendInternalError = (
        ws: WebSocket,
        requestId: string,
        error: unknown,
        context: string,
      ): void => {
        sendWsJson(
          ws,
          {
            id: requestId,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : String(error),
            },
          },
          context,
        );
      };

      const createBrowserProbeResult = (
        waitedForBridgeMs: number,
      ): RuntimeBrowserProbeResult => ({
        bridgeConnected: Boolean(currentBrowserState?.connected),
        commandReady: Boolean(currentBrowserState?.commandReady),
        waitedForBridgeMs,
        browser:
          currentBrowserState ??
          createBrowserState('launching', {
            connected: false,
            commandReady: false,
          }),
      });

      mcpWss.on('connection', (ws: WebSocket) => {
        const connectionId = randomUUID();
        wsConnectionIds.set(ws, connectionId);
        markConnectionKind(ws, 'command');
        mcpClients!.add(ws);
        traceRuntime('ws_connected', {
          connectionId,
          kind: getConnectionKind(ws),
        });

        if (pluginOptions.verbose) {
          console.log('[IWSDK-MCP] Client connected');
        }

        ws.on('message', async (data: Buffer) => {
          const message = data.toString();
          traceRuntime('ws_message', {
            connectionId,
            kind: getConnectionKind(ws),
            bytes: data.length,
          });
          if (pluginOptions.verbose) {
            console.log(
              '[IWSDK-MCP] Message received:',
              message.substring(0, 100),
            );
          }

          let intercepted = false;
          try {
            const parsed = JSON.parse(message) as {
              id?: string;
              method?: string;
              params?: Record<string, unknown>;
              type?: string;
              pageId?: string;
              pageRole?: string;
              role?: string;
              sceneSessionId?: string;
              tabId?: string;
              tabGeneration?: number;
              target?: { role?: string };
            };

            if (parsed?.type === 'iwsdk_browser_hello') {
              intercepted = true;
              markConnectionKind(ws, 'bridge');
              const pageRole = normalizePageRole(
                parsed.pageRole ?? parsed.role,
              );
              relay.registerBrowserClient(ws, {
                pageId: parsed.pageId ?? parsed.tabId ?? connectionId,
                role: pageRole,
                sceneSessionId: parsed.sceneSessionId,
                tabGeneration: parsed.tabGeneration ?? 1,
              });
              if (!browserRuntimeClients!.has(ws)) {
                browserRuntimeClients!.add(ws);
                publishBrowserState(
                  createBrowserState('connected', {
                    connected: true,
                    commandReady: false,
                    connectedClientCount: browserRuntimeClients!.size,
                    lastBridgeConnectedAt: new Date().toISOString(),
                  }),
                );
              }
              traceRuntime('bridge_hello', {
                connectionId,
                pageId: parsed.pageId ?? parsed.tabId ?? connectionId,
                pageRole,
                sceneSessionId: parsed.sceneSessionId ?? null,
                tabId: parsed.tabId ?? null,
                tabGeneration: parsed.tabGeneration ?? null,
                connectedClientCount: browserRuntimeClients!.size,
              });
              return;
            }

            if (
              parsed.method === INTERNAL_BROWSER_PROBE_METHOD &&
              typeof parsed.id === 'string'
            ) {
              intercepted = true;
              traceRuntime('probe_request', {
                connectionId,
                requestId: parsed.id,
              });
              try {
                const readiness = await ensureBrowserCommandReady(
                  'internal_browser_probe',
                );
                if (!readiness.browser || !readiness.bridgeConnected) {
                  sendUnavailableBrowser(ws, parsed.id, 'probe_unavailable');
                } else {
                  sendWsJson(
                    ws,
                    {
                      id: parsed.id,
                      result: createBrowserProbeResult(
                        readiness.waitedForBridgeMs,
                      ),
                    },
                    'probe_ready',
                  );
                }
              } catch (error) {
                sendInternalError(ws, parsed.id, error, 'probe_error');
              }
              return;
            }

            if (
              parsed.method === 'get_console_logs' &&
              typeof parsed.id === 'string'
            ) {
              intercepted = true;
              try {
                const readiness =
                  await ensureBrowserCommandReady('get_console_logs');
                if (!readiness.browser || !readiness.bridgeConnected) {
                  sendUnavailableBrowser(
                    ws,
                    parsed.id,
                    'console_logs_unavailable',
                  );
                  return;
                }
                if (readiness.relaunched) {
                  const tab = await readiness.browser.getTabMetadata();
                  sendWsJson(
                    ws,
                    {
                      id: parsed.id,
                      result: BROWSER_RELAUNCHED_RESULT,
                      ...(tab.id
                        ? {
                            _tabId: tab.id,
                            _tabGeneration: tab.generation ?? undefined,
                          }
                        : {}),
                    },
                    'console_logs_relaunched',
                  );
                  return;
                }
                const params = parsed.params ?? {};
                if (!params.level) {
                  params.level = ['log', 'info', 'warn', 'error'];
                }
                const tab = await readiness.browser.getTabMetadata();
                sendWsJson(
                  ws,
                  {
                    id: parsed.id,
                    result: readiness.browser.queryLogs(params),
                    ...(tab.id
                      ? {
                          _tabId: tab.id,
                          _tabGeneration: tab.generation ?? undefined,
                        }
                      : {}),
                  },
                  'console_logs_result',
                );
              } catch (error) {
                sendInternalError(ws, parsed.id, error, 'console_logs_error');
              }
              return;
            }

            if (
              parsed.method === 'screenshot' &&
              typeof parsed.id === 'string'
            ) {
              intercepted = true;
              try {
                const readiness = await ensureBrowserCommandReady('screenshot');
                if (!readiness.browser || !readiness.bridgeConnected) {
                  sendUnavailableBrowser(
                    ws,
                    parsed.id,
                    'screenshot_unavailable',
                  );
                  return;
                }
                if (readiness.relaunched) {
                  sendWsJson(
                    ws,
                    {
                      id: parsed.id,
                      result: BROWSER_RELAUNCHED_RESULT,
                    },
                    'screenshot_relaunched',
                  );
                  return;
                }
                const workspaceScreenshotView = getWorkspaceScreenshotView(
                  parsed.params,
                );
                if (workspaceScreenshotView != null) {
                  await readiness.browser.setWorkspaceView(
                    workspaceScreenshotView,
                  );
                }
                const buffer = await readiness.browser.screenshot();
                const base64 = buffer.toString('base64');
                sendWsJson(
                  ws,
                  {
                    id: parsed.id,
                    result: { imageData: base64, mimeType: 'image/png' },
                  },
                  'screenshot_result',
                );
              } catch (error) {
                sendInternalError(ws, parsed.id, error, 'screenshot_error');
              }
              return;
            }
          } catch (error) {
            traceRuntime('ws_message_parse_fallthrough', {
              connectionId,
              kind: getConnectionKind(ws),
              message:
                error instanceof Error ? error.message : 'non_json_message',
            });
          }

          if (!intercepted) {
            relay.onMessage(ws, message, mcpClients!);
          }
        });

        ws.on('close', (code, reasonBuffer) => {
          const kind = getConnectionKind(ws);
          const reason =
            typeof reasonBuffer === 'string'
              ? reasonBuffer
              : reasonBuffer.toString('utf8');
          mcpClients!.delete(ws);
          relay.unregisterClient(ws);
          const removedBridge = browserRuntimeClients!.delete(ws);
          if (removedBridge) {
            browserCommandReadyPromise = null;
            publishBrowserState(
              createBrowserState(
                browserRuntimeClients!.size > 0 ? 'connected' : 'disconnected',
                {
                  connected: browserRuntimeClients!.size > 0,
                  commandReady: false,
                  connectedClientCount: browserRuntimeClients!.size,
                  lastError:
                    browserRuntimeClients!.size > 0
                      ? undefined
                      : createBrowserIssue(
                          'connection_lost',
                          'Managed browser runtime disconnected from the MCP bridge.',
                        ),
                },
              ),
            );
          }
          traceRuntime('ws_closed', {
            connectionId,
            kind,
            code,
            reason,
            removedBridge,
            browserRuntimeClients: browserRuntimeClients!.size,
          });
          if (pluginOptions.verbose) {
            console.log('[IWSDK-MCP] Client disconnected');
          }
        });

        ws.on('error', (error) => {
          traceRuntime('ws_error', {
            connectionId,
            kind: getConnectionKind(ws),
            message: error instanceof Error ? error.message : String(error),
          });
          if (pluginOptions.verbose) {
            console.error('[IWSDK-MCP] WebSocket error:', error);
          }
        });
      });

      // Set up WebSocket endpoint for MCP - handle upgrade requests
      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (request.url !== '/__iwer_mcp') {
          return;
        }

        traceRuntime('ws_upgrade', {
          url: request.url,
          remoteAddress: request.socket.remoteAddress ?? null,
        });
        if (pluginOptions.verbose) {
          console.log('[IWSDK-MCP] WebSocket upgrade request received');
        }

        mcpWss!.handleUpgrade(request, socket, head, (ws) => {
          mcpWss!.emit('connection', ws, request);
        });
      });

      if (pluginOptions.verbose) {
        console.log(
          '🔌 IWSDK-MCP: WebSocket endpoint registered at /__iwer_mcp',
        );
      }

      // Register the project-local runtime session after server start.
      // Waiting for 'listening' lets us record Vite's actual chosen port.

      // Resolve IWSDK version for telemetry attribution
      let iwsdkVersion: string | undefined;
      try {
        const pluginPkgPath = path.join(
          config.root,
          'node_modules',
          '@iwsdk',
          'vite-plugin-dev',
          'package.json',
        );
        const pluginPkg = JSON.parse(readFileSync(pluginPkgPath, 'utf-8'));
        iwsdkVersion = pluginPkg.version;
      } catch {
        // Version detection is best-effort
      }

      // Session tracking for telemetry
      const sessionId = randomUUID();
      const sessionStartTime = Date.now();

      // Wait for server to start listening to get the actual port
      server.httpServer?.on('listening', async () => {
        const address = server.httpServer?.address();
        const actualPort =
          typeof address === 'object' && address
            ? address.port
            : server.config.server.port || 5173;

        const protocol = server.config.server.https ? 'https' : 'http';
        browserUrl = `${protocol}://localhost:${actualPort}${WORKSPACE_ROUTE}`;
        try {
          await registerRuntimeSession({
            sessionId,
            workspaceRoot: config.root,
            pid: process.pid,
            port: actualPort,
            localUrl: server.resolvedUrls?.local?.[0] ?? browserUrl,
            networkUrls: server.resolvedUrls?.network ?? [],
            aiMode: pluginOptions.ai?.mode,
            browser: currentBrowserState ?? undefined,
          });
        } catch (error) {
          console.error(
            '[IWSDK Dev] Failed to register runtime session:',
            error,
          );
        }

        // Report session start to hzdb telemetry (fire-and-forget via npx)
        reportSessionStart(sessionId, {
          iwsdkVersion,
          clientVersion: iwsdkVersion,
          port: actualPort,
        });

        // Launch Playwright-managed browser when requested. If open=false, the
        // MCP/browser tooling can still launch it lazily on first command.
        if (pluginOptions.workspace?.open !== false) {
          launchBrowser();
        }
      });

      // Clean up WebSocket server and browser when Vite server closes.
      server.httpServer?.on('close', () => {
        serverShuttingDown = true;
        void unregisterRuntimeSession(config.root);

        reportSessionEnd(sessionId, {
          durationMs: Date.now() - sessionStartTime,
          reason: 'user_closed',
          clientVersion: iwsdkVersion,
        });

        if (mcpWss) {
          for (const client of mcpClients || []) {
            client.close();
          }
          mcpClients?.clear();
          mcpWss.close();
          mcpWss = null;
        }

        if (managedBrowser) {
          managedBrowser.close().catch(() => {});
          managedBrowser = null;
        }
      });
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
      if (id === EDITOR_RUNTIME_ID) {
        return RESOLVED_EDITOR_RUNTIME_ID;
      }
      if (id === EDITOR_STYLESHEET_ID) {
        return RESOLVED_EDITOR_STYLESHEET_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!injectionBundle) {
          return 'console.warn("[IWSDK Dev] Runtime not available - injection bundle not loaded");';
        }
        return injectionBundle.code;
      }
      if (id === RESOLVED_EDITOR_RUNTIME_ID) {
        return createEditorRuntimeModuleSource(
          getEditorSessionModuleImport(),
          getCoreModuleImport(),
        );
      }
      if (id === RESOLVED_EDITOR_STYLESHEET_ID) {
        return EDITOR_SHELL_CSS;
      }
    },

    async buildStart() {
      // Determine if we should generate injection script. `iwer: false` opts
      // out of the emulator entirely (browser-only / native-WebXR-only apps).
      const shouldInject =
        pluginOptions.iwer !== false &&
        (config.command === 'serve' ||
          (config.command === 'build' && pluginOptions.injectOnBuild));

      if (!shouldInject) {
        if (pluginOptions.verbose) {
          if (pluginOptions.iwer === false) {
            console.log('⏭️  IWSDK Dev: IWER injection disabled (iwer: false)');
          } else if (config.command === 'build') {
            console.log(
              '⏭️  IWSDK Dev: Skipping build injection (injectOnBuild: false)',
            );
          }
        }
        return;
      }

      try {
        if (pluginOptions.verbose) {
          console.log('🚀 IWSDK Dev: Starting injection bundle generation...');
        }

        injectionBundle = await buildInjectionBundle(pluginOptions);

        if (pluginOptions.verbose) {
          console.log('✅ IWSDK Dev: Injection bundle ready');
        }
      } catch (error) {
        console.error(
          '❌ IWSDK Dev: Failed to generate injection bundle:',
          error,
        );
        // Continue without injection rather than failing the build
      }
    },

    transformIndexHtml: {
      order: 'pre', // Run before other HTML transformations
      handler(html) {
        // Check if we should inject. Mirrors buildStart's gate (incl.
        // `iwer !== false`) so the policy is explicit at every hook, even
        // though `injectionBundle` is already null when iwer is false.
        const shouldInject =
          pluginOptions.iwer !== false &&
          (config.command === 'serve' ||
            (config.command === 'build' && pluginOptions.injectOnBuild));

        if (!shouldInject || !injectionBundle) {
          return html;
        }

        if (pluginOptions.verbose) {
          console.log('💉 IWSDK Dev: Injecting runtime script into HTML');
        }

        // Inject the script using Vite's tag API for robustness
        return {
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module', src: VIRTUAL_ID },
              injectTo: 'head',
            },
          ],
        } as any;
      },
    },

    // Display summary at the end of build process
    closeBundle: {
      order: 'post',
      async handler() {
        // Only show summary when injection actually happened (same gate as
        // buildStart / transformIndexHtml, including `iwer !== false`).
        const shouldInject =
          pluginOptions.iwer !== false &&
          (config.command === 'serve' ||
            (config.command === 'build' && pluginOptions.injectOnBuild));

        if (shouldInject && injectionBundle) {
          const mode = config.command === 'serve' ? 'Development' : 'Build';
          console.log(`\n🥽 IWSDK Dev Summary (${mode}):`);
          console.log(`  - Device: ${pluginOptions.device}`);
          console.log(
            `  - Runtime injected: ${(injectionBundle.size / 1024).toFixed(1)}KB`,
          );
          console.log(`  - Activation mode: ${pluginOptions.activation}`);

          if (pluginOptions.sem) {
            console.log(
              `  - SEM environment: ${pluginOptions.sem.defaultScene}`,
            );
          }

          if (pluginOptions.ai) {
            console.log(
              `  - AI: ${pluginOptions.ai.mode} mode (WebSocket at /__iwer_mcp)`,
            );
          }
          if (pluginOptions.workspace && !pluginOptions.ai) {
            console.log('  - Workspace: enabled (WebSocket at /__iwer_mcp)');
          }

          if (pluginOptions.activation === 'localhost') {
            console.log(
              '  - Note: Runtime only activates on localhost/local networks',
            );
          }

          console.log(''); // Extra line for spacing
        }
      },
    },
  };
}

function getRequestPathname(url: string | undefined): string {
  if (url == null) {
    return '';
  }

  try {
    return new URL(url, 'http://iwsdk.local').pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

function getRequestSearch(url: string | undefined): string {
  if (url == null) {
    return '';
  }

  try {
    return new URL(url, 'http://iwsdk.local').search;
  } catch {
    const searchIndex = url.indexOf('?');
    return searchIndex === -1 ? '' : url.slice(searchIndex);
  }
}

function hasManagedWorkspaceAccess(
  request: IncomingMessage,
  token: string,
): boolean {
  if (getHeaderValue(request.headers?.[MANAGED_WORKSPACE_HEADER]) === token) {
    return true;
  }

  try {
    const parsed = new URL(request.url ?? '', 'http://iwsdk.local');
    return parsed.searchParams.get(MANAGED_WORKSPACE_QUERY) === token;
  } catch {
    return false;
  }
}

function getHeaderValue(
  value: string | string[] | number | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return value;
}

function getRequestHeaderValue(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const lowerName = name.toLowerCase();
  const direct = getHeaderValue(request.headers[lowerName]);
  if (direct != null) {
    return direct;
  }
  const entry = Object.entries(request.headers).find(
    ([key]) => key.toLowerCase() === lowerName,
  );
  return getHeaderValue(entry?.[1]);
}

function normalizeSceneRevisionHeader(
  value: string | undefined,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function redirectToRuntimeApp(response: ServerResponse): void {
  response.statusCode = 302;
  response.setHeader('Location', '/');
  response.end();
}

function redirectToWorkspace(
  response: ServerResponse,
  requestUrl: string | undefined,
): void {
  response.statusCode = 302;
  response.setHeader(
    'Location',
    `${WORKSPACE_ROUTE}${getRequestSearch(requestUrl)}`,
  );
  response.end();
}

function sendJsonError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: message, ...extra }));
}

function normalizePageRole(
  role: string | undefined,
): 'app' | 'editor' | 'preview' {
  return role === 'editor' || role === 'preview' ? role : 'app';
}

function getWorkspaceScreenshotView(
  params: Record<string, unknown> | undefined,
): 'runtime' | 'editor' | null {
  const target = params?.__iwsdkScreenshotTarget;
  if (target === 'runtime' || target === 'editor') {
    return target;
  }
  return null;
}

async function handleEditorDocumentRequest(
  request: IncomingMessage,
  response: ServerResponse,
  workspaceRoot: string,
): Promise<void> {
  try {
    const scenePath = resolveEditorScenePath(request.url, workspaceRoot);
    const relativeScenePath = path.relative(workspaceRoot, scenePath);

    if (request.method === 'GET' || request.method === 'HEAD') {
      const revision = getSceneFileRevision(scenePath);
      const documentText = existsSync(scenePath)
        ? readFileSync(scenePath, 'utf8')
        : serializeSceneDocument({
            nodes: [],
            units: 'meters',
            version: CURRENT_SCENE_VERSION,
          });
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('X-IWSDK-Scene-Path', relativeScenePath);
      response.setHeader('X-IWSDK-Scene-Revision', revision.revision);
      response.end(request.method === 'HEAD' ? undefined : documentText);
      return;
    }

    if (request.method === 'PUT') {
      const body = await readRequestBody(request);
      const document = parseSceneDocument(body);
      const serialized = serializeSceneDocument(document);
      const currentRevision = getSceneFileRevision(scenePath);
      const expectedRevision = normalizeSceneRevisionHeader(
        getRequestHeaderValue(request, 'if-match') ??
          getRequestHeaderValue(request, 'x-iwsdk-scene-revision'),
      );
      if (currentRevision.exists && expectedRevision == null) {
        sendJsonError(
          response,
          409,
          'Scene file revision is required before overwriting an existing scene.',
          {
            code: 'scene_revision_required',
            currentRevision: currentRevision.revision,
            path: relativeScenePath,
          },
        );
        return;
      }
      if (
        expectedRevision != null &&
        expectedRevision !== currentRevision.revision
      ) {
        sendJsonError(response, 409, 'Scene file changed on disk.', {
          code: 'scene_revision_conflict',
          currentRevision: currentRevision.revision,
          expectedRevision,
          path: relativeScenePath,
        });
        return;
      }
      mkdirSync(path.dirname(scenePath), { recursive: true });
      writeFileSync(scenePath, serialized, 'utf8');
      const writtenRevision = getSceneFileRevision(scenePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          bytes: Buffer.byteLength(serialized),
          path: relativeScenePath,
          previousRevision: currentRevision.revision,
          revision: writtenRevision.revision,
          savedAt: new Date().toISOString(),
          writtenRevision: writtenRevision.revision,
        }),
      );
      return;
    }

    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD, PUT');
    response.end('Method not allowed');
  } catch (error) {
    response.statusCode = 400;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

async function handleWorkspaceScenesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  workspaceRoot: string,
): Promise<void> {
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const files = listSceneFiles(workspaceRoot);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(
        request.method === 'HEAD' ? undefined : JSON.stringify({ files }),
      );
      return;
    }

    if (request.method === 'POST') {
      const body = JSON.parse((await readRequestBody(request)) || '{}') as {
        overwrite?: unknown;
        path?: unknown;
      };
      const scenePath = resolveManagedScenePath(body.path, workspaceRoot);
      if (existsSync(scenePath) && body.overwrite !== true) {
        response.statusCode = 409;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(
          JSON.stringify({
            error:
              'Scene file already exists. Pass overwrite: true to replace it.',
          }),
        );
        return;
      }

      const document: SceneDocument = {
        nodes: [],
        units: 'meters',
        version: CURRENT_SCENE_VERSION,
      };
      const serialized = serializeSceneDocument(document);
      const previousRevision = getSceneFileRevision(scenePath);
      mkdirSync(path.dirname(scenePath), { recursive: true });
      writeFileSync(scenePath, serialized, 'utf8');
      const writtenRevision = getSceneFileRevision(scenePath);
      response.statusCode = 201;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(
        JSON.stringify({
          document,
          path: path.relative(workspaceRoot, scenePath),
          previousRevision: previousRevision.revision,
          revision: writtenRevision.revision,
          writtenRevision: writtenRevision.revision,
        }),
      );
      return;
    }

    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD, POST');
    response.end('Method not allowed');
  } catch (error) {
    response.statusCode = 400;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function resolveEditorScenePath(
  url: string | undefined,
  workspaceRoot: string,
): string {
  const parsed = new URL(url ?? '', 'http://iwsdk.local');
  return resolveManagedScenePath(
    parsed.searchParams.get('scene'),
    workspaceRoot,
  );
}

function resolveManagedScenePath(
  requestedScene: unknown,
  workspaceRoot: string,
): string {
  const scenePath =
    typeof requestedScene === 'string' && requestedScene.trim().length > 0
      ? requestedScene.trim()
      : path.join(SCENE_ROOT_RELATIVE_PATH, 'scene.iwsdk.scene.json');
  const relativeScene = scenePath.replace(/^\/+/, '');
  const resolved = path.resolve(workspaceRoot, relativeScene);
  const sceneRoot = path.resolve(workspaceRoot, SCENE_ROOT_RELATIVE_PATH);
  const relativeToWorkspace = path.relative(workspaceRoot, resolved);
  const relativeToSceneRoot = path.relative(sceneRoot, resolved);

  if (
    relativeToWorkspace === '' ||
    relativeToWorkspace.startsWith('..') ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    throw new Error('Scene path must stay inside the Vite workspace root');
  }
  if (
    relativeToSceneRoot === '' ||
    relativeToSceneRoot.startsWith('..') ||
    path.isAbsolute(relativeToSceneRoot)
  ) {
    throw new Error('Scene path must stay inside public/scenes/');
  }
  if (!resolved.endsWith(SCENE_FILE_SUFFIX)) {
    throw new Error(`Scene path must end with ${SCENE_FILE_SUFFIX}`);
  }

  return resolved;
}

function listSceneFiles(workspaceRoot: string) {
  const sceneRoot = path.resolve(workspaceRoot, SCENE_ROOT_RELATIVE_PATH);
  if (!existsSync(sceneRoot)) {
    return [];
  }

  const files: Array<{
    modifiedAt: string;
    path: string;
    revision: string;
    size: number;
  }> = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !absolutePath.endsWith(SCENE_FILE_SUFFIX)) {
        continue;
      }
      const stats = statSync(absolutePath);
      files.push({
        modifiedAt: stats.mtime.toISOString(),
        path: path.relative(workspaceRoot, absolutePath),
        revision: sceneFileRevisionFromStats(stats),
        size: stats.size,
      });
    }
  };

  visit(sceneRoot);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function getSceneFileRevision(filePath: string): {
  exists: boolean;
  modifiedAt?: string;
  revision: string;
  size?: number;
} {
  if (!existsSync(filePath)) {
    return { exists: false, revision: 'missing' };
  }
  const stats = statSync(filePath);
  return {
    exists: true,
    modifiedAt: stats.mtime.toISOString(),
    revision: sceneFileRevisionFromStats(stats),
    size: stats.size,
  };
}

function sceneFileRevisionFromStats(stats: { mtimeMs: number; size: number }) {
  return `${Math.round(stats.mtimeMs * 1000)}-${stats.size}`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** @deprecated Use `iwsdkDev` instead */
export const injectIWER = iwsdkDev;
