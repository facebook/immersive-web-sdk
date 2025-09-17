/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Pointer, createRayPointer } from '@pmndrs/pointer-events';
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Intersection,
  Mesh,
  MeshBasicMaterial,
  Matrix3,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { lerp } from 'three/src/math/MathUtils.js';
import { XROrigin } from '../rig/xr-origin.js';

const vertexShader = `
  varying float vPosition;
  void main() {
    vPosition = (position.z + 1.0) / 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float endValue;
  uniform float opacity;
  uniform vec3 color;
  varying float vPosition;
  void main() {
    float alpha = vPosition < endValue ? smoothstep(endValue-0.05, endValue, vPosition) :
               vPosition < 0.97 ? 1.0 :
               1.0 - smoothstep(0.97, 1.0, vPosition);
    gl_FragColor = vec4(color, alpha * opacity);
  }
`;
// create cursor texture
const cursorRes = 512;
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
const cursorTexture = new CanvasTexture(canvas);

const ZAxis = new Vector3(0, 0, 1);
const offsetHelper = new Vector3();
const cursorPosition = new Vector3();
const quaternionHelper = new Quaternion();
const rayPressedColor = new Color(0x3383e6);
const rayDefaultColor = new Color(0xffffff);

export enum RayDisplayMode {
  Visible = 1,
  VisibleOnIntersection = 2,
  Invisible = 3,
}

export class RayPointer {
  static pointerCount = 0;
  public pointer: Pointer;
  public ray: Mesh<CylinderGeometry, ShaderMaterial>;
  public cursor: Mesh<CircleGeometry, MeshBasicMaterial>;
  public enabled = true;
  public rayIntersection: Intersection | undefined;
  public rayDisplayMode: RayDisplayMode = RayDisplayMode.VisibleOnIntersection;

  constructor(
    camera: PerspectiveCamera,
    private xrOrigin: XROrigin,
    handedness: 'left' | 'right',
  ) {
    this.pointer = createRayPointer(
      () => camera,
      { current: xrOrigin.raySpaces[handedness] },
      {},
      {
        // Disable contextmenu on button 2 (squeeze) to avoid spurious events
        contextMenuButton: -1,
      },
    );

    // Optimize raycaster for BVH acceleration - only get first hit for better performance
    const raycaster = (this.pointer.intersector as any).raycaster;
    if (raycaster) {
      raycaster.firstHitOnly = true;
    }
    this.ray = new Mesh(
      new CylinderGeometry(0.001, 0.001, 1, 6, 1, true)
        .translate(0, 0.5, 0)
        .rotateX(-Math.PI / 2),
      new ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          endValue: { value: 0.75 },
          color: { value: new Color().copy(rayDefaultColor) },
          opacity: { value: 1 },
        },
      }),
    );
    // Ensure the cursor renders above the ray
    this.ray.renderOrder = 0;
    xrOrigin.raySpaces[handedness].add(this.ray);
    this.cursor = new Mesh(
      new CircleGeometry(0.008),
      new MeshBasicMaterial({
        map: cursorTexture,
        transparent: true,
      }),
    );
    this.cursor.renderOrder = Infinity;
    this.cursor.userData.attached = true;
    this.cursor.userData.zOffset = 0.004 + RayPointer.pointerCount++ * 0.001;
    this.cursor.userData.focused = false;
    this.cursor.userData.focusAlpha = 0;
    xrOrigin.add(this.cursor);
  }

  update(
    connected: boolean,
    delta: number,
    _time: number,
    selectStart: boolean,
    selectEnd: boolean,
    policy?: { forceHideRay?: boolean; forceHideCursor?: boolean },
  ) {
    // CombinedPointer is responsible for moving/enabling; we only render visuals
    // CombinedPointer controls actual pointer enablement; reflect that in visuals
    const pointerEnabled = this.pointer.getEnabled();
    const active = pointerEnabled && connected && this.enabled;
    this.ray.visible = active && !policy?.forceHideRay;
    this.cursor.visible = active && !policy?.forceHideCursor;

    if (active) {
      if (pointerEnabled && selectStart) {
        this.ray.material.uniforms.color.value.copy(rayPressedColor);
        if (this.cursor) {
          this.cursor.userData.focused = true;
        }
      } else if (pointerEnabled && selectEnd) {
        this.ray.material.uniforms.color.value.copy(rayDefaultColor);
        if (this.cursor) {
          this.cursor.userData.focused = false;
        }
      }
      // Movement is handled by the owning CombinedPointer aggregator
    }
    this.updatePointerRendering(active, delta);
  }

  private updatePointerRendering(pointerActive: boolean, delta = 1) {
    let rayOpacityTarget = 0;
    if (pointerActive) {
      const captured = !!this.pointer.getPointerCapture?.();
      const intersection = this.pointer.getIntersection();
      const intersectionValid = !!(
        intersection && !intersection.object.isVoidObject
      );
      this.rayIntersection = intersectionValid ? intersection : undefined;
      switch (this.rayDisplayMode) {
        case RayDisplayMode.Visible:
          rayOpacityTarget = 1;
          break;
        case RayDisplayMode.Invisible:
          rayOpacityTarget = 0;
          break;
        default:
          rayOpacityTarget = intersectionValid ? 1 : 0;
      }
      if (intersectionValid && !captured) {
        cursorPosition.copy(intersection.pointOnFace);
        this.cursor.userData.focusAlpha = lerp(
          this.cursor.userData.focusAlpha,
          this.cursor.userData.focused ? 1 : 0,
          30 * delta,
        );
        const cursorScale =
          (Math.max(0, intersection.distance - 0.3) + 1) *
          lerp(1, 0.8, this.cursor.userData.focusAlpha);
        this.cursor.material.opacity = lerp(
          0.7,
          1,
          this.cursor.userData.focusAlpha,
        );
        this.cursor.scale.setScalar(cursorScale);
        this.ray.material.uniforms.endValue.value =
          1.05 - Math.min(0.3, intersection.distance);
        const normal = intersection.normal ?? intersection.face?.normal;
        if (normal != null) {
          // Convert local-space normal to world-space using normal matrix to handle non-uniform scales
          const normalWorld = normal.clone();
          const normalMatrix = new Matrix3().getNormalMatrix(
            intersection.object.matrixWorld,
          );
          normalWorld.applyNormalMatrix(normalMatrix).normalize();
          // Build world-space orientation from +Z to world normal
          this.cursor.quaternion.setFromUnitVectors(ZAxis, normalWorld);
          // Convert world orientation to xrOrigin local space
          quaternionHelper.copy(this.xrOrigin.quaternion).invert();
          this.cursor.quaternion.multiply(quaternionHelper);
          // Offset slightly along the oriented normal to avoid z-fighting
          offsetHelper.set(0, 0, this.cursor.userData.zOffset);
          offsetHelper.applyQuaternion(this.cursor.quaternion);
          cursorPosition.add(offsetHelper);
        } else if (intersection.pointerQuaternion) {
          // Fallback: align cursor with pointer direction when no surface normal is available
          this.cursor.quaternion.copy(intersection.pointerQuaternion);
          quaternionHelper.copy(this.xrOrigin.quaternion).invert();
          this.cursor.quaternion.multiply(quaternionHelper);
          offsetHelper.set(0, 0, this.cursor.userData.zOffset);
          offsetHelper.applyQuaternion(this.cursor.quaternion);
          cursorPosition.add(offsetHelper);
        }
        this.xrOrigin.worldToLocal(cursorPosition);
        this.cursor.position.copy(cursorPosition);
        this.cursor.updateMatrix();
      } else {
        this.cursor.visible = false;
      }
    } else {
      this.cursor.visible = false;
      this.rayIntersection = undefined;
    }
    this.ray.material.uniforms.opacity.value = lerp(
      this.ray.material.uniforms.opacity.value,
      rayOpacityTarget,
      delta * 10,
    );
  }

  get busy() {
    return !!this.rayIntersection;
  }
}
