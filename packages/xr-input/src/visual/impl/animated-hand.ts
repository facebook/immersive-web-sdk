/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BackSide,
  BufferAttribute,
  Color,
  FrontSide,
  ShaderMaterial,
  SkinnedMesh,
  Vector2,
  Vector3,
} from 'three';
import { BaseHandVisual } from './base-impl.js';

export const stencilMaterial = new ShaderMaterial({
  uniforms: {
    outlineThickness: { value: 0.0012 },
  },
  vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        uniform float outlineThickness;

        void main() {
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          #include <defaultnormal_vertex>
          
          vec3 transformed = position - normal * outlineThickness;
          #include <skinning_vertex>
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
  fragmentShader: `
        void main() {
          gl_FragColor = vec4(0,0,0,0);
        }
      `,
  transparent: true,
  depthWrite: true,
  depthTest: true,
  alphaTest: 0.05,
  side: FrontSide,
});

export const outlineMaterial = new ShaderMaterial({
  uniforms: {
    outlineColor: {
      value: new Color(0xffffff),
    },
    opacityThresholds: {
      value: new Vector2(0.03, 0.08),
    },
  },
  vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>

        attribute float wristDist;
        varying float vWristDist;
        
        void main() {
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          #include <defaultnormal_vertex>
        
          vec3 transformed = vec3(position);
          #include <skinning_vertex>
        
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vWristDist = wristDist;
        }
      `,
  fragmentShader: `
        uniform vec3 outlineColor;
        uniform vec2 opacityThresholds;
        varying float vWristDist;
        
        void main() {
          float alpha = smoothstep(opacityThresholds.x, opacityThresholds.y, vWristDist);
          alpha = clamp(alpha, 0.0, 1.0);
        
          gl_FragColor = vec4(outlineColor, alpha);
        }
      `,
  side: BackSide,
  transparent: true,
  depthWrite: false,
  depthTest: true,
});

export class AnimatedHand extends BaseHandVisual {
  static assetKeyPrefix = 'hand-';
  static assetProfileId = 'generic-hand';

  init() {
    const skinnedMesh = this.model.getObjectByProperty(
      'type',
      'SkinnedMesh',
    )! as SkinnedMesh;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.parent!.scale.multiplyScalar(1.05);

    const wrist = this.model.getObjectByName('wrist')!;
    const geometry = skinnedMesh.geometry;

    // Compute the wrist's position in the skinnedMesh’s local space.
    const wristWorldPos = wrist.getWorldPosition(new Vector3());
    const wristLocal = skinnedMesh.worldToLocal(wristWorldPos.clone());

    // Access the vertex positions.
    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;
    const distances = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      // Compute distance from the vertex (in bind space) to the wristLocal position.
      distances[i] = Math.sqrt(
        (x - wristLocal.x) * (x - wristLocal.x) +
          (y - wristLocal.y) * (y - wristLocal.y) +
          (z - wristLocal.z) * (z - wristLocal.z),
      );
    }

    // Add the custom attribute to the geometry.
    geometry.setAttribute('wristDist', new BufferAttribute(distances, 1));
    skinnedMesh.material = stencilMaterial;
    const skinnedOutline = skinnedMesh.clone();
    skinnedOutline.material = outlineMaterial;
    skinnedMesh.parent?.add(skinnedOutline);
    skinnedOutline.renderOrder = 999;
  }
}
