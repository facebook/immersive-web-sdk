/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  getScenePatternInstanceCount,
  getScenePatternRequestedCount,
  MAX_SCENE_PATTERN_INSTANCES,
} from './expansion.js';
import {
  getNodeWorldBounds,
  getSceneNodeCollisionRadius,
  resolveScenePrefabRoot,
  type SceneAssetBoundsResolver,
} from './helpers.js';
import type {
  SceneBounds,
  SceneCountAcceptance,
  SceneDocument,
  SceneFeatureAcceptance,
  SceneNode,
  SceneProjectedRegionAcceptance,
  SceneReviewCamera,
  SceneReviewCapture,
  SceneSpatialRelationAcceptance,
  Sha256,
  Vec2,
  Vec3,
  Vec4,
} from './types.js';
import { findNode } from './utils.js';

/** Default maximum normalized center-axis error for projected regions. */
export const DEFAULT_PROJECTED_REGION_CENTER_TOLERANCE = 0.05;

/** Default maximum normalized width/height error for projected regions. */
export const DEFAULT_PROJECTED_REGION_EXTENT_TOLERANCE = 0.1;

/** Default world-space tolerance, in meters, for spatial relations. */
export const DEFAULT_SPATIAL_RELATION_TOLERANCE = 1e-6;

const CAMERA_EPSILON = 1e-9;
const WORLD_UP: Vec3 = [0, 1, 0];

export type SceneAcceptanceEvaluationStatus =
  | 'pass'
  | 'fail'
  | 'not-applicable'
  | 'unavailable';

export type SceneAcceptanceEvaluationReason =
  | 'criterion-satisfied'
  | 'criterion-not-satisfied'
  | 'referenced-node-missing'
  | 'capture-required'
  | 'capture-view-mismatch'
  | 'pattern-expansion-failed'
  | 'bounds-unavailable'
  | 'measurement-unavailable'
  | 'measurement-not-applicable'
  | 'projection-unavailable'
  | 'judgment-required';

export interface SceneAcceptanceNodeResolution {
  requestedNodeIds: string[];
  existingNodeIds: string[];
  missingNodeIds: string[];
}

export interface SceneAcceptanceCaptureDiagnostics {
  id: string;
  view: string;
  width: number;
  height: number;
  aspect: number;
  screenshotSha256: Sha256;
  camera: SceneReviewCamera;
}

export interface ScenePresenceAcceptanceDiagnostics {
  type: 'presence';
  nodes: SceneAcceptanceNodeResolution;
  capture?: SceneAcceptanceCaptureDiagnostics;
  visibleNodeIds?: string[];
  maskVisibleNodeIds?: string[];
  notVisibleNodeIds?: string[];
}

export interface SceneCountAcceptanceDiagnostics {
  type: 'count';
  source: 'node-refs' | 'pattern';
  actual: number;
  constraints: {
    equals?: number;
    minimum?: number;
    maximum?: number;
  };
  nodes?: SceneAcceptanceNodeResolution;
  pattern?: {
    nodeId: string;
    prefabId?: string;
    requestedCount?: number;
    collisionRadius?: number;
    maxInstances: number;
    seedKey: string;
    error?: string;
  };
}

export interface SceneSpatialRelationAcceptanceDiagnostics {
  type: 'spatial-relation';
  nodes: SceneAcceptanceNodeResolution;
  targetNodeId: string;
  sourceBounds?: SceneBounds;
  targetBounds?: SceneBounds;
  relation: SceneSpatialRelationAcceptance['relation'];
  tolerance: number;
  signedMargin?: number;
  separation?: number;
  axisContactMargins?: Vec3;
  contactState?: 'separated' | 'intersecting';
  minimumPenetration?: number;
  error?: string;
}

export interface SceneProjectedRegionAcceptanceDiagnostics {
  type: 'projected-region';
  measurement: SceneProjectedRegionAcceptance['measurement'];
  applicability: 'applicable' | 'not-applicable';
  applicabilityReason?: string;
  nodes: SceneAcceptanceNodeResolution;
  viewId: string;
  referenceId: string;
  capture?: SceneAcceptanceCaptureDiagnostics;
  worldBounds?: SceneBounds;
  targetRegion: Vec4;
  actualRegion?: Vec4;
  targetCenter?: Vec2;
  actualCenter?: Vec2;
  centerDelta?: Vec2;
  centerMaximumError?: number;
  targetExtent?: Vec2;
  actualExtent?: Vec2;
  extentDelta?: Vec2;
  extentMaximumError?: number;
  centerTolerance: number;
  extentTolerance: number;
  error?: string;
}

export interface SceneVisualJudgmentAcceptanceDiagnostics {
  type: 'visual-judgment';
  view: string;
  criterion: string;
}

export type SceneAcceptanceEvaluationDiagnostics =
  | ScenePresenceAcceptanceDiagnostics
  | SceneCountAcceptanceDiagnostics
  | SceneSpatialRelationAcceptanceDiagnostics
  | SceneProjectedRegionAcceptanceDiagnostics
  | SceneVisualJudgmentAcceptanceDiagnostics;

export interface SceneAcceptanceEvaluation {
  criterionId: string;
  kind: SceneFeatureAcceptance['kind'];
  status: SceneAcceptanceEvaluationStatus;
  reason: SceneAcceptanceEvaluationReason;
  diagnostics: SceneAcceptanceEvaluationDiagnostics;
}

export interface EvaluateSceneAcceptanceOptions {
  /** Exact immutable review capture used by view-dependent criteria. */
  capture?: SceneReviewCapture;
  /** Bounds supplied by the application's shared asset manifest. */
  resolveAssetBounds?: SceneAssetBoundsResolver;
}

/**
 * Evaluate one acceptance criterion from scene data and immutable capture facts.
 * This function performs no inference, I/O, rendering, or mutation.
 */
export function evaluateSceneAcceptance(
  document: SceneDocument,
  criterion: SceneFeatureAcceptance,
  options: EvaluateSceneAcceptanceOptions = {},
): SceneAcceptanceEvaluation {
  switch (criterion.kind) {
    case 'presence':
      return evaluatePresence(document, criterion, options.capture);
    case 'count':
      return evaluateCount(document, criterion, options.resolveAssetBounds);
    case 'spatial-relation':
      return evaluateSpatialRelation(
        document,
        criterion,
        options.resolveAssetBounds,
      );
    case 'projected-region':
      return evaluateProjectedRegion(document, criterion, options.capture);
    case 'visual-judgment':
      return {
        criterionId: criterion.id,
        kind: criterion.kind,
        status: 'unavailable',
        reason: 'judgment-required',
        diagnostics: {
          type: 'visual-judgment',
          view: criterion.view,
          criterion: criterion.criterion,
        },
      };
  }
}

function evaluatePresence(
  document: SceneDocument,
  criterion: Extract<SceneFeatureAcceptance, { kind: 'presence' }>,
  capture: SceneReviewCapture | undefined,
): SceneAcceptanceEvaluation {
  const nodes = resolveNodes(document, criterion.nodeRefs);
  const diagnostics: ScenePresenceAcceptanceDiagnostics = {
    type: 'presence',
    nodes,
  };
  if (nodes.missingNodeIds.length > 0) {
    return result(criterion, 'fail', 'referenced-node-missing', diagnostics);
  }
  if (criterion.view == null) {
    return result(criterion, 'pass', 'criterion-satisfied', diagnostics);
  }
  const captureResult = requireCapture(capture, criterion.view);
  if (captureResult.status === 'unavailable') {
    return result(criterion, 'unavailable', captureResult.reason, diagnostics);
  }
  diagnostics.capture = captureDiagnostics(captureResult.capture);
  diagnostics.visibleNodeIds = [...captureResult.capture.visibleNodeIds];
  const visible = new Set(captureResult.capture.visibleNodeIds);
  diagnostics.maskVisibleNodeIds = criterion.nodeRefs.filter((nodeId) => {
    const region = captureResult.capture.nodeMaskRegions?.[nodeId];
    return region != null && region[2] > 0 && region[3] > 0;
  });
  for (const nodeId of diagnostics.maskVisibleNodeIds) {
    visible.add(nodeId);
  }
  diagnostics.notVisibleNodeIds = criterion.nodeRefs.filter(
    (nodeId) => !visible.has(nodeId),
  );
  return diagnostics.notVisibleNodeIds.length === 0
    ? result(criterion, 'pass', 'criterion-satisfied', diagnostics)
    : result(criterion, 'fail', 'criterion-not-satisfied', diagnostics);
}

function evaluateCount(
  document: SceneDocument,
  criterion: SceneCountAcceptance,
  resolveAssetBounds: SceneAssetBoundsResolver | undefined,
): SceneAcceptanceEvaluation {
  const constraints = countConstraints(criterion);
  if (criterion.pattern == null) {
    const nodes = resolveNodes(document, criterion.nodeRefs ?? []);
    const diagnostics: SceneCountAcceptanceDiagnostics = {
      type: 'count',
      source: 'node-refs',
      actual: new Set(nodes.existingNodeIds).size,
      constraints,
      nodes,
    };
    if (nodes.missingNodeIds.length > 0) {
      return result(criterion, 'fail', 'referenced-node-missing', diagnostics);
    }
    return countPasses(diagnostics.actual, constraints)
      ? result(criterion, 'pass', 'criterion-satisfied', diagnostics)
      : result(criterion, 'fail', 'criterion-not-satisfied', diagnostics);
  }

  const patternNode = findNode(document.nodes, criterion.pattern);
  const patternDiagnostics: SceneCountAcceptanceDiagnostics = {
    type: 'count',
    source: 'pattern',
    actual: 0,
    constraints,
    pattern: {
      nodeId: criterion.pattern,
      maxInstances: MAX_SCENE_PATTERN_INSTANCES,
      seedKey: criterion.pattern,
    },
  };
  if (patternNode?.content?.type !== 'pattern') {
    return result(
      criterion,
      'fail',
      'referenced-node-missing',
      patternDiagnostics,
    );
  }

  const content = patternNode.content;
  const prefab = document.resources.prefabs?.find(
    (entry) => entry.id === content.prefab,
  );
  patternDiagnostics.pattern!.prefabId = content.prefab;
  patternDiagnostics.pattern!.requestedCount = getScenePatternRequestedCount(
    content.distribution,
  );
  if (prefab == null) {
    patternDiagnostics.pattern!.error = `Scene references unknown prefab "${content.prefab}"`;
    return result(
      criterion,
      'unavailable',
      'pattern-expansion-failed',
      patternDiagnostics,
    );
  }

  try {
    const root = resolveScenePrefabRoot(
      document,
      prefab.root,
      content.overrides,
    );
    const collisionRadius = getSceneNodeCollisionRadius(document, root, {
      resolveAssetBounds,
    });
    patternDiagnostics.pattern!.collisionRadius = collisionRadius;
    patternDiagnostics.actual = getScenePatternInstanceCount(
      content.distribution,
      {
        collisionRadius,
        maxInstances: MAX_SCENE_PATTERN_INSTANCES,
        seedKey: criterion.pattern,
      },
    );
  } catch (error) {
    patternDiagnostics.pattern!.error = errorMessage(error);
    return result(
      criterion,
      'unavailable',
      'pattern-expansion-failed',
      patternDiagnostics,
    );
  }
  return countPasses(patternDiagnostics.actual, constraints)
    ? result(criterion, 'pass', 'criterion-satisfied', patternDiagnostics)
    : result(criterion, 'fail', 'criterion-not-satisfied', patternDiagnostics);
}

function evaluateSpatialRelation(
  document: SceneDocument,
  criterion: SceneSpatialRelationAcceptance,
  resolveAssetBounds: SceneAssetBoundsResolver | undefined,
): SceneAcceptanceEvaluation {
  const nodes = resolveNodes(document, criterion.nodeRefs);
  const target = findNode(document.nodes, criterion.target);
  const tolerance = criterion.tolerance ?? DEFAULT_SPATIAL_RELATION_TOLERANCE;
  const diagnostics: SceneSpatialRelationAcceptanceDiagnostics = {
    type: 'spatial-relation',
    nodes,
    targetNodeId: criterion.target,
    relation: criterion.relation,
    tolerance,
  };
  if (nodes.missingNodeIds.length > 0 || target == null) {
    return result(criterion, 'fail', 'referenced-node-missing', diagnostics);
  }

  let sourceBounds: SceneBounds;
  let targetBounds: SceneBounds;
  try {
    sourceBounds = aggregateNodeBounds(
      document,
      criterion.nodeRefs,
      resolveAssetBounds,
    );
    targetBounds = getNodeWorldBounds(document, target.id, {
      resolveAssetBounds,
    });
  } catch (error) {
    diagnostics.error = errorMessage(error);
    return result(criterion, 'unavailable', 'bounds-unavailable', diagnostics);
  }
  diagnostics.sourceBounds = sourceBounds;
  diagnostics.targetBounds = targetBounds;
  if (criterion.relation === 'touching') {
    const contact = boundsContactMetrics(sourceBounds, targetBounds);
    diagnostics.axisContactMargins = contact.axisContactMargins;
    diagnostics.contactState = contact.contactState;
    diagnostics.separation = contact.separation;
    if (contact.minimumPenetration != null) {
      diagnostics.minimumPenetration = contact.minimumPenetration;
    }
    const touches =
      contact.contactState === 'separated'
        ? contact.separation <= tolerance
        : contact.minimumPenetration! <= tolerance;
    return touches
      ? result(criterion, 'pass', 'criterion-satisfied', diagnostics)
      : result(criterion, 'fail', 'criterion-not-satisfied', diagnostics);
  }

  diagnostics.signedMargin = directionalRelationMargin(
    sourceBounds,
    targetBounds,
    criterion.relation,
  );
  return diagnostics.signedMargin >= -tolerance
    ? result(criterion, 'pass', 'criterion-satisfied', diagnostics)
    : result(criterion, 'fail', 'criterion-not-satisfied', diagnostics);
}

function evaluateProjectedRegion(
  document: SceneDocument,
  criterion: SceneProjectedRegionAcceptance,
  capture: SceneReviewCapture | undefined,
): SceneAcceptanceEvaluation {
  const nodes = resolveNodes(document, criterion.nodeRefs);
  const centerTolerance =
    criterion.centerTolerance ?? DEFAULT_PROJECTED_REGION_CENTER_TOLERANCE;
  const extentTolerance =
    criterion.extentTolerance ?? DEFAULT_PROJECTED_REGION_EXTENT_TOLERANCE;
  const diagnostics: SceneProjectedRegionAcceptanceDiagnostics = {
    type: 'projected-region',
    measurement: { ...criterion.measurement },
    applicability: 'applicable',
    nodes,
    viewId: criterion.view,
    referenceId: criterion.reference,
    targetRegion: [...criterion.region],
    centerTolerance,
    extentTolerance,
  };
  if (nodes.missingNodeIds.length > 0) {
    return result(criterion, 'fail', 'referenced-node-missing', diagnostics);
  }

  if (criterion.measurement.method === 'projected-world-aabb-v1') {
    const applicability = projectedWorldAabbApplicability(
      document,
      criterion.nodeRefs,
    );
    if (!applicability.applicable) {
      diagnostics.applicability = 'not-applicable';
      diagnostics.applicabilityReason = applicability.reason;
      return result(
        criterion,
        'not-applicable',
        'measurement-not-applicable',
        diagnostics,
      );
    }
  }

  const captureResult = requireCapture(capture, criterion.view);
  if (captureResult.status === 'unavailable') {
    return result(criterion, 'unavailable', captureResult.reason, diagnostics);
  }
  diagnostics.capture = captureDiagnostics(captureResult.capture);
  let actualRegion: Vec4;
  if (criterion.measurement.method === 'capture-node-mask-bounds-v1') {
    const regions = criterion.nodeRefs.map(
      (nodeId) => captureResult.capture.nodeMaskRegions?.[nodeId],
    );
    if (regions.some((region) => region == null)) {
      diagnostics.error =
        'The trusted capture does not contain every required node-mask region';
      return result(
        criterion,
        'unavailable',
        'measurement-unavailable',
        diagnostics,
      );
    }
    actualRegion = aggregateNormalizedRegions(regions as Vec4[]);
  } else {
    try {
      diagnostics.worldBounds = aggregateNodeBounds(
        document,
        criterion.nodeRefs,
      );
    } catch (error) {
      diagnostics.error = errorMessage(error);
      return result(
        criterion,
        'unavailable',
        'bounds-unavailable',
        diagnostics,
      );
    }
    try {
      actualRegion = projectBoundsToRegion(
        diagnostics.worldBounds,
        captureResult.capture,
      );
    } catch (error) {
      diagnostics.error = errorMessage(error);
      return result(
        criterion,
        'unavailable',
        'projection-unavailable',
        diagnostics,
      );
    }
  }

  const targetCenter = regionCenter(criterion.region);
  const actualCenter = regionCenter(actualRegion);
  const targetExtent: Vec2 = [criterion.region[2], criterion.region[3]];
  const actualExtent: Vec2 = [actualRegion[2], actualRegion[3]];
  const centerDelta = subtractVec2(actualCenter, targetCenter);
  const extentDelta = subtractVec2(actualExtent, targetExtent);
  const centerMaximumError = maximumAbsoluteComponent(centerDelta);
  const extentMaximumError = maximumAbsoluteComponent(extentDelta);
  Object.assign(diagnostics, {
    actualRegion,
    targetCenter,
    actualCenter,
    centerDelta,
    centerMaximumError,
    targetExtent,
    actualExtent,
    extentDelta,
    extentMaximumError,
  });
  return centerMaximumError <= centerTolerance &&
    extentMaximumError <= extentTolerance
    ? result(criterion, 'pass', 'criterion-satisfied', diagnostics)
    : result(criterion, 'fail', 'criterion-not-satisfied', diagnostics);
}

function projectedWorldAabbApplicability(
  document: SceneDocument,
  nodeIds: readonly string[],
): { applicable: true } | { applicable: false; reason: string } {
  if (nodeIds.length !== 1) {
    return {
      applicable: false,
      reason:
        'projected-world-aabb-v1 is calibrated only for one axis-aligned box subject',
    };
  }
  const located = findNodeWithAncestors(document.nodes, nodeIds[0]);
  if (located == null || located.node.content?.type !== 'asset') {
    return {
      applicable: false,
      reason: 'projected-world-aabb-v1 requires a directly bound asset subject',
    };
  }
  return {
    applicable: false,
    reason:
      'projected-world-aabb-v1 cannot prove external asset silhouette shape; use capture-node-mask-bounds-v1',
  };
}

function findNodeWithAncestors(
  nodes: readonly SceneNode[],
  nodeId: string,
  ancestors: readonly SceneNode[] = [],
): { node: SceneNode; ancestors: readonly SceneNode[] } | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return { node, ancestors };
    }
    const child = findNodeWithAncestors(node.children ?? [], nodeId, [
      ...ancestors,
      node,
    ]);
    if (child != null) {
      return child;
    }
  }
  return null;
}

function result(
  criterion: SceneFeatureAcceptance,
  status: SceneAcceptanceEvaluationStatus,
  reason: SceneAcceptanceEvaluationReason,
  diagnostics: SceneAcceptanceEvaluationDiagnostics,
): SceneAcceptanceEvaluation {
  return {
    criterionId: criterion.id,
    kind: criterion.kind,
    status,
    reason,
    diagnostics,
  };
}

function resolveNodes(
  document: SceneDocument,
  requestedNodeIds: readonly string[],
): SceneAcceptanceNodeResolution {
  const existingNodeIds: string[] = [];
  const missingNodeIds: string[] = [];
  for (const nodeId of requestedNodeIds) {
    (findNode(document.nodes, nodeId) == null
      ? missingNodeIds
      : existingNodeIds
    ).push(nodeId);
  }
  return {
    requestedNodeIds: [...requestedNodeIds],
    existingNodeIds,
    missingNodeIds,
  };
}

function requireCapture(
  capture: SceneReviewCapture | undefined,
  view: string,
):
  | { status: 'available'; capture: SceneReviewCapture }
  | {
      status: 'unavailable';
      reason: 'capture-required' | 'capture-view-mismatch';
    } {
  if (capture == null) {
    return { status: 'unavailable', reason: 'capture-required' };
  }
  if (capture.view !== view) {
    return { status: 'unavailable', reason: 'capture-view-mismatch' };
  }
  return { status: 'available', capture };
}

function captureDiagnostics(
  capture: SceneReviewCapture,
): SceneAcceptanceCaptureDiagnostics {
  return {
    id: capture.id,
    view: capture.view,
    width: capture.width,
    height: capture.height,
    aspect: capture.width / capture.height,
    screenshotSha256: capture.screenshotSha256,
    camera: cloneCamera(capture.camera),
  };
}

function cloneCamera(camera: SceneReviewCamera): SceneReviewCamera {
  return {
    projection: camera.projection,
    position: [...camera.position],
    target: [...camera.target],
    ...(camera.fov == null ? {} : { fov: camera.fov }),
    ...(camera.height == null ? {} : { height: camera.height }),
  };
}

function countConstraints(criterion: SceneCountAcceptance) {
  return {
    ...(criterion.equals == null ? {} : { equals: criterion.equals }),
    ...(criterion.minimum == null ? {} : { minimum: criterion.minimum }),
    ...(criterion.maximum == null ? {} : { maximum: criterion.maximum }),
  };
}

function countPasses(
  actual: number,
  constraints: SceneCountAcceptanceDiagnostics['constraints'],
) {
  return (
    (constraints.equals == null || actual === constraints.equals) &&
    (constraints.minimum == null || actual >= constraints.minimum) &&
    (constraints.maximum == null || actual <= constraints.maximum)
  );
}

function aggregateNodeBounds(
  document: SceneDocument,
  nodeIds: readonly string[],
  resolveAssetBounds?: SceneAssetBoundsResolver,
): SceneBounds {
  const first = getNodeWorldBounds(document, nodeIds[0], {
    resolveAssetBounds,
  });
  const bounds: SceneBounds = {
    min: [...first.min],
    max: [...first.max],
  };
  for (const nodeId of nodeIds.slice(1)) {
    const entry = getNodeWorldBounds(document, nodeId, {
      resolveAssetBounds,
    });
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], entry.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], entry.max[axis]);
    }
  }
  return bounds;
}

function directionalRelationMargin(
  source: SceneBounds,
  target: SceneBounds,
  relation: Exclude<SceneSpatialRelationAcceptance['relation'], 'touching'>,
) {
  // IWSDK world space is Y-up and camera-independent; "front" is -Z.
  switch (relation) {
    case 'above':
      return source.min[1] - target.max[1];
    case 'below':
      return target.min[1] - source.max[1];
    case 'left-of':
      return target.min[0] - source.max[0];
    case 'right-of':
      return source.min[0] - target.max[0];
    case 'in-front-of':
      return target.min[2] - source.max[2];
    case 'behind':
      return source.min[2] - target.max[2];
  }
}

function boundsContactMetrics(first: SceneBounds, second: SceneBounds) {
  // Negative margins are gaps; positive margins are the minimum translation
  // required to separate the intervals on that axis. This distinguishes surface
  // contact from one volume sitting deeply inside another.
  const axisContactMargins = first.min.map((minimum, axis) =>
    cleanZero(
      Math.min(first.max[axis] - second.min[axis], second.max[axis] - minimum),
    ),
  ) as Vec3;
  const gaps = axisContactMargins.map((margin) => Math.max(-margin, 0));
  const separation = cleanZero(Math.hypot(...gaps));
  if (gaps.some((gap) => gap > 0)) {
    return {
      axisContactMargins,
      contactState: 'separated' as const,
      separation,
    };
  }
  return {
    axisContactMargins,
    contactState: 'intersecting' as const,
    minimumPenetration: cleanZero(Math.min(...axisContactMargins)),
    separation,
  };
}

/** Project to normalized image coordinates with a top-left origin. */
function projectBoundsToRegion(
  bounds: SceneBounds,
  capture: SceneReviewCapture,
): Vec4 {
  if (capture.width <= 0 || capture.height <= 0) {
    throw new Error('Review capture dimensions must be positive');
  }
  const basis = cameraBasis(capture.camera);
  const aspect = capture.width / capture.height;
  const projected = boundsCorners(bounds).map((point) => {
    const offset = subtractVec3(point, capture.camera.position);
    const x = dot(offset, basis.right);
    const y = dot(offset, basis.up);
    const depth = dot(offset, basis.forward);
    if (capture.camera.projection === 'perspective') {
      if (depth <= CAMERA_EPSILON) {
        throw new Error(
          'Projected bounds touch or cross the saved camera plane',
        );
      }
      const fov = capture.camera.fov;
      if (fov == null || fov <= 0 || fov >= 180) {
        throw new Error('Perspective capture requires a valid vertical fov');
      }
      const halfHeight = depth * Math.tan((fov * Math.PI) / 360);
      return normalizedScreenPoint(x / (halfHeight * aspect), y / halfHeight);
    }

    const height = capture.camera.height;
    if (height == null || height <= 0) {
      throw new Error('Orthographic capture requires a positive height');
    }
    return normalizedScreenPoint(x / ((height * aspect) / 2), y / (height / 2));
  });
  const minimumX = Math.min(...projected.map((point) => point[0]));
  const minimumY = Math.min(...projected.map((point) => point[1]));
  const maximumX = Math.max(...projected.map((point) => point[0]));
  const maximumY = Math.max(...projected.map((point) => point[1]));
  return [
    cleanZero(minimumX),
    cleanZero(minimumY),
    cleanZero(maximumX - minimumX),
    cleanZero(maximumY - minimumY),
  ];
}

function cameraBasis(camera: SceneReviewCamera) {
  let backward = normalize(subtractVec3(camera.position, camera.target));
  if (length(backward) <= CAMERA_EPSILON) {
    throw new Error('Review capture camera position must differ from target');
  }
  let right = cross(WORLD_UP, backward);
  if (length(right) <= CAMERA_EPSILON) {
    backward = [...backward];
    if (Math.abs(WORLD_UP[2]) === 1) {
      backward[0] += 0.0001;
    } else {
      backward[2] += 0.0001;
    }
    backward = normalize(backward);
    right = cross(WORLD_UP, backward);
  }
  right = normalize(right);
  const up = normalize(cross(backward, right));
  return {
    right,
    up,
    forward: scaleVec3(backward, -1),
  };
}

function boundsCorners(bounds: SceneBounds): Vec3[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
}

function normalizedScreenPoint(ndcX: number, ndcY: number): Vec2 {
  return [(ndcX + 1) / 2, (1 - ndcY) / 2];
}

function regionCenter(region: Vec4): Vec2 {
  return [region[0] + region[2] / 2, region[1] + region[3] / 2];
}

function aggregateNormalizedRegions(regions: readonly Vec4[]): Vec4 {
  const minimumX = Math.min(...regions.map((region) => region[0]));
  const minimumY = Math.min(...regions.map((region) => region[1]));
  const maximumX = Math.max(...regions.map((region) => region[0] + region[2]));
  const maximumY = Math.max(...regions.map((region) => region[1] + region[3]));
  return [minimumX, minimumY, maximumX - minimumX, maximumY - minimumY];
}

function subtractVec2(first: Vec2, second: Vec2): Vec2 {
  return [cleanZero(first[0] - second[0]), cleanZero(first[1] - second[1])];
}

function subtractVec3(first: Vec3, second: Vec3): Vec3 {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

function scaleVec3(vector: Vec3, scale: number): Vec3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function dot(first: Vec3, second: Vec3) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function cross(first: Vec3, second: Vec3): Vec3 {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function length(vector: Vec3) {
  return Math.hypot(...vector);
}

function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  return magnitude <= CAMERA_EPSILON
    ? [0, 0, 0]
    : scaleVec3(vector, 1 / magnitude);
}

function maximumAbsoluteComponent(vector: Vec2) {
  return Math.max(Math.abs(vector[0]), Math.abs(vector[1]));
}

function cleanZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
