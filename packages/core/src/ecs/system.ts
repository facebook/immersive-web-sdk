/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { XRInputManager, XROrigin } from '@iwsdk/xr-input';
import { Signal, signal } from '@preact/signals-core';
import {
  System as ElicsSystem,
  Query,
  SystemConstructor,
  SystemQueries,
  SystemSchema,
  TypeValueToType,
} from 'elics';
import type { QueryManager } from 'elics/lib/query-manager.js';
import { Object3D } from 'three';
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WebXRManager,
} from '../runtime/index.js';
import { Entity } from './entity.js';
import type { VisibilityState, World } from './world';

type SystemConfigSignals<S extends SystemSchema> = {
  [K in keyof S]: Signal<TypeValueToType<S[K]['type']>>;
};

/**
 * System base interface wired to the IWSDK World, renderer, and XR runtime.
 *
 * @remarks
 * - `createSystem(queries, schema)` returns a class that implements this interface.
 * - Config values are exposed as reactive Signals on `this.config.<key>`.
 * - Common world resources are available as readonly properties (`player`, `input`,
 *   `scene`, `camera`, `renderer`, `visibilityState`).
 * - Use `cleanupFuncs.push(() => ...)` to register teardown callbacks.
 *
 * @category ECS
 */
export interface System<S extends SystemSchema, Q extends SystemQueries>
  extends ElicsSystem<S, Q> {
  isPaused: boolean;
  config: SystemConfigSignals<S>;
  queries: Record<keyof Q, Query>;
  world: World;
  queryManager: QueryManager;
  priority: number;
  globals: Record<string, any>;
  xrManager: WebXRManager;
  xrFrame: XRFrame;

  readonly player: XROrigin;
  readonly input: XRInputManager;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly visibilityState: Signal<VisibilityState>;
  readonly cleanupFuncs: Array<() => void>;

  init(): void;
  update(delta: number, time: number): void;
  play(): void;
  stop(): void;
  createEntity: () => Entity;
}

/**
 * Create a strongly-typed System class with query bindings and reactive config.
 *
 * @param queries Elics query descriptors keyed by name.
 * @param schema Option map of config defaults and Types.
 * @returns A System constructor to `export class MySystem extends createSystem(...) { ... }`.
 *
 * @example
 * export class Rotator extends createSystem({ items: { required: [Transform] } }, {
 *   speed: { type: Types.Float32, default: 1 }
 * }) {
 *   update(dt:number){ this.queries.items.entities.forEach(e=> e.object3D.rotateY(dt*this.config.speed.value)) }
 * }
 *
 * @category ECS
 */
export function createSystem<S extends SystemSchema, Q extends SystemQueries>(
  queries: Q = {} as Q,
  schema: S = {} as S,
): SystemConstructor<S, Q, World, System<S, Q>> {
  return class implements System<S, Q> {
    static schema = schema;
    static isSystem = true;
    static queries = queries;

    public isPaused: boolean = false;
    public queries!: Record<keyof Q, Query>;
    public config = {} as SystemConfigSignals<S>;

    public readonly player: XROrigin;
    public readonly input: XRInputManager;
    public readonly scene: Scene;
    public readonly camera: PerspectiveCamera;
    public readonly renderer: WebGLRenderer;
    public readonly visibilityState: Signal<VisibilityState>;
    public readonly cleanupFuncs: Array<() => void> = [];

    constructor(
      public readonly world: World,
      public queryManager: QueryManager,
      public priority: number,
    ) {
      for (const key in schema) {
        this.config[key] = signal(schema[key].default as any);
      }
      this.player = world.player;
      this.input = world.input;
      this.scene = world.scene;
      this.camera = world.camera;
      this.renderer = world.renderer;
      this.visibilityState = world.visibilityState;
    }

    get globals() {
      return this.world.globals;
    }

    get xrManager() {
      return this.world.renderer.xr;
    }

    get xrFrame() {
      return this.xrManager.getFrame();
    }

    createEntity(): Entity {
      return this.world.createEntity();
    }

    createTransformEntity(object?: Object3D, parent?: Entity): Entity {
      return this.world.createTransformEntity(object, parent);
    }

    init(): void {}

    update(_delta: number, _time: number): void {}

    play(): void {
      this.isPaused = false;
    }

    stop(): void {
      this.isPaused = true;
    }

    destroy(): void {
      this.cleanupFuncs.forEach((func) => func());
    }
  };
}
