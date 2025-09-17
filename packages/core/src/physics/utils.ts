/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Vector3,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  BufferGeometry,
  Box3,
  Object3D,
  Matrix4,
  Quaternion,
} from '../runtime/index.js';
import { PhysicsShapeType } from './physicsShape';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tempVec1 = new Vector3();
const tempVec2 = new Vector3();
const tempQuat = new Quaternion();
const tempMatrix = new Matrix4();
const tempMatrix2 = new Matrix4();

const UNIT_SCALE = new Vector3(1, 1, 1);

export interface ShapeDetectionResult {
  shapeType: string;
  dimensions: [number, number, number] | null;
}

/**
 * Automatically detects the best physics shape type and calculates dimensions based on the entity's Three.js geometry
 */
export function detectShapeFromGeometry(
  object3D: Object3D,
): ShapeDetectionResult {
  const geometry =
    object3D instanceof Mesh
      ? object3D.geometry
      : generateMergedGeometry(object3D);

  // Check for specific geometry types and calculate their dimensions
  if (geometry instanceof SphereGeometry) {
    const radius = geometry.parameters.radius ?? 1;
    return {
      shapeType: PhysicsShapeType.Sphere,
      dimensions: [radius, 0, 0], // Only radius is needed for sphere
    };
  }

  if (geometry instanceof BoxGeometry) {
    const width = geometry.parameters.width ?? 1;
    const height = geometry.parameters.height ?? 1;
    const depth = geometry.parameters.depth ?? 1;
    return {
      shapeType: PhysicsShapeType.Box,
      dimensions: [width, height, depth],
    };
  }

  if (geometry instanceof PlaneGeometry) {
    const width = geometry.parameters.width ?? 1;
    const height = geometry.parameters.height ?? 1;
    const thickness = 0.01; // Thin plane
    return {
      shapeType: PhysicsShapeType.Box,
      dimensions: [width, height, thickness],
    };
  }

  if (geometry instanceof CylinderGeometry) {
    const radiusTop = geometry.parameters.radiusTop ?? 1;
    const radiusBottom = geometry.parameters.radiusBottom ?? 1;
    if (radiusTop !== radiusBottom) {
      console.warn(
        'PhysicsSystem: detected cylinder with different radiusTop and radiusBottom. Using average radius for the physics shape.',
      );
    }
    const height = geometry.parameters.height ?? 1;
    const avgRadius = (radiusTop + radiusBottom) / 2;
    return {
      shapeType: PhysicsShapeType.Cylinder,
      dimensions: [avgRadius, height, 0], // Approximate bounding dimensions
    };
  }

  // For generic BufferGeometry, fall back to the default ConvexHull shape type for better perf
  if (geometry instanceof BufferGeometry) {
    console.log(
      `PhysicsSystem: BufferGeometry detected for object ${object3D}, using ConvexHull.`,
    );
    return {
      shapeType: PhysicsShapeType.ConvexHull,
      dimensions: null,
    };
  }

  // Fallback for unknown geometry types
  console.warn(
    `PhysicsSystem: Unknown geometry type for object ${object3D}, falling back to Box`,
  );
  return {
    shapeType: PhysicsShapeType.Box,
    dimensions: calculateObject3DBounds(object3D),
  };
}

/**
 * Calculates bounding box dimensions from Object3D for fallback cases
 */
export function calculateObject3DBounds(
  object3D: Object3D,
): [number, number, number] {
  try {
    // Create a bounding box for the object
    const box = new Box3().setFromObject(object3D);

    if (!box.isEmpty()) {
      const size = new Vector3();
      box.getSize(size);

      // Convert to half-extents and ensure minimum size
      const dimensions: [number, number, number] = [
        Math.max(size.x, 0.01),
        Math.max(size.y, 0.01),
        Math.max(size.z, 0.01),
      ];

      console.log(
        `PhysicsSystem: Calculated Object3D bounds: [${dimensions.join(', ')}]`,
      );
      return dimensions;
    } else {
      console.warn(
        'PhysicsSystem: Object3D bounding box is empty, using default dimensions',
      );
    }
  } catch (error) {
    console.warn('PhysicsSystem: Failed to calculate Object3D bounds:', error);
  }

  // Final fallback if bounding box calculation fails
  return [1, 1, 1];
}

export function generateMergedGeometry(object3D: Object3D): BufferGeometry {
  object3D.updateMatrixWorld(true);

  tempMatrix.copy(object3D.matrixWorld);

  tempMatrix.decompose(tempVec1, tempQuat, tempVec2);
  tempMatrix.compose(tempVec1, tempQuat, UNIT_SCALE);

  const geometries: BufferGeometry[] = [];
  object3D.traverse((child) => {
    if ((child as Mesh).isMesh && (child as Mesh).geometry) {
      const geometry = (child as Mesh).geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      geometries.push(geometry);
    }
  });
  const mergedGeometry = mergeGeometries(geometries);
  tempMatrix2.copy(tempMatrix).invert();
  mergedGeometry.applyMatrix4(tempMatrix2);

  object3D.matrixWorld.copy(tempMatrix);

  return mergedGeometry;
}
