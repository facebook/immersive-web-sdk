/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Intersection } from '@pmndrs/pointer-events';
import type { Object3D, Vector3 } from 'three';

/**
 * Per-frame context passed into a GazeCandidateProvider. All fields are owned
 * by the GazePointer and reused across frames; providers MUST NOT retain
 * references to them past `update()`.
 */
export interface GazeCandidateContext {
  /** Smoothed gaze origin in world space. */
  origin: Vector3;
  /** Smoothed gaze forward direction in world space (unit length). */
  direction: Vector3;
  /** Candidate Object3D roots to consider. */
  candidates: ReadonlyArray<Object3D>;
  /**
   * Resolve a pointer-events-compatible ray intersection inside one candidate
   * root. The direction is world-space and unit length. Implementations must
   * treat a `null` result as an ineligible or non-raycastable surface.
   */
  intersectCandidate: (
    candidate: Object3D,
    direction: Vector3,
  ) => Intersection | null;
}

/**
 * Result of a candidate query. The provider is responsible for computing
 * angular distance and choosing the hit point/normal/face.
 */
export interface GazeHit {
  /** The Object3D root that won this frame (typically the entity's root). */
  object: Object3D;
  /** The authoritative pointer-events intersection on the actionable leaf. */
  intersection: Intersection;
  /** Angular distance (radians) between gaze direction and direction-to-target. */
  angularDistance: number;
}

/**
 * Pluggable candidate-selection strategy for GazePointer. Implementations
 * decide how to score and choose a target each frame.
 *
 * @category Pointer
 */
export interface GazeCandidateProvider {
  /**
   * Compute the best hit for this frame.
   * @param time   Elapsed time in seconds.
   * @param dt     Frame delta in seconds.
   * @param ctx    Per-frame gaze context. Do not retain references.
   * @returns      Best hit, or `null` if no candidate qualifies.
   */
  update(time: number, dt: number, ctx: GazeCandidateContext): GazeHit | null;

  /** Called when gaze becomes invalid (session end, suppression, etc.). */
  reset(): void;
}
