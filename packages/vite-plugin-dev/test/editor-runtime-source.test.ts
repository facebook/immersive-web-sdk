/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  createEditorRuntimeModuleSource,
  createEditorShellHtml,
} from '../src/editor/editor-runtime-source.js';

const workspaceSource = readFileSync(
  new URL('../src/editor/editor-workspace.tsx', import.meta.url),
  'utf8',
);

function createRuntimeSource(): string {
  return createEditorRuntimeModuleSource(
    '/editor-session.js',
    '/core.js',
    '/assets.js',
    '/components.js',
    '/orbit-controls.js',
    '/transform-controls.js',
    '/viewport-gizmo.js',
    {},
    '/scene-composition.js',
  );
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThan(-1);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('editor runtime source', () => {
  test('shows startup progress for real editor loading phases', () => {
    const source = createRuntimeSource();
    const shell = createEditorShellHtml(
      '/injection.js',
      '/editor-runtime.js',
      '/editor.css',
      '/__iwsdk/editor/document',
    );

    expect(shell).toContain('class="editor-loading"');
    expect(shell).toContain('editor-loading-progress-indeterminate');
    expect(shell).not.toContain('Editor UI modules will mount here');
    expect(source).toContain(
      "updateEditorStartupProgress('Loading editor modules…', 12)",
    );
    expect(source).toContain(
      "updateEditorStartupProgress('Loading scene…', 48)",
    );
    expect(source).toContain(
      "updateEditorStartupProgress('Building scene preview…', 70)",
    );
    expect(source).toContain('completeEditorStartup();');
  });

  test('exposes runtime and editor workspace views with a page reload control', () => {
    const source = createRuntimeSource();
    const viewState = section(
      source,
      'window.__IWSDK_WORKSPACE_VIEW =',
      'window.__IWSDK_WORKSPACE_PAGE_ID =',
    );
    const viewSetter = section(
      source,
      'async function setWorkspaceView',
      'function forceEditorViewportRender',
    );
    const frame = section(
      source,
      'function createEditorFrame',
      'function getViewportHost',
    );
    const controller = section(
      source,
      'function editorWorkspaceController',
      'function createEditorFrame',
    );

    expect(viewState).toContain('initialWorkspaceRoute.view');
    expect(viewSetter).toContain("['runtime', 'editor']");
    expect(viewSetter).toContain(
      'workspace_set_view.view must be runtime or editor',
    );
    expect(frame).toContain('mountEditorWorkspace(root');
    expect(workspaceSource).toContain('data-workspace-view-button={view}');
    expect(workspaceSource).toContain("(['runtime', 'editor'] as const)");
    expect(workspaceSource).toContain('data-workspace-reload-button');
    expect(workspaceSource).toContain('controller.reloadPage?.()');
    expect(controller).toContain('window.location.reload()');
    expect(workspaceSource).not.toContain("'split'");
  });

  test('keeps editor view and scene selection in the visible URL', () => {
    const source = createRuntimeSource();
    const sceneImport = section(
      source,
      'function readStoredWorkspaceScenePath',
      'function currentScenePath',
    );
    const sceneOpen = section(
      source,
      'function documentUrlForScene',
      'async function fetchJsonOrThrow',
    );

    expect(source).toContain(
      "const WORKSPACE_SCENE_PATH_KEY = 'iwsdk-workspace-scene-path'",
    );
    expect(source).toContain("const WORKSPACE_EDITOR_HASH_PREFIX = '#editor'");
    expect(sceneImport).toContain("pageUrl.searchParams.get('scene')");
    expect(sceneImport).toContain(
      "scenePath: relativePath.startsWith('public/scenes/')",
    );
    expect(sceneImport).toContain(
      "relativePath.split('/').map(encodeURIComponent)",
    );
    expect(sceneImport).toContain(
      "const view = editorRoute.matched || legacyScenePath ? 'editor' : 'runtime'",
    );
    expect(sceneOpen).toContain('storeWorkspaceScenePath(scenePath)');
    expect(sceneOpen).toContain("syncWorkspaceLocation('editor', scenePath)");
    expect(sceneOpen).toContain('window.location.reload()');
    expect(source).toContain(
      "window.addEventListener('hashchange', applyWorkspaceLocation)",
    );
    expect(source).toContain(
      "window.addEventListener('popstate', applyWorkspaceLocation)",
    );
    expect(source).toContain('fetchComposedSceneDocument(currentScenePath())');
    expect(source).toContain('if (sceneFiles.length === 1)');
    expect(source).toContain('storeWorkspaceScenePath(sceneFiles[0].path)');
    expect(source).toContain('installSceneFileWatcher(session');
    expect(source).toContain('fetch(activeDocumentUrl(), {');
  });

  test('reloads watched root and module files without exposing mutation tools', () => {
    const source = createRuntimeSource();

    expect(source).toContain("import.meta.hot.on('iwsdk:scene-file-change'");
    expect(source).toContain('session.replaceFromDisk(loaded.document)');
    expect(source).toContain("status: 'invalid'");
    expect(source).toContain("status: 'conflict'");
    expect(source).toContain("'scene_render_file'");
    expect(source).not.toContain(
      "'scene_replace_document',\n    'scene_apply_transaction'",
    );
  });

  test('shares one canonical UIKitML asset render across editor consumers', () => {
    const source = createRuntimeSource();
    const panelDocument = section(
      source,
      'async function createEditorPanelDocument',
      'function refreshEditorPanelClassLists',
    );

    expect(panelDocument).toContain(
      'loadUIKitMLComponent(config, { forceReload: true })',
    );

    const thumbnailRender = section(
      source,
      'async function generateAssetThumbnails',
      'function sceneComponentScalar',
    );
    const sceneRender = section(
      source,
      'async function materializeEditorPanelPreviews',
      'function disposeEditorPanelPreviews',
    );
    expect(thumbnailRender).toContain(
      'await getEditorPanelAssetPreview(asset.id)',
    );
    expect(sceneRender).toContain(
      'await getEditorPanelAssetPreview(props.config)',
    );
    expect(sceneRender).not.toContain('renderEditorPanelCanvas(');
    expect(source).toContain('const assetPanelPreviewCache = new Map()');

    const detachedRender = section(
      source,
      'async function renderSceneFile',
      'async function setWorkspaceView',
    );
    expect(detachedRender).toContain(
      'scheduleEditorSceneLowering(temporarySession, { force: true })',
    );
  });

  test('settles UIKitML previews from render and resource signals', () => {
    const source = createRuntimeSource();
    const scheduler = section(
      source,
      'function createEditorPanelFrameScheduler',
      'function refreshEditorPanelClassLists',
    );
    const settle = section(
      source,
      'async function settleEditorPanelLayout',
      'function disposeEditorPanelDocument',
    );

    expect(scheduler).toContain('rootContext.requestFrame = requestFrame');
    expect(scheduler).toContain('rootContext.requestRender = requestRender');
    expect(scheduler).toContain('object.fontSignal?.subscribe');
    expect(scheduler).toContain('object.texture?.subscribe');
    expect(settle).toContain('frameScheduler.resourcesReady()');
    expect(settle).toContain('frameScheduler.waitForFrameRequest(remaining)');
    expect(settle).not.toContain('minimumRenderFrames');
    expect(settle).not.toContain('stableFrames');
  });

  test('authors visibility intrinsically while keeping outliner visibility preview-only', () => {
    const source = createRuntimeSource();
    const schemas = section(
      source,
      'function authoredNodeVisible',
      'function runtimeComponentSchemas',
    );
    const inspector = section(
      source,
      'function renderInspector',
      'function projectNodePosition',
    );

    expect(schemas).toContain(
      "node?.components?.['com.iwsdk.components.Visibility']",
    );
    expect(schemas).toContain('schema.editor?.hidden !== true');
    expect(inspector).toContain('data-node-visible');
    expect(inspector).toContain("op: 'updateVisibility'");
    expect(workspaceSource).toContain('data-preview-visibility-toggle');
    expect(workspaceSource).toContain('Hide in editor');
    expect(workspaceSource).toContain('Show in editor');
  });

  test('stops the automatic world loop before configuring the editor renderer', () => {
    const source = createRuntimeSource();
    const worldCreated = source.indexOf('const world = await World.create');
    const loopStopped = source.indexOf(
      'world.renderer.setAnimationLoop(null);',
    );
    const runtimeRestored = source.indexOf(
      'window.FRAMEWORK_MCP_RUNTIME = editorRuntime;',
      worldCreated,
    );

    expect(worldCreated).toBeGreaterThan(-1);
    expect(loopStopped).toBeGreaterThan(worldCreated);
    expect(loopStopped).toBeLessThan(runtimeRestored);
  });

  test('adds manifest assets without exposing geometry or material editing', () => {
    const source = createRuntimeSource();
    const catalogAdd = section(
      source,
      'function addAssetFromCatalog',
      'function hideSceneGraphContextMenu',
    );
    const inspectorRender = section(
      source,
      'function renderAssetInspector',
      'function renderMultiSelectInspector',
    );

    expect(catalogAdd).toContain("{ asset: assetId, type: 'asset' }");
    expect(catalogAdd).not.toContain("'com.iwsdk.components.PanelUI'");
    expect(catalogAdd).not.toContain('geometry');
    expect(catalogAdd).not.toContain('material');
    expect(inspectorRender).toContain('data-node-asset-ref');
    expect(inspectorRender).not.toContain('geometry');
    expect(inspectorRender).not.toContain('material');
  });

  test('keeps human editor mutations outside the correction workflow', () => {
    const source = createRuntimeSource();

    expect(source).not.toContain('authorizeDocumentTransition:');
    expect(source).not.toContain('X-IWSDK-Review-Transition');
    expect(source).not.toContain('pendingReviewTransitionToken');
    expect(source).toContain('fetch(activeDocumentUrl(), {');
  });

  test('keeps expensive proof collection off interactive editor paths', () => {
    const source = createRuntimeSource();
    const orbitChange = section(
      source,
      "orbitControls.addEventListener('change'",
      'editorWorldState.orientationGizmo =',
    );
    const canvasPointerMove = section(
      source,
      "canvas.addEventListener('pointermove'",
      "canvas.addEventListener('pointercancel'",
    );
    const testHooksStart = source.indexOf(
      'window.IWSDK_SCENE_EDITOR_TEST_HOOKS =',
    );
    const interactiveRuntime = source.slice(0, testHooksStart);

    expect(testHooksStart).toBeGreaterThan(-1);
    expect(orbitChange).not.toContain('createViewportProof()');
    expect(canvasPointerMove).not.toContain('createViewportProof()');
    expect(interactiveRuntime.match(/createViewportProof\(\)/g)).toHaveLength(
      1,
    );
    expect(source).not.toContain('requestEditorUiRefresh');
    expect(source).not.toContain('invalidateViewportProof');
    expect(source).not.toContain('lastProof');
  });

  test('includes overhead floor probes only in on-demand visibility evidence', () => {
    const source = createRuntimeSource();
    const sampling = section(
      source,
      'function projectedFirstHitSamples',
      'function firstHitVisibleRenderables',
    );
    const canvasPointerMove = section(
      source,
      "canvas.addEventListener('pointermove'",
      "canvas.addEventListener('pointercancel'",
    );

    expect(sampling).toContain('camera.getWorldPosition(cameraPosition)');
    expect(sampling).toContain('cameraPosition.y > bounds.max.y');
    expect(sampling).toContain('new Vector2(0, -0.8)');
    expect(canvasPointerMove).not.toContain('visibleEditorSceneNodeIds()');
    expect(canvasPointerMove).not.toContain('firstHitVisibleRenderables(');
  });

  test('keeps agent review metadata out of the consolidated human asset UI', () => {
    const source = createRuntimeSource();
    const frame = section(
      source,
      'function createEditorFrame',
      'function getViewportHost',
    );
    const uiRender = section(
      source,
      'function renderUi',
      'function attachCanvasInteractions',
    );

    expect(frame).toContain('mountEditorWorkspace(root');
    expect(workspaceSource).toContain('data-bottom-tab="assets"');
    expect(workspaceSource).toContain('id="assets-panel"');
    expect(workspaceSource).toContain('id="asset-catalog"');
    expect(workspaceSource).toContain('thumbnailUrl={asset.thumbnailUrl}');
    expect(workspaceSource).toContain('name={asset.id}');
    expect(workspaceSource).not.toContain('id="primitive-catalog"');
    expect(workspaceSource).not.toContain('Composition Plan');
    expect(workspaceSource).not.toContain('Review Evidence');
    expect(workspaceSource).not.toContain('Scene Resources');
    expect(workspaceSource).not.toContain('data-reference-mode');
    expect(workspaceSource).not.toContain('data-review-lens');
    expect(uiRender).not.toContain('renderCompositionPlan(');
    expect(uiRender).not.toContain('renderReferenceViewer(');
    expect(uiRender).not.toContain('renderResourceInspector(');
    expect(uiRender).not.toContain('renderSceneResources(');
    expect(uiRender).not.toContain('updateReviewEvidenceStatus(');
    expect(source).not.toContain('data-primitive-material');
  });

  test('bundles group and UIKitML icons used by outliner rows', () => {
    const outliner = section(
      workspaceSource,
      'function SceneNodeRow',
      'function filterSceneNodes',
    );

    expect(workspaceSource).toContain('Boxes,');
    expect(workspaceSource).toContain('PanelTop,');
    expect(outliner).toContain('sceneNodeHasPanelUI(node)');
    expect(outliner).toContain("? 'PanelTop'");
    expect(outliner).toContain("? 'Boxes'");
  });

  test('renders one hidden-state icon per outliner row', () => {
    const outliner = section(
      workspaceSource,
      'function SceneNodeRow',
      'function filterSceneNodes',
    );

    expect(outliner.match(/EyeOff/g)).toHaveLength(1);
    expect(outliner).toContain("hidden ? 'EyeOff' : 'Eye'");
  });
});
