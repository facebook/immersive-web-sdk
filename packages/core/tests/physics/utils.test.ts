/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it, vi } from 'vitest';
import { PhysicsShapeType } from '../../src/physics/physicsShape.js';
import {
  detectShapeFromGeometry,
  generateMergedGeometry,
  sequentialIndices,
} from '../../src/physics/utils.js';
import {
  BoxGeometry,
  BufferGeometry,
  Mesh,
  Object3D,
} from '../../src/runtime/three.js';

// physics/utils.ts -> runtime barrel -> xr-input cursor-visual.ts touches
// `document` at module load, so provide a minimal canvas stub before importing.
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

describe('sequentialIndices', () => {
  it('produces 0..n-1 as a Uint32Array', () => {
    const indices = sequentialIndices(6);
    expect(indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns an empty array for zero vertices', () => {
    expect(sequentialIndices(0).length).toBe(0);
  });

  it('matches the implicit triangle order of a non-indexed geometry', () => {
    // A non-indexed geometry lists its vertices in triangle order, so the
    // synthesized index buffer must be one entry per vertex.
    const vertexCount = 9; // 3 triangles
    expect(sequentialIndices(vertexCount).length).toBe(vertexCount);
  });
});

describe('generateMergedGeometry', () => {
  it('merges child meshes and disposes the per-child clones (not the sources)', () => {
    const root = new Object3D();
    const sourceA = new BoxGeometry(1, 1, 1);
    const sourceB = new BoxGeometry(2, 2, 2);
    root.add(new Mesh(sourceA));
    root.add(new Mesh(sourceB));

    const sourceDisposeA = vi.spyOn(sourceA, 'dispose');
    const sourceDisposeB = vi.spyOn(sourceB, 'dispose');

    // Capture every clone created during the merge and watch its dispose().
    const cloneDisposeSpies: Array<ReturnType<typeof vi.spyOn>> = [];
    const realClone = BufferGeometry.prototype.clone;
    const cloneSpy = vi
      .spyOn(BufferGeometry.prototype, 'clone')
      .mockImplementation(function (this: BufferGeometry) {
        const cloned = realClone.call(this);
        cloneDisposeSpies.push(vi.spyOn(cloned, 'dispose'));
        return cloned;
      });

    let merged: BufferGeometry;
    try {
      merged = generateMergedGeometry(root);
    } finally {
      cloneSpy.mockRestore();
    }

    expect(merged).toBeInstanceOf(BufferGeometry);
    expect(merged.attributes.position).toBeDefined();
    expect(merged.attributes.position.count).toBeGreaterThan(0);

    // One clone per child mesh, and each clone is disposed after the merge.
    expect(cloneDisposeSpies).toHaveLength(2);
    for (const disposeSpy of cloneDisposeSpies) {
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    }

    // The source geometries are still owned by their meshes -> never disposed.
    expect(sourceDisposeA).not.toHaveBeenCalled();
    expect(sourceDisposeB).not.toHaveBeenCalled();
  });
});

describe('detectShapeFromGeometry', () => {
  it('disposes the merged geometry it builds for a non-Mesh object', () => {
    const root = new Object3D();
    root.add(new Mesh(new BoxGeometry(1, 1, 1)));
    root.add(new Mesh(new BoxGeometry(2, 2, 2)));

    // Count clones (disposed by generateMergedGeometry) and total BufferGeometry
    // disposals. The merged geometry detectShapeFromGeometry builds must also be
    // disposed -> total disposals === clones + 1.
    let cloneCount = 0;
    const realClone = BufferGeometry.prototype.clone;
    const cloneSpy = vi
      .spyOn(BufferGeometry.prototype, 'clone')
      .mockImplementation(function (this: BufferGeometry) {
        cloneCount++;
        return realClone.call(this);
      });
    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose');

    let result: ReturnType<typeof detectShapeFromGeometry>;
    try {
      result = detectShapeFromGeometry(root);
    } finally {
      cloneSpy.mockRestore();
    }

    // A merged geometry is a plain BufferGeometry -> ConvexHull.
    expect(result.shapeType).toBe(PhysicsShapeType.ConvexHull);
    // Regression: pre-fix the merged geometry was never disposed (=== cloneCount).
    expect(disposeSpy).toHaveBeenCalledTimes(cloneCount + 1);
    disposeSpy.mockRestore();
  });

  it('does not dispose a Mesh own geometry (it stays in use)', () => {
    const geometry = new BoxGeometry(1, 2, 3);
    const mesh = new Mesh(geometry);
    const disposeSpy = vi.spyOn(geometry, 'dispose');

    const result = detectShapeFromGeometry(mesh);

    expect(result.shapeType).toBe(PhysicsShapeType.Box);
    expect(result.dimensions).toEqual([1, 2, 3]);
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});
