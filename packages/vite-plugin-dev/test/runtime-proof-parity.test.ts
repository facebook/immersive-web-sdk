/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { SceneDocument } from '@iwsdk/scene-composition';
import { describe, expect, test } from 'vitest';
import {
  evaluateRuntimePresentationParity,
  evaluateRuntimeSceneParity,
  explainRuntimeCountDifferences,
} from '../src/runtime-proof-parity.js';

const document: SceneDocument = {
  environment: {
    exposure: 1.25,
    fog: { color: '#334455', far: 20, near: 2, type: 'linear' },
    shadows: true,
    toneMapping: 'aces',
  },
  nodes: [
    { content: { asset: 'garden', type: 'asset' }, id: 'garden-model' },
    {
      components: {
        'com.iwsdk.components.DirectionalLight': {
          castShadow: true,
          color: [254 / 255, 220 / 255, 186 / 255, 1],
          intensity: 2.5,
        },
      },
      id: 'sun',
    },
  ],
  resources: {},
  units: 'meters',
  version: 'iwsdk.scene.v1',
};

function measuredState() {
  return {
    sceneAssets: [
      {
        id: 'garden',
        meshCount: 3,
        resolvedUri: 'http://localhost:5173/garden.glb',
        sourceUri: './garden.glb',
      },
    ],
    sceneEnvironment: {
      background: { color: '#112233', type: 'color' },
      clearAlpha: 1,
      exposure: 1.25,
      fog: { color: '#334455', far: 20, near: 2, type: 'linear' },
      shadows: true,
      toneMapping: 'aces',
    },
    sceneLights: [
      {
        castShadow: true,
        color: '#fedcba',
        intensity: 2.5,
        nodeId: 'sun',
        shadow: {
          bias: 0,
          camera: {
            bottom: -5,
            far: 100,
            left: -5,
            near: 0.1,
            right: 5,
            top: 5,
          },
          mapSize: [1024, 1024],
          normalBias: 0,
          radius: 1,
        },
        sourceNodeId: 'sun',
        type: 'directional',
      },
    ],
    sceneMaterials: [
      {
        baseColor: '#123456',
        emissive: '#010203',
        emissiveIntensity: 0.5,
        flatShading: false,
        id: 'paint',
        metalness: 0.2,
        model: 'standard',
        opacity: 0.9,
        roughness: 0.4,
        side: 'front',
      },
    ],
  };
}

describe('evaluateRuntimeSceneParity', () => {
  test('proves measured assets, lights, and environment', () => {
    expect(evaluateRuntimeSceneParity(document, measuredState())).toMatchObject(
      {
        mismatches: [],
        passed: true,
      },
    );
  });

  test('reports unapplied and fabricated render state', () => {
    const measured = measuredState();
    measured.sceneAssets[0].meshCount = 0;
    measured.sceneEnvironment.exposure = 9;
    measured.sceneLights[0].intensity = 0.1;
    const result = evaluateRuntimeSceneParity(document, measured);

    expect(result.passed).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([
        expect.stringContaining('loaded no renderable meshes'),
        expect.stringContaining('light sun'),
        expect.stringContaining('environment exposure'),
      ]),
    );
  });

  test('proves procedural manifest assets, area lighting, and shadow settings', () => {
    const physical: SceneDocument = {
      environment: {
        shadowMapType: 'pcf-soft',
      },
      nodes: [
        {
          content: { asset: 'glaze-sphere', type: 'asset' },
          id: 'glaze-sphere',
        },
        {
          components: {
            'com.iwsdk.components.RectAreaLight': {
              color: [1, 248 / 255, 239 / 255, 1],
              height: 4,
              intensity: 3.4,
              width: 5.5,
            },
          },
          id: 'area-key',
        },
      ],
      resources: {},
      units: 'meters',
      version: 'iwsdk.scene.v1',
    };
    const probe = evaluateRuntimeSceneParity(physical, {
      sceneAssets: [],
      sceneEnvironment: {},
      sceneLights: [],
      sceneMaterials: [],
    });
    const measured = {
      sceneAssets: [{ id: 'glaze-sphere', meshCount: 1 }],
      sceneEnvironment: probe.expected.environment,
      sceneLights: probe.expected.lights.map(({ count: _count, ...light }) => ({
        ...light,
        nodeId: light.sourceNodeId,
      })),
      sceneMaterials: [],
    };
    expect(evaluateRuntimeSceneParity(physical, measured).passed).toBe(true);

    measured.sceneAssets[0].meshCount = 0;
    expect(evaluateRuntimeSceneParity(physical, measured)).toMatchObject({
      passed: false,
      mismatches: [expect.stringContaining('asset glaze-sphere')],
    });
  });
});

describe('runtime presentation parity', () => {
  const heroView = {
    fov: 50,
    id: 'hero',
    position: [3, 2.5, 5] as [number, number, number],
    projection: 'perspective' as const,
    role: 'hero' as const,
    target: [0, 0, 0] as [number, number, number],
  };
  const direction = [-3, -2.5, -5];
  const length = Math.hypot(...direction);
  const matchingSnapshot = {
    camera: {
      aspect: 1.5,
      direction: direction.map((value) => value / length) as [
        number,
        number,
        number,
      ],
      far: 200,
      fov: 50,
      height: null,
      near: 0.1,
      position: [3, 2.5, 5] as [number, number, number],
      projection: 'perspective' as const,
    },
    framing: {
      boundsAvailable: true,
      centerNdc: [0, 0, 0.9] as [number, number, number],
      fullyInsideViewport: true,
      inFrontCornerCount: 8,
      projectedBounds: {
        max: [0.6, 0.7] as [number, number],
        min: [-0.6, -0.7] as [number, number],
      },
      viewportCoverage: 0.42,
      viewportOverlap: 0.42,
    },
  };

  test('separately proves authored hero camera and representative framing', () => {
    expect(
      evaluateRuntimePresentationParity(heroView, matchingSnapshot),
    ).toMatchObject({
      camera: { issues: [], passed: true },
      framing: { issues: [], passed: true },
    });
  });

  test('rejects a nonblank runtime aimed away from the authored view', () => {
    const result = evaluateRuntimePresentationParity(heroView, {
      ...matchingSnapshot,
      camera: {
        ...matchingSnapshot.camera,
        direction: [0, 0, 1],
        position: [0, 1.7, 0],
      },
      framing: {
        ...matchingSnapshot.framing,
        centerNdc: null,
        inFrontCornerCount: 0,
        projectedBounds: null,
        viewportCoverage: 0,
        viewportOverlap: 0,
      },
    });
    expect(result.camera.passed).toBe(false);
    expect(result.camera.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('position differs'),
        expect.stringContaining('aim differs'),
      ]),
    );
    expect(result.framing.passed).toBe(false);
    expect(result.framing.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('behind'),
        expect.stringContaining('representative area'),
      ]),
    );
  });

  test('explains explicit authoring counts separately from lowered runtime counts', () => {
    const result = explainRuntimeCountDifferences(
      document,
      { meshCount: 3, nodeCount: 3, objectCount: 5 },
      { materialCount: 2, meshCount: 8 },
      14,
    );
    expect(result).toMatchObject({
      authored: { explicitNodeCount: 2 },
      editor: { meshCount: 3, nodeCount: 3, objectCount: 5 },
      runtime: {
        hierarchyObjectCount: 14,
        materialCount: 2,
        meshCount: 8,
      },
    });
    expect(result.explanation.join(' ')).toContain('prefab and pattern');
  });
});
