/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Pointer } from '@pmndrs/pointer-events';
import { Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { XROrigin } from '../rig/xr-origin.js';
import { CursorVisual } from './cursor-visual.js';
import { GrabPointer } from './grab-pointer.js';
import { RayPointer } from './ray-pointer.js';
import { TouchPointer } from './touch-pointer.js';

export type PointerKind = 'ray' | 'grab' | 'touch';

/**
 * Interactor state machine states
 */
export enum InteractorState {
  /** Pointer not registered or not enabled */
  DISABLED = 'disabled',
  /** Pointer enabled, no candidate */
  NORMAL = 'normal',
  /** Pointer has candidate, hovering over object */
  HOVER = 'hover',
  /** Pointer actively selecting object */
  SELECT = 'select',
}

/**
 * Priority order for pointer types (lower index = higher priority)
 */
const PRIORITY_ORDER: PointerKind[] = ['touch', 'grab', 'ray'];

/**
 * Hysteresis thresholds for touch pointer (in meters)
 */
const TOUCH_HYSTERESIS = {
  enterHoverDistance: 0.15, // 15cm - distance to start hover
  exitHoverDistance: 0.2, // 20cm - distance to end hover
};

const TOUCH_VISUAL_OFFSET_EPSILON_SQ = 0.000001;

type PointerEntry<T> = {
  pointer: Pointer;
  visual: T;
  registered: boolean;
};

/**
 * MultiPointer orchestrates multiple pointer types using priority-based selection.
 *
 * @remarks
 * - Priority order: Touch > Grab > Ray
 * - Uses state machine: DISABLED ↔ NORMAL ↔ HOVER ↔ SELECT
 * - Selection lock: Once a pointer starts selecting, it stays locked until release
 * - Hysteresis: Touch pointer uses separate enter/exit thresholds to prevent flickering
 *
 * @category Pointer
 */
export class MultiPointer {
  private ray: PointerEntry<RayPointer>;
  private grab: PointerEntry<GrabPointer>;
  private touch: PointerEntry<TouchPointer>;
  private cursorVisual: CursorVisual;

  /** Current active pointer kind (winner of priority selection) */
  private activeKind: PointerKind | null = null;

  /** State for each pointer type */
  private pointerStates: Map<PointerKind, InteractorState> = new Map();

  /** Hysteresis tracking: whether touch is currently in hover state */
  private touchHoverActive = false;

  /** Cached scene reference with type-specific descendants */
  private sceneWithDescendants: {
    interactableDescendants?: Object3D[];
    rayDescendants?: Object3D[];
    touchDescendants?: Object3D[];
    grabDescendants?: Object3D[];
  };

  /** Reusable native event object to avoid per-frame allocations */
  private readonly nativeEvent = { timeStamp: 0 };

  /** Reusable policy object for ray rendering */
  private readonly rayPolicy = { forceHideRay: false };

  /** Reusable event object for pointer down/up with button */
  private readonly buttonEvent = { timeStamp: 0, button: 0 };

  constructor(
    private readonly handedness: 'left' | 'right',
    private readonly scene: Object3D,
    private readonly camera: PerspectiveCamera,
    private readonly xrOrigin: XROrigin,
  ) {
    // Create all pointer instances
    const rayVisual = new RayPointer(
      this.camera,
      this.xrOrigin,
      this.handedness,
    );
    const grabVisual = new GrabPointer(
      this.camera,
      this.xrOrigin,
      this.handedness,
    );
    const touchVisual = new TouchPointer(
      this.camera,
      this.xrOrigin,
      this.handedness,
    );

    this.ray = {
      pointer: rayVisual.pointer,
      visual: rayVisual,
      registered: false,
    };
    this.grab = {
      pointer: grabVisual.pointer,
      visual: grabVisual,
      registered: false,
    };
    this.touch = {
      pointer: touchVisual.pointer,
      visual: touchVisual,
      registered: false,
    };

    // Cache scene reference for descendant swapping (avoids repeated casts)
    this.sceneWithDescendants = this.scene as typeof this.sceneWithDescendants;

    // Create shared cursor visual
    this.cursorVisual = new CursorVisual(
      xrOrigin,
      handedness === 'left' ? 0 : 1,
    );

    // Initialize states
    PRIORITY_ORDER.forEach((kind) => {
      this.pointerStates.set(kind, InteractorState.DISABLED);
    });

    // Enable ray and touch by default
    this.toggleSubPointer('ray', true);
    this.toggleSubPointer('touch', true);
  }

  /**
   * Main update loop - implements priority-based pointer selection
   */
  update(
    connected: boolean,
    delta: number,
    time: number,
    input?: {
      selectStart?: boolean;
      selectEnd?: boolean;
      squeezeStart?: boolean;
      squeezeEnd?: boolean;
    },
  ) {
    // Reuse nativeEvent object to avoid allocation
    this.nativeEvent.timeStamp = time * 1000;

    // Phase 1: Update enabled state for all registered pointers
    this.updatePointerEnabled(connected);

    // Phase 2: Check selection lock - if active pointer is selecting, stay locked
    const activePointer = this.getActivePointer();
    const activeState = activePointer
      ? this.pointerStates.get(this.activeKind!)
      : null;
    const isSelecting = activeState === InteractorState.SELECT;

    if (!isSelecting) {
      // Phase 3: Compute intersections for all enabled pointers
      this.computeAllIntersections();

      // Phase 4: Pick winner by priority
      this.pickActiveByPriority();
    } else {
      // Selection locked - only update the active pointer's intersection
      // Still use type-specific descendants for the locked pointer
      if (activePointer && this.activeKind) {
        this.movePointerWithDescendants(this.activeKind, activePointer);
      }
    }

    // Phase 5: Process lifecycle (state transitions)
    this.processLifecycle(input);

    // Phase 6: Update shared cursor from active pointer
    const anyPointerHasCapture =
      !!this.ray.pointer.getPointerCapture?.() ||
      !!this.grab.pointer.getPointerCapture?.() ||
      !!this.touch.pointer.getPointerCapture?.();

    if (this.activeKind && !anyPointerHasCapture) {
      const activeEntry = this.getEntry(this.activeKind);
      const intersection = activeEntry.pointer.getIntersection();
      const focused =
        this.pointerStates.get(this.activeKind) === InteractorState.SELECT;
      const visible = !!intersection && !intersection.object.isVoidObject;

      this.cursorVisual.setVisible(visible);
      if (visible && intersection) {
        this.cursorVisual.updateFromIntersection(intersection, delta, focused);
      }
    } else {
      this.cursorVisual.setVisible(false);
    }

    // Phase 7: Update visuals - reuse rayPolicy object
    this.rayPolicy.forceHideRay =
      this.activeKind !== 'ray' && this.activeKind !== null;
    this.ray.visual.update(
      connected && this.ray.registered,
      delta,
      time,
      !!input?.selectStart,
      !!input?.selectEnd,
      this.rayPolicy,
    );
    this.grab.visual.update(
      connected && this.grab.registered,
      delta,
      time,
      !!input?.squeezeStart,
      !!input?.squeezeEnd,
    );
    this.touch.visual.update(
      connected && this.touch.registered,
      delta,
      time,
      false,
      false,
    );
  }

  /**
   * Update enabled state for all registered pointers
   */
  private updatePointerEnabled(connected: boolean) {
    // Process ray pointer
    this.updateSinglePointerEnabled('ray', this.ray, connected);
    // Process grab pointer
    this.updateSinglePointerEnabled('grab', this.grab, connected);
    // Process touch pointer
    this.updateSinglePointerEnabled('touch', this.touch, connected);
  }

  /**
   * Update enabled state for a single pointer (avoids array allocation)
   */
  private updateSinglePointerEnabled(
    kind: PointerKind,
    entry: PointerEntry<RayPointer | GrabPointer | TouchPointer>,
    connected: boolean,
  ) {
    const shouldBeEnabled = connected && entry.registered;
    const currentState = this.pointerStates.get(kind)!;
    const isEnabled = currentState !== InteractorState.DISABLED;

    if (shouldBeEnabled && !isEnabled) {
      entry.pointer.setEnabled(true, this.nativeEvent, false);
      this.pointerStates.set(kind, InteractorState.NORMAL);
    } else if (!shouldBeEnabled && isEnabled) {
      entry.pointer.setEnabled(false, this.nativeEvent, true);
      this.pointerStates.set(kind, InteractorState.DISABLED);
      // Clear active if this was the active pointer
      if (this.activeKind === kind) {
        this.activeKind = null;
      }
    }
  }

  /**
   * Compute intersections for all enabled pointers using type-specific descendant arrays.
   * Swaps scene.interactableDescendants per pointer type for optimized traversal.
   */
  private computeAllIntersections() {
    // Store original descendants once
    const originalDescendants =
      this.sceneWithDescendants.interactableDescendants;

    // Process each pointer with its type-specific descendants
    // Ray pointer
    if (this.pointerStates.get('ray') !== InteractorState.DISABLED) {
      this.sceneWithDescendants.interactableDescendants =
        this.sceneWithDescendants.rayDescendants;
      this.ray.pointer.move(this.scene, this.nativeEvent);
    }

    // Grab pointer
    if (this.pointerStates.get('grab') !== InteractorState.DISABLED) {
      this.sceneWithDescendants.interactableDescendants =
        this.sceneWithDescendants.grabDescendants;
      this.grab.pointer.move(this.scene, this.nativeEvent);
    }

    // Touch pointer
    if (this.pointerStates.get('touch') !== InteractorState.DISABLED) {
      this.sceneWithDescendants.interactableDescendants =
        this.sceneWithDescendants.touchDescendants;
      this.touch.pointer.move(this.scene, this.nativeEvent);
    }

    // Restore original descendants
    this.sceneWithDescendants.interactableDescendants = originalDescendants;
  }

  /**
   * Move a single pointer using its type-specific descendants.
   * Used when selection is locked to avoid unnecessary traversal.
   */
  private movePointerWithDescendants(kind: PointerKind, pointer: Pointer) {
    const originalDescendants =
      this.sceneWithDescendants.interactableDescendants;

    switch (kind) {
      case 'ray':
        this.sceneWithDescendants.interactableDescendants =
          this.sceneWithDescendants.rayDescendants;
        break;
      case 'grab':
        this.sceneWithDescendants.interactableDescendants =
          this.sceneWithDescendants.grabDescendants;
        break;
      case 'touch':
        this.sceneWithDescendants.interactableDescendants =
          this.sceneWithDescendants.touchDescendants;
        break;
    }

    pointer.move(this.scene, this.nativeEvent);
    this.sceneWithDescendants.interactableDescendants = originalDescendants;
  }

  /**
   * Pick active pointer by priority - first with valid candidate wins
   */
  private pickActiveByPriority() {
    let newActiveKind: PointerKind | null = null;

    for (const kind of PRIORITY_ORDER) {
      const state = this.pointerStates.get(kind)!;
      if (state === InteractorState.DISABLED) {
        continue;
      }

      if (this.hasValidCandidate(kind)) {
        newActiveKind = kind;
        break;
      }
    }

    // Switch active pointer if changed
    if (newActiveKind !== this.activeKind) {
      this.switchActivePointer(newActiveKind);
    }
  }

  /**
   * Check if a pointer has a valid candidate (intersection)
   */
  private hasValidCandidate(kind: PointerKind): boolean {
    const entry = this.getEntry(kind);
    const intersection = entry.pointer.getIntersection();

    // No intersection or void object = no candidate
    if (!intersection || intersection.object.isVoidObject) {
      // For touch, update hysteresis state
      if (kind === 'touch') {
        this.touchHoverActive = false;
      }
      return false;
    }

    // For touch pointer, apply hysteresis
    if (kind === 'touch') {
      const threshold = this.touchHoverActive
        ? TOUCH_HYSTERESIS.exitHoverDistance
        : TOUCH_HYSTERESIS.enterHoverDistance;

      if (intersection.distance > threshold) {
        // Outside threshold
        if (!this.touchHoverActive) {
          return false;
        }
        // Was hovering but now outside exit threshold
        this.touchHoverActive = false;
        return false;
      }

      // Within threshold
      this.touchHoverActive = true;
      return true;
    }

    // For ray and grab, any valid intersection is a candidate
    return true;
  }

  /**
   * Switch active pointer to a new kind
   */
  private switchActivePointer(newKind: PointerKind | null) {
    // Disable previous active pointer (but keep it enabled in the pointer system)
    if (this.activeKind && this.activeKind !== newKind) {
      const prevState = this.pointerStates.get(this.activeKind)!;
      if (prevState === InteractorState.HOVER) {
        this.pointerStates.set(this.activeKind, InteractorState.NORMAL);
      }
    }

    this.activeKind = newKind;

    // Update new active pointer state
    if (newKind) {
      const state = this.pointerStates.get(newKind)!;
      if (state === InteractorState.NORMAL) {
        this.pointerStates.set(newKind, InteractorState.HOVER);
      }
    }
  }

  /**
   * Process lifecycle transitions based on input
   */
  private processLifecycle(input?: {
    selectStart?: boolean;
    selectEnd?: boolean;
    squeezeStart?: boolean;
    squeezeEnd?: boolean;
  }) {
    if (!this.activeKind) {
      return;
    }

    const entry = this.getEntry(this.activeKind);
    const state = this.pointerStates.get(this.activeKind)!;

    switch (this.activeKind) {
      case 'touch':
        // Touch auto-selects based on distance
        this.processTouchLifecycle(entry, state);
        break;

      case 'grab':
        // Grab uses squeeze button
        this.processButtonLifecycle(
          entry,
          state,
          !!input?.squeezeStart,
          !!input?.squeezeEnd,
          2, // button 2 for squeeze
        );
        break;

      case 'ray':
        // Ray uses select button
        this.processButtonLifecycle(
          entry,
          state,
          !!input?.selectStart,
          !!input?.selectEnd,
          0, // button 0 for select
        );
        break;
    }
  }

  /**
   * Process touch pointer lifecycle - auto-selects based on distance
   */
  private processTouchLifecycle(
    entry: PointerEntry<TouchPointer>,
    state: InteractorState,
  ) {
    const intersection = entry.pointer.getIntersection();
    if (!intersection || intersection.object.isVoidObject) {
      // Lost candidate - transition to NORMAL
      if (state === InteractorState.SELECT) {
        // Force release if touch was selecting when intersection was lost
        this.buttonEvent.timeStamp = this.nativeEvent.timeStamp;
        this.buttonEvent.button = 0;
        entry.pointer.up(this.buttonEvent);
      }
      if (state === InteractorState.HOVER || state === InteractorState.SELECT) {
        this.pointerStates.set('touch', InteractorState.NORMAL);
      }
      return;
    }

    // Touch auto-selection is handled by the pointer's onMoveCommited callback
    // (createTouchPointer sets this up). We just need to track the state.

    // Check if pointer is currently selecting (has buttons down)
    const isSelecting = entry.pointer.getButtonsDown().size > 0;

    if (state === InteractorState.HOVER && isSelecting) {
      this.pointerStates.set('touch', InteractorState.SELECT);
    } else if (state === InteractorState.SELECT && !isSelecting) {
      this.pointerStates.set('touch', InteractorState.HOVER);
    } else if (state === InteractorState.NORMAL) {
      this.pointerStates.set('touch', InteractorState.HOVER);
    }
  }

  /**
   * Process button-based pointer lifecycle (ray/grab)
   */
  private processButtonLifecycle(
    entry: PointerEntry<RayPointer | GrabPointer>,
    state: InteractorState,
    buttonDown: boolean,
    buttonUp: boolean,
    button: number,
  ) {
    const intersection = entry.pointer.getIntersection();
    if (!intersection || intersection.object.isVoidObject) {
      // Lost candidate - can happen during selection (pointer capture handles this)
      if (state === InteractorState.HOVER) {
        this.pointerStates.set(this.activeKind!, InteractorState.NORMAL);
      }
      return;
    }

    // HOVER → SELECT on button down
    if (state === InteractorState.HOVER && buttonDown) {
      this.buttonEvent.timeStamp = this.nativeEvent.timeStamp;
      this.buttonEvent.button = button;
      entry.pointer.down(this.buttonEvent);
      this.pointerStates.set(this.activeKind!, InteractorState.SELECT);
    }
    // SELECT → HOVER on button up
    else if (state === InteractorState.SELECT && buttonUp) {
      this.buttonEvent.timeStamp = this.nativeEvent.timeStamp;
      this.buttonEvent.button = button;
      entry.pointer.up(this.buttonEvent);
      this.pointerStates.set(this.activeKind!, InteractorState.HOVER);
    }
    // NORMAL → HOVER when we have a candidate
    else if (state === InteractorState.NORMAL) {
      this.pointerStates.set(this.activeKind!, InteractorState.HOVER);
    }
  }

  /**
   * Get the policy for ray visual rendering
   */
  getPolicyForRay() {
    // Hide ray when touch or grab is active
    const hideRay = this.activeKind !== 'ray' && this.activeKind !== null;
    return { forceHideRay: hideRay };
    // Cursor is now managed by MultiPointer, not RayPointer
  }

  /**
   * Check if ray is busy (has intersection)
   */
  getRayBusy(): boolean {
    return !!this.ray.visual.busy;
  }

  /**
   * Toggle a sub-pointer on/off
   */
  toggleSubPointer(kind: PointerKind, enabled: boolean): boolean {
    const entry = this.getEntry(kind);
    if (entry.registered === enabled) {
      return false;
    }
    entry.registered = enabled;
    if (!enabled) {
      this.pointerStates.set(kind, InteractorState.DISABLED);
      if (this.activeKind === kind) {
        this.activeKind = null;
      }
      if (kind === 'touch') {
        this.touchHoverActive = false;
      }
    }
    return true;
  }

  /**
   * Get the registration state of a sub-pointer
   */
  getSubPointerState(kind: PointerKind): { registered: boolean } {
    const entry = this.getEntry(kind);
    return { registered: entry.registered };
  }

  /**
   * Get the currently active pointer kind
   */
  getActiveKind(): PointerKind | null {
    return this.activeKind;
  }

  /**
   * Computes a world-space offset that keeps the hand visual's fingertip on the
   * touched surface while the touch pointer is actively selecting.
   */
  getTouchSurfaceVisualOffset(target: Vector3 = new Vector3()): Vector3 | null {
    if (this.activeKind !== 'touch') {
      return null;
    }

    if (this.pointerStates.get('touch') !== InteractorState.SELECT) {
      return null;
    }

    const intersection = this.touch.pointer.getIntersection();
    if (
      !intersection ||
      intersection.object.isVoidObject ||
      intersection.details.type !== 'sphere'
    ) {
      return null;
    }

    target.copy(intersection.pointOnFace).sub(intersection.pointerPosition);
    if (target.lengthSq() < TOUCH_VISUAL_OFFSET_EPSILON_SQ) {
      return null;
    }

    return target;
  }

  /**
   * Get the currently active pointer
   */
  getActivePointer(): Pointer | null {
    if (!this.activeKind) {
      return null;
    }
    return this.getEntry(this.activeKind).pointer;
  }

  /**
   * Get a specific pointer by kind
   */
  getPointer(kind: PointerKind): Pointer {
    return this.getEntry(kind).pointer;
  }

  /**
   * Route a down event to a specific pointer target.
   * Used by grab-system for hand pinch gestures.
   */
  routeDown(
    kind: 'select' | 'squeeze' | 'custom',
    target: 'ray' | 'grab' | 'active',
    nativeEvent: { timeStamp: number },
  ) {
    const ptr = this.pickTarget(target);
    if (!ptr) {
      return;
    }
    const button = kind === 'select' ? 0 : 2;
    ptr.down({ button, timeStamp: nativeEvent.timeStamp });
  }

  /**
   * Route an up event to a specific pointer target.
   * Used by grab-system for hand pinch gestures.
   */
  routeUp(
    kind: 'select' | 'squeeze' | 'custom',
    target: 'ray' | 'grab' | 'active',
    nativeEvent: { timeStamp: number },
  ) {
    const ptr = this.pickTarget(target);
    if (!ptr) {
      return;
    }
    const button = kind === 'select' ? 0 : 2;
    ptr.up({ button, timeStamp: nativeEvent.timeStamp });
  }

  /**
   * Pick pointer by target type.
   */
  private pickTarget(target: 'ray' | 'grab' | 'active'): Pointer | undefined {
    if (target === 'active') {
      // Prefer captured pointer if any, else fall back to active or ray
      if (this.ray.pointer.getPointerCapture?.()) {
        return this.ray.pointer;
      }
      if (this.grab.pointer.getPointerCapture?.()) {
        return this.grab.pointer;
      }
      if (this.touch.pointer.getPointerCapture?.()) {
        return this.touch.pointer;
      }
      // Fall back to active pointer or ray
      return this.activeKind
        ? this.getEntry(this.activeKind).pointer
        : this.ray.pointer;
    }
    if (target === 'ray') {
      return this.ray.pointer;
    }
    return this.grab.pointer;
  }

  /**
   * Get the entry for a pointer kind
   */
  private getEntry(
    kind: PointerKind,
  ): PointerEntry<RayPointer | GrabPointer | TouchPointer> {
    switch (kind) {
      case 'ray':
        return this.ray;
      case 'grab':
        return this.grab;
      case 'touch':
        return this.touch;
    }
  }

  /**
   * Dispose of all pointer resources.
   * Call this when the MultiPointer is no longer needed.
   */
  dispose(): void {
    // Dispose cursor visual
    this.cursorVisual.dispose();

    // Dispose ray pointer (has geometry/material)
    this.ray.visual.dispose();

    // Clear state
    this.pointerStates.clear();
    this.activeKind = null;
  }
}
