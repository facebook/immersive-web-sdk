/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { EnvironmentType, Locomotor, LocomotorConfig } from '@iwsdk/locomotor';
import { InputComponent } from '@iwsdk/xr-input';
import { Types, createComponent } from '../ecs/component.js';
import { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import { Vector3 } from '../runtime/index.js';
import { SlideSystem } from './slide.js';
import { TeleportSystem } from './teleport.js';
import { TurnSystem, TurningMethod } from './turn.js';

/**
 * Marks an entity's object3D hierarchy as walkable environment for the locomotion engine.
 *
 * @remarks
 * - Set {@link EnvironmentType} to `STATIC` for fixed geometry (merged once) or `KINEMATIC` for moving platforms
 *   (matrices streamed each frame via {@link LocomotionSystem.update}).
 * - Attach this component to the environment root you want the player to stand on.
 *
 * @category Locomotion
 * @example
 * ```ts
 * const floor = world.createTransformEntity(gltf.scene);
 * floor.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
 * ```
 */
export const LocomotionEnvironment = createComponent(
  'LocomotionEnvironment',
  {
    type: {
      type: Types.Enum,
      enum: EnvironmentType,
      default: EnvironmentType.STATIC,
    }, // STATIC for fixed meshes, KINEMATIC for moving platforms
    _envHandle: { type: Types.Float32, default: 0 }, // Engine handle for this environment (internal)
    _initialized: { type: Types.Boolean, default: false }, // True after registration with Locomotor
  },
  'Locomotion environment component that holds the environment mesh group',
);

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
    /** Button used to jump in SlideSystem. */
    jumpButton: { type: Types.String, default: InputComponent.A_Button },
  },
) {
  private locomotor!: Locomotor;

  private teleportSystem?: TeleportSystem;
  private slideSystem?: SlideSystem;
  private turnSystem!: TurnSystem;
  private microGestureControlsEnabled = false;

  init() {
    this.world.registerSystem(TurnSystem, {
      configData: {
        turningMethod: this.config.turningMethod.value,
        turningAngle: this.config.turningAngle.value,
        turningSpeed: this.config.turningSpeed.value,
        microGestureControlsEnabled: false,
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
        this.config.jumpButton.subscribe((value) => {
          if (this.slideSystem) {
            this.slideSystem.config.jumpButton.value = value;
          }
        }),
      );
    });

    this.queries.envs.subscribe('qualify', (entity) => {
      this.addEnvironmentToEngine(entity);
    });
    this.queries.envs.subscribe('disqualify', (entity) => {
      this.removeEnvironmentFromEngine(entity);
    });
  }

  private async initLocomotor(): Promise<void> {
    // Create Locomotor with configuration
    const locomotorConfig: LocomotorConfig = {
      initialPlayerPosition: new Vector3().fromArray(
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

    // Register subsystems with locomotor
    this.world.registerSystem(TeleportSystem, {
      configData: {
        rayGravity: this.config.rayGravity.value,
        locomotor: this.locomotor,
        microGestureControlsEnabled: false,
      },
    });
    this.world.registerSystem(SlideSystem, {
      configData: {
        maxSpeed: this.config.slidingSpeed.value,
        comfortAssist: this.config.comfortAssist.value,
        jumpButton: this.config.jumpButton.value,
        locomotor: this.locomotor,
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
    const envHandle = entity.getValue(LocomotionEnvironment, '_envHandle');
    if (envHandle === 0) {
      return; // Not initialized or invalid handle
    } else if (envHandle !== null) {
      this.locomotor.removeEnvironment(envHandle);
    }
  }

  update(delta: number): void {
    this.locomotor.updateKinematicEnvironments();
    this.locomotor.update(delta);
    this.player.position.copy(this.locomotor.position);

    // Toggle micro-gesture controls in hand-tracking mode
    if (this.input.isPrimary('hand', 'right')) {
      const gp = this.input.gamepads.right;
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
    this.cleanupFuncs.forEach((fn) => fn());
  }
}
