/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from '../ecs/world.js';
import { attachBrowserCameraRestore } from './browser-camera.js';

/** WebXR session modes supported by IWSDK. @category Runtime */
export enum SessionMode {
  ImmersiveVR = 'immersive-vr',
  ImmersiveAR = 'immersive-ar',
}

/** Common WebXR reference spaces. @category Runtime */
export enum ReferenceSpaceType {
  BoundedFloor = 'bounded-floor',
  Local = 'local',
  LocalFloor = 'local-floor',
  Unbounded = 'unbounded',
  Viewer = 'viewer',
}

/**
 * Flag style for enabling a feature.
 * - `true` => request as optional
 * - `{ required: true }` => request as required
 * - `false`/`undefined` => do not request
 * @category Runtime
 */
export type FeatureFlag = boolean | { required?: boolean };

/** Depth sensing feature configuration. @category Runtime */
export type DepthSensingFlag =
  | boolean
  | {
      required?: boolean;
      /** Depth usage preference. */
      usage?: 'cpu-optimized' | 'gpu-optimized';
      /** Depth data format preference. */
      format?: 'luminance-alpha' | 'float32';
    };

/** Structured feature flags supported by IWSDK. @category Runtime */
export type XRFeatureOptions = {
  handTracking?: FeatureFlag;
  anchors?: FeatureFlag;
  hitTest?: FeatureFlag;
  planeDetection?: FeatureFlag;
  meshDetection?: FeatureFlag;
  depthSensing?: DepthSensingFlag;
  /**
   * WebXR Layers. Defaults to optional even if not set, to maximize success.
   * You may set `{ required: true }` to require layers.
   */
  layers?: FeatureFlag;
  unbounded?: FeatureFlag;
  /**
   * Eye/gaze tracking, used to drive gaze interactions. When granted, the
   * runtime surfaces an `XRInputSource` with `targetRayMode === 'gaze'` and
   * IWSDK drives {@link XROrigin.eyeSpace} from its target-ray pose. When
   * unavailable, ordinary hand/controller rays remain active.
   *
   * Requesting this also registers `GazeSystem`.
   */
  gazeTracking?: FeatureFlag;
  /**
   * @deprecated Use {@link XRFeatureOptions.gazeTracking}. Kept as an alias
   * for the W3C draft's `'eye-tracking'` descriptor name.
   */
  eyeTracking?: FeatureFlag;
};

/** Reference space configuration. @category Runtime */
export type ReferenceSpaceSpec =
  | ReferenceSpaceType
  | {
      /** Preferred reference space type. @defaultValue 'local-floor' */
      type?: ReferenceSpaceType;
      /** If true, do not fall back to other spaces on failure. */
      required?: boolean;
      /**
       * Fallback order if preferred type is unavailable.
       * @defaultValue ['local', 'viewer']
       */
      fallbackOrder?: ReferenceSpaceType[];
    };

/** Options for launching an XR session. @category Runtime */
export type XROptions = {
  /** Session mode to request. @defaultValue SessionMode.ImmersiveVR */
  sessionMode?: SessionMode;
  /** Reference space policy (preferred + fallback). */
  referenceSpace?: ReferenceSpaceSpec;
  /** Structured feature flags; avoids raw string arrays. */
  features?: XRFeatureOptions;
  /**
   * Auto-restore `world.camera` to its pre-XR local transform and
   * projection when the session ends. Without this, `WebGLRenderer.xr`
   * leaves the camera at the last head pose and the 2D fallback view is
   * inside-the-head until the user re-applies a camera setup. Restore is
   * deferred one rAF so `WebXRManager` finishes tearing down on the
   * end-tick before the camera is overwritten.
   * @defaultValue true
   */
  restoreCameraOnExit?: boolean;
  /**
   * Launch XR when the browser grants an immersive session through an external
   * entry point such as a headset deep link. The listener is armed before
   * asynchronous world initialization so an early grant is not lost.
   * This takes precedence over `offer`; IWSDK does not run both native grant
   * and offer flows for the same world.
   * @defaultValue false
   */
  launchOnSessionGranted?: boolean;
};

/** Default optional features appended to requests/offers. */
const defaultOffers = ['local-floor', 'bounded-floor', 'layers'] as const;

/** Normalize a {@link FeatureFlag} to `{ required?: boolean } | undefined`. */
function normalizeFlag(flag?: FeatureFlag): { required?: boolean } | undefined {
  if (flag === undefined || flag === false) {
    return undefined;
  }
  if (flag === true) {
    return {};
  }
  return { required: !!flag.required };
}

function isDepthFlagObject(
  flag: DepthSensingFlag | undefined,
): flag is Exclude<DepthSensingFlag, boolean | undefined> {
  return typeof flag === 'object';
}

/** Build `XRSessionInit` from structured feature flags. */
export function buildSessionInit(opts: XROptions): XRSessionInit {
  const requiredFeatures: string[] = [];
  // Always offer helpful optional features by default
  const optionalFeatures: string[] = Array.from(new Set(defaultOffers));

  const f = opts.features ?? {};

  const map: Record<keyof XRFeatureOptions, string> = {
    handTracking: 'hand-tracking',
    anchors: 'anchors',
    hitTest: 'hit-test',
    planeDetection: 'plane-detection',
    meshDetection: 'mesh-detection',
    depthSensing: 'depth-sensing',
    layers: 'layers',
    unbounded: 'unbounded',
    gazeTracking: 'gaze-tracking',
    eyeTracking: 'eye-tracking',
  } as const;

  const push = (
    key: keyof XRFeatureOptions,
    normalized: { required?: boolean } | undefined,
  ) => {
    if (!normalized) {
      return;
    }
    const token = map[key];
    if (normalized.required) {
      requiredFeatures.push(token);
    } else {
      optionalFeatures.push(token);
    }
  };

  // Simple flags
  push('handTracking', normalizeFlag(f.handTracking));
  push('anchors', normalizeFlag(f.anchors));
  push('hitTest', normalizeFlag(f.hitTest));
  push('planeDetection', normalizeFlag(f.planeDetection));
  push('meshDetection', normalizeFlag(f.meshDetection));
  push('layers', normalizeFlag(f.layers));
  push('unbounded', normalizeFlag(f.unbounded));

  // Eye gaze is exposed under two descriptor names: 'gaze-tracking' (what the
  // Meta Quest Browser accepts today, and what surfaces the
  // `targetRayMode === 'gaze'` input source) and 'eye-tracking' (the W3C
  // draft name). Honor required/optional exactly for whichever the app named,
  // then offer the other as *optional* so the same app works on either
  // runtime — unrecognized optional descriptors are ignored, whereas an
  // unrecognized required one fails the whole session request.
  const gaze = normalizeFlag(f.gazeTracking);
  const eye = normalizeFlag(f.eyeTracking);
  push('gazeTracking', gaze);
  push('eyeTracking', eye);
  if (gaze && !eye && f.eyeTracking !== false) {
    optionalFeatures.push(map.eyeTracking);
  }
  if (eye && !gaze && f.gazeTracking !== false) {
    optionalFeatures.push(map.gazeTracking);
  }

  // Depth sensing (may include preferences)
  if (f.depthSensing) {
    const normalized = normalizeFlag(
      isDepthFlagObject(f.depthSensing)
        ? { required: f.depthSensing.required }
        : f.depthSensing,
    );
    push('depthSensing', normalized);
  }

  const sessionInit: XRSessionInit = {
    requiredFeatures: Array.from(new Set(requiredFeatures)),
    optionalFeatures: Array.from(new Set(optionalFeatures)),
  };

  if (isDepthFlagObject(f.depthSensing)) {
    const usage = f.depthSensing.usage
      ? ([f.depthSensing.usage] as XRDepthUsage[])
      : undefined;
    const format = f.depthSensing.format
      ? ([f.depthSensing.format] as XRDepthDataFormat[])
      : undefined;
    // Use DOM XRDepthStateInit typing where available
    (
      sessionInit as XRSessionInit & {
        depthSensing?: XRDepthStateInit;
      }
    ).depthSensing = {
      ...(usage ? { usagePreference: usage } : {}),
      ...(format ? { dataFormatPreference: format } : {}),
    } as XRDepthStateInit;
  }

  return sessionInit;
}

export function normalizeReferenceSpec(
  spec?: ReferenceSpaceSpec,
): Required<Exclude<ReferenceSpaceSpec, ReferenceSpaceType>> {
  if (!spec || typeof spec === 'string') {
    return {
      type: (spec as ReferenceSpaceType) ?? ReferenceSpaceType.LocalFloor,
      required: false,
      fallbackOrder: [ReferenceSpaceType.Local, ReferenceSpaceType.Viewer],
    };
  }
  return {
    type: spec.type ?? ReferenceSpaceType.LocalFloor,
    required: !!spec.required,
    fallbackOrder: spec.fallbackOrder ?? [
      ReferenceSpaceType.Local,
      ReferenceSpaceType.Viewer,
    ],
  };
}

function mergeXROptions(
  base: XROptions | undefined,
  overrides?: Partial<XROptions>,
): XROptions {
  const b = base ?? {};
  const o = overrides ?? {};
  const mergedFeatures = { ...(b.features ?? {}), ...(o.features ?? {}) };
  const merged: XROptions = {
    sessionMode: o.sessionMode ?? b.sessionMode ?? SessionMode.ImmersiveVR,
    referenceSpace: o.referenceSpace ?? b.referenceSpace,
    features: Object.keys(mergedFeatures).length ? mergedFeatures : undefined,
    restoreCameraOnExit: o.restoreCameraOnExit ?? b.restoreCameraOnExit ?? true,
    launchOnSessionGranted:
      o.launchOnSessionGranted ?? b.launchOnSessionGranted ?? false,
  };
  return merged;
}

export async function resolveReferenceSpaceType(
  session: XRSession,
  preferred: ReferenceSpaceType,
  fallbacks: ReferenceSpaceType[],
): Promise<ReferenceSpaceType> {
  const candidates: ReferenceSpaceType[] = [];
  for (const t of [preferred, ...fallbacks]) {
    if (!candidates.includes(t)) {
      candidates.push(t);
    }
  }

  for (const type of candidates) {
    try {
      // Probe support; three.js will request again using the resolved type.
      await session.requestReferenceSpace(
        type as unknown as XRReferenceSpaceType,
      );
      return type;
    } catch (_err) {
      // continue
    }
  }
  // If nothing worked, throw; caller will end the session.
  throw new Error('No supported reference space available');
}

type SessionEndedCallback = () => void;

type PendingSessionAdoption = {
  session: XRSession;
  promise: Promise<boolean>;
};

const pendingSessionAdoptions = new WeakMap<World, PendingSessionAdoption>();

async function safelyEndSession(session: XRSession): Promise<void> {
  try {
    await session.end();
  } catch {}
}

/**
 * Adopt a native or emulated session into the world's renderer. Concurrent
 * offer/request paths reconcile here: the first successfully adopted session
 * wins and any later session is ended.
 *
 * @internal
 */
export async function adoptXRSession(
  world: World,
  session: XRSession,
  options: XROptions,
  onSessionEnded?: SessionEndedCallback,
): Promise<boolean> {
  if (world.session != null) {
    if (world.session !== session) {
      await safelyEndSession(session);
    }
    return world.session === session;
  }

  const existingPending = pendingSessionAdoptions.get(world);
  if (existingPending?.session === session) {
    return existingPending.promise;
  }

  const refSpec = normalizeReferenceSpec(options.referenceSpace);
  let sessionEnded = false;
  let sessionEndNotified = false;
  const notifySessionEnded = () => {
    if (sessionEndNotified) {
      return;
    }
    sessionEndNotified = true;
    onSessionEnded?.();
  };
  const onEnd = () => {
    sessionEnded = true;
    session.removeEventListener('end', onEnd);
    if (world.session === session) {
      world.session = undefined;
    }
    notifySessionEnded();
  };
  session.addEventListener('end', onEnd);

  while (true) {
    const pending = pendingSessionAdoptions.get(world);
    if (pending == null) {
      break;
    }
    if (pending.session === session) {
      session.removeEventListener('end', onEnd);
      return pending.promise;
    }
    const adopted = await pending.promise;
    if (sessionEnded) {
      return false;
    }
    if (adopted || world.session != null) {
      session.removeEventListener('end', onEnd);
      await safelyEndSession(session);
      return false;
    }
    // Another waiter may have claimed the now-free adoption slot before this
    // continuation ran. Loop and reconcile with it instead of racing it.
  }

  const adoption = (async (): Promise<boolean> => {
    try {
      const resolvedType = await resolveReferenceSpaceType(
        session,
        refSpec.type,
        refSpec.required ? [] : refSpec.fallbackOrder,
      );
      if (sessionEnded) {
        return false;
      }
      world.renderer.xr.getDepthSensingMesh = function () {
        return null;
      };
      world.renderer.xr.setReferenceSpaceType(
        resolvedType as unknown as XRReferenceSpaceType,
      );
      if (options.restoreCameraOnExit !== false) {
        attachBrowserCameraRestore(world.camera, session);
      }
      await world.renderer.xr.setSession(session);
      if (sessionEnded) {
        session.removeEventListener('end', onEnd);
        return false;
      }
      if (world.session != null && world.session !== session) {
        session.removeEventListener('end', onEnd);
        await safelyEndSession(session);
        return false;
      }
      world.session = session;
      return true;
    } catch (err) {
      session.removeEventListener('end', onEnd);
      console.error('[XR] Failed to acquire reference space:', err);
      await safelyEndSession(session);
      notifySessionEnded();
      return false;
    }
  })();
  pendingSessionAdoptions.set(world, { session, promise: adoption });
  try {
    return await adoption;
  } finally {
    if (pendingSessionAdoptions.get(world)?.promise === adoption) {
      pendingSessionAdoptions.delete(world);
    }
  }
}

/**
 * Explicitly request a WebXR session with the given options.
 *
 * @param world Target world.
 * @param options Partial overrides merged with {@link World.xrDefaults}.
 * @category Runtime
 */
export function launchXR(world: World, options?: Partial<XROptions>) {
  if (world.xrEnabled === false) {
    throw new Error(
      'XR is disabled for this world. Create it with an XR configuration instead of { xr: false } before calling launchXR().',
    );
  }

  if (world.session != null) {
    console.error('XRSession already exists');
    return;
  }
  if (world.sessionRequestPending) {
    return;
  }

  const merged = mergeXROptions(world.xrDefaults, options);
  const { sessionMode = SessionMode.ImmersiveVR } = merged;
  const sessionOptions = buildSessionInit(merged);

  world.sessionRequestPending = true;
  world.renderer.xr.enabled = true;
  let request: Promise<XRSession> | undefined;
  try {
    request = navigator.xr?.requestSession?.(sessionMode, sessionOptions);
  } catch (error) {
    world.sessionRequestPending = false;
    console.error('[XR] Failed to start XR session:', error);
    return;
  }

  Promise.resolve(request)
    .then((session) =>
      session == null ? undefined : adoptXRSession(world, session, merged),
    )
    .catch((error) => {
      // requestSession rejects when the user denies permission, the device is
      // unavailable, or the requested features are unsupported.
      console.error('[XR] Failed to start XR session:', error);
    })
    .finally(() => {
      world.sessionRequestPending = false;
    });
}
