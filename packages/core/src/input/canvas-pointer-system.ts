/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { isObjectTreeVisible } from '@iwsdk/xr-input';
import { forwardHtmlEvents } from '@pmndrs/pointer-events';
import { effect } from '@preact/signals-core';
// Keep this leaf system out of the ecs/index -> World -> init barrel cycle.
import { Types } from '../ecs/component.js';
import { createSystem } from '../ecs/system.js';
import { Object3D } from '../runtime/index.js';
import type { ScenePointerDescendants } from '../runtime/scene-pointer-descendants.js';

export class CanvasPointerSystem extends createSystem(
  {},
  {
    /** Forward DOM pointer events from the renderer canvas into the Three scene. */
    enabled: { type: Types.Boolean, default: true },
    /** Continue forwarding pointer events while an immersive XR session is active. */
    activeDuringXR: { type: Types.Boolean, default: false },
  },
) {
  private htmlHandler?: {
    destroy: () => void;
    update: () => void;
  };
  private readonly canvasPointerRoot = new Object3D();
  private readonly canvasPointerTraversalMarker = new Object3D();
  private readonly canvasPointerDescendants: Object3D[] = [];
  private xrSessionActive = false;

  init(): void {
    // @pmndrs/pointer-events returns early for childless objects before
    // reading interactableDescendants, so keep this synthetic root traversable.
    this.canvasPointerRoot.add(this.canvasPointerTraversalMarker);
    this.xrSessionActive =
      this.world.session != null || this.xrManager.getSession() != null;
    const onSessionStart = () => {
      this.xrSessionActive = true;
      this.syncHtmlHandler();
    };
    const onSessionEnd = () => {
      this.xrSessionActive = false;
      this.syncHtmlHandler();
    };
    this.xrManager.addEventListener('sessionstart', onSessionStart);
    this.xrManager.addEventListener('sessionend', onSessionEnd);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onSessionStart),
      () => this.xrManager.removeEventListener('sessionend', onSessionEnd),
      effect(() => {
        this.config.enabled.value;
        this.config.activeDuringXR.value;
        this.syncHtmlHandler();
      }),
    );
  }

  update(): void {
    if (!this.htmlHandler) {
      return;
    }
    this.prepareCanvasPointerRoot();
    this.htmlHandler.update();
  }

  private syncHtmlHandler(): void {
    this.htmlHandler?.destroy();
    this.htmlHandler = undefined;
    this.clearCanvasPointerRoot();
    if (
      !this.config.enabled.value ||
      (this.xrSessionActive && !this.config.activeDuringXR.value)
    ) {
      return;
    }
    this.prepareCanvasPointerRoot();
    this.htmlHandler = forwardHtmlEvents(
      this.renderer.domElement,
      () => this.camera,
      this.canvasPointerRoot,
      {
        batchEvents: false,
        filter: isObjectTreeVisible,
      },
    );
  }

  private prepareCanvasPointerRoot(): void {
    const scene = this.scene as typeof this.scene & ScenePointerDescendants;
    const root = this.canvasPointerRoot as Object3D & ScenePointerDescendants;
    const rayDescendants =
      scene.rayDescendants ?? scene.interactableDescendants;
    const screenSpaceDescendants = scene.screenSpaceDescendants;

    this.canvasPointerDescendants.length = 0;
    if (rayDescendants || screenSpaceDescendants) {
      this.pushDescendants(rayDescendants);
      this.pushDescendants(screenSpaceDescendants);
      root.interactableDescendants = this.canvasPointerDescendants;
      return;
    }

    this.canvasPointerDescendants.push(this.scene);
    root.interactableDescendants = this.canvasPointerDescendants;
  }

  private pushDescendants(descendants: Object3D[] | undefined): void {
    if (!descendants) {
      return;
    }
    this.canvasPointerDescendants.push(...descendants);
  }

  private clearCanvasPointerRoot(): void {
    const root = this.canvasPointerRoot as Object3D & ScenePointerDescendants;
    root.interactableDescendants = undefined;
    this.canvasPointerDescendants.length = 0;
  }

  destroy(): void {
    super.destroy();
    this.htmlHandler?.destroy();
    this.htmlHandler = undefined;
    this.clearCanvasPointerRoot();
    this.canvasPointerRoot.remove(this.canvasPointerTraversalMarker);
  }
}
