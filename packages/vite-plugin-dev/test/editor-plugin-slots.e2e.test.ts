/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, test } from 'vitest';
import {
  createEditorTestHarness,
  expectRealWebGLViewport,
  getEditorProof,
  type EditorTestHarness,
} from './editor-e2e-fixture.js';

let harness: EditorTestHarness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('editor plugin slots', () => {
  test('validates and renders toolbar, sidebar, inspector, bottom panel, and viewport overlay contributions', async () => {
    harness = await createEditorTestHarness('editor-plugin-slots');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await editor.page.evaluate(() => {
      const api = (window as any).IWSDK_SCENE_EDITOR;
      (window as any).__EDITOR_PLUGIN_CLICKED = [];
      api.registerContribution({
        body: 'Runs a contributed scene audit',
        icon: 'Eye',
        id: 'audit-toolbar',
        label: 'Audit',
        onClick: ({ contribution }: any) => {
          (window as any).__EDITOR_PLUGIN_CLICKED.push(contribution.id);
        },
        order: 2,
        slot: 'toolbar.right',
      });
      api.registerContribution({
        body: 'Scene extension metadata',
        icon: 'Boxes',
        id: 'scene-sidebar',
        label: 'Scene Plugin',
        order: 1,
        slot: 'sidebar.top',
      });
      api.registerContribution({
        body: 'Pinned object extension',
        id: 'object-pinned',
        label: 'Pinned Plugin',
        slot: 'inspector.pinned',
      });
      api.registerContribution({
        body: 'Schema-owned inspector section',
        id: 'object-section',
        label: 'Plugin Section',
        slot: 'inspector.section',
      });
      api.registerContribution({
        body: 'Workbench overlay contribution',
        id: 'viewport-overlay',
        label: 'Overlay',
        slot: 'viewport.overlay',
      });
      api.registerContribution({
        body: 'Contribution diagnostics content',
        id: 'diagnostics-tab',
        label: 'Plugin',
        slot: 'bottomPanel.tab',
      });
    });

    await editor.page.locator('[data-node-id="table-1"]').click();

    await expect
      .poll(() =>
        editor.page
          .locator('[data-editor-contribution-id]')
          .evaluateAll((nodes) =>
            nodes.map((node) =>
              node.getAttribute('data-editor-contribution-id'),
            ),
          ),
      )
      .toEqual(
        expect.arrayContaining([
          'audit-toolbar',
          'scene-sidebar',
          'object-pinned',
          'object-section',
          'viewport-overlay',
          'diagnostics-tab',
        ]),
      );
    await expect
      .poll(() =>
        editor.page
          .locator('[data-editor-slot="viewport.overlay"]')
          .textContent(),
      )
      .toContain('Workbench overlay contribution');
    await expect
      .poll(() =>
        editor.page
          .locator('[data-editor-slot="inspector.section"]')
          .textContent(),
      )
      .toContain('Schema-owned inspector section');

    await editor.page
      .locator('[data-editor-contribution-id="audit-toolbar"]')
      .click();
    await expect
      .poll(() =>
        editor.page.evaluate(() => (window as any).__EDITOR_PLUGIN_CLICKED),
      )
      .toEqual(['audit-toolbar']);

    await editor.page
      .locator('[data-bottom-tab="contribution:diagnostics-tab"]')
      .click();
    await expect
      .poll(() => editor.page.locator('#bottom-panel-content').textContent())
      .toContain('Contribution diagnostics content');

    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.registerContribution({
          id: 'bad-slot',
          label: 'Bad',
          slot: 'unsupported.slot',
        }),
      ),
    ).rejects.toThrow('Unsupported editor contribution slot');
    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.registerContribution(null),
      ),
    ).rejects.toThrow('Editor contribution must be an object');
    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.registerContribution({
          id: 'bad id',
          label: 'Bad',
          slot: 'toolbar.left',
        }),
      ),
    ).rejects.toThrow('Editor contribution id must be a stable identifier');
    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.registerContribution({
          id: 'missing-label',
          slot: 'toolbar.left',
        }),
      ),
    ).rejects.toThrow('Editor contribution label is required');
    await expect(
      editor.page.evaluate(() =>
        (window as any).IWSDK_SCENE_EDITOR.registerContribution({
          id: 'bad-callback',
          label: 'Bad callback',
          onClick: 'alert(1)',
          slot: 'toolbar.left',
        }),
      ),
    ).rejects.toThrow('Editor contribution onClick must be a function');

    const replacement = await editor.page.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR.registerContribution({
        body: 'x'.repeat(900),
        id: 'scene-sidebar',
        label: 'Scene Plugin Updated',
        slot: 'sidebar.top',
      }),
    );
    expect(replacement).toMatchObject({
      contribution: {
        id: 'scene-sidebar',
        label: 'Scene Plugin Updated',
        slot: 'sidebar.top',
      },
      valid: true,
    });
    expect(replacement.contribution.body.length).toBe(800);
    await expect
      .poll(() =>
        editor.page
          .locator('[data-editor-contribution-id="scene-sidebar"]')
          .textContent(),
      )
      .toContain('Scene Plugin Updated');

    const contributionProof = await editor.page.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getContributions(),
    );
    expect(contributionProof).toMatchObject({
      count: 6,
      slots: {
        'bottomPanel.tab': 1,
        'inspector.pinned': 1,
        'inspector.section': 1,
        'sidebar.top': 1,
        'toolbar.right': 1,
        'viewport.overlay': 1,
      },
    });
    const viewportProof = await getEditorProof(editor.page);
    expect(viewportProof.contributions).toMatchObject({
      count: 6,
    });
    expect(viewportProof.layout.contributionSlots['viewport.overlay']).toEqual(
      expect.objectContaining({
        pointerEvents: 'none',
        position: 'absolute',
      }),
    );
    await expect(
      editor.page.evaluate(() => {
        const overlay = document.querySelector(
          '[data-editor-slot="viewport.overlay"]',
        );
        const rect = overlay?.getBoundingClientRect();
        if (rect == null) {
          return null;
        }
        const element = document.elementFromPoint(
          rect.left + Math.min(12, rect.width / 2),
          rect.top + Math.min(12, rect.height / 2),
        );
        return {
          contributionId: element
            ?.closest('[data-editor-contribution-id]')
            ?.getAttribute('data-editor-contribution-id'),
          renderer: (element as HTMLElement | null)?.dataset?.renderer,
          slot: element
            ?.closest('[data-editor-slot]')
            ?.getAttribute('data-editor-slot'),
          tagName: element?.tagName,
        };
      }),
    ).resolves.not.toMatchObject({
      contributionId: 'viewport-overlay',
      slot: 'viewport.overlay',
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
          position: [0.18, 0, 0],
          rotationDeg: [0, 0, 0],
          scale: 1,
        }),
      ),
    ).resolves.toMatchObject({
      documentTransform: { position: [0.18, 0, 0] },
    });
  }, 45000);
});
