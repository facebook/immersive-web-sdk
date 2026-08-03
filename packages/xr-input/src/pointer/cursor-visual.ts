/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Intersection } from '@pmndrs/pointer-events';
import {
  CanvasTexture,
  CircleGeometry,
  MathUtils,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { XROrigin } from '../rig/xr-origin.js';

const { lerp } = MathUtils;

const cursorRes = 512;
let cursorTexture: CanvasTexture | undefined;

function getCursorTexture(): CanvasTexture {
  if (cursorTexture) {
    return cursorTexture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cursorRes;
  canvas.height = cursorRes;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(cursorRes / 2, cursorRes / 2, (cursorRes / 16) * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'gray';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cursorRes / 2, cursorRes / 2, (cursorRes / 16) * 7, 0, Math.PI * 2);
  ctx.stroke();
  cursorTexture = new CanvasTexture(canvas);
  return cursorTexture;
}

const ZAxis = new Vector3(0, 0, 1);
const offsetHelper = new Vector3();
const cursorPosition = new Vector3();
const quaternionHelper = new Quaternion();
const scratchNormal = new Vector3();
const scratchNormalMatrix = new Matrix3();

let cursorCount = 0;

/**
 * Shared cursor visual that can be updated from any pointer's intersection.
 * Renders as a circle mesh positioned at the intersection point, oriented to the surface normal.
 *
 * @category Pointer
 */
export class CursorVisual {
  private cursor: Mesh<CircleGeometry, MeshBasicMaterial>;
  private zOffset: number;
  private focusAlpha = 0;

  constructor(
    private xrOrigin: XROrigin,
    pointerIndex: number,
  ) {
    this.cursor = new Mesh(
      new CircleGeometry(0.008),
      new MeshBasicMaterial({
        map: getCursorTexture(),
        transparent: true,
      }),
    );
    this.cursor.renderOrder = Infinity;
    this.cursor.userData.attached = true;
    this.cursor.visible = false;
    this.zOffset = 0.004 + (pointerIndex + cursorCount++) * 0.001;
    xrOrigin.add(this.cursor);
  }

  /**
   * Update cursor position and orientation from an intersection.
   */
  updateFromIntersection(
    intersection: Intersection,
    delta: number,
    focused: boolean,
  ): void {
    cursorPosition.copy(intersection.pointOnFace);

    this.focusAlpha = lerp(this.focusAlpha, focused ? 1 : 0, 30 * delta);

    const cursorScale =
      (Math.max(0, intersection.distance - 0.3) + 1) *
      lerp(1, 0.8, this.focusAlpha);

    this.cursor.material.opacity = lerp(0.7, 1, this.focusAlpha);
    this.cursor.scale.setScalar(cursorScale);

    const normal = intersection.normal ?? intersection.face?.normal;
    if (normal != null) {
      // Convert local-space normal to world-space using normal matrix to handle non-uniform scales
      scratchNormal.copy(normal);
      scratchNormalMatrix.getNormalMatrix(intersection.object.matrixWorld);
      scratchNormal.applyNormalMatrix(scratchNormalMatrix).normalize();
      // Build world-space orientation from +Z to world normal
      this.cursor.quaternion.setFromUnitVectors(ZAxis, scratchNormal);
      // Convert world orientation to xrOrigin local space
      quaternionHelper.copy(this.xrOrigin.quaternion).invert();
      this.cursor.quaternion.multiply(quaternionHelper);
      // Offset slightly along the oriented normal to avoid z-fighting
      offsetHelper.set(0, 0, this.zOffset);
      offsetHelper.applyQuaternion(this.cursor.quaternion);
      cursorPosition.add(offsetHelper);
    } else if (intersection.pointerQuaternion) {
      // Fallback: align cursor with pointer direction when no surface normal is available
      this.cursor.quaternion.copy(intersection.pointerQuaternion);
      quaternionHelper.copy(this.xrOrigin.quaternion).invert();
      this.cursor.quaternion.multiply(quaternionHelper);
      offsetHelper.set(0, 0, this.zOffset);
      offsetHelper.applyQuaternion(this.cursor.quaternion);
      cursorPosition.add(offsetHelper);
    }

    this.xrOrigin.worldToLocal(cursorPosition);
    this.cursor.position.copy(cursorPosition);
    this.cursor.updateMatrix();
  }

  /**
   * Set cursor visibility.
   */
  setVisible(visible: boolean): void {
    this.cursor.visible = visible;
  }

  /**
   * Dispose of cursor resources.
   */
  dispose(): void {
    this.cursor.geometry.dispose();
    this.cursor.material.dispose();
    this.cursor.removeFromParent();
  }
}
