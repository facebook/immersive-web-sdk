/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PointerEvent, PointerEventsMap } from '@pmndrs/pointer-events';
import { Types } from '../ecs/component.js';
import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { VisibilityState } from '../ecs/world.js';
import { DistanceGrabbable } from '../grab/distance-grabbable.js';
import { OneHandGrabbable } from '../grab/one-hand-grabbable.js';
import { TwoHandsGrabbable } from '../grab/two-hands-grabbable.js';
import { Mesh, Object3D, Object3DEventMap } from '../runtime/index.js';
import { Transform } from '../transform/index.js';
import {
  Hovered,
  PokeInteractable,
  Pressed,
  RayInteractable,
} from './state-tags.js';

/**
 * Samples XR poses (hands/controllers/head) and gamepads, curates the set of
 * interactables for pointer raycasting, and attaches minimal event listeners.
 *
 * @remarks
 * - Scheduled after player movement so pointers reflect updated transforms.
 * - Maintains type-specific descendant arrays for optimized pointer intersection.
 * - Adds transient `Hovered` / `Pressed` tags so other systems can react declaratively.
 *
 * @category Input
 * @example React to Hovered / Pressed
 * ```ts
 * export class HighlightSystem extends createSystem({
 *   items: { required: [RayInteractable] }
 * }) {
 *   update() {
 *     this.queries.items.entities.forEach(e => {
 *       e.object3D.visible = !e.hasComponent(Pressed);
 *     })
 *   }
 * }
 * ```
 */
export class InputSystem extends createSystem(
  {
    /** Entities interactable via ray pointer */
    rayInteractables: { required: [RayInteractable, Transform] },
    /** Entities interactable via touch/poke pointer */
    pokeInteractables: { required: [PokeInteractable, Transform] },
    /** One-hand grabbable entities */
    oneHandGrabbables: { required: [OneHandGrabbable, Transform] },
    /** Two-hands grabbable entities */
    twoHandsGrabbables: { required: [TwoHandsGrabbable, Transform] },
    /** Distance grabbable entities */
    distanceGrabbables: { required: [DistanceGrabbable, Transform] },
  },
  {
    /** Keep pointer target lists available outside immersive XR for browser canvas input. */
    maintainScenePointers: { type: Types.Boolean, default: false },
  },
) {
  /** Descendants for ray pointer intersection */
  private rayDescendants: Object3D[] = [];
  /** Descendants for touch/poke pointer intersection */
  private touchDescendants: Object3D[] = [];
  /** Descendants for grab pointer intersection */
  private grabDescendants: Object3D[] = [];

  private shouldSetIntersectables = false;
  private listeners = new WeakMap<
    Object3D,
    {
      enter: (e: any) => void;
      leave: (e: any) => void;
      down: (e: any) => void;
      up: (e: any) => void;
    }
  >();
  private lastBVHUpdate = new WeakMap<Object3D, number>();

  init(): void {
    this.shouldSetIntersectables =
      this.visibilityState.value === VisibilityState.Visible ||
      this.config.maintainScenePointers.value;
    // React to XR visibility for enabling scoped intersections
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((value) => {
        this.shouldSetIntersectables =
          value === VisibilityState.Visible ||
          this.config.maintainScenePointers.value;
      }),
    );

    // Wire pointer event listeners on qualify; tear them down on disqualify.
    // Descendant arrays are rebuilt every frame, so no dirty bookkeeping here.
    // Register the query subscriptions on cleanupFuncs so they're released on
    // system teardown (matching the visibilityState subscription above).
    this.cleanupFuncs.push(
      this.queries.rayInteractables.subscribe('qualify', (entity) => {
        this.setupEventListeners(entity);
      }),
      this.queries.rayInteractables.subscribe('disqualify', (entity) => {
        this.cleanupEventListeners(entity);
      }),

      this.queries.pokeInteractables.subscribe('qualify', (entity) => {
        this.setupEventListeners(entity);
        // Enable touch pointers when first poke interactable appears
        this.input.xr.multiPointers.left.toggleSubPointer('touch', true);
        this.input.xr.multiPointers.right.toggleSubPointer('touch', true);
      }),
      this.queries.pokeInteractables.subscribe('disqualify', (entity) => {
        this.cleanupEventListeners(entity);
        // Disable touch pointers when no poke interactables remain
        if (this.queries.pokeInteractables.entities.size === 0) {
          this.input.xr.multiPointers.left.toggleSubPointer('touch', false);
          this.input.xr.multiPointers.right.toggleSubPointer('touch', false);
        }
      }),
    );

    // Enable touch pointer if there are already poke interactables
    if (this.queries.pokeInteractables.entities.size > 0) {
      this.input.xr.multiPointers.left.toggleSubPointer('touch', true);
      this.input.xr.multiPointers.right.toggleSubPointer('touch', true);
    }
  }

  update(delta: number, time: number): void {
    // Update input sampling first
    this.input.update(this.xrManager, delta, time);

    // Rebuild interactable descendant arrays every frame so newly parented
    // entities (TransformSystem runs at priority 0, after this system at -4)
    // become hit-testable on the same frame they're created.
    this.updateDescendantArrays();
  }

  /**
   * Update per-type descendant arrays for optimized pointer intersection
   */
  private updateDescendantArrays(): void {
    // Clear arrays
    this.rayDescendants.length = 0;
    this.touchDescendants.length = 0;
    this.grabDescendants.length = 0;

    if (!this.shouldSetIntersectables) {
      // Clear all descendant arrays on scene
      (this.scene as any).interactableDescendants = undefined;
      (this.scene as any).rayDescendants = undefined;
      (this.scene as any).touchDescendants = undefined;
      (this.scene as any).grabDescendants = undefined;
      return;
    }

    // Collect ray interactables + distance grabbables (both use ray)
    for (const entity of this.queries.rayInteractables.entities) {
      const obj = entity.object3D;
      if (obj) {
        this.rayDescendants.push(obj);
      }
    }
    for (const entity of this.queries.distanceGrabbables.entities) {
      const obj = entity.object3D;
      if (obj && !this.rayDescendants.includes(obj)) {
        this.rayDescendants.push(obj);
      }
    }

    // Collect poke/touch interactables
    for (const entity of this.queries.pokeInteractables.entities) {
      const obj = entity.object3D;
      if (obj) {
        this.touchDescendants.push(obj);
      }
    }

    // Collect grab interactables (oneHand + twoHands)
    for (const entity of this.queries.oneHandGrabbables.entities) {
      const obj = entity.object3D;
      if (obj) {
        this.grabDescendants.push(obj);
      }
    }
    for (const entity of this.queries.twoHandsGrabbables.entities) {
      const obj = entity.object3D;
      if (obj && !this.grabDescendants.includes(obj)) {
        this.grabDescendants.push(obj);
      }
    }

    // Set type-specific arrays on scene
    (this.scene as any).rayDescendants = this.rayDescendants;
    (this.scene as any).touchDescendants = this.touchDescendants;
    (this.scene as any).grabDescendants = this.grabDescendants;

    // Also set legacy interactableDescendants as union for backwards compatibility
    const allDescendants = new Set<Object3D>([
      ...this.rayDescendants,
      ...this.touchDescendants,
      ...this.grabDescendants,
    ]);
    (this.scene as any).interactableDescendants = Array.from(allDescendants);
  }

  private setupEventListeners(entity: Entity): void {
    const object3D = entity.object3D as Object3D<
      Object3DEventMap & PointerEventsMap
    >;
    if (!object3D) {
      return;
    }

    // Skip if already has listeners
    if (this.listeners.has(object3D)) {
      return;
    }

    // Compute BVH for all meshes in the entity hierarchy for fast raycasting
    this.computeBoundsTreeForEntity(object3D);

    // Enable pointer events for raycasting
    (object3D as any).pointerEvents = 'auto';

    // Throttled subtree BVH refresh helper
    const maybeRefreshBVH = () => {
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      const last = this.lastBVHUpdate.get(object3D) ?? 0;
      if (now - last > 250) {
        this.computeBoundsTreeForEntity(object3D);
        this.lastBVHUpdate.set(object3D, now);
      }
    };

    const enter = (event: PointerEvent) => {
      event.stopPropagation();
      maybeRefreshBVH();
      if (!entity.hasComponent(Hovered)) {
        entity.addComponent(Hovered);
      }
    };
    const leave = (event: PointerEvent) => {
      event.stopPropagation();
      entity.removeComponent(Hovered);
      // pointerleave can fire without a preceding pointerup for flat geometry
      // (poke sphere exits intersection in one frame); clear Pressed defensively.
      entity.removeComponent(Pressed);
    };
    const down = (event: PointerEvent) => {
      event.stopPropagation();
      maybeRefreshBVH();
      if (!entity.hasComponent(Pressed)) {
        entity.addComponent(Pressed);
      }
    };
    const up = (event: PointerEvent) => {
      event.stopPropagation();
      entity.removeComponent(Pressed);
    };

    this.listeners.set(object3D, { enter, leave, down, up });
    (object3D as any).addEventListener('pointerenter', enter);
    (object3D as any).addEventListener('pointerleave', leave);
    (object3D as any).addEventListener('pointerdown', down);
    (object3D as any).addEventListener('pointerup', up);
  }

  private computeBoundsTreeForEntity(object3D: Object3D): void {
    object3D.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        if ((mesh as any).geometry && !(mesh as any).geometry.boundsTree) {
          try {
            (mesh as any).geometry.computeBoundsTree();
          } catch (error) {
            console.warn(
              `[InputSystem] Failed to compute BVH for ${mesh.name || 'unnamed'}:`,
              error,
            );
          }
        }
      }
    });
  }

  private cleanupEventListeners(entity: Entity): void {
    const object3D = entity.object3D as any;
    if (!object3D) {
      return;
    }
    const fns = this.listeners.get(object3D);
    if (fns) {
      object3D.removeEventListener('pointerenter', fns.enter);
      object3D.removeEventListener('pointerleave', fns.leave);
      object3D.removeEventListener('pointerdown', fns.down);
      object3D.removeEventListener('pointerup', fns.up);
      this.listeners.delete(object3D);
    }
    entity.removeComponent(Hovered).removeComponent(Pressed);
  }
}
