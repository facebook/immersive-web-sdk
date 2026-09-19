/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractConfiguration } from '../../src/init/world-initializer.js';
import {
  adoptXRSession,
  launchXR,
  ReferenceSpaceType,
} from '../../src/init/xr.js';

// xr.ts -> runtime barrel -> xr-input cursor-visual.ts touches `document` at
// module load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createWorld() {
  return {
    camera: {},
    renderer: {
      xr: {
        enabled: false,
        getDepthSensingMesh: () => null,
        setReferenceSpaceType: () => {},
        setSession: vi.fn(async () => {}),
      },
    },
    scene: { userData: {} },
    session: undefined,
    sessionRequestPending: false,
    xrDefaults: undefined,
  } as any;
}

function createSession() {
  const session = new EventTarget() as EventTarget & {
    end: ReturnType<typeof vi.fn>;
    requestReferenceSpace: ReturnType<typeof vi.fn>;
  };
  session.end = vi.fn().mockResolvedValue(undefined);
  session.requestReferenceSpace = vi.fn().mockResolvedValue({});
  return session as unknown as XRSession;
}

describe('launchXR', () => {
  let savedNavigator: PropertyDescriptor | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (savedNavigator) {
      Object.defineProperty(globalThis, 'navigator', savedNavigator);
    } else {
      delete (globalThis as any).navigator;
    }
    consoleError.mockRestore();
  });

  it('handles a rejected requestSession instead of leaving an unhandled rejection', async () => {
    const error = new Error('user denied');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr: { requestSession: vi.fn().mockRejectedValue(error) } },
    });

    const world = createWorld();
    expect(() => launchXR(world)).not.toThrow();
    await flush();

    expect(consoleError).toHaveBeenCalledWith(
      '[XR] Failed to start XR session:',
      error,
    );
    // Session was never established.
    expect(world.session).toBeUndefined();
  });

  it('does not throw synchronously when navigator.xr is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });

    const world = createWorld();
    // Pre-fix this threw "Cannot read properties of undefined (reading 'then')".
    expect(() => launchXR(world)).not.toThrow();
    await flush();
    expect(world.session).toBeUndefined();
  });

  it('disables offer flow when session-grant launch is enabled', () => {
    expect(
      extractConfiguration({
        xr: {
          launchOnSessionGranted: true,
          offer: 'always',
        },
      }).xr.offer,
    ).toBe('none');
    expect(
      extractConfiguration({
        xr: {
          offer: 'once',
        },
      }).xr.offer,
    ).toBe('once');
  });

  it('rejects launch attempts when XR was disabled for the world', () => {
    const world = createWorld();
    world.xrEnabled = false;

    expect(() => launchXR(world)).toThrow(
      'XR is disabled for this world. Create it with an XR configuration instead of { xr: false } before calling launchXR().',
    );
    expect(world.renderer.xr.enabled).toBe(false);
  });

  it('coalesces concurrent explicit session requests', async () => {
    let resolveRequest!: (session: XRSession) => void;
    const requestSession = vi.fn(
      () =>
        new Promise<XRSession>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr: { requestSession } },
    });
    const world = createWorld();

    launchXR(world, { restoreCameraOnExit: false });
    launchXR(world, { restoreCameraOnExit: false });

    expect(requestSession).toHaveBeenCalledTimes(1);
    expect(world.sessionRequestPending).toBe(true);

    const session = createSession();
    resolveRequest(session);
    await flush();

    expect(world.session).toBe(session);
    expect(world.sessionRequestPending).toBe(false);
  });

  it('clears request single-flight state after rejection so a retry can start', async () => {
    const session = createSession();
    const requestSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('not yet'))
      .mockResolvedValueOnce(session);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr: { requestSession } },
    });
    const world = createWorld();

    launchXR(world, { restoreCameraOnExit: false });
    await flush();
    expect(world.sessionRequestPending).toBe(false);

    launchXR(world, { restoreCameraOnExit: false });
    await flush();

    expect(requestSession).toHaveBeenCalledTimes(2);
    expect(world.session).toBe(session);
  });

  it('does not request another session while one is active', () => {
    const requestSession = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr: { requestSession } },
    });
    const world = createWorld();
    world.session = createSession();

    launchXR(world);

    expect(requestSession).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('XRSession already exists');
  });

  it('adopts only one session when offer and request settle together', async () => {
    const world = createWorld();
    const requested = createSession();
    const offered = createSession();

    const [requestedAdopted, offeredAdopted] = await Promise.all([
      adoptXRSession(world, requested, { restoreCameraOnExit: false }),
      adoptXRSession(world, offered, { restoreCameraOnExit: false }),
    ]);

    expect(requestedAdopted).toBe(true);
    expect(offeredAdopted).toBe(false);
    expect(world.session).toBe(requested);
    expect(offered.end).toHaveBeenCalledTimes(1);
    expect(world.renderer.xr.setSession).toHaveBeenCalledTimes(1);
  });

  it('does not adopt a waiting session that ends before the pending adoption settles', async () => {
    let rejectReferenceSpace!: (error: Error) => void;
    const world = createWorld();
    const pendingSession = createSession();
    pendingSession.requestReferenceSpace = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectReferenceSpace = reject;
        }),
    );
    const endedSession = createSession();
    const onPendingEnded = vi.fn();
    const onWaitingEnded = vi.fn();
    const options = {
      referenceSpace: {
        type: ReferenceSpaceType.LocalFloor,
        required: true,
      },
      restoreCameraOnExit: false,
    };

    const pendingAdoption = adoptXRSession(
      world,
      pendingSession,
      options,
      onPendingEnded,
    );
    await flush();
    const waitingAdoption = adoptXRSession(
      world,
      endedSession,
      options,
      onWaitingEnded,
    );
    (endedSession as unknown as EventTarget).dispatchEvent(new Event('end'));
    rejectReferenceSpace(new Error('pending adoption failed'));

    await expect(pendingAdoption).resolves.toBe(false);
    await expect(waitingAdoption).resolves.toBe(false);
    expect(endedSession.requestReferenceSpace).not.toHaveBeenCalled();
    expect(world.renderer.xr.setSession).not.toHaveBeenCalled();
    expect(world.session).toBeUndefined();
    expect(onPendingEnded).toHaveBeenCalledTimes(1);
    expect(onWaitingEnded).toHaveBeenCalledTimes(1);
  });

  it('does not retain a session that ends while renderer adoption is pending', async () => {
    let resolveSetSession!: () => void;
    const world = createWorld();
    world.renderer.xr.setSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSetSession = resolve;
        }),
    );
    const session = createSession();
    const onSessionEnded = vi.fn();

    const adoption = adoptXRSession(
      world,
      session,
      {
        restoreCameraOnExit: false,
      },
      onSessionEnded,
    );
    await flush();
    expect(world.renderer.xr.setSession).toHaveBeenCalledWith(session);

    (session as unknown as EventTarget).dispatchEvent(new Event('end'));
    resolveSetSession();

    await expect(adoption).resolves.toBe(false);
    expect(world.session).toBeUndefined();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('does not retain a session that ends while reference-space resolution is pending', async () => {
    let resolveReferenceSpace!: (space: object) => void;
    const world = createWorld();
    const session = createSession();
    session.requestReferenceSpace = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveReferenceSpace = resolve;
        }),
    );
    const onSessionEnded = vi.fn();

    const adoption = adoptXRSession(
      world,
      session,
      {
        restoreCameraOnExit: false,
      },
      onSessionEnded,
    );
    await flush();
    expect(session.requestReferenceSpace).toHaveBeenCalledTimes(1);

    (session as unknown as EventTarget).dispatchEvent(new Event('end'));
    resolveReferenceSpace({});

    await expect(adoption).resolves.toBe(false);
    expect(world.session).toBeUndefined();
    expect(world.renderer.xr.setSession).not.toHaveBeenCalled();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('notifies offer flow after failed adoption ends the session', async () => {
    const world = createWorld();
    const session = createSession();
    const failure = new Error('reference space unavailable');
    session.requestReferenceSpace = vi.fn().mockRejectedValue(failure);
    const onSessionEnded = vi.fn();

    await expect(
      adoptXRSession(
        world,
        session,
        { restoreCameraOnExit: false },
        onSessionEnded,
      ),
    ).resolves.toBe(false);

    expect(session.end).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });
});
