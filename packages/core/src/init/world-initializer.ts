/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { XRInputManager } from '@iwsdk/xr-input';
import { signal } from '@preact/signals-core';
import { AssetManager, AssetManifest } from '../asset/index.js';
import { AudioSource, AudioSystem } from '../audio/index.js';
import { World, VisibilityState } from '../ecs/index.js';
import {
  DomeTexture,
  DomeGradient,
  IBLTexture,
  IBLGradient,
  EnvironmentSystem,
} from '../environment/index.js';
import { GrabSystem } from '../grab/index.js';
import { Interactable, Hovered, Pressed } from '../grab/index.js';
import { InputSystem } from '../input/index.js';
import { LevelTag, LevelRoot } from '../level/index.js';
import { LevelSystem } from '../level/index.js';
import { LocomotionSystem } from '../locomotion/index.js';
import {
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsSystem,
} from '../physics/index.js';
import {
  Clock,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from '../runtime/index.js';
import {
  SceneUnderstandingSystem,
  XRAnchor,
  XRMesh,
  XRPlane,
} from '../scene-understanding/index.js';
import { Transform, TransformSystem } from '../transform/index.js';
import {
  FollowSystem,
  Follower,
  ScreenSpace,
  ScreenSpaceUISystem,
  PanelUI,
  PanelUISystem,
} from '../ui/index.js';
import { Visibility, VisibilitySystem } from '../visibility/index.js';
import {
  ReferenceSpaceType,
  SessionMode,
  XROptions,
  normalizeReferenceSpec,
  resolveReferenceSpaceType,
  buildSessionInit,
} from './index.js';

/** Options for {@link initializeWorld} / {@link World.create}.
 *
 * @category Runtime
 * @remarks
 * Defaults are tuned for VR; you can override camera frustum and default lighting via {@link WorldOptions.render}.
 */
export type WorldOptions = {
  /** Asset manifest to preload before the first frame. */
  assets?: AssetManifest;

  /** Level to load after initialization. Accepts a GLXF URL string or an object with a `url` field. */
  level?: { url?: string } | string;

  /** XR session options and offer behavior. */
  xr?: XROptions & { offer?: 'none' | 'once' | 'always' };

  /** Renderer & camera configuration. */
  render?: {
    /** Camera field of view in degrees. @defaultValue 50 */
    fov?: number;
    /** Near clipping plane. @defaultValue 0.1 */
    near?: number;
    /** Far clipping plane. @defaultValue 200 */
    far?: number;
    /** Generate a default gradient environment and background. @defaultValue true */
    defaultLighting?: boolean;
  };

  /** Opt‑in feature systems. */
  features?: {
    /** Locomotion (teleport/slide/turn). Boolean or config. @defaultValue false */
    locomotion?: boolean | { useWorker?: boolean };
    /** Grabbing (one/two‑hand, distance). @defaultValue false */
    grabbing?: boolean;
    /** Physics simulation (Havok). @defaultValue false */
    physics?: boolean;
    /** Scene Understanding (planes/meshes/anchors). @defaultValue false */
    sceneUnderstanding?: boolean;
    /** Spatial UI systems (PanelUI/ScreenSpace/Follow). Boolean or config. @defaultValue true */
    spatialUI?:
      | boolean
      | {
          forwardHtmlEvents?: boolean;
          kits?: Array<Record<string, unknown>> | Record<string, unknown>;
        };
  };
};

/**
 * Initialize a new WebXR world with all required systems and setup
 *
 * @param sceneContainer - HTML container for the renderer canvas
 * @param assets - Asset manifest for preloading
 * @param options - Configuration options for the world
 * @returns Promise that resolves to the initialized World instance
 */
/**
 * Initialize a new WebXR world with all required systems and setup.
 *
 * @param sceneContainer HTML container for the renderer canvas.
 * @param options Configuration options for the world.
 * @returns Promise that resolves to the initialized {@link World} instance.
 *
 * @remarks
 * This function powers {@link World.create}. Prefer using that static helper.
 */
export function initializeWorld(
  container: HTMLDivElement,
  options: WorldOptions = {},
): Promise<World> {
  // Create and configure world instance
  const world = createWorldInstance();

  // Extract configuration options
  const config = extractConfiguration(options);

  // Setup core rendering components
  const { camera, renderer, scene } = setupRendering(container, config);
  assignRenderingToWorld(world, camera, renderer, scene);

  // Setup input management
  setupInputManagement(world);

  // Store XR defaults for later explicit launch/offer calls
  world.xrDefaults = {
    sessionMode: config.xr.sessionMode,
    referenceSpace: config.xr.referenceSpace,
    features: config.xr.features,
  };

  // Register core systems (LevelSystem receives defaultLighting)
  registerCoreSystems(world, config);

  // Initialize asset manager
  initializeAssetManager(renderer, world);

  // Register additional systems (UI + Audio on by default)
  registerAdditionalSystems(world);

  // Register input and feature systems with explicit priorities
  registerFeatureSystems(world, config);

  // Setup render loop
  setupRenderLoop(world, renderer);

  // Setup resize handling
  setupResizeHandling(camera, renderer);

  // Manage XR offer flow if configured
  if (config.xr.offer && config.xr.offer !== 'none') {
    manageOfferFlow(world, config.xr.offer);
  }

  // Return promise that resolves after asset preloading
  return finalizeInitialization(world, options.assets).then(async (w) => {
    // Load initial level or create empty level
    const levelUrl =
      typeof options.level === 'string' ? options.level : options.level?.url;
    if (levelUrl) {
      await w.loadLevel(levelUrl);
    } else {
      await w.loadLevel();
    }
    return w;
  });
}

/**
 * Create a new World instance with basic ECS setup
 */
function createWorldInstance(): World {
  const world = new World();
  world
    .registerComponent(Transform)
    .registerComponent(Visibility)
    .registerComponent(LevelTag)
    .registerSystem(TransformSystem)
    .registerSystem(VisibilitySystem);
  return world;
}

/**
 * Extract and normalize configuration options
 */
function extractConfiguration(options: WorldOptions) {
  return {
    cameraFov: options.render?.fov ?? 50,
    cameraNear: options.render?.near ?? 0.1,
    cameraFar: options.render?.far ?? 200,
    defaultLighting: options.render?.defaultLighting ?? true,
    xr: {
      sessionMode: options.xr?.sessionMode ?? SessionMode.ImmersiveVR,
      referenceSpace:
        options.xr?.referenceSpace ?? ReferenceSpaceType.LocalFloor,
      features: options.xr?.features,
      offer: options.xr?.offer ?? 'always',
    },
    features: {
      locomotion: options.features?.locomotion ?? false,
      grabbing: options.features?.grabbing ?? false,
      physics: options.features?.physics ?? false,
      sceneUnderstanding: options.features?.sceneUnderstanding ?? false,
      spatialUI: options.features?.spatialUI ?? true,
    },
  } as const;
}

/**
 * Setup camera, renderer, and scene
 */
function setupRendering(sceneContainer: HTMLDivElement, config: any) {
  // Camera Setup
  const camera = new PerspectiveCamera(
    config.cameraFov,
    window.innerWidth / window.innerHeight,
    config.cameraNear,
    config.cameraFar,
  );
  camera.position.set(0, 1.7, 0);

  // Renderer Setup
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: config.xr.sessionMode === SessionMode.ImmersiveAR,
    // @ts-ignore
    multiviewStereo: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.xr.enabled = true;
  sceneContainer.appendChild(renderer.domElement);

  // Scene Setup
  const scene = new Scene();

  return { camera, renderer, scene };
}

/**
 * Assign rendering components to world instance
 */
function assignRenderingToWorld(
  world: World,
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  scene: Scene,
) {
  world.scene = scene;
  world.camera = camera;
  world.renderer = renderer;
  // Scene entity (wrap Scene in an entity for parenting convenience)
  world.sceneEntity = world.createTransformEntity(scene);
  // Create a default level root so activeLevel is always defined
  const levelRootEntity = world.createTransformEntity(undefined, {
    parent: world.sceneEntity,
  });
  levelRootEntity.object3D!.name = 'LevelRoot';
  // @ts-ignore init signal now; LevelSystem will enforce identity each frame
  world.activeLevel = signal(levelRootEntity);
}

/**
 * Setup default lighting environment using Unity-style gradient ambient lighting
 */
// default lighting is attached per level by LevelSystem

/**
 * Setup XR input management
 */
function setupInputManagement(world: World): XRInputManager {
  const inputManager = new XRInputManager({
    camera: world.camera,
    scene: world.scene,
    assetLoader: AssetManager,
  });
  world.scene.add(inputManager.xrOrigin);
  inputManager.xrOrigin.add(world.camera);
  world.player = inputManager.xrOrigin;
  world.input = inputManager;

  return inputManager;
}

/**
 * Manage offering XR sessions according to the configured offer policy.
 * - 'once': offer after init; no re-offer on end
 * - 'always': offer after init and re-offer whenever the session ends
 */
function manageOfferFlow(world: World, mode: 'once' | 'always') {
  let offering = false;
  const offer = async () => {
    if (offering || world.session) {
      return;
    }
    offering = true;
    try {
      const opts = world.xrDefaults ?? { sessionMode: SessionMode.ImmersiveVR };
      const sessionInit = buildSessionInit(opts as XROptions);

      const session = await navigator.xr?.offerSession?.(
        opts.sessionMode ?? SessionMode.ImmersiveVR,
        // if the dynamic import failed, rebuild via launchXR path by calling request, but we only want offer
        sessionInit as XRSessionInit,
      );
      if (!session) {
        return;
      }

      const refSpec = normalizeReferenceSpec(opts.referenceSpace);
      session.addEventListener('end', onEnd);
      try {
        const resolvedType = await resolveReferenceSpaceType(
          session,
          refSpec.type,
          refSpec.required ? [] : refSpec.fallbackOrder,
        );
        world.renderer.xr.setReferenceSpaceType(
          resolvedType as unknown as XRReferenceSpaceType,
        );
        await world.renderer.xr.setSession(session);
        world.session = session;
      } catch (err) {
        console.error('[XR] Failed to acquire reference space:', err);
        try {
          await session.end();
        } catch {}
      }
    } finally {
      offering = false;
    }
  };

  const onEnd = () => {
    world.session?.removeEventListener('end', onEnd);
    world.session = undefined;
    if (mode === 'always') {
      // re-offer after session ends
      offer();
    }
  };

  // initial offer once world is ready
  offer();
}

/**
 * Register core interaction systems
 */
function registerCoreSystems(
  world: World,
  config: ReturnType<typeof extractConfiguration>,
) {
  world
    .registerComponent(Interactable)
    .registerComponent(Hovered)
    .registerComponent(Pressed)
    .registerComponent(LevelRoot)
    // New split components
    .registerComponent(DomeTexture)
    .registerComponent(DomeGradient)
    .registerComponent(IBLTexture)
    .registerComponent(IBLGradient)
    // Unified environment system (background + IBL)
    .registerSystem(EnvironmentSystem)
    .registerSystem(LevelSystem, {
      configData: { defaultLighting: config.defaultLighting },
    });
}

/**
 * Initialize the asset manager
 */
function initializeAssetManager(renderer: WebGLRenderer, world: World) {
  AssetManager.init(renderer, world);
}

/**
 * Register optional systems based on configuration
 */
function registerAdditionalSystems(world: World) {
  // Audio system remains always-on
  world.registerComponent(AudioSource).registerSystem(AudioSystem);
}

function registerFeatureSystems(
  world: World,
  config: ReturnType<typeof extractConfiguration>,
) {
  const locomotion = config.features.locomotion as
    | boolean
    | { useWorker?: boolean };
  const locomotionEnabled = !!locomotion;
  const grabbingEnabled = !!config.features.grabbing;
  const physicsEnabled = !!config.features.physics;
  const sceneUnderstandingEnabled = !!config.features.sceneUnderstanding;
  const spatialUI = config.features.spatialUI as
    | boolean
    | { forwardHtmlEvents?: boolean; kits?: any };
  const spatialUIEnabled = !!spatialUI;

  if (locomotionEnabled) {
    const locOpts =
      typeof locomotion === 'object' && locomotion
        ? { useWorker: locomotion.useWorker }
        : undefined;
    world.registerSystem(LocomotionSystem, {
      priority: -5,
      configData: locOpts,
    });
  }
  world.registerSystem(InputSystem, { priority: -4 });
  if (grabbingEnabled) {
    world.registerSystem(GrabSystem, { priority: -3 });
  }

  // Physics runs after Grab so it can respect Pressed overrides
  if (physicsEnabled) {
    world
      .registerComponent(PhysicsBody)
      .registerComponent(PhysicsShape)
      .registerComponent(PhysicsManipulation)
      .registerSystem(PhysicsSystem, { priority: -2 });
  }

  // Scene Understanding updates plane/mesh/anchor debug after input/physics
  if (sceneUnderstandingEnabled) {
    world
      .registerComponent(XRPlane)
      .registerComponent(XRMesh)
      .registerComponent(XRAnchor)
      .registerSystem(SceneUnderstandingSystem, { priority: -1 });
  }

  // Spatial UI systems (Panel, ScreenSpace, Follow)
  if (spatialUIEnabled) {
    const forwardHtmlEvents =
      typeof spatialUI === 'object' && spatialUI
        ? spatialUI.forwardHtmlEvents
        : undefined;
    const kitsVal =
      typeof spatialUI === 'object' && spatialUI ? spatialUI.kits : undefined;
    const kitsObj = Array.isArray(kitsVal)
      ? Object.assign({}, ...(kitsVal as Array<Record<string, unknown>>))
      : kitsVal;

    world
      .registerComponent(PanelUI)
      .registerComponent(ScreenSpace)
      .registerComponent(Follower)
      .registerSystem(PanelUISystem, {
        configData: {
          ...(forwardHtmlEvents !== undefined ? { forwardHtmlEvents } : {}),
          ...(kitsObj ? { kits: kitsObj } : {}),
        },
      })
      .registerSystem(ScreenSpaceUISystem)
      .registerSystem(FollowSystem);
  }
}

/**
 * Setup the main render loop
 */
function setupRenderLoop(world: World, renderer: WebGLRenderer) {
  const clock = new Clock();

  const render = () => {
    const delta = clock.getDelta();
    const elapsedTime = clock.elapsedTime;
    world.visibilityState.value = (world.session?.visibilityState ??
      VisibilityState.NonImmersive) as VisibilityState;
    // Run ECS systems in priority order (InputSystem => LocomotionSystem => GrabSystem)
    world.update(delta, elapsedTime);
    renderer.render(world.scene, world.camera);
  };

  renderer.setAnimationLoop(render);

  // No explicit sessionend handling required on r177; WebXRManager handles
  // render target and canvas sizing restoration internally.
}

/**
 * Setup window resize handling
 */
function setupResizeHandling(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
) {
  const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', onWindowResize, false);
}

/**
 * Finalize initialization with asset preloading
 */
function finalizeInitialization(
  world: World,
  assets?: AssetManifest,
): Promise<World> {
  return new Promise<World>((resolve, reject) => {
    if (!assets || Object.keys(assets).length === 0) {
      return resolve(world);
    }
    AssetManager.preloadAssets(assets)
      .then(() => resolve(world))
      .catch(reject);
  });
}
