/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  GrabSystem,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  UIKitMLAsset,
  VisibilityState,
  World,
} from '@iwsdk/core';
import { CUBE_THEMES, type CubeTheme } from './theme.js';

export function configureWelcomePanel(world: World, panel: UIKitMLAsset): void {
  const xrButton = panel.requireElementById('xr-button');
  const exitButton = panel.requireElementById('exit-button');
  const resetButton = panel.requireElementById('reset-cube-button');
  const uiStatus = panel.requireElementById('ui-status');
  const cubeEntity = world.requireSceneEntity('gaze-grab-cube');
  const cube = cubeEntity.object3D;
  if (!cube) {
    throw new Error('Scene node "gaze-grab-cube" has no Object3D');
  }
  const restPosition = cube.position.clone();
  const restQuaternion = cube.quaternion.clone();
  const restScale = cube.scale.clone();
  const paletteButtons = CUBE_THEMES.map((theme) => ({
    ...theme,
    element: panel.requireElementById(theme.id),
  }));
  let selectedTheme: (typeof CUBE_THEMES)[number]['id'] = CUBE_THEMES[0].id;

  const updatePalette = () => {
    for (const theme of paletteButtons) {
      const selected = theme.id === selectedTheme;
      theme.element.setProperties({
        backgroundColor: selected ? theme.selected : theme.idle,
        borderColor: selected ? '#ffffff' : '#50586a',
        color: selected ? '#ffffff' : '#d7dce5',
        hover: {
          backgroundColor: selected ? theme.selected : theme.hover,
          borderColor: '#ffffff',
          color: '#ffffff',
        },
        active: {
          backgroundColor: theme.selected,
          borderColor: '#ffffff',
          color: '#ffffff',
        },
      });
    }
  };

  const setCubeTheme = (theme: CubeTheme) => {
    cube.traverse((child) => {
      if (
        child instanceof Mesh &&
        child.name === 'gaze-cube-core' &&
        child.material instanceof MeshStandardMaterial
      ) {
        child.material.color.setHex(theme.core);
        child.material.emissive.setHex(theme.emissive);
      } else if (
        child instanceof Mesh &&
        child.name === 'gaze-cube-halo' &&
        child.material instanceof MeshBasicMaterial
      ) {
        child.material.color.setHex(theme.accent);
      } else if (
        child instanceof LineSegments &&
        child.name === 'gaze-cube-cage' &&
        child.material instanceof LineBasicMaterial
      ) {
        child.material.color.setHex(theme.accent);
      }
    });
  };

  let statusResetTimer: number | undefined;
  const showUIStatus = (text: string, resetAfter = 0) => {
    if (statusResetTimer !== undefined) {
      window.clearTimeout(statusResetTimer);
      statusResetTimer = undefined;
    }
    uiStatus.setProperties({ text });
    if (resetAfter > 0) {
      statusResetTimer = window.setTimeout(() => {
        uiStatus.setProperties({
          text: 'Look at a color, then pinch to apply',
        });
        statusResetTimer = undefined;
      }, resetAfter);
    }
  };

  for (const theme of paletteButtons) {
    theme.element.addEventListener('pointerenter', () => {
      showUIStatus(`Targeting ${theme.label}`);
    });
    theme.element.addEventListener('pointerleave', () => {
      if (statusResetTimer === undefined) {
        showUIStatus('Look at a color, then pinch to apply');
      }
    });
    theme.element.addEventListener('click', () => {
      selectedTheme = theme.id;
      setCubeTheme(theme);
      updatePalette();
      showUIStatus(`${theme.label} applied to cube`, 1800);
    });
  }
  updatePalette();

  resetButton.addEventListener('click', () => {
    world.getSystem(GrabSystem)?.forceRelease(cubeEntity);
    cube.position.copy(restPosition);
    cube.quaternion.copy(restQuaternion);
    cube.scale.copy(restScale);
    selectedTheme = CUBE_THEMES[0].id;
    setCubeTheme(CUBE_THEMES[0]);
    updatePalette();
    showUIStatus('Cube reset to Ember', 1800);
  });

  xrButton.addEventListener('click', () => {
    world.launchXR();
  });
  exitButton.addEventListener('click', () => {
    world.exitXR();
  });
  world.visibilityState.subscribe((visibilityState) => {
    const is2D = visibilityState === VisibilityState.NonImmersive;
    xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
    exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
  });
}
