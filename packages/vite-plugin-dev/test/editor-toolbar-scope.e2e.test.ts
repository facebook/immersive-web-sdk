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

describe('editor toolbar scope', () => {
  test('keeps runtime playback controls out of the editor surface', async () => {
    harness = await createEditorTestHarness('editor-toolbar-scope');
    const editor = await harness.openEditor();
    await expectRealWebGLViewport(editor);

    await expect
      .poll(() => editor.page.locator('#transport-toolbar').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('#transport-status').count())
      .toBe(0);
    await expect
      .poll(() => editor.page.locator('[data-transport-action]').count())
      .toBe(0);
    await expect
      .poll(() => getEditorProof(editor.page).then((proof) => proof.transport))
      .toBeUndefined();
    await expect
      .poll(() => editor.page.locator('#transform-toolbar button').count())
      .toBe(3);
    await expect
      .poll(() => editor.page.locator('#save').isVisible())
      .toBe(true);
    await expect
      .poll(() => editor.page.locator('#revert').isVisible())
      .toBe(true);
    await expect
      .poll(() => editor.page.locator('#editor-status-strip').textContent())
      .not.toMatch(/\b(play|pause|preview|playing|paused)\b/i);
  }, 45000);
});
