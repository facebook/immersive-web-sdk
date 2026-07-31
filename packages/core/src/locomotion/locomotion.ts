/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Locomotor, LocomotorConfig } from '@iwsdk/locomotor';
import { Types } from '../ecs/component.js';
import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { Vector3 } from '../runtime/index.js';
import { LocomotionEnvironment } from './locomotion-environment.js';
import {
  ActionLocomotionInputProvider,
  type BrowserLocomotionControls,
} from './locomotion-input-provider.js';
import { SlideSystem } from './slide.js';
import { TeleportSystem } from './teleport.js';
import { TurnSystem, TurningMethod } from './turn.js';

export { LocomotionEnvironment } from './locomotion-environment.js';

/**
 * Physics‑driven locomotion (slide, teleport, turn) backed by the {@link @iwsdk/locomotor!Locomotor} engine.
 *
 * @remarks
 * - Enable this system via {@link WorldOptions.features.enableLocomotion}.
 * - Add {@link LocomotionEnvironment} to level meshes to make them walkable.
 * - For moving platforms, use `EnvironmentType.KINEMATIC` and keep transforms updated.
 * - In hand‑tracking mode, micro‑gesture controls can toggle turn/teleport using swipe gestures.
 *
 * @category Locomotion
 * @example
 * ```ts
 * world.registerSystem(LocomotionSystem, {
 *   configData: { turningAngle: 45, slidingSpeed: 4.5 }
 * });
 * ```
 */
export class LocomotionSystem extends createSystem(
  {
    envs: { required: [LocomotionEnvironment] },
  },
  {
    /** Starting player position before the first update. */
    initialPlayerPosition: { type: Types.Vec3, default: [0, 0, 0] },
    /** Run the locomotion engine in a WebWorker for better main‑thread perf. */
    useWorker: { type: Types.Boolean, default: true },
    /** Comfort vignette strength forwarded to SlideSystem. */
    comfortAssist: { type: Types.Float32, default: 0.5 },
    /** Maximum sliding speed (m/s). */
    slidingSpeed: { type: Types.Float32, default: 5 },
    /** Turning mode: snap vs smooth. */
    turningMethod: { type: Types.Int8, default: TurningMethod.SnapTurn },
    /** Degrees per snap turn. */
    turningAngle: { type: Types.Float32, default: 45 },
    /** Degrees per second for smooth turning. */
    turningSpeed: { type: Types.Float32, default: 180 },
    /** Parabolic ray gravity for teleport guide (negative). */
    rayGravity: { type: Types.Float32, default: -0.4 },
    /** Max drop allowed when projecting the player onto walkable surfaces. */
    maxDropDistance: { type: Types.Float32, default: 5.0 },
    /** Jump apex height in meters. */
    jumpHeight: { type: Types.Float32, default: 1.5 },
    /** Minimum seconds between jumps. */
    jumpCooldown: { type: Types.Float32, default: 0.1 },
    /** Whether jumping is enabled. */
    enableJumping: { type: Types.Boolean, default: true },
    /** Optional browser bindings for action-backed first-person locomotion. */
    browserControls: { type: Types.Object, default: false },
  },
) {
  private locomotor!: Locomotor;
  private inputProvider!: ActionLocomotionInputProvider;

  private teleportSystem?: TeleportSystem;
  private slideSystem?: SlideSystem;
  private turnSystem!: TurnSystem;
  private microGestureControlsEnabled = false;
  private requestedPlayerPosition?: Vector3;

  /** Place the locomotion origin at an authored virtual-environment position. */
  setPlayerPosition(position: Vector3): void {
    this.requestedPlayerPosition ??= new Vector3();
    this.requestedPlayerPosition.copy(position);
    this.config.initialPlayerPosition.value = position.toArray();
    this.player.position.copy(position);
    if (this.locomotor?.isInitialized()) {
      this.locomotor.teleport(position);
    }
  }

  init() {
    // Apply the configured starting position synchronously. Native scene
    // loading captures the current player transform as its restoration
    // baseline, while the locomotor finishes initializing asynchronously.
    this.player.position.fromArray(
      this.config.initialPlayerPosition.value as number[],
    );
    this.cleanupFuncs.push(
      this.world.onAuthoredPlayerPosition((position) => {
        this.setPlayerPosition(position);
      }),
    );
    this.inputProvider = new ActionLocomotionInputProvider(this.world);
    this.inputProvider.enableBrowserControls(
      this.config.browserControls.value as BrowserLocomotionControls,
    );

    this.world.registerSystem(TurnSystem, {
      configData: {
        turningMethod: this.config.turningMethod.value,
        turningAngle: this.config.turningAngle.value,
        turningSpeed: this.config.turningSpeed.value,
        microGestureControlsEnabled: false,
        inputProvider: this.inputProvider,
      },
    });
    this.turnSystem = this.world.getSystem(TurnSystem)!;
    this.initLocomotor().then(() => {
      this.cleanupFuncs.push(
        this.config.rayGravity.subscribe((value) => {
          this.locomotor.updateConfig({ rayGravity: value });
          if (this.teleportSystem) {
            this.teleportSystem.config.rayGravity.value = value;
          }
        }),
        this.config.slidingSpeed.subscribe((value) => {
          if (this.slideSystem) {
            this.slideSystem.config.maxSpeed.value = value;
          }
        }),
        this.config.comfortAssist.subscribe((value) => {
          if (this.slideSystem) {
            this.slideSystem.config.comfortAssist.value = value;
          }
        }),
        this.config.turningMethod.subscribe((value) => {
          this.turnSystem.config.turningMethod.value = value;
        }),
        this.config.turningAngle.subscribe((value) => {
          this.turnSystem.config.turningAngle.value = value;
        }),
        this.config.turningSpeed.subscribe((value) => {
          this.turnSystem.config.turningSpeed.value = value;
        }),
        this.config.maxDropDistance.subscribe((value) => {
          this.locomotor.updateConfig({ maxDropDistance: value });
        }),
        this.config.jumpHeight.subscribe((value) => {
          this.locomotor.updateConfig({ jumpHeight: value });
        }),
        this.config.jumpCooldown.subscribe((value) => {
          this.locomotor.updateConfig({ jumpCooldown: value });
        }),
        this.config.enableJumping.subscribe((value) => {
          if (this.slideSystem) {
            this.slideSystem.config.enableJumping.value = value;
          }
        }),
      );
    });

    // Register the env query subscriptions on cleanupFuncs (the config
    // subscriptions above are already registered) so they're released when the
    // LocomotionSystem is torn down.
    this.cleanupFuncs.push(
      this.queries.envs.subscribe('qualify', (entity) => {
        this.addEnvironmentToEngine(entity);
      }),
      this.queries.envs.subscribe('disqualify', (entity) => {
        this.removeEnvironmentFromEngine(entity);
      }),
    );
  }

  private async initLocomotor(): Promise<void> {
    // Create Locomotor with configuration
    const locomotorConfig: LocomotorConfig = {
      initialPlayerPosition:
        this.requestedPlayerPosition?.clone() ??
        new Vector3().fromArray(
          this.config.initialPlayerPosition.value as number[],
        ),
      rayGravity: this.config.rayGravity.value as number,
      maxDropDistance: this.config.maxDropDistance.value as number,
      jumpHeight: this.config.jumpHeight.value as number,
      jumpCooldown: this.config.jumpCooldown.value as number,
      useWorker: this.config.useWorker.value as boolean,
    };

    this.locomotor = new Locomotor(locomotorConfig);
    await this.locomotor.initialize();
    if (this.requestedPlayerPosition != null) {
      this.locomotor.teleport(this.requestedPlayerPosition);
      this.player.position.copy(this.requestedPlayerPosition);
    }

    // Register subsystems with locomotor
    this.world.registerSystem(TeleportSystem, {
      configData: {
        rayGravity: this.config.rayGravity.value,
        locomotor: this.locomotor,
        inputProvider: this.inputProvider,
        microGestureControlsEnabled: false,
      },
    });
    this.world.registerSystem(SlideSystem, {
      configData: {
        maxSpeed: this.config.slidingSpeed.value,
        comfortAssist: this.config.comfortAssist.value,
        enableJumping: this.config.enableJumping.value,
        locomotor: this.locomotor,
        inputProvider: this.inputProvider,
      },
    });

    this.teleportSystem = this.world.getSystem(TeleportSystem);
    this.slideSystem = this.world.getSystem(SlideSystem);

    // Add any existing environments to the engine
    for (const entity of this.queries.envs.entities) {
      this.addEnvironmentToEngine(entity);
    }
  }

  private addEnvironmentToEngine(entity: Entity): void {
    if (!this.locomotor?.isInitialized()) {
      return;
    }
    if (entity.getValue(LocomotionEnvironment, '_initialized')) {
      return; // Already initialized
    }

    const envGroup = entity.object3D;
    if (!envGroup?.isObject3D) {
      return;
    }

    const envType = entity.getValue(LocomotionEnvironment, 'type');

    if (envType !== null) {
      try {
        // Add environment through Locomotor - returns handle
        const envHandle = this.locomotor.addEnvironment(envGroup, envType);

        // Store the generated handle for tracking
        entity.setValue(LocomotionEnvironment, '_envHandle', envHandle);
        entity.setValue(LocomotionEnvironment, '_initialized', true);
      } catch (error) {
        console.error('Failed to add environment to locomotion engine:', error);
      }
    }
  }

  private removeEnvironmentFromEngine(entity: Entity): void {
    if (!this.locomotor) {
      return;
    }
    const envHandle = entity.getValue(LocomotionEnvironment, '_envHandle');
    if (envHandle === 0) {
      return; // Not initialized or invalid handle
    } else if (envHandle !== null) {
      this.locomotor.removeEnvironment(envHandle);
    }
  }

  update(delta: number): void {
    if (!this.locomotor) {
      return;
    }
    this.locomotor.updateKinematicEnvironments();
    this.locomotor.update(delta);
    this.player.position.copy(this.locomotor.position);

    // Toggle micro-gesture controls in hand-tracking mode
    if (this.input.xr.isPrimary('hand', 'right')) {
      const gp = this.input.xr.gamepads.right;
      if (gp) {
        // Swipe up (7) enables; swipe down (8) disables
        if (gp.getButtonDownByIdx(7)) {
          if (!this.microGestureControlsEnabled) {
            this.microGestureControlsEnabled = true;
            if (this.turnSystem) {
              this.turnSystem.config.microGestureControlsEnabled.value = true;
            }
            if (this.teleportSystem) {
              this.teleportSystem.config.microGestureControlsEnabled.value = true;
            }
          }
        } else if (gp.getButtonDownByIdx(8)) {
          if (this.microGestureControlsEnabled) {
            this.microGestureControlsEnabled = false;
            if (this.turnSystem) {
              this.turnSystem.config.microGestureControlsEnabled.value = false;
            }
            if (this.teleportSystem) {
              this.teleportSystem.config.microGestureControlsEnabled.value = false;
            }
          }
        }
      }
    }
  }

  destroy(): void {
    super.destroy();
    if (this.locomotor) {
      this.locomotor.terminate();
    }
    this.world.unregisterSystem(TurnSystem);
    if (this.teleportSystem) {
      this.world.unregisterSystem(TeleportSystem);
    }
    if (this.slideSystem) {
      this.world.unregisterSystem(SlideSystem);
    }
  }
}
