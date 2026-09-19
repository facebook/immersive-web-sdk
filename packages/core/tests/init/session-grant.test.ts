/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armSessionGrantCapture,
  armSessionGrantCaptureForOptions,
  onSessionGrant,
  resetSessionGrantCaptureForTests,
} from '../../src/init/session-grant.js';

describe('session grant capture', () => {
  let savedNavigator: PropertyDescriptor | undefined;

  beforeEach(() => {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    resetSessionGrantCaptureForTests();
  });

  afterEach(() => {
    resetSessionGrantCaptureForTests();
    vi.useRealTimers();
    if (savedNavigator) {
      Object.defineProperty(globalThis, 'navigator', savedNavigator);
    } else {
      delete (globalThis as any).navigator;
    }
  });

  function installXRSystem(): EventTarget {
    const xr = new EventTarget();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { xr },
    });
    return xr;
  }

  it('captures a grant before the world subscribes', () => {
    const xr = installXRSystem();
    const callback = vi.fn();

    armSessionGrantCapture();
    xr.dispatchEvent(new Event('sessiongranted'));
    onSessionGrant(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('delivers a grant that arrives after the world subscribes', () => {
    const xr = installXRSystem();
    const callback = vi.fn();

    armSessionGrantCapture();
    onSessionGrant(callback);
    xr.dispatchEvent(new Event('sessiongranted'));
    xr.dispatchEvent(new Event('sessiongranted'));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps persistent subscribers armed across repeated grants', () => {
    const xr = installXRSystem();
    const callback = vi.fn();

    armSessionGrantCapture();
    const unsubscribe = onSessionGrant(callback, { persistent: true });
    xr.dispatchEvent(new Event('sessiongranted'));
    xr.dispatchEvent(new Event('sessiongranted'));

    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
    xr.dispatchEvent(new Event('sessiongranted'));
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('isolates a throwing subscriber while delivering a grant', () => {
    const xr = installXRSystem();
    const failure = new Error('subscriber failed');
    const failing = vi.fn(() => {
      throw failure;
    });
    const pending = vi.fn();
    const persistent = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    armSessionGrantCapture();
    onSessionGrant(failing);
    onSessionGrant(pending);
    onSessionGrant(persistent, { persistent: true });

    expect(() => xr.dispatchEvent(new Event('sessiongranted'))).not.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(persistent).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[XR] sessiongranted subscriber failed:',
      failure,
    );

    xr.dispatchEvent(new Event('sessiongranted'));
    expect(failing).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(persistent).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('keeps a persistent subscriber after consuming an early grant', () => {
    const xr = installXRSystem();
    const callback = vi.fn();

    armSessionGrantCapture();
    xr.dispatchEvent(new Event('sessiongranted'));
    const unsubscribe = onSessionGrant(callback, { persistent: true });
    expect(callback).toHaveBeenCalledTimes(1);

    xr.dispatchEvent(new Event('sessiongranted'));
    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('arms only one listener for the same XRSystem', () => {
    const xr = installXRSystem();
    const addEventListener = vi.spyOn(xr, 'addEventListener');

    armSessionGrantCapture();
    armSessionGrantCapture();

    expect(addEventListener).toHaveBeenCalledTimes(1);
  });

  it('pre-arms grant capture for direct world initialization options', () => {
    const xr = installXRSystem();
    const addEventListener = vi.spyOn(xr, 'addEventListener');
    const callback = vi.fn();

    armSessionGrantCaptureForOptions({ launchOnSessionGranted: true });
    xr.dispatchEvent(new Event('sessiongranted'));
    onSessionGrant(callback);

    expect(addEventListener).toHaveBeenCalledWith(
      'sessiongranted',
      expect.any(Function),
    );
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not arm grant capture when grant-driven launch is disabled', () => {
    const xr = installXRSystem();
    const addEventListener = vi.spyOn(xr, 'addEventListener');

    armSessionGrantCaptureForOptions(undefined);
    armSessionGrantCaptureForOptions(false);
    armSessionGrantCaptureForOptions({ launchOnSessionGranted: false });

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('discards grants that are more than 30 seconds old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const xr = installXRSystem();
    const callback = vi.fn();

    armSessionGrantCapture();
    xr.dispatchEvent(new Event('sessiongranted'));
    vi.setSystemTime(new Date(30_001));
    onSessionGrant(callback);

    expect(callback).not.toHaveBeenCalled();
    xr.dispatchEvent(new Event('sessiongranted'));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribing and environments without navigator.xr', () => {
    const xr = installXRSystem();
    const callback = vi.fn();
    armSessionGrantCapture();
    const unsubscribe = onSessionGrant(callback);
    unsubscribe();

    xr.dispatchEvent(new Event('sessiongranted'));
    expect(callback).not.toHaveBeenCalled();

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    expect(() => armSessionGrantCapture()).not.toThrow();
  });
});
