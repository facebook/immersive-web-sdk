/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Locomotor } from '../../src/core/locomotor.js';
import { MessageType } from '../../src/types/message-types.js';

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  postedMessages: unknown[] = [];

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  terminate(): void {}
}

describe('Locomotor initialization', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the configured initial position in worker mode', async () => {
    const initialPlayerPosition = new Vector3(4, 3, -2);
    const locomotor = new Locomotor({ initialPlayerPosition, useWorker: true });

    await locomotor.initialize();

    expect(locomotor.position).toEqual(initialPlayerPosition);
    expect(MockWorker.instances[0].postedMessages[0]).toEqual({
      type: MessageType.Init,
      payload: { initialPlayerPosition: [4, 3, -2] },
    });

    locomotor.update(1 / 60);

    expect(locomotor.position).toEqual(initialPlayerPosition);
  });

  it('exposes the configured initial position in inline mode', async () => {
    const initialPlayerPosition = new Vector3(-3, 5, 7);
    const locomotor = new Locomotor({
      initialPlayerPosition,
      useWorker: false,
    });

    await locomotor.initialize();
    locomotor.update(1 / 60);

    expect(locomotor.position).toEqual(initialPlayerPosition);
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('exposes teleports immediately while the worker catches up', async () => {
    const locomotor = new Locomotor({ useWorker: true });
    await locomotor.initialize();

    locomotor.teleport(new Vector3(7, 0, -4));

    expect(locomotor.position.toArray()).toEqual([7, 0, -4]);
    expect(
      Array.from(
        MockWorker.instances[0].postedMessages.at(-1) as ArrayLike<number>,
      ).slice(0, 4),
    ).toEqual([MessageType.Teleport, 7, 0, -4]);
    locomotor.update(1 / 60);
    expect(locomotor.position.toArray()).toEqual([7, 0, -4]);
  });

  it('forwards jump requests to the worker', async () => {
    const locomotor = new Locomotor({ useWorker: true });
    await locomotor.initialize();

    locomotor.jump();

    expect(MockWorker.instances[0].postedMessages.at(-1)).toEqual([
      MessageType.Jump,
    ]);
  });
});
