/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Locomotor } from '@iwsdk/locomotor';
import { InputComponent } from '@iwsdk/xr-input';
import { lerp } from 'three/src/math/MathUtils.js';
import { Types, createSystem } from '../ecs/index.js';
import {
  BackSide,
  Color,
  CylinderGeometry,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from '../runtime/index.js';

const vertexShader = `
	varying vec2 vUv;

	void main() {
		vUv = uv;
		vec4 modelPosition = modelMatrix * vec4(position, 1.0);
		vec4 viewPosition = viewMatrix * modelPosition;
		vec4 projectedPosition = projectionMatrix * viewPosition;

		gl_Position = projectedPosition;
	}
`;

const fragmentShader = `
	uniform vec3 uColor;
	uniform float uAlpha;
	varying vec2 vUv;

	void main() {
		gl_FragColor = vec4(uColor, uAlpha * vUv.y);
	}
`;

const createVignette = (radius: number, colorRep: number = 0x000000) => {
  const vignette = new Mesh(
    new CylinderGeometry(radius, radius * 0.5, 0.3, 16, 1, true),
    new ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uColor: { value: new Color(colorRep) },
        uAlpha: { value: 0 },
      },
      depthTest: false,
      side: BackSide,
      transparent: true,
    }),
  );
  vignette.frustumCulled = false;
  vignette.renderOrder = 999;
  vignette.rotateX(Math.PI / 2);
  vignette.position.z = -0.15;
  return vignette;
};

/**
 * Analog stick sliding locomotion with optional comfort vignette and jump.
 *
 * @remarks
 * - Reads left controller thumbstick for planar movement relative to head yaw.
 * - Applies a dynamic peripheral vignette based on input magnitude scaled by
 *   `comfortAssist` to reduce motion sickness.
 * - Triggers jump when `jumpButton` is pressed.
 *
 * @category Locomotion
 */
export class SlideSystem extends createSystem(
  {},
  {
    /** Locomotor engine shared across locomotion systems. */
    locomotor: { type: Types.Object, default: undefined },
    /** Maximum linear speed in meters/second. */
    maxSpeed: { type: Types.Float32, default: 5 },
    /** Comfort vignette strength [0..1]; 0 disables vignetting. */
    comfortAssist: { type: Types.Float32, default: 0.5 },
    /** Button used to trigger jump. */
    jumpButton: { type: Types.String, default: InputComponent.A_Button },
  },
) {
  private movementVector = new Vector3();
  private movementDirection = new Quaternion();
  private input2D = new Vector2();
  private isMoving = false;
  private vignette = createVignette(0.3);
  private vignetteAlphaTarget = 0;
  private locomotor!: Locomotor;

  init() {
    this.locomotor = this.config.locomotor.value as Locomotor;
    this.player.head.add(this.vignette);
  }

  destroy(): void {
    this.vignette.removeFromParent();
  }

  update(delta: number): void {
    this.vignetteAlphaTarget = 0;

    // Handle jump input
    if (
      this.input.gamepads.right?.getButtonDown(
        this.config.jumpButton.value as InputComponent,
      )
    ) {
      this.locomotor.jump();
    }

    if (this.input.isPrimary('controller', 'left')) {
      this.input2D.copy(
        this.input.gamepads.left?.getAxesValues(InputComponent.Thumbstick) || {
          x: 0,
          y: 0,
        },
      );
      this.movementVector.set(this.input2D.x, 0, this.input2D.y);
      const inputValue = this.input2D.length();
      if (inputValue > 0) {
        this.player.head.getWorldQuaternion(this.movementDirection);
        this.movementVector.applyQuaternion(this.movementDirection);
        this.movementVector.y = 0;
        this.movementVector
          .normalize()
          .multiplyScalar(inputValue * (this.config.maxSpeed.value as number));
        this.locomotor.slide(this.movementVector);
        this.vignetteAlphaTarget =
          inputValue * (this.config.comfortAssist.value as number);
      } else {
        if (this.isMoving) {
          // Stop movement by sending zero vector
          this.movementVector.set(0, 0, 0);
          this.locomotor.slide(this.movementVector);
        }
      }

      this.isMoving = inputValue > 0;
      this.vignette.material.uniforms.uAlpha.value = lerp(
        this.vignette.material.uniforms.uAlpha.value,
        this.vignetteAlphaTarget,
        delta * 10,
      );
    }
  }
}
