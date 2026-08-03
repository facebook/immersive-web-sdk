/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Locomotor } from '@iwsdk/locomotor';
import { Types } from '../ecs/component.js';
import { createSystem } from '../ecs/system.js';
import {
  BackSide,
  Color,
  CylinderGeometry,
  MathUtils,
  Mesh,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from '../runtime/index.js';
import {
  ActionLocomotionInputProvider,
  getRequiredInputProvider,
} from './locomotion-input-provider.js';

const { lerp } = MathUtils;

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
 * - Triggers jump when the locomotion jump action is pressed.
 *
 * @category Locomotion
 */
export class SlideSystem extends createSystem(
  {},
  {
    /** Locomotor engine shared across locomotion systems. */
    locomotor: { type: Types.Object, default: undefined },
    /** Action-backed input provider shared across locomotion systems. */
    inputProvider: { type: Types.Object, default: undefined },
    /** Maximum linear speed in meters/second. */
    maxSpeed: { type: Types.Float32, default: 5 },
    /** Comfort vignette strength [0..1]; 0 disables vignetting. */
    comfortAssist: { type: Types.Float32, default: 0.5 },
    /** Whether jumping is enabled. */
    enableJumping: { type: Types.Boolean, default: true },
  },
) {
  private movementVector = new Vector3();
  private movementDirection = new Quaternion();
  private input2D = new Vector2();
  private isMoving = false;
  private vignette = createVignette(0.3);
  private vignetteAlphaTarget = 0;
  private locomotor!: Locomotor;
  private inputProvider!: ActionLocomotionInputProvider;

  init() {
    this.locomotor = this.config.locomotor.value as Locomotor;
    this.inputProvider = getRequiredInputProvider(
      'SlideSystem',
      this.config.inputProvider.value,
    );
    this.camera.add(this.vignette);
  }

  destroy(): void {
    this.vignette.removeFromParent();
  }

  update(delta: number): void {
    this.vignetteAlphaTarget = 0;

    // Handle jump input
    if (this.config.enableJumping.value && this.inputProvider.getJumpDown()) {
      this.locomotor.jump();
    }

    this.inputProvider.getMoveAxis(this.input2D);
    {
      this.movementVector.set(this.input2D.x, 0, this.input2D.y);
      const inputValue = Math.min(this.input2D.length(), 1);
      if (inputValue > 0) {
        this.inputProvider.getMovementReferenceQuaternion(
          this.movementDirection,
        );
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
