/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  LocomotionSystem,
  eq,
  createSystem,
  AudioSource,
  PlaybackMode,
  AudioUtils,
  PanelUI,
  PanelDocument,
  VisibilityState,
  SessionMode,
  Vector3,
} from '@iwsdk/core';

export class SettingsSystem extends createSystem({
  settingsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/settings.json')],
  },
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/welcome.json')],
  },
}) {
  init() {
    // Set up reactive UI interaction setup when panel is loaded
    this.queries.settingsPanel.subscribe('qualify', (entity) => {
      if (entity.getValue(PanelUI, 'config') === '/ui/settings.json') {
        this.setupUIInteractions(entity);

        entity.addComponent(AudioSource, {
          src: 'audio/switch.mp3',
          positional: false,
          playbackMode: PlaybackMode.FadeRestart,
          maxInstances: 3,
          loop: false,
          volume: 0.3,
        });
      }
    });

    this.queries.welcomePanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[entity.index];
      if (!document) return;

      console.log(entity);

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

    this.vec3 = new Vector3();
  }

  setupUIInteractions(entity) {
    // Get the UIKitDocument for DOM-like access
    const document = PanelDocument.data.document[entity.index];
    if (!document) {
      console.error('Failed to get UIKitDocument for settings panel');
      return;
    }

    const configOptions = {
      comfortAssist: 'standard-assist',
      slidingSpeed: 'normal-speed',
      rayGravity: 'normal-range',
      turningMethod: 'snap-turn',
      turningAngle: 'angle-45',
      turningSpeed: 'speed-120',
    };

    // Set up configuration buttons
    this.setupConfigButtons(document, entity, configOptions);

    // Set up turning method visibility
    this.setupTurningMethodVisibility(document, configOptions);
  }

  setupConfigButtons(document, entity, configOptions) {
    const configGroups = {
      'comfort-assist': ['no-assist', 'standard-assist', 'high-assist'],
      'sliding-speed': ['slow-speed', 'normal-speed', 'fast-speed'],
      'ray-gravity': ['near-range', 'normal-range', 'far-range'],
      'turning-method': ['snap-turn', 'smooth-turn'],
      'turning-speed': ['speed-90', 'speed-120', 'speed-180', 'speed-360'],
      'turning-angle': ['angle-30', 'angle-45', 'angle-90'],
    };

    Object.entries(configGroups).forEach(([_, buttonIds]) => {
      const updateButtonStyling = () => {
        buttonIds.forEach((buttonId) => {
          const button = document.getElementById(buttonId);
          if (button) {
            const isSelected = Object.values(configOptions).includes(buttonId);
            if (isSelected) {
              button.setProperties({
                backgroundColor: 0x09090b,
                color: 0xfafafa,
              });
            } else {
              button.setProperties({
                backgroundColor: 0x27272a,
                color: 0xa1a1aa,
              });
            }
          }
        });
      };

      buttonIds.forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) {
          button.addEventListener('click', () => {
            // Find which config option this button belongs to
            let configKey = null;
            for (const [key, selectedButtonId] of Object.entries(
              configOptions,
            )) {
              if (buttonIds.includes(selectedButtonId)) {
                configKey = key;
                break;
              }
            }

            if (configKey) {
              configOptions[configKey] = buttonId;
              const value = button.inputProperties.dataValue;
              if (value !== undefined) {
                this.world.getSystem(LocomotionSystem).config[configKey].value =
                  Number(value);
              }
              updateButtonStyling();
              AudioUtils.play(entity);

              // Handle turning method visibility
              if (buttonId === 'snap-turn' || buttonId === 'smooth-turn') {
                this.setupTurningMethodVisibility(document, configOptions);
              }
            }
          });
        }
      });

      updateButtonStyling();
    });
  }

  setupTurningMethodVisibility(document, configOptions) {
    const isSnapTurn = configOptions.turningMethod === 'snap-turn';

    const turningSpeed = document.getElementById('turning-speed');
    const turningAngle = document.getElementById('turning-angle');

    if (turningSpeed) {
      turningSpeed.setProperties({
        display: isSnapTurn ? 'none' : 'flex',
      });
    }

    if (turningAngle) {
      turningAngle.setProperties({
        display: isSnapTurn ? 'flex' : 'none',
      });
    }
  }

  update() {
    if (this.input.gamepads.left?.getSelectStart()) {
      this.player.head.getWorldPosition(this.vec3);
      this.queries.settingsPanel.entities.forEach((entity) => {
        if (entity.object3D.visible) {
          entity.object3D.visible = false;
        } else {
          entity.object3D.visible = true;
          this.player.raySpaces.left.getWorldPosition(entity.object3D.position);
          entity.object3D.position.y += 0.3;
          entity.object3D.lookAt(this.vec3);
        }
      });
    }
  }
}
