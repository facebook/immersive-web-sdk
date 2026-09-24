/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const CUBE_THEMES = [
  {
    id: 'theme-ember',
    label: 'Ember',
    core: 0xff7a18,
    emissive: 0xff5a12,
    accent: 0xffb36b,
    idle: '#3a2015',
    hover: '#65341b',
    selected: '#b64d0b',
  },
  {
    id: 'theme-tide',
    label: 'Tide',
    core: 0x42c7e8,
    emissive: 0x1598ba,
    accent: 0x9ce8f7,
    idle: '#15313a',
    hover: '#1d5362',
    selected: '#1686a3',
  },
  {
    id: 'theme-orchid',
    label: 'Orchid',
    core: 0xb98cff,
    emissive: 0x8058c7,
    accent: 0xd9c1ff,
    idle: '#2d2340',
    hover: '#4a3768',
    selected: '#7651b5',
  },
] as const;

export type CubeTheme = (typeof CUBE_THEMES)[number];
