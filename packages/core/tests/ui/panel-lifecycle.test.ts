/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/index.js';
import { PanelUISystem } from '../../src/ui/ui.js';

vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({}),
      style: {},
    }),
  };
});

function createPanelSystem(): PanelUISystem {
  const world = {
    camera: new PerspectiveCamera(),
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: {},
    scene: new Scene(),
    visibilityState: { value: 'non-immersive' },
  };
  return new PanelUISystem(world as any, {} as any, 0);
}

describe('PanelUISystem lifecycle', () => {
  it('rejects a plain entity before loading or attaching a PanelDocument', async () => {
    const addComponent = vi.fn();
    const entity = { index: 7, object3D: undefined, addComponent };
    const system = createPanelSystem();

    await expect((system as any).loadPanel(entity)).rejects.toThrow(
      'world.createTransformEntity()',
    );
    expect(addComponent).not.toHaveBeenCalled();
  });
});
