/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  dispatchSceneTool,
  getEditorProof,
  hasNonBlankCanvas,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

test('renders and captures an exact saved orthographic authoring view', async () => {
  harness = await createEditorTestHarness('saved-orthographic-view');
  const editor = await harness.openEditor();

  await dispatchSceneTool(editor.page, 'scene_apply_patch', {
    patch: {
      op: 'addAuthoringView',
      view: {
        height: 5.5,
        id: 'plan-review',
        position: [3, 7, 4],
        projection: 'orthographic',
        role: 'diagnostic',
        target: [0, 0, 0],
      },
    },
  });

  const setCamera = await dispatchSceneTool(editor.page, 'scene_set_camera', {
    viewId: 'plan-review',
  });
  expect(setCamera.camera).toMatchObject({
    height: 5.5,
    lookAt: [0, 0, 0],
    position: [3, 7, 4],
    projection: 'orthographic',
    viewId: 'plan-review',
  });

  await expect
    .poll(() => getEditorProof(editor.page))
    .toMatchObject({
      cameraHeight: 5.5,
      cameraProjection: 'orthographic',
      cameraViewId: 'plan-review',
      rendererCamera: {
        far: 5000,
        isOrthographicCamera: true,
        isPerspectiveCamera: false,
        type: 'OrthographicCamera',
      },
    });

  const capture = await dispatchSceneTool(editor.page, 'scene_capture_review', {
    height: 384,
    includeImageData: true,
    viewId: 'plan-review',
    width: 512,
  });
  expect(capture).toMatchObject({
    camera: {
      height: 5.5,
      projection: 'orthographic',
      viewId: 'plan-review',
    },
    height: 384,
    reviewCamera: {
      height: 5.5,
      position: [3, 7, 4],
      projection: 'orthographic',
      target: [0, 0, 0],
    },
    renderStats: {
      available: true,
      geometryCount: expect.any(Number),
      materialCount: expect.any(Number),
      meshCount: expect.any(Number),
      nodeCount: 1,
      objectCount: expect.any(Number),
      visibleNodeIds: expect.arrayContaining(['table-1']),
      worldBounds: {
        max: expect.any(Array),
        min: expect.any(Array),
        size: expect.any(Array),
      },
    },
    width: 512,
  });
  expect(capture.reviewCamera).not.toHaveProperty('fov');
  expect(capture.imageData.length).toBeGreaterThan(1_000);
  expect(await hasNonBlankCanvas(editor.page, '#scene-canvas')).toBe(true);
  expect(editor.errors()).toEqual([]);

  await dispatchSceneTool(editor.page, 'scene_set_camera', { view: 'front' });
  await expect
    .poll(() => getEditorProof(editor.page))
    .toMatchObject({
      cameraProjection: 'perspective',
      cameraViewId: null,
      rendererCamera: {
        isOrthographicCamera: false,
        isPerspectiveCamera: true,
        type: 'PerspectiveCamera',
      },
    });
}, 15000);

test('reports only camera-renderable nodes and records the occlusion limit', async () => {
  harness = await createEditorTestHarness('review-frustum-visibility');
  const editor = await harness.openEditor();

  await dispatchSceneTool(editor.page, 'scene_apply_patch', {
    patch: {
      op: 'addNode',
      parentId: 'table-1',
      node: {
        id: 'vase-child',
        content: { asset: 'vase', type: 'asset' },
        metadata: { 'iwsdk.validation': { allowFloating: true } },
        transform: { position: [0, 0.7, 0] },
      },
    },
  });
  await dispatchSceneTool(editor.page, 'scene_apply_patch', {
    patch: {
      op: 'addNode',
      node: {
        id: 'offscreen-vase',
        content: { asset: 'vase', type: 'asset' },
        transform: { position: [100, 0, 0] },
      },
    },
  });
  await dispatchSceneTool(editor.page, 'scene_apply_patch', {
    patch: {
      op: 'addNode',
      node: {
        id: 'occluded-vase',
        content: { asset: 'vase', type: 'asset' },
        transform: { position: [0, 0, -2] },
      },
    },
  });
  await dispatchSceneTool(editor.page, 'scene_apply_patch', {
    patch: {
      op: 'addAuthoringView',
      view: {
        height: 6,
        id: 'visibility-view',
        position: [0, 0.25, 5],
        projection: 'orthographic',
        role: 'diagnostic',
        target: [0, 0.25, 0],
      },
    },
  });
  await dispatchSceneTool(editor.page, 'scene_save');

  const capture = () =>
    dispatchSceneTool(editor.page, 'scene_capture_review', {
      height: 360,
      viewId: 'visibility-view',
      width: 480,
    });
  const initial = await capture();
  expect(initial.visibleNodeIds).toEqual(
    expect.arrayContaining(['table-1', 'vase-child']),
  );
  expect(initial.visibleNodeIds).not.toContain('offscreen-vase');
  expect(initial.visibleNodeIds).not.toContain('occluded-vase');
  expect(initial.renderStats.visibleNodeIds).toEqual(initial.visibleNodeIds);
  expect(initial.rendererEnvironment).toMatchObject({
    visibility: {
      method: 'threejs-first-hit-sampling-v1',
      occlusion: 'conservative-cpu-first-hit',
      sampleGrid: '3x3-projected-bounds+overhead-lower-frame',
      uncertainObjectsIncluded: false,
    },
  });

  await editor.page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setObjectRenderState(
      'table-1',
      { visible: false },
    ),
  );
  const ancestorHidden = await capture();
  expect(ancestorHidden.visibleNodeIds).not.toContain('table-1');
  expect(ancestorHidden.visibleNodeIds).not.toContain('vase-child');

  await editor.page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setObjectRenderState(
      'table-1',
      { visible: true },
    ),
  );
  await editor.page.evaluate(() =>
    (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setObjectRenderState(
      'vase-child',
      { layer: 1 },
    ),
  );
  const wrongLayer = await capture();
  expect(wrongLayer.visibleNodeIds).toContain('table-1');
  expect(wrongLayer.visibleNodeIds).not.toContain('vase-child');
  expect(editor.errors()).toEqual([]);
});
