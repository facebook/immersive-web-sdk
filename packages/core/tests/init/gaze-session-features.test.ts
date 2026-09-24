/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { buildSessionInit } from '../../src/init/xr.js';

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

/** `XRSessionInit` types both arrays as optional; narrow for terser asserts. */
function features(init: XRSessionInit) {
  return {
    optional: init.optionalFeatures ?? [],
    required: init.requiredFeatures ?? [],
  };
}

describe('buildSessionInit gaze tracking', () => {
  it('requests gaze-tracking as optional', () => {
    const { optional, required } = features(
      buildSessionInit({ features: { gazeTracking: true } }),
    );

    expect(optional).toContain('gaze-tracking');
    expect(required).not.toContain('gaze-tracking');
  });

  it('also offers the eye-tracking alias so either runtime name works', () => {
    const { optional } = features(
      buildSessionInit({ features: { gazeTracking: true } }),
    );

    expect(optional).toContain('eye-tracking');
  });

  it('honors an explicit required flag on the named descriptor only', () => {
    const { optional, required } = features(
      buildSessionInit({ features: { gazeTracking: { required: true } } }),
    );

    expect(required).toContain('gaze-tracking');
    // The alias stays optional: requiring a descriptor the UA doesn't
    // recognize would fail the whole session request.
    expect(optional).toContain('eye-tracking');
    expect(required).not.toContain('eye-tracking');
  });

  it('treats the deprecated eyeTracking flag as an alias', () => {
    const { optional } = features(
      buildSessionInit({ features: { eyeTracking: true } }),
    );

    expect(optional).toContain('eye-tracking');
    expect(optional).toContain('gaze-tracking');
  });

  it('does not duplicate descriptors when both flags are set', () => {
    const { optional } = features(
      buildSessionInit({ features: { eyeTracking: true, gazeTracking: true } }),
    );

    expect(optional.filter((f) => f === 'gaze-tracking')).toHaveLength(1);
    expect(optional.filter((f) => f === 'eye-tracking')).toHaveLength(1);
  });

  it('honors an explicit false eye-tracking alias opt-out', () => {
    const { optional, required } = features(
      buildSessionInit({
        features: { gazeTracking: { required: true }, eyeTracking: false },
      }),
    );

    expect(required).toContain('gaze-tracking');
    expect(optional).not.toContain('eye-tracking');
  });

  it('honors an explicit false gaze-tracking alias opt-out', () => {
    const { optional, required } = features(
      buildSessionInit({
        features: { eyeTracking: { required: true }, gazeTracking: false },
      }),
    );

    expect(required).toContain('eye-tracking');
    expect(optional).not.toContain('gaze-tracking');
  });

  it('requests neither descriptor when gaze is not opted into', () => {
    const { optional, required } = features(
      buildSessionInit({ features: { handTracking: true } }),
    );

    for (const list of [optional, required]) {
      expect(list).not.toContain('gaze-tracking');
      expect(list).not.toContain('eye-tracking');
    }
  });
});
