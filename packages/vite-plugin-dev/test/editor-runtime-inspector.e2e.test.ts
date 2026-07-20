/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir } from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import {
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
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);
    await selectNode(editor.page, 'table-1');

    await expect
      .poll(() => rightInspectorSections(editor))
      .toEqual(['Asset', 'Transform', 'Components', 'Metadata']);
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
    await writeInspectorEvidence(editor);

    await expect
      .poll(() => selectedRuntime(editor))
      .toMatchObject({
        assetStatus: 'loaded',
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

    await editor.page
      .locator('#new-component-type')
      .selectOption('TestInspectable');
    await editor.page.locator('#add-component').click();

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
