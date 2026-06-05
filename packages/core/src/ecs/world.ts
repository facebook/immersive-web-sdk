/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { XROrigin } from '@iwsdk/xr-input';
import type { PointerEventsMap } from '@pmndrs/pointer-events';
import { Signal, signal } from '@preact/signals-core';
import { AnyComponent, World as ElicsWorld } from 'elics';
import { AssetManager } from '../asset/index.js';
// Environment is driven by components/systems; no world helpers
// NOTE: import `launchXR` and types directly from submodules — not the
// `../init/index.js` barrel — so loading this file does not pull in
// `init/world-initializer.js`. That would create a value-level cycle with
// audio-system.ts (and other systems that import the ecs barrel), causing
// the bundler to emit System classes before their referenced Component
// constants, producing `undefined.bitmask` crashes at QueryManager.registerQuery.
// `initializeWorld` is loaded lazily inside `World.create` for the same reason.
import type { WorldOptions } from '../init/world-initializer.js';
import { launchXR } from '../init/xr.js';
import type { XROptions } from '../init/xr.js';
import type { InputManager } from '../input/index.js';
// Import LevelTag from its leaf module — not '../level/index.js' — so that
// loading ecs/world.ts does not transitively pull in level-system.ts (which
// would re-enter '../ecs/index.js' and form a cycle, leading to TDZ
// undefined.bitmask crashes for any component captured in System.queries).
import { LevelTag } from '../level/level-tag.js';
import type { MCPRuntime } from '../mcp/index.js';
import type { Object3DEventMap } from '../runtime/index.js';
import {
  Material,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from '../runtime/index.js';
// See note above on LevelTag — import Transform directly from its leaf
// module to avoid cycling back through '../ecs/index.js' via the transform
// barrel.
import { Transform } from '../transform/transform.js';
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
 * - The world exposes convenience handles like {@link World.input | input},
 *   {@link World.player | player} (the persistent player/XR origin), and {@link World.assetManager}.
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
  public input!: InputManager;
  public player!: XROrigin;
  public assetManager!: typeof AssetManager;
  public scene!: Scene;
  public sceneEntity!: Entity;
  public activeLevel!: Signal<Entity>;
  public activeLevelId: string = 'level:default';
  public camera!: PerspectiveCamera;
  public cameraEntity!: Entity;
  public renderer!: WebGLRenderer;
  public session: XRSession | undefined;
  public visibilityState = signal(VisibilityState.NonImmersive);
  public requestedLevelUrl: string | undefined;
  public _resolveLevelLoad: (() => void) | undefined;
  /** Default XR options used when calling {@link World.launchXR} without overrides. */
  public xrDefaults: import('../init/xr.js').XROptions | undefined;
  /** MCP runtime for framework-specific tools. Set automatically during World.create(). */
  public mcpRuntime?: MCPRuntime;

  /** Teardown callbacks run by {@link World.destroy} (render loop, global listeners). */
  private worldCleanupFuncs: Array<() => void> = [];
  /** Guards {@link World.destroy} so a second call is a no-op. */
  private destroyed = false;

  /** Entity wrapping the XROrigin Group (persistent, survives level changes). */
  public playerEntity!: Entity;
  /** Entity wrapping the player head Group (persistent). */
  public playerHeadEntity!: Entity;
  /** Entities for all XR input space Groups under the player rig (all persistent). */
  public playerSpaceEntities!: {
    head: Entity;
    raySpaces: { left: Entity; right: Entity };
    gripSpaces: { left: Entity; right: Entity };
    indexTipSpaces: { left: Entity; right: Entity };
  };

  constructor() {
    super();
    const originalReleaseFunc = this.entityManager.releaseEntityInstance.bind(
      this.entityManager,
    );
    this.entityManager.releaseEntityInstance = (entity: Entity) => {
      originalReleaseFunc(entity);
      const obj = entity.object3D;
      if (obj) {
        // Check if entity was marked for resource disposal
        if ((entity as any)._disposeResources) {
          this.disposeObject3DResources(obj);
          delete (entity as any)._disposeResources;
        }
        obj.removeFromParent();
        delete entity.object3D;
      }
    };
  }

  /**
   * Dispose of an Object3D's GPU resources (geometry, materials, textures).
   * Traverses all descendants and cleans up disposable resources.
   *
   * @remarks
   * This is called automatically when an entity is destroyed with `disposeResources: true`.
   * Use with caution when resources may be shared across multiple entities.
   */
  private disposeObject3DResources(object: Object3D): void {
    object.traverse((child: any) => {
      // Dispose geometry
      if (child.geometry) {
        child.geometry.dispose();
      }

      // Dispose materials (can be single or array)
      if (child.material) {
        const materials: Material[] = Array.isArray(child.material)
          ? child.material
          : [child.material];

        for (const material of materials) {
          // Dispose textures attached to the material
          for (const key of Object.keys(material)) {
            const value = (material as any)[key];
            if (value && typeof value.dispose === 'function') {
              // Check if it's a texture (has isTexture property)
              if (value.isTexture) {
                value.dispose();
              }
            }
          }
          material.dispose();
        }
      }
    });
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

  /**
   * Register a teardown callback to run on {@link World.destroy}. Used by the
   * initializer to undo global side effects such as the render loop and the
   * window `resize` listener.
   *
   * @internal
   */
  addCleanup(fn: () => void): void {
    this.worldCleanupFuncs.push(fn);
  }

  /**
   * Tear down the world: destroy all registered systems (running their
   * `cleanupFuncs`), then run world-level teardown callbacks (stop the render
   * loop, remove the window `resize` listener). After calling this the world
   * instance should be discarded.
   *
   * @remarks
   * Not invoked during normal single-world app usage (where the world lives for
   * the page lifetime); provided so tests, hot-reload, and multi-world hosts can
   * release the render loop, listeners, and per-system subscriptions instead of
   * leaking them. Individual failures are caught so one bad teardown does not
   * block the rest.
   */
  destroy(): void {
    // Idempotent: getSystems() keeps returning the same systems, so without
    // this guard a second destroy() would re-run every system's destroy().
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const system of this.getSystems()) {
      try {
        (system as { destroy?: () => void }).destroy?.();
      } catch (error) {
        console.error('[World] system destroy failed:', error);
      }
    }
    const fns = this.worldCleanupFuncs.splice(0);
    for (const fn of fns) {
      try {
        fn();
      } catch (error) {
        console.error('[World] cleanup failed:', error);
      }
    }
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
  static async create(
    container: HTMLDivElement,
    options?: WorldOptions,
  ): Promise<World> {
    const { initializeWorld } = await import('../init/world-initializer.js');
    return initializeWorld(container, options);
  }
}
