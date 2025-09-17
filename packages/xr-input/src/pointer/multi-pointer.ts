/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CombinedPointer, Pointer } from '@pmndrs/pointer-events';
import type { Object3D, PerspectiveCamera } from 'three';
import type { XROrigin } from '../rig/xr-origin.js';
import { GrabPointer } from './grab-pointer.js';
import { RayPointer } from './ray-pointer.js';

export type PointerKind = 'ray' | 'grab' | 'custom';

type Registered = {
  kind: PointerKind;
  pointer: Pointer;
  unregister: () => void;
};

export class MultiPointer {
  private readonly combined: CombinedPointer;
  private readonly registered: Registered[] = [];
  private ray?: {
    pointer: Pointer;
    visual: RayPointer;
    registered: boolean;
    unregister?: () => void;
  };
  private grab?: {
    pointer: Pointer;
    visual: GrabPointer;
    registered: boolean;
    unregister?: () => void;
  };
  private defaultKind: PointerKind = 'ray';

  constructor(
    private readonly handedness: 'left' | 'right',
    private readonly scene: Object3D,
    private readonly camera: PerspectiveCamera,
    private readonly xrOrigin: XROrigin,
  ) {
    this.combined = new CombinedPointer(false);
    // Build built-ins (register only ray by default)
    const ray = new RayPointer(this.camera, this.xrOrigin, this.handedness);
    const grab = new GrabPointer(this.camera, this.xrOrigin, this.handedness);
    this.ray = { pointer: ray.pointer, visual: ray, registered: false };
    this.grab = { pointer: grab.pointer, visual: grab, registered: false };
    this.toggleSubPointer('ray', true);
  }

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
    const timeStamp = time * 1000;
    this.combined.setEnabled(connected, { timeStamp });
    this.combined.move(this.scene, { timeStamp });

    // Visuals policy for ray
    const policy = this.getPolicyForRay();
    this.ray?.visual.update(
      connected,
      delta,
      time,
      !!input?.selectStart,
      !!input?.selectEnd,
      policy,
    );

    // Emit down/up based on input
    if (this.grab?.registered) {
      if (input?.squeezeStart) {
        this.routeDown('squeeze', 'grab', { timeStamp });
      }
      if (input?.squeezeEnd) {
        this.routeUp('squeeze', 'grab', { timeStamp });
      }
    }
    if (input?.selectStart) {
      this.routeDown('select', 'ray', { timeStamp });
    }
    if (input?.selectEnd) {
      this.routeUp('select', 'ray', { timeStamp });
    }
  }

  getPolicyForRay() {
    const rayCaptured = !!this.ray?.pointer.getPointerCapture?.();
    const nonRayCaptured = this.registered.some(
      (r) => r.kind !== 'ray' && !!(r.pointer as any).getPointerCapture?.(),
    );
    // Policy
    // - if ray captured → show ray, hide cursor
    // - else if other captured → hide both
    // - else → show both as usual
    return {
      forceHideRay: nonRayCaptured && !rayCaptured,
      forceHideCursor: rayCaptured || nonRayCaptured,
    };
  }

  getRayBusy(): boolean {
    return !!this.ray?.visual.busy;
  }

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

  private pickTarget(target: 'ray' | 'grab' | 'active'): Pointer | undefined {
    if (target === 'active') {
      // Prefer captured pointer if any, else fall back to ray
      const captured = this.registered.find(
        (r) => !!(r.pointer as any).getPointerCapture?.(),
      );
      if (captured) {
        return captured.pointer;
      }
      return this.ray?.pointer;
    }
    if (target === 'ray') {
      return this.ray?.pointer;
    }
    return (
      this.grab?.pointer ??
      this.registered.find((r) => r.kind === 'grab')?.pointer
    );
  }

  // Public toggle API
  toggleSubPointer(kind: PointerKind, enabled: boolean): boolean {
    const entry = kind === 'ray' ? this.ray : this.grab;
    if (!entry) {
      return false;
    }
    if (enabled && !entry.registered) {
      const isDefault = kind === this.defaultKind;
      const unregister = this.combined.register(entry.pointer, isDefault);
      this.registered.push({ kind, pointer: entry.pointer, unregister });
      entry.unregister = unregister;
      entry.registered = true;
      return true;
    } else if (!enabled && entry.registered) {
      entry.unregister?.();
      entry.unregister = undefined;
      entry.registered = false;
      const idx = this.registered.findIndex((r) => r.pointer === entry.pointer);
      if (idx >= 0) {
        this.registered.splice(idx, 1);
      }
      return true;
    }
    return false;
  }

  getSubPointerState(kind: PointerKind): { registered: boolean } {
    const entry = kind === 'ray' ? this.ray : this.grab;
    return { registered: !!entry?.registered };
  }

  setDefault(kind: PointerKind) {
    this.defaultKind = kind;
    // Re-register current pointers to update default preference
    const snapshot = [...this.registered];
    // Unregister all
    snapshot.forEach((r) => r.unregister());
    this.registered.length = 0;
    // Re-register in same order with updated isDefault flags
    if (this.ray) {
      if (this.ray.registered) {
        const unregister = this.combined.register(
          this.ray.pointer,
          this.defaultKind === 'ray',
        );
        this.registered.push({
          kind: 'ray',
          pointer: this.ray.pointer,
          unregister,
        });
        this.ray.unregister = unregister;
      }
    }
    if (this.grab) {
      if (this.grab.registered) {
        const unregister = this.combined.register(
          this.grab.pointer,
          this.defaultKind === 'grab',
        );
        this.registered.push({
          kind: 'grab',
          pointer: this.grab.pointer,
          unregister,
        });
        this.grab.unregister = unregister;
      }
    }
  }
}
