/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { XRInputManager, XROrigin } from '@iwsdk/xr-input';
import type { PointerEventsMap } from '@pmndrs/pointer-events';
import { Signal, signal } from '@preact/signals-core';
import { AnyComponent, World as ElicsWorld } from 'elics';
import { AssetManager } from '../asset/index.js';
// Environment is driven by components/systems; no world helpers
import {
  WorldOptions,
  initializeWorld,
  XROptions,
  launchXR,
} from '../init/index.js';
import { LevelTag } from '../level/index.js';
import type { Object3DEventMap } from '../runtime/index.js';
import {
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from '../runtime/index.js';
import { Transform } from '../transform/index.js';
import { Entity } from './entity.js';

export enum VisibilityState {
  NonImmersive = 'non-immersive',
  Hidden = 'hidden',
  Visible = 'visible',
  VisibleBlurred = 'visible-blurred',
}

export type GradientColors = {
  sky: number;
  equator: number;
  ground: number;
};

/**
 * World is the root ECS container, Three.js scene/renderer owner, and XR session gateway.
 *
 * @remarks
 * - Construct a world with {@link World.create} (recommended) which wires the renderer, scene, default systems
 *   (Input, UI, Audio, Level) and starts the render loop.
 * - The world exposes convenience handles like {@link World.input | input} (XRInputManager),
 *   {@link World.player | player} (XROrigin), and {@link World.assetManager}.
 * - Feature systems (Grabbing, Locomotion) are opt‑in via {@link WorldOptions.features}.
 *
 * @category Runtime
 * @example
 * ```ts
 * import { World, SessionMode } from '@iwsdk/core';
 *
 * const container = document.getElementById('scene-container') as HTMLDivElement;
 * const world = await World.create(container, {
 *   xr: { sessionMode: SessionMode.ImmersiveVR },
 *   features: { enableLocomotion: true, enableGrabbing: true },
 *   level: '/glxf/Composition.glxf'
 * });
 * ```
 */
export class World extends ElicsWorld {
  public input!: XRInputManager;
  public player!: XROrigin;
  public assetManager!: typeof AssetManager;
  public scene!: Scene;
  public sceneEntity!: Entity;
  public activeLevel!: Signal<Entity>;
  public activeLevelId: string = 'level:default';
  public camera!: PerspectiveCamera;
  public renderer!: WebGLRenderer;
  public session: XRSession | undefined;
  public visibilityState = signal(VisibilityState.NonImmersive);
  public requestedLevelUrl: string | undefined;
  public _resolveLevelLoad: (() => void) | undefined;
  /** Default XR options used when calling {@link World.launchXR} without overrides. */
  public xrDefaults: import('../init/xr.js').XROptions | undefined;

  constructor() {
    super();
    const originalReleaseFunc = this.entityManager.releaseEntityInstance.bind(
      this.entityManager,
    );
    this.entityManager.releaseEntityInstance = (entity: Entity) => {
      originalReleaseFunc(entity);
      entity.object3D?.removeFromParent();
      delete entity.object3D;
    };
  }

  createEntity(): Entity {
    return super.createEntity() as Entity;
  }

  createTransformEntity(
    object?: Object3D,
    parentOrOptions?: Entity | { parent?: Entity; persistent?: boolean },
  ): Entity {
    const entity = super.createEntity() as Entity;
    const obj = object ?? new Object3D();
    // Cast to pointer-events-capable Object3D event map for downstream typing
    entity.object3D = obj as unknown as Object3D<
      Object3DEventMap & PointerEventsMap
    >;

    let parent: Entity | undefined = undefined;
    let persistent = false;

    if (parentOrOptions) {
      if (typeof (parentOrOptions as any).index === 'number') {
        parent = parentOrOptions as Entity;
      } else {
        const opts = parentOrOptions as {
          parent?: Entity;
          persistent?: boolean;
        };
        parent = opts.parent;
        persistent = !!opts.persistent;
      }
    }

    if (!parent) {
      // Avoid self-parenting for the Scene root
      const isSceneObject = (obj: Object3D) => (obj as any).isScene === true;
      if (object && isSceneObject(object)) {
        parent = undefined;
        persistent = true;
      } else {
        parent = persistent
          ? this.sceneEntity
          : (this.activeLevel?.value ?? this.sceneEntity);
      }
    }

    entity.addComponent(Transform, { parent });

    // Tag entity with current level, unless persistent
    if (!persistent) {
      entity.addComponent(LevelTag, { id: this.activeLevelId });
    }
    return entity;
  }

  launchXR(xrOptions?: Partial<XROptions>) {
    launchXR(this, xrOptions);
  }

  /** Request a level change; LevelSystem performs the work and resolves. */
  async loadLevel(url?: string): Promise<void> {
    this.requestedLevelUrl = url ?? '';
    return new Promise<void>((resolve) => {
      this._resolveLevelLoad = resolve;
    });
  }

  exitXR() {
    this.session?.end();
  }

  update(delta: number, time: number): void {
    super.update(delta, time);
  }

  registerComponent(component: AnyComponent): this {
    return super.registerComponent(component);
  }

  // Level root helpers
  getActiveRoot(): Object3D {
    return this.activeLevel?.value?.object3D ?? this.scene;
  }

  getPersistentRoot(): Object3D {
    return this.scene;
  }

  /**
   * Initialize a new WebXR world with all required systems and setup
   *
   * @param sceneContainer - HTML container for the renderer canvas
   * @param assets - Asset manifest for preloading
   * @param options - Configuration options for the world
   * @returns Promise that resolves to the initialized World instance
   */
  /**
   * Initialize a new WebXR world with renderer, scene, default systems, and optional level.
   *
   * @param container HTML container to which the renderer canvas will be appended.
   * @param options Runtime configuration, see {@link WorldOptions}.
   * @returns A promise that resolves to the initialized {@link World}.
   *
   * @remarks
   * - This call enables the Input, UI and Audio systems by default.
   * - Use {@link WorldOptions.features} to enable Locomotion or Grabbing.
   * - If {@link WorldOptions.level} is provided, the LevelSystem will load it after assets are preloaded.
   * @see /getting-started/01-hello-xr
   */
  static create(
    container: HTMLDivElement,
    options?: WorldOptions,
  ): Promise<World> {
    return initializeWorld(container, options);
  }
}
