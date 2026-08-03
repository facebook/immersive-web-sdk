/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { WorldOptions } from '../init/world-initializer.js';
import {
  normalizeProjectSourcePath,
  projectSceneSourcePathToRuntimeUrl,
} from './paths.js';
import type {
  IwsdkProjectManifestV1,
  NormalizedProjectDevOptions,
  NormalizedProjectWorldOptions,
  ProjectFeatureOptions,
  ProjectRegexSpec,
  ProjectXRFeatureOptions,
} from './types.js';
import { assertValidIwsdkProjectManifest } from './validation.js';

type RuntimeXROptions = Exclude<NonNullable<WorldOptions['xr']>, false>;

const TURNING_METHOD = {
  snap: 1,
  smooth: 2,
} as const;

/**
 * Normalize the JSON-safe world contract into the existing `World.create`
 * option shape. Asset and component values are intentionally not injected.
 */
export function normalizeProjectWorldOptions(
  value: unknown,
): NormalizedProjectWorldOptions {
  assertValidIwsdkProjectManifest(value);
  const manifest = value as IwsdkProjectManifestV1;
  const source = manifest.world;
  const xr = normalizeXR(source.xr);

  return {
    level: projectSceneSourcePathToRuntimeUrl(manifest.scene),
    xr,
    ...(source.input == null
      ? {}
      : {
          input: {
            ...(typeof source.input.canvasPointerEvents === 'object'
              ? {
                  canvasPointerEvents: {
                    ...source.input.canvasPointerEvents,
                  },
                }
              : 'canvasPointerEvents' in source.input
                ? {
                    canvasPointerEvents: source.input.canvasPointerEvents,
                  }
                : {}),
          },
        }),
    ...(source.render == null
      ? {}
      : {
          render: {
            ...source.render,
            ...(source.render.camera == null
              ? {}
              : { camera: { ...source.render.camera } }),
          },
        }),
    ...(source.features == null
      ? {}
      : { features: normalizeFeatures(source.features) }),
  };
}

/** Normalize manifest-owned development settings for Vite/plugin consumers. */
export function normalizeProjectDevOptions(
  value: unknown,
): NormalizedProjectDevOptions {
  assertValidIwsdkProjectManifest(value);
  const manifest = value as IwsdkProjectManifestV1;
  const dev = manifest.dev;
  if (dev == null) {
    return {};
  }
  const sourceEmulator = dev.emulator;
  const emulator: NormalizedProjectDevOptions['emulator'] =
    sourceEmulator == null
      ? undefined
      : {
          ...(sourceEmulator.device == null
            ? {}
            : { device: sourceEmulator.device }),
          ...(sourceEmulator.iwer == null ? {} : { iwer: sourceEmulator.iwer }),
          ...(sourceEmulator.environment == null
            ? {}
            : { environment: sourceEmulator.environment }),
          ...(sourceEmulator.activation == null
            ? {}
            : {
                activation:
                  typeof sourceEmulator.activation === 'object'
                    ? projectRegexSpecToRegExp(sourceEmulator.activation)
                    : sourceEmulator.activation,
              }),
          ...(sourceEmulator.injectOnBuild == null
            ? {}
            : { injectOnBuild: sourceEmulator.injectOnBuild }),
          ...(sourceEmulator.userAgentException == null
            ? {}
            : {
                userAgentException: projectRegexSpecToRegExp(
                  sourceEmulator.userAgentException,
                ),
              }),
        };
  return {
    ...(emulator == null ? {} : { emulator }),
  };
}

/** Normalize an assets/components module declaration for Vite resolution. */
export function normalizeProjectModuleSourcePath(sourcePath: string): string {
  return normalizeProjectSourcePath(sourcePath, 'module');
}

/** Reconstruct a validated JSON regular-expression declaration. */
export function projectRegexSpecToRegExp(spec: ProjectRegexSpec): RegExp {
  return new RegExp(spec.source, spec.flags ?? '');
}

function normalizeXR(
  source: IwsdkProjectManifestV1['world']['xr'],
): NonNullable<WorldOptions['xr']> {
  if (source === false) {
    return false;
  }
  const sessionMode = (
    source.mode === 'vr' ? 'immersive-vr' : 'immersive-ar'
  ) as RuntimeXROptions['sessionMode'];
  return {
    sessionMode,
    ...(source.offer == null ? {} : { offer: source.offer }),
    ...(source.referenceSpace == null
      ? {}
      : {
          referenceSpace: cloneReferenceSpace(
            source.referenceSpace,
          ) as RuntimeXROptions['referenceSpace'],
        }),
    ...(source.restoreCameraOnExit == null
      ? {}
      : { restoreCameraOnExit: source.restoreCameraOnExit }),
    ...(source.features == null
      ? {}
      : { features: cloneXRFeatures(source.features) }),
  };
}

function cloneReferenceSpace(
  source: NonNullable<
    Exclude<IwsdkProjectManifestV1['world']['xr'], false>['referenceSpace']
  >,
) {
  return typeof source === 'string'
    ? source
    : {
        ...source,
        ...(source.fallbackOrder == null
          ? {}
          : { fallbackOrder: [...source.fallbackOrder] }),
      };
}

function cloneXRFeatures(
  source: ProjectXRFeatureOptions,
): NonNullable<RuntimeXROptions['features']> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value != null && typeof value === 'object' ? { ...value } : value,
    ]),
  ) as NonNullable<RuntimeXROptions['features']>;
}

function normalizeFeatures(
  source: ProjectFeatureOptions,
): NonNullable<WorldOptions['features']> {
  const features: NonNullable<WorldOptions['features']> = {};
  if (source.locomotion != null) {
    if (typeof source.locomotion === 'boolean') {
      features.locomotion = source.locomotion;
    } else {
      const { browserControls, initialPlayerPosition, turningMethod, ...rest } =
        source.locomotion;
      features.locomotion = {
        ...rest,
        ...(initialPlayerPosition == null
          ? {}
          : {
              initialPlayerPosition: [...initialPlayerPosition],
            }),
        ...(typeof browserControls === 'object'
          ? {
              browserControls: {
                ...browserControls,
              },
            }
          : browserControls == null
            ? {}
            : { browserControls }),
        ...(turningMethod == null
          ? {}
          : {
              turningMethod: TURNING_METHOD[turningMethod],
            }),
      } as Exclude<
        NonNullable<WorldOptions['features']>['locomotion'],
        boolean | undefined
      >;
    }
  }
  if (source.grabbing != null) {
    features.grabbing =
      typeof source.grabbing === 'boolean'
        ? source.grabbing
        : { ...source.grabbing };
  }
  if (source.physics != null) {
    features.physics = source.physics;
  }
  if (source.sceneUnderstanding != null) {
    features.sceneUnderstanding =
      typeof source.sceneUnderstanding === 'boolean'
        ? source.sceneUnderstanding
        : { ...source.sceneUnderstanding };
  }
  if (source.environmentRaycast != null) {
    features.environmentRaycast = source.environmentRaycast;
  }
  if (source.camera != null) {
    features.camera = source.camera;
  }
  if (source.spatialUI != null) {
    features.spatialUI =
      typeof source.spatialUI === 'boolean'
        ? source.spatialUI
        : { ...source.spatialUI };
  }
  return features;
}
