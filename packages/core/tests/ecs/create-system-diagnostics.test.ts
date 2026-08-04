/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import { createSystem } from '../../src/ecs/system.js';

describe('createSystem diagnostics', () => {
  it('explains where a misplaced lifecycle method belongs', () => {
    expect(() =>
      createSystem({
        update: (() => {}) as any,
      } as any),
    ).toThrow('Move update() into the subclass body');
  });

  it('accepts ordinary query descriptors', () => {
    expect(() =>
      createSystem({
        entities: { required: [] },
      }),
    ).not.toThrow();
  });
});
