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

type PlaneGeometryState = {
  lastChangedTime: DOMHighResTimeStamp;
  polygon: XRPlane['polygon'];
};

type MeshGeometryState = {
  indices: XRMesh['indices'];
  lastChangedTime: DOMHighResTimeStamp;
  semanticLabel: XRMesh['semanticLabel'];
  vertices: XRMesh['vertices'];
};

type MeshMetadata = {
  dimensions: [number, number, number];
  isBounded3D: boolean;
  max: [number, number, number];
  min: [number, number, number];
  semanticLabel: string;
};

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

  /** Invalidates asynchronous anchor work when the active XR session changes. */
  private anchorRequestGeneration: number = 0;

  /** Prevents duplicate native-anchor disposal across async teardown paths. */
  private deletedAnchors = new WeakSet<XRAnchor>();

  /** The current XRAnchor instance for this session. Reset on session end to prevent stale XRSpace references. */
  private xrAnchor: XRAnchor | undefined;

  private currentPlanes = new Map<XRPlane, Entity>();
  private currentMeshes = new Map<XRMesh, Entity>();
  private planeGeometryStates = new Map<XRPlane, PlaneGeometryState>();
  private meshGeometryStates = new Map<XRMesh, MeshGeometryState>();

  /** Group that holds all anchored objects, positioned to match the XRAnchor's world pose */
  private anchoredGroup: Group = new Group();
  private anchoredGroupEntity: Entity | undefined;

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

    const onSessionStart = async () => {
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
    };

    const onSessionEnd = () => {
      // Clean up all plane and mesh entities to prevent stale XRSpace references
      // XRSpace objects (like planeSpace, meshSpace, anchorSpace) are tied to a specific
      // XRSession and become invalid when the session ends. Using them with a new session's
      // XRFrame will cause "XRSpace and XRFrame sessions do not match" errors.
      this.disposeDetectedEntities();

      // Clear session-specific state to prevent stale references
      // Note: The persistent anchor UUID in localStorage is preserved for the next session
      this.resetSessionState();
    };

    this.xrManager.addEventListener('sessionstart', onSessionStart);
    this.xrManager.addEventListener('sessionend', onSessionEnd);

    this.anchoredGroupEntity = this.world.createTransformEntity(
      this.anchoredGroup,
      {
        parent: this.world.sceneEntity,
        persistent: true,
      },
    );

    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onSessionStart),
      () => this.xrManager.removeEventListener('sessionend', onSessionEnd),
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
      () => {
        this.disposeDetectedEntities();
        this.resetSessionState();

        for (const entity of [...this.queries.anchoredEntities.entities]) {
          const object = entity.object3D;
          if (object?.parent === this.anchoredGroup) {
            this.scene.attach(object);
          }
          if (entity.active) {
            entity.setValue(XRAnchor, 'attached', false);
          }
        }
        this.anchoredGroup.removeFromParent();
        if (this.anchoredGroupEntity?.active) {
          this.anchoredGroupEntity.destroy();
        }
        this.anchoredGroupEntity = undefined;
        this.planeMaterial.dispose();
        this.meshMaterial.dispose();
      },
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

  private disposeDetectedEntities(): void {
    const entities = new Set([
      ...this.queries.planeEntities.entities,
      ...this.queries.meshEntities.entities,
    ]);
    for (const entity of entities) {
      this.disposeEntityGeometry(entity);
      if (entity.active) {
        entity.destroy();
      }
    }
    this.currentPlanes.clear();
    this.currentMeshes.clear();
    this.planeGeometryStates.clear();
    this.meshGeometryStates.clear();
  }

  private resetSessionState(): void {
    this.anchorRequestGeneration++;
    this.anchorRequested = false;
    this.clearActiveAnchor();
    this.planeFeatureEnabled = undefined;
    this.meshFeatureEnabled = undefined;
    this.anchorFeatureEnabled = undefined;
  }

  private isAnchorRequestCurrent(
    session: XRSession,
    requestGeneration: number,
  ): boolean {
    return (
      requestGeneration === this.anchorRequestGeneration &&
      session === this.xrManager.getSession()
    );
  }

  private deleteAnchor(anchor: XRAnchor | null | undefined): void {
    if (!anchor || this.deletedAnchors.has(anchor)) {
      return;
    }
    this.deletedAnchors.add(anchor);
    try {
      anchor.delete();
    } catch (_error) {
      // The session may already have ended, but the anchor must still be
      // forgotten locally and must never be installed into a later session.
    }
  }

  private clearActiveAnchor(): void {
    const anchor = this.xrAnchor;
    this.xrAnchor = undefined;
    this.deleteAnchor(anchor);
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
        this.planeGeometryStates.delete(
          planeEntity.getValue(XRPlane, '_plane') as XRPlane,
        );
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
            const polygon = plane.polygon;
            const geometry = this.createPlaneGeometry(polygon);
            const mesh = new Mesh(geometry, this.planeMaterial);
            mesh.visible = this.config.showWireFrame.value;
            mesh.position.setFromMatrixPosition(this.matrixBuffer);
            mesh.quaternion.setFromRotationMatrix(this.matrixBuffer);
            this.scene.add(mesh);
            const planeEntity = this.world.createTransformEntity(mesh);
            planeEntity.addComponent(XRPlane, {
              _plane: plane,
            });
            this.planeGeometryStates.set(plane, {
              lastChangedTime: plane.lastChangedTime,
              polygon,
            });
          } else {
            const planeObject = this.currentPlanes.get(plane)?.object3D;
            const previousState = this.planeGeometryStates.get(plane);
            if (
              planeObject instanceof Mesh &&
              (previousState === undefined ||
                previousState.lastChangedTime !== plane.lastChangedTime)
            ) {
              const polygon = plane.polygon;
              // Conforming runtimes replace changed topology arrays. Keep the
              // identity guard because some emulators advance the timestamp on
              // every frame even when their topology is unchanged.
              if (previousState?.polygon !== polygon) {
                const previousGeometry = planeObject.geometry;
                planeObject.geometry = this.createPlaneGeometry(polygon);
                previousGeometry.dispose();
              }
              this.planeGeometryStates.set(plane, {
                lastChangedTime: plane.lastChangedTime,
                polygon,
              });
            }
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
        this.meshGeometryStates.delete(
          meshEntity.getValue(XRMesh, '_mesh') as XRMesh,
        );
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
            const vertices = mesh.vertices;
            const indices = mesh.indices;
            const metadata = this.tryGetMeshMetadata(
              vertices,
              mesh.semanticLabel,
            );
            if (metadata === undefined) {
              return;
            }
            const geometry = this.createMeshGeometry(vertices, indices);
            const threeMesh = new Mesh(geometry, this.meshMaterial);
            threeMesh.visible = this.config.showWireFrame.value;
            this.scene.add(threeMesh);
            const meshEntity = this.world.createTransformEntity(threeMesh);
            threeMesh.position.setFromMatrixPosition(this.matrixBuffer);
            threeMesh.quaternion.setFromRotationMatrix(this.matrixBuffer);

            meshEntity.addComponent(XRMesh, {
              _mesh: mesh,
              ...metadata,
            });
            this.meshGeometryStates.set(mesh, {
              indices,
              lastChangedTime: mesh.lastChangedTime,
              semanticLabel: mesh.semanticLabel,
              vertices,
            });
          } else {
            const meshEntity = this.currentMeshes.get(mesh);
            const meshObject = meshEntity?.object3D;
            const previousState = this.meshGeometryStates.get(mesh);
            if (
              meshEntity !== undefined &&
              meshObject instanceof Mesh &&
              (previousState === undefined ||
                previousState.lastChangedTime !== mesh.lastChangedTime)
            ) {
              const vertices = mesh.vertices;
              const indices = mesh.indices;
              const semanticLabel = mesh.semanticLabel;
              // See the plane path above: timestamp changes alone are noisy in
              // some emulators, while conforming topology updates replace the
              // vertex or index array.
              const topologyChanged =
                previousState?.vertices !== vertices ||
                previousState?.indices !== indices;
              const metadataChanged =
                topologyChanged ||
                previousState?.semanticLabel !== semanticLabel;
              const metadata = metadataChanged
                ? this.tryGetMeshMetadata(vertices, semanticLabel)
                : undefined;
              if (metadataChanged && metadata === undefined) {
                // Keep the last known-good geometry and component metadata.
                // A later valid topology update can still replace them.
                meshObject.position.setFromMatrixPosition(this.matrixBuffer);
                meshObject.quaternion.setFromRotationMatrix(this.matrixBuffer);
                return;
              }
              if (topologyChanged) {
                const previousGeometry = meshObject.geometry;
                meshObject.geometry = this.createMeshGeometry(
                  vertices,
                  indices,
                );
                previousGeometry.dispose();
              }
              if (metadata !== undefined) {
                this.updateMeshMetadata(meshEntity, metadata);
              }
              this.meshGeometryStates.set(mesh, {
                indices,
                lastChangedTime: mesh.lastChangedTime,
                semanticLabel,
                vertices,
              });
            }
            meshObject?.position.setFromMatrixPosition(this.matrixBuffer);
            meshObject?.quaternion.setFromRotationMatrix(this.matrixBuffer);
          }
        }
      });
    }
  }

  private createPlaneGeometry(polygon: XRPlane['polygon']): BoxGeometry {
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

    return new BoxGeometry(maxX - minX, 0.001, maxZ - minZ);
  }

  private createMeshGeometry(
    vertices: XRMesh['vertices'],
    indices: XRMesh['indices'],
  ): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    return geometry;
  }

  private getMeshMetadata(
    vertices: XRMesh['vertices'],
    semanticLabel: XRMesh['semanticLabel'],
  ): MeshMetadata {
    if (semanticLabel === 'global mesh') {
      return {
        dimensions: [0, 0, 0],
        isBounded3D: false,
        max: [0, 0, 0],
        min: [0, 0, 0],
        semanticLabel: '',
      };
    }

    const { minEntry, maxEntry } = findAxisAlignedBounds(vertices);
    return {
      dimensions: [
        maxEntry.x - minEntry.x,
        maxEntry.y - minEntry.y,
        maxEntry.z - minEntry.z,
      ],
      isBounded3D: true,
      max: [maxEntry.x, maxEntry.y, maxEntry.z],
      min: [minEntry.x, minEntry.y, minEntry.z],
      semanticLabel: semanticLabel ?? '',
    };
  }

  private tryGetMeshMetadata(
    vertices: XRMesh['vertices'],
    semanticLabel: XRMesh['semanticLabel'],
  ): MeshMetadata | undefined {
    try {
      return this.getMeshMetadata(vertices, semanticLabel);
    } catch (error) {
      console.warn(
        '[SceneUnderstandingSystem] Skipping mesh with invalid vertex data.',
        error,
      );
      return undefined;
    }
  }

  private updateMeshMetadata(entity: Entity, metadata: MeshMetadata): void {
    entity.getVectorView(XRMesh, 'min').set(metadata.min);
    entity.getVectorView(XRMesh, 'max').set(metadata.max);
    entity.getVectorView(XRMesh, 'dimensions').set(metadata.dimensions);
    if (entity.getValue(XRMesh, 'semanticLabel') !== metadata.semanticLabel) {
      entity.setValue(XRMesh, 'semanticLabel', metadata.semanticLabel);
    }
    if (entity.getValue(XRMesh, 'isBounded3D') !== metadata.isBounded3D) {
      entity.setValue(XRMesh, 'isBounded3D', metadata.isBounded3D);
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
    let requestGeneration: number | undefined;
    let session: XRSession | null = null;

    try {
      // Load the saved anchor UUID from localStorage
      const savedUuid = localStorage.getItem(
        SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY,
      );

      if (!savedUuid) {
        return;
      }

      session = this.xrManager.getSession();
      if (!session) {
        return;
      }

      if (!session.restorePersistentAnchor) {
        console.warn('XRSession.restorePersistentAnchor not supported');
        return;
      }

      // Each async request owns a generation. Session end, system teardown, or
      // a subsequent restore invalidates it so a late result cannot install an
      // XRAnchor whose XRSpace belongs to an obsolete XRSession.
      requestGeneration = ++this.anchorRequestGeneration;
      this.anchorRequested = true;
      const restoredAnchor = (await session.restorePersistentAnchor(
        savedUuid,
      )) as XRAnchor | null;

      if (!this.isAnchorRequestCurrent(session, requestGeneration)) {
        this.deleteAnchor(restoredAnchor);
        return;
      }

      if (!restoredAnchor) {
        this.clearActiveAnchor();
        return;
      }

      if (this.xrAnchor !== restoredAnchor) {
        this.clearActiveAnchor();
        this.xrAnchor = restoredAnchor;
      }
    } catch (_error) {
      // Only the current session's failure proves that its saved UUID is
      // invalid. A superseded session may reject merely because it ended.
      if (
        requestGeneration === undefined ||
        (session !== null &&
          this.isAnchorRequestCurrent(session, requestGeneration))
      ) {
        try {
          localStorage.removeItem(
            SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY,
          );
        } catch (_storageError) {
          // Storage access can be unavailable in privacy-restricted contexts.
        }
      }
    } finally {
      // A stale request must not clear the in-flight marker owned by the next
      // session's restore.
      if (requestGeneration === this.anchorRequestGeneration) {
        this.anchorRequested = false;
      }
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
    let requestGeneration: number | undefined;
    let session: XRSession | null = null;
    let createdAnchor: XRAnchor | null | undefined;

    try {
      session = this.xrManager.getSession();
      const frame = this.xrManager.getFrame();
      if (!session || !frame?.createAnchor || !referenceSpace) {
        return;
      }

      requestGeneration = ++this.anchorRequestGeneration;
      this.anchorRequested = true;
      console.log(
        '[SceneUnderstandingSystem] Anchor needed but not present, triggering creation',
      );
      createdAnchor = (await frame.createAnchor(
        new XRRigidTransform(),
        referenceSpace,
      )) as XRAnchor | null;

      if (!createdAnchor) {
        return;
      }

      if (!this.isAnchorRequestCurrent(session, requestGeneration)) {
        this.deleteAnchor(createdAnchor);
        return;
      }

      if (this.xrAnchor !== createdAnchor) {
        this.clearActiveAnchor();
        this.xrAnchor = createdAnchor;
      }

      if (createdAnchor.requestPersistentHandle) {
        const uuid = await createdAnchor.requestPersistentHandle();
        if (
          !this.isAnchorRequestCurrent(session, requestGeneration) ||
          this.xrAnchor !== createdAnchor
        ) {
          if (this.xrAnchor === createdAnchor) {
            this.xrAnchor = undefined;
          }
          this.deleteAnchor(createdAnchor);
          return;
        }
        localStorage.setItem(
          SceneUnderstandingSystem.ANCHOR_UUID_STORAGE_KEY,
          uuid,
        );
      }
    } catch (_error) {
      // Anchor creation and persistence are optional. A current created anchor
      // remains usable when only persistence fails; a stale one is discarded.
      if (
        createdAnchor &&
        requestGeneration !== undefined &&
        session !== null &&
        (!this.isAnchorRequestCurrent(session, requestGeneration) ||
          this.xrAnchor !== createdAnchor)
      ) {
        if (this.xrAnchor === createdAnchor) {
          this.xrAnchor = undefined;
        }
        this.deleteAnchor(createdAnchor);
      }
    } finally {
      if (requestGeneration === this.anchorRequestGeneration) {
        this.anchorRequested = false;
      }
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
 * From a flat `[x,y,z, x,y,z, ...]` vertex buffer, return its axis-aligned
 * minimum and maximum coordinates. The extrema can come from different source
 * vertices; treating one smallest-sum and one largest-sum vertex as bounds
 * under-reports skewed meshes.
 */
export function findAxisAlignedBounds(arr: Float32Array): {
  minEntry: Vec3;
  maxEntry: Vec3;
} {
  if (!arr || arr.length === 0 || arr.length % 3 !== 0) {
    throw new Error('Array length must be a positive multiple of 3.');
  }
  let minX = arr[0];
  let minY = arr[1];
  let minZ = arr[2];
  let maxX = minX;
  let maxY = minY;
  let maxZ = minZ;
  for (let i = 3; i < arr.length; i += 3) {
    minX = Math.min(minX, arr[i]);
    minY = Math.min(minY, arr[i + 1]);
    minZ = Math.min(minZ, arr[i + 2]);
    maxX = Math.max(maxX, arr[i]);
    maxY = Math.max(maxY, arr[i + 1]);
    maxZ = Math.max(maxZ, arr[i + 2]);
  }
  return {
    minEntry: { x: minX, y: minY, z: minZ },
    maxEntry: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * From a flat `[x,y,z, x,y,z, ...]` vertex buffer, return the source
 * vertices with the smallest and largest coordinate sums.
 *
 * @deprecated This legacy helper does not calculate an axis-aligned bounding
 * box. Use {@link findAxisAlignedBounds} for bounds and dimensions.
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
