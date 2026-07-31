/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  addComponentViaPicker,
  createEditorTestHarness,
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

describe('editor right inspector runtime boundary', () => {
  test('keeps runtime internals out of the right inspector while proof hooks retain runtime facts', async () => {
    harness = await createEditorTestHarness('editor-runtime-inspector');
    const scene = await harness.readScene();
    scene.nodes[0].name = 'Friendly Table';
    await writeFile(harness.scenePath, JSON.stringify(scene, null, 2), 'utf8');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => rightInspectorSections(editor))
      .toEqual(['Asset', 'Visibility', 'Transform', 'Components']);
    await expect
      .poll(() => editor.page.locator('.metadata-editor').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-node-framing-role]').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('.runtime-inspector').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('.inspector-json-section').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-rename-node]').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-rename-node-id]').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-node-title-edit]').inputValue())
      .toBe('table-1');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-node-id="table-1"] .node-row-id')
          .textContent(),
      )
      .toBe('table-1');
    await expect
      .poll(() => editor.page.locator('#apply-transform').count())
      .toBe(0);
    await expect
      .poll(() =>
        editor.page
          .locator('#transform-editor-message')
          .evaluate((element) => getComputedStyle(element).display),
      )
      .toBe('none');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-transform-field="position.0"]')
          .evaluate((element) => ({
            appearance: getComputedStyle(element).appearance,
            stepperRule: [...document.styleSheets].some((sheet) =>
              [...sheet.cssRules].some(
                (rule) =>
                  rule instanceof CSSStyleRule &&
                  rule.selectorText.includes('::-webkit-inner-spin-button') &&
                  rule.style.getPropertyValue('-webkit-appearance') === 'none',
              ),
            ),
          })),
      )
      .toEqual({ appearance: 'textfield', stepperRule: true });
    await expect
      .poll(() =>
        editor.page.locator('.asset-editor .inspector-section-meta').count(),
      )
      .toBe(0);
    const components = editor.page.locator('.component-editor');
    await expect
      .poll(() =>
        components
          .locator('#component-editor-message')
          .evaluate((element) => getComputedStyle(element).display),
      )
      .toBe('none');
    await components.locator('summary').click();
    await expect.poll(() => components.getAttribute('open')).toBeNull();
    await expect
      .poll(() =>
        components.evaluate(
          (element) => getComputedStyle(element).paddingBottom,
        ),
      )
      .toBe('0px');
    await components.locator('summary').click();
    await writeInspectorEvidence(editor);

    await expect
      .poll(() => selectedRuntime(editor))
      .toMatchObject({
        assetStatus: 'registered',
        bounds: {
          size: expect.arrayContaining([
            expect.any(Number),
            expect.any(Number),
            expect.any(Number),
          ]),
        },
        componentCount: 0,
        meshCount: expect.any(Number),
        nodeId: 'table-1',
        ready: true,
      });
    const initialRuntime = await selectedRuntime(editor);
    expect(initialRuntime.objectCount).toBeGreaterThan(0);
    expect(initialRuntime.meshCount).toBeGreaterThan(0);
    expect(initialRuntime.materialCount).toBeGreaterThan(0);
    expect(initialRuntime.bounds.size.every((value: number) => value > 0)).toBe(
      true,
    );

    await editor.page.locator('[data-node-title-edit]').fill('table-renamed');
    await editor.page.locator('[data-node-title-edit]').press('Enter');
    await expect
      .poll(() => editor.page.locator('[data-node-title-edit]').inputValue())
      .toBe('table-renamed');
    await expect
      .poll(() =>
        editor.page.evaluate(() => ({
          nodeIds: (
            window as any
          ).IWSDK_SCENE_EDITOR.session.document.nodes.map(
            (node: { id: string }) => node.id,
          ),
          selection: (window as any).__IWSDK_EDITOR_SELECTION,
        })),
      )
      .toEqual({
        nodeIds: ['table-renamed'],
        selection: ['table-renamed'],
      });

    await addComponentViaPicker(editor.page, 'TestInspectable');

    await expect
      .poll(() =>
        editor.page
          .locator(
            '[data-component-type="TestInspectable"] .component-row-title > span',
          )
          .count(),
      )
      .toBe(0);

    await expect
      .poll(() => selectedRuntime(editor))
      .toMatchObject({
        componentCount: 1,
        components: ['TestInspectable'],
        nodeId: 'table-renamed',
        ready: true,
      });
  }, 45000);
});

async function rightInspectorSections(
  editor: EditorPageContext,
): Promise<string[]> {
  return editor.page
    .locator('#inspector .inspector-section')
    .evaluateAll((sections) =>
      sections
        .map(
          (section) =>
            section.querySelector('.inspector-section-title span:last-child')
              ?.textContent ?? '',
        )
        .filter(Boolean),
    );
}

async function selectedRuntime(editor: EditorPageContext): Promise<any> {
  return (await getEditorProof(editor.page)).selectedRuntime;
}

async function writeInspectorEvidence(
  editor: EditorPageContext,
): Promise<void> {
  const evidenceDir = process.env.IWSDK_EDITOR_E2E_EVIDENCE_DIR;
  if (!evidenceDir) {
    return;
  }
  await mkdir(evidenceDir, { recursive: true });
  await editor.page.screenshot({
    fullPage: true,
    path: path.join(evidenceDir, 'editor-runtime-inspector-proof.png'),
  });
}
