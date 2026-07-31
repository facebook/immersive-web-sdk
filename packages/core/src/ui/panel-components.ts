/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/component.js';

export const ColorSchemeType = {
  System: 'system',
  Light: 'light',
  Dark: 'dark',
} as const;

export type ColorScheme =
  (typeof ColorSchemeType)[keyof typeof ColorSchemeType];

export interface PanelUIProps {
  config: string;
  maxWidth?: number;
  maxHeight?: number;
}

export const PanelUI = createComponent(
  'PanelUI',
  {
    config: { type: Types.String, default: '' },
    maxWidth: { type: Types.Float32, default: 1 },
    maxHeight: { type: Types.Float32, default: 1 },
  },
  'Component for 3D panel UI elements with file-based configuration',
);

export const PanelDocument = createComponent(
  'PanelDocument',
  {
    document: { type: Types.Object, default: undefined },
  },
  'Internal component containing loaded UI document',
);
