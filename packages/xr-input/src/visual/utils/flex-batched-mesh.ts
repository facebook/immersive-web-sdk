/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { BatchedMesh, Group, Material, Matrix4, Mesh, Object3D } from 'three';

export class FlexBatchedMesh extends Group {
  private batchedMeshes = new Map<Material, BatchedMesh>();
  private batchedIndices = new Map<Mesh, number>();

  constructor(private refMesh: Object3D) {
    super();

    const meshes: Mesh[] = [];
    refMesh.traverse((child) => {
      child.matrixAutoUpdate = false;
      const childMesh = child as Mesh;
      if (childMesh.isMesh) {
        meshes.push(childMesh);
      }
      child.userData.batchedMatrix = new Matrix4();
    });

    // Group meshes by material
    const materialGroups = new Map<Material, Mesh[]>();
    meshes.forEach((mesh) => {
      const material = mesh.material as Material;
      if (!materialGroups.has(material)) {
        materialGroups.set(material, []);
      }
      materialGroups.get(material)!.push(mesh);
    });

    // Create a BatchedMesh for each material group
    materialGroups.forEach((meshes, material) => {
      let geometryCount = 0;
      let vertexCount = 0;
      let indexCount = 0;

      meshes.forEach((mesh) => {
        vertexCount += mesh.geometry.attributes.position.count;
        indexCount += mesh.geometry.index!.count;
        geometryCount++;
      });

      const batchedMesh = new BatchedMesh(
        geometryCount,
        vertexCount,
        indexCount,
        material,
      );
      this.batchedMeshes.set(material, batchedMesh);
      this.add(batchedMesh);

      meshes.forEach((mesh) => {
        const geometryId = batchedMesh.addGeometry(mesh.geometry);
        this.batchedIndices.set(mesh, batchedMesh.addInstance(geometryId));
      });
    });
  }

  updateMatrixWorld(force: any) {
    super.updateMatrixWorld(force);

    // Calculate the batched matrices from the reference mesh
    this.refMesh.traverse((child) => {
      child.updateMatrix();
      if (child !== this.refMesh) {
        child.userData.batchedMatrix.multiplyMatrices(
          child.parent!.userData.batchedMatrix,
          child.matrix,
        );
      }
    });

    // Update each BatchedMesh with the new matrices
    this.batchedIndices.forEach((batchedIndex, mesh) => {
      const material = mesh.material as Material;
      const batchedMesh = this.batchedMeshes.get(material);
      if (batchedMesh) {
        batchedMesh.setMatrixAt(batchedIndex, mesh.userData.batchedMatrix);
      }
    });
  }
}
