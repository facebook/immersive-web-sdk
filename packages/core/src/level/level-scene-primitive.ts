/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  DEFAULT_SCENE_PRIMITIVE_SEGMENTS,
  type SceneGeometry,
  type SceneMaterial,
  type Vec2,
  type Vec3,
} from '@iwsdk/scene-composition';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Material,
  Mesh,
  Object3D,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from '../runtime/index.js';
import {
  createSceneMaterial,
  disposeStandaloneSceneMaterial,
} from './level-scene-material.js';

export { createSceneMaterial } from './level-scene-material.js';

type ExtendedSceneGeometry =
  | Exclude<SceneGeometry, { type: 'extrude' }>
  | (Extract<SceneGeometry, { type: 'extrude' }> & { holes?: Vec2[][] })
  | {
      type: 'roundedBox';
      size: Vec3;
      radius: number;
      segments?: number;
    }
  | {
      type: 'lathe';
      profile: Vec2[];
      segments?: number;
      phiStartDeg?: number;
      phiLengthDeg?: number;
    }
  | {
      type: 'torus';
      radius: number;
      tube: number;
      radialSegments?: number;
      tubularSegments?: number;
      arcDeg?: number;
    };

export interface SceneProceduralMeshDescriptor {
  geometry: SceneGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Build a Three.js geometry from a scene geometry recipe. */
export function createSceneGeometry(geometry: SceneGeometry): BufferGeometry {
  const descriptor = geometry as ExtendedSceneGeometry;
  switch (descriptor.type) {
    case 'box':
      return new BoxGeometry(...descriptor.size);
    case 'roundedBox':
      return new RoundedBoxGeometry(
        descriptor.size[0],
        descriptor.size[1],
        descriptor.size[2],
        descriptor.segments ?? 4,
        descriptor.radius,
      );
    case 'sphere': {
      const segments = descriptor.segments ?? DEFAULT_SCENE_PRIMITIVE_SEGMENTS;
      return new SphereGeometry(
        descriptor.radius,
        segments,
        Math.max(3, Math.floor(segments / 2)),
      );
    }
    case 'cylinder': {
      const radiusTop =
        'radius' in descriptor ? descriptor.radius : descriptor.radiusTop;
      const radiusBottom =
        'radius' in descriptor ? descriptor.radius : descriptor.radiusBottom;
      return new CylinderGeometry(
        radiusTop,
        radiusBottom,
        descriptor.height,
        descriptor.segments ?? DEFAULT_SCENE_PRIMITIVE_SEGMENTS,
      );
    }
    case 'cone':
      return new ConeGeometry(
        descriptor.radius,
        descriptor.height,
        descriptor.segments ?? DEFAULT_SCENE_PRIMITIVE_SEGMENTS,
      );
    case 'plane':
      return new PlaneGeometry(...descriptor.size);
    case 'capsule':
      return new CapsuleGeometry(
        descriptor.radius,
        descriptor.length,
        descriptor.capSegments ?? 4,
        descriptor.radialSegments ?? 8,
      );
    case 'extrude': {
      const shape = createShape(descriptor.points);
      for (const hole of descriptor.holes ?? []) {
        shape.holes.push(createPath(hole));
      }
      const bevel = descriptor.bevel;
      const result = new ExtrudeGeometry(shape, {
        bevelEnabled: bevel?.enabled ?? false,
        bevelSegments: bevel?.segments ?? 1,
        bevelSize: bevel?.size ?? 0,
        bevelThickness: bevel?.thickness ?? 0,
        depth: descriptor.depth,
      });
      result.translate(0, 0, -descriptor.depth / 2);
      return result;
    }
    case 'tube': {
      const curve = new CatmullRomCurve3(
        descriptor.points.map((point) => new Vector3(...point)),
        descriptor.closed ?? false,
      );
      return new TubeGeometry(
        curve,
        descriptor.tubularSegments ?? 64,
        descriptor.radius,
        descriptor.radialSegments ?? 8,
        descriptor.closed ?? false,
      );
    }
    case 'lathe': {
      const geometry = new LatheGeometry(
        descriptor.profile.map((point) => new Vector2(...point)),
        descriptor.segments ?? DEFAULT_SCENE_PRIMITIVE_SEGMENTS,
        degreesToRadians(descriptor.phiStartDeg ?? 0),
        degreesToRadians(descriptor.phiLengthDeg ?? 360),
      );
      if (Math.abs((descriptor.phiLengthDeg ?? 360) - 360) < 1e-9) {
        averageLatheSeamNormals(
          geometry,
          descriptor.profile.length,
          descriptor.segments ?? DEFAULT_SCENE_PRIMITIVE_SEGMENTS,
        );
      }
      return geometry;
    }
    case 'torus':
      return new TorusGeometry(
        descriptor.radius,
        descriptor.tube,
        descriptor.radialSegments ?? 12,
        descriptor.tubularSegments ?? 48,
        degreesToRadians(descriptor.arcDeg ?? 360),
      );
    default:
      throw new Error(
        `Unsupported scene geometry type "${String(
          (descriptor as { type?: unknown }).type,
        )}"`,
      );
  }
}

/** Create a renderable Three.js mesh from a scene primitive descriptor. */
export function createScenePrimitiveObject(
  primitive: SceneProceduralMeshDescriptor,
  material: SceneMaterial | Material,
): Mesh {
  const suppliedRuntimeMaterial = material instanceof Material;
  const geometrySpec = primitive.geometry;
  const resolvedMaterial = resolveMaterialArgument(material);
  const object = new Mesh(createSceneGeometry(geometrySpec), resolvedMaterial);
  object.castShadow = primitive.castShadow ?? false;
  object.receiveShadow = primitive.receiveShadow ?? false;
  object.userData.iwsdkSceneGeometry = cloneJson(geometrySpec);
  object.userData.iwsdkScenePrimitive = cloneJson(primitive);
  object.userData.iwsdkOwnsPrimitiveGeometry = true;
  object.userData.iwsdkOwnsPrimitiveMaterial = !suppliedRuntimeMaterial;
  object.userData.iwsdkOwnsPrimitiveResources = true;
  return object;
}

/** Dispose only the resources owned directly by a scene primitive mesh. */
export function disposeScenePrimitiveObject(object: Object3D): void {
  if (object.userData.iwsdkOwnsPrimitiveResources !== true) {
    return;
  }
  const primitiveMesh = object as Mesh;
  primitiveMesh.geometry?.dispose();
  const materials: Material[] = Array.isArray(primitiveMesh.material)
    ? primitiveMesh.material
    : primitiveMesh.material
      ? [primitiveMesh.material]
      : [];
  if (object.userData.iwsdkOwnsPrimitiveMaterial === true) {
    for (const material of new Set(materials)) {
      disposeStandaloneSceneMaterial(material);
    }
  }
  delete object.userData.iwsdkOwnsPrimitiveGeometry;
  delete object.userData.iwsdkOwnsPrimitiveMaterial;
  delete object.userData.iwsdkOwnsPrimitiveResources;
}

function createShape(points: Vec2[]): Shape {
  const shape = new Shape();
  appendPathPoints(shape, points);
  return shape;
}

function createPath(points: Vec2[]): Path {
  const path = new Path();
  appendPathPoints(path, points);
  return path;
}

function appendPathPoints(path: Path, points: Vec2[]): void {
  const first = points[0];
  if (first == null) {
    return;
  }
  path.moveTo(first[0], first[1]);
  for (let index = 1; index < points.length; index += 1) {
    path.lineTo(points[index][0], points[index][1]);
  }
  path.closePath();
}

function resolveMaterialArgument(
  material: SceneMaterial | Material | undefined,
): Material {
  if (material == null) {
    throw new Error('A scene primitive requires a resolved material resource');
  }
  return material instanceof Material
    ? material
    : createSceneMaterial(material);
}

function averageLatheSeamNormals(
  geometry: LatheGeometry,
  profilePointCount: number,
  radialSegments: number,
): void {
  const normal = geometry.getAttribute('normal');
  if (normal == null) {
    return;
  }
  for (let point = 0; point < profilePointCount; point += 1) {
    const first = point;
    const last = radialSegments * profilePointCount + point;
    const averaged = new Vector3(
      normal.getX(first) + normal.getX(last),
      normal.getY(first) + normal.getY(last),
      normal.getZ(first) + normal.getZ(last),
    ).normalize();
    normal.setXYZ(first, averaged.x, averaged.y, averaged.z);
    normal.setXYZ(last, averaged.x, averaged.y, averaged.z);
  }
  normal.needsUpdate = true;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
