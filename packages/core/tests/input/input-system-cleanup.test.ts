/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { InputSystem } from '../../src/input/input-system.js';

describe('InputSystem cleanup', () => {
  it('detaches pointer listeners without mutating a destroyed entity', () => {
    const removeEventListener = vi.fn();
    const object3D = { removeEventListener };
    const listeners = {
      enter: vi.fn(),
      leave: vi.fn(),
      down: vi.fn(),
      up: vi.fn(),
    };
    const removeComponent = vi.fn();
    const entity = {
      active: false,
      object3D,
      removeComponent,
    };
    const system = Object.create(InputSystem.prototype) as InputSystem & {
      listeners: WeakMap<object, typeof listeners>;
      cleanupEventListeners(entity: typeof entity): void;
    };
    system.listeners = new WeakMap([[object3D, listeners]]);

    system.cleanupEventListeners(entity);

    expect(removeEventListener).toHaveBeenCalledTimes(4);
    expect(system.listeners.has(object3D)).toBe(false);
    expect(removeComponent).not.toHaveBeenCalled();
  });
});
