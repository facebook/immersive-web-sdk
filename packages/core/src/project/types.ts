/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { WorldOptions } from '../init/world-initializer.js';

/** Version discriminator for the first IWSDK project manifest contract. */
export const IWSDK_PROJECT_MANIFEST_VERSION = 'iwsdk.project.v1' as const;

/** JSON representation of a regular expression used by development tooling. */
export interface ProjectRegexSpec {
  source: string;
  flags?: string;
}

export type ProjectXRMode = 'vr' | 'ar';
export type ProjectXROffer = 'none' | 'once' | 'always';
export type ProjectReferenceSpaceType =
  | 'bounded-floor'
  | 'local'
  | 'local-floor'
  | 'unbounded'
  | 'viewer';

export type ProjectXRFeatureFlag = boolean | { required?: boolean };

export type ProjectDepthSensingFlag =
  | boolean
  | {
      required?: boolean;
      usage?: 'cpu-optimized' | 'gpu-optimized';
      format?: 'luminance-alpha' | 'float32';
    };

export interface ProjectXRFeatureOptions {
  handTracking?: ProjectXRFeatureFlag;
  anchors?: ProjectXRFeatureFlag;
  hitTest?: ProjectXRFeatureFlag;
  planeDetection?: ProjectXRFeatureFlag;
  meshDetection?: ProjectXRFeatureFlag;
  depthSensing?: ProjectDepthSensingFlag;
  layers?: ProjectXRFeatureFlag;
  unbounded?: ProjectXRFeatureFlag;
}

export type ProjectReferenceSpaceSpec =
  | ProjectReferenceSpaceType
  | {
      type?: ProjectReferenceSpaceType;
      required?: boolean;
      fallbackOrder?: ProjectReferenceSpaceType[];
    };

export interface ProjectXROptions {
  mode: ProjectXRMode;
  offer?: ProjectXROffer;
  referenceSpace?: ProjectReferenceSpaceSpec;
  restoreCameraOnExit?: boolean;
  features?: ProjectXRFeatureOptions;
}

export interface ProjectCameraOptions {
  position?: [number, number, number];
  rotation?: [number, number, number];
  quaternion?: [number, number, number, number];
  lookAt?: [number, number, number];
}

export interface ProjectRenderOptions {
  fov?: number;
  near?: number;
  far?: number;
  stencil?: boolean;
  camera?: ProjectCameraOptions;
}

export type ProjectCanvasPointerEventsOption =
  | boolean
  | {
      enabled?: boolean;
      activeDuringXR?: boolean;
    };

export interface ProjectInputOptions {
  canvasPointerEvents?: ProjectCanvasPointerEventsOption;
}

export type ProjectBrowserLocomotionControls =
  | boolean
  | {
      keyboard?: boolean;
      gamepad?: boolean;
    };

export type ProjectTurningMethod = 'snap' | 'smooth';

export type ProjectLocomotionOptions =
  | boolean
  | {
      useWorker?: boolean;
      initialPlayerPosition?: [number, number, number];
      comfortAssistLevel?: number;
      turningMethod?: ProjectTurningMethod;
      enableJumping?: boolean;
      browserControls?: ProjectBrowserLocomotionControls;
    };

export type ProjectGrabbingOptions =
  | boolean
  | { useHandPinchForGrab?: boolean };

export type ProjectPhysicsOptions =
  | boolean
  | {
      useWorker?: boolean;
      updateFrequency?: number;
      interpolation?: boolean;
    };

export type ProjectSceneUnderstandingOptions =
  | boolean
  | { showWireFrame?: boolean };

export type ProjectSpatialUIOptions =
  | boolean
  | {
      forwardHtmlEvents?: boolean;
      kit?: 'default' | 'horizon';
      preferredColorScheme?: 'system' | 'light' | 'dark';
    };

export interface ProjectFeatureOptions {
  locomotion?: ProjectLocomotionOptions;
  grabbing?: ProjectGrabbingOptions;
  physics?: ProjectPhysicsOptions;
  sceneUnderstanding?: ProjectSceneUnderstandingOptions;
  environmentRaycast?: boolean;
  camera?: boolean;
  spatialUI?: ProjectSpatialUIOptions;
}

export interface ProjectWorldConfiguration {
  xr: false | ProjectXROptions;
  input?: ProjectInputOptions;
  render?: ProjectRenderOptions;
  features?: ProjectFeatureOptions;
}

export type ProjectEmulatorDevice =
  | 'metaQuest2'
  | 'metaQuest3'
  | 'metaQuestPro'
  | 'oculusQuest1';

export type ProjectEmulatorEnvironment =
  | 'living_room'
  | 'meeting_room'
  | 'music_room'
  | 'office_large'
  | 'office_small';

export interface ProjectEmulatorOptions {
  device?: ProjectEmulatorDevice;
  iwer?: boolean;
  environment?: ProjectEmulatorEnvironment;
  activation?: 'localhost' | 'always' | ProjectRegexSpec;
  injectOnBuild?: boolean;
  userAgentException?: ProjectRegexSpec;
}

export interface ProjectDevOptions {
  emulator?: ProjectEmulatorOptions;
}

export interface ProjectModuleDeclaration {
  /** Extensionless, project-root-confined browser module source path. */
  module: string;
}

/** Declarative, JSON-safe IWSDK project authority. */
export interface IwsdkProjectManifestV1 {
  $schema?: string;
  version: typeof IWSDK_PROJECT_MANIFEST_VERSION;
  /** Project source path under public/ ending in .iwsdk.scene.json. */
  scene: string;
  assets?: ProjectModuleDeclaration;
  components?: ProjectModuleDeclaration;
  world: ProjectWorldConfiguration;
  dev?: ProjectDevOptions;
}

/** World options produced before Vite injects executable asset/component manifests. */
export type NormalizedProjectWorldOptions = Omit<
  WorldOptions,
  'assets' | 'components'
> & {
  level: string;
};

export interface NormalizedProjectDevOptions {
  emulator?: {
    device?: ProjectEmulatorDevice;
    iwer?: boolean;
    environment?: ProjectEmulatorEnvironment;
    activation?: 'localhost' | 'always' | RegExp;
    injectOnBuild?: boolean;
    userAgentException?: RegExp;
  };
}

export type ProjectManifestValidationIssueCode =
  | 'enum'
  | 'invalid-path'
  | 'invalid-regex'
  | 'required'
  | 'type'
  | 'unknown-key';

export interface ProjectManifestValidationIssue {
  path: string;
  code: ProjectManifestValidationIssueCode;
  message: string;
}

export interface ProjectManifestValidationResult {
  valid: boolean;
  issues: ProjectManifestValidationIssue[];
}
