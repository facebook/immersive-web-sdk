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
  selectNode,
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor built-in component schemas', () => {
  test('exposes IWSDK component schemas and commits representative typed built-in fields', async () => {
    harness = await createEditorTestHarness('editor-component-schema-matrix');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => componentOptions(editor))
      .toEqual(
        expect.arrayContaining([
          'AudioSource',
          'DistanceGrabbable',
          'DomeGradient',
          'IBLGradient',
          'OneHandGrabbable',
          'PanelUI',
          'PhysicsBody',
          'PhysicsShape',
          'RayInteractable',
          'Transform',
          'TwoHandsGrabbable',
          'Visibility',
        ]),
      );

    await addComponent(editor, 'AudioSource');
    await componentRow(editor, 'AudioSource')
      .locator('[data-component-field="src"]')
      .fill('/audio/click.mp3');
    await componentRow(editor, 'AudioSource')
      .locator('[data-component-field="volume"]')
      .fill('0.5');
    await componentRow(editor, 'AudioSource')
      .locator('[data-component-field="loop"]')
      .setChecked(true);
    await componentRow(editor, 'AudioSource')
      .locator('[data-component-field="distanceModel"]')
      .selectOption('linear');
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'AudioSource'))
      .toMatchObject({
        props: {
          distanceModel: 'linear',
          loop: true,
          src: '/audio/click.mp3',
          volume: 0.5,
        },
        type: 'AudioSource',
      });

    await addComponent(editor, 'PanelUI');
    await componentRow(editor, 'PanelUI')
      .locator('[data-component-field="config"]')
      .fill('/ui/inspector-panel.json');
    await componentRow(editor, 'PanelUI')
      .locator('[data-component-field="maxWidth"]')
      .fill('1.8');
    await componentRow(editor, 'PanelUI')
      .locator('[data-component-field="maxHeight"]')
      .fill('0.9');
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'PanelUI'))
      .toMatchObject({
        props: {
          config: '/ui/inspector-panel.json',
          maxHeight: 0.9,
          maxWidth: 1.8,
        },
        type: 'PanelUI',
      });

    await addComponent(editor, 'Visibility');
    await componentRow(editor, 'Visibility')
      .locator('[data-component-field="isVisible"]')
      .setChecked(false);
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'Visibility'))
      .toMatchObject({
        props: {
          isVisible: false,
        },
        type: 'Visibility',
      });

    await addComponent(editor, 'PhysicsBody');
    await componentRow(editor, 'PhysicsBody')
      .locator('[data-component-field="state"]')
      .selectOption('STATIC');
    await componentRow(editor, 'PhysicsBody')
      .locator('[data-component-field="gravityFactor"]')
      .fill('0.25');
    await fillVectorField(
      editor,
      'PhysicsBody',
      'centerOfMass',
      [0.1, 0.2, 0.3],
    );
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'PhysicsBody'))
      .toMatchObject({
        props: {
          centerOfMass: [0.1, 0.2, 0.3],
          gravityFactor: 0.25,
          state: 'STATIC',
        },
        type: 'PhysicsBody',
      });

    await addComponent(editor, 'PhysicsShape');
    await componentRow(editor, 'PhysicsShape')
      .locator('[data-component-field="shape"]')
      .selectOption('Box');
    await fillVectorField(editor, 'PhysicsShape', 'dimensions', [1, 2, 3]);
    await componentRow(editor, 'PhysicsShape')
      .locator('[data-component-field="friction"]')
      .fill('0.75');
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'PhysicsShape'))
      .toMatchObject({
        props: {
          dimensions: [1, 2, 3],
          friction: 0.75,
          shape: 'Box',
        },
        type: 'PhysicsShape',
      });

    await addComponent(editor, 'DistanceGrabbable');
    await componentRow(editor, 'DistanceGrabbable')
      .locator('[data-component-field="translate"]')
      .setChecked(false);
    await componentRow(editor, 'DistanceGrabbable')
      .locator('[data-component-field="moveSpeedFactor"]')
      .fill('0.2');
    await fillVectorField(
      editor,
      'DistanceGrabbable',
      'targetPositionOffset',
      [0, 0, -0.4],
    );
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'DistanceGrabbable'))
      .toMatchObject({
        props: {
          moveSpeedFactor: 0.2,
          targetPositionOffset: [0, 0, -0.4],
          translate: false,
        },
        type: 'DistanceGrabbable',
      });

    await addComponent(editor, 'OneHandGrabbable');
    await addComponent(editor, 'TwoHandsGrabbable');
    await addComponent(editor, 'RayInteractable');
    await expect
      .poll(() => componentValue(editor, 'OneHandGrabbable'))
      .toMatchObject({ props: { rotate: true }, type: 'OneHandGrabbable' });
    await expect
      .poll(() => componentValue(editor, 'TwoHandsGrabbable'))
      .toMatchObject({ props: { scale: true }, type: 'TwoHandsGrabbable' });
    await expect
      .poll(() => componentValue(editor, 'RayInteractable'))
      .toEqual({ props: {}, type: 'RayInteractable' });

    await addComponent(editor, 'DomeGradient');
    await fillVectorField(editor, 'DomeGradient', 'sky', [0.11, 0.22, 0.33, 1]);
    await componentRow(editor, 'DomeGradient')
      .locator('[data-component-field="intensity"]')
      .fill('1.5');
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'DomeGradient'))
      .toMatchObject({
        props: {
          intensity: 1.5,
          sky: [0.11, 0.22, 0.33, 1],
        },
        type: 'DomeGradient',
      });

    await addComponent(editor, 'IBLGradient');
    await fillVectorField(editor, 'IBLGradient', 'ground', [0.4, 0.3, 0.2, 1]);
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'IBLGradient'))
      .toMatchObject({
        props: {
          ground: [0.4, 0.3, 0.2, 1],
        },
        type: 'IBLGradient',
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_validate'),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes[0].components).toEqual(
      expect.objectContaining({
        'com.iwsdk.components.AudioSource': expect.objectContaining({
          type: 'AudioSource',
        }),
        'com.iwsdk.components.DistanceGrabbable': expect.objectContaining({
          type: 'DistanceGrabbable',
        }),
        'com.iwsdk.components.DomeGradient': expect.objectContaining({
          type: 'DomeGradient',
        }),
        'com.iwsdk.components.IBLGradient': expect.objectContaining({
          type: 'IBLGradient',
        }),
        'com.iwsdk.components.PanelUI': expect.objectContaining({
          type: 'PanelUI',
        }),
        'com.iwsdk.components.PhysicsBody': expect.objectContaining({
          type: 'PhysicsBody',
        }),
        'com.iwsdk.components.PhysicsShape': expect.objectContaining({
          type: 'PhysicsShape',
        }),
        'com.iwsdk.components.RayInteractable': expect.objectContaining({
          type: 'RayInteractable',
        }),
        'com.iwsdk.components.Visibility': expect.objectContaining({
          type: 'Visibility',
        }),
      }),
    );
  }, 45000);
});

async function componentOptions(editor: EditorPageContext): Promise<string[]> {
  return editor.page
    .locator('#new-component-type option')
    .evaluateAll((options) => options.map((option) => option.value).sort());
}

async function addComponent(
  editor: EditorPageContext,
  type: string,
): Promise<void> {
  await editor.page.locator('#new-component-type').selectOption(type);
  await editor.page.locator('#add-component').click();
  await expect.poll(() => componentRow(editor, type).count()).toBe(1);
}

function componentRow(editor: EditorPageContext, type: string) {
  return editor.page.locator(`[data-component-type="${type}"]`);
}

async function componentValue(
  editor: EditorPageContext,
  type: string,
): Promise<any> {
  return editor.page.evaluate(
    ({ componentType }) =>
      (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].components?.[
        `com.iwsdk.components.${componentType}`
      ],
    { componentType: type },
  );
}

async function fillVectorField(
  editor: EditorPageContext,
  componentType: string,
  fieldName: string,
  values: number[],
): Promise<void> {
  const row = componentRow(editor, componentType);
  for (let index = 0; index < values.length; index += 1) {
    await row
      .locator(
        `[data-component-vector-field="${fieldName}"][data-component-vector-index="${index}"]`,
      )
      .fill(String(values[index]));
  }
}

async function focusComponentCommitTarget(
  editor: EditorPageContext,
): Promise<void> {
  await editor.page.locator('#new-component-type').focus();
}
