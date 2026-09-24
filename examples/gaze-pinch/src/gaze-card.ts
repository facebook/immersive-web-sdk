/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  DistanceGrabbable,
  Hovered,
  Mesh,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Types,
  Vector3,
} from '@iwsdk/core';

/** Per-card state resolved once, when the entity enters the query. */
interface CardState {
  material: MeshStandardMaterial;
  /** Authored rest position, in the card's parent space. */
  rest: Vector3;
  /** Card-local +Z (the face pointing at the user), in the parent space. */
  forward: Vector3;
  emissive: number;
}

/**
 * GazeCardSystem — drives a per-card highlight from gaze + pinch.
 *
 * - `Hovered` (added by `InputSystem` while any ray points at the card):
 *   ramps emissive up to a soft glow, scaled by the dominant hand's pinch
 *   strength so users see a "pre-commit" affordance as they begin to pinch.
 * - `Pressed` (added once the pinch crosses the commit threshold):
 *   pops the card toward the user and locks emissive at full intensity until
 *   release.
 */
export class GazeCardSystem extends createSystem(
  {
    // Keep the distance-grab cube and welcome panel out of the card animation.
    cards: {
      required: [RayInteractable],
      excluded: [DistanceGrabbable, PokeInteractable],
    },
  },
  {
    /** Maximum emissive intensity at full hover/select. */
    maxEmissive: { type: Types.Float32, default: 1.4 },
    /** How quickly emissive interpolates toward its target. */
    fadeSpeed: { type: Types.Float32, default: 8 },
    /** Pop distance (meters) along the card's forward axis when selected. */
    selectOffset: { type: Types.Float32, default: 0.04 },
  },
) {
  private cardStates = new Map<number, CardState>();
  private targetPosition = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.cards.subscribe(
        'qualify',
        (entity) => {
          const object = entity.object3D;
          if (!object) {
            return;
          }

          // Scene assets arrive as whatever the manifest registered — a Mesh here,
          // but a glTF subtree in the general case. Instantiated clones *share*
          // materials with their prototype, so give each card its own before
          // writing emissive per frame.
          let material: MeshStandardMaterial | undefined;
          object.traverse((child) => {
            if (material || !(child instanceof Mesh)) {
              return;
            }
            const source = child.material;
            if (source instanceof MeshStandardMaterial) {
              material = source.clone();
              child.material = material;
            }
          });
          if (!material) {
            return;
          }

          this.cardStates.set(entity.index, {
            material,
            rest: object.position.clone(),
            forward: new Vector3(0, 0, 1).applyQuaternion(object.quaternion),
            emissive: 0,
          });
        },
        true,
      ),
    );

    this.cleanupFuncs.push(
      this.queries.cards.subscribe('disqualify', (entity) => {
        this.cardStates.get(entity.index)?.material.dispose();
        this.cardStates.delete(entity.index);
      }),
    );
    this.cleanupFuncs.push(() => {
      for (const state of this.cardStates.values()) {
        state.material.dispose();
      }
      this.cardStates.clear();
    });
  }

  update(delta: number): void {
    const fade = Math.min(1, this.config.fadeSpeed.peek() * delta);
    const maxEmissive = this.config.maxEmissive.peek();
    const selectOffset = this.config.selectOffset.peek();

    // Pre-commit affordance: scale hover glow by the dominant hand's pinch.
    const pinchStrength = Math.max(
      this.input.xr.visualAdapters.hand.left.getPinchStrength(),
      this.input.xr.visualAdapters.hand.right.getPinchStrength(),
    );

    for (const entity of this.queries.cards.entities) {
      const state = this.cardStates.get(entity.index);
      const object = entity.object3D;
      if (!state || !object) {
        continue;
      }

      const isSelected = entity.hasComponent(Pressed);
      let target = 0;
      if (isSelected) {
        target = maxEmissive;
      } else if (entity.hasComponent(Hovered)) {
        // Soft baseline glow that ramps with pinch progress.
        target = maxEmissive * (0.35 + 0.65 * pinchStrength);
      }
      state.emissive += (target - state.emissive) * fade;
      state.material.emissive.setScalar(state.emissive);

      // Pop along the card's own forward axis so every card in the arc moves
      // toward the user rather than along a shared world axis.
      this.targetPosition
        .copy(state.forward)
        .multiplyScalar(isSelected ? selectOffset : 0)
        .add(state.rest);
      object.position.lerp(this.targetPosition, fade);
    }
  }
}
