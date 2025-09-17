/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Locomotor, sampleParabolicCurve } from '@iwsdk/locomotor';
import { AxesState, InputComponent, StatefulGamepad } from '@iwsdk/xr-input';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Types, createSystem } from '../ecs/index.js';
import {
  Color,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from '../runtime/index.js';
import { LineMaterial } from './materials/line.js';

const Colors = {
  valid: new Color(0xffffff),
  invalid: new Color(0xed4337),
};

const Scales = {
  valid: new Vector3(1, 1, 1),
  invalid: new Vector3(0.5, 0.5, 0.5),
};

/**
 * Arc‑based teleportation with surface validation and hand/controller input.
 *
 * @remarks
 * - Uses locomotor ray hit tests and only allows targets with upward normals.
 * - In hand‑tracking mode, optional micro‑gestures can control activation
 *   (e.g., thumb tap to confirm).
 * - Draws a curved parabolic guide and landing marker with visual feedback.
 *
 * @category Locomotion
 */
export class TeleportSystem extends createSystem(
  {},
  {
    /** Downward acceleration for the parabolic guide (negative). */
    rayGravity: { type: Types.Float32, default: -0.4 },
    /** Locomotor engine used for hit testing and teleport execution. */
    locomotor: { type: Types.Object, default: undefined },
    /** Enable hand‑tracking micro‑gesture flow for activation/confirm. */
    microGestureControlsEnabled: { type: Types.Boolean, default: false },
  },
) {
  private rayOrigin = new Vector3();
  private rayDirection = new Vector3();
  private markers!: Vector3[];
  private targetValid = false;
  private teleportMarker!: Mesh;
  private markerMat!: MeshBasicMaterial;
  private line!: Line2;
  private teleportWasActive = false;
  private activeInput: StatefulGamepad | undefined;
  private locomotor!: Locomotor;

  init() {
    this.locomotor = this.config.locomotor.value as Locomotor;
    this.markerMat = new MeshBasicMaterial();
    this.teleportMarker = new Mesh(
      new RingGeometry(0.12, 0.15).translate(0, 0, 0.02),
      this.markerMat,
    );
    this.scene.add(this.teleportMarker);

    this.markers = [];
    for (let i = 0; i < 20; i++) {
      this.markers.push(new Vector3(0, i, 0));
    }
    const geometry = new LineGeometry().setFromPoints(this.markers);
    const mat = new LineMaterial({
      color: 0xffffff,
      linewidth: 0.01,
      worldUnits: true,
      vertexColors: true,
      alphaToCoverage: false,
      transparent: true,
    });

    this.line = new Line2(geometry, mat as any);
    this.line.frustumCulled = false;
    this.scene.add(this.line);
    this.line.visible = false;
    this.teleportMarker.visible = false;
  }

  destroy(): void {
    this.teleportMarker.removeFromParent();
    this.line.removeFromParent();
    // Note: No need to remove raycastTarget as we use locomotor's hit test target
  }

  update(): void {
    // Get hit test target from locomotor
    const hitTestTarget = this.locomotor.hitTestTarget;
    const hitTestNormal = this.locomotor.hitTestNormal;

    // Validate target: must have hit AND normal must be mostly upward-facing (> 0.7)
    this.targetValid = hitTestTarget.visible && hitTestNormal.y > 0.7;

    const gamepad = this.input.gamepads.right;
    const pointerBusy = this.input.multiPointers.right.getRayBusy();
    let teleportActive = !!gamepad && !pointerBusy;
    const cancelAction =
      !gamepad ||
      pointerBusy ||
      gamepad !== this.activeInput ||
      (this.input.isPrimary('hand', 'right') &&
        !this.config.microGestureControlsEnabled.value);
    this.activeInput = gamepad;
    if (teleportActive) {
      // if primary input exists and pointer is not busy, teleportActive is
      // decided by gamepad/hand input
      if (this.input.isPrimary('hand', 'right')) {
        // Only allow micro-gesture-based teleport when explicitly enabled
        if (this.config.microGestureControlsEnabled.value) {
          // In hand-tracking mode, keep teleport active until confirm (thumb tap)
          teleportActive = !this.input.gamepads.right?.getButtonDownByIdx(9);
        } else {
          teleportActive = false;
        }
      } else {
        teleportActive =
          this.input.gamepads.right?.getAxesState(InputComponent.Thumbstick) ===
          AxesState.Down;
      }
    }

    if (teleportActive) {
      if (!this.teleportWasActive) {
        this.line.visible = true;
        this.teleportMarker.visible = true;
      }
      this.player.raySpaces.right.getWorldPosition(this.rayOrigin);
      this.player.raySpaces.right.getWorldDirection(this.rayDirection);

      const minY = Math.max(
        this.player.position.y,
        this.teleportMarker.position.y,
      );

      sampleParabolicCurve(
        this.rayOrigin,
        this.rayDirection,
        minY,
        this.config.rayGravity.value,
        this.markers,
        1,
      );

      this.line.geometry.setFromPoints(this.markers);
      this.line.material.uniforms.startPoint.value.copy(this.markers[0]);
      this.line.material.uniforms.endPoint.value.copy(
        this.markers[this.markers.length - 1],
      );

      // Request hit test from locomotor
      this.locomotor.requestHitTest(this.rayOrigin, this.rayDirection);

      // Update teleport marker to follow hit test target
      this.teleportMarker.position.lerp(hitTestTarget.position, 0.2);
      this.teleportMarker.quaternion.slerp(hitTestTarget.quaternion, 0.2);
      this.markerMat.color.lerp(
        this.targetValid ? Colors.valid : Colors.invalid,
        0.2,
      );
      this.teleportMarker.scale.lerp(
        this.targetValid ? Scales.valid : Scales.invalid,
        0.2,
      );
    } else if (this.teleportWasActive) {
      if (!cancelAction && this.targetValid) {
        // Teleport to the hit test target position
        this.locomotor.teleport(this.teleportMarker.position);
      }
      this.line.visible = false;
      this.teleportMarker.visible = false;
    }

    this.teleportWasActive = teleportActive;
  }
}
