/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';
import {
  canonicalizeJson,
  hashRuntimeSceneDocument,
  hashSceneDocument,
  sha256,
  type SceneDocument,
  type ScenePatch,
  type SceneReview,
} from '@iwsdk/scene-composition';
import { afterEach, describe, expect, test } from 'vitest';
import {
  assertSceneReviewWorkflowPublishable,
  beginSceneReviewWorkflow,
  commitSceneReviewTransition,
  planSceneReviewTransition,
  readSceneReviewWorkflowState,
  recordManualSceneEdit,
  recordSceneReviewWorkflowReview,
  type SceneReviewRecordLink,
} from '../src/review-workflow-store.js';

const CAPABILITY_HASH = `sha256:${'c'.repeat(64)}` as const;
const REVIEW_LINK: SceneReviewRecordLink = {
  path: 'public/scenes/object.iwsdk.review/records/round-0.json',
  reviewSha256: `sha256:${'a'.repeat(64)}`,
};
const roots: string[] = [];

afterEach(() => {
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { force: true, recursive: true }));
});

describe('server-owned review workflow', () => {
  test('keeps authoring mutable in draft until an explicit freeze, then requires adjacent review lineage', () => {
    const reviewRoot = makeRoot();
    const blank = makeBlankScene();
    const scene = makeComposedScene();
    const initial = planSceneReviewTransition({
      candidate: scene,
      current: blank,
      expectedBaseDocumentHash: hashSceneDocument(blank),
      operation: 'replace-document',
      patch: replacementPatch(scene),
      reviewRoot,
    });
    expect(initial).not.toBeNull();
    expect(readSceneReviewWorkflowState(reviewRoot)).toBeNull();

    commitSceneReviewTransition({
      document: scene,
      plan: initial!,
      reviewRoot,
    });
    expect(readSceneReviewWorkflowState(reviewRoot)).toMatchObject({
      phase: 'draft',
      round: 0,
    });

    const editedDraft = moveSubject(scene, 0.5);
    editedDraft.authoring!.views![0].position = [1, 2, 6];
    editedDraft.authoring!.composition!.review.maxCorrectionRounds = 4;
    const draftPlan = planSceneReviewTransition({
      candidate: editedDraft,
      current: scene,
      expectedBaseDocumentHash: hashSceneDocument(scene),
      operation: 'transaction',
      patch: transactionPatch(scene, editedDraft),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: editedDraft,
      plan: draftPlan!,
      reviewRoot,
    });
    expect(readSceneReviewWorkflowState(reviewRoot)).toMatchObject({
      documentHash: hashSceneDocument(editedDraft),
      lockedMaxCorrectionRounds: 4,
      phase: 'draft',
      round: 0,
    });

    expect(
      beginSceneReviewWorkflow({
        document: editedDraft,
        expectedDocumentHash: hashSceneDocument(editedDraft),
        reviewRoot,
      }),
    ).toMatchObject({
      lockedMaxCorrectionRounds: 4,
      phase: 'awaiting-review',
      round: 0,
    });
    expect(() =>
      planSceneReviewTransition({
        candidate: moveSubject(editedDraft, 1),
        correction: correction('scene'),
        current: editedDraft,
        expectedBaseDocumentHash: hashSceneDocument(editedDraft),
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_required_before_correction' }),
    );

    saveHeadReview(reviewRoot, editedDraft, 0);
    const corrected = moveSubject(editedDraft, 1);
    const correctionPlan = planSceneReviewTransition({
      candidate: corrected,
      correction: correction('scene'),
      current: editedDraft,
      expectedBaseDocumentHash: hashSceneDocument(editedDraft),
      operation: 'transaction',
      patch: transactionPatch(editedDraft, corrected),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: corrected,
      plan: correctionPlan!,
      reviewRoot,
    });
    expect(readSceneReviewWorkflowState(reviewRoot)).toMatchObject({
      phase: 'awaiting-review',
      previousReview: REVIEW_LINK,
      round: 1,
    });
    expect(() => saveHeadReview(reviewRoot, corrected, 1, false)).toThrowError(
      expect.objectContaining({ code: 'review_correction_lineage_mismatch' }),
    );
    expect(() =>
      planSceneReviewTransition({
        candidate: moveSubject(corrected, 2),
        correction: correction('scene'),
        current: corrected,
        expectedBaseDocumentHash: hashSceneDocument(corrected),
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_required_before_correction' }),
    );
  });

  test('single-use plans reject concurrent commits and leave no state after an abandoned authorization', () => {
    const reviewRoot = makeRoot();
    const blank = makeBlankScene();
    const scene = makeComposedScene();
    const abandoned = planSceneReviewTransition({
      candidate: scene,
      current: blank,
      expectedBaseDocumentHash: hashSceneDocument(blank),
      operation: 'replace-document',
      patch: replacementPatch(scene),
      reviewRoot,
    });
    expect(abandoned).not.toBeNull();
    expect(readSceneReviewWorkflowState(reviewRoot)).toBeNull();

    commitSceneReviewTransition({
      document: scene,
      plan: abandoned!,
      reviewRoot,
    });
    beginSceneReviewWorkflow({
      document: scene,
      expectedDocumentHash: hashSceneDocument(scene),
      reviewRoot,
    });
    saveHeadReview(reviewRoot, scene, 0);
    const firstCandidate = moveSubject(scene, 1);
    const secondCandidate = moveSubject(scene, 2);
    const first = planSceneReviewTransition({
      candidate: firstCandidate,
      correction: correction('scene'),
      current: scene,
      expectedBaseDocumentHash: hashSceneDocument(scene),
      operation: 'transaction',
      patch: transactionPatch(scene, firstCandidate),
      reviewRoot,
    });
    const second = planSceneReviewTransition({
      candidate: secondCandidate,
      correction: correction('scene'),
      current: scene,
      expectedBaseDocumentHash: hashSceneDocument(scene),
      operation: 'transaction',
      patch: transactionPatch(scene, secondCandidate),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: firstCandidate,
      plan: first!,
      reviewRoot,
    });
    expect(() =>
      commitSceneReviewTransition({
        document: secondCandidate,
        plan: second!,
        reviewRoot,
      }),
    ).toThrowError(expect.objectContaining({ code: 'review_transition_race' }));
  });

  test('keeps direct saves mutable in draft and makes the formal freeze idempotent', () => {
    const reviewRoot = makeRoot();
    const blank = makeBlankScene();
    const scene = makeComposedScene();
    const initial = planSceneReviewTransition({
      candidate: scene,
      current: blank,
      expectedBaseDocumentHash: hashSceneDocument(blank),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: scene,
      plan: initial!,
      reviewRoot,
    });

    const edited = moveSubject(scene, 0.75);
    edited.authoring!.composition!.review.maxCorrectionRounds = 3;
    expect(
      recordManualSceneEdit({ document: edited, reviewRoot }),
    ).toMatchObject({
      documentHash: hashSceneDocument(edited),
      lockedMaxCorrectionRounds: 3,
      phase: 'draft',
      round: 0,
    });
    expect(() =>
      beginSceneReviewWorkflow({
        document: edited,
        expectedDocumentHash: hashSceneDocument(scene),
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_begin_hash_mismatch' }),
    );

    const first = beginSceneReviewWorkflow({
      document: edited,
      expectedDocumentHash: hashSceneDocument(edited),
      reviewRoot,
    });
    const repeated = beginSceneReviewWorkflow({
      document: edited,
      expectedDocumentHash: hashSceneDocument(edited),
      reviewRoot,
    });
    expect(repeated).toEqual(first);
    expect(
      recordManualSceneEdit({ document: moveSubject(edited, 1), reviewRoot }),
    ).toMatchObject({ phase: 'manual-edit' });
  });

  test('contract corrections cannot delete or weaken required acceptance', () => {
    const { reviewRoot, scene } = materializedReviewedScene();
    const deleted = structuredClone(scene);
    deleted.authoring!.composition!.features[0].acceptance.pop();
    expect(() =>
      planContractCorrection(reviewRoot, scene, deleted),
    ).toThrowError(
      expect.objectContaining({ code: 'review_criterion_deleted' }),
    );

    const optional = structuredClone(scene);
    optional.authoring!.composition!.features[0].priority = 'optional';
    expect(() =>
      planContractCorrection(reviewRoot, scene, optional),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_downgrade' }),
    );

    const looser = structuredClone(scene);
    const criterion = looser.authoring!.composition!.features[0].acceptance[1];
    if (criterion.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    criterion.extentTolerance = 0.5;
    expect(() =>
      planContractCorrection(reviewRoot, scene, looser),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_downgrade' }),
    );
  });

  test('contract corrections compare effective default tolerances', () => {
    const projectedBase = makeComposedScene();
    const projected =
      projectedBase.authoring!.composition!.features[0].acceptance[1];
    if (projected.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    delete projected.centerTolerance;
    delete projected.extentTolerance;
    const projectedFixture = materializedReviewedScene(projectedBase);
    const projectedLooser = structuredClone(projectedBase);
    const nextProjected =
      projectedLooser.authoring!.composition!.features[0].acceptance[1];
    if (nextProjected.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    nextProjected.centerTolerance = 0.5;
    nextProjected.extentTolerance = 0.5;
    expect(() =>
      planContractCorrection(
        projectedFixture.reviewRoot,
        projectedBase,
        projectedLooser,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_downgrade' }),
    );

    const spatialBase = makeComposedScene();
    spatialBase.authoring!.composition!.features[0].acceptance.push({
      id: 'subject-touch',
      kind: 'spatial-relation',
      nodeRefs: ['subject'],
      relation: 'touching',
      target: 'subject',
    });
    const spatialFixture = materializedReviewedScene(spatialBase);
    const spatialLooser = structuredClone(spatialBase);
    const nextSpatial =
      spatialLooser.authoring!.composition!.features[0].acceptance[2];
    if (nextSpatial.kind !== 'spatial-relation') {
      throw new Error('Expected spatial fixture');
    }
    nextSpatial.tolerance = 1;
    expect(() =>
      planContractCorrection(
        spatialFixture.reviewRoot,
        spatialBase,
        spatialLooser,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_downgrade' }),
    );
  });

  test('contract corrections cannot weaken optional feature acceptance', () => {
    const optionalBase = makeComposedScene();
    optionalBase.authoring!.composition!.features[0].priority = 'optional';
    const projected =
      optionalBase.authoring!.composition!.features[0].acceptance[1];
    if (projected.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    delete projected.centerTolerance;
    const { reviewRoot } = materializedReviewedScene(optionalBase);
    const looser = structuredClone(optionalBase);
    const next = looser.authoring!.composition!.features[0].acceptance[1];
    if (next.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    next.centerTolerance = 0.5;
    expect(() =>
      planContractCorrection(reviewRoot, optionalBase, looser),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_downgrade' }),
    );
  });

  test('contract corrections preserve source and review authority', () => {
    const authorityScene = makeComposedScene();
    authorityScene.authoring!.composition!.review.lenses = ['layout', 'final'];
    authorityScene.authoring!.composition!.review.requiredViews = [
      'hero',
      'diagnostic',
    ];
    authorityScene.authoring!.views!.push({
      height: 4,
      id: 'diagnostic',
      position: [0, 5, 0],
      projection: 'orthographic',
      role: 'hero',
      target: [0, 0, 0],
    });
    const { reviewRoot, scene } = materializedReviewedScene(authorityScene);
    const mutations: Array<(candidate: SceneDocument) => void> = [
      (candidate) => {
        const prompt = 'A different source';
        candidate.authoring!.composition!.input.prompt = prompt;
        candidate.authoring!.composition!.provenance.inputHashes = [
          sha256(prompt),
          `sha256:${'d'.repeat(64)}`,
        ];
      },
      (candidate) => {
        candidate.authoring!.composition!.representationPolicy.fidelityCeiling =
          'lower';
      },
      (candidate) => {
        candidate.authoring!.composition!.review.lenses = ['final'];
      },
      (candidate) => {
        candidate.authoring!.composition!.review.requiredViews = ['hero'];
      },
      (candidate) => {
        candidate.authoring!.composition!.review.heroView = 'diagnostic';
      },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(scene);
      mutate(candidate);
      expect(() =>
        planContractCorrection(reviewRoot, scene, candidate),
      ).toThrowError(
        expect.objectContaining({ code: 'review_contract_downgrade' }),
      );
    }
  });

  test('allows a tighter measurement tolerance and same-ID camera correction', () => {
    const strongerFixture = materializedReviewedScene();
    const stronger = structuredClone(strongerFixture.scene);
    const criterion =
      stronger.authoring!.composition!.features[0].acceptance[1];
    if (criterion.kind !== 'projected-region') {
      throw new Error('Expected projected-region fixture');
    }
    criterion.extentTolerance = 0.05;
    expect(
      planContractCorrection(
        strongerFixture.reviewRoot,
        strongerFixture.scene,
        stronger,
      ),
    ).not.toBeNull();

    const cameraFixture = materializedReviewedScene();
    const camera = structuredClone(cameraFixture.scene);
    camera.authoring!.views![0].position = [1, 2, 6];
    const plan = planSceneReviewTransition({
      candidate: camera,
      correction: correction('camera'),
      current: cameraFixture.scene,
      expectedBaseDocumentHash: hashSceneDocument(cameraFixture.scene),
      operation: 'transaction',
      patch: transactionPatch(cameraFixture.scene, camera),
      reviewRoot: cameraFixture.reviewRoot,
    });
    expect(plan?.nextState).toMatchObject({
      phase: 'awaiting-review',
      round: 1,
    });
    expect(plan?.nextState.contractHash).not.toBe(
      readSceneReviewWorkflowState(cameraFixture.reviewRoot)?.contractHash,
    );
  });

  test('marks an untracked human edit as manual and blocks review, publish, and composer continuation', () => {
    const { reviewRoot, scene } = materializedReviewedScene();
    const edited = moveSubject(scene, 1);

    expect(
      recordManualSceneEdit({ document: edited, reviewRoot }),
    ).toMatchObject({
      phase: 'manual-edit',
      documentHash: hashSceneDocument(edited),
    });
    expect(readSceneReviewWorkflowState(reviewRoot)).not.toHaveProperty(
      'headReview',
    );
    expect(() =>
      assertSceneReviewWorkflowPublishable({
        document: edited,
        reviewLink: REVIEW_LINK,
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_workflow_not_publishable' }),
    );
    expect(() =>
      planSceneReviewTransition({
        candidate: moveSubject(edited, 2),
        correction: correction('scene'),
        current: edited,
        expectedBaseDocumentHash: hashSceneDocument(edited),
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'review_manual_edit_requires_rebaseline',
      }),
    );
    expect(() => saveHeadReview(reviewRoot, edited, 0)).toThrowError(
      expect.objectContaining({
        code: 'review_manual_edit_requires_rebaseline',
      }),
    );
  });

  test('camera and contract corrections cannot smuggle runtime changes', () => {
    const contractFixture = materializedReviewedScene();
    const contractAndRuntime = moveSubject(contractFixture.scene, 1);
    contractAndRuntime.authoring!.composition!.features[0].description =
      'A clarified required subject';
    expect(() =>
      planContractCorrection(
        contractFixture.reviewRoot,
        contractFixture.scene,
        contractAndRuntime,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'review_contract_correction_scope' }),
    );

    const cameraFixture = materializedReviewedScene();
    const cameraAndRuntime = moveSubject(cameraFixture.scene, 1);
    cameraAndRuntime.authoring!.views![0].position = [1, 2, 6];
    expect(() =>
      planSceneReviewTransition({
        candidate: cameraAndRuntime,
        correction: correction('camera'),
        current: cameraFixture.scene,
        expectedBaseDocumentHash: hashSceneDocument(cameraFixture.scene),
        operation: 'transaction',
        patch: transactionPatch(cameraFixture.scene, cameraAndRuntime),
        reviewRoot: cameraFixture.reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_camera_correction_scope' }),
    );

    const cameraWithContractSmuggle = structuredClone(cameraFixture.scene);
    cameraWithContractSmuggle.authoring!.views![0].position = [1, 2, 6];
    cameraWithContractSmuggle.authoring!.composition!.representationPolicy.fidelityCeiling =
      'hidden-change';
    expect(() =>
      planSceneReviewTransition({
        candidate: cameraWithContractSmuggle,
        correction: correction('camera'),
        current: cameraFixture.scene,
        expectedBaseDocumentHash: hashSceneDocument(cameraFixture.scene),
        operation: 'transaction',
        patch: transactionPatch(cameraFixture.scene, cameraWithContractSmuggle),
        reviewRoot: cameraFixture.reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_camera_correction_scope' }),
    );
  });

  test('writes a content-addressed correction record and detects tampering on replay', () => {
    const { reviewRoot, scene } = materializedReviewedScene();
    const corrected = moveSubject(scene, 1);
    expect(() =>
      planSceneReviewTransition({
        candidate: corrected,
        correction: correction('scene'),
        current: scene,
        expectedBaseDocumentHash: hashSceneDocument(scene),
        operation: 'transaction',
        patch: transactionPatch(scene, scene),
        reviewRoot,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'review_correction_patch_mismatch' }),
    );
    const plan = planSceneReviewTransition({
      candidate: corrected,
      correction: correction('scene'),
      current: scene,
      expectedBaseDocumentHash: hashSceneDocument(scene),
      operation: 'transaction',
      patch: transactionPatch(scene, corrected),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: corrected,
      plan: plan!,
      reviewRoot,
    });

    const state = readSceneReviewWorkflowState(reviewRoot);
    expect(state?.headCorrection).toMatchObject({
      correctionSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      path: expect.stringMatching(
        /^corrections\/round-0001-[0-9a-f]{64}\.iwsdk\.scene-correction\.json$/,
      ),
    });
    const recordPath = path.join(reviewRoot, state!.headCorrection!.path);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    expect(record).toMatchObject({
      version: 'iwsdk.scene-correction.v1',
      round: 1,
      intent: { defectTags: ['fixture-defect'], kind: 'scene' },
      base: { documentHash: hashSceneDocument(scene) },
      candidate: { documentHash: hashSceneDocument(corrected) },
      patchSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      previousReview: REVIEW_LINK,
    });

    writeFileSync(recordPath, '{}\n');
    expect(() => readSceneReviewWorkflowState(reviewRoot)).toThrowError(
      expect.objectContaining({ code: 'review_workflow_corrupt' }),
    );
  });

  test('replays every correction record and rejects old deletion, tampering, or relinking', () => {
    const { reviewRoot, scene } = materializedReviewedScene();
    const first = moveSubject(scene, 1);
    const firstPlan = planSceneReviewTransition({
      candidate: first,
      correction: correction('scene'),
      current: scene,
      expectedBaseDocumentHash: hashSceneDocument(scene),
      operation: 'transaction',
      patch: transactionPatch(scene, first),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: first,
      plan: firstPlan!,
      reviewRoot,
    });
    saveHeadReview(reviewRoot, first, 1);
    const second = moveSubject(first, 2);
    const secondPlan = planSceneReviewTransition({
      candidate: second,
      correction: correction('scene'),
      current: first,
      expectedBaseDocumentHash: hashSceneDocument(first),
      operation: 'transaction',
      patch: transactionPatch(first, second),
      reviewRoot,
    });
    commitSceneReviewTransition({
      document: second,
      plan: secondPlan!,
      reviewRoot,
    });
    const state = readSceneReviewWorkflowState(reviewRoot)!;
    const headPath = path.join(reviewRoot, state.headCorrection!.path);
    const headRecord = JSON.parse(readFileSync(headPath, 'utf8'));
    const oldPath = path.join(reviewRoot, headRecord.previousCorrection.path);
    const oldBytes = readFileSync(oldPath);

    rmSync(oldPath);
    expect(() => readSceneReviewWorkflowState(reviewRoot)).toThrowError(
      expect.objectContaining({ code: 'review_workflow_corrupt' }),
    );
    writeFileSync(oldPath, oldBytes);
    writeFileSync(oldPath, '{}\n');
    expect(() => readSceneReviewWorkflowState(reviewRoot)).toThrowError(
      expect.objectContaining({ code: 'review_workflow_corrupt' }),
    );
    writeFileSync(oldPath, oldBytes);

    const unrelated = materializedReviewedScene();
    const unrelatedFirst = moveSubject(unrelated.scene, 3);
    const unrelatedPlan = planSceneReviewTransition({
      candidate: unrelatedFirst,
      correction: correction('scene'),
      current: unrelated.scene,
      expectedBaseDocumentHash: hashSceneDocument(unrelated.scene),
      operation: 'transaction',
      patch: transactionPatch(unrelated.scene, unrelatedFirst),
      reviewRoot: unrelated.reviewRoot,
    });
    commitSceneReviewTransition({
      document: unrelatedFirst,
      plan: unrelatedPlan!,
      reviewRoot: unrelated.reviewRoot,
    });
    const unrelatedState = readSceneReviewWorkflowState(unrelated.reviewRoot)!;
    const unrelatedLink = unrelatedState.headCorrection!;
    const copiedOldPath = path.join(reviewRoot, unrelatedLink.path);
    mkdirSync(path.dirname(copiedOldPath), { recursive: true });
    copyFileSync(
      path.join(unrelated.reviewRoot, unrelatedLink.path),
      copiedOldPath,
    );
    headRecord.previousCorrection = unrelatedLink;
    const alteredHeadSha256 = sha256(canonicalizeJson(headRecord));
    const alteredHead = {
      correctionSha256: alteredHeadSha256,
      path: `corrections/round-0002-${alteredHeadSha256.slice(
        'sha256:'.length,
      )}.iwsdk.scene-correction.json`,
    };
    writeFileSync(
      path.join(reviewRoot, alteredHead.path),
      `${JSON.stringify(headRecord, null, 2)}\n`,
    );
    state.headCorrection = alteredHead;
    writeFileSync(
      path.join(reviewRoot, 'workflow.iwsdk.review-workflow.json'),
      `${JSON.stringify(state, null, 2)}\n`,
    );
    expect(() => readSceneReviewWorkflowState(reviewRoot)).toThrowError(
      expect.objectContaining({ code: 'review_workflow_corrupt' }),
    );
  });
});

function materializedReviewedScene(scene = makeComposedScene()) {
  const reviewRoot = makeRoot();
  const blank = makeBlankScene();
  const plan = planSceneReviewTransition({
    candidate: scene,
    current: blank,
    expectedBaseDocumentHash: hashSceneDocument(blank),
    operation: 'replace-document',
    patch: replacementPatch(scene),
    reviewRoot,
  });
  commitSceneReviewTransition({ document: scene, plan: plan!, reviewRoot });
  beginSceneReviewWorkflow({
    document: scene,
    expectedDocumentHash: hashSceneDocument(scene),
    reviewRoot,
  });
  saveHeadReview(reviewRoot, scene, 0);
  return { reviewRoot, scene };
}

function planContractCorrection(
  reviewRoot: string,
  current: SceneDocument,
  candidate: SceneDocument,
) {
  return planSceneReviewTransition({
    candidate,
    correction: correction('contract'),
    current,
    expectedBaseDocumentHash: hashSceneDocument(current),
    operation: 'transaction',
    patch: transactionPatch(current, candidate),
    reviewRoot,
  });
}

function saveHeadReview(
  reviewRoot: string,
  document: SceneDocument,
  round: number,
  includeCorrection = true,
) {
  const workflowState = readSceneReviewWorkflowState(reviewRoot);
  const review: SceneReview = {
    capabilityHash: CAPABILITY_HASH,
    documentHash: hashSceneDocument(document),
    featureResults: [],
    lenses: [],
    result: 'fail',
    round,
    runtimeHash: hashRuntimeSceneDocument(document),
    sourceHashes: [],
    stop: { openDefectTags: ['fixture'], reason: 'plateau' },
    version: 'iwsdk.scene-review.v1',
    waivers: [],
    ...(round === 0
      ? {}
      : {
          previousReview: REVIEW_LINK,
          ...(includeCorrection
            ? { correction: workflowState!.headCorrection! }
            : {}),
        }),
  };
  return recordSceneReviewWorkflowReview({
    document,
    review,
    reviewLink: REVIEW_LINK,
    reviewRoot,
  });
}

function correction(kind: 'scene' | 'resource' | 'camera' | 'contract') {
  return {
    defectTags: ['fixture-defect'],
    kind,
    previousReview: REVIEW_LINK,
  };
}

function moveSubject(scene: SceneDocument, x: number): SceneDocument {
  const candidate = structuredClone(scene);
  candidate.nodes[0].transform = { position: [x, 0, 0] };
  return candidate;
}

function replacementPatch(candidate: SceneDocument) {
  return { document: candidate, op: 'replaceDocument' as const };
}

function transactionPatch(
  current: SceneDocument,
  candidate: SceneDocument,
): ScenePatch {
  const patches: ScenePatch[] = [];
  if (
    canonicalizeJson(current.authoring ?? {}) !==
    canonicalizeJson(candidate.authoring ?? {})
  ) {
    patches.push({
      authoring: candidate.authoring,
      op: 'setAuthoring',
    });
  }
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  for (const node of candidate.nodes) {
    if (
      canonicalizeJson(currentNodes.get(node.id)?.transform ?? {}) !==
      canonicalizeJson(node.transform ?? {})
    ) {
      patches.push({
        nodeId: node.id,
        op: 'updateTransform',
        transform: node.transform,
      });
    }
  }
  return { op: 'transaction', patches };
}

function makeBlankScene(): SceneDocument {
  return {
    nodes: [],
    resources: {},
    units: 'meters',
    version: 'iwsdk.scene.v1',
  };
}

function makeComposedScene(): SceneDocument {
  const prompt = 'A blue box';
  return {
    authoring: {
      composition: {
        feasibility: { status: 'supported' },
        features: [
          {
            acceptance: [
              {
                id: 'subject-present',
                kind: 'presence',
                nodeRefs: ['subject'],
                view: 'hero',
              },
              {
                centerTolerance: 0.05,
                extentTolerance: 0.1,
                id: 'subject-frame',
                kind: 'projected-region',
                measurement: {
                  applicability: 'visible-node-mask',
                  method: 'capture-node-mask-bounds-v1',
                },
                nodeRefs: ['subject'],
                reference: 'reference',
                region: [0.25, 0.25, 0.5, 0.5],
                view: 'hero',
              },
            ],
            description: 'The required subject',
            id: 'subject-feature',
            nodeRefs: ['subject'],
            priority: 'required',
          },
        ],
        input: {
          kind: 'hybrid',
          prompt,
          references: [
            {
              height: 100,
              id: 'reference',
              roles: ['layout'],
              sha256: 'd'.repeat(64),
              uri: './reference.png',
              width: 100,
            },
          ],
        },
        mode: 'static',
        provenance: {
          adapter: { id: 'fixture', version: '1' },
          capabilityHash: CAPABILITY_HASH,
          inputHashes: [sha256(prompt), `sha256:${'d'.repeat(64)}`],
          skill: { id: 'iwsdk-scene-composer', version: '1' },
        },
        representationPolicy: {
          allowed: ['asset'],
          fidelityCeiling: 'fixture',
        },
        review: {
          heroView: 'hero',
          lenses: ['final'],
          maxCorrectionRounds: 2,
          requiredViews: ['hero'],
        },
        target: {
          assetPolicy: 'manifest-assets',
          surfaces: ['browser'],
        },
      },
      views: [
        {
          height: 4,
          id: 'hero',
          position: [0, 0, 5],
          projection: 'orthographic',
          role: 'hero',
          target: [0, 0, 0],
        },
      ],
    },
    nodes: [
      {
        content: { asset: 'blue-box', type: 'asset' },
        id: 'subject',
      },
    ],
    resources: {},
    units: 'meters',
    version: 'iwsdk.scene.v1',
  };
}

function makeRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'iwsdk-review-workflow-'));
  roots.push(root);
  return root;
}
