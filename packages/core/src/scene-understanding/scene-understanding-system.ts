/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Entity, Types } from '../ecs/index.js';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from '../runtime/index.js';
import { XRAnchor } from './anchor.js';
import { XRMesh } from './mesh.js';
import { XRPlane } from './plane.js';

/**
 * Manages WebXR scene understanding features including plane detection, mesh detection, and anchoring.
 *
 * @remarks
 * - Automatically detects and visualizes real‑world planes and meshes in AR/VR environments.
 * - Creates entities with {@link XRPlane} components for detected planes (floors, walls, ceilings).
 * - Creates entities with {@link XRMesh} components for detected 3D geometry.
 * - Supports anchoring objects to real‑world positions using {@link XRAnchor} components.
 * - Requires WebXR session features: 'plane‑detection', 'mesh‑detection', 'anchor' when using the related features.
 * - Automatically manages entity lifecycle as real‑world geometry changes.
 * - Provides optional visual feedback with wireframe meshes for detected geometry.
 * - Objects with {@link XRAnchor} are automatically attached to a stable world‑anchored group.
 *
 * @example Basic scene understanding setup
 * ```ts
 * // WebXR session must request required features
 * World.create(document.getElementById('scene-container'), {
 *   assets,
 *   xr: {
 *     sessionMode: SessionMode.ImmersiveAR,
 *     features: { planeDetection: true, meshDetection: true, anchors: true },
 *   }
 * })
 * 
 * // Add to your world to enable scene understanding
 * world.addSystem(SceneUnderstandingSystem)
 *

 * ```
 *
 * @example Create an anchored object
 * ```ts
 * const cube = world.createTransformEntity(cubeObject)
 * cube.addComponent(XRAnchor) // Will be anchored to real-world position
 * ```
 *
 * @example React to detected planes
 * ```ts
 * // Planes are automatically created as entities with XRPlane component
 * system.query({ required: [XRPlane] }).subscribe('qualify', (entity) => {
 *   const plane = entity.getValue(XRPlane, '_plane')
 *   console.log('New plane detected:', plane.orientation)
 * })
 * ```
 *
 * @category Scene Understanding
 * @see {@link XRPlane}
 * @see {@link XRMesh}
 * @see {@link XRAnchor}
 */
export class SceneUnderstandingSystem extends createSystem(
  {
    planeEntities: { required: [XRPlane] },
    meshEntities: { required: [XRMesh] },
    anchoredEntities: { required: [XRAnchor] },
  },
  {
    showWireFrame: { type: Types.Boolean, default: false },
  },
) {
  private planeFeatureEnabled: boolean | undefined;
  private meshFeatureEnabled: boolean | undefined;
  private anchorFeatureEnabled: boolean | undefined;
  private anchorRequested: boolean = false;
  private xrAnchor: XRAnchor | undefined;
  private currentPlanes = new Map<XRPlane, Entity>();
  private currentMeshes = new Map<XRMesh, Entity>();
  private anchoredGroup: Group = new Group();

  private matrixBuffer = new Matrix4();

  init(): void {
    this.xrManager.addEventListener('sessionstart', async () => {
      this.updateEnabledFeatures(this.xrManager.getSession());

      // Temporarily disabling initiateRoomCapture API call due to the anhor wiping issue.
      // const planes = this.xrManager.getFrame()?.detectedPlanes;
      // const meshes = this.xrManager.getFrame()?.detectedMeshes;
      // if (
      // 	(!planes || planes.size === 0) &&
      // 	(!meshes || meshes.size === 0) &&
      // 	(this.planeFeatureEnabled || this.meshFeatureEnabled)
      // ) {
      // 	await this.xrManager.getSession()?.initiateRoomCapture();
      // }
    });
    this.scene.add(this.anchoredGroup);

    this.config.showWireFrame.subscribe((value) => {
      this.queries.planeEntities.entities.forEach((planeEntity) => {
        const planeObject = planeEntity.object3D;
        if (planeObject instanceof Mesh) {
          planeObject.material.visible = value;
        }
      });

      this.queries.meshEntities.entities.forEach((meshEntity) => {
        const meshObject = meshEntity.object3D;
        if (meshObject instanceof Mesh) {
          meshObject.material.visible = value;
        }
      });
    });
  }

  update(_delta: number, _time: number): void {
    const frame = this.xrFrame;
    const planes = frame?.detectedPlanes;
    const meshes = frame?.detectedMeshes;
    const referenceSpace = this.xrManager.getReferenceSpace();

    if (this.planeFeatureEnabled) {
      this.updatePlanes(planes, referenceSpace);
    }

    if (this.meshFeatureEnabled) {
      this.updateMeshes(meshes, referenceSpace);
    }

    if (
      this.anchorFeatureEnabled &&
      this.xrAnchor === undefined &&
      !this.anchorRequested
    ) {
      this.createAnchor(referenceSpace);
    }

    if (this.xrAnchor && referenceSpace) {
      this.updateAnchoredObject();
      const pose = this.xrManager
        .getFrame()
        ?.getPose(this.xrAnchor.anchorSpace, referenceSpace);
      if (pose) {
        new Matrix4()
          .fromArray(pose.transform.matrix)
          .decompose(
            this.anchoredGroup.position,
            this.anchoredGroup.quaternion,
            new Vector3(),
          );
      }
    }
  }

  private updatePlanes(
    planes: XRPlaneSet | undefined,
    referenceSpace: XRReferenceSpace | null,
  ) {
    this.currentPlanes.clear();
    this.queries.planeEntities.entities.forEach((planeEntity) => {
      if (planes?.has(planeEntity.getValue(XRPlane, '_plane') as XRPlane)) {
        this.currentPlanes.set(
          planeEntity.getValue(XRPlane, '_plane') as XRPlane,
          planeEntity,
        );
      } else {
        planeEntity.destroy();
      }
    });

    if (planes) {
      planes.forEach((plane) => {
        if (referenceSpace != null) {
          const pose = this.xrManager
            .getFrame()
            .getPose(plane.planeSpace, referenceSpace);
          if (!pose) {
            return;
          }
          this.matrixBuffer.fromArray(pose.transform.matrix);

          const polygon = plane.polygon;

          let minX = Number.MAX_SAFE_INTEGER;
          let maxX = Number.MIN_SAFE_INTEGER;
          let minZ = Number.MAX_SAFE_INTEGER;
          let maxZ = Number.MIN_SAFE_INTEGER;

          for (const point of polygon) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
          }

          const width = maxX - minX;
          const height = maxZ - minZ;

          const geometry = new BoxGeometry(width, 0.01, height);
          const material = new MeshBasicMaterial({
            color: 0xffffff * Math.random(),
            wireframe: true,
            visible: this.config.showWireFrame.value,
          });

          if (this.currentPlanes.has(plane) === false) {
            const mesh = new Mesh(geometry, material);
            mesh.position.setFromMatrixPosition(this.matrixBuffer);
            mesh.quaternion.setFromRotationMatrix(this.matrixBuffer);
            const planeEntity = this.world.createTransformEntity(mesh);
            planeEntity.addComponent(XRPlane, {
              _plane: plane,
            });
          } else {
            const planeObject = this.currentPlanes.get(plane)?.object3D;
            planeObject?.position.setFromMatrixPosition(this.matrixBuffer);
            planeObject?.quaternion.setFromRotationMatrix(this.matrixBuffer);
          }
        }
      });
    }
  }

  private updateMeshes(
    meshes: XRMeshSet | undefined,
    referenceSpace: XRReferenceSpace | null,
  ) {
    this.currentMeshes.clear();
    this.queries.meshEntities.entities.forEach((meshEntity) => {
      if (meshes?.has(meshEntity.getValue(XRMesh, '_mesh') as XRMesh)) {
        this.currentMeshes.set(
          meshEntity.getValue(XRMesh, '_mesh') as XRMesh,
          meshEntity,
        );
      } else {
        meshEntity.destroy();
      }
    });

    if (meshes) {
      meshes.forEach((mesh) => {
        if (referenceSpace != null) {
          const pose = this.xrManager
            .getFrame()
            .getPose(mesh.meshSpace, referenceSpace);
          if (!pose) {
            return;
          }
          this.matrixBuffer.fromArray(pose.transform.matrix);

          const geometry = new BufferGeometry();
          geometry.setAttribute(
            'position',
            new BufferAttribute(mesh.vertices, 3),
          );
          geometry.setIndex(new BufferAttribute(mesh.indices, 1));
          const material = new MeshBasicMaterial({
            color: 0xffffff * Math.random(),
            wireframe: true,
            visible: this.config.showWireFrame.value,
          });

          if (this.currentMeshes.has(mesh) === false) {
            const threeMesh = new Mesh(geometry, material);
            const meshEntity = this.world.createTransformEntity(threeMesh);
            threeMesh.position.setFromMatrixPosition(this.matrixBuffer);
            threeMesh.quaternion.setFromRotationMatrix(this.matrixBuffer);

            if (mesh.semanticLabel === 'global mesh') {
              meshEntity.addComponent(XRMesh, {
                _mesh: mesh,
                isBounded3D: false,
              });
            } else {
              const { minEntry, maxEntry } = this.findMinMaxEntries(
                this.flatToVec3Array(mesh.vertices),
              );
              meshEntity.addComponent(XRMesh, {
                _mesh: mesh,
                isBounded3D: true,
                semanticLabel: mesh.semanticLabel,
                min: [minEntry.x, minEntry.y, minEntry.z],
                max: [maxEntry.x, maxEntry.y, maxEntry.z],
                dimensions: [
                  maxEntry.x - minEntry.x,
                  maxEntry.y - minEntry.y,
                  maxEntry.z - minEntry.z,
                ],
              });
            }
          } else {
            const meshObject = this.currentMeshes.get(mesh)?.object3D;
            meshObject?.position.setFromMatrixPosition(this.matrixBuffer);
            meshObject?.quaternion.setFromRotationMatrix(this.matrixBuffer);
          }
        }
      });
    }
  }

  private updateEnabledFeatures(xrSession: XRSession | null) {
    if (!xrSession) {
      console.log(
        'Warning: xrSession is null when trying to query enabled features. Scene understanding  features are disabled.',
      );
      return;
    }

    const enabledFeatures = xrSession.enabledFeatures;
    this.planeFeatureEnabled = enabledFeatures?.includes('plane-detection');
    this.meshFeatureEnabled = enabledFeatures?.includes('mesh-detection');
    this.anchorFeatureEnabled = enabledFeatures?.includes('anchor');

    if (!this.planeFeatureEnabled) {
      console.log(
        'Warning: plane-detection feature not enabled for WebXR session. Partial Scene Understanding features are disabled.',
      );
    }

    if (!this.meshFeatureEnabled) {
      console.log(
        'Warning: mesh-detection feature not enabled for WebXR session. Partial Scene Understanding features are disabled.',
      );
    }

    if (!this.anchorFeatureEnabled) {
      console.log(
        'Warning: anchor feature not enabled for WebXR session. Partial Scene Understanding features are disabled.',
      );
    }
  }

  private async createAnchor(referenceSpace: XRReferenceSpace | null) {
    const frame = this.xrManager.getFrame();
    if (!frame.createAnchor) {
      throw 'XRFrame.createAnchor is undefined';
    }
    if (!referenceSpace) {
      throw 'renderer.xr.getReferenceSpace() returned null';
    }

    this.anchorRequested = true;
    this.xrAnchor = await frame.createAnchor(
      new XRRigidTransform(),
      referenceSpace,
    );
    if (!this.xrAnchor) {
      this.anchorRequested = false;
      throw 'XRAnchor creation failed';
    }
  }

  private updateAnchoredObject() {
    this.queries.anchoredEntities.entities.forEach((entity) => {
      const object = entity.object3D;
      if (object && !entity.getValue(XRAnchor, 'attached')) {
        this.anchoredGroup.attach(object);
        entity.setValue(XRAnchor, 'attached', true);
      }
    });
  }

  private flatToVec3Array(arr: Float32Array) {
    if (!arr || arr.length % 3 !== 0) {
      throw new Error('Array length must be a multiple of 3.');
    }
    const result = [];
    for (let i = 0; i < arr.length; i += 3) {
      const obj = {
        x: arr[i],
        y: arr[i + 1],
        z: arr[i + 2],
      };
      result.push(obj);
    }
    return result;
  }

  private findMinMaxEntries(arr: { x: number; y: number; z: number }[]) {
    let minEntry = arr[0];
    let maxEntry = arr[0];
    let minSum = arr[0].x + arr[0].y + arr[0].z;
    let maxSum = arr[0].x + arr[0].y + arr[0].z;
    for (let i = 1; i < arr.length; i++) {
      const currentSum = arr[i].x + arr[i].y + arr[i].z;
      if (currentSum < minSum) {
        minSum = currentSum;
        minEntry = arr[i];
      }
      if (currentSum > maxSum) {
        maxSum = currentSum;
        maxEntry = arr[i];
      }
    }
    return { minEntry, maxEntry };
  }
}
