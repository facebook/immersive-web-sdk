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
  expectRealWebGLViewport,
  getEditorProof,
  selectNode,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor player rig', () => {
  test('renders fixed player spaces and persists transforms, components, and children', async () => {
    harness = await createEditorTestHarness('editor-player-rig');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    const builtins = editor.page.locator('[data-builtin-node]');
    await expect
      .poll(() =>
        builtins.evaluateAll((rows) =>
          rows.map((row) => row.getAttribute('data-builtin-node')),
        ),
      )
      .toEqual([
        'player',
        'camera',
        'head',
        'left-target-ray',
        'left-grip',
        'right-target-ray',
        'right-grip',
        'level-root',
      ]);
    await expect
      .poll(() => builtins.locator('.node-row-built-in').count())
      .toBe(8);
    for (const target of ['player', 'level-root']) {
      await expect
        .poll(() =>
          editor.page
            .locator(`[data-builtin-node="${target}"] .node-row-caret`)
            .count(),
        )
        .toBe(0);
    }
    for (const target of [
      'camera',
      'head',
      'left-target-ray',
      'left-grip',
      'right-target-ray',
      'right-grip',
    ]) {
      await expect
        .poll(() =>
          editor.page
            .locator(
              `[data-builtin-node="${target}"] .node-row-caret .lucide-icon`,
            )
            .count(),
        )
        .toBe(0);
    }
    await expect
      .poll(() =>
        builtins.evaluateAll((rows) =>
          rows.every((row) => row.getAttribute('draggable') === 'true'),
        ),
      )
      .toBe(true);
    await selectNode(editor.page, 'table-1');
    await addComponentViaPicker(editor.page, 'Follower');
    const followerTarget = editor.page.locator(
      '[data-component-type="Follower"] [data-component-field-row="target"]',
    );
    await expect
      .poll(() => followerTarget.getAttribute('data-field-invalid'))
      .toBe('true');
    await expect
      .poll(() =>
        followerTarget.locator('.component-field-warning').textContent(),
      )
      .toContain('Drag an entity');
    const entityTypography = await followerTarget
      .locator('.component-entity-value')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { family: style.fontFamily, size: style.fontSize };
      });
    const numericTypography = await editor.page
      .locator(
        '[data-component-type="Follower"] [data-component-vector-field="offsetPosition"]',
      )
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { family: style.fontFamily, size: style.fontSize };
      });
    expect(entityTypography).toEqual(numericTypography);

    await editor.page
      .locator('[data-node-id="table-1"]')
      .dragTo(followerTarget.locator('[data-component-entity-drop]'));
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              ?.components?.['com.iwsdk.components.Follower']?.target,
        ),
      )
      .toEqual({ id: 'table-1', type: 'node' });

    await editor.page
      .locator('[data-builtin-node="head"]')
      .dragTo(followerTarget.locator('[data-component-entity-drop]'));
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              ?.components?.['com.iwsdk.components.Follower']?.target,
        ),
      )
      .toEqual({ target: 'head', type: 'player-space' });
    await expect
      .poll(() => followerTarget.getAttribute('data-field-invalid'))
      .toBe('false');

    await addComponentViaPicker(editor.page, 'AudioSource');
    const audioSource = editor.page.locator(
      '[data-component-type="AudioSource"] [data-component-field-row="src"]',
    );
    await expect
      .poll(() => audioSource.getAttribute('data-field-invalid'))
      .toBe('true');
    const validation = await dispatchSceneTool(editor.page, 'scene_validate');
    expect(validation).toMatchObject({ valid: false });
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required',
          path: expect.stringMatching(/AudioSource.*src/u),
        }),
      ]),
    );
    await editor.page
      .locator('[data-component-type="AudioSource"] [data-remove-component]')
      .click();
    await expect
      .poll(() =>
        editor.page.locator('[data-component-type="AudioSource"]').count(),
      )
      .toBe(0);
    await expect
      .poll(() =>
        getEditorProof(editor.page).then((proof) => proof.builtInObjects),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'player',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'camera',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'head',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'left-target-ray',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'left-grip',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'right-target-ray',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'right-grip',
          }),
          expect.objectContaining({
            meshCount: expect.any(Number),
            target: 'level-root',
          }),
        ]),
      );
    await expect
      .poll(() =>
        getEditorProof(editor.page).then((proof) =>
          proof.builtInObjects.every(
            (entry: any) =>
              entry.materialOpacity === 0.32 &&
              entry.wireframeMaterialCount === 0,
          ),
        ),
      )
      .toBe(true);

    await editor.page
      .locator('[data-builtin-node="left-target-ray"]')
      .click({ button: 'right' });
    await expect
      .poll(() => editor.page.locator('#scene-graph-context-menu').isHidden())
      .toBe(true);

    await editor.page
      .locator('[data-builtin-node="level-root"]')
      .click({ button: 'right' });
    await expect
      .poll(() => editor.page.locator('#scene-graph-context-menu').isHidden())
      .toBe(true);

    await editor.page.locator('[data-builtin-node="player"]').click();
    await expect
      .poll(() =>
        editor.page.locator('[data-builtin-inspector="player"]').count(),
      )
      .toBe(1);
    await expect
      .poll(() => editor.page.locator('.transform-section').count())
      .toBe(1);
    const positionX = editor.page.locator(
      '[data-builtin-inspector="player"] [data-transform-field="position.0"]',
    );
    await positionX.fill('2.5');
    await positionX.blur();
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.player
              ?.transform?.position,
        ),
      )
      .toEqual([2.5, 0, 0]);
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) =>
            proof.builtInObjects.find((entry: any) => entry.target === 'player')
              ?.transform?.position,
        ),
      )
      .toEqual([2.5, 0, 0]);

    await editor.page.locator('[data-builtin-node="left-target-ray"]').click();
    await expect
      .poll(() => editor.page.locator('.transform-section').count())
      .toBe(0);
    await addComponentViaPicker(editor.page, 'TestInspectable');
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.player
              ?.leftTargetRay?.components?.TestInspectable,
        ),
      )
      .toMatchObject({ enabled: true });

    await editor.page
      .locator('[data-node-id="table-1"]')
      .dragTo(editor.page.locator('[data-builtin-node="left-target-ray"]'));
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]
              ?.parent,
        ),
      )
      .toEqual({ target: 'left-target-ray', type: 'player-space' });
    await expect
      .poll(() =>
        editor.page
          .locator(
            '[data-builtin-node="left-target-ray"] .node-row-caret .lucide-icon',
          )
          .count(),
      )
      .toBe(1);
    const leftTargetRay = editor.page.locator(
      '[data-builtin-node="left-target-ray"]',
    );
    await expect
      .poll(() => leftTargetRay.getAttribute('aria-expanded'))
      .toBe('true');
    await leftTargetRay.locator('[data-outliner-disclosure]').click();
    await expect
      .poll(() => leftTargetRay.getAttribute('aria-expanded'))
      .toBe('false');
    await expect
      .poll(() => editor.page.locator('[data-node-id="table-1"]').count())
      .toBe(0);
    await leftTargetRay.locator('[data-outliner-disclosure]').click();
    await expect
      .poll(() => leftTargetRay.getAttribute('aria-expanded'))
      .toBe('true');
    await expect
      .poll(() =>
        getEditorProof(editor.page).then(
          (proof) =>
            proof.objectHierarchy.find(
              (entry: any) => entry.nodeId === 'table-1',
            )?.builtinParent,
        ),
      )
      .toBe('left-target-ray');

    await editor.page.keyboard.press('Delete');
    await expect
      .poll(() =>
        editor.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes.length,
        ),
      )
      .toBe(1);

    const reloaded = await harness.openEditor();
    await reloaded.page.locator('[data-builtin-node="player"]').click();
    await expect
      .poll(() =>
        reloaded.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.player
              ?.transform?.position,
        ),
      )
      .toEqual([2.5, 0, 0]);
    await reloaded.page
      .locator('[data-builtin-node="left-target-ray"]')
      .click();
    await expect
      .poll(() =>
        reloaded.page
          .locator('[data-component-type="TestInspectable"]')
          .count(),
      )
      .toBe(1);
    await expect
      .poll(() =>
        reloaded.page.evaluate(
          () =>
            (window as any).IWSDK_SCENE_EDITOR.session.document.nodes[0]?.parent
              ?.target,
        ),
      )
      .toBe('left-target-ray');
  }, 45000);
});
