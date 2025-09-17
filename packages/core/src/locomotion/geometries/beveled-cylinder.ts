/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BufferGeometry,
  CircleGeometry,
  LatheGeometry,
  MathUtils,
  Vector2,
} from '../../runtime/three.js';

class BeveledCylinderGeometry extends BufferGeometry {
  constructor(
    radiusTop = 1,
    radiusBottom = 1,
    height = 2,
    bevelSegments = 4,
    bevelSize = 1,
    radialSegments = 32,
    heightSegments = 1,
    openEnded = false,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ) {
    super();
    const halfHeight = height / 2;
    const profilePoints = [];

    const deltaAngle = Math.atan2(radiusBottom - radiusTop, height);

    for (let i = 0; i <= bevelSegments; i++) {
      const t = i / bevelSegments;
      const angle = -Math.PI / 2 + t * (Math.PI / 2 + deltaAngle);
      const x = radiusBottom - bevelSize + bevelSize * Math.cos(angle);
      const y = -halfHeight + bevelSize + bevelSize * Math.sin(angle);
      profilePoints.push(new Vector2(x, y));
    }

    for (let i = 1; i < heightSegments; i++) {
      const t = i / heightSegments;
      const y =
        -halfHeight +
        bevelSize +
        t * (halfHeight - bevelSize - (-halfHeight + bevelSize));
      // Linear interpolation between bottom and top radii.
      const r = MathUtils.lerp(radiusBottom, radiusTop, t);
      profilePoints.push(new Vector2(r, y));
    }

    for (let i = 0; i <= bevelSegments; i++) {
      const t = i / bevelSegments;
      const angle = deltaAngle + t * (Math.PI / 2); // from 0° to 90°
      const x = radiusTop - bevelSize + bevelSize * Math.cos(angle);
      const y = halfHeight - bevelSize + bevelSize * Math.sin(angle);
      profilePoints.push(new Vector2(x, y));
    }

    // --- Create the lathe geometry by revolving the profile ---
    const latheGeo = new LatheGeometry(
      profilePoints,
      radialSegments,
      thetaStart,
      thetaLength,
    );

    // --- If the geometry should have end caps, add them ---
    if (!openEnded) {
      // Top cap: a flat circle. The effective radius is reduced by bevelSize.
      const topCap = new CircleGeometry(
        radiusTop - bevelSize,
        radialSegments,
        thetaStart,
        thetaLength,
      );
      topCap.rotateX(-Math.PI / 2);
      topCap.translate(0, halfHeight, 0);

      // Bottom cap.
      const bottomCap = new CircleGeometry(
        radiusBottom - bevelSize,
        radialSegments,
        thetaStart,
        thetaLength,
      );
      bottomCap.rotateX(Math.PI / 2);
      bottomCap.translate(0, -halfHeight, 0);

      // Merge the lathe geometry and the caps.
      const merged = mergeGeometries([latheGeo, topCap, bottomCap]);
      this.copy(merged);
    } else {
      this.copy(latheGeo);
    }

    this.computeVertexNormals();
  }
}

export { BeveledCylinderGeometry };
