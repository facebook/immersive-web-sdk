/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { evaluateSceneAcceptance } from './acceptance.js';
import { getSceneCompositionSourceHashes } from './provenance.js';
import { hashRuntimeSceneDocument, hashSceneDocument } from './serialize.js';
import type {
  SceneDocument,
  SceneAuthoringView,
  SceneFeatureAcceptance,
  ScenePatternDistribution,
  SceneReview,
  SceneReviewCamera,
  SceneReviewCapture,
  SceneReviewConfiguration,
  SceneReviewFinalizeDraft,
  SceneReviewFeatureResult,
  SceneReviewLens,
  SceneReviewStatus,
  Sha256,
  ValidationIssue,
  ValidationResult,
} from './types.js';
import { validateSceneDocument, validateSceneReview } from './validation.js';

export interface SceneReviewDeterministicEvaluation {
  feature: string;
  criterion: string;
  status: SceneReviewStatus;
  reason: string;
  diagnostics: unknown;
}

export interface SceneReviewFinalization {
  review: SceneReview;
  deterministicEvaluations: SceneReviewDeterministicEvaluation[];
}

/**
 * Complete the machine-owned portions of a review record. Callers supply only
 * persisted captures plus human lens/visual judgments; they cannot guess or
 * override deterministic acceptance statuses or revision identity.
 */
export function finalizeSceneReviewDraft(
  document: SceneDocument,
  capabilityHash: Sha256,
  draft: SceneReviewFinalizeDraft,
): SceneReviewFinalization {
  const configuredLensIds = document.authoring?.composition?.review.lenses;
  const requestedLenses = new Map(
    draft.lenses.map((lens) => [lens.id, cloneReviewLens(lens)]),
  );
  const lensIds = configuredLensIds ?? draft.lenses.map((lens) => lens.id);
  const lenses = lensIds.map(
    (lensId): SceneReviewLens =>
      requestedLenses.get(lensId) ?? {
        captures: [],
        id: lensId,
        status: 'fail',
      },
  );
  const captures = lenses.flatMap((lens) => lens.captures);
  const defaultCapture =
    lenses.find((lens) => lens.id === 'final')?.captures[0] ?? captures[0];
  const visualResults = new Map(
    (draft.visualResults ?? []).map((result) => [
      reviewResultKey(result.feature, result.criterion),
      result,
    ]),
  );
  const deterministicEvaluations: SceneReviewDeterministicEvaluation[] = [];
  const featureResults: SceneReviewFeatureResult[] = [];

  for (const feature of document.authoring?.composition?.features ?? []) {
    for (const criterion of feature.acceptance) {
      const requiredView = 'view' in criterion ? criterion.view : undefined;
      const capture =
        requiredView == null
          ? defaultCapture
          : captures.find((entry) => entry.view === requiredView);
      const defaultEvidenceRefs = capture == null ? [] : [capture.id];
      if (criterion.kind === 'visual-judgment') {
        const provided = visualResults.get(
          reviewResultKey(feature.id, criterion.id),
        );
        featureResults.push({
          criterion: criterion.id,
          evidenceRefs: provided?.evidenceRefs ?? defaultEvidenceRefs,
          feature: feature.id,
          observation:
            provided?.observation ??
            'No human visual judgment was supplied; criterion remains unresolved.',
          status: provided?.status ?? 'fail',
        });
        continue;
      }

      const evaluation = evaluateSceneAcceptance(document, criterion, {
        capture,
      });
      const status =
        evaluation.status === 'unavailable' ? 'fail' : evaluation.status;
      featureResults.push({
        criterion: criterion.id,
        evidenceRefs: defaultEvidenceRefs,
        feature: feature.id,
        status,
      });
      deterministicEvaluations.push({
        criterion: criterion.id,
        diagnostics: evaluation.diagnostics,
        feature: feature.id,
        reason: evaluation.reason,
        status,
      });
    }
  }

  const allPass =
    lenses.every((lens) => lens.status === 'pass') &&
    featureResults.every((result) => result.status === 'pass');
  const inferredDefectTags = [
    ...lenses
      .filter((lens) => lens.status !== 'pass')
      .map((lens) => `lens:${lens.id}`),
    ...featureResults
      .filter((result) => result.status !== 'pass')
      .map((result) => `criterion:${result.feature}/${result.criterion}`),
  ];
  const review: SceneReview = {
    capabilityHash,
    documentHash: hashSceneDocument(document),
    featureResults,
    lenses,
    result: allPass ? 'pass' : 'fail',
    round: draft.round,
    runtimeHash: hashRuntimeSceneDocument(document),
    sourceHashes:
      document.authoring?.composition == null
        ? []
        : getSceneCompositionSourceHashes(document.authoring.composition.input),
    stop: allPass
      ? { openDefectTags: [], reason: 'success' }
      : {
          openDefectTags:
            draft.openDefectTags != null && draft.openDefectTags.length > 0
              ? [...draft.openDefectTags]
              : inferredDefectTags,
          reason: draft.stopReason ?? 'continue-refining',
        },
    version: 'iwsdk.scene-review.v1',
    waivers: [],
    ...(draft.previousReview == null
      ? {}
      : { previousReview: { ...draft.previousReview } }),
    ...(draft.correction == null
      ? {}
      : { correction: { ...draft.correction } }),
  };
  return { deterministicEvaluations, review };
}

function cloneReviewLens(lens: SceneReviewLens): SceneReviewLens {
  return {
    captures: lens.captures.map((capture) => ({
      ...capture,
      camera: { ...capture.camera },
      rendererEnvironment: { ...capture.rendererEnvironment },
      visibleNodeIds: [...capture.visibleNodeIds],
      ...(capture.nodeMaskRegions == null
        ? {}
        : {
            nodeMaskRegions: Object.fromEntries(
              Object.entries(capture.nodeMaskRegions).map(([id, region]) => [
                id,
                [...region],
              ]),
            ),
          }),
    })),
    id: lens.id,
    status: lens.status,
  };
}

function reviewResultKey(feature: string, criterion: string) {
  return `${feature}\u0000${criterion}`;
}

export function validateSceneReviewAgainstDocument(
  value: unknown,
  document: SceneDocument,
  expectedCapabilityHash?: Sha256,
): ValidationResult {
  const reviewResult = validateSceneReview(value);
  const documentResult = validateSceneDocument(document);
  const issues = [...reviewResult.issues];
  if (!documentResult.valid) {
    issues.push({
      code: 'document',
      path: '$',
      message: 'review target is not a valid scene document',
    });
  }
  if (!reviewResult.valid || !documentResult.valid) {
    return { valid: false, issues };
  }

  const review = value as SceneReview;
  compareHash(
    issues,
    '$.documentHash',
    review.documentHash,
    hashSceneDocument(document),
  );
  compareHash(
    issues,
    '$.runtimeHash',
    review.runtimeHash,
    hashRuntimeSceneDocument(document),
  );
  if (expectedCapabilityHash != null) {
    compareHash(
      issues,
      '$.capabilityHash',
      review.capabilityHash,
      expectedCapabilityHash,
    );
  }

  const reviewConfiguration = document.authoring?.composition?.review;
  if (reviewConfiguration != null) {
    validateReviewWorkflow(review, reviewConfiguration, issues);
  }

  const nodeIds = collectRuntimeNodeIds(document);
  const views = new Map(
    (document.authoring?.views ?? []).map((view) => [view.id, view]),
  );
  const requiredLenses = new Set(
    document.authoring?.composition?.review.lenses ?? [],
  );
  const requiredViews = new Set(
    document.authoring?.composition?.review.requiredViews ?? [],
  );
  for (const lens of review.lenses) {
    const lensIsRequired = requiredLenses.has(lens.id);
    requiredLenses.delete(lens.id);
    if (lensIsRequired && lens.captures.length === 0) {
      addReference(
        issues,
        '$.lenses',
        `required lens "${lens.id}" has no captures`,
      );
    }
    for (const capture of lens.captures) {
      requiredViews.delete(capture.view);
      const view = views.get(capture.view);
      if (view == null) {
        addReference(
          issues,
          '$.lenses',
          `capture "${capture.id}" references unknown view "${capture.view}"`,
        );
      } else if (!cameraMatchesView(capture.camera, view)) {
        issues.push({
          code: 'camera-mismatch',
          path: '$.lenses',
          message: `capture "${capture.id}" camera does not match view "${capture.view}"`,
        });
      }
      capture.visibleNodeIds.forEach((nodeId) => {
        if (!nodeIds.has(nodeId)) {
          addReference(
            issues,
            '$.lenses',
            `capture "${capture.id}" names unknown visible node "${nodeId}"`,
          );
        }
      });
    }
  }
  for (const lens of requiredLenses) {
    addReference(issues, '$.lenses', `required lens "${lens}" is missing`);
  }
  for (const view of requiredViews) {
    addReference(issues, '$.lenses', `required view "${view}" has no capture`);
  }

  const features = new Map(
    (document.authoring?.composition?.features ?? []).map((feature) => [
      feature.id,
      feature,
    ]),
  );
  const captures = new Map<string, SceneReviewCapture>();
  review.lenses.forEach((lens) =>
    lens.captures.forEach((capture) => captures.set(capture.id, capture)),
  );
  const resolvedDocument = document;
  const results = new Set<string>();
  review.featureResults.forEach((result, index) => {
    const feature = features.get(result.feature);
    const criterion = feature?.acceptance.find(
      (entry) => entry.id === result.criterion,
    );
    if (feature == null) {
      addReference(
        issues,
        `$.featureResults[${index}].feature`,
        `unknown feature "${result.feature}"`,
      );
    } else if (criterion == null) {
      addReference(
        issues,
        `$.featureResults[${index}].criterion`,
        `unknown criterion "${result.criterion}" for feature "${result.feature}"`,
      );
    } else if (
      feature.priority === 'required' &&
      result.evidenceRefs.length === 0
    ) {
      addReference(
        issues,
        `$.featureResults[${index}].evidenceRefs`,
        `required criterion "${result.feature}/${result.criterion}" has no evidence`,
      );
    }
    if (criterion != null) {
      validateFeatureResultMeasurement(
        resolvedDocument,
        criterion,
        result,
        index,
        captures,
        issues,
      );
    }
    results.add(resultKey(result.feature, result.criterion));
  });
  for (const feature of features.values()) {
    if (feature.priority !== 'required') {
      continue;
    }
    for (const criterion of feature.acceptance) {
      if (!results.has(resultKey(feature.id, criterion.id))) {
        addReference(
          issues,
          '$.featureResults',
          `required criterion "${feature.id}/${criterion.id}" has no result`,
        );
      }
    }
  }

  const expectedSources = new Set(
    document.authoring?.composition == null
      ? []
      : getSceneCompositionSourceHashes(
          document.authoring.composition.input,
        ).map((hash) => hash.toLowerCase()),
  );
  const actualSources = new Set(
    review.sourceHashes.map((hash) => hash.toLowerCase()),
  );
  for (const hash of expectedSources) {
    if (!actualSources.has(hash)) {
      addReference(
        issues,
        '$.sourceHashes',
        `source hash "${hash}" is missing`,
      );
    }
  }
  for (const hash of actualSources) {
    if (!expectedSources.has(hash)) {
      addReference(
        issues,
        '$.sourceHashes',
        `source hash "${hash}" is not declared by the scene`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

function validateFeatureResultMeasurement(
  document: SceneDocument,
  criterion: SceneFeatureAcceptance,
  result: SceneReviewFeatureResult,
  resultIndex: number,
  captures: ReadonlyMap<string, SceneReviewCapture>,
  issues: ValidationIssue[],
) {
  const path = `$.featureResults[${resultIndex}]`;
  const requiredView = 'view' in criterion ? criterion.view : undefined;
  const referencedCapture =
    requiredView == null
      ? undefined
      : result.evidenceRefs
          .map((captureId) => captures.get(captureId))
          .find((capture) => capture?.view === requiredView);

  if (criterion.kind === 'visual-judgment') {
    if (referencedCapture == null) {
      issues.push({
        code: 'criterion-evidence',
        path: `${path}.evidenceRefs`,
        message: `visual criterion "${criterion.id}" requires a referenced capture from view "${criterion.view}"`,
      });
    }
    if (result.observation == null || result.observation.trim().length === 0) {
      issues.push({
        code: 'required',
        path: `${path}.observation`,
        message: `visual criterion "${criterion.id}" requires a concise observation`,
      });
    }
    return;
  }

  const evaluation = evaluateSceneAcceptance(document, criterion, {
    capture: referencedCapture,
  });
  const expectedStatus =
    evaluation.status === 'unavailable' ? 'fail' : evaluation.status;
  if (result.status !== expectedStatus) {
    issues.push({
      code: 'criterion-mismatch',
      path: `${path}.status`,
      message: `deterministic ${criterion.kind} criterion "${criterion.id}" requires status ${expectedStatus}; evaluated ${evaluation.status} (${evaluation.reason}); diagnostics=${JSON.stringify(evaluation.diagnostics)}`,
    });
  }
}

const CANONICAL_REVIEW_LENSES = ['layout', 'geometry', 'final'] as const;

function validateReviewWorkflow(
  review: SceneReview,
  configuration: SceneReviewConfiguration,
  issues: ValidationIssue[],
) {
  const maximumRound = configuration.maxCorrectionRounds;
  if (review.round > maximumRound) {
    issues.push({
      code: 'limit',
      path: '$.round',
      message: `review round ${review.round} exceeds correction ceiling ${maximumRound}; the initial review is round 0`,
    });
  }
  if (review.stop.reason === 'round-limit' && review.round !== maximumRound) {
    issues.push({
      code: 'state',
      path: '$.stop.reason',
      message: `round-limit is valid only at correction round ${maximumRound}`,
    });
  }

  let previousCanonicalIndex = -1;
  let configurationIsCanonical = true;
  configuration.lenses.forEach((lens) => {
    const canonicalIndex = CANONICAL_REVIEW_LENSES.indexOf(lens);
    if (canonicalIndex <= previousCanonicalIndex) {
      configurationIsCanonical = false;
    }
    previousCanonicalIndex = canonicalIndex;
  });
  if (!configurationIsCanonical) {
    issues.push({
      code: 'state',
      path: '$.lenses',
      message:
        'scene review configuration lenses must be a canonical subset ordered layout, geometry, final',
    });
  }

  const reviewFollowsConfiguration =
    review.lenses.length === configuration.lenses.length &&
    review.lenses.every(
      (lens, index) => lens.id === configuration.lenses[index],
    );
  if (!reviewFollowsConfiguration) {
    issues.push({
      code: 'state',
      path: '$.lenses',
      message: `review lenses must exactly follow configured order: ${configuration.lenses.join(', ')}`,
    });
  }

  let earlierConfiguredLensesPass = true;
  configuration.lenses.forEach((lensId) => {
    const reviewIndex = review.lenses.findIndex((lens) => lens.id === lensId);
    const lens = review.lenses[reviewIndex];
    if (lens?.status === 'pass' && !earlierConfiguredLensesPass) {
      issues.push({
        code: 'state',
        path: `$.lenses[${reviewIndex}].status`,
        message: `lens "${lensId}" cannot pass before every earlier configured lens passes`,
      });
    }
    if (lens?.status !== 'pass') {
      earlierConfiguredLensesPass = false;
    }
  });
}

function collectRuntimeNodeIds(document: SceneDocument) {
  const ids = new Set<string>();
  const prefabs = new Map(
    (document.resources.prefabs ?? []).map((prefab) => [prefab.id, prefab]),
  );
  const visit = (
    nodes: SceneDocument['nodes'],
    namespace: string | undefined,
    prefabStack: readonly string[],
  ) => {
    nodes.forEach((node) => {
      const id = namespace == null ? node.id : `${namespace}/${node.id}`;
      ids.add(id);
      if (node.content?.type === 'instance') {
        const prefab = prefabs.get(node.content.prefab);
        if (prefab != null && !prefabStack.includes(prefab.id)) {
          visit([prefab.root], id, [...prefabStack, prefab.id]);
        }
      } else if (node.content?.type === 'pattern') {
        const prefab = prefabs.get(node.content.prefab);
        if (prefab != null && !prefabStack.includes(prefab.id)) {
          const count = patternInstanceUpperBound(node.content.distribution);
          for (let index = 0; index < count; index += 1) {
            visit([prefab.root], `${id}/${String(index).padStart(4, '0')}`, [
              ...prefabStack,
              prefab.id,
            ]);
          }
        }
      }
      visit(node.children ?? [], namespace, prefabStack);
    });
  };
  visit(document.nodes, undefined, []);
  return ids;
}

function patternInstanceUpperBound(distribution: ScenePatternDistribution) {
  switch (distribution.type) {
    case 'grid':
      return distribution.count.reduce(
        (product, component) => product * component,
        1,
      );
    case 'explicit':
      return distribution.transforms.length;
    default:
      return distribution.count;
  }
}

function cameraMatchesView(
  camera: SceneReviewCamera,
  view: SceneAuthoringView,
) {
  return (
    camera.projection === view.projection &&
    sameVector(camera.position, view.position) &&
    sameVector(camera.target, view.target) &&
    (view.projection === 'perspective'
      ? camera.fov === view.fov
      : camera.height === view.height)
  );
}

function sameVector(left: number[], right: number[]) {
  return left.every((entry, index) => entry === right[index]);
}

function compareHash(
  issues: ValidationIssue[],
  path: string,
  actual: string,
  expected: string,
) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    issues.push({
      code: 'hash-mismatch',
      path,
      message: `hash does not match scene revision (expected ${expected})`,
    });
  }
}

function addReference(
  issues: ValidationIssue[],
  path: string,
  message: string,
) {
  issues.push({ code: 'reference', path, message });
}

function resultKey(feature: string, criterion: string) {
  return `${feature}\u0000${criterion}`;
}
