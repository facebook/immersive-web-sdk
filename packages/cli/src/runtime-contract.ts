/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type AiTool = 'claude' | 'cursor' | 'copilot' | 'codex';

export type JsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  oneOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
};

export interface McpConfigTarget {
  file: string;
  jsonKey: string | null;
  format: 'json' | 'toml';
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface RuntimeOperationDefinition {
  id: string;
  domain: string;
  action: string;
  cliPath: [string, string] | string[];
  mcpName: string;
  wsMethod: string;
  target?: RuntimePageTarget;
  description: string;
  inputSchema: JsonSchema;
}

export type RuntimePageRole = 'app' | 'editor' | 'preview';

export interface RuntimePageTarget {
  role?: RuntimePageRole;
  pageId?: string;
  tabGeneration?: number;
  sceneSessionId?: string;
}

export const IWSDK_PROJECT_STATE_DIR = '.iwsdk';
export const IWSDK_RUNTIME_STATE_DIR = '.iwsdk/runtime';
export const IWSDK_RUNTIME_LOGS_DIR = '.iwsdk/runtime/logs';
export const IWSDK_RUNTIME_SESSION_PATH = '.iwsdk/runtime/session.json';
export const IWSDK_RUNTIME_LAUNCH_PATH = '.iwsdk/runtime/launch.json';
export const IWSDK_RUNTIME_STATE_SCHEMA_VERSION = 2;
export const IWSDK_RUNTIME_BROWSER_READY_SCHEMA_VERSION = 2;
export const INTERNAL_BROWSER_PROBE_METHOD = '__iwsdk_browser_probe';

export type RuntimeIssueCause =
  | 'browser_not_ready'
  | 'browser_not_launched'
  | 'browser_launch_failed'
  | 'connection_lost'
  | 'permission_denied'
  | 'browser_relaunched'
  | 'tab_throttled'
  | 'open_failed';

export interface RuntimeIssueInfo {
  cause: RuntimeIssueCause;
  message: string;
  at: string;
}

export type RuntimeBrowserStatus =
  | 'launching'
  | 'waiting_for_connection'
  | 'connected'
  | 'disconnected'
  | 'launch_failed';

export interface RuntimeBrowserState {
  status: RuntimeBrowserStatus;
  connected: boolean;
  commandReady: boolean;
  connectedClientCount: number;
  lastTransitionAt: string;
  lastBridgeConnectedAt?: string;
  lastCommandReadyAt?: string;
  lastError?: RuntimeIssueInfo;
}

export interface RuntimeBrowserProbeResult {
  bridgeConnected: boolean;
  commandReady: boolean;
  waitedForBridgeMs: number;
  browser: RuntimeBrowserState;
}

export interface RuntimeSession {
  schemaVersion: number;
  sessionId: string;
  workspaceRoot: string;
  pid: number;
  port: number;
  localUrl: string;
  networkUrls: string[];
  aiMode?: string;
  browser?: RuntimeBrowserState;
  registeredAt: string;
  updatedAt: string;
}

export interface LaunchMetadata {
  schemaVersion: number;
  workspaceRoot: string;
  pid: number;
  command: string;
  args: string[];
  logPath: string | null;
  scriptName: string;
  port: number | null;
  openBrowser: boolean;
  createdAt: string;
}

export interface WorkspaceRuntimeState {
  workspaceRoot: string;
  running: boolean;
  starting: boolean;
  browserConnected: boolean;
  browserCommandReady: boolean;
  session: RuntimeSession | null;
  launch: LaunchMetadata | null;
}

type RuntimeBrowserStatusSession = Pick<
  RuntimeSession,
  'schemaVersion' | 'browser'
>;

export function hasRuntimeBrowserCommandReadyContract(
  session: RuntimeBrowserStatusSession | null | undefined,
): boolean {
  if (!session?.browser) {
    return false;
  }

  return (
    session.schemaVersion >= IWSDK_RUNTIME_BROWSER_READY_SCHEMA_VERSION ||
    typeof session.browser.commandReady === 'boolean'
  );
}

export function isRuntimeBrowserCommandReady(
  session: RuntimeBrowserStatusSession | null | undefined,
): boolean {
  if (!session?.browser) {
    return false;
  }

  if (!hasRuntimeBrowserCommandReadyContract(session)) {
    return session.browser.connected;
  }

  return session.browser.commandReady === true;
}

export const SUPPORTED_AI_TOOLS: AiTool[] = [
  'claude',
  'cursor',
  'copilot',
  'codex',
];

export const MCP_CONFIG_TARGETS: Record<AiTool, McpConfigTarget> = {
  claude: { file: '.mcp.json', jsonKey: 'mcpServers', format: 'json' },
  cursor: { file: '.cursor/mcp.json', jsonKey: 'mcpServers', format: 'json' },
  copilot: { file: '.vscode/mcp.json', jsonKey: 'servers', format: 'json' },
  codex: { file: '.codex/config.toml', jsonKey: null, format: 'toml' },
};

const VECTOR3_SCHEMA: JsonSchema = {
  type: 'array',
  items: { type: 'number' },
  description: '[x, y, z] in meters or degrees depending on the field',
};

const SCENE_TRANSFORM_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Scene node transform. position is meters, rotationDeg is Euler degrees, scale is a scalar or [x,y,z].',
  properties: {
    position: VECTOR3_SCHEMA,
    rotationDeg: VECTOR3_SCHEMA,
    scale: {
      oneOf: [{ type: 'number' }, VECTOR3_SCHEMA],
      description: 'Uniform scale number or non-uniform [x, y, z] scale',
    },
    lookAt: VECTOR3_SCHEMA,
    placeOn: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            target: { type: 'string' },
            clearance: { type: 'number' },
            align: { type: 'string', enum: ['center', 'preserve-xz'] },
          },
          required: ['target'],
        },
      ],
      description:
        'Place this node on another node by id, using asset bounds when available.',
    },
  },
};

const SCENE_CAMERA_VIEW_SCHEMA: JsonSchema = {
  type: 'string',
  enum: [
    'current',
    'top',
    'front',
    'back',
    'left',
    'right',
    'quarter',
    'orbit',
  ],
  description:
    'Named editor camera view. "current" preserves the active camera.',
};

const SCENE_CAMERA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    view: SCENE_CAMERA_VIEW_SCHEMA,
    orbitStep: {
      type: 'number',
      description:
        'Deterministic 45-degree orbit step when view is "orbit" (0-7 wrap around; negative values are allowed).',
    },
    step: {
      type: 'number',
      description: 'Alias for orbitStep when view is "orbit".',
    },
    position: VECTOR3_SCHEMA,
    lookAt: VECTOR3_SCHEMA,
    fov: {
      type: 'number',
      minimum: 1,
      maximum: 179,
      description: 'Vertical field of view in degrees',
    },
  },
};

export const RUNTIME_MCP_TOOLS: McpToolDefinition[] = [
  // =============================================================================
  // Session Management
  // =============================================================================
  {
    name: 'xr_get_session_status',
    description: 'Get XR session and device status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_accept_session',
    description:
      'Accept an offered XR session (equivalent to clicking "Enter XR" button)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_end_session',
    description: 'End the current active XR session',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // =============================================================================
  // Transform Control
  // =============================================================================
  {
    name: 'xr_get_transform',
    description: 'Get position and orientation of a tracked device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to query',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_transform',
    description:
      'Set position and/or orientation of a tracked device. Position is in meters, orientation can be quaternion or euler angles (degrees).',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to move',
        },
        position: {
          type: 'object',
          description: 'World position in meters',
          properties: {
            x: { type: 'number', description: 'X position (left/right)' },
            y: {
              type: 'number',
              description: 'Y position (up/down, 1.6 is standing height)',
            },
            z: {
              type: 'number',
              description: 'Z position (forward/back, negative is forward)',
            },
          },
        },
        orientation: {
          type: 'object',
          description:
            'Rotation as quaternion {x,y,z,w} or euler angles {pitch,yaw,roll} in degrees',
          properties: {
            x: { type: 'number', description: 'Quaternion X component' },
            y: { type: 'number', description: 'Quaternion Y component' },
            z: { type: 'number', description: 'Quaternion Z component' },
            w: { type: 'number', description: 'Quaternion W component' },
            pitch: {
              type: 'number',
              description: 'Pitch in degrees (X rotation)',
            },
            yaw: { type: 'number', description: 'Yaw in degrees (Y rotation)' },
            roll: {
              type: 'number',
              description: 'Roll in degrees (Z rotation)',
            },
          },
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_look_at',
    description: 'Orient a device to look at a specific world position',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to orient',
        },
        target: {
          type: 'object',
          description: 'World position to look at',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
        },
        moveToDistance: {
          type: 'number',
          description: 'Optional: move device to this distance from target',
        },
      },
      required: ['device', 'target'],
    },
  },
  {
    name: 'xr_animate_to',
    description:
      'Smoothly animate a device to a new position/orientation over time',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'headset',
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The device to animate',
        },
        position: {
          type: 'object',
          description: 'Target world position in meters',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
        },
        orientation: {
          type: 'object',
          description:
            'Target rotation as quaternion {x,y,z,w} or euler angles {pitch,yaw,roll} in degrees',
          properties: {
            x: { type: 'number', description: 'Quaternion X component' },
            y: { type: 'number', description: 'Quaternion Y component' },
            z: { type: 'number', description: 'Quaternion Z component' },
            w: { type: 'number', description: 'Quaternion W component' },
            pitch: {
              type: 'number',
              description: 'Pitch in degrees (X rotation)',
            },
            yaw: { type: 'number', description: 'Yaw in degrees (Y rotation)' },
            roll: {
              type: 'number',
              description: 'Roll in degrees (Z rotation)',
            },
          },
        },
        duration: {
          type: 'number',
          description: 'Animation duration in seconds (default: 0.5)',
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Input Mode
  // =============================================================================
  {
    name: 'xr_set_input_mode',
    description: 'Switch between controller and hand tracking input modes',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['controller', 'hand'],
          description: 'Input mode to switch to',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'xr_set_connected',
    description: 'Connect or disconnect an input device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        connected: {
          type: 'boolean',
          description: 'Whether the device should be connected',
        },
      },
      required: ['device', 'connected'],
    },
  },

  // =============================================================================
  // Select/Trigger Input
  // =============================================================================
  {
    name: 'xr_get_select_value',
    description:
      'Get the current select (trigger/pinch) value for an input device',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_select_value',
    description:
      'Set the select (trigger/pinch) value for an input device. Use for grab-move-release patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        value: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Select value (0=released, 1=fully pressed/pinched)',
        },
      },
      required: ['device', 'value'],
    },
  },
  {
    name: 'xr_select',
    description:
      'Perform a complete select action (press and release). Dispatches selectstart, select, selectend events.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'controller-left',
            'controller-right',
            'hand-left',
            'hand-right',
          ],
          description: 'The input device',
        },
        duration: {
          type: 'number',
          description: 'How long to hold in seconds (default: 0.15)',
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Gamepad State (Controllers only)
  // =============================================================================
  {
    name: 'xr_get_gamepad_state',
    description:
      'Get full gamepad state including all buttons and axes. Button indices in the result: 0=trigger, 1=squeeze, 2=thumbstick, 3=A/X, 4=B/Y, 5=thumbrest.',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: ['controller-left', 'controller-right'],
          description: 'The controller',
        },
      },
      required: ['device'],
    },
  },
  {
    name: 'xr_set_gamepad_state',
    description: 'Set gamepad button and axis values by index',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: ['controller-left', 'controller-right'],
          description: 'The controller',
        },
        buttons: {
          type: 'array',
          description: 'Button states to set',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'number',
                description:
                  'Button index (0=trigger, 1=squeeze, 2=thumbstick, 3=A/X, 4=B/Y, 5=thumbrest)',
              },
              value: { type: 'number', description: 'Button value 0-1' },
              touched: {
                type: 'boolean',
                description: 'Whether button is touched',
              },
            },
            required: ['index', 'value'],
          },
        },
        axes: {
          type: 'array',
          description: 'Axis values to set',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'number',
                description: 'Axis index (0=thumbstick X, 1=thumbstick Y)',
              },
              value: { type: 'number', description: 'Axis value -1 to 1' },
            },
            required: ['index', 'value'],
          },
        },
      },
      required: ['device'],
    },
  },

  // =============================================================================
  // Screenshot
  // =============================================================================
  {
    name: 'browser_screenshot',
    description:
      'Capture a screenshot of the managed browser target. Returns the image directly.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['runtime', 'editor', 'workspace'],
          description:
            'Semantic browser target to capture. runtime captures the app; editor/workspace captures the managed workspace editor.',
        },
      },
    },
  },

  // =============================================================================
  // Device State
  // =============================================================================
  {
    name: 'xr_get_device_state',
    description:
      'Get comprehensive state of the XR device including headset, controllers, and hands',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'xr_set_device_state',
    description:
      'Set device state. When called with no state, resets everything to defaults.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'object',
          description:
            'Partial device state to apply. Omit to reset to defaults.',
          properties: {
            headset: {
              type: 'object',
              description: 'Headset transform',
              properties: {
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                  },
                },
                orientation: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    z: { type: 'number' },
                    w: { type: 'number' },
                  },
                },
              },
            },
            inputMode: {
              type: 'string',
              enum: ['controller', 'hand'],
              description: 'Input mode',
            },
            stereoEnabled: {
              type: 'boolean',
              description: 'Whether stereo rendering is enabled',
            },
            fov: {
              type: 'number',
              description: 'Field of view in degrees',
            },
            controllers: {
              type: 'object',
              description: 'Controller states',
              properties: {
                left: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
                right: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
              },
            },
            hands: {
              type: 'object',
              description: 'Hand states',
              properties: {
                left: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
                right: {
                  type: 'object',
                  properties: {
                    position: { type: 'object' },
                    orientation: { type: 'object' },
                    connected: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // =============================================================================
  // Console Logs (Plugin-specific, not in IWER)
  // =============================================================================
  {
    name: 'browser_get_console_logs',
    description:
      'Get console logs from the browser with optional filtering. By default excludes debug level logs.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Maximum number of logs to return (most recent N)',
        },
        level: {
          oneOf: [
            {
              type: 'string',
              enum: ['log', 'info', 'warn', 'error', 'debug'],
            },
            {
              type: 'array',
              items: {
                type: 'string',
                enum: ['log', 'info', 'warn', 'error', 'debug'],
              },
            },
          ],
          description:
            'Filter by log level(s). Default: ["log", "info", "warn", "error"] (excludes debug)',
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter log messages',
        },
        since: {
          type: 'number',
          description: 'Return logs since this timestamp (ms since epoch)',
        },
      },
    },
  },
  {
    name: 'browser_reload_page',
    description:
      'Reload the browser page to reset application state. Use when the app enters an unrecoverable state or to apply code changes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // =============================================================================
  // Managed Workspace Tools
  // =============================================================================
  {
    name: 'workspace_get_state',
    description:
      'Get the managed IWSDK workspace state, including current view, runtime readiness, editor readiness, selected scene path, scene session id, and dirty state.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'workspace_set_view',
    description:
      'Set the visible managed IWSDK workspace view. This changes UI presentation only; tool routing remains semantic and deterministic.',
    inputSchema: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['runtime', 'editor', 'split'],
          description: 'Workspace view to show',
        },
      },
      required: ['view'],
    },
  },
  {
    name: 'workspace_open_scene',
    description:
      'Open a scene file from public/scenes in the managed IWSDK workspace editor.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Scene file path under public/scenes, ending in .iwsdk.scene.json',
        },
      },
      required: ['path'],
    },
  },

  // =============================================================================
  // Native Scene Composition Editor Tools
  // =============================================================================
  {
    name: 'scene_list_files',
    description:
      'List IWSDK scene JSON files available under public/scenes in the managed workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional case-insensitive scene path filter',
        },
      },
    },
  },
  {
    name: 'scene_open',
    description:
      'Open an existing IWSDK scene JSON file from public/scenes in the managed workspace editor.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Scene file path under public/scenes, ending in .iwsdk.scene.json',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'scene_create',
    description:
      'Create a new IWSDK scene JSON file under public/scenes and open it in the managed workspace editor by default.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Scene file path under public/scenes, ending in .iwsdk.scene.json',
        },
        overwrite: {
          type: 'boolean',
          description: 'Replace an existing scene file when true',
        },
        open: {
          type: 'boolean',
          description:
            'Open the newly-created scene in the editor. Defaults to true.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'scene_list_assets',
    description:
      'List assets available to the native IWSDK scene editor, including ids, names, URIs, and bounds metadata when present.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional case-insensitive asset id/name filter',
        },
      },
    },
  },
  {
    name: 'scene_list_component_schemas',
    description:
      'List typed component schemas available to the native IWSDK scene editor. Use this before adding or editing component payloads so scene JSON uses typed component props.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Optional case-insensitive component id/name/description filter',
        },
      },
    },
  },
  {
    name: 'scene_get_document',
    description:
      'Get the current native IWSDK scene JSON document from the editor page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_get_hierarchy',
    description:
      'Get the current native IWSDK scene document hierarchy from the editor page. Returns native scene node ids, not Object3D UUIDs.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description:
            'Scene node id of the parent to start from. Defaults to scene root if omitted.',
        },
        maxDepth: {
          type: 'number',
          description:
            'Maximum depth to traverse (default: 5). Use to limit context size.',
        },
      },
    },
  },
  {
    name: 'scene_get_selection',
    description: 'Get the current native scene editor selection.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_select',
    description: 'Select one or more scene node ids in the native editor.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scene node ids to select. Pass [] to clear selection.',
        },
      },
      required: ['nodeIds'],
    },
  },
  {
    name: 'scene_add_node',
    description: 'Add a node to the native scene JSON document.',
    inputSchema: {
      type: 'object',
      properties: {
        node: {
          type: 'object',
          description:
            'Scene node to add. Must include id. asset must reference a known asset id when present.',
        },
        parentId: {
          type: 'string',
          description: 'Optional parent scene node id',
        },
        index: {
          type: 'number',
          description: 'Optional insertion index within the parent children',
        },
      },
      required: ['node'],
    },
  },
  {
    name: 'scene_remove_node',
    description: 'Remove a node from the native scene JSON document.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scene node id to remove' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'scene_duplicate_node',
    description:
      'Duplicate a node and its children in the native scene editor.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scene node id to duplicate' },
        newNodeId: {
          type: 'string',
          description: 'Optional id for the duplicated root node',
        },
        parentId: {
          type: 'string',
          description:
            'Optional parent id for the duplicate. Defaults to the original parent.',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'scene_set_transform',
    description:
      'Replace the transform for a native scene node. Use scene_place_on and scene_look_at for deterministic placement/orientation helpers.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Scene node id' },
        transform: SCENE_TRANSFORM_SCHEMA,
      },
      required: ['nodeId', 'transform'],
    },
  },
  {
    name: 'scene_apply_patch',
    description:
      'Apply one native scene JSON patch operation with undo support. Prefer specific tools for common edits.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description:
            'ScenePatch operation such as addNode, removeNode, moveNode, renameNode, updateTransform, updateComponent, reorderChildren, updateAssetRef, setEditorMetadata, or setNodeMetadata.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'scene_place_on',
    description:
      'Place a node on another node by using scene asset bounds. Useful for desks, floors, shelves, plinths, and panels.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node being placed' },
        targetId: { type: 'string', description: 'Support node id' },
        clearance: {
          type: 'number',
          description: 'Optional vertical clearance in meters',
        },
        align: {
          type: 'string',
          enum: ['center', 'preserve-xz'],
          description: 'Whether to center x/z on the target or preserve x/z',
        },
      },
      required: ['nodeId', 'targetId'],
    },
  },
  {
    name: 'scene_look_at',
    description:
      'Yaw a scene node so it faces a target point while preserving pitch and roll.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node to orient' },
        target: VECTOR3_SCHEMA,
      },
      required: ['nodeId', 'target'],
    },
  },
  {
    name: 'scene_validate',
    description:
      'Validate the current native scene JSON document and return structured issues with paths and suggested fixes where available.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_save',
    description:
      'Save the current native scene JSON document from the editor page to disk.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_undo',
    description: 'Undo the most recent native scene editor command.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_redo',
    description: 'Redo the most recently undone native scene editor command.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'scene_get_logs',
    description: 'Get native scene editor logs.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Maximum number of recent logs to return',
        },
        level: {
          type: 'string',
          enum: ['info', 'warn', 'error'],
          description: 'Optional log level filter',
        },
      },
    },
  },
  {
    name: 'scene_set_camera',
    description:
      'Set the native scene editor camera to a named view or explicit pose.',
    inputSchema: {
      type: 'object',
      properties: SCENE_CAMERA_SCHEMA.properties,
    },
  },
  {
    name: 'scene_screenshot',
    description:
      'Capture a native scene editor screenshot. Supports current/top/front/back/left/right/quarter/orbit views and explicit camera poses.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SCENE_CAMERA_SCHEMA.properties,
        width: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Optional screenshot width in pixels',
        },
        height: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Optional screenshot height in pixels',
        },
      },
    },
  },
  {
    name: 'scene_compare_screenshots',
    description:
      'Capture two native scene editor screenshots and report whether the image payloads match. Useful for checking that named camera views or before/after scene edits produce distinct visual evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'object',
          description:
            'First camera request. Accepts the same fields as scene_screenshot.',
          properties: SCENE_CAMERA_SCHEMA.properties,
        },
        second: {
          type: 'object',
          description:
            'Second camera request. Accepts the same fields as scene_screenshot.',
          properties: SCENE_CAMERA_SCHEMA.properties,
        },
        width: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Optional screenshot width in pixels',
        },
        height: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Optional screenshot height in pixels',
        },
      },
      required: ['first', 'second'],
    },
  },

  // =============================================================================
  // Framework-Specific Tools (IWSDK or any framework with FRAMEWORK_MCP_RUNTIME)
  // =============================================================================
  {
    name: 'scene_get_object_transform',
    description:
      'Get local and global transforms of an Object3D by Object3D UUID or native scene node id. Includes positionRelativeToXROrigin which can be used directly with xr_look_at tool. Requires IWSDK or a framework that provides FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description:
            'UUID of the Object3D (get this from get_scene_hierarchy/runtime hierarchy, not the native editor scene hierarchy)',
        },
        nodeId: {
          type: 'string',
          description:
            'Native scene node id (get this from scene_get_hierarchy when using the native scene editor)',
        },
      },
    },
  },

  // =============================================================================
  // ECS Debugging (IWSDK — requires FRAMEWORK_MCP_RUNTIME)
  // =============================================================================
  {
    name: 'ecs_pause',
    description:
      'Pause ECS system updates. The render loop continues (XR session stays alive, screenshots still work) but no systems tick. Use ecs_step to advance individual frames while paused. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_resume',
    description:
      'Resume ECS system updates after pausing. The first frame after resume uses a capped delta to avoid physics explosions. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_step',
    description:
      'Advance N ECS frames with a fixed timestep while paused. Must call ecs_pause first. Useful for frame-by-frame debugging. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of frames to advance (1-120, default: 1)',
        },
        delta: {
          type: 'number',
          description:
            'Fixed timestep in seconds for each frame (default: 1/72 ≈ 0.0139, matching Quest refresh rate)',
        },
      },
    },
  },
  {
    name: 'ecs_query_entity',
    description:
      'Get all component data for an entity. Use entityIndex from ecs_find_entities. Returns serialized component values including vectors, entity refs, and Object3D references. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        entityIndex: {
          type: 'number',
          description: 'Entity index (get this from ecs_find_entities)',
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of component IDs to include. If omitted, returns all components on the entity.',
        },
      },
      required: ['entityIndex'],
    },
  },
  {
    name: 'ecs_find_entities',
    description:
      'Find entities by component composition and/or name. Returns entity indices and component lists. Use the returned entityIndex values with ecs_query_entity for detailed inspection. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        withComponents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component IDs that entities must have (AND logic)',
        },
        withoutComponents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component IDs that entities must NOT have',
        },
        namePattern: {
          type: 'string',
          description:
            'Regex pattern to match against entity Object3D name (case-insensitive)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (1-50, default: 50)',
        },
      },
    },
  },
  {
    name: 'ecs_list_systems',
    description:
      'List all registered ECS systems with name, priority, pause state, config keys, and query entity counts. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_list_components',
    description:
      'List all registered ECS components with their field schemas (type, default). Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ecs_toggle_system',
    description:
      'Pause or resume a specific ECS system by name. Use ecs_list_systems to discover system names. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "System class name (e.g. 'OrbSystem', 'RobotSystem')",
        },
        paused: {
          type: 'boolean',
          description:
            'Set to true to pause, false to resume. If omitted, toggles current state.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'ecs_set_component',
    description:
      'Set a component field value on an entity. Scalars use setValue (with validation), vectors accept arrays. Use ecs_query_entity to inspect current values first. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        entityIndex: {
          type: 'number',
          description: 'Entity index (from ecs_find_entities)',
        },
        componentId: {
          type: 'string',
          description: "Component ID (e.g. 'Orb', 'RobotMood', 'Transform')",
        },
        field: {
          type: 'string',
          description:
            "Field name within the component (e.g. 'orbitSpeed', 'mood')",
        },
        value: {
          description:
            'New value. Scalars: number/string/boolean. Vectors: array of numbers (e.g. [1,2,3] for Vec3).',
        },
      },
      required: ['entityIndex', 'componentId', 'field', 'value'],
    },
  },
  {
    name: 'ecs_snapshot',
    description:
      'Capture a snapshot of all ECS entity/component state. Stores up to 2 snapshots. Use with ecs_diff to compare. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description:
            'Label for this snapshot (default: auto-generated). Use to reference in ecs_diff.',
        },
      },
    },
  },
  {
    name: 'ecs_diff',
    description:
      'Compare two ECS snapshots. Shows added/removed/changed entities and field-level diffs. Requires FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: "Label of the 'before' snapshot",
        },
        to: {
          type: 'string',
          description: "Label of the 'after' snapshot",
        },
      },
      required: ['from', 'to'],
    },
  },
];

export const RUNTIME_TOOL_TO_METHOD: Record<string, string> = {
  xr_get_session_status: 'get_session_status',
  xr_accept_session: 'accept_session',
  xr_end_session: 'end_session',
  xr_get_transform: 'get_transform',
  xr_set_transform: 'set_transform',
  xr_look_at: 'look_at',
  xr_animate_to: 'animate_to',
  xr_set_input_mode: 'set_input_mode',
  xr_set_connected: 'set_connected',
  xr_get_select_value: 'get_select_value',
  xr_set_select_value: 'set_select_value',
  xr_select: 'select',
  xr_get_gamepad_state: 'get_gamepad_state',
  xr_set_gamepad_state: 'set_gamepad_state',
  xr_get_device_state: 'get_device_state',
  xr_set_device_state: 'set_device_state',
  browser_screenshot: 'screenshot',
  browser_get_console_logs: 'get_console_logs',
  browser_reload_page: 'reload_page',
  scene_get_object_transform: 'get_object_transform',
};

export const RUNTIME_CLI_PATHS: Record<string, string[]> = {
  xr_get_session_status: ['xr', 'status'],
  xr_accept_session: ['xr', 'enter'],
  xr_end_session: ['xr', 'exit'],
  xr_get_transform: ['xr', 'get-transform'],
  xr_set_transform: ['xr', 'set-transform'],
  xr_look_at: ['xr', 'look-at'],
  xr_animate_to: ['xr', 'animate-to'],
  xr_set_input_mode: ['xr', 'set-input-mode'],
  xr_set_connected: ['xr', 'set-connected'],
  xr_get_select_value: ['xr', 'get-select-value'],
  xr_set_select_value: ['xr', 'set-select-value'],
  xr_select: ['xr', 'select'],
  xr_get_gamepad_state: ['xr', 'get-gamepad-state'],
  xr_set_gamepad_state: ['xr', 'set-gamepad-state'],
  browser_screenshot: ['browser', 'screenshot'],
  xr_get_device_state: ['xr', 'get-device-state'],
  xr_set_device_state: ['xr', 'set-device-state'],
  browser_get_console_logs: ['browser', 'logs'],
  browser_reload_page: ['browser', 'reload'],
  workspace_get_state: ['workspace', 'state'],
  workspace_set_view: ['workspace', 'set-view'],
  workspace_open_scene: ['workspace', 'open-scene'],
  scene_list_files: ['scene', 'files'],
  scene_open: ['scene', 'open'],
  scene_create: ['scene', 'create'],
  scene_list_assets: ['scene', 'assets'],
  scene_list_component_schemas: ['scene', 'component-schemas'],
  scene_get_document: ['scene', 'document'],
  scene_get_hierarchy: ['scene', 'hierarchy'],
  scene_get_selection: ['scene', 'selection'],
  scene_select: ['scene', 'select'],
  scene_add_node: ['scene', 'add-node'],
  scene_remove_node: ['scene', 'remove-node'],
  scene_duplicate_node: ['scene', 'duplicate-node'],
  scene_set_transform: ['scene', 'set-transform'],
  scene_apply_patch: ['scene', 'apply-patch'],
  scene_place_on: ['scene', 'place-on'],
  scene_look_at: ['scene', 'look-at'],
  scene_validate: ['scene', 'validate'],
  scene_save: ['scene', 'save'],
  scene_undo: ['scene', 'undo'],
  scene_redo: ['scene', 'redo'],
  scene_get_logs: ['scene', 'logs'],
  scene_set_camera: ['scene', 'set-camera'],
  scene_screenshot: ['scene', 'screenshot'],
  scene_compare_screenshots: ['scene', 'compare-screenshots'],
  scene_get_object_transform: ['scene', 'transform'],
  ecs_pause: ['ecs', 'pause'],
  ecs_resume: ['ecs', 'resume'],
  ecs_step: ['ecs', 'step'],
  ecs_query_entity: ['ecs', 'query'],
  ecs_find_entities: ['ecs', 'find'],
  ecs_list_systems: ['ecs', 'systems'],
  ecs_list_components: ['ecs', 'components'],
  ecs_toggle_system: ['ecs', 'toggle-system'],
  ecs_set_component: ['ecs', 'set-component'],
  ecs_snapshot: ['ecs', 'snapshot'],
  ecs_diff: ['ecs', 'diff'],
};

export const SCENE_EDITOR_MCP_TOOL_NAMES = [
  'scene_list_assets',
  'scene_list_component_schemas',
  'scene_get_document',
  'scene_get_hierarchy',
  'scene_get_selection',
  'scene_select',
  'scene_add_node',
  'scene_remove_node',
  'scene_duplicate_node',
  'scene_set_transform',
  'scene_apply_patch',
  'scene_place_on',
  'scene_look_at',
  'scene_validate',
  'scene_save',
  'scene_undo',
  'scene_redo',
  'scene_get_logs',
  'scene_set_camera',
  'scene_screenshot',
  'scene_compare_screenshots',
] as const;

export const SCENE_FILE_MCP_TOOL_NAMES = [
  'scene_list_files',
  'scene_open',
  'scene_create',
] as const;

export const WORKSPACE_MCP_TOOL_NAMES = [
  'workspace_get_state',
  'workspace_set_view',
  'workspace_open_scene',
] as const;

const EDITOR_TARGET_MCP_TOOL_NAME_SET = new Set<string>([
  ...SCENE_EDITOR_MCP_TOOL_NAMES,
  ...SCENE_FILE_MCP_TOOL_NAMES,
  ...WORKSPACE_MCP_TOOL_NAMES,
]);

export const RUNTIME_OPERATIONS: RuntimeOperationDefinition[] =
  RUNTIME_MCP_TOOLS.map((tool) => {
    const cliPath = RUNTIME_CLI_PATHS[tool.name];
    const target = EDITOR_TARGET_MCP_TOOL_NAME_SET.has(tool.name)
      ? ({ role: 'editor' } as const)
      : undefined;
    return {
      id: cliPath ? cliPath.join('.') : tool.name,
      domain: cliPath?.[0] ?? 'misc',
      action: cliPath?.[1] ?? tool.name,
      cliPath: cliPath ?? ['misc', tool.name],
      mcpName: tool.name,
      wsMethod: RUNTIME_TOOL_TO_METHOD[tool.name] ?? tool.name,
      ...(target ? { target } : {}),
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  });

export function getRuntimeOperationByToolName(
  toolName: string,
): RuntimeOperationDefinition | undefined {
  return RUNTIME_OPERATIONS.find((operation) => operation.mcpName === toolName);
}

export function getRuntimeOperationByCliPath(
  domain: string,
  action: string,
): RuntimeOperationDefinition | undefined {
  return RUNTIME_OPERATIONS.find(
    (operation) => operation.domain === domain && operation.action === action,
  );
}

export function resolveRuntimeOperationRequest(
  operation: RuntimeOperationDefinition,
  params: unknown,
): { params: unknown; target?: RuntimePageTarget } {
  if (operation.mcpName !== 'browser_screenshot' || !isRecord(params)) {
    return { params, target: operation.target };
  }

  const { target: requestedTarget, ...rest } = params;
  if (requestedTarget == null) {
    return { params: rest, target: operation.target };
  }
  if (
    requestedTarget !== 'runtime' &&
    requestedTarget !== 'editor' &&
    requestedTarget !== 'workspace'
  ) {
    throw new Error(
      'browser_screenshot.target must be runtime, editor, or workspace',
    );
  }

  return {
    params: {
      ...rest,
      __iwsdkScreenshotTarget: requestedTarget,
    },
    target: {
      role: requestedTarget === 'runtime' ? 'app' : 'editor',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
