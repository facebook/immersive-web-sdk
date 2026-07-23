/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_TARGETS,
  FEATURE_CATALOG,
  deriveXRFeatureStates,
  formatWorldOptions,
  getRecommendedConfiguration,
  getVariantId,
} from '../src/catalog.js';
import type { FeatureFlags } from '../src/types.js';

const ALL_FEATURES: FeatureFlags = {
  locomotionEnabled: true,
  locomotionUseWorker: true,
  grabbingEnabled: true,
  physicsEnabled: true,
  sceneUnderstandingEnabled: true,
  environmentRaycastEnabled: true,
};

describe('experience catalog', () => {
  it('defines browser, VR, and AR as distinct targets', () => {
    expect(Object.keys(EXPERIENCE_TARGETS).sort()).toEqual([
      'ar',
      'browser',
      'vr',
    ]);
    expect(EXPERIENCE_TARGETS.browser).toMatchObject({
      description: 'Start in a desktop browser without an immersive session.',
      label: 'Desktop 3D',
      xrEnabled: false,
    });
    expect(EXPERIENCE_TARGETS.vr).toMatchObject({
      mode: 'vr',
      xrEnabled: true,
    });
    expect(EXPERIENCE_TARGETS.ar).toMatchObject({
      mode: 'ar',
      xrEnabled: true,
    });
  });

  it('keeps prompt, default, reversibility, and documentation metadata together', () => {
    for (const definition of Object.values(FEATURE_CATALOG)) {
      expect(definition.label).not.toBe('');
      expect(definition.description).not.toBe('');
      expect(definition.selection).toBe('boolean');
      expect(definition.configPath).toMatch(/^features\./);
      expect(definition.documentation).toMatch(/^docs\//);
      expect(definition.reversible).toContain('src/index.ts');
      for (const target of definition.targets) {
        expect(definition.defaults).toHaveProperty(target);
      }
    }
  });

  it('returns coherent recommended settings for each target', () => {
    expect(getRecommendedConfiguration('browser')).toEqual({
      target: 'browser',
      xrEnabled: false,
      mode: undefined,
      featureFlags: {
        locomotionEnabled: true,
        locomotionUseWorker: true,
        locomotionBrowserControls: true,
        grabbingEnabled: true,
        physicsEnabled: false,
        sceneUnderstandingEnabled: false,
        environmentRaycastEnabled: false,
      },
      xrFeatureStates: {},
    });
    expect(getRecommendedConfiguration('vr')).toEqual({
      target: 'vr',
      xrEnabled: true,
      mode: 'vr',
      featureFlags: {
        locomotionEnabled: true,
        locomotionUseWorker: true,
        locomotionBrowserControls: false,
        grabbingEnabled: true,
        physicsEnabled: false,
        sceneUnderstandingEnabled: false,
        environmentRaycastEnabled: false,
      },
      xrFeatureStates: { handTracking: 'optional' },
    });
    expect(getRecommendedConfiguration('ar')).toEqual({
      target: 'ar',
      xrEnabled: true,
      mode: 'ar',
      featureFlags: {
        locomotionEnabled: false,
        locomotionUseWorker: undefined,
        locomotionBrowserControls: false,
        grabbingEnabled: true,
        physicsEnabled: false,
        sceneUnderstandingEnabled: false,
        environmentRaycastEnabled: false,
      },
      xrFeatureStates: { handTracking: 'optional' },
    });
  });

  it('normalizes advanced overrides to features supported by the target', () => {
    const browser = getRecommendedConfiguration('browser', ALL_FEATURES);
    expect(browser.featureFlags).toEqual({
      locomotionEnabled: true,
      locomotionUseWorker: true,
      locomotionBrowserControls: true,
      grabbingEnabled: true,
      physicsEnabled: true,
      sceneUnderstandingEnabled: false,
      environmentRaycastEnabled: false,
    });

    const vr = getRecommendedConfiguration('vr', {
      locomotionEnabled: false,
      locomotionUseWorker: true,
      sceneUnderstandingEnabled: true,
      environmentRaycastEnabled: true,
    });
    expect(vr.featureFlags).toMatchObject({
      locomotionEnabled: false,
      grabbingEnabled: true,
      sceneUnderstandingEnabled: false,
      environmentRaycastEnabled: false,
    });
    expect(vr.featureFlags.locomotionUseWorker).toBeUndefined();

    const ar = getRecommendedConfiguration('ar', ALL_FEATURES);
    expect(ar.featureFlags).toEqual({
      locomotionEnabled: false,
      locomotionUseWorker: undefined,
      locomotionBrowserControls: false,
      grabbingEnabled: true,
      physicsEnabled: true,
      sceneUnderstandingEnabled: true,
      environmentRaycastEnabled: true,
    });
  });

  it('derives only the XR features applicable to the target', () => {
    expect(deriveXRFeatureStates('browser', ALL_FEATURES)).toEqual({});
    expect(deriveXRFeatureStates('vr', ALL_FEATURES)).toEqual({
      handTracking: 'optional',
    });
    expect(deriveXRFeatureStates('ar', ALL_FEATURES)).toEqual({
      handTracking: 'optional',
      anchors: 'optional',
      planeDetection: 'optional',
      meshDetection: 'optional',
      hitTest: 'optional',
    });
  });

  it('maps every target and language to a recipe id', () => {
    expect(
      (['browser', 'vr', 'ar'] as const).flatMap((target) =>
        (['ts', 'js'] as const).map((language) =>
          getVariantId(target, language),
        ),
      ),
    ).toEqual([
      'browser-manual-ts',
      'browser-manual-js',
      'vr-manual-ts',
      'vr-manual-js',
      'ar-manual-ts',
      'ar-manual-js',
    ]);
  });

  it('formats browser and XR world options from the normalized configuration', () => {
    expect(formatWorldOptions(getRecommendedConfiguration('browser'))).toBe(
      'xr: false,\nfeatures: { locomotion: { useWorker: true, browserControls: true, initialPlayerPosition: [-4, 0, -6] }, grabbing: true, physics: false, sceneUnderstanding: false, environmentRaycast: false }',
    );
    expect(formatWorldOptions(getRecommendedConfiguration('vr'))).toBe(
      "xr: { sessionMode: SessionMode.ImmersiveVR, offer: 'always', features: { handTracking: true } },\nfeatures: { locomotion: { useWorker: true }, grabbing: true, physics: false, sceneUnderstanding: false, environmentRaycast: false }",
    );
  });
});
