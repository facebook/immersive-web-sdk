/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Quaternion, Vector3 } from 'three';

/**
 * Single-scalar OneEuro filter (Casiez et al. 2012). Adaptive smoothing: the
 * cutoff frequency grows with the magnitude of the input's velocity, so slow
 * motion is heavily smoothed (low jitter) while fast motion stays responsive.
 *
 * Reused for each independent scalar (position xyz + quaternion xyzw).
 */
class OneEuroScalar {
  private hasPrev = false;
  private prevX = 0;
  private prevFilteredX = 0;
  private prevFilteredDx = 0;

  filter(
    x: number,
    dt: number,
    minCutoff: number,
    beta: number,
    dCutoff: number,
  ): number {
    if (!this.hasPrev || dt <= 0) {
      this.hasPrev = true;
      this.prevX = x;
      this.prevFilteredX = x;
      this.prevFilteredDx = 0;
      return x;
    }

    const dx = (x - this.prevX) / dt;
    const aDx = lowpassAlpha(dCutoff, dt);
    const filteredDx = aDx * dx + (1 - aDx) * this.prevFilteredDx;

    const cutoff = minCutoff + beta * Math.abs(filteredDx);
    const aX = lowpassAlpha(cutoff, dt);
    const filteredX = aX * x + (1 - aX) * this.prevFilteredX;

    this.prevX = x;
    this.prevFilteredX = filteredX;
    this.prevFilteredDx = filteredDx;
    return filteredX;
  }

  reset(): void {
    this.hasPrev = false;
    this.prevX = 0;
    this.prevFilteredX = 0;
    this.prevFilteredDx = 0;
  }
}

function lowpassAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export interface FilteredEyeGazeOptions {
  /** Min cutoff frequency in Hz. Lower = smoother at low speeds. */
  minCutoff?: number;
  /** Speed-coefficient. Higher = more responsive when moving fast. */
  beta?: number;
  /** Derivative filter cutoff in Hz. */
  dCutoff?: number;
}

/**
 * Adaptive pose smoother for the gaze input source. Position xyz and
 * quaternion xyzw are filtered component-wise; the quaternion is
 * re-normalized after smoothing.
 *
 * Zero per-frame allocations: writes into reusable scratch vectors and the
 * caller's output targets.
 *
 * @category Pointer
 */
export class FilteredEyeGaze {
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;

  private px = new OneEuroScalar();
  private py = new OneEuroScalar();
  private pz = new OneEuroScalar();
  private qx = new OneEuroScalar();
  private qy = new OneEuroScalar();
  private qz = new OneEuroScalar();
  private qw = new OneEuroScalar();
  private readonly alignedQuaternion = new Quaternion();
  private readonly previousQuaternion = new Quaternion();
  private hasPreviousQuaternion = false;

  constructor(opts: FilteredEyeGazeOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.5;
    this.beta = opts.beta ?? 0.05;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  /**
   * Apply the filter to `inPos`/`inQuat`, writing results into `outPos`/`outQuat`.
   * Pass dt in seconds.
   */
  filter(
    inPos: Vector3,
    inQuat: Quaternion,
    dt: number,
    outPos: Vector3,
    outQuat: Quaternion,
  ): void {
    const mc = this.minCutoff;
    const b = this.beta;
    const dc = this.dCutoff;

    // q and -q encode the same rotation. Align every sample to the previous
    // hemisphere before filtering components; otherwise a runtime that flips
    // representation can make the scalar filters interpolate through a zero
    // quaternion and produce a large, artificial gaze jump.
    this.alignedQuaternion.copy(inQuat).normalize();
    if (
      this.hasPreviousQuaternion &&
      this.alignedQuaternion.dot(this.previousQuaternion) < 0
    ) {
      this.alignedQuaternion.set(
        -this.alignedQuaternion.x,
        -this.alignedQuaternion.y,
        -this.alignedQuaternion.z,
        -this.alignedQuaternion.w,
      );
    }
    this.previousQuaternion.copy(this.alignedQuaternion);
    this.hasPreviousQuaternion = true;
    outPos.set(
      this.px.filter(inPos.x, dt, mc, b, dc),
      this.py.filter(inPos.y, dt, mc, b, dc),
      this.pz.filter(inPos.z, dt, mc, b, dc),
    );
    outQuat.set(
      this.qx.filter(this.alignedQuaternion.x, dt, mc, b, dc),
      this.qy.filter(this.alignedQuaternion.y, dt, mc, b, dc),
      this.qz.filter(this.alignedQuaternion.z, dt, mc, b, dc),
      this.qw.filter(this.alignedQuaternion.w, dt, mc, b, dc),
    );
    outQuat.normalize();
  }

  reset(): void {
    this.px.reset();
    this.py.reset();
    this.pz.reset();
    this.qx.reset();
    this.qy.reset();
    this.qz.reset();
    this.qw.reset();
    this.hasPreviousQuaternion = false;
    this.alignedQuaternion.identity();
    this.previousQuaternion.identity();
  }
}
