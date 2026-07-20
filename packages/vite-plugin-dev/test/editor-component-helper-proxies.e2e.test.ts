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
  selectNode,
  type EditorPageContext,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor component helper proxies', () => {
  test('renders typed component-only nodes as selectable editor helpers without serializing helper artifacts', async () => {
    harness = await createEditorTestHarness('editor-component-helper-proxies');
    const editor = await harness.openEditor();
    const initialProof = await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        components: {
          'com.iwsdk.components.AudioSource': {
            props: {
              src: '/audio/ambient.wav',
            },
            type: 'AudioSource',
          },
        },
        id: 'audio-source-1',
        name: 'Ambient Audio',
        transform: { position: [-0.7, 0.45, -0.15] },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        components: {
          'com.iwsdk.components.CameraSource': {
            props: {},
            type: 'CameraSource',
          },
        },
        id: 'camera-source-1',
        name: 'Shot Camera',
        transform: {
          position: [0.55, 0.8, -0.25],
          rotationDeg: [0, 25, 0],
        },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        components: {
          'com.iwsdk.components.DomeGradient': {
            props: {},
            type: 'DomeGradient',
          },
        },
        id: 'environment-light-1',
        name: 'Environment Light',
        transform: { position: [0, 1.3, 0.2] },
      },
    });

    await expect
      .poll(() => helperTypes(editor))
      .toMatchObject({
        'audio-source-1': 'audio-source',
        'camera-source-1': 'camera-source',
        'environment-light-1': 'environment-light',
        'table-1': null,
      });
    await expect
      .poll(() => getEditorProof(editor.page).then((proof) => proof.meshCount))
      .toBeGreaterThanOrEqual(initialProof.meshCount + 6);

    await assertSelectableRuntimeHelper(editor, 'audio-source-1', {
      component: 'AudioSource',
      helperType: 'audio-source',
    });
    await assertSelectableRuntimeHelper(editor, 'camera-source-1', {
      component: 'CameraSource',
      helperType: 'camera-source',
    });
    await assertSelectableRuntimeHelper(editor, 'environment-light-1', {
      component: 'DomeGradient',
      helperType: 'environment-light',
    });

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode(
        'translate',
      );
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformSnapEnabled(
        false,
      );
    });
    await expect(
      editor.page.evaluate(() =>
        (
          window as any
        ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
          position: [0.25, 1.55, 0.35],
          rotationDeg: [0, 0, 0],
          scale: 1,
        }),
      ),
    ).resolves.toMatchObject({
      documentTransform: {
        position: [0.25, 1.55, 0.35],
      },
    });
    await componentRow(editor, 'DomeGradient')
      .locator('[data-component-field="intensity"]')
      .fill('1.75');
    await focusComponentCommitTarget(editor);
    await expect
      .poll(() => componentValue(editor, 'environment-light-1', 'DomeGradient'))
      .toMatchObject({
        props: { intensity: 1.75 },
        type: 'DomeGradient',
      });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'audio-source-1',
      'camera-source-1',
      'environment-light-1',
    ]);
    for (const node of savedScene.nodes.filter(
      (entry: { id: string }) =>
        entry.id.endsWith('-1') && entry.id !== 'table-1',
    )) {
      expect(node.asset).toBeUndefined();
      expect(node.fallback).toBeUndefined();
      expect(node.helperType).toBeUndefined();
      expect(node.components).toBeDefined();
    }
    const savedLight = savedScene.nodes.find(
      (entry: { id: string }) => entry.id === 'environment-light-1',
    );
    expect(savedLight).toMatchObject({
      components: {
        'com.iwsdk.components.DomeGradient': {
          props: { intensity: 1.75 },
          type: 'DomeGradient',
        },
      },
      transform: { position: [0.25, 1.55, 0.35] },
    });

    const reloadedEditor = await harness.openEditor();
    await expectRealWebGLViewport(reloadedEditor);
    await expect
      .poll(() => helperTypes(reloadedEditor))
      .toMatchObject({
        'audio-source-1': 'audio-source',
        'camera-source-1': 'camera-source',
        'environment-light-1': 'environment-light',
      });
    await selectNode(reloadedEditor.page, 'environment-light-1');
    await expect(
      reloadedEditor.page.evaluate(() =>
        (
          window as any
        ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlObjectTransform(),
      ),
    ).resolves.toMatchObject({
      position: [0.25, 1.55, 0.35],
    });
  }, 60000);
});

async function helperTypes(
  editor: EditorPageContext,
): Promise<Record<string, string | null>> {
  const proof = await getEditorProof(editor.page);
  return Object.fromEntries(
    proof.objectHierarchy.map((entry: any) => [entry.nodeId, entry.helperType]),
  );
}

function componentRow(editor: EditorPageContext, type: string) {
  return editor.page.locator(`[data-component-type="${type}"]`);
}

async function componentValue(
  editor: EditorPageContext,
  nodeId: string,
  type: string,
): Promise<any> {
  return editor.page.evaluate(
    ({ componentType, sceneNodeId }) => {
      const node = (
        window as any
      ).IWSDK_SCENE_EDITOR.session.document.nodes.find(
        (entry: { id: string }) => entry.id === sceneNodeId,
      );
      return node?.components?.[`com.iwsdk.components.${componentType}`];
    },
    { componentType: type, sceneNodeId: nodeId },
  );
}

async function focusComponentCommitTarget(
  editor: EditorPageContext,
): Promise<void> {
  await editor.page.locator('#new-component-type').focus();
}

async function assertSelectableRuntimeHelper(
  editor: EditorPageContext,
  nodeId: string,
  expected: { component: string; helperType: string },
): Promise<void> {
  await selectNode(editor.page, nodeId);
  await expect
    .poll(() =>
      getEditorProof(editor.page).then((proof) => proof.selectedRuntime),
    )
    .toMatchObject({
      components: expect.arrayContaining([expected.component]),
      fallback: expected.helperType + '-helper',
      helperType: expected.helperType,
      meshCount: 2,
      nodeId,
      ready: true,
    });
  await expect
    .poll(() => editor.page.locator('.runtime-inspector').count())
    .toBe(0);
}
