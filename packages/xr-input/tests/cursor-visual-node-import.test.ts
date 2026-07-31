/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';

describe('CursorVisual module', () => {
  it('can be imported in Node without creating browser resources', async () => {
    expect(globalThis.document).toBeUndefined();
    await expect(import('../src/pointer/cursor-visual.js')).resolves.toEqual(
      expect.objectContaining({ CursorVisual: expect.any(Function) }),
    );
  });
});
