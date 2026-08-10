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
  test('renders component-only nodes as selectable editor helpers without serializing helper artifacts', async () => {
    harness = await createEditorTestHarness('editor-component-helper-proxies');
    const editor = await harness.openEditor();
    const initialProof = await expectRealWebGLViewport(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        components: {
          'com.iwsdk.components.AudioSource': {
            src: '/audio/ambient.wav',
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
          'com.iwsdk.components.SpotLight': {
            angleDeg: 32,
            color: [1, 0.5, 0.25, 1],
            distance: 2,
            intensity: 40,
            penumbra: 0.25,
          },
        },
        id: 'spot-light-1',
        name: 'Reading Spot',
        transform: {
          position: [0.3, 1.8, 0.4],
          rotationDeg: [-35, 20, 0],
        },
      },
    });
    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        components: {
          'com.iwsdk.components.CameraSource': {},
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
          'com.iwsdk.components.DomeGradient': {},
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
        'spot-light-1': 'spot-light',
        'table-1': null,
      });
    await expect
      .poll(() => getEditorProof(editor.page).then((proof) => proof.meshCount))
      .toBeGreaterThanOrEqual(initialProof.meshCount + 7);

    await assertSelectableRuntimeHelper(editor, 'audio-source-1', {
      component: 'AudioSource',
      helperType: 'audio-source',
    });
    await assertSelectableRuntimeHelper(editor, 'camera-source-1', {
      component: 'CameraSource',
      helperType: 'camera-source',
      meshCount: 3,
    });
    await assertSelectableRuntimeHelper(editor, 'environment-light-1', {
      component: 'DomeGradient',
      helperType: 'environment-light',
    });
    await assertSelectableRuntimeHelper(editor, 'spot-light-1', {
      component: 'SpotLight',
      helperType: 'spot-light',
    });
    await expect(
      editor.page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
            .selectionBounds,
      ),
    ).resolves.toEqual({ helper: null, nodeId: 'spot-light-1' });
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (
              window as any
            ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getAuthoredRenderState().lights,
        ),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            color: '#ff8040',
            intensity: 40,
            nodeId: 'spot-light-1',
            type: 'spot',
          }),
        ]),
      );

    await selectNode(editor.page, 'environment-light-1');
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
      .toMatchObject({ intensity: 1.75 });
    await expect
      .poll(() =>
        editor.page.evaluate(() => ({
          conflict: Boolean(
            document.querySelector('#scene-save-conflict-dialog'),
          ),
          dirty: (window as any).IWSDK_SCENE_EDITOR.session.isDirty,
        })),
      )
      .toEqual({ conflict: false, dirty: false });

    await expect(
      dispatchSceneTool(editor.page, 'scene_save'),
    ).resolves.toMatchObject({ dirty: false });
    const savedScene = await harness.readScene();
    expect(savedScene.nodes.map((node: { id: string }) => node.id)).toEqual([
      'table-1',
      'audio-source-1',
      'spot-light-1',
      'camera-source-1',
      'environment-light-1',
    ]);
    for (const node of savedScene.nodes.filter(
      (entry: { id: string }) =>
        entry.id.endsWith('-1') && entry.id !== 'table-1',
    )) {
      expect(node.content).toBeUndefined();
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
          intensity: 1.75,
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
        'spot-light-1': 'spot-light',
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

  test('keeps light gizmos compact and their range visuals out of scene picking', async () => {
    harness = await createEditorTestHarness('editor-light-gizmo-picking');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    for (const node of [
      {
        components: {
          'com.iwsdk.components.PointLight': {
            color: [1, 0.75, 0.3, 1],
            distance: 1.5,
            intensity: 20,
          },
        },
        id: 'point-light-large-range',
        transform: { position: [2.7, 1.375, 2.5], scale: [3, 2, 1] },
      },
      {
        components: {
          'com.iwsdk.components.SpotLight': {
            angleDeg: 70,
            distance: 100,
            intensity: 20,
          },
        },
        id: 'spot-light-large-range',
        transform: { position: [-1.2, 1.6, 0.5], scale: [3, 2, 1] },
      },
      {
        components: {
          'com.iwsdk.components.DirectionalLight': { intensity: 2 },
        },
        id: 'directional-light-helper',
        transform: { position: [1.2, 1.6, 0.5], scale: [3, 2, 1] },
      },
      {
        components: {
          'com.iwsdk.components.RectAreaLight': {
            height: 20,
            intensity: 20,
            width: 30,
          },
        },
        id: 'rect-area-light-large-emitter',
        transform: { position: [0, 2.2, -1], scale: [3, 2, 1] },
      },
    ]) {
      await dispatchSceneTool(editor.page, 'scene_add_node', { node });
    }

    await expect
      .poll(async () => {
        const states = await Promise.all(
          [
            'point-light-large-range',
            'spot-light-large-range',
            'directional-light-helper',
            'rect-area-light-large-emitter',
          ].map((nodeId) => componentHelperState(editor, nodeId)),
        );
        return states.every(Boolean) ? states : null;
      })
      .not.toBeNull();

    const states = await Promise.all(
      [
        'point-light-large-range',
        'spot-light-large-range',
        'directional-light-helper',
        'rect-area-light-large-emitter',
      ].map((nodeId) => componentHelperState(editor, nodeId)),
    );
    for (const state of states) {
      expect(Math.max(...state.size)).toBeLessThanOrEqual(0.65);
      expect([...new Set(state.meshes.map((mesh: any) => mesh.color))]).toEqual(
        ['ffa62b'],
      );
      expect(state.meshes.filter((mesh: any) => mesh.pickable)).toEqual([
        expect.objectContaining({ role: 'handle' }),
      ]);
      expect(
        state.meshes
          .filter((mesh: any) => mesh.role === 'visual')
          .every((mesh: any) => !mesh.pickable),
      ).toBe(true);
    }
    expect(
      states.map((state) => state.meshes.map((mesh: any) => mesh.geometry)),
    ).toEqual([
      ['SphereGeometry', 'SphereGeometry', 'BufferGeometry', 'BufferGeometry'],
      [
        'SphereGeometry',
        'SphereGeometry',
        'BufferGeometry',
        'BufferGeometry',
        'BufferGeometry',
        'BufferGeometry',
      ],
      [
        'SphereGeometry',
        'SphereGeometry',
        'BufferGeometry',
        'BufferGeometry',
        'BufferGeometry',
      ],
      [
        'SphereGeometry',
        'SphereGeometry',
        'BufferGeometry',
        'BufferGeometry',
        'BufferGeometry',
      ],
    ]);
    expect(
      states.map((state) =>
        state.meshes.map((mesh: any) => [mesh.kind, mesh.vertexCount]),
      ),
    ).toEqual([
      [
        ['mesh', expect.any(Number)],
        ['mesh', expect.any(Number)],
        ['line', 44],
        ['line', 64],
      ],
      [
        ['mesh', expect.any(Number)],
        ['mesh', expect.any(Number)],
        ['line', 44],
        ['line', 64],
        ['line', 98],
        ['line', 64],
      ],
      [
        ['mesh', expect.any(Number)],
        ['mesh', expect.any(Number)],
        ['line', 76],
        ['line', 2],
        ['line', 8],
      ],
      [
        ['mesh', expect.any(Number)],
        ['mesh', expect.any(Number)],
        ['line', 44],
        ['line', 10],
        ['line', 8],
      ],
    ]);
    expect(states[1].meshes.at(-1)).toMatchObject({
      kind: 'line',
      material: 'ShaderMaterial',
      pickable: false,
      role: 'visual',
    });
    expect(states[0].meshes.slice(2).map((mesh: any) => mesh.material)).toEqual(
      ['ShaderMaterial', 'ShaderMaterial'],
    );
    expect(states[1].meshes.slice(2).map((mesh: any) => mesh.material)).toEqual(
      [
        'ShaderMaterial',
        'ShaderMaterial',
        'LineBasicMaterial',
        'ShaderMaterial',
      ],
    );

    await selectNode(editor.page, 'point-light-large-range');
    await editor.page.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode('scale'),
    );
    await expect(transformControlAxisVisibility(editor)).resolves.toEqual({
      x: true,
      y: true,
      z: true,
    });
    await simulateLightPropertyScale(
      editor,
      { position: [2.7, 1.375, 2.5], scale: [6, 2, 1] },
      'X',
    );
    await expect
      .poll(() =>
        componentValue(editor, 'point-light-large-range', 'PointLight'),
      )
      .toMatchObject({ distance: 3 });

    await selectNode(editor.page, 'spot-light-large-range');
    await expect(transformControlAxisVisibility(editor)).resolves.toEqual({
      x: true,
      y: true,
      z: true,
    });
    await simulateLightPropertyScale(
      editor,
      { position: [-1.2, 1.6, 0.5], scale: [1.5, 2, 1] },
      'X',
    );
    await expect
      .poll(() => componentValue(editor, 'spot-light-large-range', 'SpotLight'))
      .toMatchObject({ angleDeg: 53.9476, distance: 100 });
    await simulateLightPropertyScale(
      editor,
      { position: [-1.2, 1.6, 0.5], scale: [3, 2, 1.5] },
      'Z',
    );
    await expect
      .poll(() => componentValue(editor, 'spot-light-large-range', 'SpotLight'))
      .toMatchObject({ angleDeg: 53.9476, distance: 150 });

    await selectNode(editor.page, 'rect-area-light-large-emitter');
    await expect(transformControlAxisVisibility(editor)).resolves.toEqual({
      x: true,
      y: true,
      z: false,
    });
    await simulateLightPropertyScale(
      editor,
      { position: [0, 2.2, -1], scale: [6, 1, 3] },
      'XY',
    );
    await expect
      .poll(() =>
        componentValue(
          editor,
          'rect-area-light-large-emitter',
          'RectAreaLight',
        ),
      )
      .toMatchObject({ height: 10, width: 60 });

    await selectNode(editor.page, 'directional-light-helper');
    await expect(transformControlAxisVisibility(editor)).resolves.toEqual({
      x: false,
      y: false,
      z: false,
    });
    await simulateLightPropertyScale(
      editor,
      { position: [1.2, 1.6, 0.5], scale: [6, 4, 2] },
      'XYZ',
    );
    await expect(
      componentValue(editor, 'directional-light-helper', 'DirectionalLight'),
    ).resolves.toMatchObject({ intensity: 2 });

    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.pickNodeAtObjectCenter(
          'table-1',
        ),
      ),
    ).resolves.toEqual({ builtinTarget: null, nodeId: 'table-1' });
    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.pickNodeAtObjectCenter(
          'deleted-node',
        ),
      ),
    ).resolves.toEqual({ builtinTarget: null, nodeId: null });
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

async function componentHelperState(
  editor: EditorPageContext,
  nodeId: string,
): Promise<any> {
  return editor.page.evaluate(
    (id) =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getComponentHelperState(id),
    nodeId,
  );
}

async function transformControlAxisVisibility(
  editor: EditorPageContext,
): Promise<any> {
  return editor.page.evaluate(() =>
    (
      window as any
    ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlAxisVisibility(),
  );
}

async function simulateLightPropertyScale(
  editor: EditorPageContext,
  transform: Record<string, unknown>,
  axis: string,
): Promise<void> {
  const result = await editor.page.evaluate(
    ({ nextTransform, scaleAxis }) =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit(
        nextTransform,
        scaleAxis,
      ),
    { nextTransform: transform, scaleAxis: axis },
  );
  expect(result.documentTransform).toMatchObject({ scale: [3, 2, 1] });
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
  await editor.page.locator('#add-component').focus();
}

async function assertSelectableRuntimeHelper(
  editor: EditorPageContext,
  nodeId: string,
  expected: { component: string; helperType: string; meshCount?: number },
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
      meshCount: expected.meshCount ?? 2,
      nodeId,
      ready: true,
    });
  await expect
    .poll(() => editor.page.locator('.runtime-inspector').count())
    .toBe(0);
}
