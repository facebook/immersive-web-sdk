/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type AiTool = 'claude' | 'cursor' | 'copilot' | 'codex' | 'opencode';

export type JsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  not?: JsonSchema;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
};

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function assertSchemaValue(
  value: unknown,
  schema: JsonSchema,
  path: string,
): void {
  if (schema.oneOf?.length) {
    const matches = schema.oneOf.filter((candidate) => {
      try {
        assertSchemaValue(value, candidate, path);
        return true;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1) {
      throw new Error(`${path} must match exactly one supported shape`);
    }
  }
  if (schema.anyOf?.length) {
    const matches = schema.anyOf.some((candidate) => {
      try {
        assertSchemaValue(value, candidate, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!matches) {
      throw new Error(`${path} must match a supported shape`);
    }
  }
  if (schema.not) {
    let matchesDisallowedSchema = true;
    try {
      assertSchemaValue(value, schema.not, path);
    } catch {
      matchesDisallowedSchema = false;
    }
    if (matchesDisallowedSchema) {
      throw new Error(`${path} uses a disallowed value`);
    }
  }

  const typeMatches =
    schema.type == null ||
    (schema.type === 'null' && value === null) ||
    (schema.type === 'array' && Array.isArray(value)) ||
    (schema.type === 'object' && isRecord(value)) ||
    (schema.type === 'integer' && Number.isInteger(value)) ||
    (schema.type === 'number' &&
      typeof value === 'number' &&
      Number.isFinite(value)) ||
    (schema.type === 'string' && typeof value === 'string') ||
    (schema.type === 'boolean' && typeof value === 'boolean');
  if (!typeMatches) {
    throw new Error(
      `${path} must be ${schema.type}; received ${describeValue(value)}`,
    );
  }

  if (schema.enum && !schema.enum.includes(value as string)) {
    throw new Error(`${path} must be one of: ${schema.enum.join(', ')}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) {
      throw new Error(`${path} must be at least ${schema.minimum}`);
    }
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) {
      throw new Error(
        `${path} must be greater than ${schema.exclusiveMinimum}`,
      );
    }
    if (schema.maximum != null && value > schema.maximum) {
      throw new Error(`${path} must be at most ${schema.maximum}`);
    }
  }
  if (
    typeof value === 'string' &&
    schema.pattern &&
    !new RegExp(schema.pattern).test(value)
  ) {
    throw new Error(`${path} must match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      throw new Error(`${path} requires at least ${schema.minItems} items`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      throw new Error(`${path} allows at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((entry, index) =>
        assertSchemaValue(entry, schema.items!, `${path}[${index}]`),
      );
    }
  }
  if (isRecord(value)) {
    const properties = schema.properties;
    for (const required of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        throw new Error(`${path}.${required} is required`);
      }
    }
    for (const [name, entry] of Object.entries(value)) {
      const propertySchema = properties?.[name];
      if (propertySchema) {
        assertSchemaValue(entry, propertySchema, `${path}.${name}`);
      } else if (!properties || schema.additionalProperties === true) {
        continue;
      } else if (typeof schema.additionalProperties === 'object') {
        assertSchemaValue(
          entry,
          schema.additionalProperties,
          `${path}.${name}`,
        );
      } else {
        const allowed = Object.keys(properties);
        throw new Error(
          `${path} has unknown parameter "${name}"${
            allowed.length ? `; allowed: ${allowed.join(', ')}` : ''
          }`,
        );
      }
    }
  }
}

export interface McpConfigTarget {
  file: string;
  jsonKey: string | null;
  format: 'json' | 'toml' | 'opencode';
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
  | 'not_launched'
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
  browserIssue?: RuntimeIssueInfo;
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
  'opencode',
];

export const MCP_CONFIG_TARGETS: Record<AiTool, McpConfigTarget> = {
  claude: { file: '.mcp.json', jsonKey: 'mcpServers', format: 'json' },
  cursor: { file: '.cursor/mcp.json', jsonKey: 'mcpServers', format: 'json' },
  copilot: { file: '.vscode/mcp.json', jsonKey: 'servers', format: 'json' },
  codex: { file: '.codex/config.toml', jsonKey: null, format: 'toml' },
  opencode: { file: 'opencode.json', jsonKey: 'mcp', format: 'opencode' },
};

const VECTOR3_SCHEMA: JsonSchema = {
  type: 'array',
  items: { type: 'number' },
  description: '[x, y, z] in meters or degrees depending on the field',
};

const SCENE_TRANSFORM_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'Scene node transform. position is meters, rotationDeg is Euler degrees, scale is a scalar or [x,y,z].',
  properties: {
    position: VECTOR3_SCHEMA,
    rotationDeg: VECTOR3_SCHEMA,
    scale: {
      oneOf: [{ type: 'number' }, VECTOR3_SCHEMA],
      description: 'Uniform scale number or non-uniform [x, y, z] scale',
    },
  },
};

const SCENE_CONSTRAINTS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lookAt: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: VECTOR3_SCHEMA,
        mode: {
          type: 'string',
          enum: ['yaw-v1'],
        },
      },
      required: ['target', 'mode'],
    },
  },
};

const SCENE_CONTENT_SCHEMA: JsonSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: { type: { type: 'string', enum: ['group'] } },
      required: ['type'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['asset'] },
        asset: { type: 'string' },
        castShadow: { type: 'boolean' },
        receiveShadow: { type: 'boolean' },
      },
      required: ['type', 'asset'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['instance'] },
        prefab: { type: 'string' },
        overrides: { type: 'object' },
      },
      required: ['type', 'prefab'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['pattern'] },
        prefab: { type: 'string' },
        distribution: { type: 'object' },
        overrides: { type: 'object' },
      },
      required: ['type', 'prefab', 'distribution'],
    },
  ],
};

const SCENE_NODE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'Scene node. Content is discriminated as group, asset, instance, or pattern. Renderable assets, including procedural geometry, are declared in the asset manifest; behavior capabilities such as lights are components.',
  properties: {
    id: { type: 'string', description: 'Stable scene node id.' },
    name: { type: 'string', description: 'Optional display name.' },
    framingRole: {
      type: 'string',
      enum: ['content', 'support'],
      description:
        'Camera-framing role. Omission behaves as content; support remains rendered but is excluded from content framing.',
    },
    content: SCENE_CONTENT_SCHEMA,
    transform: SCENE_TRANSFORM_SCHEMA,
    constraints: SCENE_CONSTRAINTS_SCHEMA,
    components: {
      type: 'object',
      description:
        'Optional native scene component values keyed by component id.',
    },
    children: {
      type: 'array',
      items: { type: 'object' },
      description: 'Optional nested scene nodes.',
    },
    metadata: { type: 'object' },
  },
  required: ['id'],
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
    viewId: {
      type: 'string',
      description:
        'Stable id of an exact perspective or orthographic view declared in document.authoring.views.',
    },
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
    projection: {
      type: 'string',
      enum: ['perspective', 'orthographic'],
      description:
        'Projection for an explicit camera pose. Named built-in views are perspective; saved viewId projections come from the document.',
    },
    orthographicHeight: {
      type: 'number',
      exclusiveMinimum: 0,
      description:
        'Vertical world-space span for an explicit orthographic camera. Kept distinct from screenshot pixel height.',
    },
  },
};

const SCENE_HASH_SCHEMA: JsonSchema = {
  type: 'string',
  pattern: '^sha256:[0-9a-f]{64}$',
  description: 'Canonical sha256:<64 lowercase hex> content hash.',
};

const SCENE_DOCUMENT_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  description:
    'Complete closed iwsdk.scene.v1 document. Validate against the exported normative scene schema before sending.',
};

const SCENE_REVIEW_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'Complete closed iwsdk.scene-review.v1 record. Server validation binds hashes, capabilities, required views, lenses, criteria, correction lineage, and persisted capture evidence to the active scene. Waivers are representable but cannot be persisted without a trusted user-approval artifact.',
  required: [
    'version',
    'documentHash',
    'runtimeHash',
    'capabilityHash',
    'sourceHashes',
    'round',
    'result',
    'lenses',
    'featureResults',
    'waivers',
    'stop',
  ],
  properties: {
    version: { type: 'string', enum: ['iwsdk.scene-review.v1'] },
    documentHash: SCENE_HASH_SCHEMA,
    runtimeHash: SCENE_HASH_SCHEMA,
    capabilityHash: SCENE_HASH_SCHEMA,
    sourceHashes: { type: 'array', items: SCENE_HASH_SCHEMA },
    round: { type: 'integer', minimum: 0, maximum: 10 },
    previousReview: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        reviewSha256: SCENE_HASH_SCHEMA,
      },
      required: ['path', 'reviewSha256'],
    },
    correction: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string' },
        correctionSha256: SCENE_HASH_SCHEMA,
      },
      required: ['path', 'correctionSha256'],
    },
    result: {
      type: 'string',
      enum: ['pass', 'accepted-with-gaps', 'fail'],
    },
    lenses: { type: 'array', items: { type: 'object' } },
    featureResults: { type: 'array', items: { type: 'object' } },
    waivers: { type: 'array', items: { type: 'object' } },
    stop: { type: 'object' },
  },
};

const SCENE_REVIEW_CAMERA_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projection: {
      type: 'string',
      enum: ['perspective', 'orthographic'],
    },
    position: VECTOR3_SCHEMA,
    target: VECTOR3_SCHEMA,
    fov: { type: 'number', exclusiveMinimum: 0 },
    height: { type: 'number', exclusiveMinimum: 0 },
  },
  required: ['projection', 'position', 'target'],
};

const SCENE_BATCH_REVIEW_CAPTURE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'One compact persisted capture entry returned by scene_capture_review_set.',
  properties: {
    lens: {
      type: 'string',
      enum: ['layout', 'geometry', 'final'],
    },
    id: { type: 'string' },
    view: { type: 'string' },
    path: { type: 'string' },
    screenshotSha256: SCENE_HASH_SCHEMA,
    width: { type: 'integer', minimum: 1, maximum: 4096 },
    height: { type: 'integer', minimum: 1, maximum: 4096 },
    camera: SCENE_REVIEW_CAMERA_INPUT_SCHEMA,
    rendererEnvironment: { type: 'object' },
    visibleNodeIds: { type: 'array', items: { type: 'string' } },
    nodeMaskRegions: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'number' },
        minItems: 4,
        maxItems: 4,
      },
    },
  },
  required: [
    'lens',
    'id',
    'view',
    'path',
    'screenshotSha256',
    'width',
    'height',
    'camera',
    'rendererEnvironment',
    'visibleNodeIds',
  ],
};

const SCENE_REVIEW_EVIDENCE_LINK_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: {
      type: 'string',
      description: 'Exact workspace-relative immutable artifact path.',
    },
    sha256: SCENE_HASH_SCHEMA,
  },
  required: ['path', 'sha256'],
};

const SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'Exact declared criterion text, or exact part/contact id, from objectInspection.',
    },
    status: { type: 'string', enum: ['pass', 'fail'] },
    evidenceRefs: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
      description: 'Capture ids from the supplied persisted capture set.',
    },
    observation: {
      type: 'string',
      pattern: '\\S',
      description:
        'Concrete visual observation explaining the status against the declared criterion.',
    },
  },
  required: ['id', 'status', 'evidenceRefs', 'observation'],
};

const ALL_RUNTIME_MCP_TOOLS: McpToolDefinition[] = [
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
      'Capture the managed application runtime. If the workspace editor is visible, switches to the runtime before capturing.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
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
      'Get explicit managed-workspace status for the browser bridge, editor command/viewport readiness, application runtime frame, IWER availability, observable XR session state, selected scene path, scene session id, and dirty state.',
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
          enum: ['runtime', 'editor'],
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
    name: 'scene_render_file',
    description:
      'Validate, compose, and render an IWSDK scene JSON file without opening it in the live editor. Invalid files return structured diagnostics and no PNG; valid files return hashes, render metadata, and PNG image data.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description:
            'Existing scene file path under public/scenes, ending in .iwsdk.scene.json',
        },
        view: {
          ...SCENE_CAMERA_VIEW_SCHEMA,
        },
        viewId: {
          type: 'string',
          description:
            'Stable id of an exact camera declared in document.authoring.views. Use this, not view, for names such as "hero".',
        },
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
      },
      required: ['path'],
    },
  },
  {
    name: 'scene_flatten_file',
    description:
      'Resolve an authoring-only imported scene into one editable, runtime-loadable scene file. The write is refused unless runtime semantics are unchanged.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Import-bearing source scene path under public/scenes',
        },
        outputPath: {
          type: 'string',
          description:
            'Flat destination under public/scenes. Defaults to <source>.flat.iwsdk.scene.json.',
        },
        overwrite: {
          type: 'boolean',
          description:
            'Allow replacing an existing destination, including an explicit in-place flatten.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'scene_get_state',
    description:
      'Get the active scene file, selection, source/composed/runtime hashes, validation diagnostics, dirty or conflict state, runtime readiness, and current render statistics.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
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
    name: 'scene_get_capabilities',
    description:
      'Get a compact canonical hash-bound editor capability summary. Pass full:true only when the complete component schemas and compatibility payload are needed.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        full: {
          type: 'boolean',
          description:
            'Include complete registered component schemas. Defaults to false.',
        },
      },
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
    name: 'scene_search_project_assets',
    description:
      'Search static .gltf and .glb model files available under the current workspace public directory. This is a project-local provider and is distinct from scene_list_assets.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description:
            'Optional case-insensitive filter over suggested id, name, URI, and workspace path.',
        },
      },
    },
  },
  {
    name: 'scene_import_project_asset',
    description:
      'Import one URI returned by scene_search_project_assets into the current scene resources through a hash-checked, preflighted transaction. The import is one undo entry and rejects unknown project paths, duplicate URIs, and id collisions.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        uri: {
          type: 'string',
          description:
            'Exact project URI returned by scene_search_project_assets.',
        },
        id: {
          type: 'string',
          description:
            'Optional scene asset id. Defaults to the provider suggested id.',
        },
        name: {
          type: 'string',
          description:
            'Optional display name. Defaults to the project filename without its extension.',
        },
        bounds: {
          type: 'object',
          additionalProperties: false,
          description: 'Optional model-space bounds in meters.',
          properties: {
            min: VECTOR3_SCHEMA,
            max: VECTOR3_SCHEMA,
          },
          required: ['min', 'max'],
        },
      },
      required: ['uri'],
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
    description:
      'Add a group, asset, instance, pattern, light, or component-bearing node to the native scene JSON document. Procedural geometry must first be declared as an asset.',
    inputSchema: {
      type: 'object',
      properties: {
        node: {
          ...SCENE_NODE_SCHEMA,
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
    description: 'Replace the transform for a native scene node.',
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
    name: 'scene_set_framing_role',
    description:
      'Set a native scene node camera-framing role to content or support as one undoable patch. Use scene_apply_transaction for hash-checked review corrections.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        nodeId: { type: 'string', description: 'Scene node id' },
        framingRole: {
          type: 'string',
          enum: ['content', 'support'],
          description:
            'content participates in automatic framing; support remains rendered but is excluded.',
        },
      },
      required: ['nodeId', 'framingRole'],
    },
  },
  {
    name: 'scene_apply_patch',
    description:
      'Apply one native scene JSON patch operation with undo support. Replacement and transactions must use their dedicated hash-checked tools.',
    inputSchema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description:
            'ScenePatch operation such as addNode/removeNode, updateContent/updateConstraints, setEnvironment/setAuthoring, add/update/remove Asset, Material, Prefab, or AuthoringView. Resource references are validated on the resulting document.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'scene_apply_transaction',
    description:
      'Stage ordered scene patches, validate and preflight the complete candidate, then commit them atomically as one undo entry. Any failure leaves the live document unchanged.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        patches: {
          type: 'array',
          items: { type: 'object' },
          minItems: 1,
          description:
            'Ordered scene patches. Supports node, asset, material, prefab, environment, authoring, and authoring-view operations.',
        },
        expectedBaseDocumentHash: {
          oneOf: [SCENE_HASH_SCHEMA, { type: 'null' }],
          description:
            'Required optimistic-concurrency hash. Null is accepted only for a blank new scene.',
        },
        candidateDocumentHash: {
          ...SCENE_HASH_SCHEMA,
          description:
            'Optional caller-computed integrity assertion. When omitted, the editor computes and returns the canonical candidate hash.',
        },
        correction: {
          type: 'object',
          additionalProperties: false,
          description:
            'Required only after scene_begin_review freezes the draft. Binds one correction to the exact current immutable review and defect.',
          properties: {
            kind: {
              type: 'string',
              enum: ['scene', 'resource', 'camera', 'contract'],
            },
            defectTags: {
              type: 'array',
              minItems: 1,
              items: { type: 'string' },
            },
            reason: { type: 'string' },
            previousReview: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string' },
                reviewSha256: SCENE_HASH_SCHEMA,
              },
              required: ['path', 'reviewSha256'],
            },
          },
          required: ['kind', 'defectTags', 'previousReview'],
        },
        ownershipMode: {
          type: 'string',
          enum: ['replace-new'],
          description:
            'Materialization ownership. merge-under-root is not yet supported.',
        },
      },
      required: ['patches', 'expectedBaseDocumentHash'],
    },
  },
  {
    name: 'scene_replace_document',
    description:
      'Atomically replace the complete editor document after the required base-hash concurrency check, any optional candidate-hash integrity assertion, validation, detached resource/runtime preflight, and commit. Creates one undo entry.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        document: SCENE_DOCUMENT_INPUT_SCHEMA,
        expectedBaseDocumentHash: {
          oneOf: [SCENE_HASH_SCHEMA, { type: 'null' }],
          description:
            'Required optimistic-concurrency hash. Null is accepted only for a blank new scene.',
        },
        candidateDocumentHash: {
          ...SCENE_HASH_SCHEMA,
          description:
            'Optional caller-computed integrity assertion. When omitted, the editor computes and returns the canonical document hash.',
        },
        ownershipMode: {
          type: 'string',
          enum: ['replace-new'],
        },
      },
      required: ['document', 'expectedBaseDocumentHash'],
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
    name: 'scene_set_preview_visibility',
    description:
      'Change editor-only preview visibility without modifying or saving the scene document. Supports recursive hide/show, ghosting, locking, context, solo, reset, and named local arrangements.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          type: 'string',
          enum: [
            'apply-arrangement',
            'context',
            'ghost',
            'hide',
            'lock',
            'reset',
            'save-arrangement',
            'show',
            'solo',
            'uncontext',
            'unghost',
            'unlock',
          ],
        },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Scene node ids affected by the preview operation. Solo accepts at most one.',
        },
        recursive: {
          type: 'boolean',
          description:
            'Apply the operation to descendants. Defaults to true for hierarchy visibility operations.',
        },
        name: {
          type: 'string',
          description:
            'Arrangement name for save-arrangement or apply-arrangement.',
        },
      },
      required: ['mode'],
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
      'Set the native scene editor camera to a built-in view, exact saved authoring viewId, or explicit perspective/orthographic pose.',
    inputSchema: {
      type: 'object',
      properties: SCENE_CAMERA_SCHEMA.properties,
    },
  },
  {
    name: 'scene_screenshot',
    description:
      'Capture a native scene editor screenshot. Supports exact saved authoring viewId cameras, current/top/front/back/left/right/quarter/orbit views, and explicit perspective/orthographic poses.',
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
        captureMode: {
          type: 'string',
          enum: ['render', 'editor'],
          description:
            'render (default) excludes editor-only grid, selection, transform, component-helper, and orientation overlays; editor includes them for UI diagnostics.',
        },
      },
    },
  },
  {
    name: 'ui_list_assets',
    description:
      'List UIKitML assets available in the project asset manifest. Use a returned asset id with ui_render_preview or a PanelUI component config.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description:
            'Optional case-insensitive filter over UIKitML asset ids and names.',
        },
      },
    },
  },
  {
    name: 'ui_render_preview',
    description:
      'Render one UIKitML asset from the project asset manifest in isolation against a plain background. Use this to inspect panel layout without the surrounding scene.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        assetId: {
          type: 'string',
          description:
            'Manifest id of an AssetType.UIKitML entry. Discover ids with ui_list_assets.',
        },
        width: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Preview width in pixels. Defaults to 512.',
        },
        height: {
          type: 'number',
          minimum: 1,
          maximum: 4096,
          description: 'Preview height in pixels. Defaults to 512.',
        },
        background: {
          type: 'string',
          description:
            'Three.js-compatible background color. Defaults to #202226.',
        },
      },
      required: ['assetId'],
    },
  },
  {
    name: 'scene_compare_screenshots',
    description:
      'Capture two native scene editor screenshots and report byte identity. This is not a perceptual image comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'object',
          description:
            'First camera request. Accepts the same fields as scene_screenshot.',
          properties: {
            ...SCENE_CAMERA_SCHEMA.properties,
            captureMode: {
              type: 'string',
              enum: ['render', 'editor'],
              description:
                'render excludes editor-only overlays; editor includes them.',
            },
          },
        },
        second: {
          type: 'object',
          description:
            'Second camera request. Accepts the same fields as scene_screenshot.',
          properties: {
            ...SCENE_CAMERA_SCHEMA.properties,
            captureMode: {
              type: 'string',
              enum: ['render', 'editor'],
              description:
                'render excludes editor-only overlays; editor includes them.',
            },
          },
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
  {
    name: 'scene_begin_review',
    description:
      'Freeze the current saved draft scene as formal review round 0. After this one-way boundary, every scene or camera change requires an adjacent immutable review and authorized correction.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenePath: {
          type: 'string',
          description:
            'Scene file path under public/scenes, ending in .iwsdk.scene.json.',
        },
        expectedDocumentHash: {
          ...SCENE_HASH_SCHEMA,
          description:
            'Canonical hash returned by scene_save for the exact draft to freeze.',
        },
        runtimePreflightReceipt: {
          ...SCENE_REVIEW_EVIDENCE_LINK_SCHEMA,
          description:
            'Exact current passing receipt returned by scene_runtime_preflight.receipt.',
        },
      },
      required: [
        'scenePath',
        'expectedDocumentHash',
        'runtimePreflightReceipt',
      ],
    },
  },
  {
    name: 'scene_set_review_lens',
    description:
      'Set the editor-only layout, geometry, or final review lens without changing the scene document.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lens: {
          type: 'string',
          enum: ['layout', 'geometry', 'final'],
        },
      },
      required: ['lens'],
    },
  },
  {
    name: 'scene_capture_review',
    description:
      'Capture review evidence bound to document/runtime/capability hashes, exact normalized reviewCamera and resolution, active lens, logs, feature state, visibility metadata, and measured renderer statistics. The server registers the PNG internally; the response omits base64 imageData unless includeImageData:true is explicitly requested.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...SCENE_CAMERA_SCHEMA.properties,
        width: {
          type: 'integer',
          minimum: 1,
          maximum: 4096,
        },
        height: {
          type: 'integer',
          minimum: 1,
          maximum: 4096,
        },
        featureState: {
          type: 'object',
          description:
            'Caller-provided feature-state metadata recorded with the capture.',
        },
        includeImageData: {
          type: 'boolean',
          description:
            'Return the full base64 PNG in imageData. Defaults to false because captureToken is sufficient for persistence.',
        },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'scene_persist_review_capture',
    description:
      'Persist a server-issued, session-bound capture returned by scene_capture_review under the active scene review directory. The server resolves captureToken to its registered PNG bytes and trusted capture facts, then writes immutable PNG plus metadata; an exact repeat is idempotent and capture fields cannot be relabeled.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        captureId: {
          type: 'string',
          pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$',
          description: 'Stable evidence id used in the review capture entry.',
        },
        captureToken: {
          ...SCENE_HASH_SCHEMA,
          description:
            'Session-bound token returned by scene_capture_review.captureToken.',
        },
      },
      required: ['captureId', 'captureToken'],
    },
  },
  {
    name: 'scene_measure_image_regions',
    description:
      'Measure aligned declared-reference and render-capture regions using linear-sRGB luma percentiles, mean OKLab color, and highlight/shadow footprints. Returns raw diagnostics and deltas, never a universal similarity pass.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        captureToken: {
          ...SCENE_HASH_SCHEMA,
          description: 'Trusted token returned by scene_capture_review.',
        },
        referenceId: {
          type: 'string',
          description:
            'ID of a hash-bound reference declared in authoring.composition.input.references.',
        },
        regions: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              referenceRegion: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: { type: 'number', minimum: 0, maximum: 1 },
                description: 'Normalized [x, y, width, height].',
              },
              renderRegion: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: { type: 'number', minimum: 0, maximum: 1 },
                description:
                  'Aligned normalized render region. Defaults to referenceRegion.',
              },
            },
            required: ['id', 'referenceRegion'],
          },
        },
      },
      required: ['captureToken', 'referenceId', 'regions'],
    },
  },
  {
    name: 'scene_capture_review_set',
    description:
      'Capture and immutably persist a complete requested set of saved authoring views across review lenses in one call. Lens switching is automatic, PNG bytes stay server-side, and the response contains only compact schema-ready capture metadata for scene_finalize_review.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: {
          type: 'integer',
          minimum: 1,
          maximum: 4096,
          description: 'Default capture width for the set.',
        },
        height: {
          type: 'integer',
          minimum: 1,
          maximum: 4096,
          description: 'Default capture height for the set.',
        },
        captures: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$',
              },
              lens: {
                type: 'string',
                enum: ['layout', 'geometry', 'final'],
              },
              viewId: {
                type: 'string',
                description:
                  'Exact id from document.authoring.views; arbitrary built-in cameras are not accepted as immutable review evidence.',
              },
              width: { type: 'integer', minimum: 1, maximum: 4096 },
              height: { type: 'integer', minimum: 1, maximum: 4096 },
              featureState: { type: 'object' },
            },
            required: ['id', 'lens', 'viewId'],
          },
        },
      },
      required: ['width', 'height', 'captures'],
    },
  },
  {
    name: 'scene_record_object_inspection',
    description:
      'Record immutable server-issued inspection evidence for one identity-critical feature. Every required view needs geometry and final captures with the complete subject and declared context visible; form criteria must cite geometry evidence and material response must cite final evidence. Validates persisted capture provenance and complete silhouette, proportions, parts, negative-space, contacts, and material-response coverage. The server derives pass/fail and binds the artifact to current document, runtime, and capability hashes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenePath: {
          type: 'string',
          description:
            'Scene file path under public/scenes, ending in .iwsdk.scene.json.',
        },
        expectedDocumentHash: SCENE_HASH_SCHEMA,
        capabilityHash: SCENE_HASH_SCHEMA,
        featureId: {
          type: 'string',
          description:
            'Exact id of an identityCritical feature with objectInspection.',
        },
        captures: {
          type: 'array',
          minItems: 1,
          maxItems: 32,
          items: SCENE_BATCH_REVIEW_CAPTURE_SCHEMA,
        },
        results: {
          type: 'object',
          additionalProperties: false,
          properties: {
            silhouette: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
            proportions: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
            parts: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
            negativeSpace: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
            contacts: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
            materialResponse: {
              type: 'array',
              items: SCENE_OBJECT_INSPECTION_ASSESSMENT_SCHEMA,
            },
          },
          required: [
            'silhouette',
            'proportions',
            'parts',
            'negativeSpace',
            'contacts',
            'materialResponse',
          ],
        },
      },
      required: [
        'scenePath',
        'expectedDocumentHash',
        'capabilityHash',
        'featureId',
        'captures',
        'results',
      ],
    },
  },
  {
    name: 'scene_finalize_review',
    description:
      'Finalize and immutably save a review from batch capture metadata plus human lens and visual judgments. The SDK fills revision/source hashes, evaluates every deterministic criterion, derives the overall result, validates exact evidence, and routes failures to continue-refining; callers cannot guess deterministic statuses or force a passing result.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        round: { type: 'integer', minimum: 0, maximum: 10 },
        captures: {
          type: 'array',
          minItems: 1,
          items: SCENE_BATCH_REVIEW_CAPTURE_SCHEMA,
        },
        lensResults: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              lens: {
                type: 'string',
                enum: ['layout', 'geometry', 'final'],
              },
              status: {
                type: 'string',
                enum: ['pass', 'partial', 'fail', 'not-applicable'],
              },
            },
            required: ['lens', 'status'],
          },
        },
        visualResults: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              feature: { type: 'string' },
              criterion: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pass', 'partial', 'fail', 'not-applicable'],
              },
              evidenceRefs: {
                type: 'array',
                items: { type: 'string' },
              },
              observation: { type: 'string' },
            },
            required: ['feature', 'criterion', 'status', 'observation'],
          },
        },
        previousReview: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string' },
            reviewSha256: SCENE_HASH_SCHEMA,
          },
          required: ['path', 'reviewSha256'],
        },
        correction: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string' },
            correctionSha256: SCENE_HASH_SCHEMA,
          },
          required: ['path', 'correctionSha256'],
        },
        openDefectTags: { type: 'array', items: { type: 'string' } },
        stopReason: {
          type: 'string',
          enum: [
            'continue-refining',
            'round-limit',
            'repeated-defect',
            'oscillation',
            'plateau',
            'missing-input',
            'representation-gap',
          ],
        },
      },
      required: ['round', 'captures', 'lensResults'],
    },
  },
  {
    name: 'scene_save_review',
    description:
      'Validate and immutably persist one complete iwsdk.scene-review.v1 record against the active scene document, capability hash, required review contract, persisted PNG evidence, and adjacent immutable correction lineage. Round 0 is initial; every higher round must link by exact path and SHA-256 to round-1. Exact repeats are idempotent. Waivers are refused until a trusted user-approval artifact exists.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { review: SCENE_REVIEW_INPUT_SCHEMA },
      required: ['review'],
    },
  },
  {
    name: 'scene_list_reviews',
    description:
      'List validated review record summaries for the active scene. The current flag requires matching document, runtime, capability, schema, and persisted evidence integrity.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: 'scene_get_review',
    description:
      'Get one complete immutable review record for the active scene by an exact workspace-relative path returned by scene_list_reviews.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description:
            'Exact workspace-relative review path returned by scene_list_reviews.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'scene_runtime_preflight',
    description:
      'Before formal review, reload and compare the selected editor scene with the live app runtime, then persist a content-addressed receipt required by scene_begin_review. Separately reports scene binding, camera/framing presentation, warnings, structural counts, and host-browser frame diagnostics. The default response is compact; host measurements are never presented as calibrated Quest performance.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        warmupFrames: {
          type: 'integer',
          minimum: 0,
          maximum: 600,
          description: 'Frames excluded before measurement. Defaults to 10.',
        },
        sampleFrames: {
          type: 'integer',
          minimum: 1,
          maximum: 600,
          description: 'Measured host-browser frames. Defaults to 60.',
        },
        detail: {
          type: 'string',
          enum: ['compact', 'full'],
          description:
            'Compact response by default; full returns the complete persisted report inline.',
        },
      },
    },
  },
  {
    name: 'scene_publish',
    description:
      'Publish the active saved scene against one exact current immutable passing review. Reloads the live app runtime, proves document/runtime hash parity, representative node content, resources, transforms and components, a nonblank canvas, and a clean scene/shader/WebGL/material log window, then persists an immutable runtime-proof report. Refuses dirty, stale, mismatched, waived, or unproven scenes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reviewPath: {
          type: 'string',
          description:
            'Exact current immutable review path returned by scene_list_reviews.',
        },
        representativeNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional additional authored node ids whose live content, resources, transforms, and components must match. Required review feature nodeRefs are always included.',
        },
        detail: {
          type: 'string',
          enum: ['compact', 'full'],
          description:
            'Compact returns status, hashes, failed checks, warnings, and artifact path. Full also returns the complete persisted proof inline.',
        },
      },
      required: ['reviewPath'],
    },
  },
  {
    name: 'scene_get_render_stats',
    description:
      'Get measured scene structure (world bounds, object/node/mesh/geometry/material counts and visible node ids) plus raw renderer calls, triangles, points, lines, textures, programs, shadow casters, frame-time samples, and renderer environment. Returns available:false when no measurement bridge is installed.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // =============================================================================
  // Framework-Specific Tools (IWSDK or any framework with FRAMEWORK_MCP_RUNTIME)
  // =============================================================================
  {
    name: 'scene_get_runtime_hierarchy',
    description:
      'Get the live Three.js Object3D hierarchy from the app runtime, including names, UUIDs, object types, native scene node ids, asset ids, primitive descriptors, and ECS entity indices. Use scene_get_hierarchy for the native scene document in the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: {
          type: 'string',
          description:
            'Object3D UUID to start from. Defaults to the runtime scene root if omitted.',
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
    name: 'scene_get_object_transform',
    description:
      'Get local and global transforms of an Object3D by Object3D UUID or native scene node id. Includes positionRelativeToXROrigin which can be used directly with xr_look_at tool. Requires IWSDK or a framework that provides FRAMEWORK_MCP_RUNTIME.',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description:
            'UUID of the Object3D (get this from scene_get_runtime_hierarchy, not the native editor scene hierarchy)',
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

export const SCENE_MCP_TOOL_NAMES = [
  'scene_open',
  'scene_render_file',
  'scene_flatten_file',
  'scene_get_state',
  'scene_get_capabilities',
  'scene_screenshot',
  'scene_select',
  'scene_set_camera',
  'scene_set_preview_visibility',
  'scene_measure_image_regions',
] as const;

export const APP_RUNTIME_SCENE_MCP_TOOL_NAMES = [
  'scene_get_render_stats',
  'scene_get_runtime_hierarchy',
  'scene_get_object_transform',
] as const;

const PUBLIC_SCENE_MCP_TOOL_NAME_SET = new Set<string>([
  ...SCENE_MCP_TOOL_NAMES,
  ...APP_RUNTIME_SCENE_MCP_TOOL_NAMES,
]);
const REMOVED_WORKSPACE_MCP_TOOL_NAME_SET = new Set([
  'workspace_get_state',
  'workspace_set_view',
  'workspace_open_scene',
]);

const EXPECTED_TAB_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'Optional stale-state precondition. Pass the _tab object from an earlier result; the call fails if that browser tab has reloaded or changed.',
  properties: {
    id: { type: 'string', description: 'Browser tab id from result._tab.id' },
    generation: {
      type: 'number',
      minimum: 1,
      description: 'Browser tab generation from result._tab.generation',
    },
  },
  required: ['id', 'generation'],
};

function withExpectedTabPrecondition(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    properties: {
      ...(schema.properties ?? {}),
      expectedTab: EXPECTED_TAB_SCHEMA,
    },
  };
}

export const RUNTIME_MCP_TOOLS: McpToolDefinition[] =
  ALL_RUNTIME_MCP_TOOLS.filter(
    (tool) =>
      (!tool.name.startsWith('scene_') ||
        PUBLIC_SCENE_MCP_TOOL_NAME_SET.has(tool.name)) &&
      !REMOVED_WORKSPACE_MCP_TOOL_NAME_SET.has(tool.name),
  ).map((tool) => ({
    ...tool,
    inputSchema: withExpectedTabPrecondition(tool.inputSchema),
  }));

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
  scene_get_render_stats: 'get_render_stats',
  scene_get_runtime_hierarchy: 'get_scene_hierarchy',
  scene_get_object_transform: 'get_object_transform',
};

const ALL_RUNTIME_CLI_PATHS: Record<string, string[]> = {
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
  scene_render_file: ['scene', 'render-file'],
  scene_flatten_file: ['scene', 'flatten'],
  scene_get_state: ['scene', 'state'],
  scene_create: ['scene', 'create'],
  scene_get_capabilities: ['scene', 'capabilities'],
  scene_set_preview_visibility: ['scene', 'set-preview-visibility'],
  scene_list_assets: ['scene', 'assets'],
  scene_search_project_assets: ['scene', 'search-project-assets'],
  scene_import_project_asset: ['scene', 'import-project-asset'],
  scene_list_component_schemas: ['scene', 'component-schemas'],
  scene_get_document: ['scene', 'document'],
  scene_get_hierarchy: ['scene', 'hierarchy'],
  scene_get_selection: ['scene', 'selection'],
  scene_select: ['scene', 'select'],
  scene_add_node: ['scene', 'add-node'],
  scene_remove_node: ['scene', 'remove-node'],
  scene_duplicate_node: ['scene', 'duplicate-node'],
  scene_set_transform: ['scene', 'set-transform'],
  scene_set_framing_role: ['scene', 'set-framing-role'],
  scene_apply_patch: ['scene', 'apply-patch'],
  scene_apply_transaction: ['scene', 'apply-transaction'],
  scene_replace_document: ['scene', 'replace-document'],
  scene_look_at: ['scene', 'look-at'],
  scene_validate: ['scene', 'validate'],
  scene_save: ['scene', 'save'],
  scene_undo: ['scene', 'undo'],
  scene_redo: ['scene', 'redo'],
  scene_get_logs: ['scene', 'logs'],
  scene_set_camera: ['scene', 'set-camera'],
  scene_screenshot: ['scene', 'screenshot'],
  ui_list_assets: ['ui', 'assets'],
  ui_render_preview: ['ui', 'render-preview'],
  scene_compare_screenshots: ['scene', 'compare-screenshots'],
  scene_begin_review: ['scene', 'begin-review'],
  scene_set_review_lens: ['scene', 'set-review-lens'],
  scene_capture_review: ['scene', 'capture-review'],
  scene_measure_image_regions: ['scene', 'measure-image-regions'],
  scene_persist_review_capture: ['scene', 'persist-review-capture'],
  scene_capture_review_set: ['scene', 'capture-review-set'],
  scene_record_object_inspection: ['scene', 'record-object-inspection'],
  scene_finalize_review: ['scene', 'finalize-review'],
  scene_save_review: ['scene', 'save-review'],
  scene_list_reviews: ['scene', 'reviews'],
  scene_get_review: ['scene', 'review'],
  scene_runtime_preflight: ['scene', 'runtime-preflight'],
  scene_publish: ['scene', 'publish'],
  scene_get_render_stats: ['scene', 'render-stats'],
  scene_get_runtime_hierarchy: ['scene', 'runtime-hierarchy'],
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

const RUNTIME_MCP_TOOL_NAME_SET = new Set(
  RUNTIME_MCP_TOOLS.map((tool) => tool.name),
);

export const RUNTIME_CLI_PATHS: Record<string, string[]> = Object.fromEntries(
  Object.entries(ALL_RUNTIME_CLI_PATHS).filter(([name]) =>
    RUNTIME_MCP_TOOL_NAME_SET.has(name),
  ),
);

export const SCENE_EDITOR_MCP_TOOL_NAMES = [
  'scene_get_capabilities',
  'scene_get_state',
  'scene_select',
  'scene_set_camera',
  'scene_screenshot',
  'scene_set_preview_visibility',
  'scene_measure_image_regions',
  'ui_list_assets',
  'ui_render_preview',
] as const;

export const SCENE_FILE_MCP_TOOL_NAMES = [
  'scene_open',
  'scene_render_file',
  'scene_flatten_file',
] as const;

export const PROJECT_ASSET_MCP_TOOL_NAMES = [] as const;

export const REVIEW_EVIDENCE_MCP_TOOL_NAMES = [] as const;

export const WORKSPACE_MCP_TOOL_NAMES = [] as const;

const EDITOR_TARGET_MCP_TOOL_NAME_SET = new Set<string>([
  ...SCENE_EDITOR_MCP_TOOL_NAMES,
  ...SCENE_FILE_MCP_TOOL_NAMES,
  ...PROJECT_ASSET_MCP_TOOL_NAMES,
  ...REVIEW_EVIDENCE_MCP_TOOL_NAMES,
  ...WORKSPACE_MCP_TOOL_NAMES,
]);

const APP_TARGET_MCP_TOOL_NAME_SET = new Set<string>(['browser_screenshot']);

export const RUNTIME_OPERATIONS: RuntimeOperationDefinition[] =
  RUNTIME_MCP_TOOLS.map((tool) => {
    const cliPath = RUNTIME_CLI_PATHS[tool.name];
    const target = EDITOR_TARGET_MCP_TOOL_NAME_SET.has(tool.name)
      ? ({ role: 'editor' } as const)
      : APP_TARGET_MCP_TOOL_NAME_SET.has(tool.name)
        ? ({ role: 'app' } as const)
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
  const required = operation.inputSchema.required ?? [];
  if (required.length > 0) {
    if (!isRecord(params)) {
      throw new Error(
        `${operation.mcpName} requires an object with parameter${required.length === 1 ? '' : 's'}: ${required.join(', ')}`,
      );
    }

    const missing = required.filter(
      (name) => !Object.prototype.hasOwnProperty.call(params, name),
    );
    if (missing.length > 0) {
      throw new Error(
        `${operation.mcpName} requires parameter${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
      );
    }
  }

  const paramsRecord = isRecord(params) ? params : null;
  const expectedTab = paramsRecord?.expectedTab;
  if (
    expectedTab !== undefined &&
    (!isRecord(expectedTab) ||
      typeof expectedTab.id !== 'string' ||
      !Number.isInteger(expectedTab.generation) ||
      (expectedTab.generation as number) < 1)
  ) {
    throw new Error(
      `${operation.mcpName}.expectedTab requires the { id, generation } object returned as result._tab`,
    );
  }

  if (
    operation.mcpName === 'browser_screenshot' &&
    paramsRecord != null &&
    Object.keys(paramsRecord).some((key) => key !== 'expectedTab')
  ) {
    throw new Error(
      'browser_screenshot does not accept parameters; it always captures the application runtime',
    );
  }
  assertSchemaValue(params, operation.inputSchema, operation.mcpName);
  const commandParams =
    paramsRecord == null
      ? params
      : Object.fromEntries(
          Object.entries(paramsRecord).filter(([key]) => key !== 'expectedTab'),
        );
  const target =
    isRecord(expectedTab) &&
    typeof expectedTab.id === 'string' &&
    typeof expectedTab.generation === 'number'
      ? {
          ...(operation.target ?? {}),
          pageId: expectedTab.id,
          tabGeneration: expectedTab.generation,
        }
      : operation.target;
  return { params: commandParams, target };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
