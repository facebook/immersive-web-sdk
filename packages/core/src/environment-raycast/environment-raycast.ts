/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { Matrix4, Object3D, Quaternion, Vector3 } from '../runtime/index.js';
import { setWorldPosition, setWorldQuaternion } from '../transform/index.js';
import { EnvironmentRaycastTarget, RaycastSpace } from './raycast-target.js';

// Reusable math objects to avoid allocations
const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempWorldQuaternion = new Quaternion();
const tempScale = new Vector3();
const tempNormal = new Vector3();
const tempRayOrigin = new Vector3();
const tempDirection = new Vector3();
const upVector = new Vector3(0, 1, 0);
const defaultDirection = new Vector3(0, 0, -1);

/**
 * System that manages environment raycasting.
 * @category Environment Raycast
 */
export class EnvironmentRaycastSystem extends createSystem({
  targets: { required: [EnvironmentRaycastTarget] },
}) {
  private hitTestFeatureEnabled: boolean | undefined;
  private pendingControllerSources = new Map<Entity, 'left' | 'right'>();

  init(): void {
    this.xrManager.addEventListener('sessionstart', () => {
      this.updateEnabledFeatures(this.xrManager.getSession());
    });

    this.xrManager.addEventListener('sessionend', () => {
      this.queries.targets.entities.forEach((entity) => {
        this.cleanupRaycastSource(entity);
      });
      this.hitTestFeatureEnabled = undefined;
      this.pendingControllerSources.clear();
    });

    // Automatic cleanup when component is removed
    this.queries.targets.subscribe('disqualify', (entity) => {
      this.cleanupRaycastSource(entity);
    });
  }

  update(_delta: number, _time: number): void {
    const frame = this.xrFrame;
    const session = this.xrManager.getSession();
    const referenceSpace = this.xrManager.getReferenceSpace();

    if (!this.hitTestFeatureEnabled || !frame || !session || !referenceSpace) {
      return;
    }

    this.checkPendingControllerSources(session, referenceSpace);

    this.queries.targets.entities.forEach((entity) => {
      const space = entity.getValue(
        EnvironmentRaycastTarget,
        'space',
      ) as RaycastSpace;

      if (space === RaycastSpace.Screen) {
        this.handleTransientInput(entity, session, frame, referenceSpace);
      } else {
        this.handleStandardRaycast(entity, session, frame, referenceSpace);
      }
    });
  }

  private handleStandardRaycast(
    entity: Entity,
    session: XRSession,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ) {
    const source = entity.getValue(EnvironmentRaycastTarget, '_source') as
      | XRHitTestSource
      | undefined;
    const sourceRequested = entity.getValue(
      EnvironmentRaycastTarget,
      '_sourceRequested',
    );

    if (!source && !sourceRequested) {
      this.requestRaycastSource(entity, session, referenceSpace);
      return;
    }

    if (source) {
      this.updateRaycastResults(entity, frame, referenceSpace);
    }
  }

  private handleTransientInput(
    entity: Entity,
    session: XRSession,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ) {
    const transientSource = entity.getValue(
      EnvironmentRaycastTarget,
      '_transientSource',
    ) as XRTransientInputHitTestSource | undefined;
    const sourceRequested = entity.getValue(
      EnvironmentRaycastTarget,
      '_sourceRequested',
    );

    if (!transientSource && !sourceRequested) {
      this.requestTransientRaycastSource(entity, session);
      return;
    }

    if (transientSource) {
      this.updateTransientRaycastResults(
        entity,
        frame,
        referenceSpace,
        transientSource,
      );
    }
  }

  private checkPendingControllerSources(
    session: XRSession,
    referenceSpace: XRReferenceSpace,
  ) {
    if (this.pendingControllerSources.size === 0) {
      return;
    }

    for (const [entity, handedness] of this.pendingControllerSources) {
      const inputSource = this.input.xr.getPrimaryInputSource(handedness);
      if (inputSource) {
        this.pendingControllerSources.delete(entity);
        entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
        this.requestRaycastSource(entity, session, referenceSpace);
      }
    }
  }

  private updateEnabledFeatures(xrSession: XRSession | null) {
    if (!xrSession) {
      return;
    }
    this.hitTestFeatureEnabled =
      xrSession.enabledFeatures?.includes('hit-test');
    if (!this.hitTestFeatureEnabled) {
      console.warn('[EnvironmentRaycastSystem] hit-test feature not enabled.');
    }
  }

  private async requestRaycastSource(
    entity: Entity,
    session: XRSession,
    _referenceSpace: XRReferenceSpace,
  ) {
    if (!session.requestHitTestSource) {
      return;
    }

    entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', true);

    try {
      const space = entity.getValue(
        EnvironmentRaycastTarget,
        'space',
      ) as RaycastSpace;

      const xrSpace = await this.resolveXRSpace(entity, space, session);
      if (!xrSpace) {
        return;
      }

      // Build offsetRay from component properties
      const offsetRay = this.buildOffsetRay(entity);

      const source = await session.requestHitTestSource({
        space: xrSpace,
        offsetRay,
      });

      entity.setValue(EnvironmentRaycastTarget, '_source', source);
      entity.setValue(EnvironmentRaycastTarget, '_raySpace', xrSpace);
      entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
    } catch (error) {
      console.error(
        '[EnvironmentRaycastSystem] Failed to create source:',
        error,
      );
      entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
    }
  }

  private buildOffsetRay(entity: Entity): XRRay {
    const offsetPosition = entity.getValue(
      EnvironmentRaycastTarget,
      'offsetPosition',
    ) as Vector3 | undefined;
    const offsetQuaternion = entity.getValue(
      EnvironmentRaycastTarget,
      'offsetQuaternion',
    ) as Quaternion | undefined;

    // Calculate direction from quaternion (apply to default -Z direction)
    if (offsetQuaternion) {
      tempDirection.copy(defaultDirection).applyQuaternion(offsetQuaternion);
    } else {
      tempDirection.copy(defaultDirection);
    }

    const origin = offsetPosition
      ? new DOMPointReadOnly(
          offsetPosition.x,
          offsetPosition.y,
          offsetPosition.z,
          1,
        )
      : new DOMPointReadOnly(0, 0, 0, 1);

    const direction = new DOMPointReadOnly(
      tempDirection.x,
      tempDirection.y,
      tempDirection.z,
      0,
    );

    return new XRRay(origin, direction);
  }

  private async requestTransientRaycastSource(
    entity: Entity,
    session: XRSession,
  ) {
    if (!session.requestHitTestSourceForTransientInput) {
      return;
    }

    entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', true);

    try {
      const source = await session.requestHitTestSourceForTransientInput({
        profile: 'generic-touchscreen',
      });

      entity.setValue(EnvironmentRaycastTarget, '_transientSource', source);
      entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
    } catch (error) {
      console.error(
        '[EnvironmentRaycastSystem] Failed to create transient source:',
        error,
      );
      entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
    }
  }

  private async resolveXRSpace(
    entity: Entity,
    space: RaycastSpace,
    session: XRSession,
  ): Promise<XRSpace | null> {
    switch (space) {
      case RaycastSpace.Viewer:
        return await session.requestReferenceSpace('viewer');

      case RaycastSpace.Left:
      case RaycastSpace.Right: {
        const inputSource = this.input.xr.getPrimaryInputSource(space);
        if (inputSource) {
          return inputSource.targetRaySpace;
        }
        this.pendingControllerSources.set(entity, space);
        return null;
      }

      default:
        return await session.requestReferenceSpace('viewer');
    }
  }

  private updateRaycastResults(
    entity: Entity,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ) {
    const source = entity.getValue(EnvironmentRaycastTarget, '_source') as
      | XRHitTestSource
      | undefined;
    if (!source) {
      return;
    }

    const raySpace = entity.getValue(EnvironmentRaycastTarget, '_raySpace') as
      | XRSpace
      | undefined;

    const object3D = entity.object3D;
    const maxDistance = entity.getValue(
      EnvironmentRaycastTarget,
      'maxDistance',
    ) as number;

    try {
      const results = frame.getHitTestResults(source);

      if (results.length === 0) {
        this.clearHitResult(entity, object3D);
        return;
      }

      // Get ray origin for distance calculation
      const rayOrigin = this.getRayOrigin(frame, referenceSpace, raySpace);

      // Find first valid result within maxDistance
      const validResult = this.findValidHitResult(
        results,
        referenceSpace,
        maxDistance,
        rayOrigin,
      );

      if (!validResult) {
        this.clearHitResult(entity, object3D);
        return;
      }

      this.applyHitResult(
        entity,
        object3D,
        validResult,
        referenceSpace,
        undefined,
      );
    } catch {
      this.cleanupRaycastSource(entity);
    }
  }

  private updateTransientRaycastResults(
    entity: Entity,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
    transientSource: XRTransientInputHitTestSource,
  ) {
    const object3D = entity.object3D;
    const maxDistance = entity.getValue(
      EnvironmentRaycastTarget,
      'maxDistance',
    ) as number;

    try {
      const transientResults =
        frame.getHitTestResultsForTransientInput(transientSource);

      for (const transientResult of transientResults) {
        const inputSource = transientResult.inputSource;
        const rayOrigin = this.getRayOrigin(
          frame,
          referenceSpace,
          inputSource?.targetRaySpace,
        );

        const validResult = this.findValidHitResult(
          transientResult.results,
          referenceSpace,
          maxDistance,
          rayOrigin,
        );

        if (validResult) {
          this.applyHitResult(
            entity,
            object3D,
            validResult,
            referenceSpace,
            inputSource,
          );
          return;
        }
      }

      // No valid hit found in any transient result
      this.clearHitResult(entity, object3D);
    } catch {
      this.cleanupRaycastSource(entity);
    }
  }

  private getRayOrigin(
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
    raySpace: XRSpace | undefined,
  ): Vector3 | null {
    if (!raySpace) {
      return null;
    }
    const rayPose = frame.getPose(raySpace, referenceSpace);
    if (!rayPose) {
      return null;
    }
    tempRayOrigin.set(
      rayPose.transform.position.x,
      rayPose.transform.position.y,
      rayPose.transform.position.z,
    );
    return tempRayOrigin;
  }

  private findValidHitResult(
    results: readonly XRHitTestResult[],
    referenceSpace: XRReferenceSpace,
    maxDistance: number,
    rayOrigin: Vector3 | null,
  ): XRHitTestResult | null {
    for (const result of results) {
      const pose = result.getPose(referenceSpace);
      if (!pose) {
        continue;
      }

      tempMatrix.fromArray(pose.transform.matrix);
      tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);

      // Only apply distance filter if we have a valid ray origin
      if (rayOrigin) {
        const distance = tempPosition.distanceTo(rayOrigin);
        if (distance > maxDistance) {
          continue;
        }
      }

      return result;
    }
    return null;
  }

  private applyHitResult(
    entity: Entity,
    object3D: Object3D | undefined,
    result: XRHitTestResult,
    referenceSpace: XRReferenceSpace,
    inputSource: XRInputSource | undefined,
  ) {
    const pose = result.getPose(referenceSpace);
    if (!pose) {
      this.clearHitResult(entity, object3D);
      return;
    }

    tempMatrix.fromArray(pose.transform.matrix);
    tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
    tempNormal.set(0, 1, 0).applyQuaternion(tempQuaternion);

    if (object3D) {
      setWorldPosition(object3D, tempPosition);
      tempWorldQuaternion.setFromUnitVectors(upVector, tempNormal);
      setWorldQuaternion(object3D, tempWorldQuaternion);
      object3D.visible = true;
    }

    entity.setValue(EnvironmentRaycastTarget, 'xrHitTestResult', result);
    entity.setValue(EnvironmentRaycastTarget, 'inputSource', inputSource);
  }

  private clearHitResult(entity: Entity, object3D: Object3D | undefined) {
    entity.setValue(EnvironmentRaycastTarget, 'xrHitTestResult', undefined);
    entity.setValue(EnvironmentRaycastTarget, 'inputSource', undefined);
    if (object3D) {
      object3D.visible = false;
    }
  }

  private cleanupRaycastSource(entity: Entity) {
    const source = entity.getValue(EnvironmentRaycastTarget, '_source') as
      | XRHitTestSource
      | undefined;
    if (source) {
      try {
        source.cancel();
      } catch {
        /* ignore */
      }
    }

    const transientSource = entity.getValue(
      EnvironmentRaycastTarget,
      '_transientSource',
    ) as XRTransientInputHitTestSource | undefined;
    if (transientSource) {
      try {
        transientSource.cancel();
      } catch {
        /* ignore */
      }
    }

    entity.setValue(EnvironmentRaycastTarget, '_source', undefined);
    entity.setValue(EnvironmentRaycastTarget, '_raySpace', undefined);
    entity.setValue(EnvironmentRaycastTarget, '_transientSource', undefined);
    entity.setValue(EnvironmentRaycastTarget, '_sourceRequested', false);
    entity.setValue(EnvironmentRaycastTarget, 'xrHitTestResult', undefined);
    entity.setValue(EnvironmentRaycastTarget, 'inputSource', undefined);
    this.pendingControllerSources.delete(entity);

    if (entity.object3D) {
      entity.object3D.visible = false;
    }
  }
}
