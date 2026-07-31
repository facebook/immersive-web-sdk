/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCENE_VERSION,
  evaluateSceneAcceptance,
  type SceneDocument,
  type SceneReviewCapture,
} from '../src/index.js';

const SCREENSHOT_HASH = `sha256:${'a'.repeat(64)}` as const;

function makeScene(): SceneDocument {
  return {
    version: CURRENT_SCENE_VERSION,
    units: 'meters',
    resources: {},
    nodes: [
      {
        id: 'left',
        content: { type: 'asset', asset: 'unit-box' },
        transform: { position: [-2, 0, 0] },
      },
      {
        id: 'center',
        content: { type: 'asset', asset: 'large-box' },
      },
      {
        id: 'right',
        content: { type: 'asset', asset: 'unit-box' },
        transform: { position: [2, 0, 0] },
      },
      {
        id: 'hidden',
        content: { type: 'asset', asset: 'small-sphere' },
      },
    ],
  };
}

const resolveAssetBounds = (assetId: string) => {
  const bounds = {
    'unit-box': { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    'large-box': { min: [-1, -1, -1], max: [1, 1, 1] },
    'small-sphere': {
      min: [-0.25, -0.25, -0.25],
      max: [0.25, 0.25, 0.25],
    },
    'large-sphere': { min: [-1, -1, -1], max: [1, 1, 1] },
  } as const;
  return bounds[assetId as keyof typeof bounds];
};

function makeCapture(
  overrides: Partial<SceneReviewCapture> = {},
): SceneReviewCapture {
  return {
    id: 'hero-capture',
    view: 'hero',
    path: './hero.png',
    screenshotSha256: SCREENSHOT_HASH,
    width: 1000,
    height: 1000,
    camera: {
      projection: 'orthographic',
      position: [0, 0, 10],
      target: [0, 0, 0],
      height: 10,
    },
    rendererEnvironment: {},
    visibleNodeIds: ['center'],
    ...overrides,
  };
}

describe('deterministic scene acceptance', () => {
  it('requires exact capture visibility for view-scoped presence', () => {
    const scene = makeScene();
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'center-visible',
          kind: 'presence',
          nodeRefs: ['center'],
          view: 'hero',
        },
        { capture: makeCapture() },
      ),
    ).toMatchObject({
      status: 'pass',
      reason: 'criterion-satisfied',
      diagnostics: { notVisibleNodeIds: [] },
    });

    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'hidden-not-visible',
          kind: 'presence',
          nodeRefs: ['hidden'],
          view: 'hero',
        },
        { capture: makeCapture() },
      ),
    ).toMatchObject({
      status: 'fail',
      reason: 'criterion-not-satisfied',
      diagnostics: { notVisibleNodeIds: ['hidden'] },
    });

    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'mask-proves-visible',
          kind: 'presence',
          nodeRefs: ['hidden'],
          view: 'hero',
        },
        {
          capture: makeCapture({
            nodeMaskRegions: { hidden: [0.1, 0.2, 0.3, 0.4] },
          }),
        },
      ),
    ).toMatchObject({
      status: 'pass',
      reason: 'criterion-satisfied',
      diagnostics: {
        maskVisibleNodeIds: ['hidden'],
        notVisibleNodeIds: [],
      },
    });

    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'empty-mask-does-not-prove-visible',
          kind: 'presence',
          nodeRefs: ['hidden'],
          view: 'hero',
        },
        {
          capture: makeCapture({
            nodeMaskRegions: { hidden: [0.1, 0.2, 0, 0.4] },
          }),
        },
      ),
    ).toMatchObject({
      status: 'fail',
      diagnostics: { maskVisibleNodeIds: [], notVisibleNodeIds: ['hidden'] },
    });

    expect(
      evaluateSceneAcceptance(scene, {
        id: 'capture-required',
        kind: 'presence',
        nodeRefs: ['center'],
        view: 'hero',
      }),
    ).toMatchObject({ status: 'unavailable', reason: 'capture-required' });
  });

  it('measures explicit node counts instead of accepting claimed values', () => {
    const evaluation = evaluateSceneAcceptance(makeScene(), {
      id: 'absurd-count',
      kind: 'count',
      nodeRefs: ['left', 'center'],
      equals: 999999,
    });
    expect(evaluation).toMatchObject({
      status: 'fail',
      reason: 'criterion-not-satisfied',
      diagnostics: {
        type: 'count',
        source: 'node-refs',
        actual: 2,
        constraints: { equals: 999999 },
      },
    });
  });

  it('counts materialized pattern instances with runtime-equivalent options', () => {
    const scene = makeScene();
    scene.resources.prefabs = [
      {
        id: 'large-sphere',
        root: {
          id: 'sphere',
          content: { type: 'asset', asset: 'large-sphere' },
        },
      },
    ];
    scene.nodes.push({
      id: 'scatter',
      content: {
        type: 'pattern',
        prefab: 'large-sphere',
        distribution: {
          type: 'scatter',
          count: 10,
          seed: 42,
          algorithm: 'pcg32-box-rejection-v1',
          collision: 'skip',
          region: { type: 'box', size: [0.1, 0.1, 0.1] },
        },
      },
    });
    const evaluation = evaluateSceneAcceptance(
      scene,
      {
        id: 'actual-scatter-count',
        kind: 'count',
        pattern: 'scatter',
        equals: 1,
      },
      { resolveAssetBounds },
    );
    expect(evaluation).toMatchObject({
      status: 'pass',
      diagnostics: {
        source: 'pattern',
        actual: 1,
        pattern: {
          nodeId: 'scatter',
          prefabId: 'large-sphere',
          requestedCount: 10,
          seedKey: 'scatter',
        },
      },
    });
    expect(
      evaluation.diagnostics.type === 'count'
        ? evaluation.diagnostics.pattern?.collisionRadius
        : undefined,
    ).toBeCloseTo(Math.sqrt(3));
  });

  it('passes and fails spatial relations from aggregate world bounds', () => {
    const scene = makeScene();
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'left-pass',
          kind: 'spatial-relation',
          nodeRefs: ['left'],
          target: 'center',
          relation: 'left-of',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'pass',
      diagnostics: { signedMargin: 0.5 },
    });
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'right-fail',
          kind: 'spatial-relation',
          nodeRefs: ['left'],
          target: 'center',
          relation: 'right-of',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'fail',
      diagnostics: { signedMargin: -3.5 },
    });
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'aggregate-left-fail',
          kind: 'spatial-relation',
          nodeRefs: ['left', 'right'],
          target: 'center',
          relation: 'left-of',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'fail',
      diagnostics: {
        sourceBounds: { min: [-2.5, -0.5, -0.5], max: [2.5, 0.5, 0.5] },
        signedMargin: -3.5,
      },
    });
  });

  it('treats surface contact as touching without accepting deep overlap', () => {
    const scene = makeScene();
    const right = scene.nodes.find((node) => node.id === 'right')!;
    right.transform = { position: [1.5, 0, 0] };
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'surface-contact',
          kind: 'spatial-relation',
          nodeRefs: ['right'],
          target: 'center',
          relation: 'touching',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'pass',
      diagnostics: {
        axisContactMargins: [0, 1.5, 1.5],
        contactState: 'intersecting',
        minimumPenetration: 0,
        separation: 0,
      },
    });

    right.transform = { position: [1.5000005, 0, 0] };
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'tolerated-gap',
          kind: 'spatial-relation',
          nodeRefs: ['right'],
          target: 'center',
          relation: 'touching',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'pass',
      diagnostics: {
        contactState: 'separated',
        separation: expect.closeTo(1e-6, 10),
      },
    });

    right.transform = { position: [0.5, 0, 0] };
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'deep-overlap',
          kind: 'spatial-relation',
          nodeRefs: ['right'],
          target: 'center',
          relation: 'touching',
        },
        { resolveAssetBounds },
      ),
    ).toMatchObject({
      status: 'fail',
      reason: 'criterion-not-satisfied',
      diagnostics: {
        axisContactMargins: [1, 1.5, 1.5],
        contactState: 'intersecting',
        minimumPenetration: 1,
        separation: 0,
      },
    });
  });

  it('marks world-AABB silhouette extent inapplicable for manifest assets', () => {
    const scene = makeScene();
    scene.nodes.push({
      id: 'stool',
      content: { type: 'asset', asset: 'stool' },
    });
    expect(
      evaluateSceneAcceptance(
        scene,
        {
          id: 'stool-frame-match',
          kind: 'projected-region',
          measurement: {
            method: 'projected-world-aabb-v1',
            applicability: 'single-axis-aligned-box',
          },
          nodeRefs: ['stool'],
          view: 'hero',
          reference: 'reference',
          region: [0.2, 0.1, 0.6, 0.8],
        },
        { capture: makeCapture() },
      ),
    ).toMatchObject({
      status: 'not-applicable',
      reason: 'measurement-not-applicable',
      diagnostics: {
        applicability: 'not-applicable',
        measurement: { method: 'projected-world-aabb-v1' },
        applicabilityReason: expect.stringContaining('external asset'),
      },
    });
  });

  it('measures manifest assets from trusted visible node-mask bounds', () => {
    const scene = makeScene();
    scene.nodes.push({
      id: 'rounded-subject',
      content: { type: 'asset', asset: 'rounded-subject' },
    });
    const evaluation = evaluateSceneAcceptance(
      scene,
      {
        id: 'mask-frame-match',
        kind: 'projected-region',
        measurement: {
          method: 'capture-node-mask-bounds-v1',
          applicability: 'visible-node-mask',
        },
        nodeRefs: ['rounded-subject'],
        view: 'hero',
        reference: 'reference',
        region: [0.2, 0.1, 0.6, 0.8],
        centerTolerance: 1e-10,
        extentTolerance: 1e-10,
      },
      {
        capture: makeCapture({
          nodeMaskRegions: { 'rounded-subject': [0.2, 0.1, 0.6, 0.8] },
        }),
      },
    );
    expect(evaluation).toMatchObject({
      status: 'pass',
      diagnostics: {
        measurement: { method: 'capture-node-mask-bounds-v1' },
      },
    });
    if (
      evaluation.diagnostics.type !== 'projected-region' ||
      evaluation.diagnostics.actualRegion == null
    ) {
      throw new Error('Expected node-mask projected-region diagnostics');
    }
    evaluation.diagnostics.actualRegion.forEach((value, index) =>
      expect(value).toBeCloseTo([0.2, 0.1, 0.6, 0.8][index]),
    );
  });

  it('leaves visual judgment explicitly unavailable', () => {
    expect(
      evaluateSceneAcceptance(makeScene(), {
        id: 'looks-like-chair',
        kind: 'visual-judgment',
        view: 'hero',
        criterion: 'The primitive cluster reads as a chair',
      }),
    ).toEqual({
      criterionId: 'looks-like-chair',
      kind: 'visual-judgment',
      status: 'unavailable',
      reason: 'judgment-required',
      diagnostics: {
        type: 'visual-judgment',
        view: 'hero',
        criterion: 'The primitive cluster reads as a chair',
      },
    });
  });
});
