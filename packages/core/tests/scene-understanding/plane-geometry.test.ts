/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
// `document` at module load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
});

import { SceneUnderstandingSystem } from '../../src/scene-understanding/scene-understanding-system.js';
import { XRMesh } from '../../src/scene-understanding/mesh.js';
import { XRPlane } from '../../src/scene-understanding/plane.js';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from '../../src/runtime/three.js';

const IDENTITY = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function createSystem(createTransformEntity = vi.fn()) {
  const xr = {
    getFrame: () => ({
      getPose: () => ({ transform: { matrix: IDENTITY } }),
    }),
  };
  const scene = new Scene();
  const world = {
    camera: new PerspectiveCamera(),
    createTransformEntity,
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: { xr },
    scene,
    session: undefined,
    visibilityState: { value: 'visible' },
  };
  const system = new SceneUnderstandingSystem(world as any, {} as any, 0);
  return { system, scene };
}

describe('SceneUnderstandingSystem.disposeEntityGeometry', () => {
  it('disposes the geometry but not the shared material', () => {
    const { system } = createSystem();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    (system as any).disposeEntityGeometry({ object3D: mesh });

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('is a no-op for entities without a Mesh object3D', () => {
    const { system } = createSystem();
    expect(() =>
      (system as any).disposeEntityGeometry({ object3D: new Object3D() }),
    ).not.toThrow();
    expect(() =>
      (system as any).disposeEntityGeometry({ object3D: undefined }),
    ).not.toThrow();
  });
});

describe('SceneUnderstandingSystem.updatePlanes geometry allocation', () => {
  it('builds plane geometry only for new planes, not every frame', () => {
    let polygonAccessCount = 0;
    const plane = {
      planeSpace: {},
      get polygon() {
        polygonAccessCount++;
        return [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
          { x: 1, z: 1 },
          { x: 0, z: 1 },
        ];
      },
    } as unknown as XRPlane;

    const createTransformEntity = vi.fn(() => ({ addComponent: vi.fn() }));
    const { system } = createSystem(createTransformEntity);
    (system as any).queries = { planeEntities: { entities: [] as any[] } };

    const planes = new Set([plane]) as unknown as XRPlaneSet;

    // Frame 1: plane is new -> geometry built (polygon read once), entity made.
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);
    expect(polygonAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);

    // Now the plane is tracked by an existing entity (as the planeEntities
    // query would report after creation).
    const trackedEntity = {
      object3D: new Object3D(),
      getValue: (component: unknown, key: string) =>
        component === XRPlane && key === '_plane' ? plane : undefined,
    };
    (system as any).queries.planeEntities.entities = [trackedEntity];

    // Frame 2: plane already tracked -> no geometry rebuild (polygon untouched),
    // no new entity. Pre-fix the polygon loop / BoxGeometry ran every frame.
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);
    expect(polygonAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
  });
});

describe('SceneUnderstandingSystem.updateMeshes geometry allocation', () => {
  it('builds mesh geometry only for new meshes, not every frame', () => {
    let verticesAccessCount = 0;
    const mockVertices = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const mesh = {
      meshSpace: {},
      indices: new Uint32Array([0, 1, 2]),
      // 'global mesh' skips the bounds computation, so vertices is read exactly
      // once (to build the BufferGeometry) when the mesh is new.
      semanticLabel: 'global mesh',
      get vertices() {
        verticesAccessCount++;
        return mockVertices;
      },
    } as unknown as XRMesh;

    const createTransformEntity = vi.fn(() => ({ addComponent: vi.fn() }));
    const { system } = createSystem(createTransformEntity);
    (system as any).queries = { meshEntities: { entities: [] as any[] } };

    const meshes = new Set([mesh]) as unknown as XRMeshSet;

    // Frame 1: mesh is new -> geometry built (vertices read once), entity made.
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);
    expect(verticesAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);

    // Now the mesh is tracked by an existing entity.
    const trackedEntity = {
      object3D: new Object3D(),
      getValue: (component: unknown, key: string) =>
        component === XRMesh && key === '_mesh' ? mesh : undefined,
    };
    (system as any).queries.meshEntities.entities = [trackedEntity];

    // Frame 2: mesh already tracked -> no geometry rebuild (vertices untouched),
    // no new entity. Pre-fix BufferGeometry was rebuilt every frame.
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);
    expect(verticesAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
  });
});
