/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  DistanceGrabbable,
  Grabbed,
  Hovered,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Types,
  UIKitMLAsset,
  Vector3,
} from '@iwsdk/core';

/** Per-card state resolved once, when the entity enters the query. */
interface CardState {
  materials: MeshStandardMaterial[];
  /** Authored rest position, in the card's parent space. */
  rest: Vector3;
  /** Authored scale, used as the baseline for hover/select feedback. */
  restScale: Vector3;
  /** Card-local +Z (the face pointing at the user), in the parent space. */
  forward: Vector3;
  emissive: number;
}

interface CubeState {
  cage: LineBasicMaterial;
  core: MeshStandardMaterial;
  grabOrigin: Vector3;
  halo: MeshBasicMaterial;
  haloObject: Mesh;
  haloStrength: number;
  /** Authored position above the cube's plinth, in parent space. */
  rest: Vector3;
  /** Position captured on release, used as the return-flight origin. */
  returnStart: Vector3;
  returnElapsed: number;
  returning: boolean;
  wasGrabbed: boolean;
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
    cubes: { required: [DistanceGrabbable] },
  },
  {
    /** Maximum emissive intensity at full hover/select. */
    maxEmissive: { type: Types.Float32, default: 1.4 },
    /** How quickly emissive interpolates toward its target. */
    fadeSpeed: { type: Types.Float32, default: 8 },
    /** Pop distance (meters) along the card's forward axis when selected. */
    selectOffset: { type: Types.Float32, default: 0.04 },
    /** Seconds for a released cube to fly back to its plinth. */
    returnDuration: { type: Types.Float32, default: 0.65 },
    /** Maximum peak height (meters) of the cube's return arc. */
    returnArcHeight: { type: Types.Float32, default: 0.08 },
    /** Snap release offsets smaller than this distance directly to rest. */
    returnMinDistance: { type: Types.Float32, default: 0.01 },
  },
) {
  private cardStates = new Map<number, CardState>();
  private cubeStates = new Map<number, CubeState>();
  private targetPosition = new Vector3();
  private targetScale = new Vector3();
  private interactionStatus?: {
    setProperties(properties: { color?: string; text?: string }): void;
  };
  private lastStatus = '';
  private cardConfirmationSeconds = 0;
  private cardWasPressed = false;

  init(): void {
    this.cleanupFuncs.push(
      this.queries.cards.subscribe(
        'qualify',
        (entity) => {
          const object = entity.object3D;
          if (!object) {
            return;
          }

          // Scene assets arrive as object subtrees and instantiated clones
          // share their prototype materials, so clone each animated surface
          // before writing per-card emissive intensity.
          const materials: MeshStandardMaterial[] = [];
          object.traverse((child) => {
            if (
              !(child instanceof Mesh) ||
              ![
                'gaze-card-face',
                'gaze-card-accent',
                'gaze-card-mark',
              ].includes(child.name)
            ) {
              return;
            }
            const source = child.material;
            if (source instanceof MeshStandardMaterial) {
              const material = source.clone();
              child.material = material;
              materials.push(material);
            }
          });
          if (materials.length === 0) {
            return;
          }

          this.cardStates.set(entity.index, {
            materials,
            rest: object.position.clone(),
            restScale: object.scale.clone(),
            forward: new Vector3(0, 0, 1).applyQuaternion(object.quaternion),
            emissive: 0,
          });
        },
        true,
      ),
    );

    this.cleanupFuncs.push(
      this.queries.cards.subscribe('disqualify', (entity) => {
        for (const material of this.cardStates.get(entity.index)?.materials ??
          []) {
          material.dispose();
        }
        this.cardStates.delete(entity.index);
      }),
    );

    this.cleanupFuncs.push(
      this.queries.cubes.subscribe(
        'qualify',
        (entity) => {
          let core: MeshStandardMaterial | undefined;
          let cage: LineBasicMaterial | undefined;
          let halo: MeshBasicMaterial | undefined;
          let haloObject: Mesh | undefined;
          entity.object3D?.traverse((child) => {
            if (
              child instanceof Mesh &&
              child.name === 'gaze-cube-core' &&
              child.material instanceof MeshStandardMaterial
            ) {
              core = child.material.clone();
              child.material = core;
            } else if (
              child instanceof Mesh &&
              child.name === 'gaze-cube-halo' &&
              child.material instanceof MeshBasicMaterial
            ) {
              halo = child.material.clone();
              child.material = halo;
              haloObject = child;
              // Asset cloning preserves transforms/material references but not
              // own-method overrides. Disable decorative hit geometry on the
              // live instance so only the cube surface can win targeting.
              child.raycast = () => {};
            } else if (
              child instanceof LineSegments &&
              child.name === 'gaze-cube-cage' &&
              child.material instanceof LineBasicMaterial
            ) {
              cage = child.material.clone();
              child.material = cage;
              child.raycast = () => {};
            }
          });
          if (core && cage && halo && haloObject) {
            this.cubeStates.set(entity.index, {
              cage,
              core,
              grabOrigin: entity.object3D?.position.clone() ?? new Vector3(),
              halo,
              haloObject,
              haloStrength: 0,
              rest: entity.object3D?.position.clone() ?? new Vector3(),
              returnStart: entity.object3D?.position.clone() ?? new Vector3(),
              returnElapsed: 0,
              returning: false,
              wasGrabbed: false,
            });
          }
        },
        true,
      ),
    );

    this.cleanupFuncs.push(
      this.queries.cubes.subscribe('disqualify', (entity) => {
        const state = this.cubeStates.get(entity.index);
        state?.cage.dispose();
        state?.core.dispose();
        state?.halo.dispose();
        this.cubeStates.delete(entity.index);
      }),
    );

    this.interactionStatus = this.world
      .requireSceneObject<UIKitMLAsset>('welcome-panel')
      .requireElementById('interaction-status');
    this.cleanupFuncs.push(() => {
      for (const state of this.cardStates.values()) {
        for (const material of state.materials) {
          material.dispose();
        }
      }
      this.cardStates.clear();
      for (const state of this.cubeStates.values()) {
        state.cage.dispose();
        state.core.dispose();
        state.halo.dispose();
      }
      this.cubeStates.clear();
    });
  }

  update(delta: number): void {
    const fade = Math.min(1, this.config.fadeSpeed.peek() * delta);
    const maxEmissive = this.config.maxEmissive.peek();
    const selectOffset = this.config.selectOffset.peek();
    const returnDuration = Math.max(
      Number.EPSILON,
      this.config.returnDuration.peek(),
    );
    const returnArcHeight = Math.max(0, this.config.returnArcHeight.peek());
    const returnMinDistance = Math.max(0, this.config.returnMinDistance.peek());

    // Pre-commit affordance: scale hover glow by the dominant hand's pinch.
    const pinchStrength = Math.max(
      this.input.xr.visualAdapters.hand.left.getPinchStrength(),
      this.input.xr.visualAdapters.hand.right.getPinchStrength(),
    );

    let cardHovered = false;
    let cardPressed = false;
    for (const entity of this.queries.cards.entities) {
      const state = this.cardStates.get(entity.index);
      const object = entity.object3D;
      if (!state || !object) {
        continue;
      }

      const isSelected = entity.hasComponent(Pressed);
      const isHovered = entity.hasComponent(Hovered);
      cardHovered ||= isHovered;
      cardPressed ||= isSelected;
      let target = 0;
      if (isSelected) {
        target = maxEmissive;
      } else if (isHovered) {
        // Soft baseline glow that ramps with pinch progress.
        target = maxEmissive * (0.35 + 0.65 * pinchStrength);
      }
      state.emissive += (target - state.emissive) * fade;
      for (const material of state.materials) {
        material.emissiveIntensity = 0.04 + state.emissive;
      }

      // Pop along the card's own forward axis so every card in the arc moves
      // toward the user rather than along a shared world axis.
      this.targetPosition
        .copy(state.forward)
        .multiplyScalar(isSelected ? selectOffset : 0)
        .add(state.rest);
      object.position.lerp(this.targetPosition, fade);
      this.targetScale
        .copy(state.restScale)
        .multiplyScalar(isSelected ? 0.96 : isHovered ? 1.035 : 1);
      object.scale.lerp(this.targetScale, fade);
    }

    if (!cardPressed && this.cardWasPressed) {
      this.cardConfirmationSeconds = 1.2;
    }
    this.cardWasPressed = cardPressed;
    this.cardConfirmationSeconds = Math.max(
      0,
      this.cardConfirmationSeconds - delta,
    );

    let cubeHovered = false;
    let cubeGrabbed = false;
    let cubeReturning = false;
    let cubeMoveDistance = 0;
    for (const entity of this.queries.cubes.entities) {
      const state = this.cubeStates.get(entity.index);
      const object = entity.object3D;
      if (!state || !object) {
        continue;
      }
      const isGrabbed = entity.hasComponent(Grabbed);
      const isHovered = entity.hasComponent(Hovered);
      cubeGrabbed ||= isGrabbed;
      cubeHovered ||= isHovered;
      if (isGrabbed && !state.wasGrabbed) {
        state.returning = false;
        state.grabOrigin.copy(object.position);
      }
      if (isGrabbed) {
        cubeMoveDistance = Math.max(
          cubeMoveDistance,
          object.position.distanceTo(state.grabOrigin),
        );
      } else if (state.wasGrabbed) {
        state.returnStart.copy(object.position);
        state.returnElapsed = 0;
        state.returning =
          state.returnStart.distanceTo(state.rest) > returnMinDistance;
        if (!state.returning) {
          object.position.copy(state.rest);
        }
      }

      // Reset can place the cube directly at rest while a return is active.
      if (
        state.returning &&
        object.position.distanceToSquared(state.rest) < 1e-8
      ) {
        object.position.copy(state.rest);
        state.returning = false;
      }
      if (!isGrabbed && state.returning) {
        state.returnElapsed = Math.min(
          returnDuration,
          state.returnElapsed + delta,
        );
        const progress = state.returnElapsed / returnDuration;
        const eased = 1 - (1 - progress) ** 3;
        this.targetPosition.lerpVectors(state.returnStart, state.rest, eased);
        const arcHeight = Math.min(
          returnArcHeight,
          state.returnStart.distanceTo(state.rest) * 0.5,
        );
        this.targetPosition.y += Math.sin(Math.PI * eased) * arcHeight;
        object.position.copy(this.targetPosition);
        if (progress >= 1) {
          object.position.copy(state.rest);
          state.returning = false;
        }
      }
      cubeReturning ||= state.returning;
      state.wasGrabbed = isGrabbed;

      const targetHalo = isGrabbed
        ? 1
        : Math.max(state.returning ? 0.38 : 0, isHovered ? 0.62 : 0);
      state.haloStrength += (targetHalo - state.haloStrength) * fade;
      state.halo.opacity = state.haloStrength;
      state.haloObject.visible = state.haloStrength > 0.01;
      state.haloObject.scale.setScalar(0.92 + state.haloStrength * 0.12);
      state.cage.opacity = 0.22 + state.haloStrength * 0.58;
      state.core.emissiveIntensity = 0.08 + state.haloStrength * 0.72;
      if (isGrabbed || state.returning) {
        state.haloObject.rotation.z += delta * 1.8;
      }
    }

    const nextStatus = cubeGrabbed
      ? [
          `Holding cube - moved ${Math.round(cubeMoveDistance * 100)} cm`,
          '#ffb36b',
        ]
      : cubeReturning
        ? ['Returning cube to plinth', '#5bc0eb']
        : cubeHovered
          ? ['Cube targeted - pinch and hold', '#ffb36b']
          : cardPressed || this.cardConfirmationSeconds > 0
            ? ['Selection confirmed', '#9bc53d']
            : cardHovered
              ? ['Card targeted - pinch to select', '#5bc0eb']
              : ['Ready - look at a target', '#a7b0c0'];
    const statusKey = nextStatus.join(':');
    if (statusKey !== this.lastStatus) {
      this.interactionStatus?.setProperties({
        text: nextStatus[0],
        color: nextStatus[1],
      });
      this.lastStatus = statusKey;
    }
  }
}
