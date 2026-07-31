/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  addComponentViaPicker,
  createEditorTestHarness,
  dispatchSceneTool,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor scene root', () => {
  test('authors root components through the shared inspector with live lighting', async () => {
    harness = await createEditorTestHarness('editor-scene-root');
    const editor = await harness.openEditor();
    const root = editor.page.locator('#scene-root-drop-target');
    const rootInspector = editor.page.locator('[data-scene-root-inspector]');

    await expect.poll(() => root.getAttribute('data-active')).not.toBeNull();
    expect(await root.locator('[data-scene-root-disclosure]').count()).toBe(0);
    await expect.poll(() => rootInspector.count()).toBe(1);
    expect(
      await rootInspector.locator('.inspector-section-meta').textContent(),
    ).toBe('2');
    const inspectorText = await rootInspector.textContent();
    expect(inspectorText).toContain('DomeGradient');
    expect(inspectorText).toContain('IBLGradient');
    expect(inspectorText).not.toContain('Renderer Environment');
    expect(inspectorText).not.toContain('Scene Fog');
    expect(inspectorText).not.toContain('AR Environment');
    expect(inspectorText).not.toContain('Default DomeGradient');

    const domeRow = rootInspector.locator(
      '[data-component-name$="DomeGradient"]',
    );
    const domeSky = domeRow.locator(
      'input[type="color"][data-component-field="sky"]',
    );
    await domeSky.fill('#0d3366');
    await domeSky.evaluate((input) =>
      input.dispatchEvent(new Event('change', { bubbles: true })),
    );
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.components?.[
              'com.iwsdk.components.DomeGradient'
            ]?.sky?.[0],
        ),
      )
      .toBeCloseTo(13 / 255, 6);
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getAuthoredRenderState()
              .domeGradient?.sky?.[0],
        ),
      )
      .toBeCloseTo(13 / 255, 4);

    const iblRow = rootInspector.locator(
      '[data-component-name$="IBLGradient"]',
    );
    const iblIntensity = iblRow.locator('[data-component-field="intensity"]');
    await iblIntensity.fill('0.55');
    await iblIntensity.press('Enter');
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getAuthoredRenderState()
              .imageBasedLighting?.spec?.intensity,
        ),
      )
      .toBeCloseTo(0.55, 4);

    await dispatchSceneTool(editor.page, 'scene_set_camera', {
      fov: 50,
      lookAt: [0, 0, 0],
      position: [140, 80, 120],
      projection: 'perspective',
    });
    await expect
      .poll(() =>
        editor.page.evaluate(() => {
          const hooks = (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS;
          return hooks.getEnvironmentDomeState();
        }),
      )
      .toEqual({
        cameraFar: 200,
        cameraPosition: [140, 80, 120],
        domeClipDepth: true,
        domePosition: [0, 0, 0],
        domeRadius: 1,
        domeTranslationFree: true,
      });

    await domeRow.locator('[data-remove-component]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.components?.[
              'com.iwsdk.components.DomeGradient'
            ],
        ),
      )
      .toBeUndefined();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getAuthoredRenderState()
              .domeGradient,
        ),
      )
      .toBeNull();

    await addComponentViaPicker(editor.page, 'DomeGradient');
    await expect
      .poll(
        async () =>
          (await harness!.readScene()).components?.[
            'com.iwsdk.components.DomeGradient'
          ],
      )
      .toMatchObject({ intensity: 1 });

    await editor.page.locator('[data-node-id="table-1"]').click();
    await expect.poll(() => root.getAttribute('data-active')).toBeNull();
    await root.click();
    await expect.poll(() => root.getAttribute('data-active')).not.toBeNull();
    await expect.poll(() => rootInspector.count()).toBe(1);
    expect(editor.errors()).toEqual([]);
  }, 30000);
});
