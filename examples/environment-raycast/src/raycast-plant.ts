/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  createSystem,
  EnvironmentRaycastTarget,
  Quaternion,
  Vector3,
} from '@iwsdk/core';

/**
 * System that demonstrates environment raycasting with plants.
 *
 * - Creates a "preview" plant that follows the right controller's raycast hit point
 *   using the EnvironmentRaycastTarget component (continuous raycasting)
 * - On trigger press, spawns a permanent plant at the current hit location
 */
export class RaycastPlantSystem extends createSystem({
  raycastTargets: { required: [EnvironmentRaycastTarget] },
}) {
  update() {
    // Check for trigger press on right hand to spawn a plant
    const rightGamepad = this.input.gamepads.right;
    const triggerPressed = rightGamepad?.getSelectStart() ?? false;

    if (!triggerPressed) {
      return;
    }

    this.queries.raycastTargets.entities.forEach((previewEntity) => {
      const previewPlant = previewEntity.object3D;
      const xrHitTestResult = previewEntity.getValue(
        EnvironmentRaycastTarget,
        'xrHitTestResult',
      ) as XRHitTestResult | undefined;

      if (xrHitTestResult && previewPlant?.visible) {
        this.spawnPlantAt(
          previewPlant.position.clone(),
          previewPlant.quaternion.clone(),
        );
      }
    });
  }

  private spawnPlantAt(position: Vector3, quaternion: Quaternion) {
    const plantGltf = AssetManager.getGLTF('plant-sansevieria');
    if (!plantGltf) {
      return;
    }

    const newPlant = plantGltf.scene;
    newPlant.position.copy(position);
    newPlant.quaternion.copy(quaternion);

    // Permanent plants remain runtime-spawned; the preview itself is authored.
    this.world.createTransformEntity(newPlant);
  }
}
