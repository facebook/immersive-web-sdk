/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState,
  SessionMode,
} from '@iwsdk/core';

export class SettingsSystem extends createSystem({
  configuredPanels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/settings.json')],
  },
}) {
  init() {
    this.queries.configuredPanels.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      const xrButton = document.getElementById('xr-button');
      xrButton.addEventListener('click', () => {
        if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
          this.world.launchXR({
            sessionMode: SessionMode.ImmersiveVR,
            requiredFeatures: ['hand-tracking'],
          });
        } else {
          this.world.exitXR();
        }
      });
      this.world.visibilityState.subscribe((visibilityState) => {
        if (visibilityState === VisibilityState.NonImmersive) {
          xrButton.setProperties({ text: 'Enter XR' });
        } else {
          xrButton.setProperties({ text: 'Exit to Browser' });
        }
      });
    });
  }
}
