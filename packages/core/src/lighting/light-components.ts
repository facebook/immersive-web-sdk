/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

type FieldPresentation = {
  description?: string;
  help?: string;
  label?: string;
  step?: number;
  widget?: 'slider' | 'color' | 'vector' | 'text' | 'select';
};

const color = (defaultValue: [number, number, number, number], label: string) =>
  ({
    default: defaultValue,
    label,
    type: Types.Color,
    widget: 'color',
  }) as const satisfies {
    default: [number, number, number, number];
    type: Types.Color;
  } & FieldPresentation;

const number = (
  defaultValue: number,
  label: string,
  options: FieldPresentation & { max?: number; min?: number } = {},
) =>
  ({
    default: defaultValue,
    label,
    type: Types.Float32,
    ...options,
  }) as const satisfies {
    default: number;
    max?: number;
    min?: number;
    type: Types.Float32;
  } & FieldPresentation;

const castShadow = {
  default: false,
  label: 'Cast shadow',
  type: Types.Boolean,
} as const satisfies {
  default: boolean;
  type: Types.Boolean;
} & FieldPresentation;

export const LightShadowMapSize = {
  Size256: '256',
  Size512: '512',
  Size1024: '1024',
  Size2048: '2048',
} as const;

const shadowMapSize = {
  default: LightShadowMapSize.Size1024,
  enum: LightShadowMapSize,
  help: 'Square shadow texture resolution. Higher values cost more GPU memory and fill rate.',
  label: 'Shadow resolution',
  type: Types.Enum,
} as const;

const shadowBias = number(0, 'Shadow bias', { step: 0.0001 });
const shadowNormalBias = number(0, 'Shadow normal bias', {
  min: 0,
  step: 0.001,
});
const shadowRadius = number(1, 'Shadow radius', { min: 0, step: 0.1 });
const shadowCameraNear = number(0.1, 'Shadow near', {
  min: 0.001,
  step: 0.1,
});
const shadowCameraFar = number(100, 'Shadow far', {
  min: 0.001,
  step: 1,
});

const directLightFields = {
  castShadow,
  shadowBias,
  shadowCameraFar,
  shadowCameraNear,
  shadowMapSize,
  shadowNormalBias,
  shadowRadius,
};

const WHITE: [number, number, number, number] = [1, 1, 1, 1];

/** Uniform, non-directional illumination. Transform has no effect. */
export const AmbientLightComponent = createComponent(
  'AmbientLight',
  {
    color: color(WHITE, 'Color'),
    intensity: number(1, 'Intensity', { min: 0, step: 0.1 }),
  },
  'Uniform ambient light',
);

/** World-up sky and ground illumination. Transform has no effect. */
export const HemisphereLightComponent = createComponent(
  'HemisphereLight',
  {
    groundColor: color([0.1, 0.1, 0.1, 1], 'Ground color'),
    intensity: number(1, 'Intensity', { min: 0, step: 0.1 }),
    skyColor: color(WHITE, 'Sky color'),
  },
  'World-up sky and ground light',
);

/** Parallel light emitted along the entity's local -Z axis. */
export const DirectionalLightComponent = createComponent(
  'DirectionalLight',
  {
    color: color(WHITE, 'Color'),
    intensity: number(1, 'Intensity', { min: 0, step: 0.1 }),
    ...directLightFields,
    shadowCameraSize: number(10, 'Shadow camera size', {
      help: 'Width and height in meters of the orthographic shadow volume.',
      min: 0.001,
      step: 0.5,
    }),
  },
  'Parallel light aimed along local -Z',
);

/** Omnidirectional positional light. Intensity is measured in candela. */
export const PointLightComponent = createComponent(
  'PointLight',
  {
    color: color(WHITE, 'Color'),
    decay: number(2, 'Decay', {
      help: 'Use 2 for physically correct inverse-square falloff.',
      min: 0,
      step: 0.1,
    }),
    distance: number(0, 'Distance', {
      help: 'Maximum range in meters. Zero means no cutoff.',
      min: 0,
      step: 0.1,
    }),
    intensity: number(1, 'Intensity (cd)', { min: 0, step: 1 }),
    ...directLightFields,
  },
  'Omnidirectional positional light',
);

/** Cone light emitted along the entity's local -Z axis. */
export const SpotLightComponent = createComponent(
  'SpotLight',
  {
    angleDeg: number(60, 'Cone angle', {
      help: 'Half-angle of the light cone in degrees.',
      max: 90,
      min: 0.1,
      step: 1,
    }),
    color: color(WHITE, 'Color'),
    decay: number(2, 'Decay', {
      help: 'Use 2 for physically correct inverse-square falloff.',
      min: 0,
      step: 0.1,
    }),
    distance: number(0, 'Distance', {
      help: 'Maximum range in meters. Zero means no cutoff.',
      min: 0,
      step: 0.1,
    }),
    intensity: number(1, 'Intensity (cd)', { min: 0, step: 1 }),
    penumbra: number(0, 'Penumbra', {
      max: 1,
      min: 0,
      step: 0.05,
      widget: 'slider',
    }),
    ...directLightFields,
  },
  'Cone light aimed along local -Z',
);

/** PBR area light emitted from a rectangle along the entity's local -Z axis. */
export const RectAreaLightComponent = createComponent(
  'RectAreaLight',
  {
    color: color(WHITE, 'Color'),
    height: number(1, 'Height', { min: 0.001, step: 0.1 }),
    intensity: number(1, 'Intensity (nit)', { min: 0, step: 1 }),
    width: number(1, 'Width', { min: 0.001, step: 0.1 }),
  },
  'PBR rectangular area light aimed along local -Z',
);

export const IWSDK_LIGHT_COMPONENTS = [
  AmbientLightComponent,
  HemisphereLightComponent,
  DirectionalLightComponent,
  PointLightComponent,
  SpotLightComponent,
  RectAreaLightComponent,
] as const;
