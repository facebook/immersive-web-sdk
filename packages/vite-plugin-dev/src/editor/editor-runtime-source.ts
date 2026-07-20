/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export function getEditorSessionModuleImport(): string {
  const candidates = [
    './scene-editor-session.js',
    './editor/scene-editor-session.js',
    './scene-editor-session.ts',
    './editor/scene-editor-session.ts',
  ];
  for (const candidate of candidates) {
    const modulePath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(modulePath)) {
      return `/@fs/${modulePath}`;
    }
  }

  return `/@fs/${fileURLToPath(
    new URL('./scene-editor-session.ts', import.meta.url),
  )}`;
}

export function getCoreModuleImport(): string {
  const candidates = ['../../../core/src/index.ts', '../../core/src/index.ts'];
  for (const candidate of candidates) {
    const sourceModulePath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(sourceModulePath)) {
      return `/@fs/${sourceModulePath}`;
    }
  }

  return '@iwsdk/core';
}

export function getOrbitControlsModuleImport(): string {
  const candidates = [
    '../../../core/node_modules/three/examples/jsm/controls/OrbitControls.js',
    '../../core/node_modules/three/examples/jsm/controls/OrbitControls.js',
  ];
  for (const candidate of candidates) {
    const sourceModulePath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(sourceModulePath)) {
      return `/@fs/${sourceModulePath}`;
    }
  }

  return 'three/examples/jsm/controls/OrbitControls.js';
}

export function getTransformControlsModuleImport(): string {
  const candidates = [
    '../../../core/node_modules/three/examples/jsm/controls/TransformControls.js',
    '../../core/node_modules/three/examples/jsm/controls/TransformControls.js',
  ];
  for (const candidate of candidates) {
    const sourceModulePath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(sourceModulePath)) {
      return `/@fs/${sourceModulePath}`;
    }
  }

  return 'three/examples/jsm/controls/TransformControls.js';
}

export function getViewportGizmoModuleImport(): string {
  const candidates = [
    '../node_modules/three-viewport-gizmo/dist/three-viewport-gizmo.js',
    '../../node_modules/three-viewport-gizmo/dist/three-viewport-gizmo.js',
  ];
  for (const candidate of candidates) {
    const sourceModulePath = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(sourceModulePath)) {
      return `/@fs/${sourceModulePath}`;
    }
  }

  return 'three-viewport-gizmo';
}

const LUCIDE_DEFAULT_ATTRIBUTES = {
  fill: 'none',
  height: 24,
  stroke: 'currentColor',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'stroke-width': 2,
  viewBox: '0 0 24 24',
  width: 24,
  xmlns: 'http://www.w3.org/2000/svg',
};

const LUCIDE_ICON_NODES = {
  ArrowDownToLine: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M12 17V3' }],
      ['path', { d: 'm6 11 6 6 6-6' }],
      ['path', { d: 'M19 21H5' }],
    ],
  ],
  Box: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
        },
      ],
      ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
      ['path', { d: 'M12 22V12' }],
    ],
  ],
  CheckCheck: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M18 6 7 17l-5-5' }],
      ['path', { d: 'm22 10-7.5 7.5L13 16' }],
    ],
  ],
  Boxes: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0z',
        },
      ],
      ['path', { d: 'M7 17v5' }],
      ['path', { d: 'M11.7 14.2 7 17l-4.7-2.8' }],
      [
        'path',
        {
          d: 'M12.97 3.92A2 2 0 0 0 12 5.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71V5.63a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0z',
        },
      ],
      ['path', { d: 'M17 8v5' }],
      ['path', { d: 'm21.7 5.2-4.7 2.8-4.7-2.8' }],
    ],
  ],
  Check: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [['path', { d: 'M20 6 9 17l-5-5' }]],
  ],
  ChevronDown: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [['path', { d: 'm6 9 6 6 6-6' }]],
  ],
  ChevronRight: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [['path', { d: 'm9 18 6-6-6-6' }]],
  ],
  Eye: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
        },
      ],
      ['circle', { cx: '12', cy: '12', r: '3' }],
    ],
  ],
  Globe2: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M21.54 15H17a2 2 0 0 0-2 2v4.54' }],
      [
        'path',
        {
          d: 'M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17',
        },
      ],
      [
        'path',
        { d: 'M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05' },
      ],
      ['circle', { cx: '12', cy: '12', r: '10' }],
    ],
  ],
  Magnet: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'm6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15',
        },
      ],
      ['path', { d: 'm5 8 4 4' }],
      ['path', { d: 'm12 15 4 4' }],
    ],
  ],
  Move3D: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M5 3v16h16' }],
      ['path', { d: 'm5 19 6-6' }],
      ['path', { d: 'm2 6 3-3 3 3' }],
      ['path', { d: 'm18 16 3 3-3 3' }],
    ],
  ],
  Pencil: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }],
      ['path', { d: 'm15 5 4 4' }],
    ],
  ],
  Plus: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'M12 5v14' }],
    ],
  ],
  X: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M18 6 6 18' }],
      ['path', { d: 'm6 6 12 12' }],
    ],
  ],
  Redo2: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'm15 14 5-5-5-5' }],
      ['path', { d: 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13' }],
    ],
  ],
  RefreshCcw: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
      ['path', { d: 'M3 3v5h5' }],
      ['path', { d: 'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16' }],
      ['path', { d: 'M16 16h5v5' }],
    ],
  ],
  RotateCcw: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
      ['path', { d: 'M3 3v5h5' }],
    ],
  ],
  Rotate3D: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2',
        },
      ],
      ['path', { d: 'm15.194 13.707 3.814 1.86-1.86 3.814' }],
      [
        'path',
        {
          d: 'M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4',
        },
      ],
    ],
  ],
  Save: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      [
        'path',
        {
          d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
        },
      ],
      ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
      ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }],
    ],
  ],
  Scale3D: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M5 7v11a1 1 0 0 0 1 1h11' }],
      ['path', { d: 'M5.293 18.707 11 13' }],
      ['circle', { cx: '19', cy: '19', r: '2' }],
      ['circle', { cx: '5', cy: '5', r: '2' }],
    ],
  ],
  Undo2: [
    'svg',
    LUCIDE_DEFAULT_ATTRIBUTES,
    [
      ['path', { d: 'M9 14 4 9l5-5' }],
      [
        'path',
        { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' },
      ],
    ],
  ],
};

export function createEditorRuntimeModuleSource(
  editorSessionImport: string,
  coreImport: string,
  orbitControlsImport = getOrbitControlsModuleImport(),
  transformControlsImport = getTransformControlsModuleImport(),
  viewportGizmoImport = getViewportGizmoModuleImport(),
  lucideIconNodes = LUCIDE_ICON_NODES,
): string {
  return `
let SceneEditorSession;
let OrbitControls;
let TransformControls;
let ViewportGizmo;
const LucideIcons = ${JSON.stringify(lucideIconNodes)};
let AmbientLight;
let AssetManager;
let Box3;
let BoxGeometry;
let BoxHelper;
let Color;
let ComponentRegistry;
let ConeGeometry;
let CylinderGeometry;
let DirectionalLight;
let GridHelper;
let Group;
let MathUtils;
let Mesh;
let MeshBasicMaterial;
let MeshStandardMaterial;
let PerspectiveCamera;
let Raycaster;
let Scene;
let Types;
let Vector2;
let Vector3;
let WebGLRenderer;
let World;

async function loadEditorRuntimeDependencies() {
  const [
    editorSessionModule,
    coreModule,
    orbitControlsModule,
    transformControlsModule,
    viewportGizmoModule,
  ] = await Promise.all([
    import(${JSON.stringify(editorSessionImport)}),
    import(${JSON.stringify(coreImport)}),
    import(${JSON.stringify(orbitControlsImport)}),
    import(${JSON.stringify(transformControlsImport)}),
    import(${JSON.stringify(viewportGizmoImport)}),
  ]);
  ({ SceneEditorSession } = editorSessionModule);
  ({ OrbitControls } = orbitControlsModule);
  ({ TransformControls } = transformControlsModule);
  ({ ViewportGizmo } = viewportGizmoModule);
  ({
    AmbientLight,
    AssetManager,
    Box3,
    BoxGeometry,
    BoxHelper,
    Color,
    ComponentRegistry,
    ConeGeometry,
    CylinderGeometry,
    DirectionalLight,
    GridHelper,
    Group,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PerspectiveCamera,
    Raycaster,
    Scene,
    Types,
    Vector2,
    Vector3,
    WebGLRenderer,
    World,
  } = coreModule);
}

const config = window.__IWSDK_EDITOR_CONFIG || {};
const documentUrl = config.documentUrl || '/__iwsdk/editor/document';
const sceneFilesUrl = config.sceneFilesUrl || '/__iwsdk/workspace/scenes';
const workspaceRoute = config.workspaceRoute || '/__iwsdk/workspace';
const root = document.getElementById('root');
const EDITOR_OPTIMIZE_RELOAD_KEY = 'iwsdk-editor-optimize-dep-reload';
let editorWorldState = null;
let sceneDocumentRevision = null;
let runtimeDispatch = async () => {
  throw new Error('Scene editor runtime is still loading');
};
let runtimeHandles = (method) =>
  String(method).startsWith('scene_') ||
  String(method).startsWith('workspace_');
window.__IWSDK_WORKSPACE_VIEW = window.__IWSDK_WORKSPACE_VIEW || 'editor';
window.__IWSDK_WORKSPACE_PAGE_ID =
  window.__IWSDK_WORKSPACE_PAGE_ID ||
  \`workspace-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 8)}\`;
window.__IWSDK_WORKSPACE_TAB_GENERATION =
  window.__IWSDK_WORKSPACE_TAB_GENERATION || 1;
window.__IWSDK_EDITOR_BOTTOM_TAB = 'console';
window.__IWSDK_EDITOR_EVENTS = [];
document.documentElement.dataset.iwsdkWorkspaceView = window.__IWSDK_WORKSPACE_VIEW;

window.FRAMEWORK_MCP_RUNTIME = {
  handles: (method) => runtimeHandles(method),
  dispatch: (method, params = {}) => runtimeDispatch(method, params),
};

function recordEditorEvent(method, result) {
  if (
    [
      'scene_get_document',
      'scene_get_hierarchy',
      'scene_get_logs',
      'scene_get_selection',
      'scene_list_assets',
      'scene_list_component_schemas',
      'scene_screenshot',
      'scene_compare_screenshots',
    ].includes(method)
  ) {
    return;
  }
  const events = Array.isArray(window.__IWSDK_EDITOR_EVENTS)
    ? window.__IWSDK_EDITOR_EVENTS
    : [];
  const action =
    result && typeof result === 'object' && typeof result.action === 'string'
      ? result.action
      : method;
  events.push({
    action,
    method,
    timestamp: Date.now(),
  });
  window.__IWSDK_EDITOR_EVENTS = events.slice(-50);
}

function handlesWorkspaceMethod(method) {
  return [
    'workspace_get_state',
    'workspace_set_view',
    'workspace_open_scene',
    'scene_list_files',
    'scene_open',
    'scene_create',
  ].includes(method);
}

function currentScenePath() {
  const url = new URL(documentUrl, window.location.href);
  return url.searchParams.get('scene');
}

function hasConfiguredScenePath() {
  return currentScenePath() != null;
}

function workspaceState(session) {
  const pageId =
    window.__IWSDK_MCP_PAGE_ID ||
    (typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('iwer-mcp-tab-id')
      : null) ||
    window.__IWSDK_WORKSPACE_PAGE_ID;
  const rawGeneration =
    window.__IWSDK_MCP_TAB_GENERATION ||
    (typeof sessionStorage !== 'undefined'
      ? Number(sessionStorage.getItem('iwer-mcp-gen') || '0')
      : null) ||
    window.__IWSDK_WORKSPACE_TAB_GENERATION;
  const tabGeneration = Number.isFinite(rawGeneration)
    ? rawGeneration
    : null;
  const sceneSessionId = window.__IWSDK_SCENE_SESSION_ID;
  return {
    view: window.__IWSDK_WORKSPACE_VIEW || 'editor',
    managed: window.__IWER_MCP_MANAGED === true,
    workspace: {
      pageId,
      tabGeneration,
    },
    runtime: {
      ready: window.__IWSDK_WORKSPACE_RUNTIME_READY === true,
      pageId: pageId ? \`\${pageId}:runtime\` : null,
    },
    editor: {
      ready: Boolean(session),
      scenePath: currentScenePath(),
      pageId: pageId ? \`\${pageId}:editor\` : null,
      sceneSessionId: session ? sceneSessionId : null,
      dirty: Boolean(session?.isDirty),
    },
  };
}

function setWorkspaceView(view) {
  if (!['runtime', 'editor', 'split'].includes(view)) {
    throw new Error('workspace_set_view.view must be runtime, editor, or split');
  }
  window.__IWSDK_WORKSPACE_VIEW = view;
  document.documentElement.dataset.iwsdkWorkspaceView = view;
  for (const button of document.querySelectorAll('[data-workspace-view-button]')) {
    button.toggleAttribute('data-active', button.dataset.workspaceViewButton === view);
  }
  if (view !== 'editor') {
    loadWorkspaceRuntimeFrame();
  }
  if (view !== 'runtime') {
    scheduleEditorViewportRender();
  }
}

function forceEditorViewportRender() {
  if (!editorWorldState) {
    return;
  }
  resizeEditorRenderer();
  renderEditorWorld();
  if (editorWorldState.currentSession) {
    updateProjectedHitTargets(editorWorldState.currentSession);
  }
  editorWorldState.lastProof = createViewportProof();
}

function scheduleEditorViewportRender() {
  if (typeof requestAnimationFrame !== 'function') {
    forceEditorViewportRender();
    return;
  }
  requestAnimationFrame(() => {
    forceEditorViewportRender();
    requestAnimationFrame(forceEditorViewportRender);
  });
}

function attachWorkspaceViewControls() {
  const runtimeFrame = document.getElementById('workspace-runtime-frame');
  if (runtimeFrame) {
    runtimeFrame.addEventListener('load', () => {
      window.__IWSDK_WORKSPACE_RUNTIME_READY = true;
    });
  }
  for (const button of document.querySelectorAll('[data-workspace-view-button]')) {
    button.addEventListener('click', () => {
      setWorkspaceView(button.dataset.workspaceViewButton);
    });
  }
  setWorkspaceView(window.__IWSDK_WORKSPACE_VIEW || 'editor');
}

function loadWorkspaceRuntimeFrame({ reload = false } = {}) {
  const runtimeFrame = document.getElementById('workspace-runtime-frame');
  if (!(runtimeFrame instanceof HTMLIFrameElement)) {
    return false;
  }

  const currentSrc = runtimeFrame.getAttribute('src');
  if (!reload && currentSrc) {
    return true;
  }

  window.__IWSDK_WORKSPACE_RUNTIME_READY = false;
  const source = runtimeFrame.dataset.workspaceRuntimeSrc || currentSrc || '/';
  const url = new URL(source, window.location.href);
  if (reload) {
    url.searchParams.set('__iwsdk_preview_reload', Date.now().toString(36));
  }
  runtimeFrame.src = url.pathname + url.search + url.hash;
  return true;
}

function reloadWorkspaceRuntimeFrame() {
  const runtimeFrame = document.getElementById('workspace-runtime-frame');
  if (!(runtimeFrame instanceof HTMLIFrameElement)) {
    return false;
  }
  if (!runtimeFrame.getAttribute('src')) {
    return false;
  }
  return loadWorkspaceRuntimeFrame({ reload: true });
}

function documentUrlForScene(scenePath) {
  const url = new URL(documentUrl, window.location.href);
  url.searchParams.set('scene', scenePath);
  return url.pathname + url.search;
}

function workspaceUrlForScene(scenePath) {
  const url = new URL(workspaceRoute, window.location.href);
  url.searchParams.set('scene', scenePath);
  return url.pathname + url.search;
}

function scheduleSceneOpen(scenePath) {
  setTimeout(() => {
    window.location.href = workspaceUrlForScene(scenePath);
  }, 25);
}

async function fetchJsonOrThrow(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw sceneFetchError(json, text || response.statusText);
  }
  return json;
}

async function fetchSceneDocumentWithRevision(url) {
  const response = await fetch(url);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw sceneFetchError(json, text || response.statusText);
  }
  return {
    document: json,
    path: response.headers.get('X-IWSDK-Scene-Path'),
    revision: response.headers.get('X-IWSDK-Scene-Revision'),
  };
}

function sceneFetchError(json, fallback) {
  const error = new Error(json?.error || fallback);
  if (json && typeof json === 'object') {
    Object.assign(error, json);
  }
  return error;
}

function requireScenePath(params) {
  const scenePath = params?.path;
  if (typeof scenePath !== 'string' || scenePath.trim().length === 0) {
    throw new Error('A scene path under public/scenes is required');
  }
  return scenePath.trim();
}

async function dispatchWorkspaceCommand(session, method, params = {}) {
  switch (method) {
    case 'workspace_get_state':
      return workspaceState(session);
    case 'workspace_set_view':
      setWorkspaceView(params.view);
      return workspaceState(session);
    case 'scene_list_files': {
      const result = await fetchJsonOrThrow(sceneFilesUrl);
      const query =
        typeof params.query === 'string' ? params.query.toLowerCase() : '';
      return query
        ? {
            files: (result.files || []).filter((file) =>
              String(file.path || '').toLowerCase().includes(query),
            ),
          }
        : result;
    }
    case 'scene_create': {
      const scenePath = requireScenePath(params);
      const result = await fetchJsonOrThrow(sceneFilesUrl, {
        body: JSON.stringify({
          overwrite: params.overwrite === true,
          path: scenePath,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const shouldOpen = params.open !== false;
      if (shouldOpen) {
        scheduleSceneOpen(result.path || scenePath);
      }
      return {
        ...result,
        opened: shouldOpen,
        reloading: shouldOpen,
      };
    }
    case 'scene_open':
    case 'workspace_open_scene': {
      const scenePath = requireScenePath(params);
      const nextDocumentUrl = documentUrlForScene(scenePath);
      const opened = await fetchSceneDocumentWithRevision(nextDocumentUrl);
      scheduleSceneOpen(scenePath);
      return {
        document: opened.document,
        path: scenePath,
        revision: opened.revision,
        reloading: true,
        sceneSessionId: window.__IWSDK_SCENE_SESSION_ID,
      };
    }
    default:
      throw new Error(\`Unsupported workspace method "\${method}"\`);
  }
}

async function renderScenePicker() {
  const status = document.getElementById('editor-status-strip');
  if (status) {
    status.textContent = 'Choose or create a scene file';
  }
  const host = document.querySelector('[data-workspace-editor-pane]');
  if (!host) {
    return;
  }
  const dialog = document.createElement('section');
  dialog.className = 'scene-picker-dialog';
  dialog.setAttribute('aria-label', 'Open scene file');
  dialog.innerHTML =
    '<div class="scene-picker-card">' +
    '<div class="scene-picker-header">' +
    '<h1>Open Scene</h1>' +
    '<p>Scene files live under <code>public/scenes/</code>.</p>' +
    '</div>' +
    '<div id="scene-picker-list" class="scene-picker-list">Loading scenes...</div>' +
    '<form id="scene-picker-create" class="scene-picker-create">' +
    '<input name="path" value="public/scenes/new-scene.iwsdk.scene.json" aria-label="New scene path" />' +
    '<button type="submit">Create</button>' +
    '</form>' +
    '</div>';
  host.appendChild(dialog);

  const list = dialog.querySelector('#scene-picker-list');
  const renderFiles = async () => {
    const result = await dispatchWorkspaceCommand(null, 'scene_list_files', {});
    const files = result.files || [];
    if (files.length === 0) {
      list.innerHTML =
        '<div class="scene-picker-empty">No scene files found.</div>';
      return;
    }
    list.innerHTML = files
      .map(
        (file) =>
          '<button type="button" data-scene-picker-path="' +
          escapePickerAttribute(file.path) +
          '">' +
          escapePickerHtml(file.path) +
          '</button>',
      )
      .join('');
    for (const button of list.querySelectorAll('[data-scene-picker-path]')) {
      button.addEventListener('click', () => {
        dispatchWorkspaceCommand(null, 'scene_open', {
          path: button.dataset.scenePickerPath,
        }).catch((error) => {
          list.textContent = String(error?.message || error);
        });
      });
    }
  };

  dialog
    .querySelector('#scene-picker-create')
    ?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      dispatchWorkspaceCommand(null, 'scene_create', {
        path: String(formData.get('path') || ''),
      }).catch((error) => {
        list.textContent = String(error?.message || error);
      });
    });

  await renderFiles();
}

function escapePickerHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    })[character],
  );
}

function escapePickerAttribute(value) {
  return escapePickerHtml(value).replace(/'/g, '&#39;');
}

function setRoot(content) {
  if (root) {
    root.innerHTML = content;
  }
}

function renderLucideIcon(name) {
  const icon = LucideIcons?.[name];
  if (!Array.isArray(icon)) {
    return '';
  }
  return renderLucideNode(icon);
}

function renderLucideNode(node) {
  const [tagName, attributes = {}, children = []] = node;
  const attrs = Object.entries(attributes)
    .map(([name, value]) => \`\${name}="\${escapeHtml(value)}"\`)
    .join(' ');
  const childMarkup = Array.isArray(children)
    ? children.map((child) => renderLucideNode(child)).join('')
    : '';
  return \`<\${tagName} class="lucide-icon" \${attrs} aria-hidden="true">\${childMarkup}</\${tagName}>\`;
}

function iconButton(label, iconName, attributes) {
  return \`
    <button class="icon-button" \${attributes} title="\${escapeHtml(label)}" aria-label="\${escapeHtml(label)}">
      \${renderLucideIcon(iconName)}
      <span class="sr-only">\${escapeHtml(label)}</span>
    </button>
  \`;
}

const EDITOR_CONTRIBUTION_SLOTS = [
  'bottomPanel.tab',
  'inspector.global',
  'inspector.pinned',
  'inspector.section',
  'sidebar.bottom',
  'sidebar.top',
  'toolbar.center',
  'toolbar.left',
  'toolbar.right',
  'viewport.overlay',
];

const EDITOR_CONTRIBUTION_SLOT_SET = new Set(EDITOR_CONTRIBUTION_SLOTS);

function editorContributions() {
  if (!Array.isArray(window.__IWSDK_EDITOR_CONTRIBUTIONS)) {
    window.__IWSDK_EDITOR_CONTRIBUTIONS = [];
  }
  return window.__IWSDK_EDITOR_CONTRIBUTIONS;
}

function validateEditorContribution(contribution) {
  if (!contribution || typeof contribution !== 'object') {
    throw new Error('Editor contribution must be an object');
  }
  const id = String(contribution.id || '').trim();
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) {
    throw new Error('Editor contribution id must be a stable identifier');
  }
  const slot = String(contribution.slot || '').trim();
  if (!EDITOR_CONTRIBUTION_SLOT_SET.has(slot)) {
    throw new Error('Unsupported editor contribution slot "' + slot + '"');
  }
  const label = String(contribution.label || '').trim();
  if (label.length === 0) {
    throw new Error('Editor contribution label is required');
  }
  if (
    contribution.onClick != null &&
    typeof contribution.onClick !== 'function'
  ) {
    throw new Error('Editor contribution onClick must be a function');
  }
  return {
    body:
      contribution.body == null
        ? ''
        : String(contribution.body).slice(0, 800),
    icon:
      typeof contribution.icon === 'string' &&
      LucideIcons[contribution.icon] != null
        ? contribution.icon
        : '',
    id,
    label,
    onClick: contribution.onClick,
    order: Number.isFinite(contribution.order) ? contribution.order : 0,
    slot,
  };
}

function registerEditorContribution(contribution) {
  const normalized = validateEditorContribution(contribution);
  const contributions = editorContributions();
  const existingIndex = contributions.findIndex(
    (entry) => entry.id === normalized.id,
  );
  if (existingIndex === -1) {
    contributions.push(normalized);
  } else {
    contributions.splice(existingIndex, 1, normalized);
  }
  sortEditorContributions(contributions);
  rerenderEditorContributions();
  return {
    contribution: {
      body: normalized.body,
      icon: normalized.icon,
      id: normalized.id,
      label: normalized.label,
      order: normalized.order,
      slot: normalized.slot,
    },
    valid: true,
  };
}

function unregisterEditorContribution(id) {
  const contributions = editorContributions();
  const index = contributions.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    contributions.splice(index, 1);
    rerenderEditorContributions();
  }
  return { id, removed: index !== -1 };
}

function sortEditorContributions(contributions) {
  contributions.sort(
    (left, right) =>
      left.slot.localeCompare(right.slot) ||
      left.order - right.order ||
      left.id.localeCompare(right.id),
  );
}

function contributionsForSlot(slot) {
  return editorContributions().filter((entry) => entry.slot === slot);
}

function contributionPublicSnapshot(contribution) {
  return {
    body: contribution.body,
    icon: contribution.icon,
    id: contribution.id,
    label: contribution.label,
    order: contribution.order,
    slot: contribution.slot,
  };
}

function editorContributionProof() {
  const slots = {};
  for (const slot of EDITOR_CONTRIBUTION_SLOTS) {
    slots[slot] = contributionsForSlot(slot).length;
  }
  return {
    count: editorContributions().length,
    items: editorContributions().map(contributionPublicSnapshot),
    slots,
  };
}

function renderEditorContributionSlots(session, camera) {
  document.querySelectorAll('[data-editor-slot]').forEach((element) => {
    const slot = element.getAttribute('data-editor-slot') || '';
    if (slot === 'bottomPanel.tab') {
      return;
    }
    element.innerHTML = contributionsForSlot(slot)
      .map((contribution) => renderEditorContribution(contribution, slot))
      .join('');
  });
  bindEditorContributionActions(session, camera);
}

function renderEditorContribution(contribution, slot) {
  const id = escapeHtml(contribution.id);
  const label = escapeHtml(contribution.label);
  const body = escapeHtml(contribution.body);
  const icon = contribution.icon ? renderLucideIcon(contribution.icon) : '';
  if (slot.startsWith('toolbar.')) {
    return \`
      <button class="editor-contribution editor-contribution-button icon-button" data-editor-contribution-id="\${id}" title="\${label}" aria-label="\${label}">
        \${icon}
        <span>\${label}</span>
      </button>
    \`;
  }
  if (slot === 'inspector.section') {
    return \`
      <details class="inspector-section editor-contribution-section" data-editor-contribution-id="\${id}" open>
        \${inspectorSectionSummary(contribution.label)}
        <div class="editor-contribution-body">\${body}</div>
      </details>
    \`;
  }
  return \`
    <div class="editor-contribution editor-contribution-card" data-editor-contribution-id="\${id}">
      <div class="editor-contribution-title">\${icon}<span>\${label}</span></div>
      \${body ? \`<div class="editor-contribution-body">\${body}</div>\` : ''}
    </div>
  \`;
}

function renderBottomPanelContributionTab(contribution) {
  return \`
    <button data-bottom-tab="contribution:\${escapeHtml(contribution.id)}" data-contribution-tab data-editor-contribution-id="\${escapeHtml(contribution.id)}">
      \${escapeHtml(contribution.label)}
    </button>
  \`;
}

function renderBottomPanelContributionContent(contribution) {
  return \`
    <div class="editor-contribution editor-contribution-bottom" data-editor-contribution-id="\${escapeHtml(contribution.id)}">
      <strong>\${escapeHtml(contribution.label)}</strong>
      <span>\${escapeHtml(contribution.body || 'No contribution content')}</span>
    </div>
  \`;
}

function bindEditorContributionActions(session, camera) {
  document.querySelectorAll('[data-editor-contribution-id]').forEach((element) => {
    if (element.dataset.contributionBound === 'true') {
      return;
    }
    element.dataset.contributionBound = 'true';
    element.addEventListener('click', (event) => {
      const id = element.getAttribute('data-editor-contribution-id');
      const contribution = editorContributions().find((entry) => entry.id === id);
      if (!contribution || typeof contribution.onClick !== 'function') {
        return;
      }
      contribution.onClick({
        camera: currentEditorCamera(camera),
        contribution: contributionPublicSnapshot(contribution),
        event,
        session,
      });
    });
  });
}

function rerenderEditorContributions() {
  const session = editorWorldState?.currentSession;
  const camera = editorWorldState?.currentCamera;
  if (!session || !camera) {
    return;
  }
  renderEditorContributionSlots(session, camera);
  const diagnosticsPanel = document.getElementById('editor-bottom-panel');
  if (diagnosticsPanel) {
    renderDiagnosticsPanel(diagnosticsPanel, session, camera);
  }
  editorWorldState.lastProof = createViewportProof();
}

function currentEditorCamera(fallback) {
  return editorWorldState?.currentCamera || fallback;
}

function createEditorFrame() {
  setRoot(\`
    <main class="workspace-shell" data-workspace-shell>
      <div class="workspace-view-switcher" aria-label="Workspace view">
        <button data-workspace-view-button="runtime">Runtime</button>
        <button data-workspace-view-button="editor">Editor</button>
        <button data-workspace-view-button="split">Split</button>
      </div>
      <iframe id="workspace-runtime-frame" class="workspace-runtime-frame" data-workspace-runtime-src="/" title="IWSDK runtime app"></iframe>
      <section class="workspace-editor-pane" data-workspace-editor-pane>
        <main class="editor-shell">
          <div class="editor-state-readouts" aria-hidden="true">
            <span id="scene-status">Loading scene...</span>
            <span id="dirty-status">Saved</span>
          </div>
          <section class="editor-viewport">
            <div class="editor-toolbar" aria-label="Scene editor tools">
              <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.left"></div>
              <div id="transform-toolbar" class="toolbar-group" aria-label="Transform controls">
                \${iconButton('Move', 'Move3D', 'data-transform-mode="translate"')}
                \${iconButton('Rotate', 'Rotate3D', 'data-transform-mode="rotate"')}
                \${iconButton('Scale', 'Scale3D', 'data-transform-mode="scale"')}
              </div>
              <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.center"></div>
              <div class="toolbar-group" aria-label="Transform settings">
                \${iconButton('Local space', 'Box', 'data-transform-space="local"')}
                \${iconButton('World space', 'Globe2', 'data-transform-space="world"')}
                \${iconButton('Snap', 'Magnet', 'data-transform-snap')}
                \${iconButton('Surface placement', 'ArrowDownToLine', 'data-surface-placement')}
              </div>
              <div class="toolbar-group" aria-label="Document actions">
                \${iconButton('Undo', 'Undo2', 'id="undo"')}
                \${iconButton('Redo', 'Redo2', 'id="redo"')}
                \${iconButton('Save', 'Save', 'id="save"')}
                \${iconButton('Revert', 'RefreshCcw', 'id="revert"')}
              </div>
              <div class="editor-slot toolbar-slot" data-editor-slot="toolbar.right"></div>
            </div>
            <div id="scene-viewport">
              <div id="orientation-gizmo" aria-label="Interactive orientation gizmo"></div>
              <div class="editor-slot viewport-overlay-slot" data-editor-slot="viewport.overlay"></div>
            </div>
            <section id="editor-bottom-panel" class="editor-bottom-panel" aria-label="Scene diagnostics">
              <div class="bottom-panel-tabs" role="tablist">
                <button data-bottom-tab="console" data-active>Console</button>
                <button data-bottom-tab="events">Events</button>
                <button data-bottom-tab="validation">Validation</button>
              </div>
              <div id="bottom-panel-content" class="bottom-panel-content"></div>
            </section>
            <div id="editor-status-strip" aria-live="polite">Scene loading...</div>
          </section>
          <section class="editor-panel editor-panel-left" data-editor-panel="composition">
            <div class="editor-slot sidebar-slot" data-editor-slot="sidebar.top"></div>
            <div class="panel-section scene-graph-section">
              <div class="panel-section-header">
                <h2>Scene Graph</h2>
              </div>
              <div class="panel-control-row">
                <input id="scene-graph-filter" type="search" placeholder="Filter nodes" aria-label="Filter scene graph nodes" />
              </div>
              <div id="scene-root-drop-target" class="scene-root-drop-target node-row" data-scene-root-drop style="--depth: 0">
                <span class="node-row-caret">\${renderLucideIcon('ChevronDown')}</span>
                <span class="node-row-icon">\${renderLucideIcon('Boxes')}</span>
                <span class="node-row-main">
                  <span class="node-row-id">Root</span>
                  <span class="node-row-subtitle">Scene Root</span>
                </span>
              </div>
              <div id="outliner"></div>
            </div>
            <div class="panel-section asset-catalog-section">
              <div class="panel-section-header">
                <h2>Assets</h2>
              </div>
              <div class="panel-control-row">
                <input id="asset-catalog-filter" type="search" placeholder="Filter assets" aria-label="Filter scene assets" />
              </div>
              <div id="asset-catalog"></div>
            </div>
            <div class="editor-slot sidebar-slot" data-editor-slot="sidebar.bottom"></div>
            <div id="scene-graph-context-menu" class="scene-graph-context-menu" hidden></div>
          </section>
          <section class="editor-panel editor-panel-right" data-editor-panel="inspector">
            <div class="panel-section">
              <div class="panel-section-header">
                <h2>Inspector</h2>
              </div>
              <div id="inspector"></div>
            </div>
          </section>
        </main>
      </section>
    </main>
  \`);
}

function getViewportHost() {
  const host = document.getElementById('scene-viewport');
  if (!(host instanceof HTMLDivElement)) {
    throw new Error('Scene editor viewport host is missing');
  }
  return host;
}

function getCanvas() {
  const canvas = document.getElementById('scene-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Scene editor canvas is missing');
  }
  return canvas;
}

function getAssetBounds(documentValue, assetId) {
  const asset = (documentValue.assets || []).find((entry) => entry.id === assetId);
  const bounds = asset?.bounds;
  const min =
    Array.isArray(bounds?.min) && bounds.min.length === 3
      ? bounds.min
      : [-0.25, 0, -0.25];
  const max =
    Array.isArray(bounds?.max) && bounds.max.length === 3
      ? bounds.max
      : [0.25, 0.5, 0.25];
  return { asset, max, min };
}

function colorForNode(nodeId) {
  let hash = 0;
  for (let index = 0; index < nodeId.length; index += 1) {
    hash = (hash * 31 + nodeId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return new Color().setHSL(hue / 360, 0.58, 0.56);
}

function disposeObjectTree(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose?.());
    } else {
      material?.dispose?.();
    }
  });
}

function clearProxyRoot() {
  if (!editorWorldState) {
    return;
  }
  editorWorldState.transformControls?.detach();
  editorWorldState.hoverHelper = null;
  editorWorldState.hoveredNodeId = null;
  for (const child of [...editorWorldState.proxyRoot.children]) {
    editorWorldState.proxyRoot.remove(child);
    if (!child.userData.iwsdkEditorAssetId) {
      disposeObjectTree(child);
    }
  }
  editorWorldState.objectMap.clear();
}

function applyNodeTransform(object, transform = {}) {
  const position = Array.isArray(transform.position)
    ? transform.position
    : [0, 0, 0];
  const rotationDeg = Array.isArray(transform.rotationDeg)
    ? transform.rotationDeg
    : [0, 0, 0];
  const scale =
    typeof transform.scale === 'number'
      ? [transform.scale, transform.scale, transform.scale]
      : Array.isArray(transform.scale)
        ? transform.scale
        : [1, 1, 1];
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(
    MathUtils.degToRad(rotationDeg[0]),
    MathUtils.degToRad(rotationDeg[1]),
    MathUtils.degToRad(rotationDeg[2]),
  );
  object.scale.set(scale[0], scale[1], scale[2]);
  object.updateMatrixWorld(true);
}

function cloneTransform(transform = {}) {
  return {
    ...transform,
    position: Array.isArray(transform.position)
      ? [...transform.position]
      : [0, 0, 0],
    rotationDeg: Array.isArray(transform.rotationDeg)
      ? [...transform.rotationDeg]
      : [0, 0, 0],
    scale:
      typeof transform.scale === 'number'
        ? [transform.scale, transform.scale, transform.scale]
        : Array.isArray(transform.scale)
          ? [...transform.scale]
          : [1, 1, 1],
  };
}

function transformFromObject(object, existingTransform = {}) {
  const scale = [object.scale.x, object.scale.y, object.scale.z].map((value) =>
    Number(value.toFixed(4)),
  );
  const isUniformScale = scale.every((value) => value === scale[0]);
  return {
    ...existingTransform,
    position: roundVec3([object.position.x, object.position.y, object.position.z]),
    rotationDeg: roundVec3([
      MathUtils.radToDeg(object.rotation.x),
      MathUtils.radToDeg(object.rotation.y),
      MathUtils.radToDeg(object.rotation.z),
    ]),
    scale: isUniformScale ? scale[0] : scale,
  };
}

function snapNumber(value, increment) {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    return value;
  }
  return Number((Math.round(value / increment) * increment).toFixed(6));
}

function snapVector(values, increment) {
  return values.map((value) => snapNumber(value, increment));
}

function scaleVectorFromTransform(transform = {}) {
  return typeof transform.scale === 'number'
    ? [transform.scale, transform.scale, transform.scale]
    : Array.isArray(transform.scale)
      ? transform.scale
      : [1, 1, 1];
}

function compactScaleValue(scale) {
  return scale.every((value) => value === scale[0]) ? scale[0] : scale;
}

function snapTransformForCurrentMode(transform) {
  if (!editorWorldState?.transformSnapEnabled || !editorWorldState.transformSnap) {
    return transform;
  }
  const mode = editorWorldState.transformMode || 'translate';
  const snap = editorWorldState.transformSnap;
  if (mode === 'translate') {
    return {
      ...transform,
      position: snapVector(
        Array.isArray(transform.position) ? transform.position : [0, 0, 0],
        snap.translation,
      ),
    };
  }
  if (mode === 'rotate') {
    return {
      ...transform,
      rotationDeg: snapVector(
        Array.isArray(transform.rotationDeg) ? transform.rotationDeg : [0, 0, 0],
        snap.rotationDeg,
      ),
    };
  }
  if (mode === 'scale') {
    return {
      ...transform,
      scale: compactScaleValue(snapVector(scaleVectorFromTransform(transform), snap.scale)),
    };
  }
  return transform;
}

function transformsEqual(first = {}, second = {}) {
  return JSON.stringify(cloneTransform(first)) === JSON.stringify(cloneTransform(second));
}

function objectTransformProof(object) {
  if (!object) {
    return null;
  }
  return {
    position: roundVec3([object.position.x, object.position.y, object.position.z]),
    rotationDeg: roundVec3([
      MathUtils.radToDeg(object.rotation.x),
      MathUtils.radToDeg(object.rotation.y),
      MathUtils.radToDeg(object.rotation.z),
    ]),
    scale: roundVec3([object.scale.x, object.scale.y, object.scale.z]),
  };
}

function runtimeSummaryForNode(node) {
  const componentLabels = Object.entries(node?.components || {}).map(
    ([name, value]) => componentPayloadType(name, value),
  );
  const summary = {
    assetStatus: node?.asset ? 'not-requested' : 'none',
    assetUrl: null,
    bounds: null,
    componentCount: componentLabels.length,
    components: componentLabels,
    fallback: null,
    helperType: null,
    materialCount: 0,
    meshCount: 0,
    nodeId: node?.id || null,
    objectCount: 0,
    ready: false,
  };
  if (!editorWorldState || !node) {
    return summary;
  }
  const assetProof = node.asset
    ? editorWorldState.assetProof.get(node.asset)
    : null;
  if (assetProof) {
    summary.assetStatus = assetProof.status || summary.assetStatus;
    summary.assetUrl = assetProof.url || null;
  }
  const object = editorWorldState.objectMap.get(node.id);
  if (!object) {
    return summary;
  }
  summary.ready = true;
  object.updateMatrixWorld(true);
  object.traverse((entry) => {
    summary.objectCount += 1;
    if (entry.userData?.iwsdkEditorFallback && summary.fallback == null) {
      summary.fallback = entry.userData.iwsdkEditorFallback;
    }
    if (entry.userData?.iwsdkEditorHelperType && summary.helperType == null) {
      summary.helperType = entry.userData.iwsdkEditorHelperType;
    }
    if (entry.isMesh === true) {
      summary.meshCount += 1;
      summary.materialCount += Array.isArray(entry.material)
        ? entry.material.length
        : entry.material
          ? 1
          : 0;
    }
  });
  const bounds = new Box3().setFromObject(object);
  if (!bounds.isEmpty()) {
    const center = new Vector3();
    const size = new Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    summary.bounds = {
      center: roundVec3(center.toArray()),
      max: roundVec3(bounds.max.toArray()),
      min: roundVec3(bounds.min.toArray()),
      size: roundVec3(size.toArray()),
    };
  }
  return summary;
}

function selectedRuntimeSummaryProof() {
  const nodeId = selectedNodeId();
  const documentValue = editorWorldState?.currentSession?.document;
  return runtimeSummaryForNode(
    nodeId && documentValue ? findNodeById(documentValue, nodeId) : null,
  );
}

function selectionBoundsProof() {
  if (!editorWorldState) {
    return null;
  }
  const selectedIds = window.__IWSDK_EDITOR_SELECTION || [];
  if (selectedIds.length > 1) {
    const bounds = boundsForSelectedObjects();
    if (!bounds) {
      return { nodeIds: selectedIds, aggregateBounds: null };
    }
    const center = new Vector3();
    bounds.getCenter(center);
    return {
      aggregateBounds: {
        center: roundVec3(center.toArray()),
        max: roundVec3(bounds.max.toArray()),
        min: roundVec3(bounds.min.toArray()),
      },
      nodeIds: selectedIds,
    };
  }
  const nodeId = selectedIds.length === 1 ? selectedIds[0] : null;
  const object = nodeId ? editorWorldState.objectMap.get(nodeId) : null;
  if (!nodeId || !object) {
    return null;
  }
  let helper = null;
  editorWorldState.proxyRoot.traverse((entry) => {
    if (
      helper == null &&
      entry.userData?.iwsdkEditorSelectionHelper === true &&
      entry.userData?.iwsdkSceneNodeId === nodeId
    ) {
      helper = entry;
    }
  });
  if (!helper) {
    return { nodeId, helper: null };
  }
  const objectCenter = new Vector3();
  const helperCenter = new Vector3();
  new Box3().setFromObject(object).getCenter(objectCenter);
  new Box3().setFromObject(helper).getCenter(helperCenter);
  return {
    centerDistance: Number(objectCenter.distanceTo(helperCenter).toFixed(4)),
    helperCenter: roundVec3(helperCenter.toArray()),
    nodeId,
    objectCenter: roundVec3(objectCenter.toArray()),
  };
}

function hoverBoundsProof() {
  if (!editorWorldState?.hoveredNodeId || !editorWorldState.hoverHelper) {
    return null;
  }
  const object = editorWorldState.objectMap.get(editorWorldState.hoveredNodeId);
  if (!object) {
    return null;
  }
  const objectCenter = new Vector3();
  const helperCenter = new Vector3();
  new Box3().setFromObject(object).getCenter(objectCenter);
  new Box3().setFromObject(editorWorldState.hoverHelper).getCenter(helperCenter);
  return {
    centerDistance: Number(objectCenter.distanceTo(helperCenter).toFixed(4)),
    helperCenter: roundVec3(helperCenter.toArray()),
    nodeId: editorWorldState.hoveredNodeId,
    objectCenter: roundVec3(objectCenter.toArray()),
  };
}

function objectHierarchyProof() {
  if (!editorWorldState) {
    return [];
  }
  return [...editorWorldState.objectMap.entries()].map(([nodeId, object]) => {
    let parent = object.parent;
    let parentNodeId = null;
    while (parent && parent !== editorWorldState.proxyRoot) {
      const candidate = parent.userData?.iwsdkSceneNodeId;
      if (typeof candidate === 'string' && candidate !== nodeId) {
        parentNodeId = candidate;
        break;
      }
      parent = parent.parent;
    }
    const worldPosition = new Vector3();
    object.updateMatrixWorld(true);
    object.getWorldPosition(worldPosition);
    return {
      assetId: object.userData?.iwsdkEditorAssetId ?? null,
      fallback: object.userData?.iwsdkEditorFallback ?? null,
      helperType: object.userData?.iwsdkEditorHelperType ?? null,
      localPosition: roundVec3([
        object.position.x,
        object.position.y,
        object.position.z,
      ]),
      nodeId,
      parentNodeId,
      worldPosition: roundVec3(worldPosition.toArray()),
    };
  });
}

function disposeEditorHelper(helper) {
  helper?.geometry?.dispose?.();
  helper?.material?.dispose?.();
}

function updateHoverHelper(session, nodeId) {
  if (!editorWorldState) {
    return;
  }
  const selected = new Set(window.__IWSDK_EDITOR_SELECTION || []);
  const nextNodeId = nodeId && !selected.has(nodeId) ? nodeId : null;
  if (editorWorldState.hoveredNodeId === nextNodeId) {
    return;
  }
  if (editorWorldState.hoverHelper) {
    editorWorldState.hoverHelper.parent?.remove(editorWorldState.hoverHelper);
    disposeEditorHelper(editorWorldState.hoverHelper);
    editorWorldState.hoverHelper = null;
  }
  editorWorldState.hoveredNodeId = nextNodeId;
  if (!nextNodeId || !findNodeById(session.document, nextNodeId)) {
    return;
  }
  const object = editorWorldState.objectMap.get(nextNodeId);
  if (!object) {
    return;
  }
  object.updateMatrixWorld(true);
  const helper = new BoxHelper(object, 0x2d7ff9);
  helper.name = \`\${nextNodeId}-hover-outline\`;
  helper.userData.iwsdkEditorHelper = true;
  helper.userData.iwsdkEditorHoverHelper = true;
  helper.userData.iwsdkSceneNodeId = nextNodeId;
  editorWorldState.proxyRoot.add(helper);
  editorWorldState.hoverHelper = helper;
}

function markObjectForNode(object, nodeId) {
  object.userData.iwsdkSceneNodeId = nodeId;
  object.userData.iwsdkEditorObject = true;
  object.traverse?.((child) => {
    child.userData.iwsdkSceneNodeId = nodeId;
    child.userData.iwsdkEditorObject = true;
  });
}

function createBoundsProxyObject(documentValue, node, reason = 'fallback') {
  const { max, min } = getAssetBounds(documentValue, node.asset);
  const size = [
    Math.max(0.05, max[0] - min[0]),
    Math.max(0.05, max[1] - min[1]),
    Math.max(0.05, max[2] - min[2]),
  ];
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const group = new Group();
  group.name = node.name || node.id;
  group.userData.iwsdkEditorFallback = reason;
  applyNodeTransform(group, node.transform);

  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(center[0], center[1], center[2]);
  const material = new MeshStandardMaterial({
    color: colorForNode(node.id),
    metalness: 0.08,
    roughness: 0.58,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = \`\${node.id}-proxy-mesh\`;
  group.add(mesh);
  markObjectForNode(group, node.id);
  return group;
}

function componentHelperType(node) {
  const componentTypes = Object.entries(node?.components || {}).map(
    ([name, value]) => componentPayloadType(name, value),
  );
  if (componentTypes.includes('AudioSource')) {
    return 'audio-source';
  }
  if (componentTypes.includes('CameraSource')) {
    return 'camera-source';
  }
  if (
    componentTypes.includes('DomeGradient') ||
    componentTypes.includes('DomeTexture') ||
    componentTypes.includes('IBLGradient') ||
    componentTypes.includes('IBLTexture')
  ) {
    return 'environment-light';
  }
  return null;
}

function createComponentHelperObject(node, helperType) {
  const group = new Group();
  group.name = node.name || node.id;
  group.userData.iwsdkEditorFallback = helperType + '-helper';
  group.userData.iwsdkEditorHelperType = helperType;
  applyNodeTransform(group, node.transform);

  if (helperType === 'audio-source') {
    const bodyMaterial = new MeshBasicMaterial({
      color: 0x5ce1e6,
      opacity: 0.9,
      transparent: true,
    });
    const waveMaterial = new MeshBasicMaterial({
      color: 0xb8f7ff,
      opacity: 0.55,
      transparent: true,
      wireframe: true,
    });
    const body = new Mesh(new BoxGeometry(0.16, 0.18, 0.1), bodyMaterial);
    body.name = node.id + '-audio-body';
    const cone = new Mesh(new ConeGeometry(0.16, 0.22, 32, 1, true), waveMaterial);
    cone.name = node.id + '-audio-wave';
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = 0.18;
    group.add(body, cone);
  } else if (helperType === 'camera-source') {
    const bodyMaterial = new MeshBasicMaterial({
      color: 0xffd166,
      opacity: 0.9,
      transparent: true,
    });
    const frustumMaterial = new MeshBasicMaterial({
      color: 0xfff0a8,
      opacity: 0.5,
      transparent: true,
      wireframe: true,
    });
    const body = new Mesh(new BoxGeometry(0.22, 0.14, 0.12), bodyMaterial);
    body.name = node.id + '-camera-body';
    const frustum = new Mesh(
      new ConeGeometry(0.2, 0.34, 4, 1, true),
      frustumMaterial,
    );
    frustum.name = node.id + '-camera-frustum';
    frustum.rotation.x = Math.PI / 2;
    frustum.position.z = -0.24;
    group.add(body, frustum);
  } else {
    const coreMaterial = new MeshBasicMaterial({
      color: 0xa8ff78,
      opacity: 0.85,
      transparent: true,
    });
    const haloMaterial = new MeshBasicMaterial({
      color: 0xf7ff9e,
      opacity: 0.45,
      transparent: true,
      wireframe: true,
    });
    const core = new Mesh(new CylinderGeometry(0.14, 0.14, 0.06, 32), coreMaterial);
    core.name = node.id + '-environment-core';
    const halo = new Mesh(new ConeGeometry(0.28, 0.12, 32, 1, true), haloMaterial);
    halo.name = node.id + '-environment-halo';
    halo.position.y = 0.04;
    group.add(core, halo);
  }

  markObjectForNode(group, node.id);
  return group;
}

function resolveAssetUrl(asset) {
  if (/^[a-z]+:/i.test(asset.uri) || asset.uri.startsWith('/')) {
    return asset.uri;
  }

  return new URL(asset.uri, new URL(documentUrl, window.location.href)).href;
}

function getAssetLoadEntry(asset) {
  if (!asset || (asset.type != null && asset.type !== 'gltf')) {
    return null;
  }
  const assetUrl = resolveAssetUrl(asset);
  const existing = editorWorldState.assetCache.get(asset.id);
  if (existing && existing.url === assetUrl) {
    return existing;
  }

  const entry = {
    assetId: asset.id,
    error: null,
    loadedAt: null,
    promise: null,
    scene: null,
    status: 'loading',
    url: assetUrl,
  };
  editorWorldState.assetCache.set(asset.id, entry);
  editorWorldState.assetProof.set(asset.id, {
    assetId: asset.id,
    status: 'loading',
    url: assetUrl,
  });
  entry.promise = AssetManager.loadGLTF(assetUrl, asset.id)
    .then((loaded) => {
      const cached = AssetManager.getGLTF(asset.id);
      entry.scene = cached?.scene ?? loaded.scene.clone(true);
      entry.status = 'loaded';
      entry.loadedAt = Date.now();
      editorWorldState.assetProof.set(asset.id, {
        assetId: asset.id,
        loadedAt: entry.loadedAt,
        status: 'loaded',
        url: assetUrl,
      });
      editorWorldState.requestRender?.();
      requestEditorUiRefresh();
      return entry;
    })
    .catch((error) => {
      entry.error = String(error?.message || error);
      entry.status = 'failed';
      editorWorldState.assetProof.set(asset.id, {
        assetId: asset.id,
        error: entry.error,
        status: 'failed',
        url: assetUrl,
      });
      console.warn(
        \`[IWSDK Scene Editor] Failed to load asset "\${asset.id}" from \${assetUrl}\`,
        error,
      );
      editorWorldState.requestRender?.();
      requestEditorUiRefresh();
      return entry;
    });
  return entry;
}

function requestEditorUiRefresh() {
  if (!editorWorldState?.currentSession || editorWorldState.uiRefreshFrame != null) {
    return;
  }
  editorWorldState.uiRefreshFrame = requestAnimationFrame(() => {
    if (editorWorldState) {
      editorWorldState.uiRefreshFrame = null;
    }
    if (!editorWorldState?.currentSession) {
      return;
    }
    editorWorldState.lastProof = createViewportProof();
  });
}

async function waitForAssetLoads() {
  if (!editorWorldState) {
    return;
  }
  const pending = [...editorWorldState.assetCache.values()]
    .filter((entry) => entry.status === 'loading' && entry.promise)
    .map((entry) => entry.promise);
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
}

function createRenderableObject(documentValue, node) {
  const asset = (documentValue.assets || []).find(
    (entry) => entry.id === node.asset,
  );
  const assetEntry = getAssetLoadEntry(asset);
  if (assetEntry?.status === 'loaded' && assetEntry.scene) {
    const group = new Group();
    group.name = node.name || node.id;
    group.userData.iwsdkEditorAssetId = asset.id;
    group.add(assetEntry.scene.clone(true));
    markObjectForNode(group, node.id);
    applyNodeTransform(group, node.transform);
    return group;
  }

  if (!node.asset) {
    const helperType = componentHelperType(node);
    if (helperType) {
      return createComponentHelperObject(node, helperType);
    }
  }

  const reason =
    assetEntry?.status === 'failed'
      ? 'asset-load-failed'
      : assetEntry?.status === 'loading'
        ? 'asset-loading'
        : 'no-gltf-asset';
  return createBoundsProxyObject(documentValue, node, reason);
}

function syncRenderableNode(documentValue, node, parent, selected) {
  const object = createRenderableObject(documentValue, node);
  parent.add(object);
  editorWorldState.objectMap.set(node.id, object);
  for (const child of node.children || []) {
    syncRenderableNode(documentValue, child, object, selected);
  }
  if (selected.has(node.id)) {
    const helper = new BoxHelper(object, 0x9ff3c7);
    helper.name = \`\${node.id}-selection-outline\`;
    helper.userData.iwsdkEditorHelper = true;
    helper.userData.iwsdkEditorSelectionHelper = true;
    helper.userData.iwsdkSceneNodeId = node.id;
    parent.add(helper);
  }
}

function updateSelectionHelpers() {
  if (!editorWorldState) {
    return;
  }
  const replacements = [];
  editorWorldState.proxyRoot.traverse((object) => {
    if (
      object.userData?.iwsdkEditorSelectionHelper === true &&
      object.object
    ) {
      replacements.push({
        helper: object,
        nodeId: object.userData.iwsdkSceneNodeId,
        parent: object.parent,
        target: object.object,
      });
    }
  });
  for (const entry of replacements) {
    if (!entry.parent || !entry.target) {
      continue;
    }
    entry.target.updateMatrixWorld(true);
    const replacement = new BoxHelper(entry.target, 0x9ff3c7);
    replacement.name = \`\${entry.nodeId}-selection-outline\`;
    replacement.userData.iwsdkEditorHelper = true;
    replacement.userData.iwsdkEditorSelectionHelper = true;
    replacement.userData.iwsdkSceneNodeId = entry.nodeId;
    entry.parent.remove(entry.helper);
    entry.helper.geometry?.dispose?.();
    entry.helper.material?.dispose?.();
    entry.parent.add(replacement);
  }
}

function resizeEditorRenderer(size = {}) {
  if (!editorWorldState) {
    return { height: 1, width: 1 };
  }
  const rect = editorWorldState.host.getBoundingClientRect();
  const width = Math.max(1, Math.floor(size.width || rect.width || 960));
  const height = Math.max(1, Math.floor(size.height || rect.height || 640));
  editorWorldState.world.renderer.setSize(width, height, false);
  editorWorldState.world.renderer.domElement.style.height = '100%';
  editorWorldState.world.renderer.domElement.style.width = '100%';
  editorWorldState.world.camera.aspect = width / height;
  editorWorldState.world.camera.updateProjectionMatrix();
  return { height, width };
}

function applyEditorCamera(camera) {
  if (!editorWorldState) {
    return;
  }
  const state = camera || {
    fov: 50,
    lookAt: [0, 0, 0],
    position: [4, 3, 4],
    view: 'quarter',
  };
  editorWorldState.world.camera.position.set(
    state.position?.[0] ?? 4,
    state.position?.[1] ?? 3,
    state.position?.[2] ?? 4,
  );
  editorWorldState.world.camera.fov = state.fov ?? 50;
  editorWorldState.world.camera.lookAt(
    state.lookAt?.[0] ?? 0,
    state.lookAt?.[1] ?? 0,
    state.lookAt?.[2] ?? 0,
  );
  if (editorWorldState.orbitControls) {
    editorWorldState.orbitControls.target.set(
      state.lookAt?.[0] ?? 0,
      state.lookAt?.[1] ?? 0,
      state.lookAt?.[2] ?? 0,
    );
    editorWorldState.suppressOrbitChange = true;
    try {
      editorWorldState.orbitControls.update();
    } finally {
      editorWorldState.suppressOrbitChange = false;
    }
  }
  editorWorldState.world.camera.updateProjectionMatrix();
  editorWorldState.world.camera.updateMatrixWorld(true);
}

function boundsForObjects(objects) {
  const bounds = new Box3();
  bounds.makeEmpty();
  for (const object of objects) {
    if (!object) {
      continue;
    }
    object.updateMatrixWorld(true);
    bounds.union(new Box3().setFromObject(object));
  }
  return bounds.isEmpty() ? null : bounds;
}

function boundsForSelectedObjects() {
  if (!editorWorldState) {
    return null;
  }
  const selectedIds = window.__IWSDK_EDITOR_SELECTION || [];
  return boundsForObjects(
    selectedIds
      .map((nodeId) => editorWorldState.objectMap.get(nodeId))
      .filter(Boolean),
  );
}

function boundsForSceneObjects() {
  if (!editorWorldState) {
    return null;
  }
  return boundsForObjects([...editorWorldState.objectMap.values()]);
}

function roundCameraVec3(vector) {
  return [
    Number(vector.x.toFixed(4)),
    Number(vector.y.toFixed(4)),
    Number(vector.z.toFixed(4)),
  ];
}

function frameViewportBounds(bounds, cameraState) {
  if (!editorWorldState || !bounds) {
    return null;
  }
  const center = new Vector3();
  const size = new Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const currentCamera = editorWorldState.world.camera;
  const currentTarget =
    editorWorldState.orbitControls?.target || new Vector3(0, 0, 0);
  const direction = new Vector3()
    .subVectors(currentCamera.position, currentTarget)
    .normalize();
  if (!Number.isFinite(direction.length()) || direction.lengthSq() < 0.0001) {
    direction.set(1, 0.75, 1).normalize();
  }

  const fov = cameraState?.fov ?? currentCamera.fov ?? 50;
  const maxSize = Math.max(size.x, size.y, size.z, 0.5);
  const radius = maxSize * 0.5;
  const distance = Math.max(
    1.5,
    (radius / Math.sin(MathUtils.degToRad(fov) / 2)) * 1.35,
  );
  const position = center.clone().add(direction.multiplyScalar(distance));
  const nextCamera = {
    fov,
    lookAt: roundCameraVec3(center),
    position: roundCameraVec3(position),
    view: 'custom',
  };
  if (cameraState) {
    Object.assign(cameraState, nextCamera);
  }
  editorWorldState.currentCamera = cameraState || nextCamera;
  applyEditorCamera(editorWorldState.currentCamera);
  renderEditorWorld();
  if (editorWorldState.currentSession) {
    updateProjectedHitTargets(editorWorldState.currentSession);
  }
  editorWorldState.lastProof = createViewportProof();
  return editorWorldState.currentCamera;
}

function frameViewport(target, cameraState) {
  const bounds =
    target === 'scene'
      ? boundsForSceneObjects()
      : boundsForSelectedObjects() || boundsForSceneObjects();
  return frameViewportBounds(bounds, cameraState);
}

function updateCameraStateFromWorld(cameraState) {
  if (!editorWorldState || !cameraState) {
    return cameraState;
  }
  const camera = editorWorldState.world.camera;
  const target = editorWorldState.orbitControls?.target || new Vector3(0, 0, 0);
  const lookAt = [target.x, target.y, target.z];
  const position = [camera.position.x, camera.position.y, camera.position.z];
  cameraState.fov = camera.fov;
  cameraState.lookAt = lookAt;
  cameraState.position = position;
  cameraState.view = inferNamedCameraView(position, lookAt);
  window.__IWSDK_EDITOR_CAMERA = cameraState;
  return cameraState;
}

function inferNamedCameraView(position, lookAt) {
  const direction = new Vector3(
    position[0] - lookAt[0],
    position[1] - lookAt[1],
    position[2] - lookAt[2],
  );
  if (direction.lengthSq() < 0.0001) {
    return 'custom';
  }
  direction.normalize();
  const epsilon = 0.015;
  if (Math.abs(direction.x - 1) < epsilon) {
    return 'right';
  }
  if (Math.abs(direction.x + 1) < epsilon) {
    return 'left';
  }
  if (Math.abs(direction.y - 1) < epsilon) {
    return 'top';
  }
  if (Math.abs(direction.z - 1) < epsilon) {
    return 'front';
  }
  if (Math.abs(direction.z + 1) < epsilon) {
    return 'back';
  }
  return 'custom';
}

function createOrientationGizmoAxis(name, directionValues, color, view) {
  const direction = new Vector3(
    directionValues[0],
    directionValues[1],
    directionValues[2],
  ).normalize();
  const axis = new Group();
  axis.name = name;
  axis.userData.iwsdkOrientationView = view;
  axis.userData.iwsdkOrientationDirection = direction;

  const material = new MeshBasicMaterial({ color });
  const shaft = new Mesh(new CylinderGeometry(0.025, 0.025, 0.62, 12), material);
  shaft.name = \`\${name}-shaft\`;
  shaft.position.y = 0.32;
  shaft.userData.iwsdkOrientationView = view;

  const head = new Mesh(new ConeGeometry(0.075, 0.2, 16), material);
  head.name = \`\${name}-head\`;
  head.position.y = 0.72;
  head.userData.iwsdkOrientationView = view;

  axis.add(shaft, head);
  axis.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
  return axis;
}

function createOrientationGizmo(session) {
  const host = document.getElementById('orientation-gizmo');
  if (!(host instanceof HTMLElement) || !editorWorldState) {
    return null;
  }

  host.innerHTML = '';
  const gizmo = new ViewportGizmo(
    editorWorldState.world.camera,
    editorWorldState.world.renderer,
    {
      animated: false,
      background: {
        enabled: false,
      },
      className: 'orientation-gizmo-widget',
      container: host,
      corners: { enabled: false },
      edges: { enabled: false },
      font: {
        family: 'Inter, ui-sans-serif, system-ui, sans-serif',
        weight: 700,
      },
      lineWidth: 2,
      nx: {
        color: 0x9d2f2f,
        label: '-X',
        labelColor: 0xffffff,
      },
      ny: {
        enabled: false,
      },
      nz: {
        color: 0x325fbd,
        label: '-Z',
        labelColor: 0xffffff,
      },
      offset: {
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
      },
      placement: 'top-left',
      size: 112,
      x: {
        color: 0xff5d5d,
        label: 'X',
        labelColor: 0xffffff,
      },
      y: {
        color: 0x5ee58a,
        label: 'Y',
        labelColor: 0x0a0a0b,
      },
      z: {
        color: 0x63a9ff,
        label: 'Z',
        labelColor: 0x0a0a0b,
      },
    },
  );
  gizmo.attachControls(editorWorldState.orbitControls);
  gizmo.addEventListener('change', () => {
    updateCameraStateFromWorld(editorWorldState.currentCamera);
    renderEditorWorld();
    if (editorWorldState.currentSession) {
      updateProjectedHitTargets(editorWorldState.currentSession);
    }
    editorWorldState.lastProof = createViewportProof();
  });

  renderOrientationGizmo(gizmo);
  return gizmo;
}

function renderOrientationGizmo(gizmo = editorWorldState?.orientationGizmo) {
  if (!editorWorldState || !gizmo) {
    return;
  }
  gizmo.update(false);
  gizmo.render();
  gizmo.clickTargets = computeOrientationGizmoClickTargets(gizmo);
  renderOrientationGizmoVisual(gizmo);
}

function renderEditorWorld() {
  if (!editorWorldState) {
    return;
  }
  editorWorldState.world.renderer.render(
    editorWorldState.world.scene,
    editorWorldState.world.camera,
  );
  renderOrientationGizmo();
}

function renderOrientationGizmoVisual(gizmo) {
  const element = gizmo._domElement;
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const width = element.clientWidth || 112;
  const height = element.clientHeight || 112;
  const center = { x: width / 2, y: height / 2 };
  const targets = Array.isArray(gizmo.clickTargets) ? gizmo.clickTargets : [];
  const colors = {
    back: '#325fbd',
    bottom: '#3f8f59',
    front: '#63a9ff',
    left: '#9d2f2f',
    right: '#ff5d5d',
    top: '#5ee58a',
  };
  const labels = {
    back: '-Z',
    bottom: '-Y',
    front: 'Z',
    left: '-X',
    right: 'X',
    top: 'Y',
  };
  const orderedTargets = [...targets].sort((a, b) => {
    const order = {
      back: 0,
      bottom: 1,
      left: 2,
      right: 3,
      front: 4,
      top: 5,
    };
    return (order[a.view] ?? 0) - (order[b.view] ?? 0);
  });
  const axisMarkup = orderedTargets
    .map((target) => {
      const view = target.view;
      const color = colors[view] || '#ededed';
      const label = labels[view] || view;
      const isPositive = ['right', 'top', 'front'].includes(view);
      const opacity = isPositive ? 1 : 0.58;
      const radius = isPositive ? 10 : 8;
      const labelColor = view === 'top' || view === 'front' ? '#0a0a0b' : '#ffffff';
      return \`
        <line x1="\${center.x.toFixed(2)}" y1="\${center.y.toFixed(2)}" x2="\${Number(target.x).toFixed(2)}" y2="\${Number(target.y).toFixed(2)}" stroke="\${color}" stroke-width="\${isPositive ? 2.5 : 1.5}" stroke-linecap="round" opacity="\${opacity}" />
        <circle cx="\${Number(target.x).toFixed(2)}" cy="\${Number(target.y).toFixed(2)}" r="\${radius}" fill="\${color}" stroke="rgba(255,255,255,0.72)" stroke-width="1" opacity="\${opacity}" />
        <text x="\${Number(target.x).toFixed(2)}" y="\${(Number(target.y) + 3.6).toFixed(2)}" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="\${isPositive ? 10 : 8}" font-weight="800" fill="\${labelColor}" opacity="\${opacity}">\${escapeHtml(label)}</text>
      \`;
    })
    .join('');
  element.innerHTML = \`
    <svg class="orientation-gizmo-visual" viewBox="0 0 \${width} \${height}" aria-hidden="true">
      <circle cx="\${center.x}" cy="\${center.y}" r="4" fill="#ededed" opacity="0.75" />
      \${axisMarkup}
    </svg>
  \`;
}

function computeOrientationGizmoClickTargets(gizmo) {
  const element = gizmo._domElement;
  const camera = gizmo._camera;
  const axes = Array.isArray(gizmo._intersections)
    ? gizmo._intersections
    : [];
  if (!(element instanceof HTMLElement) || !camera) {
    return [];
  }
  const width = element.clientWidth || 112;
  const height = element.clientHeight || 112;
  const targetPosition = new Vector3();
  return axes
    .map((axis) => {
      const view = orientationViewFromDirection(axis.position);
      if (!view) {
        return null;
      }
      axis.updateMatrixWorld(true);
      axis.getWorldPosition(targetPosition).project(camera);
      return {
        view,
        x: ((targetPosition.x + 1) / 2) * width,
        y: ((1 - targetPosition.y) / 2) * height,
      };
    })
    .filter(Boolean);
}

function orientationViewFromDirection(direction) {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);
  if (absX >= absY && absX >= absZ) {
    return direction.x >= 0 ? 'right' : 'left';
  }
  if (absY >= absX && absY >= absZ) {
    return direction.y >= 0 ? 'top' : 'bottom';
  }
  return direction.z >= 0 ? 'front' : 'back';
}

function selectedNodeId() {
  const selection = window.__IWSDK_EDITOR_SELECTION || [];
  return selection.length === 1 ? selection[0] : null;
}

function selectionForNodeClick(nodeId, event) {
  const currentSelection = Array.isArray(window.__IWSDK_EDITOR_SELECTION)
    ? window.__IWSDK_EDITOR_SELECTION
    : [];
  if (!event?.shiftKey && !event?.metaKey && !event?.ctrlKey) {
    return [nodeId];
  }
  if (currentSelection.includes(nodeId)) {
    return currentSelection.filter((entry) => entry !== nodeId);
  }
  return [...currentSelection, nodeId];
}

function applyTransformControlSettings() {
  if (!editorWorldState?.transformControls) {
    return;
  }
  const mode = editorWorldState.transformMode || 'translate';
  const space = editorWorldState.transformSpace || 'local';
  const transformControls = editorWorldState.transformControls;
  transformControls.setMode(mode);
  transformControls.setSpace(space);
  const snap = editorWorldState.transformSnapEnabled
    ? editorWorldState.transformSnap
    : null;
  setTransformControlSnap(
    transformControls,
    'setTranslationSnap',
    'translationSnap',
    snap?.translation ?? null,
  );
  setTransformControlSnap(
    transformControls,
    'setRotationSnap',
    'rotationSnap',
    snap ? MathUtils.degToRad(snap.rotationDeg) : null,
  );
  setTransformControlSnap(
    transformControls,
    'setScaleSnap',
    'scaleSnap',
    snap?.scale ?? null,
  );
  editorWorldState.transformSnapApplied = snap
    ? {
        rotationSnapDeg: snap.rotationDeg,
        scaleSnap: snap.scale,
        translationSnap: snap.translation,
      }
    : {
        rotationSnapDeg: null,
        scaleSnap: null,
        translationSnap: null,
      };
}

function setTransformControlSnap(transformControls, method, property, value) {
  if (typeof transformControls[method] === 'function') {
    transformControls[method](value);
  } else {
    transformControls[property] = value;
  }
}

function renderTransformToolbar() {
  const mode = editorWorldState?.transformMode || 'translate';
  const space = editorWorldState?.transformSpace || 'local';
  const snapEnabled = Boolean(editorWorldState?.transformSnapEnabled);
  const surfacePlacementEnabled = Boolean(
    editorWorldState?.surfacePlacementEnabled,
  );
  document.querySelectorAll('[data-transform-mode]').forEach((button) => {
    button.toggleAttribute(
      'data-active',
      button.getAttribute('data-transform-mode') === mode,
    );
  });
  document.querySelectorAll('[data-transform-space]').forEach((button) => {
    button.toggleAttribute(
      'data-active',
      button.getAttribute('data-transform-space') === space,
    );
  });
  document.querySelectorAll('[data-transform-snap]').forEach((button) => {
    button.toggleAttribute('data-active', snapEnabled);
  });
  document.querySelectorAll('[data-surface-placement]').forEach((button) => {
    button.toggleAttribute('data-active', surfacePlacementEnabled);
  });
}

function setTransformMode(mode) {
  if (!['translate', 'rotate', 'scale'].includes(mode)) {
    return;
  }
  if (editorWorldState) {
    editorWorldState.transformMode = mode;
    applyTransformControlSettings();
    renderEditorWorld();
    editorWorldState.lastProof = createViewportProof();
  }
  renderTransformToolbar();
}

function setTransformSpace(space) {
  if (!['local', 'world'].includes(space)) {
    return;
  }
  if (editorWorldState) {
    editorWorldState.transformSpace = space;
    applyTransformControlSettings();
    renderEditorWorld();
    editorWorldState.lastProof = createViewportProof();
  }
  renderTransformToolbar();
}

function setTransformSnapEnabled(enabled) {
  if (editorWorldState) {
    editorWorldState.transformSnapEnabled = Boolean(enabled);
    applyTransformControlSettings();
    renderEditorWorld();
    editorWorldState.lastProof = createViewportProof();
  }
  renderTransformToolbar();
}

function setSurfacePlacementEnabled(enabled) {
  if (editorWorldState) {
    editorWorldState.surfacePlacementEnabled = Boolean(enabled);
    editorWorldState.surfacePlacementTargetNodeId = enabled ? selectedNodeId() : null;
    editorWorldState.lastProof = createViewportProof();
  }
  renderTransformToolbar();
}

function currentSurfacePlacementTargetId() {
  if (!editorWorldState?.surfacePlacementEnabled) {
    return null;
  }
  return editorWorldState.surfacePlacementTargetNodeId || selectedNodeId();
}

function syncTransformControlsToSelection(session) {
  if (!editorWorldState?.transformControls) {
    return;
  }
  applyTransformControlSettings();
  const nodeId = selectedNodeId();
  const object = nodeId ? editorWorldState.objectMap.get(nodeId) : null;
  const helper = editorWorldState.transformControls.getHelper();
  if (!nodeId || !object) {
    editorWorldState.transformControls.detach();
    editorWorldState.transformControlsAttachedNodeId = null;
    helper.visible = false;
    return;
  }
  const node = findNodeById(session.document, nodeId);
  if (!node) {
    editorWorldState.transformControls.detach();
    editorWorldState.transformControlsAttachedNodeId = null;
    helper.visible = false;
    return;
  }
  editorWorldState.transformControls.attach(object);
  editorWorldState.transformControls.enabled = true;
  editorWorldState.transformControlsAttachedNodeId = nodeId;
  helper.visible = true;
}

async function commitTransformControlDrag(session, rerender) {
  if (!editorWorldState?.transformControls || !editorWorldState.transformDragState) {
    return;
  }
  const dragState = editorWorldState.transformDragState;
  editorWorldState.transformDragState = null;
  const node = findNodeById(session.document, dragState.nodeId);
  const object = editorWorldState.transformControls.object;
  if (!node || !object) {
    return;
  }
  const nextTransform = snapTransformForCurrentMode(
    transformFromObject(object, node.transform || {}),
  );
  applyNodeTransform(object, nextTransform);
  updateSelectionHelpers();
  renderEditorWorld();
  if (transformsEqual(dragState.startTransform, nextTransform)) {
    rerender();
    return;
  }
  await session.dispatch('scene_set_transform', {
    nodeId: dragState.nodeId,
    transform: nextTransform,
  });
  clearValidationResult();
  rerender();
}

function cancelTransformControlDrag(session) {
  if (!editorWorldState?.transformControls || !editorWorldState.transformDragState) {
    return false;
  }
  const dragState = editorWorldState.transformDragState;
  const object = editorWorldState.transformControls.object;
  editorWorldState.transformDragState = null;
  editorWorldState.orbitControls.enabled = true;
  if (!object) {
    return true;
  }
  applyNodeTransform(object, dragState.startTransform);
  updateSelectionHelpers();
  renderEditorWorld();
  if (session) {
    updateProjectedHitTargets(session);
  }
  editorWorldState.lastProof = createViewportProof();
  return true;
}

function eventHitsTransformControls(canvas, event) {
  if (
    !editorWorldState?.transformControls ||
    !editorWorldState.transformControls.object ||
    !editorWorldState.transformControls.enabled
  ) {
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  editorWorldState.pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  editorWorldState.transformControls.pointerHover(editorWorldState.pointer);
  return Boolean(editorWorldState.transformControls.axis);
}

function findTransformControlPointerTarget(axis = 'X') {
  if (
    !editorWorldState?.transformControls ||
    !editorWorldState.transformControls.object
  ) {
    throw new Error('Transform controls are not attached to an object');
  }
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const center = new Vector3();
  editorWorldState.transformControls.object.getWorldPosition(center);
  center.project(editorWorldState.world.camera);
  const centerX = ((center.x + 1) / 2) * canvas.width;
  const centerY = ((1 - center.y) / 2) * canvas.height;
  const step = 5;
  const radius = 150;
  for (let offsetRadius = 0; offsetRadius <= radius; offsetRadius += step) {
    for (let y = centerY - offsetRadius; y <= centerY + offsetRadius; y += step) {
      for (let x = centerX - offsetRadius; x <= centerX + offsetRadius; x += step) {
        if (
          x < 0 ||
          y < 0 ||
          x > canvas.width ||
          y > canvas.height ||
          Math.abs(x - centerX) !== offsetRadius &&
            Math.abs(y - centerY) !== offsetRadius
        ) {
          continue;
        }
        editorWorldState.pointer.set(
          (x / canvas.width) * 2 - 1,
          -(y / canvas.height) * 2 + 1,
        );
        editorWorldState.transformControls.pointerHover(
          editorWorldState.pointer,
        );
        const hitAxis = editorWorldState.transformControls.axis;
        if (hitAxis === axis || hitAxis?.startsWith(axis)) {
          return {
            axis: hitAxis,
            canvasX: x,
            canvasY: y,
            x: rect.left + (x / canvas.width) * rect.width,
            y: rect.top + (y / canvas.height) * rect.height,
          };
        }
      }
    }
  }
  throw new Error(\`Could not find transform control target for axis "\${axis}"\`);
}

function updateProjectedHitTargets(session) {
  if (!editorWorldState) {
    window.__IWSDK_EDITOR_NODE_HITS = [];
    return;
  }
  const canvas = getCanvas();
  const hits = [];
  const center = new Vector3();
  for (const [id, object] of editorWorldState.objectMap.entries()) {
    object.updateMatrixWorld(true);
    new Box3().setFromObject(object).getCenter(center);
    const projected = center.clone().project(editorWorldState.world.camera);
    hits.push({
      id,
      radius: 18,
      x: ((projected.x + 1) / 2) * canvas.width,
      y: ((1 - projected.y) / 2) * canvas.height,
    });
  }
  window.__IWSDK_EDITOR_NODE_HITS = hits;
}

function syncEditorWorld(session, camera, size = {}) {
  if (!editorWorldState) {
    return;
  }
  editorWorldState.currentCamera = camera;
  editorWorldState.currentSession = session;
  resizeEditorRenderer(size);
  applyEditorCamera(camera);
  editorWorldState.world.scene.background = new Color(0x101418);
  clearProxyRoot();
  const selected = new Set(window.__IWSDK_EDITOR_SELECTION || []);
  for (const node of session.document.nodes || []) {
    syncRenderableNode(
      session.document,
      node,
      editorWorldState.proxyRoot,
      selected,
    );
  }
  editorWorldState.proxyRoot.updateMatrixWorld(true);
  syncTransformControlsToSelection(session);
  updateHoverHelper(session, editorWorldState.hoveredNodeId);
  editorWorldState.world.renderer.setClearColor(0x101418, 1);
  editorWorldState.world.renderer.clear(true, true, true);
  renderEditorWorld();
  updateProjectedHitTargets(session);
  editorWorldState.lastProof = createViewportProof();
}

async function createEditorWorld(session, camera) {
  const host = getViewportHost();
  const editorRuntime = window.FRAMEWORK_MCP_RUNTIME;
  const world = await World.create(host, {
    features: {
      camera: false,
      environmentRaycast: false,
      grabbing: false,
      locomotion: false,
      physics: false,
      sceneUnderstanding: false,
      spatialUI: false,
    },
    render: {
      camera: {
        lookAt: camera.lookAt,
        position: camera.position,
      },
      defaultLighting: false,
      fov: camera.fov,
    },
    xr: false,
  });
  window.FRAMEWORK_MCP_RUNTIME = editorRuntime;
  const canvas = world.renderer.domElement;
  canvas.id = 'scene-canvas';
  canvas.dataset.renderer = 'iwsdk-webgl';
  canvas.style.height = '100%';
  canvas.style.width = '100%';
  canvas.setAttribute('aria-label', 'IWSDK 3D scene viewport');
  world.renderer.setClearColor(0x101418, 1);

  const orbitControls = new OrbitControls(world.camera, canvas);
  orbitControls.enableDamping = false;
  orbitControls.enablePan = true;
  orbitControls.enableRotate = true;
  orbitControls.enableZoom = true;
  orbitControls.screenSpacePanning = false;
  orbitControls.target.set(
    camera.lookAt?.[0] ?? 0,
    camera.lookAt?.[1] ?? 0,
    camera.lookAt?.[2] ?? 0,
  );
  orbitControls.update();

  const transformControls = new TransformControls(world.camera, canvas);
  transformControls.size = 0.85;
  transformControls.setMode('translate');
  transformControls.setSpace('local');
  const transformHelper = transformControls.getHelper();
  transformHelper.name = 'IWSDKSceneEditorTransformControls';
  transformHelper.userData.iwsdkEditorHelper = true;
  transformHelper.visible = false;
  world.scene.add(transformHelper);

  const proxyRoot = new Group();
  proxyRoot.name = 'IWSDKSceneEditorProxyRoot';
  proxyRoot.userData.iwsdkEditorProxyRoot = true;
  world.getActiveRoot().add(proxyRoot);

  const grid = new GridHelper(12, 24, 0x40515f, 0x26343d);
  grid.name = 'IWSDKSceneEditorGrid';
  grid.userData.iwsdkEditorHelper = true;
  world.scene.add(grid);
  const ambient = new AmbientLight(0xffffff, 0.65);
  ambient.name = 'IWSDKSceneEditorAmbientLight';
  ambient.userData.iwsdkEditorHelper = true;
  world.scene.add(ambient);
  const directional = new DirectionalLight(0xffffff, 1.2);
  directional.name = 'IWSDKSceneEditorKeyLight';
  directional.position.set(4, 8, 5);
  directional.userData.iwsdkEditorHelper = true;
  world.scene.add(directional);

  editorWorldState = {
    assetCache: new Map(),
    assetProof: new Map(),
    currentCamera: camera,
    currentSession: session,
    host,
    hoveredNodeId: null,
    hoverHelper: null,
    lastProof: null,
    objectMap: new Map(),
    orbitControls,
    proxyRoot,
    raycaster: new Raycaster(),
    requestRender: () => {
      if (editorWorldState?.currentSession) {
        renderCanvas(
          editorWorldState.currentSession,
          editorWorldState.currentCamera,
        );
      }
    },
    pointer: new Vector2(),
    surfacePlacementEnabled: false,
    surfacePlacementLastTargetId: null,
    surfacePlacementTargetNodeId: null,
    transformControlsAttachedNodeId: null,
    transformControls,
    transformDragState: null,
    transformHelper,
    transformMode: 'translate',
    transformSnap: {
      rotationDeg: 15,
      scale: 0.1,
      translation: 0.25,
    },
    transformSnapApplied: {
      rotationSnapDeg: null,
      scaleSnap: null,
      translationSnap: null,
    },
    transformSnapEnabled: false,
    transformSpace: 'local',
    uiRefreshFrame: null,
    world,
  };
  transformControls.addEventListener('mouseDown', () => {
    const nodeId = selectedNodeId();
    const node = nodeId ? findNodeById(session.document, nodeId) : null;
    editorWorldState.transformDragState =
      nodeId && node
        ? {
            nodeId,
            startTransform: cloneTransform(node.transform || {}),
          }
        : null;
    orbitControls.enabled = false;
  });
  transformControls.addEventListener('mouseUp', () => {
    orbitControls.enabled = true;
    commitTransformControlDrag(session, () =>
      renderUi(session, editorWorldState.currentCamera),
    ).catch((error) => {
      console.error('[IWSDK Scene Editor] Transform commit failed:', error);
      renderUi(session, editorWorldState.currentCamera);
    });
  });
  transformControls.addEventListener('objectChange', () => {
    updateSelectionHelpers();
    renderEditorWorld();
    updateProjectedHitTargets(session);
    editorWorldState.lastProof = createViewportProof();
  });
  transformControls.addEventListener('change', () => {
    updateSelectionHelpers();
    renderEditorWorld();
  });
  orbitControls.addEventListener('change', () => {
    if (editorWorldState.suppressOrbitChange) {
      return;
    }
    updateCameraStateFromWorld(editorWorldState.currentCamera);
    renderEditorWorld();
    if (editorWorldState.currentSession) {
      updateProjectedHitTargets(editorWorldState.currentSession);
    }
    editorWorldState.lastProof = createViewportProof();
  });
  editorWorldState.orientationGizmo = createOrientationGizmo(session);
  syncEditorWorld(session, camera);
}

function createViewportProof() {
  if (!editorWorldState) {
    return {
      layout: createLayoutProof(),
      renderer: 'none',
      uses2DRenderer: false,
      webgl: false,
      worldReady: false,
    };
  }
  const canvas = getCanvas();
  const context =
    canvas.getContext('webgl2') ||
    canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl');
  let meshCount = 0;
  let materialCount = 0;
  editorWorldState.proxyRoot.traverse((object) => {
    if (object.isMesh === true) {
      meshCount += 1;
      materialCount += Array.isArray(object.material)
        ? object.material.length
        : 1;
    }
  });
  return {
    assetLoads: [...editorWorldState.assetProof.values()],
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    cameraLookAt: editorWorldState.currentCamera?.lookAt ?? null,
    cameraPosition: editorWorldState.currentCamera?.position ?? null,
    contributions: editorContributionProof(),
    layout: createLayoutProof(),
    materialCount,
    meshCount,
    nodeObjectCount: editorWorldState.objectMap.size,
    objectHierarchy: objectHierarchyProof(),
    orbitControls: Boolean(editorWorldState.orbitControls),
    orientationGizmo: editorWorldState.orientationGizmo
      ? {
          animating: editorWorldState.orientationGizmo.animating === true,
          axisCount:
            editorWorldState.orientationGizmo._intersections?.length ?? 0,
          clickTargets: editorWorldState.orientationGizmo.clickTargets,
          draggable: true,
          renderer: 'shared-webgl',
          widget: elementLayout('#orientation-gizmo .orientation-gizmo-widget'),
          webgl: Boolean(
            editorWorldState.world.renderer.domElement.getContext('webgl2') ||
              editorWorldState.world.renderer.domElement.getContext('webgl'),
          ),
        }
      : null,
    renderer: canvas.dataset.renderer || 'unknown',
    hoverBounds: hoverBoundsProof(),
    selectionBounds: selectionBoundsProof(),
    selectedRuntime: selectedRuntimeSummaryProof(),
    surfacePlacement: {
      enabled: Boolean(editorWorldState.surfacePlacementEnabled),
      lastTargetNodeId: editorWorldState.surfacePlacementLastTargetId || null,
      targetNodeId: currentSurfacePlacementTargetId(),
    },
    transformControls: editorWorldState.transformControls
      ? {
          attachedNodeId: editorWorldState.transformControlsAttachedNodeId || null,
          mode: editorWorldState.transformControls.mode,
          snapping: {
            applied: editorWorldState.transformSnapApplied || {
              rotationSnapDeg: null,
              scaleSnap: null,
              translationSnap: null,
            },
            enabled: Boolean(editorWorldState.transformSnapEnabled),
            rotationDeg: editorWorldState.transformSnap?.rotationDeg ?? null,
            scale: editorWorldState.transformSnap?.scale ?? null,
            translation: editorWorldState.transformSnap?.translation ?? null,
          },
          dragging: Boolean(editorWorldState.transformDragState),
          space: editorWorldState.transformControls.space,
          visible: Boolean(
            editorWorldState.transformControls.getHelper().visible &&
              editorWorldState.transformControls.object,
          ),
        }
      : null,
    uses2DRenderer: false,
    webgl: Boolean(context),
    webglContextType: context
      ? context.constructor?.name || 'WebGLRenderingContext'
      : null,
    worldReady: Boolean(editorWorldState.world),
  };
}

function createLayoutProof() {
  return {
    canvas: elementLayout('#scene-canvas'),
    bottomPanel: elementLayout('#editor-bottom-panel'),
    contributionSlots: Object.fromEntries(
      EDITOR_CONTRIBUTION_SLOTS.map((slot) => [
        slot,
        elementLayout('[data-editor-slot="' + slot + '"]'),
      ]),
    ),
    leftPanel: elementLayout('[data-editor-panel="composition"]'),
    orientationGizmo: elementLayout('#orientation-gizmo'),
    rightPanel: elementLayout('[data-editor-panel="inspector"]'),
    statusStrip: elementLayout('#editor-status-strip'),
    toolbar: elementLayout('.editor-toolbar'),
    viewport: elementLayout('#scene-viewport'),
    window: {
      height: window.innerHeight,
      width: window.innerWidth,
    },
  };
}

function elementLayout(selector) {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return {
    bottom: Number(rect.bottom.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
    left: Number(rect.left.toFixed(2)),
    pointerEvents: style.pointerEvents,
    position: style.position,
    resize: style.resize,
    right: Number(rect.right.toFixed(2)),
    top: Number(rect.top.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    zIndex: style.zIndex,
  };
}

function nodesInDocument(documentValue) {
  const nodes = [];
  const visit = (items) => {
    for (const node of items || []) {
      nodes.push(node);
      visit(node.children || []);
    }
  };
  visit(documentValue.nodes || []);
  return nodes;
}

function findNodeById(documentValue, nodeId) {
  return nodesInDocument(documentValue).find((node) => node.id === nodeId);
}

function nodeHasDescendant(node, nodeId) {
  for (const child of node.children || []) {
    if (child.id === nodeId || nodeHasDescendant(child, nodeId)) {
      return true;
    }
  }
  return false;
}

function findNodeHierarchyInfo(documentValue, nodeId) {
  const visit = (items, parentId, depth) => {
    for (let index = 0; index < (items || []).length; index += 1) {
      const node = items[index];
      if (node.id === nodeId) {
        return {
          depth,
          index,
          node,
          parentId,
          siblings: items,
        };
      }
      const childResult = visit(node.children || [], node.id, depth + 1);
      if (childResult) {
        return childResult;
      }
    }
    return null;
  };
  return visit(documentValue.nodes || [], null, 0);
}

function renderOutlinerRows(nodes, selected, depth = 0, query = '') {
  return (nodes || [])
    .flatMap((node) => {
      const childCount = (node.children || []).length;
      const childRows = renderOutlinerRows(
        node.children || [],
        selected,
        depth + 1,
        query,
      );
      const matches = nodeMatchesOutlinerQuery(node, query);
      if (query && !matches && childRows.length === 0) {
        return [];
      }
      return [
        \`
        <button
          class="node-row"
          data-node-id="\${escapeHtml(node.id)}"
          draggable="true"
          style="--depth: \${depth}"
          \${selected.includes(node.id) ? 'data-active' : ''}
        >
          <span class="node-row-caret">\${
            childCount > 0 ? renderLucideIcon('ChevronRight') : ''
          }</span>
          <span class="node-row-icon">\${renderLucideIcon(node.asset ? 'Box' : 'Folder')}</span>
          <span class="node-row-main">
            <span class="node-row-id">\${escapeHtml(node.name || node.id)}</span>
            <span class="node-row-subtitle">\${escapeHtml(node.asset || node.id)}</span>
          </span>
          \${
            childCount > 0
              ? \`<span class="node-row-meta">\${childCount}</span>\`
              : ''
          }
        </button>
        \${childRows}
      \`,
      ];
    })
    .join('');
}

function nodeMatchesOutlinerQuery(node, query) {
  if (!query) {
    return true;
  }
  return [node.id, node.name, node.asset]
    .filter((value) => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(query));
}

function renderAssetCatalog(assets, query = '') {
  const rows = (assets || [])
    .filter((asset) => assetMatchesCatalogQuery(asset, query))
    .map(
      (asset) => \`
        <div class="asset-catalog-row" data-asset-id="\${escapeHtml(asset.id)}">
          <span class="asset-catalog-thumb" aria-hidden="true">
            \${renderLucideIcon('Box')}
          </span>
          <span class="asset-catalog-main">
            <span class="asset-catalog-name">\${escapeHtml(asset.name || asset.id)}</span>
            <span class="asset-catalog-meta">\${escapeHtml(assetCatalogMeta(asset))}</span>
          </span>
          <button class="asset-add-button icon-button" data-add-asset="\${escapeHtml(asset.id)}" title="Add \${escapeHtml(asset.name || asset.id)}" aria-label="Add \${escapeHtml(asset.name || asset.id)}">
            \${renderLucideIcon('Plus')}
          </button>
        </div>
      \`,
    )
    .join('');

  return rows || '<div class="empty-state" data-empty-assets>No matching assets</div>';
}

function assetMatchesCatalogQuery(asset, query) {
  if (!query) {
    return true;
  }
  return [asset.id, asset.name, asset.type, asset.uri]
    .filter((value) => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(query));
}

function assetCatalogMeta(asset) {
  const type = inferAssetType(asset);
  const bounds = asset.bounds;
  const min = bounds?.min;
  const max = bounds?.max;
  if (
    Array.isArray(min) &&
    Array.isArray(max) &&
    min.length === 3 &&
    max.length === 3
  ) {
    const size = max.map((value, index) =>
      Math.max(0, value - Number(min[index] ?? value)),
    );
    if (
      size.every((value) => Number.isFinite(value) && value >= 0 && value < 50)
    ) {
      return (
        type +
        ' | ' +
        size.map((value) => trimNumber(value, 2)).join(' x ') +
        'm'
      );
    }
  }
  const fileName =
    typeof asset.uri === 'string' ? asset.uri.split('/').filter(Boolean).pop() : '';
  return fileName ? type + ' | ' + fileName : type;
}

function inferAssetType(asset) {
  if (typeof asset.type === 'string' && asset.type.length > 0) {
    return asset.type;
  }
  if (typeof asset.uri === 'string') {
    const extension = asset.uri.split('?')[0].split('.').pop();
    if (extension) {
      return extension.toLowerCase();
    }
  }
  return 'asset';
}

function trimNumber(value, digits = 2) {
  return Number(value.toFixed(digits)).toString();
}

function createNodeIdForAsset(documentValue, assetId) {
  const base =
    String(assetId || 'asset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'asset';
  const ids = new Set(nodesInDocument(documentValue).map((node) => node.id));
  let index = 1;
  let candidate = base + '-' + index;
  while (ids.has(candidate)) {
    index += 1;
    candidate = base + '-' + index;
  }
  return candidate;
}

function createGroupNodeId(documentValue) {
  const ids = new Set(nodesInDocument(documentValue).map((node) => node.id));
  let index = 1;
  let candidate = 'group-' + index;
  while (ids.has(candidate)) {
    index += 1;
    candidate = 'group-' + index;
  }
  return candidate;
}

function defaultTransformForAsset(documentValue, assetId) {
  const assetIndex = nodesInDocument(documentValue).length;
  const { max, min } = getAssetBounds(documentValue, assetId);
  const extents = max.map((value, index) =>
    Math.abs(value - Number(min[index] ?? value)),
  );
  const boundsAreSane = extents.every(
    (value) => Number.isFinite(value) && value < 50,
  );
  const y = boundsAreSane && Number(min[1]) < 0 ? -Number(min[1]) : 0;
  return {
    position: [
      Number((((assetIndex % 5) - 2) * 0.45).toFixed(3)),
      Number(y.toFixed(3)),
      Number((Math.floor(assetIndex / 5) * 0.45).toFixed(3)),
    ],
  };
}

function addAssetFromCatalog(session, camera, assetId) {
  return runEditorMutation(async () => {
    const asset = (session.document.assets || []).find(
      (entry) => entry.id === assetId,
    );
    if (!asset) {
      throw new Error(\`Unknown asset "\${assetId}"\`);
    }
    const nodeId = createNodeIdForAsset(session.document, assetId);
    const surfaceTargetId = currentSurfacePlacementTargetId();
    let result = await session.dispatch('scene_add_node', {
      node: {
        asset: assetId,
        id: nodeId,
        name: asset.name || nodeId,
        transform: defaultTransformForAsset(session.document, assetId),
      },
    });
    if (surfaceTargetId) {
      result = await session.dispatch('scene_place_on', {
        align: 'center',
        nodeId,
        targetId: surfaceTargetId,
      });
      if (editorWorldState) {
        editorWorldState.surfacePlacementLastTargetId = surfaceTargetId;
        editorWorldState.surfacePlacementTargetNodeId = surfaceTargetId;
      }
    }
    syncSelectionFromResult(result);
    clearValidationResult();
    renderUi(session, camera);
  });
}

function hideSceneGraphContextMenu() {
  const menu = document.getElementById('scene-graph-context-menu');
  if (!menu) {
    return;
  }
  menu.hidden = true;
  menu.innerHTML = '';
  delete menu.dataset.contextNodeId;
}

function showSceneGraphContextMenu(session, camera, nodeId, point) {
  const menu = document.getElementById('scene-graph-context-menu');
  if (!menu) {
    return;
  }
  const hierarchyInfo = findNodeHierarchyInfo(session.document, nodeId);
  const groupable = groupableSelectedNodes(session.document, nodeId);
  const canUngroup = Boolean(hierarchyInfo?.node?.children?.length);
  const canMoveUp = Boolean(hierarchyInfo && hierarchyInfo.index > 0);
  const canMoveDown = Boolean(
    hierarchyInfo &&
      Array.isArray(hierarchyInfo.siblings) &&
      hierarchyInfo.index < hierarchyInfo.siblings.length - 1,
  );
  menu.dataset.contextNodeId = nodeId;
  menu.hidden = false;
  menu.innerHTML = \`
    <div class="context-menu-label">\${escapeHtml(nodeId)}</div>
    <button data-scene-graph-action="group-selection" \${groupable ? '' : 'disabled'}>Group Selection</button>
    <button data-scene-graph-action="ungroup" \${canUngroup ? '' : 'disabled'}>Ungroup</button>
    <button data-scene-graph-action="move-up" \${canMoveUp ? '' : 'disabled'}>Move Up</button>
    <button data-scene-graph-action="move-down" \${canMoveDown ? '' : 'disabled'}>Move Down</button>
    <button data-scene-graph-action="duplicate">Duplicate Node</button>
    <button data-scene-graph-action="remove">Remove Node</button>
  \`;

  const menuWidth = 180;
  const menuHeight = 248;
  menu.style.left = \`\${Math.min(point.x, window.innerWidth - menuWidth - 8)}px\`;
  menu.style.top = \`\${Math.min(point.y, window.innerHeight - menuHeight - 8)}px\`;

  menu.querySelectorAll('[data-scene-graph-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-scene-graph-action');
      runSceneGraphContextAction(session, camera, nodeId, action);
    });
  });
}

function runSceneGraphContextAction(session, camera, nodeId, action) {
  runEditorMutation(async () => {
    if (action === 'duplicate') {
      const result = await session.dispatch('scene_duplicate_node', { nodeId });
      syncSelectionFromResult(result);
    } else if (action === 'remove') {
      const result = await session.dispatch('scene_remove_node', { nodeId });
      syncSelectionFromResult(result);
    } else if (action === 'move-up' || action === 'move-down') {
      const result = await reorderOutlinerNode(
        session,
        nodeId,
        action === 'move-up' ? -1 : 1,
      );
      syncSelectionFromResult(result);
    } else if (action === 'group-selection') {
      const result = await groupSelectedNodes(session, nodeId);
      syncSelectionFromResult(result);
    } else if (action === 'ungroup') {
      const result = await ungroupNode(session, nodeId);
      syncSelectionFromResult(result);
    }
    hideSceneGraphContextMenu();
    clearValidationResult();
    renderUi(session, camera);
  });
}

function selectedOutlinerNodeIds() {
  const selection = Array.isArray(window.__IWSDK_EDITOR_SELECTION)
    ? window.__IWSDK_EDITOR_SELECTION
    : [];
  const seen = new Set();
  return selection.filter((nodeId) => {
    if (typeof nodeId !== 'string' || seen.has(nodeId)) {
      return false;
    }
    seen.add(nodeId);
    return true;
  });
}

function groupableSelectedNodes(documentValue, contextNodeId) {
  const selectedIds = selectedOutlinerNodeIds();
  if (selectedIds.length < 2 || !selectedIds.includes(contextNodeId)) {
    return null;
  }
  const infos = selectedIds.map((nodeId) =>
    findNodeHierarchyInfo(documentValue, nodeId),
  );
  if (infos.some((info) => !info)) {
    return null;
  }
  const parentId = infos[0].parentId;
  if (infos.some((info) => info.parentId !== parentId)) {
    return null;
  }
  const sortedInfos = [...infos].sort((left, right) => left.index - right.index);
  return {
    insertIndex: sortedInfos[0].index,
    nodeIds: sortedInfos.map((info) => info.node.id),
    parentId,
  };
}

async function groupSelectedNodes(session, contextNodeId) {
  const groupable = groupableSelectedNodes(session.document, contextNodeId);
  if (!groupable) {
    return {
      action: 'nodeGroupSkipped',
      selection: selectedOutlinerNodeIds(),
      valid: true,
    };
  }
  const groupId = createGroupNodeId(session.document);
  await session.dispatch('scene_apply_patch', {
    patch: {
      index: groupable.insertIndex,
      node: {
        id: groupId,
        name: 'Group',
      },
      op: 'addNode',
      parentId: groupable.parentId,
    },
  });
  for (const childId of groupable.nodeIds) {
    await session.dispatch('scene_apply_patch', {
      patch: {
        nodeId: childId,
        op: 'moveNode',
        parentId: groupId,
        preserveWorldTransform: true,
      },
    });
  }
  await session.dispatch('scene_select', { nodeIds: [groupId] });
  return {
    action: 'nodesGrouped',
    groupId,
    nodeIds: groupable.nodeIds,
    selection: [groupId],
    valid: true,
  };
}

async function ungroupNode(session, nodeId) {
  const hierarchyInfo = findNodeHierarchyInfo(session.document, nodeId);
  const childIds = (hierarchyInfo?.node?.children || []).map((child) => child.id);
  if (!hierarchyInfo || childIds.length === 0) {
    return {
      action: 'nodeUngroupSkipped',
      selection: [nodeId],
      valid: true,
    };
  }
  for (let index = 0; index < childIds.length; index += 1) {
    await session.dispatch('scene_apply_patch', {
      patch: {
        index: hierarchyInfo.index + index,
        nodeId: childIds[index],
        op: 'moveNode',
        parentId: hierarchyInfo.parentId,
        preserveWorldTransform: true,
      },
    });
  }
  await session.dispatch('scene_apply_patch', {
    patch: {
      nodeId,
      op: 'removeNode',
    },
  });
  await session.dispatch('scene_select', { nodeIds: childIds });
  return {
    action: 'nodeUngrouped',
    nodeId,
    nodeIds: childIds,
    selection: childIds,
    valid: true,
  };
}

function reorderOutlinerNode(session, nodeId, direction) {
  const hierarchyInfo = findNodeHierarchyInfo(session.document, nodeId);
  if (!hierarchyInfo || !Array.isArray(hierarchyInfo.siblings)) {
    throw new Error('Cannot reorder unknown node "' + nodeId + '"');
  }
  const nextIndex = hierarchyInfo.index + direction;
  if (nextIndex < 0 || nextIndex >= hierarchyInfo.siblings.length) {
    return {
      action: 'nodeReorderSkipped',
      selection: [nodeId],
      valid: true,
    };
  }
  const childIds = hierarchyInfo.siblings.map((node) => node.id);
  const [movedId] = childIds.splice(hierarchyInfo.index, 1);
  childIds.splice(nextIndex, 0, movedId);
  return session.dispatch('scene_apply_patch', {
    patch: {
      childIds,
      op: 'reorderChildren',
      parentId: hierarchyInfo.parentId,
    },
  });
}

function isValidOutlinerDrop(documentValue, draggedNodeId, targetNodeId) {
  if (!draggedNodeId || draggedNodeId === targetNodeId) {
    return false;
  }
  const draggedNode = findNodeById(documentValue, draggedNodeId);
  const targetNode = targetNodeId == null ? null : findNodeById(documentValue, targetNodeId);
  if (!draggedNode || (targetNodeId != null && !targetNode)) {
    return false;
  }
  const current = findNodeHierarchyInfo(documentValue, draggedNodeId);
  if (current?.parentId === targetNodeId) {
    return false;
  }
  return targetNodeId == null || !nodeHasDescendant(draggedNode, targetNodeId);
}

function draggedOutlinerNodeIdFromEvent(event) {
  const dataNodeId = event.dataTransfer?.getData('text/plain');
  if (dataNodeId) {
    return dataNodeId;
  }
  return window.__IWSDK_EDITOR_DRAG_NODE_ID || null;
}

function setOutlinerDropState(element, state) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (state) {
    element.dataset.dropActive = 'true';
  } else {
    delete element.dataset.dropActive;
  }
}

function applyOutlinerReparent(session, camera, nodeId, parentId) {
  return runEditorMutation(async () => {
    const result = await session.dispatch('scene_apply_patch', {
      patch: {
        nodeId,
        op: 'moveNode',
        parentId,
        preserveWorldTransform: true,
      },
    });
    syncSelectionFromResult(result);
    clearValidationResult();
    renderUi(session, camera);
  });
}

function syncSelectionFromResult(result) {
  const selection =
    result && typeof result === 'object' ? result.selection : undefined;
  if (Array.isArray(selection)) {
    window.__IWSDK_EDITOR_SELECTION = selection.filter(
      (nodeId) => typeof nodeId === 'string',
    );
  }
}

function setValidationResult(validation) {
  window.__IWSDK_EDITOR_VALIDATION = validation || null;
}

function clearValidationResult() {
  window.__IWSDK_EDITOR_VALIDATION = null;
}

function invalidatesValidation(method) {
  return [
    'scene_add_node',
    'scene_remove_node',
    'scene_duplicate_node',
    'scene_set_transform',
    'scene_apply_patch',
    'scene_place_on',
    'scene_look_at',
    'scene_undo',
    'scene_redo',
  ].includes(method);
}

function shouldAutosaveAfterMethod(method) {
  return invalidatesValidation(method);
}

function mutationResultIsValid(result) {
  return !(
    result &&
    typeof result === 'object' &&
    result.valid === false
  );
}

function mergeAutosaveResult(result, saveResult) {
  if (
    !result ||
    typeof result !== 'object' ||
    !saveResult ||
    typeof saveResult !== 'object'
  ) {
    return result;
  }
  const merged = { ...result, ...saveResult };
  if (typeof result.action === 'string') {
    merged.action = result.action;
  }
  return merged;
}

function handleEditorMutationError(error) {
  console.error(error);
  if (
    error?.code === 'scene_revision_conflict' ||
    error?.code === 'scene_revision_required'
  ) {
    showSceneConflictDialog(error);
    return;
  }
  const statusStrip = document.getElementById('editor-status-strip');
  if (statusStrip) {
    statusStrip.dataset.state = 'dirty';
    statusStrip.textContent = 'Error | ' + String(error?.message || error);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function vec3FromTransform(transform, field, fallback) {
  const value = transform?.[field];
  return Array.isArray(value) && value.length === 3 ? value : fallback;
}

function scaleToEditorVec3(scale) {
  if (typeof scale === 'number') {
    return [scale, scale, scale];
  }
  return Array.isArray(scale) && scale.length === 3 ? scale : [1, 1, 1];
}

function readFiniteInput(inspector, field) {
  const input = inspector.querySelector(\`[data-transform-field="\${field}"]\`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(\`Missing transform field \${field}\`);
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(\`Transform field \${field} must be a finite number\`);
  }
  return value;
}

function readScale(inspector) {
  const scale = [
    readFiniteInput(inspector, 'scale.0'),
    readFiniteInput(inspector, 'scale.1'),
    readFiniteInput(inspector, 'scale.2'),
  ];
  if (scale.some((value) => value <= 0)) {
    throw new Error('Scale values must be greater than 0');
  }
  return scale.every((value) => value === scale[0]) ? scale[0] : scale;
}

function readTransformFields(inspector, baseTransform) {
  return {
    ...baseTransform,
    position: [
      readFiniteInput(inspector, 'position.0'),
      readFiniteInput(inspector, 'position.1'),
      readFiniteInput(inspector, 'position.2'),
    ],
    rotationDeg: [
      readFiniteInput(inspector, 'rotationDeg.0'),
      readFiniteInput(inspector, 'rotationDeg.1'),
      readFiniteInput(inspector, 'rotationDeg.2'),
    ],
    scale: readScale(inspector),
  };
}

function parseTransformFieldKey(fieldKey) {
  const [field, indexText] = String(fieldKey || '').split('.');
  const index = Number(indexText);
  if (
    !['position', 'rotationDeg', 'scale'].includes(field) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 2
  ) {
    throw new Error('Unknown transform field ' + fieldKey);
  }
  return { field, index };
}

function transformVectorForField(transform, field) {
  if (field === 'scale') {
    return scaleToEditorVec3(transform?.scale);
  }
  return vec3FromTransform(transform, field, [0, 0, 0]);
}

function transformWithFieldValue(transform, field, index, value) {
  const vector = [...transformVectorForField(transform, field)];
  vector[index] = value;
  if (field === 'scale') {
    if (vector.some((entry) => entry <= 0)) {
      throw new Error('Scale values must be greater than 0');
    }
    return {
      ...(transform || {}),
      scale: compactScaleValue(vector),
    };
  }
  return {
    ...(transform || {}),
    [field]: vector,
  };
}

function commonTransformFieldValue(nodes, field, index) {
  const values = nodes.map((node) =>
    transformVectorForField(node.transform || {}, field)[index],
  );
  if (values.length === 0) {
    return '';
  }
  return values.every((value) => Object.is(value, values[0]))
    ? String(values[0])
    : '';
}

function transformEditorSignature(transform) {
  return JSON.stringify({
    position: transform.position,
    rotationDeg: transform.rotationDeg,
    scale: transform.scale,
  });
}

function setTransformEditorMessage(inspector, message, isError = false) {
  const messageNode = inspector.querySelector('#transform-editor-message');
  if (messageNode) {
    messageNode.textContent = message;
    messageNode.className = isError ? 'transform-editor-error' : '';
  }
}

async function runTransformMutation(inspector, operation) {
  try {
    await operation();
  } catch (error) {
    setTransformEditorMessage(inspector, String(error?.message || error), true);
  }
}

function commitTransformFields(inspector, session, camera, node, baseTransform) {
  runTransformMutation(inspector, async () => {
    const nextTransform = readTransformFields(inspector, baseTransform);
    const nextSignature = transformEditorSignature(nextTransform);
    if (
      inspector.dataset.committedTransformValue === nextSignature ||
      inspector.dataset.pendingTransformValue === nextSignature
    ) {
      setTransformEditorMessage(inspector, '');
      return;
    }
    inspector.dataset.pendingTransformValue = nextSignature;
    try {
      await session.dispatch('scene_set_transform', {
        nodeId: node.id,
        transform: nextTransform,
      });
      inspector.dataset.committedTransformValue = nextSignature;
      clearValidationResult();
      renderUi(session, camera);
    } finally {
      if (inspector.dataset.pendingTransformValue === nextSignature) {
        delete inspector.dataset.pendingTransformValue;
      }
    }
  });
}

function commitMultiTransformField(inspector, session, camera, nodes, fieldKey) {
  runTransformMutation(inspector, async () => {
    const input = inspector.querySelector(
      '[data-transform-field="' + fieldKey + '"]',
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Missing transform field ' + fieldKey);
    }
    const rawValue = input.value.trim();
    if (rawValue.length === 0) {
      setTransformEditorMessage(inspector, '');
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error('Transform field ' + fieldKey + ' must be a finite number');
    }
    const { field, index } = parseTransformFieldKey(fieldKey);
    if (field === 'scale' && value <= 0) {
      throw new Error('Scale values must be greater than 0');
    }
    const signature = JSON.stringify({
      field,
      index,
      nodeIds: nodes.map((node) => node.id),
      value,
    });
    if (inspector.dataset.pendingTransformValue === signature) {
      return;
    }
    inspector.dataset.pendingTransformValue = signature;
    try {
      for (const node of nodes) {
        const nextTransform = transformWithFieldValue(
          node.transform || {},
          field,
          index,
          value,
        );
        if (!transformsEqual(node.transform || {}, nextTransform)) {
          await session.dispatch('scene_set_transform', {
            nodeId: node.id,
            transform: nextTransform,
          });
        }
      }
      clearValidationResult();
      setTransformEditorMessage(inspector, '');
      renderUi(session, camera);
    } finally {
      if (inspector.dataset.pendingTransformValue === signature) {
        delete inspector.dataset.pendingTransformValue;
      }
    }
  });
}

function resetTransformField(inspector, session, camera, node, field) {
  runTransformMutation(inspector, async () => {
    const nextTransform = {
      ...(node.transform || {}),
    };
    if (field === 'position') {
      nextTransform.position = [0, 0, 0];
    } else if (field === 'rotationDeg') {
      nextTransform.rotationDeg = [0, 0, 0];
    } else if (field === 'scale') {
      nextTransform.scale = 1;
    } else {
      throw new Error('Unknown transform field ' + field);
    }
    await session.dispatch('scene_set_transform', {
      nodeId: node.id,
      transform: nextTransform,
    });
    clearValidationResult();
    renderUi(session, camera);
  });
}

function jsonObjectText(value) {
  const objectValue =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return JSON.stringify(objectValue, null, 2);
}

function parseJsonObjectText(value, fieldName) {
  const text = String(value || '').trim();
  const parsed = text.length === 0 ? {} : JSON.parse(text);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(fieldName + ' must be a JSON object');
  }
  return parsed;
}

function setMetadataEditorMessage(inspector, message, isError = false) {
  const messageNode = inspector.querySelector('#metadata-editor-message');
  if (messageNode) {
    messageNode.textContent = message;
    messageNode.className = isError ? 'metadata-editor-error' : '';
  }
}

async function runMetadataMutation(inspector, operation) {
  try {
    await operation();
  } catch (error) {
    setMetadataEditorMessage(inspector, String(error?.message || error), true);
  }
}

function commitNodeMetadata(inspector, session, camera, node) {
  runMetadataMutation(inspector, async () => {
    const input = inspector.querySelector('[data-node-metadata]');
    if (!(input instanceof HTMLTextAreaElement)) {
      throw new Error('Missing node metadata field');
    }
    const metadata = parseJsonObjectText(input.value, 'Node metadata');
    const signature = JSON.stringify(metadata);
    if (
      inspector.dataset.committedMetadataValue === signature ||
      inspector.dataset.pendingMetadataValue === signature
    ) {
      setMetadataEditorMessage(inspector, '');
      return;
    }
    inspector.dataset.pendingMetadataValue = signature;
    try {
      const result = await session.dispatch('scene_apply_patch', {
        patch: {
          nodeId: node.id,
          op: 'setNodeMetadata',
          value: metadata,
        },
      });
      syncSelectionFromResult(result);
      clearValidationResult();
      setMetadataEditorMessage(inspector, '');
      renderUi(session, camera);
    } finally {
      if (inspector.dataset.pendingMetadataValue === signature) {
        delete inspector.dataset.pendingMetadataValue;
      }
    }
  });
}

function documentStatusLabel() {
  try {
    const url = new URL(documentUrl, window.location.href);
    return url.searchParams.get('scene') || url.pathname;
  } catch {
    return documentUrl;
  }
}

function componentValueText(value) {
  return JSON.stringify(value, null, 2);
}

function stripComponentPrefix(componentName) {
  const prefix = 'com.iwsdk.components.';
  return typeof componentName === 'string' && componentName.startsWith(prefix)
    ? componentName.slice(prefix.length)
    : componentName;
}

function componentNameForSchema(schema) {
  return schema?.source === 'iwsdk'
    ? 'com.iwsdk.components.' + schema.id
    : schema.id;
}

function componentSchemasForDocument(documentValue) {
  const schemas = new Map();
  for (const schema of [
    ...runtimeComponentSchemas(),
    ...(documentValue.componentSchemas || []),
  ]) {
    if (schema && typeof schema.id === 'string') {
      schemas.set(schema.id, schema);
    }
  }
  return [...schemas.values()].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

function componentSchemaMapForDocument(documentValue) {
  return new Map(
    componentSchemasForDocument(documentValue).map((schema) => [
      schema.id,
      schema,
    ]),
  );
}

function runtimeComponentSchemas() {
  if (!ComponentRegistry?.getAllComponents) {
    return [];
  }
  return ComponentRegistry.getAllComponents().map(componentSchemaFromRuntime);
}

function componentSchemaFromRuntime(component) {
  const fields = {};
  for (const [fieldName, field] of Object.entries(component.schema || {})) {
    const fieldSchema = {
      type: String(field.type || 'Object'),
    };
    const defaultValue = sanitizeSceneJsonValue(field.default);
    if (defaultValue !== undefined) {
      fieldSchema.default = defaultValue;
    }
    if (field.enum && isPlainEditorRecord(field.enum)) {
      fieldSchema.enum = Object.fromEntries(
        Object.entries(field.enum).filter(
          ([, value]) => typeof value === 'string',
        ),
      );
    }
    if (typeof field.fileTypes === 'string') {
      fieldSchema.fileTypes = field.fileTypes;
    }
    if (typeof field.subfolder === 'string') {
      fieldSchema.subfolder = field.subfolder;
    }
    if (Number.isFinite(field.min)) {
      fieldSchema.min = field.min;
    }
    if (Number.isFinite(field.max)) {
      fieldSchema.max = field.max;
    }
    if (fieldName.startsWith('_')) {
      fieldSchema.internal = true;
    }
    fields[fieldName] = fieldSchema;
  }
  return {
    description: component.description,
    fields,
    id: component.id,
    source: 'iwsdk',
  };
}

function sanitizeSceneJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const entries = value.map(sanitizeSceneJsonValue);
    return entries.some((entry) => entry === undefined) ? undefined : entries;
  }
  if (isPlainEditorRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, sanitizeSceneJsonValue(entry)])
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(entries);
  }
  return undefined;
}

function isPlainEditorRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTypedComponentPayload(value) {
  if (!isPlainEditorRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'type' || key === 'props') &&
    typeof value.type === 'string' &&
    value.type.length > 0
  );
}

function componentPayloadType(componentName, value) {
  return isTypedComponentPayload(value) ? value.type : stripComponentPrefix(componentName);
}

function componentPayloadProps(value) {
  if (isTypedComponentPayload(value)) {
    return isPlainEditorRecord(value.props) ? value.props : {};
  }
  return isPlainEditorRecord(value) ? value : {};
}

function defaultComponentProps(schema) {
  const props = {};
  for (const [fieldName, field] of Object.entries(schema.fields || {})) {
    if (field.internal === true) {
      continue;
    }
    const value =
      field.default !== undefined ? field.default : defaultValueForField(field);
    if (value !== undefined) {
      props[fieldName] = value;
    }
  }
  return props;
}

function defaultValueForField(field) {
  switch (field.type) {
    case 'Boolean':
      return false;
    case 'Int8':
    case 'Int16':
    case 'Int32':
    case 'Float32':
    case 'Float64':
      return 0;
    case 'Vec2':
      return [0, 0];
    case 'Vec3':
      return [0, 0, 0];
    case 'Vec4':
    case 'Color':
      return [0, 0, 0, 1];
    case 'Enum':
      return Object.values(field.enum || {})[0] || '';
    case 'String':
    case 'FilePath':
      return '';
    case 'Object':
    case 'Entity':
    default:
      return {};
  }
}

function setComponentEditorMessage(inspector, message, isError = false) {
  const messageNode = inspector.querySelector('#component-editor-message');
  if (messageNode) {
    messageNode.textContent = message;
    messageNode.className = isError ? 'component-editor-error' : '';
  }
}

function parseComponentValue(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      'Component payload must be valid JSON: ' + String(error?.message || error),
    );
  }
}

function renderComponentRows(componentEntries, componentSchemaMap) {
  if (componentEntries.length === 0) {
    return '<p class="empty-state">No components</p>';
  }

  return componentEntries
    .map(([name, value], index) =>
      renderComponentRow(name, value, index, componentSchemaMap),
    )
    .join('');
}

function renderComponentRow(name, value, index, componentSchemaMap) {
  const componentType = componentPayloadType(name, value);
  const schema = componentSchemaMap.get(componentType);
  const props = componentPayloadProps(value);
  const title = schema?.name || componentType || name;
  const fieldControls = schema
    ? Object.entries(schema.fields || {})
        .filter(([, field]) => field.internal !== true)
        .map(([fieldName, field]) =>
          renderComponentField(fieldName, field, props[fieldName]),
        )
        .join('')
    : '<label>Payload <textarea data-component-value rows="5">' +
      escapeHtml(componentValueText(props)) +
      '</textarea></label>';

  return (
    '<div class="component-row" data-component-index="' +
    index +
    '" data-component-name="' +
    escapeHtml(name) +
    '" data-component-type="' +
    escapeHtml(componentType) +
    '">' +
    '<div class="component-row-header"><span class="component-row-title"><strong>' +
    escapeHtml(title) +
    '</strong><span>' +
    escapeHtml(name) +
    '</span></span><button class="component-remove-button icon-button" data-remove-component title="Remove ' +
    escapeHtml(title) +
    '" aria-label="Remove ' +
    escapeHtml(title) +
    '">' +
    renderLucideIcon('X') +
    '<span class="sr-only">Remove ' +
    escapeHtml(title) +
    '</span></button></div>' +
    fieldControls +
    '</div>'
  );
}

function renderComponentField(fieldName, field, value) {
  const fieldValue =
    value !== undefined
      ? value
      : field.default !== undefined
        ? field.default
        : defaultValueForField(field);
  const fieldLabel =
    '<span class="component-field-label">' + escapeHtml(fieldName) + '</span>';

  if (field.type === 'Boolean') {
    return (
      '<label class="component-field-row component-boolean-row" data-component-field-row="' +
      escapeHtml(fieldName) +
      '">' +
      fieldLabel +
      '<input type="checkbox" data-component-field="' +
      escapeHtml(fieldName) +
      '" data-component-field-type="' +
      escapeHtml(field.type) +
      '" ' +
      (fieldValue === true ? 'checked' : '') +
      ' /></label>'
    );
  }

  if (field.type === 'Enum') {
    const options = Object.entries(field.enum || {})
      .map(([alias, optionValue]) => {
        const selected = optionValue === fieldValue ? 'selected' : '';
        return (
          '<option value="' +
          escapeHtml(optionValue) +
          '" ' +
          selected +
          '>' +
          escapeHtml(alias) +
          '</option>'
        );
      })
      .join('');
    return (
      '<label class="component-field-row" data-component-field-row="' +
      escapeHtml(fieldName) +
      '">' +
      fieldLabel +
      '<select data-component-field="' +
      escapeHtml(fieldName) +
      '" data-component-field-type="' +
      escapeHtml(field.type) +
      '">' +
      options +
      '</select></label>'
    );
  }

  if (isVectorComponentField(field.type)) {
    const length = vectorComponentFieldLength(field.type);
    return (
      '<div class="component-field-row component-vector-row" data-component-field-row="' +
      escapeHtml(fieldName) +
      '">' +
      fieldLabel +
      '<div class="component-vector-field" data-component-field="' +
      escapeHtml(fieldName) +
      '" data-component-field-type="' +
      escapeHtml(field.type) +
      '" style="--component-vector-count: ' +
      length +
      '">' +
      renderVectorComponentInputs(fieldName, field.type, fieldValue) +
      '</div></div>'
    );
  }

  if (isNumericComponentField(field.type)) {
    return (
      '<label class="component-field-row" data-component-field-row="' +
      escapeHtml(fieldName) +
      '">' +
      fieldLabel +
      '<input type="number" step="0.01" data-component-field="' +
      escapeHtml(fieldName) +
      '" data-component-field-type="' +
      escapeHtml(field.type) +
      '" value="' +
      escapeHtml(String(Number.isFinite(fieldValue) ? fieldValue : 0)) +
      '" /></label>'
    );
  }

  if (field.type === 'Object' || field.type === 'Entity') {
    return (
      '<label class="component-field-row component-object-row" data-component-field-row="' +
      escapeHtml(fieldName) +
      '">' +
      fieldLabel +
      '<textarea data-component-field="' +
      escapeHtml(fieldName) +
      '" data-component-field-type="' +
      escapeHtml(field.type) +
      '" rows="4">' +
      escapeHtml(componentValueText(fieldValue ?? {})) +
      '</textarea></label>'
    );
  }

  return (
    '<label class="component-field-row" data-component-field-row="' +
    escapeHtml(fieldName) +
    '">' +
    fieldLabel +
    '<input data-component-field="' +
    escapeHtml(fieldName) +
    '" data-component-field-type="' +
    escapeHtml(field.type) +
    '" value="' +
    escapeHtml(String(fieldValue ?? '')) +
    '" /></label>'
  );
}

function renderVectorComponentInputs(fieldName, fieldType, value) {
  const length = vectorComponentFieldLength(fieldType);
  const entries = Array.isArray(value) ? value : defaultValueForField({ type: fieldType });
  return Array.from({ length }, (_, index) => {
    const axis = ['X', 'Y', 'Z', 'W'][index] || String(index + 1);
    return (
      '<label class="component-axis-field">' +
      '<span>' +
      axis +
      '</span>' +
      '<input type="number" step="0.01" data-component-vector-field="' +
      escapeHtml(fieldName) +
      '" data-component-vector-index="' +
      index +
      '" value="' +
      escapeHtml(String(Number.isFinite(entries[index]) ? entries[index] : 0)) +
      '" /></label>'
    );
  }).join('');
}

function isNumericComponentField(type) {
  return ['Int8', 'Int16', 'Int32', 'Float32', 'Float64'].includes(type);
}

function isVectorComponentField(type) {
  return ['Vec2', 'Vec3', 'Vec4', 'Color'].includes(type);
}

function vectorComponentFieldLength(type) {
  switch (type) {
    case 'Vec2':
      return 2;
    case 'Vec3':
      return 3;
    case 'Vec4':
    case 'Color':
      return 4;
    default:
      return 0;
  }
}

function readComponentRow(row, componentSchemaMap) {
  const component = row.getAttribute('data-component-name') || '';
  const componentType = row.getAttribute('data-component-type') || stripComponentPrefix(component);
  if (component.length === 0) {
    throw new Error('Component name is required');
  }
  const schema = componentSchemaMap.get(componentType);
  return {
    component,
    value: schema
      ? typedComponentValue(componentType, readTypedComponentFields(row, schema))
      : parseComponentValue(
          row.querySelector('[data-component-value]')?.value || '{}',
        ),
  };
}

function typedComponentValue(type, props) {
  return { type, props };
}

function readTypedComponentFields(row, schema) {
  const props = {};
  for (const [fieldName, field] of Object.entries(schema.fields || {})) {
    if (field.internal === true) {
      continue;
    }
    props[fieldName] = readComponentField(row, fieldName, field);
  }
  return props;
}

function readComponentField(row, fieldName, field) {
  if (isVectorComponentField(field.type)) {
    const length = vectorComponentFieldLength(field.type);
    return Array.from({ length }, (_, index) => {
      const input = row.querySelector(
        '[data-component-vector-field="' +
          fieldName +
          '"][data-component-vector-index="' +
          index +
          '"]',
      );
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Missing component vector field ' + fieldName);
      }
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        throw new Error('Component field ' + fieldName + ' must be finite');
      }
      return value;
    });
  }

  const input = row.querySelector('[data-component-field="' + fieldName + '"]');
  if (
    !(input instanceof HTMLInputElement) &&
    !(input instanceof HTMLSelectElement) &&
    !(input instanceof HTMLTextAreaElement)
  ) {
    throw new Error('Missing component field ' + fieldName);
  }

  if (field.type === 'Boolean') {
    return input instanceof HTMLInputElement ? input.checked : false;
  }
  if (isNumericComponentField(field.type)) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      throw new Error('Component field ' + fieldName + ' must be finite');
    }
    return value;
  }
  if (field.type === 'Object' || field.type === 'Entity') {
    return parseComponentValue(input.value || '{}');
  }
  return input.value;
}

function runEditorMutation(operation) {
  operation().catch(handleEditorMutationError);
}

function showSceneConflictDialog(error) {
  const existing = document.getElementById('scene-save-conflict-dialog');
  if (existing) {
    existing.remove();
  }
  const statusStrip = document.getElementById('editor-status-strip');
  if (statusStrip) {
    statusStrip.dataset.state = 'dirty';
    statusStrip.textContent = 'Conflict | Scene file changed on disk';
  }
  const dialog = document.createElement('section');
  dialog.id = 'scene-save-conflict-dialog';
  dialog.className = 'scene-conflict-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'false');
  dialog.setAttribute('aria-labelledby', 'scene-conflict-title');
  dialog.innerHTML = \`
    <div class="scene-conflict-card">
      <h2 id="scene-conflict-title">Scene Changed On Disk</h2>
      <p>The selected scene file changed after this editor opened it. Reload the scene before saving again to avoid overwriting external edits.</p>
      <dl>
        <dt>Scene</dt>
        <dd>\${escapeHtml(error?.path || currentScenePath() || 'current scene')}</dd>
        <dt>Loaded revision</dt>
        <dd>\${escapeHtml(error?.expectedRevision || sceneDocumentRevision || 'unknown')}</dd>
        <dt>Disk revision</dt>
        <dd>\${escapeHtml(error?.currentRevision || 'unknown')}</dd>
      </dl>
      <div class="scene-conflict-actions">
        <button type="button" data-scene-conflict-reload>Reload Scene</button>
        <button type="button" data-scene-conflict-dismiss>Dismiss</button>
      </div>
    </div>
  \`;
  dialog
    .querySelector('[data-scene-conflict-reload]')
    ?.addEventListener('click', () => window.location.reload());
  dialog
    .querySelector('[data-scene-conflict-dismiss]')
    ?.addEventListener('click', () => dialog.remove());
  document.body.append(dialog);
}

async function runInspectorMutation(inspector, operation) {
  try {
    await operation();
  } catch (error) {
    setComponentEditorMessage(inspector, String(error?.message || error), true);
  }
}

function componentRowSignature(row, componentSchemaMap) {
  const { component, value } = readComponentRow(row, componentSchemaMap);
  return JSON.stringify({ component, value });
}

function isComponentEditTarget(target) {
  return (
    target instanceof HTMLElement &&
    target.matches(
      '[data-component-field], [data-component-vector-field], [data-component-value]',
    )
  );
}

function refreshEditorStatus(session, camera) {
  window.__IWSDK_EDITOR_CAMERA = camera;
  const documentValue = session.document;
  const assets = documentValue.assets || [];
  const nodes = nodesInDocument(documentValue);
  const status = document.getElementById('scene-status');
  const dirtyStatus = document.getElementById('dirty-status');
  const statusStrip = document.getElementById('editor-status-strip');
  const diagnosticsPanel = document.getElementById('editor-bottom-panel');

  if (status) {
    status.textContent = \`\${nodes.length} nodes, \${assets.length} assets\`;
  }
  if (dirtyStatus) {
    dirtyStatus.textContent = session.isDirty ? 'Unsaved changes' : 'Saved';
    dirtyStatus.dataset.state = session.isDirty ? 'dirty' : 'saved';
  }
  if (statusStrip) {
    statusStrip.textContent = [
      documentStatusLabel(),
      \`\${nodes.length} nodes\`,
      session.isDirty ? 'unsaved changes' : 'saved',
      'IWSDK WebGL',
    ].join(' | ');
    statusStrip.dataset.state = session.isDirty ? 'dirty' : 'saved';
  }
  if (diagnosticsPanel) {
    renderDiagnosticsPanel(diagnosticsPanel, session, camera);
  }
}

function commitComponentRow(inspector, row, session, camera, node, componentSchemaMap) {
  runInspectorMutation(inspector, async () => {
    const signature = componentRowSignature(row, componentSchemaMap);
    if (
      signature === row.dataset.committedValue ||
      signature === row.dataset.pendingValue
    ) {
      return;
    }
    row.dataset.pendingValue = signature;
    try {
      const { component, value } = JSON.parse(signature);
      const result = await session.dispatch('scene_apply_patch', {
        patch: {
          component,
          nodeId: node.id,
          op: 'updateComponent',
          value,
        },
      });
      row.dataset.committedValue = signature;
      syncSelectionFromResult(result);
      clearValidationResult();
      setComponentEditorMessage(inspector, '');
      refreshEditorStatus(session, camera);
      renderCanvas(session, camera);
    } finally {
      if (row.dataset.pendingValue === signature) {
        delete row.dataset.pendingValue;
      }
    }
  });
}

function renderDiagnosticsPanel(panel, session, camera) {
  const requestedTab = window.__IWSDK_EDITOR_BOTTOM_TAB || 'console';
  const bottomPanelContributions = contributionsForSlot('bottomPanel.tab');
  const contributionTabIds = bottomPanelContributions.map(
    (contribution) => 'contribution:' + contribution.id,
  );
  const activeTab = [
    'console',
    'events',
    'validation',
    ...contributionTabIds,
  ].includes(requestedTab)
    ? requestedTab
    : 'console';
  window.__IWSDK_EDITOR_BOTTOM_TAB = activeTab;
  panel.dataset.activeTab = activeTab;
  const tabList = panel.querySelector('.bottom-panel-tabs');
  if (tabList) {
    tabList
      .querySelectorAll('[data-contribution-tab]')
      .forEach((entry) => entry.remove());
    tabList.insertAdjacentHTML(
      'beforeend',
      bottomPanelContributions
        .map((contribution) => renderBottomPanelContributionTab(contribution))
        .join(''),
    );
  }
  panel.querySelectorAll('[data-bottom-tab]').forEach((button) => {
    const tab = button.getAttribute('data-bottom-tab');
    if (tab === activeTab) {
      button.setAttribute('data-active', '');
    } else {
      button.removeAttribute('data-active');
    }
    if (button.dataset.bound !== 'true') {
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        window.__IWSDK_EDITOR_BOTTOM_TAB = tab || 'console';
        renderDiagnosticsPanel(panel, session, camera);
      });
    }
  });

  const content = panel.querySelector('#bottom-panel-content');
  if (!content) {
    return;
  }

  if (activeTab.startsWith('contribution:')) {
    const contributionId = activeTab.slice('contribution:'.length);
    const contribution = bottomPanelContributions.find(
      (entry) => entry.id === contributionId,
    );
    content.innerHTML = contribution
      ? renderBottomPanelContributionContent(contribution)
      : '<div class="empty-state">Unknown contribution tab</div>';
    bindEditorContributionActions(session, camera);
    return;
  }

  if (activeTab === 'events') {
    const events = Array.isArray(window.__IWSDK_EDITOR_EVENTS)
      ? [...window.__IWSDK_EDITOR_EVENTS].reverse()
      : [];
    content.innerHTML = events.length
      ? \`
        <ul class="diagnostics-list">
          \${events
            .map(
              (event) => \`
                <li data-diagnostic-event="\${escapeHtml(event.method)}">
                  <strong>\${escapeHtml(event.action)}</strong>
                  <span>\${escapeHtml(event.method)}</span>
                  <em>\${escapeHtml(formatTimestamp(event.timestamp))}</em>
                </li>
              \`,
            )
            .join('')}
        </ul>
      \`
      : '<div class="empty-state">No scene events yet</div>';
    return;
  }

  if (activeTab === 'validation') {
    content.innerHTML = renderValidationDiagnostics(window.__IWSDK_EDITOR_VALIDATION);
    return;
  }

  content.innerHTML = '<div class="empty-state">Loading console logs...</div>';
  session
    .dispatch('scene_get_logs', { count: 12 })
    .then((result) => {
      if (window.__IWSDK_EDITOR_BOTTOM_TAB !== 'console') {
        return;
      }
      const logs = Array.isArray(result?.logs) ? [...result.logs].reverse() : [];
      content.innerHTML = logs.length
        ? \`
          <ul class="diagnostics-list">
            \${logs
              .map(
                (log) => \`
                  <li data-diagnostic-log="\${escapeHtml(log.level)}" data-state="\${escapeHtml(log.level)}">
                    <strong>\${escapeHtml(log.level)}</strong>
                    <span>\${escapeHtml(log.message)}</span>
                    <em>\${escapeHtml(formatTimestamp(log.timestamp))}</em>
                  </li>
                \`,
              )
              .join('')}
          </ul>
        \`
        : '<div class="empty-state">No console logs yet</div>';
    })
    .catch((error) => {
      content.innerHTML = \`<div class="empty-state">\${escapeHtml(String(error?.message || error))}</div>\`;
    });
}

function renderValidationDiagnostics(validation) {
  if (!validation) {
    return '<div class="empty-state">No validation result yet</div>';
  }
  const issues = Array.isArray(validation.issues) ? validation.issues : [];
  if (validation.valid === true && issues.length === 0) {
    return \`
      <ul class="diagnostics-list">
        <li data-diagnostic-validation="valid" data-state="info">
          <strong>Valid</strong>
          <span>Scene validation passed</span>
          <em>\${escapeHtml(String(issues.length))} issues</em>
        </li>
      </ul>
    \`;
  }
  if (issues.length === 0) {
    return \`
      <ul class="diagnostics-list">
        <li data-diagnostic-validation="unknown" data-state="warn">
          <strong>Unknown</strong>
          <span>Validation returned no issue details</span>
          <em>\${escapeHtml(String(validation.valid))}</em>
        </li>
      </ul>
    \`;
  }
  return \`
    <ul class="diagnostics-list">
      \${issues
        .map((issue, index) => {
          const path = issue?.path || issue?.nodeId || 'scene';
          const message = issue?.message || JSON.stringify(issue);
          const severity = issue?.severity || 'error';
          return \`
            <li data-diagnostic-validation="\${escapeHtml(path)}" data-state="\${escapeHtml(severity)}">
              <strong>\${escapeHtml(path)}</strong>
              <span>\${escapeHtml(message)}</span>
              <em>\${escapeHtml(severity + ' #' + (index + 1))}</em>
            </li>
          \`;
        })
        .join('')}
    </ul>
  \`;
}

function formatTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function inspectorSectionSummary(label, meta = '') {
  return \`
    <summary>
      <span class="inspector-section-title">
        <span class="inspector-section-chevron">\${renderLucideIcon('ChevronDown')}</span>
        <span>\${escapeHtml(label)}</span>
      </span>
      \${meta === '' ? '' : \`<span class="inspector-section-meta">\${escapeHtml(meta)}</span>\`}
    </summary>
  \`;
}

function renderAssetInspector(node, assets) {
  const selectedAsset = (assets || []).find((asset) => asset.id === node.asset);
  const options = [
    '<option value="">No asset</option>',
    ...(assets || []).map(
      (asset) =>
        '<option value="' +
        escapeHtml(asset.id) +
        '" ' +
        (asset.id === node.asset ? 'selected' : '') +
        '>' +
        escapeHtml(asset.name || asset.id) +
        '</option>',
    ),
  ].join('');
  const metadata = selectedAsset
    ? renderAssetInspectorMetadata(selectedAsset)
    : '<div class="asset-inspector-empty">This node has no asset reference.</div>';
  const warning =
    node.asset && !selectedAsset
      ? '<div class="asset-inspector-warning">Unknown asset reference: ' +
        escapeHtml(node.asset) +
        '</div>'
      : '';

  return \`
    <div class="asset-inspector-card">
      <label class="asset-reference-row">
        <span>Asset</span>
        <select data-node-asset-ref>\${options}</select>
      </label>
      \${warning}
      \${metadata}
    </div>
  \`;
}

function renderAssetInspectorMetadata(asset) {
  const rows = [
    ['ID', asset.id],
    ['Type', inferAssetType(asset)],
    ['URI', asset.uri],
    ['Bounds', assetInspectorBoundsText(asset)],
  ].filter(([, value]) => value != null && String(value).length > 0);

  return (
    '<dl class="asset-metadata-grid">' +
    rows
      .map(
        ([label, value]) =>
          '<div><dt>' +
          escapeHtml(label) +
          '</dt><dd title="' +
          escapeHtml(String(value)) +
          '">' +
          escapeHtml(String(value)) +
          '</dd></div>',
      )
      .join('') +
    '</dl>'
  );
}

function assetInspectorBoundsText(asset) {
  const bounds = asset.bounds;
  const min = bounds?.min;
  const max = bounds?.max;
  if (
    !Array.isArray(min) ||
    !Array.isArray(max) ||
    min.length !== 3 ||
    max.length !== 3
  ) {
    return '';
  }
  const size = max.map((value, index) =>
    Math.abs(Number(value) - Number(min[index] ?? value)),
  );
  if (!size.every((value) => Number.isFinite(value) && value >= 0 && value < 50)) {
    return 'unreliable raw bounds';
  }
  return size.map((value) => trimNumber(value, 3)).join(' x ') + 'm';
}

function renderMultiSelectInspector(inspector, session, camera, nodes) {
  const fields = [
    ['Position', 'position'],
    ['Rotation', 'rotationDeg'],
    ['Scale', 'scale'],
  ];
  inspector.innerHTML = \`
    <div class="inspector-node multi-select-inspector" data-multi-selection-count="\${nodes.length}">
      <div class="inspector-title">\${nodes.length} selected</div>
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.pinned"></div>
      <details class="inspector-section identity-editor" open>
        \${inspectorSectionSummary('Selection')}
        <div class="multi-selection-list">
          \${nodes
            .map((node) => '<code>' + escapeHtml(node.id) + '</code>')
            .join('')}
        </div>
      </details>
      <details class="inspector-section transform-section" open>
        \${inspectorSectionSummary('Common Transform')}
        <div class="transform-editor">
          \${fields
            .map(
              ([label, field]) => \`
                <div class="transform-row">
                  <span class="transform-row-label">\${label}</span>
                  \${[0, 1, 2]
                    .map((index) => {
                      const axis = ['X', 'Y', 'Z'][index];
                      const fieldKey = field + '.' + index;
                      const value = commonTransformFieldValue(nodes, field, index);
                      return (
                        '<label>' +
                        axis +
                        ' <input type="number" step="0.01" data-transform-field="' +
                        fieldKey +
                        '" value="' +
                        escapeHtml(value) +
                        '" placeholder="mixed" /></label>'
                      );
                    })
                    .join('')}
                </div>
              \`,
            )
            .join('')}
        </div>
        <div id="transform-editor-message"></div>
      </details>
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.global"></div>
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.section"></div>
    </div>
  \`;

  inspector.querySelectorAll('[data-transform-field]').forEach((input) => {
    input.addEventListener('change', () => {
      commitMultiTransformField(
        inspector,
        session,
        camera,
        nodes,
        input.getAttribute('data-transform-field') || '',
      );
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
    });
  });
}

function commitNodeTitleEdit(inspector, session, camera, node) {
  const input = inspector.querySelector('[data-node-title-edit]');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  const newNodeId = input.value.trim();
  if (newNodeId === node.id) {
    input.value = node.id;
    return;
  }
  runEditorMutation(async () => {
    const result = await session.dispatch('scene_apply_patch', {
      patch: {
        newNodeId,
        nodeId: node.id,
        op: 'renameNode',
      },
    });
    syncSelectionFromResult(result);
    clearValidationResult();
    renderUi(session, camera);
  });
}

function renderInspector(inspector, session, camera, node) {
  if (!node) {
    inspector.innerHTML = \`
      <div class="inspector-node">
        <div class="inspector-title">No selection</div>
        <div class="editor-slot inspector-slot" data-editor-slot="inspector.global"></div>
      </div>
    \`;
    return;
  }

  const transform = node.transform || {};
  const position = vec3FromTransform(transform, 'position', [0, 0, 0]);
  const rotationDeg = vec3FromTransform(transform, 'rotationDeg', [0, 0, 0]);
  const scale = scaleToEditorVec3(transform.scale);
  const fields = [
    ['Position', 'position', position],
    ['Rotation', 'rotationDeg', rotationDeg],
    ['Scale', 'scale', scale],
  ];
  const assets = session.document.assets || [];
  const componentSchemas = componentSchemasForDocument(session.document);
  const componentSchemaMap = new Map(
    componentSchemas.map((schema) => [schema.id, schema]),
  );
  const metadataText = jsonObjectText(node.metadata);
  const metadataKeyCount =
    node.metadata && typeof node.metadata === 'object'
      ? Object.keys(node.metadata).length
      : 0;
  const componentEntries = Object.entries(node.components || {});
  const componentRows = renderComponentRows(componentEntries, componentSchemaMap);
  const addableComponentOptions = componentSchemas
    .filter((schema) => node.components?.[componentNameForSchema(schema)] == null)
    .map(
      (schema) =>
        \`<option value="\${escapeHtml(schema.id)}">\${escapeHtml(schema.name || schema.id)}</option>\`,
    )
    .join('');

  inspector.innerHTML = \`
    <div class="inspector-node">
      <input class="inspector-title inspector-title-edit" data-node-title-edit value="\${escapeHtml(node.id)}" aria-label="Node name" title="Rename node" spellcheck="false" />
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.pinned"></div>
      <details class="inspector-section asset-editor" open>
        \${inspectorSectionSummary('Asset', node.asset || 'none')}
        \${renderAssetInspector(node, assets)}
      </details>
      <details class="inspector-section transform-section" open>
        \${inspectorSectionSummary('Transform')}
        <div class="transform-editor">
          \${fields
            .map(
              ([label, field, values]) => \`
                <div class="transform-row">
                  <span class="transform-row-label">\${label}</span>
                  <label>X <input type="number" step="0.01" data-transform-field="\${field}.0" value="\${values[0]}" /></label>
                  <label>Y <input type="number" step="0.01" data-transform-field="\${field}.1" value="\${values[1]}" /></label>
                  <label>Z <input type="number" step="0.01" data-transform-field="\${field}.2" value="\${values[2]}" /></label>
                  <button class="transform-reset-button icon-button" data-reset-transform="\${escapeHtml(field)}" title="Reset \${escapeHtml(label)}" aria-label="Reset \${escapeHtml(label)}">\${renderLucideIcon('RefreshCcw')}</button>
                </div>
              \`,
            )
            .join('')}
        </div>
        <div id="transform-editor-message"></div>
        <button id="apply-transform">\${renderLucideIcon('Check')}<span>Apply Transform</span></button>
      </details>
      <details class="inspector-section component-editor" open>
        \${inspectorSectionSummary('Components', String(componentEntries.length))}
        <div id="component-editor-message"></div>
        \${componentRows}
        <div class="component-row component-row-new">
          <label>Type
            <select id="new-component-type">\${addableComponentOptions}</select>
          </label>
          <button id="add-component" \${addableComponentOptions ? '' : 'disabled'}>\${renderLucideIcon('Plus')}<span>Add Component</span></button>
        </div>
      </details>
      <details class="inspector-section metadata-editor">
        \${inspectorSectionSummary('Metadata', metadataKeyCount + ' keys')}
        <div class="metadata-editor-card">
          <textarea data-node-metadata rows="5" spellcheck="false">\${escapeHtml(metadataText)}</textarea>
          <div id="metadata-editor-message"></div>
        </div>
      </details>
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.global"></div>
      <div class="editor-slot inspector-slot" data-editor-slot="inspector.section"></div>
    </div>
  \`;

  inspector.dataset.committedTransformValue = transformEditorSignature(
    readTransformFields(inspector, transform),
  );
  inspector.dataset.committedMetadataValue = JSON.stringify(node.metadata || {});
  inspector.querySelector('[data-node-title-edit]')?.addEventListener('focus', (event) => {
    if (event.target instanceof HTMLInputElement) {
      event.target.select();
    }
  });
  inspector.querySelector('[data-node-title-edit]')?.addEventListener('focusout', () => {
    commitNodeTitleEdit(inspector, session, camera, node);
  });
  inspector.querySelector('[data-node-title-edit]')?.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.target.value = node.id;
      event.target.blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.target.blur();
    }
  });
  inspector.querySelector('#apply-transform')?.addEventListener('click', () => {
    commitTransformFields(inspector, session, camera, node, transform);
  });
  inspector.querySelector('[data-node-metadata]')?.addEventListener('focusout', () => {
    commitNodeMetadata(inspector, session, camera, node);
  });
  inspector.querySelector('[data-node-metadata]')?.addEventListener('keydown', (event) => {
    if (
      event.key !== 'Enter' ||
      (!event.metaKey && !event.ctrlKey) ||
      !(event.target instanceof HTMLElement)
    ) {
      return;
    }
    event.preventDefault();
    event.target.blur();
  });
  inspector.querySelectorAll('[data-transform-field]').forEach((input) => {
    input.addEventListener('change', () => {
      commitTransformFields(inspector, session, camera, node, transform);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
      commitTransformFields(inspector, session, camera, node, transform);
    });
  });
  inspector.querySelectorAll('[data-reset-transform]').forEach((button) => {
    button.addEventListener('click', () => {
      resetTransformField(
        inspector,
        session,
        camera,
        node,
        button.getAttribute('data-reset-transform') || '',
      );
    });
  });
  inspector.querySelector('[data-node-asset-ref]')?.addEventListener('change', (event) => {
    runInspectorMutation(inspector, async () => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) {
        throw new Error('Missing asset reference field');
      }
      const asset = select.value;
      const patch = {
        nodeId: node.id,
        op: 'updateAssetRef',
        ...(asset ? { asset } : {}),
      };
      const result = await session.dispatch('scene_apply_patch', { patch });
      syncSelectionFromResult(result);
      clearValidationResult();
      renderUi(session, camera);
    });
  });
  inspector.querySelectorAll('[data-component-index]').forEach((row) => {
    row.dataset.committedValue = componentRowSignature(row, componentSchemaMap);
    row.addEventListener('change', (event) => {
      if (isComponentEditTarget(event.target)) {
        commitComponentRow(inspector, row, session, camera, node, componentSchemaMap);
      }
    });
    row.addEventListener('focusout', (event) => {
      if (isComponentEditTarget(event.target)) {
        commitComponentRow(inspector, row, session, camera, node, componentSchemaMap);
      }
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !isComponentEditTarget(event.target)) {
        return;
      }
      if (
        event.target instanceof HTMLTextAreaElement &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        return;
      }
      event.preventDefault();
      if (event.target instanceof HTMLElement) {
        event.target.blur();
      }
      commitComponentRow(inspector, row, session, camera, node, componentSchemaMap);
    });
    row.querySelector('[data-remove-component]')?.addEventListener('click', () => {
      runInspectorMutation(inspector, async () => {
        const component = row.getAttribute('data-component-name') || '';
        if (component.length === 0) {
          throw new Error('Component name is required');
        }
        await session.dispatch('scene_apply_patch', {
          patch: {
            component,
            nodeId: node.id,
            op: 'updateComponent',
          },
        });
        clearValidationResult();
        renderUi(session, camera);
      });
    });
  });
  inspector.querySelector('#add-component')?.addEventListener('click', () => {
    runInspectorMutation(inspector, async () => {
      const typeInput = inspector.querySelector('#new-component-type');
      if (!(typeInput instanceof HTMLSelectElement)) {
        throw new Error('Missing component type field');
      }
      const schema = componentSchemaMap.get(typeInput.value);
      if (!schema) {
        throw new Error('Component schema is required');
      }
      const component = componentNameForSchema(schema);
      await session.dispatch('scene_apply_patch', {
        patch: {
          component,
          nodeId: node.id,
          op: 'updateComponent',
          value: typedComponentValue(schema.id, defaultComponentProps(schema)),
        },
      });
      clearValidationResult();
      renderUi(session, camera);
    });
  });
}

function projectNodePosition(position, camera) {
  const view = camera?.view || 'quarter';
  switch (view) {
    case 'top':
      return [position[0], position[2]];
    case 'front':
      return [position[0], position[1]];
    case 'back':
      return [-position[0], position[1]];
    case 'left':
      return [position[2], position[1]];
    case 'right':
      return [-position[2], position[1]];
    case 'orbit': {
      const cameraPosition = camera?.position || [4, 3, 4];
      const length = Math.hypot(cameraPosition[0], cameraPosition[2]) || 1;
      const right = [cameraPosition[2] / length, -cameraPosition[0] / length];
      const depth = [cameraPosition[0] / length, cameraPosition[2] / length];
      return [
        position[0] * right[0] + position[2] * right[1],
        position[1] - (position[0] * depth[0] + position[2] * depth[1]) * 0.25,
      ];
    }
    case 'custom':
    case 'quarter':
    default:
      return [
        (position[0] - position[2]) * 0.7,
        position[1] - (position[0] + position[2]) * 0.25,
      ];
  }
}

function canvasProjectionMetrics(canvas) {
  return {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    scale: Math.min(canvas.width, canvas.height) / 10,
  };
}

function projectNodeToCanvas(position, camera, metrics) {
  const [xAxis, yAxis] = projectNodePosition(position, camera);
  return {
    x: metrics.centerX + xAxis * metrics.scale,
    y: metrics.centerY - yAxis * metrics.scale,
  };
}

function eventCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width === 0 ? 1 : canvas.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function screenDeltaToPositionDelta(deltaX, deltaY, camera, metrics) {
  const xAxisDelta = deltaX / metrics.scale;
  const yAxisDelta = -deltaY / metrics.scale;
  const view = camera?.view || 'quarter';
  switch (view) {
    case 'top':
      return [xAxisDelta, 0, yAxisDelta];
    case 'front':
      return [xAxisDelta, yAxisDelta, 0];
    case 'back':
      return [-xAxisDelta, yAxisDelta, 0];
    case 'left':
      return [0, yAxisDelta, xAxisDelta];
    case 'right':
      return [0, yAxisDelta, -xAxisDelta];
    case 'orbit':
    case 'custom':
    case 'quarter':
    default: {
      const difference = xAxisDelta / 0.7;
      const sum = yAxisDelta / -0.25;
      return [(difference + sum) / 2, 0, (sum - difference) / 2];
    }
  }
}

function roundVec3(values) {
  return values.map((value) => Number(value.toFixed(4)));
}

function pickCanvasNode(session, camera, canvas, event) {
  if (!editorWorldState) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  editorWorldState.pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  editorWorldState.raycaster.setFromCamera(
    editorWorldState.pointer,
    editorWorldState.world.camera,
  );
  const intersections = editorWorldState.raycaster.intersectObjects(
    [...editorWorldState.objectMap.values()],
    true,
  );
  for (const intersection of intersections) {
    let current = intersection.object;
    while (current) {
      const nodeId = current.userData?.iwsdkSceneNodeId;
      if (typeof nodeId === 'string') {
        const node = findNodeById(session.document, nodeId);
        if (node) {
          return {
            node,
            point: eventCanvasPoint(canvas, event),
          };
        }
      }
      current = current.parent;
    }
  }
  return null;
}

function renderCanvas(session, camera, size = {}) {
  if (!editorWorldState) {
    return;
  }
  syncEditorWorld(session, camera, size);
}

function renderUi(session, camera) {
  window.__IWSDK_EDITOR_CAMERA = camera;
  const documentValue = session.document;
  const assets = documentValue.assets || [];
  const nodes = nodesInDocument(documentValue);
  const status = document.getElementById('scene-status');
  const dirtyStatus = document.getElementById('dirty-status');
  const statusStrip = document.getElementById('editor-status-strip');
  const diagnosticsPanel = document.getElementById('editor-bottom-panel');
  const outlinerFilter = document.getElementById('scene-graph-filter');
  const outliner = document.getElementById('outliner');
  const rootDropTarget = document.getElementById('scene-root-drop-target');
  const assetCatalogFilter = document.getElementById('asset-catalog-filter');
  const assetCatalog = document.getElementById('asset-catalog');
  const inspector = document.getElementById('inspector');
  const selected = window.__IWSDK_EDITOR_SELECTION || [];

  if (status) {
    status.textContent = \`\${nodes.length} nodes, \${assets.length} assets\`;
  }
  if (dirtyStatus) {
    dirtyStatus.textContent = session.isDirty ? 'Unsaved changes' : 'Saved';
    dirtyStatus.dataset.state = session.isDirty ? 'dirty' : 'saved';
  }
  if (statusStrip) {
    statusStrip.textContent = [
      documentStatusLabel(),
      \`\${nodes.length} nodes\`,
      session.isDirty ? 'unsaved changes' : 'saved',
      'IWSDK WebGL',
    ].join(' | ');
    statusStrip.dataset.state = session.isDirty ? 'dirty' : 'saved';
  }
  if (diagnosticsPanel) {
    renderDiagnosticsPanel(diagnosticsPanel, session, camera);
  }
  renderTransformToolbar();
  const outlinerQuery =
    outlinerFilter instanceof HTMLInputElement
      ? outlinerFilter.value.trim().toLowerCase()
      : '';
  if (
    outlinerFilter instanceof HTMLInputElement &&
    outlinerFilter.dataset.bound !== 'true'
  ) {
    outlinerFilter.dataset.bound = 'true';
    outlinerFilter.addEventListener('input', () => {
      hideSceneGraphContextMenu();
      renderUi(session, currentEditorCamera(camera));
    });
  }
  const assetQuery =
    assetCatalogFilter instanceof HTMLInputElement
      ? assetCatalogFilter.value.trim().toLowerCase()
      : '';
  if (
    assetCatalogFilter instanceof HTMLInputElement &&
    assetCatalogFilter.dataset.bound !== 'true'
  ) {
    assetCatalogFilter.dataset.bound = 'true';
    assetCatalogFilter.addEventListener('input', () => {
      renderUi(session, currentEditorCamera(camera));
    });
  }
  if (
    rootDropTarget instanceof HTMLElement &&
    rootDropTarget.dataset.bound !== 'true'
  ) {
    rootDropTarget.dataset.bound = 'true';
    rootDropTarget.addEventListener('dragover', (event) => {
      const draggedNodeId = draggedOutlinerNodeIdFromEvent(event);
      const validDrop = isValidOutlinerDrop(
        session.document,
        draggedNodeId,
        null,
      );
      if (!validDrop) {
        setOutlinerDropState(rootDropTarget, false);
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      setOutlinerDropState(rootDropTarget, true);
    });
    rootDropTarget.addEventListener('dragleave', () => {
      setOutlinerDropState(rootDropTarget, false);
    });
    rootDropTarget.addEventListener('drop', (event) => {
      event.preventDefault();
      setOutlinerDropState(rootDropTarget, false);
      const draggedNodeId = draggedOutlinerNodeIdFromEvent(event);
      window.__IWSDK_EDITOR_DRAG_NODE_ID = null;
      if (!isValidOutlinerDrop(session.document, draggedNodeId, null)) {
        return;
      }
      applyOutlinerReparent(
        session,
        currentEditorCamera(camera),
        draggedNodeId,
        null,
      );
    });
  }
  if (outliner) {
    const rows = renderOutlinerRows(
      documentValue.nodes || [],
      selected,
      0,
      outlinerQuery,
    );
    outliner.innerHTML =
      rows ||
      '<div class="empty-state" data-empty-outliner>No matching nodes</div>';
    outliner.querySelectorAll('[data-node-id]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        hideSceneGraphContextMenu();
        const nodeId = button.getAttribute('data-node-id');
        if (!nodeId) {
          return;
        }
        const nodeIds = selectionForNodeClick(nodeId, event);
        window.__IWSDK_EDITOR_SELECTION = nodeIds;
        await session.dispatch('scene_select', { nodeIds });
        renderUi(session, currentEditorCamera(camera));
      });
      button.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        const nodeId = button.getAttribute('data-node-id');
        if (!nodeId) {
          return;
        }
        const currentSelection = selectedOutlinerNodeIds();
        const nodeIds = currentSelection.includes(nodeId)
          ? currentSelection
          : [nodeId];
        window.__IWSDK_EDITOR_SELECTION = nodeIds;
        await session.dispatch('scene_select', { nodeIds });
        const liveCamera = currentEditorCamera(camera);
        renderUi(session, liveCamera);
        showSceneGraphContextMenu(session, liveCamera, nodeId, {
          x: event.clientX,
          y: event.clientY,
        });
      });
      button.addEventListener('dragstart', (event) => {
        hideSceneGraphContextMenu();
        const nodeId = button.getAttribute('data-node-id');
        if (!nodeId || !event.dataTransfer) {
          return;
        }
        window.__IWSDK_EDITOR_DRAG_NODE_ID = nodeId;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', nodeId);
      });
      button.addEventListener('dragend', () => {
        window.__IWSDK_EDITOR_DRAG_NODE_ID = null;
        setOutlinerDropState(button, false);
        if (rootDropTarget instanceof HTMLElement) {
          setOutlinerDropState(rootDropTarget, false);
        }
      });
      button.addEventListener('dragover', (event) => {
        const targetNodeId = button.getAttribute('data-node-id');
        const draggedNodeId = draggedOutlinerNodeIdFromEvent(event);
        const validDrop = isValidOutlinerDrop(
          session.document,
          draggedNodeId,
          targetNodeId,
        );
        if (!validDrop) {
          setOutlinerDropState(button, false);
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        setOutlinerDropState(button, true);
      });
      button.addEventListener('dragleave', () => {
        setOutlinerDropState(button, false);
      });
      button.addEventListener('drop', (event) => {
        event.preventDefault();
        setOutlinerDropState(button, false);
        const targetNodeId = button.getAttribute('data-node-id');
        const draggedNodeId = draggedOutlinerNodeIdFromEvent(event);
        window.__IWSDK_EDITOR_DRAG_NODE_ID = null;
        if (
          !targetNodeId ||
          !isValidOutlinerDrop(session.document, draggedNodeId, targetNodeId)
        ) {
          return;
        }
        applyOutlinerReparent(
          session,
          currentEditorCamera(camera),
          draggedNodeId,
          targetNodeId,
        );
      });
    });
  }
  if (assetCatalog) {
    assetCatalog.innerHTML = renderAssetCatalog(assets, assetQuery);
    assetCatalog.querySelectorAll('[data-add-asset]').forEach((button) => {
      button.addEventListener('click', () => {
        const assetId = button.getAttribute('data-add-asset');
        if (assetId) {
          addAssetFromCatalog(session, currentEditorCamera(camera), assetId);
        }
      });
    });
  }
  if (inspector) {
    const selectedNodes = selected
      .map((nodeId) => findNodeById(documentValue, nodeId))
      .filter(Boolean);
    if (selectedNodes.length > 1) {
      renderMultiSelectInspector(inspector, session, camera, selectedNodes);
    } else {
      renderInspector(inspector, session, camera, selectedNodes[0] || null);
    }
  }
  renderEditorContributionSlots(session, camera);
  renderCanvas(session, camera);
}

function attachCanvasInteractions(canvas, session, getCamera, rerender) {
  let clickCandidate = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || eventHitsTransformControls(canvas, event)) {
      clickCandidate = null;
      return;
    }
    clickCandidate = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    };
  }, true);

  canvas.addEventListener('pointerup', async (event) => {
    const candidate = clickCandidate;
    clickCandidate = null;
    if (!candidate || candidate.pointerId !== event.pointerId) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - candidate.clientX,
      event.clientY - candidate.clientY,
    );
    if (distance > 4 || eventHitsTransformControls(canvas, event)) {
      return;
    }
    const camera = getCamera();
    const hit = pickCanvasNode(session, camera, canvas, event);
    if (!hit) {
      return;
    }
    const nodeIds = selectionForNodeClick(hit.node.id, event);
    window.__IWSDK_EDITOR_SELECTION = nodeIds;
    await session.dispatch('scene_select', { nodeIds });
    rerender();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!editorWorldState?.transformDragState) {
      if (event.buttons !== 0 || eventHitsTransformControls(canvas, event)) {
        return;
      }
      const camera = getCamera();
      const hit = pickCanvasNode(session, camera, canvas, event);
      updateHoverHelper(session, hit?.node.id ?? null);
      renderEditorWorld();
      requestEditorUiRefresh();
      return;
    }
    queueMicrotask(() => {
      if (!editorWorldState?.transformDragState) {
        return;
      }
      updateSelectionHelpers();
      renderEditorWorld();
      if (editorWorldState.currentSession) {
        updateProjectedHitTargets(editorWorldState.currentSession);
      }
      editorWorldState.lastProof = createViewportProof();
    });
  });

  canvas.addEventListener('pointercancel', (event) => {
    if (clickCandidate?.pointerId === event.pointerId) {
      clickCandidate = null;
    }
    updateHoverHelper(session, null);
    if (editorWorldState) {
      renderEditorWorld();
      editorWorldState.lastProof = createViewportProof();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    updateHoverHelper(session, null);
    if (editorWorldState) {
      renderEditorWorld();
      editorWorldState.lastProof = createViewportProof();
    }
  });
}

function isTextEditingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable === true
  );
}

function attachKeyboardShortcuts(session, getCamera, rerender) {
  document.addEventListener('keydown', async (event) => {
    if (isTextEditingTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (!event.metaKey && !event.ctrlKey) {
      if (key === 'escape') {
        if (cancelTransformControlDrag(session)) {
          event.preventDefault();
          rerender();
          return;
        }
      }
      if (key === 'w') {
        event.preventDefault();
        setTransformMode('translate');
        return;
      }
      if (key === 'e') {
        event.preventDefault();
        setTransformMode('rotate');
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        setTransformMode('scale');
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        frameViewport('selection', getCamera());
        rerender();
        return;
      }
      if (key === 'q') {
        event.preventDefault();
        setTransformSpace(
          editorWorldState?.transformSpace === 'world' ? 'local' : 'world',
        );
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        const nodeIds = window.__IWSDK_EDITOR_SELECTION || [];
        if (nodeIds.length === 0) {
          return;
        }
        event.preventDefault();
        for (const nodeId of nodeIds) {
          await session.dispatch('scene_remove_node', { nodeId });
        }
        window.__IWSDK_EDITOR_SELECTION = [];
        clearValidationResult();
        rerender();
        return;
      }
      if (key === '1') {
        event.preventDefault();
        const result = await session.dispatch('scene_set_camera', { view: 'top' });
        Object.assign(getCamera(), result.camera);
        rerender();
        return;
      }
      return;
    }
    if (!event.metaKey && !event.ctrlKey) {
      return;
    }
    if (key === 'z') {
      event.preventDefault();
      await session.dispatch(event.shiftKey ? 'scene_redo' : 'scene_undo', {});
      clearValidationResult();
      rerender();
      return;
    }
    if (key === 'y') {
      event.preventDefault();
      await session.dispatch('scene_redo', {});
      clearValidationResult();
      rerender();
      return;
    }
    if (key === 's') {
      event.preventDefault();
      runEditorMutation(async () => {
        await session.dispatch('scene_save', {});
        rerender();
      });
      return;
    }
  });
}

async function init() {
  createEditorFrame();
  attachWorkspaceViewControls();
  await loadEditorRuntimeDependencies();
  if (!hasConfiguredScenePath()) {
    runtimeHandles = (method) => handlesWorkspaceMethod(method);
    runtimeDispatch = (method, params = {}) =>
      dispatchWorkspaceCommand(null, method, params);
    window.IWSDK_SCENE_EDITOR = {
      listContributions: () => [],
      registerContribution: registerEditorContribution,
      runtime: window.FRAMEWORK_MCP_RUNTIME,
      session: null,
      unregisterContribution: unregisterEditorContribution,
    };
    await renderScenePicker();
    return;
  }
  const loadedScene = await fetchSceneDocumentWithRevision(documentUrl);
  const documentValue = loadedScene.document;
  sceneDocumentRevision = loadedScene.revision;
  let activeCamera = { fov: 50, lookAt: [0, 0, 0], position: [4, 3, 4], view: 'quarter' };
  window.__IWSDK_EDITOR_SELECTION = [];

  const session = new SceneEditorSession({
    componentSchemas: runtimeComponentSchemas(),
    document: documentValue,
    saveDocument: async (serializedDocument) => {
      const headers = { 'Content-Type': 'application/json' };
      if (sceneDocumentRevision != null) {
        headers['If-Match'] = sceneDocumentRevision;
      }
      const saveResponse = await fetch(documentUrl, {
        body: serializedDocument,
        headers,
        method: 'PUT',
      });
      const text = await saveResponse.text();
      const json = text ? JSON.parse(text) : {};
      if (!saveResponse.ok) {
        throw sceneFetchError(json, text || saveResponse.statusText);
      }
      sceneDocumentRevision =
        json?.revision ||
        saveResponse.headers.get('X-IWSDK-Scene-Revision') ||
        sceneDocumentRevision;
      return json;
    },
    screenshot: async (camera, size) => {
      activeCamera = camera;
      renderCanvas(session, camera, size);
      await waitForAssetLoads();
      renderCanvas(session, camera, size);
      const canvas = getCanvas();
      const imageData = canvas.toDataURL('image/png').split(',')[1] || '';
      return { camera, imageData, mimeType: 'image/png' };
    },
  });
  const dispatchSceneCommand = session.dispatch.bind(session);
  session.dispatch = async (method, params = {}) => {
    const result = await dispatchSceneCommand(method, params);
    recordEditorEvent(method, result);
    let finalResult = result;
    if (method === 'scene_save') {
      reloadWorkspaceRuntimeFrame();
    } else if (
      shouldAutosaveAfterMethod(method) &&
      session.isDirty &&
      mutationResultIsValid(result)
    ) {
      try {
        finalResult = mergeAutosaveResult(
          result,
          await session.dispatch('scene_save', {}),
        );
      } catch (error) {
        handleEditorMutationError(error);
      }
    }
    return finalResult;
  };

  await createEditorWorld(session, activeCamera);

  const runtime = window.FRAMEWORK_MCP_RUNTIME;
  runtimeHandles = (method) =>
    handlesWorkspaceMethod(method) || session.handles(method);
  runtimeDispatch = async (method, params = {}) => {
    const result = handlesWorkspaceMethod(method)
      ? await dispatchWorkspaceCommand(session, method, params)
      : await session.dispatch(method, params);
    syncSelectionFromResult(result);
    if (method === 'scene_validate') {
      setValidationResult(result);
    } else if (invalidatesValidation(method)) {
      if (result && typeof result === 'object' && result.valid === false) {
        setValidationResult(result);
      } else {
        clearValidationResult();
      }
    }
    if (method === 'scene_get_selection' || method === 'scene_select') {
      const selection = await session.dispatch('scene_get_selection', {});
      window.__IWSDK_EDITOR_SELECTION = selection.nodeIds || [];
    }
    if (method === 'scene_set_camera' && result.camera) {
      activeCamera = result.camera;
    }
    renderUi(session, activeCamera);
    return result;
  };
  window.IWSDK_SCENE_EDITOR = {
    listContributions: () =>
      editorContributions().map(contributionPublicSnapshot),
    registerContribution: registerEditorContribution,
    runtime,
    session,
    unregisterContribution: unregisterEditorContribution,
  };
  window.IWSDK_SCENE_EDITOR_TEST_HOOKS = {
    captureViewport: (camera = activeCamera, size = {}) => {
      renderCanvas(session, camera, size);
      const canvas = getCanvas();
      return {
        camera,
        imageDataLength: canvas.toDataURL('image/png').length,
        proof: createViewportProof(),
      };
    },
    getCamera: () => activeCamera,
    getObjectSummary: () => ({
      ids: editorWorldState ? [...editorWorldState.objectMap.keys()] : [],
      objectCount: editorWorldState?.objectMap.size ?? 0,
    }),
    getContributions: () => editorContributionProof(),
    getProof: () => createViewportProof(),
    getTransformControlObjectTransform: () =>
      objectTransformProof(editorWorldState?.transformControls?.object),
    findTransformControlPointerTarget: (axis = 'X') =>
      findTransformControlPointerTarget(axis),
    beginTransformControlDrag: (transform) => {
      const nodeId = selectedNodeId();
      if (!nodeId || !editorWorldState?.transformControls?.object) {
        throw new Error('A selected node with attached transform controls is required');
      }
      const node = findNodeById(session.document, nodeId);
      if (!node) {
        throw new Error('Selected node "' + nodeId + '" is missing');
      }
      editorWorldState.transformDragState = {
        nodeId,
        startTransform: cloneTransform(node.transform || {}),
      };
      editorWorldState.orbitControls.enabled = false;
      if (transform) {
        applyNodeTransform(editorWorldState.transformControls.object, transform);
      }
      updateSelectionHelpers();
      renderEditorWorld();
      updateProjectedHitTargets(session);
      editorWorldState.lastProof = createViewportProof();
      return {
        documentTransform: findNodeById(session.document, nodeId)?.transform,
        objectTransform: objectTransformProof(editorWorldState.transformControls.object),
        proof: createViewportProof(),
      };
    },
    cancelTransformControlDrag: () => {
      const cancelled = cancelTransformControlDrag(session);
      renderUi(session, activeCamera);
      return {
        cancelled,
        proof: createViewportProof(),
      };
    },
    setCamera: async (camera) => {
      const result = await session.dispatch('scene_set_camera', camera);
      activeCamera = result.camera;
      renderUi(session, activeCamera);
      return result;
    },
    frameViewport: (target = 'selection') => {
      activeCamera = frameViewport(target, activeCamera) || activeCamera;
      renderUi(session, activeCamera);
      return activeCamera;
    },
    setTransformMode: (mode) => setTransformMode(mode),
    setSurfacePlacementEnabled: (enabled) =>
      setSurfacePlacementEnabled(enabled),
    setTransformSnapEnabled: (enabled) => setTransformSnapEnabled(enabled),
    setTransformSpace: (space) => setTransformSpace(space),
    simulateTransformControlCommit: async (transform) => {
      const nodeId = selectedNodeId();
      if (!nodeId || !editorWorldState?.transformControls?.object) {
        throw new Error('A selected node with attached transform controls is required');
      }
      const node = findNodeById(session.document, nodeId);
      if (!node) {
        throw new Error(\`Selected node "\${nodeId}" is missing\`);
      }
      editorWorldState.transformDragState = {
        nodeId,
        startTransform: cloneTransform(node.transform || {}),
      };
      applyNodeTransform(editorWorldState.transformControls.object, transform);
      await commitTransformControlDrag(session, () => renderUi(session, activeCamera));
      return {
        documentTransform: findNodeById(session.document, nodeId)?.transform,
        proof: createViewportProof(),
      };
    },
  };

  document.querySelectorAll('[data-transform-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-transform-mode');
      if (mode) {
        setTransformMode(mode);
      }
    });
  });
  document.querySelectorAll('[data-transform-space]').forEach((button) => {
    button.addEventListener('click', () => {
      const space = button.getAttribute('data-transform-space');
      if (space) {
        setTransformSpace(space);
      }
    });
  });
  document.querySelectorAll('[data-transform-snap]').forEach((button) => {
    button.addEventListener('click', () => {
      setTransformSnapEnabled(!editorWorldState?.transformSnapEnabled);
    });
  });
  document.querySelectorAll('[data-surface-placement]').forEach((button) => {
    button.addEventListener('click', () => {
      setSurfacePlacementEnabled(!editorWorldState?.surfacePlacementEnabled);
    });
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('#scene-graph-context-menu')
    ) {
      return;
    }
    hideSceneGraphContextMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSceneGraphContextMenu();
    }
  });
  document.getElementById('undo')?.addEventListener('click', async () => {
    await session.dispatch('scene_undo', {});
    clearValidationResult();
    renderUi(session, activeCamera);
  });
  document.getElementById('redo')?.addEventListener('click', async () => {
    await session.dispatch('scene_redo', {});
    clearValidationResult();
    renderUi(session, activeCamera);
  });
  document.getElementById('save')?.addEventListener('click', async () => {
    runEditorMutation(async () => {
      await session.dispatch('scene_save', {});
      renderUi(session, activeCamera);
    });
  });
  document.getElementById('revert')?.addEventListener('click', () => {
    window.location.reload();
  });
  attachCanvasInteractions(
    getCanvas(),
    session,
    () => activeCamera,
    () => renderUi(session, activeCamera),
  );
  attachKeyboardShortcuts(
    session,
    () => activeCamera,
    () => renderUi(session, activeCamera),
  );

  renderUi(session, activeCamera);
}

function shouldRetryEditorStartup(error) {
  const message = String(error?.message || error);
  if (!message.includes('Failed to fetch dynamically imported module')) {
    return false;
  }
  if (sessionStorage.getItem(EDITOR_OPTIMIZE_RELOAD_KEY) === '1') {
    return false;
  }
  sessionStorage.setItem(EDITOR_OPTIMIZE_RELOAD_KEY, '1');
  window.location.reload();
  return true;
}

init().then(() => {
  sessionStorage.removeItem(EDITOR_OPTIMIZE_RELOAD_KEY);
}).catch((error) => {
  if (shouldRetryEditorStartup(error)) {
    return;
  }
  console.error('[IWSDK Scene Editor] Failed to initialize:', error);
  setRoot(\`<main class="editor-error"><h1>IWSDK Scene Editor</h1><pre>\${String(error?.message || error)}</pre></main>\`);
});
`;
}

export function createEditorShellHtml(
  injectionVirtualId: string,
  editorRuntimeVirtualId: string,
  editorStylesheetVirtualId: string,
  documentUrl: string,
  options: {
    sceneFilesUrl?: string;
    workspaceRoute?: string;
  } = {},
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="${editorStylesheetVirtualId}" />
    <title>IWSDK Scene Editor</title>
    <script>
      window.__IWER_MCP_MANAGED = true;
      window.__IWSDK_MCP_PAGE_ROLE = 'editor';
      window.__IWSDK_SCENE_SESSION_ID =
        window.__IWSDK_SCENE_SESSION_ID ||
        'scene-' + Math.random().toString(36).slice(2);
      window.__IWSDK_EDITOR_CONFIG = {
        documentUrl: ${JSON.stringify(documentUrl)},
        sceneFilesUrl: ${JSON.stringify(options.sceneFilesUrl ?? '/__iwsdk/workspace/scenes')},
        workspaceRoute: ${JSON.stringify(options.workspaceRoute ?? '/__iwsdk/workspace')}
      };
    </script>
    <script>
      import(${JSON.stringify(editorRuntimeVirtualId)}).catch((error) => {
        console.error('[IWSDK Scene Editor] Failed to load runtime module:', error);
        const root = document.getElementById('root');
        const message = String(error && (error.stack || error.message) || error)
          .replace(/[&<>]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
          })[character]);
        if (root) {
          root.innerHTML =
            '<main class="editor-error"><h1>IWSDK Scene Editor</h1><pre>' +
            message +
            '</pre></main>';
        }
      });
    </script>
    <script type="module" src="${injectionVirtualId}"></script>
  </head>
  <body>
    <div id="root">
      <main>
        <h1>IWSDK Scene Editor</h1>
        <p>The native editor route is connected to the IWSDK dev runtime. Editor UI modules will mount here as the scene composition stack lands.</p>
      </main>
    </div>
  </body>
</html>`;
}
