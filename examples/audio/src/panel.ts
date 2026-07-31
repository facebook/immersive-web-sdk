/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  findUIKitDocument,
  PanelDocument,
  VisibilityState,
} from '@iwsdk/core';

export class SettingsSystem extends createSystem({
  loadedPanels: { required: [PanelDocument] },
}) {
  init() {
    const panelEntity = this.world.requireSceneEntity('welcome-panel');
    this.queries.loadedPanels.subscribe('qualify', (entity) => {
      if (entity !== panelEntity) {
        return;
      }
      const document = findUIKitDocument(entity.object3D);
      if (!document) {
        throw new Error('Welcome panel did not produce a UIKit document');
      }

      const xrButton = document.requireElementById('xr-button');
      xrButton.addEventListener('click', () => {
        this.world.launchXR();
      });

      const exitButton = document.requireElementById('exit-button');
      exitButton.addEventListener('click', () => {
        this.world.exitXR();
      });
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      });
    });
  }
}
