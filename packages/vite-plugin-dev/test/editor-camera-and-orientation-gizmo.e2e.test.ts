/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  dispatchSceneTool,
  expectRealWebGLViewport,
  getEditorProof,
  hashImageData,
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor camera and orientation gizmo', () => {
  test('exposes a real orientation gizmo and deterministic named-view screenshots', async () => {
    harness = await createEditorTestHarness('editor-camera-gizmo');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    const proof = await getEditorProof(editor.page);
    expect(proof.orientationGizmo).toMatchObject({
      axisCount: 6,
      draggable: true,
      renderer: 'shared-webgl',
      webgl: true,
    });
    expect(proof.orientationGizmo.clickTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ view: 'top' }),
        expect.objectContaining({ view: 'front' }),
        expect.objectContaining({ view: 'right' }),
      ]),
    );

    await clickOrientationGizmoView(editor, 'top');
    await expectCameraOrientation(editor, 'top');

    await clickOrientationGizmoView(editor, 'front');
    await expectCameraOrientation(editor, 'front');

    await clickOrientationGizmoView(editor, 'right');
    await expectCameraOrientation(editor, 'right');

    await expect(
      dispatchSceneTool(editor.page, 'scene_set_camera', { view: 'top' }),
    ).resolves.toMatchObject({
      camera: {
        position: [0, 8, 0],
        view: 'top',
      },
    });

    const top = await dispatchSceneTool(editor.page, 'scene_screenshot', {
      height: 240,
      view: 'top',
      width: 320,
    });
    const front = await dispatchSceneTool(editor.page, 'scene_screenshot', {
      height: 240,
      view: 'front',
      width: 320,
    });
    const quarter = await dispatchSceneTool(editor.page, 'scene_screenshot', {
      height: 240,
      view: 'quarter',
      width: 320,
    });
    const quarterWithEditorOverlays = await dispatchSceneTool(
      editor.page,
      'scene_screenshot',
      {
        captureMode: 'editor',
        height: 240,
        view: 'quarter',
        width: 320,
      },
    );
    const quarterAfterEditorOverlayCapture = await dispatchSceneTool(
      editor.page,
      'scene_screenshot',
      {
        height: 240,
        view: 'quarter',
        width: 320,
      },
    );

    expect(top).toMatchObject({
      camera: { view: 'top' },
      mimeType: 'image/png',
    });
    expect(front).toMatchObject({
      camera: { view: 'front' },
      mimeType: 'image/png',
    });
    expect(quarter).toMatchObject({
      camera: { view: 'quarter' },
      captureMode: 'render',
      mimeType: 'image/png',
    });
    expect(quarterWithEditorOverlays).toMatchObject({
      camera: { view: 'quarter' },
      captureMode: 'editor',
      mimeType: 'image/png',
    });
    expect(hashImageData(quarterWithEditorOverlays.imageData)).not.toBe(
      hashImageData(quarter.imageData),
    );
    expect(hashImageData(quarterAfterEditorOverlayCapture.imageData)).toBe(
      hashImageData(quarter.imageData),
    );
    const restoredProof = await getEditorProof(editor.page);
    expect(restoredProof.orientationGizmo).toMatchObject({
      axisCount: 6,
      webgl: true,
    });
    expect(
      new Set([top, front, quarter].map((entry) => entry.imageData)).size,
    ).toBe(3);
    expect(
      new Set(
        [top, front, quarter].map((entry) => hashImageData(entry.imageData)),
      ).size,
    ).toBe(3);
  }, 15000);
});

async function clickOrientationGizmoView(
  editor: EditorPageContext,
  view: 'top' | 'front' | 'right',
): Promise<void> {
  const target = await editor.page.evaluate((targetView) => {
    const proof = (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof();
    const clickTarget = proof.orientationGizmo?.clickTargets?.find(
      (entry: { view: string }) => entry.view === targetView,
    );
    const widget = document.querySelector(
      '#orientation-gizmo .orientation-gizmo-widget',
    );
    if (!clickTarget || !(widget instanceof HTMLElement)) {
      throw new Error(`Missing orientation gizmo target ${targetView}`);
    }
    const rect = widget.getBoundingClientRect();
    return {
      x: rect.left + clickTarget.x,
      y: rect.top + clickTarget.y,
    };
  }, view);

  await editor.page.mouse.click(target.x, target.y);
  await expect
    .poll(() =>
      editor.page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
            .orientationGizmo?.animating === false,
      ),
    )
    .toBe(true);
}

async function expectCameraOrientation(
  editor: EditorPageContext,
  view: 'top' | 'front' | 'right',
): Promise<void> {
  await expect
    .poll(() =>
      editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
    )
    .toMatchObject({ view });

  const position = await editor.page.evaluate(
    () => (window as any).__IWSDK_EDITOR_CAMERA.position as number[],
  );
  if (view === 'top') {
    expect(Math.abs(position[0]), 'top view x offset').toBeLessThan(0.05);
    expect(position[1], 'top view y offset').toBeGreaterThan(1);
    expect(Math.abs(position[2]), 'top view z offset').toBeLessThan(0.05);
  } else if (view === 'front') {
    expect(Math.abs(position[0]), 'front view x offset').toBeLessThan(0.05);
    expect(position[2], 'front view z offset').toBeGreaterThan(1);
  } else {
    expect(position[0], 'right view x offset').toBeGreaterThan(1);
    expect(Math.abs(position[2]), 'right view z offset').toBeLessThan(0.05);
  }
}
