/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GazeConecaster } from '@iwsdk/xr-input';
import { createSystem, Types } from '../ecs/index.js';

/**
 * GazeSystem — wires the global {@link GazePointer} to ECS interactables.
 *
 * @remarks
 * - Owns configuration and diagnostics only. The pointer itself lives on
 *   {@link XRInputManager} (as `input.xr.gazePointer`) so `GrabSystem` can
 *   identify the selecting hand; registering this system is what flips
 *   `input.xr.gazeEnabled` and makes gaze cost anything at all.
 * - Candidates come from the same ray-target snapshot used by hand rays.
 * - The pointer samples the WebXR gaze target ray itself each frame;
 *   `logDiagnostics` explains missing sources and invalid poses.
 * - Selection is committed by either hand's pinch, with per-hand mutual
 *   exclusion (the hand that started the pinch owns it until release).
 * - Hover and selection flow through ordinary ray pointer events, so
 *   {@link InputSystem} owns the shared `Hovered` / `Pressed` state.
 * - Hand/controller far rays are disabled while gaze is available. Gaze is
 *   optionally suppressed when a near touch/grab pointer is active, so direct
 *   manipulation wins without an incidental far-ray hit stealing focus.
 *
 * @category Input
 */
export class GazeSystem extends createSystem(
  {},
  {
    /**
     * If true, gaze is suppressed whenever a near touch/grab pointer is in
     * HOVER or SELECT. Set false to allow gaze to remain active concurrently.
     * @default true
     */
    suppressWhenDirectPointerActive: { type: Types.Boolean, default: true },
    /**
     * 1€ filter min cutoff (lower = smoother, higher = more responsive).
     * @default 1.5
     */
    filterMinCutoff: { type: Types.Float32, default: 1.5 },
    /**
     * 1€ filter beta (higher = less smoothing during fast saccades).
     * @default 0.05
     */
    filterBeta: { type: Types.Float32, default: 0.05 },
    /**
     * Dwell window in seconds for consensus voting. `0` disables consensus.
     * @default 0.15
     */
    dwellWindowSeconds: { type: Types.Float32, default: 0.15 },
    /**
     * Half-angle of the gaze selection cone, in degrees. Widening it makes
     * small targets easier to acquire at the cost of more ambiguity between
     * neighbours.
     * @default 5
     */
    coneAngle: { type: Types.Float32, default: 5 },
    /** Maximum gaze cone/raycast distance in meters. @default 30 */
    maxRayLength: { type: Types.Float32, default: 30 },
    /**
     * On select commit, treat the pinching hand's ray space as the pointer
     * origin instead of the eyes, so a gaze-initiated drag tracks the hand.
     * @default true
     */
    pointerTransformFollowsHand: { type: Types.Boolean, default: true },
    /**
     * Emit `[iwsdk][gaze]` console diagnostics explaining why gaze is or isn't
     * tracked, and whether the runtime's gaze ray actually separates from the
     * head ray. Each message fires at most once per state change.
     * @default true
     */
    logDiagnostics: { type: Types.Boolean, default: true },
    /** Show a developer-only gaze hit reticle. @default false */
    showDebugReticle: { type: Types.Boolean, default: false },
    /** Keep gaze mode active briefly after tracking becomes invalid. @default 5 */
    trackingLossGraceSeconds: { type: Types.Float32, default: 5 },
  },
) {
  /** One-shot latch for {@link GazeSystem.warnMissingFrame}. */
  private warnedMissingFrame = false;

  init(): void {
    // Registering this system is the opt-in: until now the pointer existed but
    // never sampled a pose or cast a cone.
    this.input.xr.gazeEnabled = true;
    this.cleanupFuncs.push(() => {
      this.input.xr.gazeEnabled = false;
    });

    this.applyGazeConfig();
    // Re-push on every config change so the editor's live tweaks land without
    // rebuilding the pointer.
    for (const key of [
      'suppressWhenDirectPointerActive',
      'filterMinCutoff',
      'filterBeta',
      'dwellWindowSeconds',
      'coneAngle',
      'maxRayLength',
      'pointerTransformFollowsHand',
      'logDiagnostics',
      'showDebugReticle',
      'trackingLossGraceSeconds',
    ] as const) {
      this.cleanupFuncs.push(
        this.config[key].subscribe(() => this.applyGazeConfig()),
      );
    }
  }

  /**
   * Push system config onto the shared pointer and its candidate provider.
   *
   * Cone geometry and dwell live on the provider rather than the pointer, and
   * only the default {@link GazeConecaster} understands them — a custom
   * provider installed via `setCandidateProvider` keeps its own tuning.
   */
  private applyGazeConfig(): void {
    const pointer = this.input.xr.gazePointer;
    pointer.suppressWhenDirectPointerActive =
      this.config.suppressWhenDirectPointerActive.peek();
    pointer.pointerTransformFollowsHand =
      this.config.pointerTransformFollowsHand.peek();
    pointer.diagnosticsEnabled = this.config.logDiagnostics.peek();
    pointer.showDebugReticle = this.config.showDebugReticle.peek();
    pointer.trackingLossGraceSeconds =
      this.config.trackingLossGraceSeconds.peek();
    pointer.filter.minCutoff = this.config.filterMinCutoff.peek();
    pointer.filter.beta = this.config.filterBeta.peek();

    const provider = pointer.provider;
    if (provider instanceof GazeConecaster) {
      // The conecaster works in radians; the config is in degrees.
      provider.coneAngle = (this.config.coneAngle.peek() * Math.PI) / 180;
      provider.coneLength = this.config.maxRayLength.peek();
      provider.dwellWindowSeconds = this.config.dwellWindowSeconds.peek();
    }
  }

  update(): void {
    const session = this.xrManager.getSession();
    if (!session) {
      this.warnedMissingFrame = false;
      return;
    }
    if (!this.xrManager.getFrame() || !this.xrManager.getReferenceSpace()) {
      this.warnMissingFrame();
    }
  }

  /**
   * There's a session but no frame or reference space, so the gaze pose can't
   * be sampled at all this frame. Normally a one-frame startup blip; if it
   * persists, gaze is unavailable and the developer should know.
   */
  private warnMissingFrame(): void {
    if (this.warnedMissingFrame || !this.config.logDiagnostics.peek()) {
      return;
    }
    this.warnedMissingFrame = true;
    console.warn(
      '[iwsdk][gaze] in an XR session but the renderer has no XRFrame or ' +
        'reference space yet, so XR input cannot be sampled until this resolves.',
    );
  }
}
