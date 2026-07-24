/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AudioSource,
  AudioUtils,
  createSystem,
  eq,
  LocomotionSystem,
  PanelDocument,
  PanelUI,
  PlaybackMode,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';

interface ConfigOptions {
  comfortAssist: string;
  slidingSpeed: string;
  rayGravity: string;
  turningMethod: string;
  turningAngle: string;
  turningSpeed: string;
  [key: string]: string;
}

const SETTINGS_PANEL_DISTANCE = 2.2;
const SETTINGS_PANEL_EYE_OFFSET = 0.25;
const FALLBACK_FORWARD_EPSILON = 0.0001;

export class SettingsSystem extends createSystem({
  settingsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/settings.json')],
  },
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/welcome.json')],
  },
}) {
  private headPosition = new Vector3();
  private panelForward = new Vector3();
  private panelPosition = new Vector3();

  init() {
    this.queries.settingsPanel.subscribe('qualify', (entity) => {
      if (entity.getValue(PanelUI, 'config') === './ui/settings.json') {
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
      const document = (PanelDocument as any).data.document[entity.index];
      if (!document) {
        return;
      }

      const xrButton = document.getElementById('xr-button');
      xrButton.addEventListener('click', () => {
        this.world.launchXR();
      });

      const exitButton = document.getElementById('exit-button');
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

  setupUIInteractions(entity: any) {
    const document = (PanelDocument as any).data.document[entity.index];
    if (!document) {
      console.error('Failed to get UIKitDocument for settings panel');
      return;
    }

    const configOptions: ConfigOptions = {
      comfortAssist: 'standard-assist',
      slidingSpeed: 'normal-speed',
      rayGravity: 'normal-range',
      turningMethod: 'snap-turn',
      turningAngle: 'angle-45',
      turningSpeed: 'speed-120',
    };

    this.setupConfigButtons(document, entity, configOptions);
    this.setupTurningMethodVisibility(document, configOptions);
  }

  setupConfigButtons(document: any, entity: any, configOptions: ConfigOptions) {
    const configGroups: Record<string, string[]> = {
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
            let configKey: string | null = null;
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
                (this.world.getSystem(LocomotionSystem) as any).config[
                  configKey
                ].value = Number(value);
              }
              updateButtonStyling();
              AudioUtils.play(entity);

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

  setupTurningMethodVisibility(document: any, configOptions: ConfigOptions) {
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
      this.queries.settingsPanel.entities.forEach((entity) => {
        if (entity.object3D!.visible) {
          entity.object3D!.visible = false;
        } else {
          entity.object3D!.visible = true;
          this.placeSettingsPanel(entity);
        }
      });
    }
  }

  private placeSettingsPanel(entity: any) {
    this.player.head.getWorldPosition(this.headPosition);
    this.player.head.getWorldDirection(this.panelForward);
    this.panelForward.y = 0;

    if (this.panelForward.lengthSq() < FALLBACK_FORWARD_EPSILON) {
      this.panelForward.set(0, 0, -1);
    } else {
      this.panelForward.normalize();
    }

    this.panelPosition
      .copy(this.headPosition)
      .addScaledVector(this.panelForward, SETTINGS_PANEL_DISTANCE);
    this.panelPosition.y = Math.max(
      0.8,
      this.headPosition.y - SETTINGS_PANEL_EYE_OFFSET,
    );

    entity.object3D!.position.copy(this.panelPosition);
    entity.object3D!.lookAt(this.headPosition);
  }
}
