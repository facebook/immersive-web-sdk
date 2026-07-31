/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import {
  linkSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import * as path from 'path';
import {
  applyScenePatch,
  collectSceneReviewCriterionKeys,
  canonicalizeJson,
  DEFAULT_PROJECTED_REGION_CENTER_TOLERANCE,
  DEFAULT_PROJECTED_REGION_EXTENT_TOLERANCE,
  DEFAULT_SPATIAL_RELATION_TOLERANCE,
  hashRuntimeSceneDocument,
  hashSceneDocument,
  hashSceneReviewContract,
  sha256,
  type SceneDocument,
  type SceneFeature,
  type SceneFeatureAcceptance,
  type SceneReview,
  type ScenePatch,
  type Sha256,
} from '@iwsdk/scene-composition';

const WORKFLOW_FILE_NAME = 'workflow.iwsdk.review-workflow.json';
const CORRECTION_DIRECTORY_NAME = 'corrections';

export interface SceneReviewRecordLink {
  path: string;
  reviewSha256: Sha256;
}

export interface SceneCorrectionRecordLink {
  path: string;
  correctionSha256: Sha256;
}

export interface SceneCorrectionRecord {
  version: 'iwsdk.scene-correction.v1';
  round: number;
  intent: Omit<SceneCorrectionIntent, 'previousReview'>;
  previousReview: SceneReviewRecordLink;
  previousCorrection?: SceneCorrectionRecordLink;
  patchSha256: Sha256;
  base: {
    contractHash: Sha256;
    documentHash: Sha256;
    runtimeHash: Sha256;
  };
  candidate: {
    contractHash: Sha256;
    documentHash: Sha256;
    runtimeHash: Sha256;
  };
}

export interface SceneCorrectionIntent {
  kind: 'scene' | 'resource' | 'camera' | 'contract';
  previousReview: SceneReviewRecordLink;
  defectTags: string[];
  reason?: string;
}

export interface SceneReviewWorkflowState {
  version: 'iwsdk.review-workflow.v1';
  phase: 'draft' | 'awaiting-review' | 'manual-edit' | 'reviewed';
  contractHash: Sha256 | null;
  documentHash: Sha256;
  runtimeHash: Sha256;
  lockedMaxCorrectionRounds: number;
  round: number;
  previousReview?: SceneReviewRecordLink;
  headReview?: SceneReviewRecordLink;
  headCorrection?: SceneCorrectionRecordLink;
}

export interface SceneReviewTransitionPlan {
  correctionRecord?: SceneCorrectionRecord;
  expectedState: SceneReviewWorkflowState | null;
  nextState: SceneReviewWorkflowState;
}

export class SceneReviewWorkflowError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 409,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function beginSceneReviewWorkflow(input: {
  document: SceneDocument;
  expectedDocumentHash: Sha256;
  reviewRoot: string;
}): SceneReviewWorkflowState {
  const documentHash = hashSceneDocument(input.document);
  if (documentHash.toLowerCase() !== input.expectedDocumentHash.toLowerCase()) {
    throw new SceneReviewWorkflowError(
      'Review freeze hash does not match the current persisted scene.',
      'review_begin_hash_mismatch',
      409,
      { currentDocumentHash: documentHash },
    );
  }
  const contractHash = hashSceneReviewContract(input.document);
  const configuredMaximum =
    input.document.authoring?.composition?.review.maxCorrectionRounds;
  if (contractHash == null || configuredMaximum == null) {
    throw new SceneReviewWorkflowError(
      'Beginning formal review requires a composed scene with a review contract.',
      'review_contract_missing',
      400,
    );
  }

  const state = readSceneReviewWorkflowState(input.reviewRoot);
  if (state != null) {
    if (
      state.documentHash.toLowerCase() !== documentHash.toLowerCase() ||
      !sameOptionalSha256(state.contractHash, contractHash)
    ) {
      throw new SceneReviewWorkflowError(
        'The draft workflow does not match the scene being frozen for review.',
        'review_begin_draft_mismatch',
        409,
        {
          expectedDocumentHash: state.documentHash,
          currentDocumentHash: documentHash,
        },
      );
    }
    if (state.phase === 'awaiting-review' && state.round === 0) {
      return state;
    }
    if (state.phase !== 'draft') {
      throw new SceneReviewWorkflowError(
        'Formal review has already started for this scene workflow.',
        'review_already_started',
      );
    }
  }

  const frozen: SceneReviewWorkflowState = {
    version: 'iwsdk.review-workflow.v1',
    phase: 'awaiting-review',
    contractHash,
    documentHash,
    runtimeHash: hashRuntimeSceneDocument(input.document),
    lockedMaxCorrectionRounds: configuredMaximum,
    round: 0,
  };
  writeSceneReviewWorkflowState(input.reviewRoot, frozen);
  return frozen;
}

export function planSceneReviewTransition(input: {
  candidate: SceneDocument;
  correction?: unknown;
  current: SceneDocument;
  expectedBaseDocumentHash: Sha256;
  operation?: unknown;
  patch?: unknown;
  reviewRoot: string;
}): SceneReviewTransitionPlan | null {
  const currentDocumentHash = hashSceneDocument(input.current);
  if (
    currentDocumentHash.toLowerCase() !==
    input.expectedBaseDocumentHash.toLowerCase()
  ) {
    throw new SceneReviewWorkflowError(
      'Transition base hash does not match the current persisted scene.',
      'review_transition_base_mismatch',
      409,
      { currentDocumentHash },
    );
  }

  const candidateContractHash = hashSceneReviewContract(input.candidate);
  const currentContractHash = hashSceneReviewContract(input.current);
  const state = readSceneReviewWorkflowState(input.reviewRoot);
  if (candidateContractHash == null && state == null) {
    return null;
  }

  const candidateDocumentHash = hashSceneDocument(input.candidate);
  const candidateRuntimeHash = hashRuntimeSceneDocument(input.candidate);
  const configuredMaximum =
    input.candidate.authoring?.composition?.review.maxCorrectionRounds;

  if (state == null) {
    return {
      expectedState: null,
      nextState: createDraftWorkflowState(input.candidate),
    };
  }

  if (
    state.documentHash.toLowerCase() !== currentDocumentHash.toLowerCase() ||
    !sameOptionalSha256(state.contractHash, currentContractHash)
  ) {
    throw new SceneReviewWorkflowError(
      'The persisted scene revision is outside the server-owned review workflow.',
      'untracked_scene_revision',
      409,
      { expectedDocumentHash: state.documentHash, currentDocumentHash },
    );
  }
  if (state.phase === 'draft') {
    return {
      expectedState: state,
      nextState: createDraftWorkflowState(input.candidate),
    };
  }
  if (candidateContractHash == null || configuredMaximum == null) {
    throw new SceneReviewWorkflowError(
      'A formal composed-scene workflow cannot remove its review contract.',
      'review_contract_removed',
    );
  }
  if (state.phase === 'manual-edit') {
    throw new SceneReviewWorkflowError(
      'This scene was changed outside an authorized correction. Rebaseline it or start a new composed scene before continuing.',
      'review_manual_edit_requires_rebaseline',
    );
  }
  if (state.phase !== 'reviewed' || state.headReview == null) {
    throw new SceneReviewWorkflowError(
      'Save the immutable review for the current revision before committing another correction.',
      'review_required_before_correction',
      409,
      { round: state.round },
    );
  }

  assertCorrectionTransitionOperation(input.operation, input.patch);

  const correction = parseCorrectionIntent(input.correction);
  assertSameReviewLink(correction.previousReview, state.headReview);
  if (state.round >= state.lockedMaxCorrectionRounds) {
    throw new SceneReviewWorkflowError(
      `Correction ceiling ${state.lockedMaxCorrectionRounds} has been reached.`,
      'review_correction_limit',
      409,
      { round: state.round },
    );
  }
  if (configuredMaximum !== state.lockedMaxCorrectionRounds) {
    throw new SceneReviewWorkflowError(
      'The correction ceiling is immutable after formal review begins.',
      'review_correction_limit_changed',
    );
  }

  const contractChanged =
    candidateContractHash.toLowerCase() !== state.contractHash?.toLowerCase();
  if (
    correction.kind !== 'contract' &&
    correction.kind !== 'camera' &&
    contractChanged
  ) {
    throw new SceneReviewWorkflowError(
      'Acceptance criteria and review views are immutable during an implementation correction.',
      'review_contract_changed',
    );
  }
  if (correction.kind === 'camera') {
    assertCameraOnlyContractChange(input.current, input.candidate);
  }
  if (correction.kind === 'contract') {
    assertRuntimeUnchanged(
      input.current,
      input.candidate,
      'Contract correction may change only the authoring review contract.',
      'review_contract_correction_scope',
    );
    if (!contractChanged) {
      throw new SceneReviewWorkflowError(
        'A contract correction must change the canonical review contract.',
        'review_contract_unchanged',
        400,
      );
    }
    assertContractAuthorityPreserved(input.current, input.candidate);
    const previousKeys = collectSceneReviewCriterionKeys(input.current);
    const candidateKeys = collectSceneReviewCriterionKeys(input.candidate);
    const deleted = [...previousKeys].filter((key) => !candidateKeys.has(key));
    if (deleted.length > 0) {
      throw new SceneReviewWorkflowError(
        'Contract correction cannot delete an acceptance criterion without a trusted user-approval artifact.',
        'review_criterion_deleted',
        409,
        { criteria: deleted.map(displayCriterionKey) },
      );
    }
    assertContractCorrectionDoesNotDowngrade(input.current, input.candidate);
  }

  const patchSha256 = hashVerifiedCorrectionPatch(
    input.patch,
    input.current,
    input.candidate,
  );
  const correctionRecord: SceneCorrectionRecord = {
    version: 'iwsdk.scene-correction.v1',
    round: state.round + 1,
    intent: {
      kind: correction.kind,
      defectTags: correction.defectTags,
      ...(correction.reason == null ? {} : { reason: correction.reason }),
    },
    previousReview: correction.previousReview,
    ...(state.headCorrection == null
      ? {}
      : { previousCorrection: state.headCorrection }),
    patchSha256,
    base: {
      contractHash: state.contractHash!,
      documentHash: state.documentHash,
      runtimeHash: state.runtimeHash,
    },
    candidate: {
      contractHash: candidateContractHash,
      documentHash: candidateDocumentHash,
      runtimeHash: candidateRuntimeHash,
    },
  };
  const correctionLink = correctionRecordLink(correctionRecord);

  const next: SceneReviewWorkflowState = {
    version: 'iwsdk.review-workflow.v1',
    phase: 'awaiting-review',
    contractHash: candidateContractHash,
    documentHash: candidateDocumentHash,
    runtimeHash: candidateRuntimeHash,
    lockedMaxCorrectionRounds: state.lockedMaxCorrectionRounds,
    round: state.round + 1,
    previousReview: state.headReview,
    headCorrection: correctionLink,
  };
  return { correctionRecord, expectedState: state, nextState: next };
}

export function commitSceneReviewTransition(input: {
  document: SceneDocument;
  plan: SceneReviewTransitionPlan;
  reviewRoot: string;
}): SceneReviewWorkflowState {
  const currentState = readSceneReviewWorkflowState(input.reviewRoot);
  if (!sameWorkflowState(currentState, input.plan.expectedState)) {
    throw new SceneReviewWorkflowError(
      'The review workflow changed after this transition was authorized.',
      'review_transition_race',
    );
  }
  const documentHash = hashSceneDocument(input.document);
  const runtimeHash = hashRuntimeSceneDocument(input.document);
  const contractHash = hashSceneReviewContract(input.document);
  if (
    documentHash.toLowerCase() !==
      input.plan.nextState.documentHash.toLowerCase() ||
    runtimeHash.toLowerCase() !==
      input.plan.nextState.runtimeHash.toLowerCase() ||
    !sameOptionalSha256(contractHash, input.plan.nextState.contractHash)
  ) {
    throw new SceneReviewWorkflowError(
      'Committed scene does not match the authorized transition candidate.',
      'review_transition_target_mismatch',
    );
  }
  if (input.plan.correctionRecord != null) {
    const expectedLink = correctionRecordLink(input.plan.correctionRecord);
    if (
      input.plan.nextState.headCorrection == null ||
      !sameCorrectionLink(expectedLink, input.plan.nextState.headCorrection)
    ) {
      throw new SceneReviewWorkflowError(
        'Authorized correction record does not match the workflow head.',
        'review_correction_record_mismatch',
        500,
      );
    }
    writeImmutableCorrectionRecord(
      input.reviewRoot,
      input.plan.correctionRecord,
      expectedLink,
    );
  }
  writeSceneReviewWorkflowState(input.reviewRoot, input.plan.nextState);
  return input.plan.nextState;
}

function createDraftWorkflowState(
  document: SceneDocument,
): SceneReviewWorkflowState {
  return {
    version: 'iwsdk.review-workflow.v1',
    phase: 'draft',
    contractHash: hashSceneReviewContract(document),
    documentHash: hashSceneDocument(document),
    runtimeHash: hashRuntimeSceneDocument(document),
    lockedMaxCorrectionRounds:
      document.authoring?.composition?.review.maxCorrectionRounds ?? 0,
    round: 0,
  };
}

export function recordSceneReviewWorkflowReview(input: {
  document: SceneDocument;
  review: SceneReview;
  reviewLink: SceneReviewRecordLink;
  reviewRoot: string;
}): SceneReviewWorkflowState | null {
  const contractHash = hashSceneReviewContract(input.document);
  if (contractHash == null) {
    return null;
  }
  const state = readSceneReviewWorkflowState(input.reviewRoot);
  if (state == null) {
    throw new SceneReviewWorkflowError(
      'The composed scene was not materialized through the server-owned review workflow.',
      'review_workflow_missing',
    );
  }
  if (state.phase === 'draft') {
    throw new SceneReviewWorkflowError(
      'Begin formal review before saving immutable review evidence.',
      'review_not_started',
    );
  }
  if (state.phase === 'reviewed') {
    if (
      state.headReview != null &&
      sameReviewLink(state.headReview, input.reviewLink)
    ) {
      return state;
    }
    throw new SceneReviewWorkflowError(
      'This scene revision already has a different immutable review.',
      'review_head_conflict',
    );
  }
  if (state.phase === 'manual-edit') {
    throw new SceneReviewWorkflowError(
      'A manually edited scene must be rebaselined before it can be reviewed.',
      'review_manual_edit_requires_rebaseline',
    );
  }
  const documentHash = hashSceneDocument(input.document);
  const runtimeHash = hashRuntimeSceneDocument(input.document);
  if (
    state.documentHash.toLowerCase() !== documentHash.toLowerCase() ||
    state.runtimeHash.toLowerCase() !== runtimeHash.toLowerCase() ||
    state.contractHash?.toLowerCase() !== contractHash.toLowerCase()
  ) {
    throw new SceneReviewWorkflowError(
      'Review target does not match the authorized correction head.',
      'review_transition_target_mismatch',
    );
  }
  if (input.review.round !== state.round) {
    throw new SceneReviewWorkflowError(
      `Review round must be server-authorized round ${state.round}.`,
      'review_round_mismatch',
      409,
      { expectedRound: state.round },
    );
  }
  if (state.round === 0) {
    if (input.review.previousReview != null) {
      throw new SceneReviewWorkflowError(
        'Initial review cannot name a predecessor.',
        'review_lineage_mismatch',
      );
    }
    if (input.review.correction != null) {
      throw new SceneReviewWorkflowError(
        'Initial review cannot name a correction record.',
        'review_correction_lineage_mismatch',
      );
    }
  } else {
    if (input.review.previousReview == null || state.previousReview == null) {
      throw new SceneReviewWorkflowError(
        'Correction review must link the adjacent immutable predecessor.',
        'review_lineage_mismatch',
      );
    }
    assertSameReviewLink(input.review.previousReview, state.previousReview);
    if (
      input.review.correction == null ||
      state.headCorrection == null ||
      !sameCorrectionLink(input.review.correction, state.headCorrection)
    ) {
      throw new SceneReviewWorkflowError(
        'Correction review must reference the exact immutable correction record for this head.',
        'review_correction_lineage_mismatch',
      );
    }
  }

  const reviewed: SceneReviewWorkflowState = {
    ...state,
    phase: 'reviewed',
    headReview: input.reviewLink,
  };
  delete reviewed.previousReview;
  writeSceneReviewWorkflowState(input.reviewRoot, reviewed);
  return reviewed;
}

export function recordManualSceneEdit(input: {
  document: SceneDocument;
  reviewRoot: string;
}): SceneReviewWorkflowState | null {
  const state = readSceneReviewWorkflowState(input.reviewRoot);
  if (state == null) {
    if (hashSceneReviewContract(input.document) == null) {
      return null;
    }
    const draft = createDraftWorkflowState(input.document);
    writeSceneReviewWorkflowState(input.reviewRoot, draft);
    return draft;
  }
  if (state.phase === 'draft') {
    const draft = createDraftWorkflowState(input.document);
    writeSceneReviewWorkflowState(input.reviewRoot, draft);
    return draft;
  }
  const manual: SceneReviewWorkflowState = {
    ...state,
    phase: 'manual-edit',
    contractHash: hashSceneReviewContract(input.document),
    documentHash: hashSceneDocument(input.document),
    runtimeHash: hashRuntimeSceneDocument(input.document),
  };
  delete manual.headReview;
  delete manual.previousReview;
  writeSceneReviewWorkflowState(input.reviewRoot, manual);
  return manual;
}

export function assertSceneReviewWorkflowPublishable(input: {
  document: SceneDocument;
  reviewLink: SceneReviewRecordLink;
  reviewRoot: string;
}): void {
  const contractHash = hashSceneReviewContract(input.document);
  if (contractHash == null) {
    if (readSceneReviewWorkflowState(input.reviewRoot) == null) {
      return;
    }
    throw new SceneReviewWorkflowError(
      'Publishing requires the exact reviewed head of the server-owned correction workflow.',
      'review_workflow_not_publishable',
    );
  }
  const state = readSceneReviewWorkflowState(input.reviewRoot);
  if (
    state == null ||
    state.phase !== 'reviewed' ||
    state.headReview == null ||
    !sameReviewLink(state.headReview, input.reviewLink) ||
    state.documentHash.toLowerCase() !==
      hashSceneDocument(input.document).toLowerCase() ||
    state.contractHash?.toLowerCase() !== contractHash.toLowerCase()
  ) {
    throw new SceneReviewWorkflowError(
      'Publishing requires the exact reviewed head of the server-owned correction workflow.',
      'review_workflow_not_publishable',
    );
  }
}

export function readSceneReviewWorkflowState(
  reviewRoot: string,
): SceneReviewWorkflowState | null {
  const filePath = path.join(reviewRoot, WORKFLOW_FILE_NAME);
  if (!existsSync(filePath)) {
    return null;
  }
  const value = JSON.parse(
    readFileSync(filePath, 'utf8'),
  ) as SceneReviewWorkflowState;
  if (
    value.version !== 'iwsdk.review-workflow.v1' ||
    (value.phase !== 'draft' &&
      value.phase !== 'awaiting-review' &&
      value.phase !== 'manual-edit' &&
      value.phase !== 'reviewed') ||
    !Number.isInteger(value.round) ||
    value.round < 0 ||
    !Number.isInteger(value.lockedMaxCorrectionRounds) ||
    value.lockedMaxCorrectionRounds < 0 ||
    value.round > value.lockedMaxCorrectionRounds ||
    !isSha256(value.documentHash) ||
    !isSha256(value.runtimeHash) ||
    (value.contractHash != null && !isSha256(value.contractHash)) ||
    (value.phase === 'awaiting-review' &&
      (value.headReview != null ||
        (value.round === 0
          ? value.previousReview != null
          : !isReviewRecordLink(value.previousReview)))) ||
    (value.phase === 'reviewed' &&
      (!isReviewRecordLink(value.headReview) ||
        value.previousReview != null)) ||
    (value.phase === 'manual-edit' &&
      (value.headReview != null || value.previousReview != null)) ||
    (value.phase === 'draft' &&
      (value.round !== 0 ||
        value.headReview != null ||
        value.previousReview != null ||
        value.headCorrection != null))
  ) {
    throw new SceneReviewWorkflowError(
      'Stored review workflow state is malformed.',
      'review_workflow_corrupt',
      500,
    );
  }
  assertCorrectionRecordIntegrity(reviewRoot, value);
  return value;
}

function correctionRecordLink(
  record: SceneCorrectionRecord,
): SceneCorrectionRecordLink {
  const correctionSha256 = sha256(canonicalizeJson(record));
  return {
    correctionSha256,
    path: `${CORRECTION_DIRECTORY_NAME}/round-${String(record.round).padStart(
      4,
      '0',
    )}-${correctionSha256.slice('sha256:'.length)}.iwsdk.scene-correction.json`,
  };
}

function writeImmutableCorrectionRecord(
  reviewRoot: string,
  record: SceneCorrectionRecord,
  link: SceneCorrectionRecordLink,
): void {
  const filePath = resolveCorrectionRecordPath(reviewRoot, link.path);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== serialized) {
      throw new SceneReviewWorkflowError(
        'An immutable correction record already exists with different bytes.',
        'review_correction_record_conflict',
        409,
      );
    }
    return;
  }
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, serialized, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    try {
      linkSync(temporaryPath, filePath);
    } catch (error) {
      if (
        !existsSync(filePath) ||
        readFileSync(filePath, 'utf8') !== serialized
      ) {
        throw error;
      }
    }
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

function assertCorrectionRecordIntegrity(
  reviewRoot: string,
  state: SceneReviewWorkflowState,
): void {
  if (state.round === 0) {
    if (state.headCorrection != null) {
      workflowCorrupt(
        'Initial workflow state cannot name a correction record.',
      );
    }
    return;
  }
  if (
    state.headCorrection == null ||
    state.round > state.lockedMaxCorrectionRounds
  ) {
    workflowCorrupt(
      'Correction workflow head is missing or exceeds its ceiling.',
    );
  }
  const seen = new Set<string>();
  let link: SceneCorrectionRecordLink | undefined = state.headCorrection;
  let expectedRound = state.round;
  let newerRecord: SceneCorrectionRecord | null = null;
  let headRecord: SceneCorrectionRecord | null = null;
  while (link != null) {
    const identity = `${link.path}\u0000${link.correctionSha256.toLowerCase()}`;
    if (seen.has(identity) || seen.size >= state.lockedMaxCorrectionRounds) {
      workflowCorrupt(
        'Correction workflow record chain is cyclic or too long.',
      );
    }
    seen.add(identity);
    const record = readCorrectionRecord(reviewRoot, link);
    if (record.round !== expectedRound) {
      workflowCorrupt('Correction workflow record rounds are not contiguous.');
    }
    if (
      newerRecord != null &&
      !sameCorrectionIdentity(newerRecord.base, record.candidate)
    ) {
      workflowCorrupt(
        'Correction workflow record chain does not replay adjacent scene heads.',
      );
    }
    headRecord ??= record;
    newerRecord = record;
    link = record.previousCorrection;
    expectedRound -= 1;
  }
  if (expectedRound !== 0 || seen.size !== state.round) {
    workflowCorrupt('Correction workflow record chain is incomplete.');
  }
  if (
    state.phase !== 'manual-edit' &&
    (headRecord!.candidate.documentHash.toLowerCase() !==
      state.documentHash.toLowerCase() ||
      headRecord!.candidate.runtimeHash.toLowerCase() !==
        state.runtimeHash.toLowerCase() ||
      !sameOptionalSha256(
        headRecord!.candidate.contractHash,
        state.contractHash,
      ))
  ) {
    workflowCorrupt('Correction workflow record does not replay to its head.');
  }
}

function readCorrectionRecord(
  reviewRoot: string,
  link: SceneCorrectionRecordLink,
): SceneCorrectionRecord {
  const filePath = resolveCorrectionRecordPath(reviewRoot, link.path);
  if (!existsSync(filePath)) {
    workflowCorrupt('Correction workflow record does not exist.');
  }
  let record: SceneCorrectionRecord;
  try {
    record = JSON.parse(
      readFileSync(filePath, 'utf8'),
    ) as SceneCorrectionRecord;
  } catch {
    workflowCorrupt('Correction workflow record is not valid JSON.');
  }
  if (
    record!.version !== 'iwsdk.scene-correction.v1' ||
    !Number.isInteger(record!.round) ||
    record!.round < 1 ||
    !isSha256(record!.patchSha256) ||
    !isReviewRecordLink(record!.previousReview) ||
    !isCorrectionIntentWithoutReview(record!.intent) ||
    !isCorrectionIdentity(record!.base) ||
    !isCorrectionIdentity(record!.candidate) ||
    (record!.previousCorrection != null &&
      !isCorrectionRecordLink(record!.previousCorrection)) ||
    !sameCorrectionLink(correctionRecordLink(record!), link)
  ) {
    workflowCorrupt('Correction workflow record hash or structure is invalid.');
  }
  return record!;
}

function isReviewRecordLink(
  value: SceneReviewRecordLink | null | undefined,
): value is SceneReviewRecordLink {
  return (
    value != null &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    isSha256(value.reviewSha256)
  );
}

function isCorrectionIntentWithoutReview(
  value: SceneCorrectionRecord['intent'] | null | undefined,
): value is SceneCorrectionRecord['intent'] {
  return (
    value != null &&
    (value.kind === 'scene' ||
      value.kind === 'resource' ||
      value.kind === 'camera' ||
      value.kind === 'contract') &&
    Array.isArray(value.defectTags) &&
    value.defectTags.length > 0 &&
    value.defectTags.every(
      (tag) => typeof tag === 'string' && tag.trim().length > 0,
    ) &&
    (value.reason == null || typeof value.reason === 'string')
  );
}

function isCorrectionRecordLink(
  value: SceneCorrectionRecordLink | null | undefined,
): value is SceneCorrectionRecordLink {
  return (
    value != null &&
    typeof value.path === 'string' &&
    isSha256(value.correctionSha256)
  );
}

function isCorrectionIdentity(
  value: SceneCorrectionRecord['base'] | null | undefined,
): value is SceneCorrectionRecord['base'] {
  return (
    value != null &&
    isSha256(value.contractHash) &&
    isSha256(value.documentHash) &&
    isSha256(value.runtimeHash)
  );
}

function sameCorrectionIdentity(
  left: SceneCorrectionRecord['base'],
  right: SceneCorrectionRecord['base'],
): boolean {
  return (
    left.contractHash.toLowerCase() === right.contractHash.toLowerCase() &&
    left.documentHash.toLowerCase() === right.documentHash.toLowerCase() &&
    left.runtimeHash.toLowerCase() === right.runtimeHash.toLowerCase()
  );
}

function isSha256(value: unknown): value is Sha256 {
  return typeof value === 'string' && /^sha256:[0-9a-fA-F]{64}$/.test(value);
}

function resolveCorrectionRecordPath(
  reviewRoot: string,
  relativePath: string,
): string {
  const recordsRoot = path.resolve(reviewRoot, CORRECTION_DIRECTORY_NAME);
  const filePath = path.resolve(reviewRoot, relativePath);
  if (
    filePath === recordsRoot ||
    !filePath.startsWith(`${recordsRoot}${path.sep}`)
  ) {
    workflowCorrupt(
      'Correction workflow record path escapes its immutable directory.',
    );
  }
  return filePath;
}

function workflowCorrupt(message: string): never {
  throw new SceneReviewWorkflowError(message, 'review_workflow_corrupt', 500);
}

function writeSceneReviewWorkflowState(
  reviewRoot: string,
  state: SceneReviewWorkflowState,
): void {
  mkdirSync(reviewRoot, { recursive: true });
  const filePath = path.join(reviewRoot, WORKFLOW_FILE_NAME);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
    throw error;
  }
}

function assertContractAuthorityPreserved(
  previous: SceneDocument,
  candidate: SceneDocument,
): void {
  const previousComposition = previous.authoring?.composition!;
  const candidateComposition = candidate.authoring?.composition!;
  for (const field of [
    'input',
    'provenance',
    'target',
    'representationPolicy',
  ] as const) {
    if (
      canonicalizeJson(previousComposition[field]) !==
      canonicalizeJson(candidateComposition[field])
    ) {
      contractDowngrade(
        `contract source authority field "${field}" is immutable`,
      );
    }
  }
  if (
    candidateComposition.review.heroView !==
      previousComposition.review.heroView ||
    previousComposition.review.requiredViews.some(
      (view) => !candidateComposition.review.requiredViews.includes(view),
    ) ||
    previousComposition.review.lenses.some(
      (lens) => !candidateComposition.review.lenses.includes(lens),
    )
  ) {
    contractDowngrade(
      'hero view, required views, and existing review lenses cannot be removed or replaced',
    );
  }
  const candidateViews = new Map(
    (candidate.authoring?.views ?? []).map((view) => [view.id, view]),
  );
  for (const previousView of previous.authoring?.views ?? []) {
    const candidateView = candidateViews.get(previousView.id);
    if (
      candidateView == null ||
      canonicalizeJson(candidateView) !== canonicalizeJson(previousView)
    ) {
      contractDowngrade(
        `existing review view "${previousView.id}" must be preserved; use a camera correction for pose changes`,
      );
    }
  }
}

function assertContractCorrectionDoesNotDowngrade(
  previous: SceneDocument,
  candidate: SceneDocument,
): void {
  const candidateFeatures = new Map(
    (candidate.authoring?.composition?.features ?? []).map((feature) => [
      feature.id,
      feature,
    ]),
  );
  for (const previousFeature of previous.authoring?.composition?.features ??
    []) {
    const candidateFeature = candidateFeatures.get(previousFeature.id);
    if (candidateFeature == null) {
      contractDowngrade(
        `existing feature "${previousFeature.id}" cannot be removed`,
      );
    }
    if (
      previousFeature.priority === 'required' &&
      candidateFeature.priority !== 'required'
    ) {
      contractDowngrade(
        `required feature "${previousFeature.id}" cannot be removed or made optional`,
      );
    }
    for (const nodeRef of previousFeature.nodeRefs) {
      if (!candidateFeature.nodeRefs.includes(nodeRef)) {
        contractDowngrade(
          `existing feature "${previousFeature.id}" cannot remove binding "${nodeRef}"`,
        );
      }
    }
    assertCriteriaDoNotDowngrade(previousFeature, candidateFeature);
  }
}

function assertCameraOnlyContractChange(
  previous: SceneDocument,
  candidate: SceneDocument,
): void {
  assertRuntimeUnchanged(
    previous,
    candidate,
    'Camera correction may change only same-ID authoring view poses or projections.',
    'review_camera_correction_scope',
  );
  if (
    canonicalizeJson(authoringWithoutViews(previous)) !==
    canonicalizeJson(authoringWithoutViews(candidate))
  ) {
    throw new SceneReviewWorkflowError(
      'Camera correction may change only same-ID authoring view poses or projections.',
      'review_camera_correction_scope',
    );
  }
  const previousViews = previous.authoring?.views ?? [];
  const candidateViews = new Map(
    (candidate.authoring?.views ?? []).map((view) => [view.id, view]),
  );
  if (
    previousViews.length !== candidateViews.size ||
    previousViews.some(
      (view) => candidateViews.get(view.id)?.role !== view.role,
    )
  ) {
    throw new SceneReviewWorkflowError(
      'Camera correction must preserve every authoring view ID and role.',
      'review_camera_correction_scope',
    );
  }
  if (
    canonicalizeJson(previousViews) ===
    canonicalizeJson(candidate.authoring?.views ?? [])
  ) {
    throw new SceneReviewWorkflowError(
      'Camera correction must change at least one authoring view pose or projection.',
      'review_camera_correction_unchanged',
      400,
    );
  }
}

function authoringWithoutViews(
  document: SceneDocument,
): Record<string, unknown> {
  const { views: _views, ...authoring } = document.authoring ?? {};
  return authoring;
}

function assertRuntimeUnchanged(
  previous: SceneDocument,
  candidate: SceneDocument,
  message: string,
  code: string,
): void {
  if (
    hashRuntimeSceneDocument(previous).toLowerCase() !==
    hashRuntimeSceneDocument(candidate).toLowerCase()
  ) {
    throw new SceneReviewWorkflowError(message, code);
  }
}

function assertCriteriaDoNotDowngrade(
  previous: SceneFeature,
  candidate: SceneFeature,
): void {
  const candidateCriteria = new Map(
    candidate.acceptance.map((criterion) => [criterion.id, criterion]),
  );
  for (const previousCriterion of previous.acceptance) {
    const candidateCriterion = candidateCriteria.get(previousCriterion.id);
    if (candidateCriterion == null) {
      contractDowngrade(
        `acceptance criterion "${previous.id}/${previousCriterion.id}" cannot be removed`,
      );
    }
    assertCriterionDoesNotDowngrade(
      `${previous.id}/${previousCriterion.id}`,
      previousCriterion,
      candidateCriterion,
    );
  }
}

function assertCriterionDoesNotDowngrade(
  key: string,
  previous: SceneFeatureAcceptance,
  candidate: SceneFeatureAcceptance,
): void {
  if (previous.kind !== candidate.kind) {
    contractDowngrade(
      `criterion "${key}" cannot change authority from ${previous.kind} to ${candidate.kind}`,
    );
  }
  switch (previous.kind) {
    case 'presence': {
      const next = candidate as Extract<
        SceneFeatureAcceptance,
        { kind: 'presence' }
      >;
      if (
        previous.view !== next.view ||
        previous.nodeRefs.some((nodeRef) => !next.nodeRefs.includes(nodeRef))
      ) {
        contractDowngrade(
          `presence criterion "${key}" cannot narrow its subject or view`,
        );
      }
      return;
    }
    case 'count': {
      const next = candidate as Extract<
        SceneFeatureAcceptance,
        { kind: 'count' }
      >;
      if (
        previous.pattern !== next.pattern ||
        !sameStringSet(previous.nodeRefs ?? [], next.nodeRefs ?? []) ||
        previous.equals !== next.equals ||
        (previous.minimum != null &&
          (next.minimum == null || next.minimum < previous.minimum)) ||
        (previous.maximum != null &&
          (next.maximum == null || next.maximum > previous.maximum))
      ) {
        contractDowngrade(
          `count criterion "${key}" cannot loosen its bounds or subjects`,
        );
      }
      return;
    }
    case 'projected-region': {
      const next = candidate as Extract<
        SceneFeatureAcceptance,
        { kind: 'projected-region' }
      >;
      if (
        previous.view !== next.view ||
        previous.reference !== next.reference ||
        !sameStringSet(previous.nodeRefs, next.nodeRefs) ||
        JSON.stringify(previous.region) !== JSON.stringify(next.region) ||
        measurementStrength(next.measurement.method) <
          measurementStrength(previous.measurement.method) ||
        (next.centerTolerance ?? DEFAULT_PROJECTED_REGION_CENTER_TOLERANCE) >
          (previous.centerTolerance ??
            DEFAULT_PROJECTED_REGION_CENTER_TOLERANCE) ||
        (next.extentTolerance ?? DEFAULT_PROJECTED_REGION_EXTENT_TOLERANCE) >
          (previous.extentTolerance ??
            DEFAULT_PROJECTED_REGION_EXTENT_TOLERANCE)
      ) {
        contractDowngrade(
          `projected-region criterion "${key}" cannot loosen target, tolerance, subjects, or measurement authority`,
        );
      }
      return;
    }
    case 'spatial-relation': {
      const next = candidate as Extract<
        SceneFeatureAcceptance,
        { kind: 'spatial-relation' }
      >;
      if (
        previous.target !== next.target ||
        previous.relation !== next.relation ||
        !sameStringSet(previous.nodeRefs, next.nodeRefs) ||
        (next.tolerance ?? DEFAULT_SPATIAL_RELATION_TOLERANCE) >
          (previous.tolerance ?? DEFAULT_SPATIAL_RELATION_TOLERANCE)
      ) {
        contractDowngrade(
          `spatial criterion "${key}" cannot loosen relation, tolerance, or subjects`,
        );
      }
      return;
    }
    case 'visual-judgment': {
      const next = candidate as Extract<
        SceneFeatureAcceptance,
        { kind: 'visual-judgment' }
      >;
      if (
        previous.view !== next.view ||
        previous.criterion !== next.criterion
      ) {
        contractDowngrade(
          `visual criterion "${key}" cannot weaken or replace its judgment text`,
        );
      }
      return;
    }
  }
}

function contractDowngrade(message: string): never {
  throw new SceneReviewWorkflowError(
    `Contract correction is an acceptance downgrade: ${message}.`,
    'review_contract_downgrade',
  );
}

function measurementStrength(method: string): number {
  return method === 'capture-node-mask-bounds-v1' ? 2 : 1;
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((entry) => right.includes(entry))
  );
}

function sameWorkflowState(
  left: SceneReviewWorkflowState | null,
  right: SceneReviewWorkflowState | null,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hashVerifiedCorrectionPatch(
  value: unknown,
  current: SceneDocument,
  candidate: SceneDocument,
): Sha256 {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SceneReviewWorkflowError(
      'A correction requires the exact scene patch used to produce its candidate.',
      'review_correction_patch_required',
      400,
    );
  }
  let applied: SceneDocument;
  try {
    applied = applyScenePatch(current, value as ScenePatch).document;
  } catch (error) {
    throw new SceneReviewWorkflowError(
      `Correction patch is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'review_correction_patch_invalid',
      400,
    );
  }
  if (
    hashSceneDocument(applied).toLowerCase() !==
    hashSceneDocument(candidate).toLowerCase()
  ) {
    throw new SceneReviewWorkflowError(
      'Correction patch does not reproduce its authorized candidate.',
      'review_correction_patch_mismatch',
      409,
    );
  }
  return sha256(canonicalizeJson(value));
}

function assertCorrectionTransitionOperation(
  operation: unknown,
  patch: unknown,
): void {
  const record =
    patch != null && typeof patch === 'object' && !Array.isArray(patch)
      ? (patch as Record<string, unknown>)
      : null;
  if (
    operation !== 'transaction' ||
    record?.op !== 'transaction' ||
    patchContainsDocumentReplacement(record)
  ) {
    throw new SceneReviewWorkflowError(
      'A correction requires scene_apply_transaction patches and cannot replace the complete document.',
      'review_transition_operation_mismatch',
      400,
    );
  }
}

function patchContainsDocumentReplacement(
  patch: Record<string, unknown>,
): boolean {
  if (patch.op === 'replaceDocument') {
    return true;
  }
  return (
    patch.op === 'transaction' &&
    Array.isArray(patch.patches) &&
    patch.patches.some(
      (entry) =>
        entry != null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        patchContainsDocumentReplacement(entry as Record<string, unknown>),
    )
  );
}

function parseCorrectionIntent(value: unknown): SceneCorrectionIntent {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SceneReviewWorkflowError(
      'A committed correction requires correction metadata and the current review link.',
      'review_correction_intent_required',
      400,
    );
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== 'scene' &&
    record.kind !== 'resource' &&
    record.kind !== 'camera' &&
    record.kind !== 'contract'
  ) {
    throw new SceneReviewWorkflowError(
      'Correction kind must be scene, resource, camera, or contract.',
      'review_correction_intent_invalid',
      400,
    );
  }
  if (
    !Array.isArray(record.defectTags) ||
    !record.defectTags.every(
      (tag) => typeof tag === 'string' && tag.trim().length > 0,
    ) ||
    record.defectTags.length === 0
  ) {
    throw new SceneReviewWorkflowError(
      'Correction intent requires at least one non-empty defect tag.',
      'review_correction_intent_invalid',
      400,
    );
  }
  const previous = record.previousReview;
  if (
    previous == null ||
    typeof previous !== 'object' ||
    Array.isArray(previous)
  ) {
    throw new SceneReviewWorkflowError(
      'Correction intent requires previousReview.',
      'review_correction_intent_invalid',
      400,
    );
  }
  const link = previous as Record<string, unknown>;
  if (
    typeof link.path !== 'string' ||
    typeof link.reviewSha256 !== 'string' ||
    !/^sha256:[0-9a-fA-F]{64}$/.test(link.reviewSha256)
  ) {
    throw new SceneReviewWorkflowError(
      'Correction previousReview must contain an exact path and SHA-256.',
      'review_correction_intent_invalid',
      400,
    );
  }
  return {
    kind: record.kind,
    defectTags: [...record.defectTags] as string[],
    previousReview: {
      path: link.path,
      reviewSha256: link.reviewSha256 as Sha256,
    },
    ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
  };
}

function assertSameReviewLink(
  actual: SceneReviewRecordLink,
  expected: SceneReviewRecordLink,
): void {
  if (!sameReviewLink(actual, expected)) {
    throw new SceneReviewWorkflowError(
      'Correction lineage must reference the exact current immutable review.',
      'review_lineage_mismatch',
      409,
      { expected },
    );
  }
}

function sameReviewLink(
  left: SceneReviewRecordLink,
  right: SceneReviewRecordLink,
): boolean {
  return (
    left.path === right.path &&
    left.reviewSha256.toLowerCase() === right.reviewSha256.toLowerCase()
  );
}

function sameCorrectionLink(
  left: SceneCorrectionRecordLink,
  right: SceneCorrectionRecordLink,
): boolean {
  return (
    left.path === right.path &&
    left.correctionSha256.toLowerCase() === right.correctionSha256.toLowerCase()
  );
}

function sameOptionalSha256(
  left: Sha256 | null | undefined,
  right: Sha256 | null | undefined,
): boolean {
  return left == null && right == null
    ? true
    : left != null &&
        right != null &&
        left.toLowerCase() === right.toLowerCase();
}

function displayCriterionKey(key: string): string {
  return key.split('\u0000').join('/');
}
