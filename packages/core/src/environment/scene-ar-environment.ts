/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Object3D, Scene, WebGLRenderer } from '../runtime/index.js';

export interface ResolvedSceneAREnvironment {
  isAR: boolean;
  background: 'transparent' | 'environment';
}

export interface SceneAREnvironmentUpdate {
  session?: XRSession | null;
  authoredBackgrounds?: readonly Object3D[];
}

/** Resolve the fixed transparent-background policy against the active session. */
export function resolveSceneAREnvironment(
  session: XRSession | null | undefined,
): ResolvedSceneAREnvironment {
  const blendMode = session?.environmentBlendMode;
  const isAR = blendMode === 'alpha-blend' || blendMode === 'additive';

  if (!isAR) {
    return { isAR: false, background: 'environment' };
  }

  return {
    isAR: true,
    background: 'transparent',
  };
}

/**
 * Applies reversible AR-only background overrides.
 *
 * Entering AR snapshots the visible environment, hides it for passthrough,
 * and restores it exactly when the session ends.
 */
export class SceneAREnvironmentController {
  private backgroundSuppressed = false;
  private backgroundBase: Scene['background'] = null;
  private clearAlphaBase = 1;
  private readonly authoredBackgroundVisibility = new Map<Object3D, boolean>();

  constructor(
    private readonly scene: Scene,
    private readonly renderer: WebGLRenderer,
  ) {}

  update(update: SceneAREnvironmentUpdate): ResolvedSceneAREnvironment {
    const policy = resolveSceneAREnvironment(update.session);

    this.updateBackground(policy.isAR, update.authoredBackgrounds ?? []);
    return policy;
  }

  restore(): void {
    this.restoreBackground();
    this.restoreObjectVisibility(this.authoredBackgroundVisibility);
  }

  private updateBackground(
    suppress: boolean,
    authoredBackgrounds: readonly Object3D[],
  ): void {
    if (!suppress) {
      this.restoreBackground();
      this.restoreObjectVisibility(this.authoredBackgroundVisibility);
      return;
    }

    if (!this.backgroundSuppressed) {
      this.backgroundBase = this.scene.background;
      this.clearAlphaBase = this.renderer.getClearAlpha();
      this.backgroundSuppressed = true;
    } else {
      if (this.scene.background !== null) {
        this.backgroundBase = this.scene.background;
      }
      const clearAlpha = this.renderer.getClearAlpha();
      if (clearAlpha !== 0) {
        this.clearAlphaBase = clearAlpha;
      }
    }

    this.scene.background = null;
    this.renderer.setClearAlpha(0);
    this.suppressObjectVisibility(
      authoredBackgrounds,
      this.authoredBackgroundVisibility,
    );
  }

  private restoreBackground(): void {
    if (!this.backgroundSuppressed) {
      return;
    }
    this.scene.background = this.backgroundBase;
    this.renderer.setClearAlpha(this.clearAlphaBase);
    this.backgroundSuppressed = false;
  }

  private suppressObjectVisibility(
    objects: Iterable<Object3D>,
    visibility: Map<Object3D, boolean>,
  ): void {
    for (const object of objects) {
      if (!visibility.has(object)) {
        visibility.set(object, object.visible);
      }
      object.visible = false;
    }
  }

  private restoreObjectVisibility(visibility: Map<Object3D, boolean>): void {
    for (const [object, wasVisible] of visibility) {
      object.visible = wasVisible;
    }
    visibility.clear();
  }
}
