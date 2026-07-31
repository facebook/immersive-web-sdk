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

describe('editor transform gizmo', () => {
  test('auto-commits transform field edits when editing completes', async () => {
    harness = await createEditorTestHarness('editor-transform-fields');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await editor.page
      .locator('[data-transform-field="position.0"]')
      .fill('0.25');
    await editor.page.locator('[data-transform-field="position.1"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform.position,
        ),
      )
      .toEqual([0.25, 0, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0.25, 0, 0] });

    await editor.page
      .locator('[data-transform-field="rotationDeg.1"]')
      .fill('30');
    await editor.page
      .locator('[data-transform-field="rotationDeg.1"]')
      .press('Enter');
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform.rotationDeg,
        ),
      )
      .toEqual([0, 30, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ rotationDeg: [0, 30, 0] });
  }, 45000);

  test('commits one document/runtime transform patch and preserves undo/redo parity', async () => {
    harness = await createEditorTestHarness('editor-transform-gizmo');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode(
        'translate',
      );
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformSpace('world');
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformSnapEnabled(
        true,
      );
    });

    const translated = await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.38, 0, 0],
        rotationDeg: [0, 0, 0],
        scale: 1,
      }),
    );
    expect(translated.documentTransform).toMatchObject({
      position: [0.5, 0, 0],
      rotationDeg: [0, 0, 0],
      scale: 1,
    });
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0.5, 0, 0], scale: [1, 1, 1] });
    expect((await getEditorProof(editor.page)).transformControls).toMatchObject(
      {
        attachedNodeId: 'table-1',
        mode: 'translate',
        snapping: {
          applied: {
            rotationSnapDeg: 15,
            scaleSnap: 0.1,
            translationSnap: 0.25,
          },
          enabled: true,
          rotationDeg: 15,
          scale: 0.1,
          translation: 0.25,
        },
        space: 'world',
        visible: true,
      },
    );

    await dispatchSceneTool(editor.page, 'scene_undo');
    await expect(
      editor.page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].transform
            .position,
      ),
    ).resolves.toEqual([0, 0, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0, 0, 0] });

    await dispatchSceneTool(editor.page, 'scene_redo');
    await expect(
      editor.page.evaluate(
        () =>
          (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0].transform
            .position,
      ),
    ).resolves.toEqual([0.5, 0, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0.5, 0, 0] });

    await expect
      .poll(() => editor.page.locator('[data-reset-transform]').count())
      .toBe(3);
    await editor.page.locator('[data-reset-transform="position"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform.position,
        ),
      )
      .toEqual([0, 0, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0, 0, 0] });
    await expectEditorSettled(editor);

    await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.25, 0.1, -0.25],
        rotationDeg: [0, 30, 0],
        scale: [1.2, 1.1, 0.8],
      }),
    );
    await editor.page.locator('[data-reset-transform="rotationDeg"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform.rotationDeg,
        ),
      )
      .toEqual([0, 0, 0]);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({
        rotationDeg: [0, 0, 0],
        scale: [1.2, 1.1, 0.8],
      });

    await editor.page.locator('[data-reset-transform="scale"]').click();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              .transform.scale,
        ),
      )
      .toBe(1);
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ rotationDeg: [0, 0, 0], scale: [1, 1, 1] });
  }, 45000);

  test('quantizes completed transform commits by the active snap mode', async () => {
    harness = await createEditorTestHarness('editor-transform-snap');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformSnapEnabled(
        true,
      );
    });

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode(
        'translate',
      );
    });
    const translated = await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.38, 0.12, -0.12],
        rotationDeg: [0, 22, 0],
        scale: [1.04, 1.16, 0.96],
      }),
    );
    expect(translated.documentTransform).toMatchObject({
      position: [0.5, 0, 0],
      rotationDeg: [0, 22, 0],
      scale: [1.04, 1.16, 0.96],
    });
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ position: [0.5, 0, 0] });

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode('rotate');
    });
    const rotated = await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.5, 0, 0],
        rotationDeg: [0, 29, 0],
        scale: [1.04, 1.16, 0.96],
      }),
    );
    expect(rotated.documentTransform).toMatchObject({
      position: [0.5, 0, 0],
      rotationDeg: [0, 30, 0],
      scale: [1.04, 1.16, 0.96],
    });
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ rotationDeg: [0, 30, 0] });

    await editor.page.evaluate(() => {
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.setTransformMode('scale');
    });
    const scaled = await editor.page.evaluate(() =>
      (
        window as any
      ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit({
        position: [0.5, 0, 0],
        rotationDeg: [0, 30, 0],
        scale: [1.04, 1.16, 0.96],
      }),
    );
    expect(scaled.documentTransform).toMatchObject({
      position: [0.5, 0, 0],
      rotationDeg: [0, 30, 0],
      scale: [1, 1.2, 1],
    });
    await expect
      .poll(() => runtimeTransform(editor))
      .toMatchObject({ scale: [1, 1.2, 1] });
  }, 45000);

  test('exposes X/Y/Z translate handles and preserves untouched axes on commits', async () => {
    harness = await createEditorTestHarness('editor-transform-axes');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

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
        ['X', 'Y', 'Z'].map((axis) =>
          (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.findTransformControlPointerTarget(
            axis,
          ),
        ),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ axis: expect.stringMatching(/^X/) }),
      expect.objectContaining({ axis: expect.stringMatching(/^Y/) }),
      expect.objectContaining({ axis: expect.stringMatching(/^Z/) }),
    ]);

    for (const transform of [
      { position: [0.3, 0, 0], rotationDeg: [0, 0, 0], scale: 1 },
      { position: [0.3, 0.4, 0], rotationDeg: [0, 0, 0], scale: 1 },
      { position: [0.3, 0.4, -0.2], rotationDeg: [0, 0, 0], scale: 1 },
    ]) {
      const committed = await editor.page.evaluate((nextTransform) => {
        return (
          window as any
        ).IWSDK_SCENE_EDITOR_TEST_HOOKS.simulateTransformControlCommit(
          nextTransform,
        );
      }, transform);
      expect(committed.documentTransform).toMatchObject({
        position: transform.position,
      });
      await expect
        .poll(() => runtimeTransform(editor))
        .toMatchObject({ position: transform.position });
    }
  }, 45000);

  test('cancels an active transform drag with Escape without committing a patch', async () => {
    harness = await createEditorTestHarness('editor-transform-cancel');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    const dragging = await editor.page.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.beginTransformControlDrag({
        position: [1, 0.5, -0.25],
        rotationDeg: [0, 45, 0],
        scale: [1.5, 1.5, 1.5],
      }),
    );
    expect(dragging).toMatchObject({
      documentTransform: { position: [0, 0, 0] },
      objectTransform: {
        position: [1, 0.5, -0.25],
        rotationDeg: [0, 45, 0],
        scale: [1.5, 1.5, 1.5],
      },
      proof: {
        transformControls: {
          dragging: true,
        },
      },
    });

    await editor.page.keyboard.press('Escape');

    await expect
      .poll(() =>
        editor.page.evaluate(() => ({
          dirty: document.querySelector('#dirty-status')?.textContent,
          documentTransform: (window as any).IWSDK_SCENE_EDITOR.session.document
            .nodes[0].transform,
          objectTransform: (
            window as any
          ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlObjectTransform(),
          proof: (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof()
            .transformControls,
        })),
      )
      .toMatchObject({
        dirty: 'Saved',
        documentTransform: { position: [0, 0, 0] },
        objectTransform: {
          position: [0, 0, 0],
          rotationDeg: [0, 0, 0],
          scale: [1, 1, 1],
        },
        proof: {
          dragging: false,
        },
      });
  }, 45000);

  test('supports viewport keyboard shortcuts for modes, space, framing, and removal', async () => {
    harness = await createEditorTestHarness('editor-keyboard-shortcuts');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await editor.page.keyboard.press('E');
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) => proof.transformControls.mode,
        ),
      )
      .toBe('rotate');
    await editor.page.keyboard.press('R');
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) => proof.transformControls.mode,
        ),
      )
      .toBe('scale');
    await editor.page.keyboard.press('W');
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) => proof.transformControls.mode,
        ),
      )
      .toBe('translate');

    const initialSpace = await getEditorProof(editor.page).then(
      (proof) => proof.transformControls.space,
    );
    await editor.page.keyboard.press('Q');
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) => proof.transformControls.space,
        ),
      )
      .toBe(initialSpace === 'world' ? 'local' : 'world');

    await editor.page.keyboard.press('F');
    await expect
      .poll(() =>
        editor.page.evaluate(() => (window as any).__IWSDK_EDITOR_CAMERA),
      )
      .toMatchObject({
        lookAt: [0, 0.25, 0],
        view: 'custom',
      });

    await editor.page.keyboard.press('Delete');
    await expect
      .poll(() => dispatchSceneTool(editor.page, 'scene_get_hierarchy'))
      .toMatchObject({ hierarchy: [] });
    await expectEditorSettled(editor);

    await dispatchSceneTool(editor.page, 'scene_add_node', {
      node: {
        content: { asset: 'vase', type: 'asset' },
        id: 'vase-shortcut',
        transform: { position: [0, 0, 0] },
      },
    });
    await selectNode(editor.page, 'vase-shortcut');
    await editor.page.keyboard.press('Backspace');
    await expect
      .poll(() => dispatchSceneTool(editor.page, 'scene_get_hierarchy'))
      .toMatchObject({ hierarchy: [] });
    await expectEditorSettled(editor);
  }, 45000);
});

async function runtimeTransform(editor: EditorPageContext): Promise<any> {
  return editor.page.evaluate(() =>
    (
      window as any
    ).IWSDK_SCENE_EDITOR_TEST_HOOKS.getTransformControlObjectTransform(),
  );
}

async function expectEditorSettled(editor: EditorPageContext): Promise<void> {
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
}
