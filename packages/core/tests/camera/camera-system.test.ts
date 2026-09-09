/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraSource } from '../../src/camera/camera-source.js';
import { CameraSystem } from '../../src/camera/camera-system.js';
import { CameraUtils } from '../../src/camera/camera-utils.js';
import { CameraFacing, CameraState } from '../../src/camera/types.js';
import type { Entity } from '../../src/ecs/entity.js';
import { VisibilityState } from '../../src/ecs/world.js';

function createCameraEntity(
  overrides: Record<string, unknown> = {},
): Entity & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>([
    ['deviceId', 'camera-1'],
    ['facing', 'unknown'],
    ['width', 1920],
    ['height', 1080],
    ['frameRate', 30],
    ['state', CameraState.Inactive],
    ['stream', null],
    ['videoElement', null],
    ['texture', null],
    ...Object.entries(overrides),
  ]);
  return {
    getValue: vi.fn((_component, key: string) => values.get(key)),
    setValue: vi.fn((_component, key: string, value: unknown) => {
      values.set(key, value);
    }),
    values,
  } as unknown as Entity & { values: Map<string, unknown> };
}

function createStream() {
  const stop = vi.fn();
  return {
    getTracks: () => [{ stop }],
    stop,
  };
}

function createVideoElement() {
  const listeners = new Map<string, Set<(event?: Event) => void>>();
  return {
    addEventListener: vi.fn(
      (type: string, listener: (event?: Event) => void) => {
        let callbacks = listeners.get(type);
        if (callbacks == null) {
          callbacks = new Set();
          listeners.set(type, callbacks);
        }
        callbacks.add(listener);
        if (type === 'canplay') {
          queueMicrotask(() => listener());
        }
      },
    ),
    muted: false,
    pause: vi.fn(),
    play: vi.fn(async () => {}),
    removeEventListener: vi.fn(
      (type: string, listener: (event?: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
    ),
    setAttribute: vi.fn(),
    srcObject: null as unknown,
  };
}

function createSystem(entities: Entity[] = []) {
  let disqualify: ((entity: Entity) => void) | undefined;
  const visibilityUnsubscribe = vi.fn();
  const queryUnsubscribe = vi.fn();
  const world = {
    visibilityState: {
      value: VisibilityState.NonImmersive,
      subscribe: vi.fn(() => visibilityUnsubscribe),
    },
  };
  const query = {
    entities: new Set(entities),
    subscribe: vi.fn((event: string, callback: (entity: Entity) => void) => {
      if (event === 'disqualify') {
        disqualify = callback;
      }
      return queryUnsubscribe;
    }),
  };
  const system = new CameraSystem(world as any, {} as any, 0);
  (system as any).queries = { cameras: query };
  return {
    disqualify: () => disqualify,
    queryUnsubscribe,
    system,
    visibilityUnsubscribe,
  };
}

function installBrowserMocks() {
  const documentListeners = new Map<string, (event?: Event) => void>();
  const documentMock = {
    addEventListener: vi.fn(
      (type: string, listener: (event?: Event) => void) => {
        documentListeners.set(type, listener);
      },
    ),
    createElement: vi.fn(() => createVideoElement()),
    removeEventListener: vi.fn(
      (type: string, listener: (event?: Event) => void) => {
        if (documentListeners.get(type) === listener) {
          documentListeners.delete(type);
        }
      },
    ),
    visibilityState: 'visible',
  };
  const getUserMedia = vi.fn();
  vi.stubGlobal('document', documentMock);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
    },
  });
  return { documentListeners, documentMock, getUserMedia };
}

describe('CameraSystem lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('releases an active stream before restarting the camera', async () => {
    const browser = installBrowserMocks();
    const oldStream = createStream();
    const oldVideo = createVideoElement();
    const oldTexture = { dispose: vi.fn() };
    const nextStream = createStream();
    browser.getUserMedia.mockResolvedValue(nextStream);
    const entity = createCameraEntity({
      state: CameraState.Inactive,
      stream: oldStream,
      texture: oldTexture,
      videoElement: oldVideo,
    });
    const { system } = createSystem([entity]);

    await (system as any).startCamera(entity);

    expect(oldStream.stop).toHaveBeenCalledOnce();
    expect(oldVideo.pause).toHaveBeenCalledOnce();
    expect(oldVideo.srcObject).toBeNull();
    expect(oldTexture.dispose).toHaveBeenCalledOnce();
    expect(entity.values.get('stream')).toBe(nextStream);
    expect(entity.values.get('state')).toBe(CameraState.Active);
  });

  it('provides an explicit restart path after configuration changes', () => {
    installBrowserMocks();
    const entity = createCameraEntity({ state: CameraState.Error });

    CameraUtils.restart(entity);

    expect(entity.values.get('state')).toBe(CameraState.Inactive);
  });
  it('does not retry a permanent camera error on every frame', async () => {
    const browser = installBrowserMocks();
    browser.getUserMedia.mockRejectedValue(new Error('permission denied'));
    const entity = createCameraEntity();
    const { system } = createSystem([entity]);

    await (system as any).startCamera(entity);
    expect(entity.values.get('state')).toBe(CameraState.Error);

    system.update();
    expect(browser.getUserMedia).toHaveBeenCalledOnce();
  });

  it('reports an error when the requested facing is not exposed', async () => {
    const browser = installBrowserMocks();
    vi.spyOn(CameraUtils, 'getDevices').mockResolvedValue([
      {
        deviceId: 'front-camera',
        facing: CameraFacing.Front,
        label: 'Front Camera',
      },
    ]);
    const entity = createCameraEntity({
      deviceId: '',
      facing: CameraFacing.Back,
    });
    const { system } = createSystem([entity]);

    await (system as any).startCamera(entity);

    expect(entity.values.get('state')).toBe(CameraState.Error);
    expect(browser.getUserMedia).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'No back-facing camera available (found 1 camera(s))',
    );
  });
  it('keeps a newer camera start when an older request resolves first', async () => {
    const browser = installBrowserMocks();
    let resolveFirst!: (stream: ReturnType<typeof createStream>) => void;
    let resolveSecond!: (stream: ReturnType<typeof createStream>) => void;
    browser.getUserMedia
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const entity = createCameraEntity();
    const { system } = createSystem([entity]);

    const firstStart = (system as any).startCamera(entity);
    entity.setValue(CameraSource, 'deviceId', 'camera-2');
    entity.setValue(CameraSource, 'state', CameraState.Inactive);
    const secondStart = (system as any).startCamera(entity);

    const firstStream = createStream();
    resolveFirst(firstStream);
    await firstStart;
    expect(firstStream.stop).toHaveBeenCalledOnce();
    expect(entity.values.get('state')).toBe(CameraState.Starting);

    const secondStream = createStream();
    resolveSecond(secondStream);
    await secondStart;
    expect(entity.values.get('stream')).toBe(secondStream);
    expect(entity.values.get('state')).toBe(CameraState.Active);
  });

  it('stops streams when the page hides, the entity leaves, or the system is destroyed', () => {
    const browser = installBrowserMocks();
    const pageHiddenStream = createStream();
    const pageHiddenVideo = createVideoElement();
    const pageHiddenTexture = { dispose: vi.fn() };
    const entity = createCameraEntity({
      state: CameraState.Active,
      stream: pageHiddenStream,
      texture: pageHiddenTexture,
      videoElement: pageHiddenVideo,
    });
    const { disqualify, queryUnsubscribe, system, visibilityUnsubscribe } =
      createSystem([entity]);
    system.init();

    browser.documentMock.visibilityState = 'hidden';
    browser.documentListeners.get('visibilitychange')?.();
    expect(pageHiddenStream.stop).toHaveBeenCalledOnce();
    expect(pageHiddenVideo.pause).toHaveBeenCalledOnce();
    expect(pageHiddenTexture.dispose).toHaveBeenCalledOnce();

    system.update();
    expect(browser.getUserMedia).not.toHaveBeenCalled();

    const removedStream = createStream();
    entity.values.set('state', CameraState.Active);
    entity.values.set('stream', removedStream);
    disqualify()?.(entity);
    expect(removedStream.stop).toHaveBeenCalledOnce();

    const destroyStream = createStream();
    entity.values.set('state', CameraState.Active);
    entity.values.set('stream', destroyStream);
    system.destroy();

    expect(destroyStream.stop).toHaveBeenCalledOnce();
    expect(visibilityUnsubscribe).toHaveBeenCalledOnce();
    expect(queryUnsubscribe).toHaveBeenCalledOnce();
    expect(browser.documentMock.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
