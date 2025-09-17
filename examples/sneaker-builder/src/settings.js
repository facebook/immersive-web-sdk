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
  Color,
  VisibilityState,
  SessionMode,
  AudioUtils,
} from '@iwsdk/core';
import { createComponent, Types } from '@iwsdk/core';

export const ShoePart = createComponent('ShoePart', {
  partName: { type: Types.String, default: '' },
});

export class SettingsSystem extends createSystem({
  configuredPanels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/settings.json')],
  },
  primary: {
    required: [ShoePart],
    where: [eq(ShoePart, 'partName', 'primary')],
  },
  accent: {
    required: [ShoePart],
    where: [eq(ShoePart, 'partName', 'accent')],
  },
  stitching: {
    required: [ShoePart],
    where: [eq(ShoePart, 'partName', 'stitching')],
  },
}) {
  init() {
    this.queries.configuredPanels.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;
      const groups = ['primary-color', 'accent-color', 'stitching-color'];
      groups.forEach((groupId) => {
        const swatches = document.querySelectorAll(`#${groupId} .color-swatch`);
        swatches.forEach((swatch) => {
          swatch.addEventListener('click', () => {
            // Remove selected class from all swatches in this group
            swatches.forEach((otherSwatch) => {
              otherSwatch.classList.remove('selected');
            });

            // Add selected class to the clicked swatch
            swatch.classList.add('selected');

            const color = new Color(swatch.inputProperties.dataValue);
            const targetQuery =
              groupId === 'primary-color'
                ? this.queries.primary
                : groupId === 'accent-color'
                  ? this.queries.accent
                  : this.queries.stitching;

            targetQuery.entities.forEach((entity) => {
              entity.object3D.traverse((object) => {
                if (object.isMesh) {
                  object.material.color.copy(color);
                }
              });
            });
            AudioUtils.play(entity);
          });
        });
      });

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
          xrButton.setProperties({ text: 'Customize in XR' });
        } else {
          xrButton.setProperties({ text: 'Exit to Browser' });
        }
      });
    });
  }
}
