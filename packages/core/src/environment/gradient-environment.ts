/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BackSide,
  Color,
  FrontSide,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from '../runtime/index.js';

/**
 * Gradient shader uniforms and code used for background domes and environments.
 * @category Environment & Lighting
 */
export const GRADIENT_SHADER = {
  vertexShader: /* glsl */ `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 skyColor;
    uniform vec3 equatorColor;
    uniform vec3 groundColor;
    varying vec3 vWorldPosition;
    
    void main() {
      float h = normalize(vWorldPosition).y;
      vec3 color;
      
      if (h > 0.0) {
        // Sky to equator interpolation
        color = mix(equatorColor, skyColor, h);
      } else {
        // Equator to ground interpolation
        color = mix(equatorColor, groundColor, -h);
      }
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/**
 * Create a gradient material with Unity‑style sky/equator/ground colors.
 * @param skyHex Sky color as hex.
 * @param equatorHex Equator color as hex.
 * @param groundHex Ground color as hex.
 * @param intensity Intensity multiplier applied to all colors.
 * @param side Material side (BackSide for background dome; FrontSide for env scene).
 * @category Environment & Lighting
 */
export function createGradientMaterial(
  skyHex: number,
  equatorHex: number,
  groundHex: number,
  intensity: number,
  side: typeof BackSide | typeof FrontSide = FrontSide,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      skyColor: { value: new Color(skyHex).multiplyScalar(intensity) },
      equatorColor: { value: new Color(equatorHex).multiplyScalar(intensity) },
      groundColor: { value: new Color(groundHex).multiplyScalar(intensity) },
    },
    vertexShader: GRADIENT_SHADER.vertexShader,
    fragmentShader: GRADIENT_SHADER.fragmentShader,
    side,
    depthWrite: side === BackSide ? false : true,
    depthTest: side === BackSide ? false : true,
  });
}

/**
 * A Scene containing a gradient sphere for PMREM processing.
 *
 * @remarks
 * Uses the same shader as the background dome to ensure coherent lighting.
 * @category Environment & Lighting
 */
export class GradientEnvironment extends Scene {
  constructor(
    skyHex: number = 0x87ceeb,
    equatorHex: number = 0xffa500,
    groundHex: number = 0x228b22,
    intensity: number = 1.0,
  ) {
    super();

    // Create gradient sphere using shared gradient material
    const geometry = new SphereGeometry(100, 32, 15);
    const material = createGradientMaterial(
      skyHex,
      equatorHex,
      groundHex,
      intensity,
      BackSide,
    );

    const gradientSphere = new Mesh(geometry, material);
    this.add(gradientSphere);
  }

  dispose(): void {
    const resources = new Set<any>();

    this.traverse((object: any) => {
      if (object.isMesh) {
        resources.add(object.geometry);
        resources.add(object.material);
      }
    });

    for (const resource of resources) {
      resource.dispose();
    }
  }
}
