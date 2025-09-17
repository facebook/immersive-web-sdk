/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from '../ecs/index.js';

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
  lightEstimation?: FeatureFlag;
  depthSensing?: DepthSensingFlag;
  /**
   * WebXR Layers. Defaults to optional even if not set, to maximize success.
   * You may set `{ required: true }` to require layers.
   */
  layers?: FeatureFlag;
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
    lightEstimation: 'light-estimation',
    depthSensing: 'depth-sensing',
    layers: 'layers',
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
  push('lightEstimation', normalizeFlag(f.lightEstimation));
  push('layers', normalizeFlag(f.layers));

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

/**
 * Explicitly request a WebXR session with the given options.
 *
 * @param world Target world.
 * @param options Partial overrides merged with {@link World.xrDefaults}.
 * @category Runtime
 */
export function launchXR(world: World, options?: Partial<XROptions>) {
  const merged = mergeXROptions(world.xrDefaults, options);
  const { sessionMode = SessionMode.ImmersiveVR } = merged;
  const refSpec = normalizeReferenceSpec(merged.referenceSpace);
  const sessionOptions = buildSessionInit(merged);

  const onSessionStart = async (session: XRSession) => {
    session.addEventListener('end', onSessionEnd);
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
  };

  const onSessionEnd = () => {
    world.session?.removeEventListener('end', onSessionEnd);
    world.session = undefined;
  };

  if (!world.session) {
    navigator.xr
      ?.requestSession?.(sessionMode, sessionOptions)
      .then(onSessionStart);
  } else {
    console.error('XRSession already exists');
  }
}
