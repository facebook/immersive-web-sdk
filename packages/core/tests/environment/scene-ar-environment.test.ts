/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveSceneAREnvironment,
  SceneAREnvironmentController,
} from '../../src/environment/scene-ar-environment.js';
import {
  AmbientLight,
  Color,
  Mesh,
  Scene,
  Texture,
  type WebGLRenderer,
} from '../../src/runtime/three.js';

const arSession = { environmentBlendMode: 'alpha-blend' } as XRSession;
const additiveSession = { environmentBlendMode: 'additive' } as XRSession;
const vrSession = { environmentBlendMode: 'opaque' } as XRSession;

function fixture() {
  const scene = new Scene();
  const authoredLight = new AmbientLight('#ffffff', 1);
  const authoredBackground = new Mesh();
  let clearAlpha = 1;
  const renderer = {
    getClearAlpha: () => clearAlpha,
    setClearAlpha: (value: number) => {
      clearAlpha = value;
    },
  } as WebGLRenderer;

  return {
    authoredBackground,
    authoredLight,
    controller: new SceneAREnvironmentController(scene, renderer),
    getClearAlpha: () => clearAlpha,
    scene,
  };
}

describe('scene AR environment policy', () => {
  it('always resolves transparent backgrounds for passthrough sessions', () => {
    expect(resolveSceneAREnvironment(undefined)).toEqual({
      background: 'environment',
      isAR: false,
    });
    expect(resolveSceneAREnvironment(vrSession)).toEqual({
      background: 'environment',
      isAR: false,
    });
    expect(resolveSceneAREnvironment(arSession)).toEqual({
      background: 'transparent',
      isAR: true,
    });
    expect(resolveSceneAREnvironment(additiveSession)).toEqual({
      background: 'transparent',
      isAR: true,
    });
  });

  it('retains the normal background outside AR', () => {
    const value = fixture();
    const background = new Color('#345678');
    value.scene.background = background;

    value.controller.update({
      authoredBackgrounds: [value.authoredBackground],
      session: vrSession,
    });

    expect(value.scene.background).toBe(background);
    expect(value.getClearAlpha()).toBe(1);
    expect(value.authoredBackground.visible).toBe(true);
  });

  it('makes the AR background transparent without changing authored lighting', () => {
    const value = fixture();
    const background = new Color('#789abc');
    const authoredIBL = new Texture();
    value.scene.add(value.authoredLight);
    value.scene.background = background;
    value.scene.environment = authoredIBL;

    value.controller.update({
      authoredBackgrounds: [value.authoredBackground],
      session: arSession,
    });

    expect(value.scene.background).toBeNull();
    expect(value.getClearAlpha()).toBe(0);
    expect(value.authoredBackground.visible).toBe(false);
    expect(value.authoredLight.visible).toBe(true);
    expect(value.scene.environment).toBe(authoredIBL);

    value.controller.update({
      authoredBackgrounds: [value.authoredBackground],
      session: null,
    });

    expect(value.scene.background).toBe(background);
    expect(value.getClearAlpha()).toBe(1);
    expect(value.authoredBackground.visible).toBe(true);
    expect(value.authoredLight.visible).toBe(true);
    expect(value.scene.environment).toBe(authoredIBL);
  });
});
