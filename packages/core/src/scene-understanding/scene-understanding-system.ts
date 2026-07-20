/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types } from '../ecs/component.js';
import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
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

  /** Tracks whether an anchor creation request is in progress to prevent duplicate requests */
  private anchorRequested: boolean = false;

  /** The current XRAnchor instance for this session. Reset on session end to prevent stale XRSpace references. */
  private xrAnchor: XRAnchor | undefined;

  private currentPlanes = new Map<XRPlane, Entity>();
  private currentMeshes = new Map<XRMesh, Entity>();

  /** Group that holds all anchored objects, positioned to match the XRAnchor's world pose */
  private anchoredGroup: Group = new Group();

  private matrixBuffer = new Matrix4();

  /** Shared material for all plane visualization meshes */
  private planeMaterial!: MeshBasicMaterial;

  /** Shared material for all mesh visualization meshes */
  private meshMaterial!: MeshBasicMaterial;

  /** localStorage key for storing the persistent anchor UUID */
  private static readonly ANCHOR_UUID_STORAGE_KEY = 'iwsdk_scene_anchor_uuid';

  init(): void {
    // Create shared materials for performance
    this.planeMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      wireframe: true,
      opacity: 0.3,
    });

    this.meshMaterial = new MeshBasicMaterial({
      color: 0x3383e6,
      transparent: true,
      wireframe: true,
      opacity: 0.3,
    });

    this.xrManager.addEventListener('sessionstart', async () => {
      this.updateEnabledFeatures(this.xrManager.getSession());

      // Attempt to restore a persistent anchor from previous sessions
      // This allows anchored objects to maintain their world position across sessions
      if (this.anchorFeatureEnabled) {
        await this.tryRestorePersistentAnchor();
      }

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

    this.xrManager.addEventListener('sessionend', () => {
      // Clean up all plane and mesh entities to prevent stale XRSpace references
      // XRSpace objects (like planeSpace, meshSpace, anchorSpace) are tied to a specific
      // XRSession and become invalid when the session ends. Using them with a new session's
      // XRFrame will cause "XRSpace and XRFrame sessions do not match" errors.
      this.queries.planeEntities.entities.forEach((entity) => {
        this.disposeEntityGeometry(entity);
        entity.destroy();
      });
      this.queries.meshEntities.entities.forEach((entity) => {
        this.disposeEntityGeometry(entity);
        entity.destroy();
      });

      // Clear session-specific state to prevent stale references
      // Note: The persistent anchor UUID in localStorage is preserved for the next session
      this.xrAnchor = undefined;
      this.anchorRequested = false;
      this.planeFeatureEnabled = undefined;
      this.meshFeatureEnabled = undefined;
      this.anchorFeatureEnabled = undefined;
      this.currentPlanes.clear();
      this.currentMeshes.clear();
    });

    this.world.createTransformEntity(this.anchoredGroup, {
      parent: this.world.sceneEntity,
      persistent: true,
    });

    this.cleanupFuncs.push(
      this.config.showWireFrame.subscribe((value) => {
        this.queries.planeEntities.entities.forEach((planeEntity) => {
          const planeObject = planeEntity.object3D;
          if (planeObject instanceof Mesh) {
            planeObject.visible = value;
          }
        });

        this.queries.meshEntities.entities.forEach((meshEntity) => {
          const meshObject = meshEntity.object3D;
          if (meshObject instanceof Mesh) {
            meshObject.visible = value;
          }
        });
      }),
    );
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
      console.log(
        '[SceneUnderstandingSystem] Anchor needed but not present, triggering creation',
      );
      this.createAnchor(referenceSpace);
    }

    if (this.xrAnchor && referenceSpace) {
      this.updateAnchoredObject();
      const pose = this.xrManager
        .getFrame()
        ?.getPose(this.xrAnchor.anchorSpace, referenceSpace);
      if (pose) {
        this.matrixBuffer.fromArray(pose.transform.matrix);
        this.matrixBuffer.decompose(
          this.anchoredGroup.position,
          this.anchoredGroup.quaternion,
          this.anchoredGroup.scale,
        );
      }
    }
  }

  /**
   * Dispose only the per-object geometry for a plane/mesh entity being removed.
   * The plane/mesh materials are shared singletons (`planeMaterial` /
   * `meshMaterial`), so they must NOT be disposed here.
   */
  private disposeEntityGeometry(entity: Entity): void {
    const object3D = entity.object3D;
    if (object3D instanceof Mesh) {
      object3D.geometry.dispose();
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
        this.disposeEntityGeometry(planeEntity);
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

          if (this.currentPlanes.has(plane) === false) {
            // Only build geometry for newly-seen planes. Doing it every frame
            // for every plane allocated a BoxGeometry that was then discarded
            // (without dispose) for already-tracked planes — a per-frame GPU
            // leak. Existing planes only need their transform refreshed below.
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

            const geometry = new BoxGeometry(width, 0.001, height);
            const mesh = new Mesh(geometry, this.planeMaterial);
            mesh.visible = this.config.showWireFrame.value;
            mesh.position.setFromMatrixPosition(this.matrixBuffer);
            mesh.quaternion.setFromRotationMatrix(this.matrixBuffer);
            this.scene.add(mesh);
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
        this.disposeEntityGeometry(meshEntity);
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

          if (this.currentMeshes.has(mesh) === false) {
            // Only build geometry for newly-seen meshes. Building a
            // BufferGeometry every frame for every mesh and discarding it
            // (without dispose) for already-tracked meshes was a per-frame GPU
            // leak. Existing meshes only need their transform refreshed below.
            const geometry = new BufferGeometry();
            geometry.setAttribute(
              'position',
              new BufferAttribute(mesh.vertices, 3),
            );
            geometry.setIndex(new BufferAttribute(mesh.indices, 1));

            const threeMesh = new Mesh(geometry, this.meshMaterial);
            threeMesh.visible = this.config.showWireFrame.value;
            this.scene.add(threeMesh);
            const meshEntity = this.world.createTransformEntity(threeMesh);
            threeMesh.position.setFromMatrixPosition(this.matrixBuffer);
            threeMesh.quaternion.setFromRotationMatrix(this.matrixBuffer);

            if (mesh.semanticLabel === 'global mesh') {
              meshEntity.addComponent(XRMesh, {
                _mesh: mesh,
                isBounded3D: false,
              });
            } else {
              const { minEntry, maxEntry } = findExtremeVertices(mesh.vertices);
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
    this.anchorFeatureEnabled = enabledFeatures?.includes('anchors');

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

  /**
   * Attempts to restore a persistent anchor from a previous session.
   *
   * Persistent anchors allow anchored objects to maintain their world position
   * across XR sessions. The anchor UUID is stored in localStorage and used to
   * restore the same anchor when a new session starts.
   *
   * If restoration fails (e.g., user cleared the space, runtime doesn't support
   * persistence, or the anchor was deleted), this fails gracefully and a new
   * anchor will be created in the update loop.
   */
  private async tryRestorePersistentAnchor() {
    try {
      // Load the saved anchor UUID from localStorage
      const savedUuid = localStorage.getItem(
        SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY,
      );

      if (!savedUuid) {
        return;
      }

      const session = this.xrManager.getSession();
      if (!session) {
        return;
      }

      // Attempt to restore the anchor using the saved UUID
      this.anchorRequested = true;

      if (!session.restorePersistentAnchor) {
        console.warn('XRSession.restorePersistentAnchor not supported');
        this.anchorRequested = false;
        return;
      }

      this.xrAnchor = await session.restorePersistentAnchor(savedUuid);

      if (!this.xrAnchor) {
        // Restoration returned null, will create new anchor
        this.anchorRequested = false;
      }
    } catch (_error) {
      // Restoration failed - clear the invalid UUID and allow new anchor creation
      localStorage.removeItem(SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY);
      this.anchorRequested = false;
    }
  }

  /**
   * Creates a new XR anchor at the origin of the reference space.
   *
   * The anchor is used to attach virtual objects to a stable real-world position.
   * After creation, attempts to request a persistent handle so the anchor can be
   * restored in future sessions. If persistence is not supported, the anchor
   * will only last for the current session.
   */
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

    // Request a persistent handle for the anchor so it can be restored in future sessions
    try {
      if (this.xrAnchor.requestPersistentHandle) {
        const uuid = await this.xrAnchor.requestPersistentHandle();
        localStorage.setItem(
          SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY,
          uuid,
        );
      }
    } catch (_error) {
      // Persistence not supported or failed - anchor will work for this session only
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
}

type Vec3 = { x: number; y: number; z: number };

/**
 * From a flat `[x,y,z, x,y,z, ...]` vertex buffer, return the vertices with the
 * smallest and largest coordinate sum (`x + y + z`).
 *
 * Equivalent to the previous `flatToVec3Array(...)` -> `findMinMaxEntries(...)`
 * pipeline, but it scans the typed array directly and allocates only the two
 * result objects instead of one object per vertex (thousands per mesh).
 */
export function findExtremeVertices(arr: Float32Array): {
  minEntry: Vec3;
  maxEntry: Vec3;
} {
  if (!arr || arr.length === 0 || arr.length % 3 !== 0) {
    throw new Error('Array length must be a positive multiple of 3.');
  }
  let minIndex = 0;
  let maxIndex = 0;
  let minSum = arr[0] + arr[1] + arr[2];
  let maxSum = minSum;
  for (let i = 3; i < arr.length; i += 3) {
    const sum = arr[i] + arr[i + 1] + arr[i + 2];
    if (sum < minSum) {
      minSum = sum;
      minIndex = i;
    }
    if (sum > maxSum) {
      maxSum = sum;
      maxIndex = i;
    }
  }
  return {
    minEntry: { x: arr[minIndex], y: arr[minIndex + 1], z: arr[minIndex + 2] },
    maxEntry: { x: arr[maxIndex], y: arr[maxIndex + 1], z: arr[maxIndex + 2] },
  };
}
