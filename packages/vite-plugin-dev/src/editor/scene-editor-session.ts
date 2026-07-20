/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  SceneCommandHistory,
  resolveLookAtTransformInDocument,
  resolvePlaceOnTransform,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneAsset,
  type SceneComponentFieldSchema,
  type SceneComponentSchema,
  type SceneDocument,
  type SceneNode,
  type ScenePatch,
  type ScenePlaceOn,
  type SceneTransform,
  type ValidationIssue,
  type Vec3,
} from '@iwsdk/scene-composition';

export const SCENE_EDITOR_TOOL_METHODS = [
  'scene_list_assets',
  'scene_list_component_schemas',
  'scene_get_document',
  'scene_get_hierarchy',
  'scene_get_selection',
  'scene_select',
  'scene_add_node',
  'scene_remove_node',
  'scene_duplicate_node',
  'scene_set_transform',
  'scene_apply_patch',
  'scene_place_on',
  'scene_look_at',
  'scene_validate',
  'scene_save',
  'scene_undo',
  'scene_redo',
  'scene_get_logs',
  'scene_set_camera',
  'scene_screenshot',
  'scene_compare_screenshots',
] as const;

export type SceneEditorToolMethod = (typeof SCENE_EDITOR_TOOL_METHODS)[number];

export type SceneEditorCameraView =
  | 'current'
  | 'top'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'quarter'
  | 'orbit';

export type SceneEditorResolvedCameraView = Exclude<
  SceneEditorCameraView,
  'current'
>;

export interface SceneEditorCameraState {
  view: SceneEditorResolvedCameraView | 'custom';
  position: Vec3;
  lookAt: Vec3;
  fov: number;
}

export interface SceneEditorScreenshotResult {
  imageData: string;
  mimeType: 'image/png';
  camera: SceneEditorCameraState;
}

export interface SceneEditorScreenshotComparisonResult {
  matches: boolean;
  first: SceneEditorScreenshotResult;
  second: SceneEditorScreenshotResult;
  firstImageDataLength: number;
  secondImageDataLength: number;
}

export interface SceneEditorLogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface SceneEditorSaveResult {
  path?: string;
  bytes?: number;
  savedAt?: string;
}

export interface SceneEditorValidationIssue extends ValidationIssue {
  nodeId?: string;
  suggestedFix?: string;
}

export interface SceneEditorSessionOptions {
  document: SceneDocument;
  componentSchemas?: readonly SceneComponentSchema[];
  knownComponents?: readonly string[];
  saveDocument?: (
    serializedDocument: string,
    document: SceneDocument,
  ) => Promise<SceneEditorSaveResult> | SceneEditorSaveResult;
  screenshot?: (
    camera: SceneEditorCameraState,
    size: { width?: number; height?: number },
  ) => Promise<SceneEditorScreenshotResult> | SceneEditorScreenshotResult;
}

export interface FrameworkMCPRuntime {
  handles(method: string): boolean;
  dispatch(method: string, params: Record<string, unknown>): Promise<unknown>;
}

const SCENE_EDITOR_TOOL_METHOD_SET = new Set<string>(SCENE_EDITOR_TOOL_METHODS);
const LEVEL_COMPONENT_PREFIX = 'com.iwsdk.components.';
const SCENE_EDITOR_COMPONENT_ALIASES: Record<string, string> = {
  Interactable: 'RayInteractable',
};
const DEFAULT_KNOWN_COMPONENTS = [
  'AudioSource',
  'CameraSource',
  'DepthOccludable',
  'DistanceGrabbable',
  'DomeGradient',
  'DomeTexture',
  'EnvironmentRaycastTarget',
  'Follower',
  'Grabbed',
  'Handle',
  'IBLGradient',
  'IBLTexture',
  'LevelRoot',
  'LevelTag',
  'LocomotionEnvironment',
  'OneHandGrabbable',
  'PanelDocument',
  'PanelUI',
  'PhysicsBody',
  'PhysicsManipulation',
  'PhysicsShape',
  'PokeInteractable',
  'Pressed',
  'RayInteractable',
  'ScreenSpace',
  'Transform',
  'TwoHandsGrabbable',
  'Visibility',
  'XRAnchor',
  'XRCylinderLayer',
  'XRLayerState',
  'XRMesh',
  'XRPlane',
  'XRQuadLayer',
] as const;
const DEFAULT_CAMERA: SceneEditorCameraState = {
  fov: 50,
  lookAt: [0, 0, 0],
  position: [4, 3, 4],
  view: 'quarter',
};
const PLACEMENT_EPSILON = 0.001;
const SUPPORT_CONTACT_EPSILON = 0.03;
const MAX_PLACEMENT_BOUNDS_EXTENT_METERS = 50;

export class SceneEditorSession implements FrameworkMCPRuntime {
  private history: SceneCommandHistory;
  private readonly knownComponents: Set<string>;
  private readonly componentSchemas: SceneComponentSchema[];
  private selection: string[] = [];
  private camera: SceneEditorCameraState = { ...DEFAULT_CAMERA };
  private dirty = false;
  private savedDocumentSnapshot: string;
  private logs: SceneEditorLogEntry[] = [];

  constructor(private readonly options: SceneEditorSessionOptions) {
    this.history = new SceneCommandHistory(options.document, {
      validateInitialDocument: false,
    });
    this.componentSchemas = mergeComponentSchemas([
      ...(options.componentSchemas ?? []),
      ...(options.document.componentSchemas ?? []),
    ]);
    this.knownComponents = new Set([
      ...DEFAULT_KNOWN_COMPONENTS,
      ...this.componentSchemas.map((schema) => schema.id),
      ...(options.knownComponents ?? []),
    ]);
    this.savedDocumentSnapshot = snapshotSceneDocument(this.history.document);
    this.log('info', 'Scene editor document loaded');
  }

  handles(method: string): boolean {
    return SCENE_EDITOR_TOOL_METHOD_SET.has(method);
  }

  async dispatch(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    switch (method) {
      case 'scene_list_assets':
        return this.listAssets(params);
      case 'scene_list_component_schemas':
        return this.listComponentSchemas(params);
      case 'scene_get_document':
        return this.getDocumentResult();
      case 'scene_get_hierarchy':
        return this.getHierarchy(params);
      case 'scene_get_selection':
        return this.getSelection();
      case 'scene_select':
        return this.select(params);
      case 'scene_add_node':
        return this.addNode(params);
      case 'scene_remove_node':
        return this.removeNode(params);
      case 'scene_duplicate_node':
        return this.duplicateNode(params);
      case 'scene_set_transform':
        return this.setTransform(params);
      case 'scene_apply_patch':
        return this.applyPatchTool(params);
      case 'scene_place_on':
        return this.placeOn(params);
      case 'scene_look_at':
        return this.lookAt(params);
      case 'scene_validate':
        return this.validate();
      case 'scene_save':
        return this.save();
      case 'scene_undo':
        return this.undo();
      case 'scene_redo':
        return this.redo();
      case 'scene_get_logs':
        return this.getLogs(params);
      case 'scene_set_camera':
        return this.setCamera(params);
      case 'scene_screenshot':
        return this.screenshot(params);
      case 'scene_compare_screenshots':
        return this.compareScreenshots(params);
      default:
        throw new Error(`Unsupported scene editor method "${method}"`);
    }
  }

  get document(): SceneDocument {
    return this.history.document;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  private listAssets(params: Record<string, unknown>) {
    const query = getOptionalString(params.query)?.toLowerCase();
    const assets = this.document.assets ?? [];
    return {
      assets: query
        ? assets.filter((asset) =>
            `${asset.id} ${asset.name ?? ''}`.toLowerCase().includes(query),
          )
        : assets,
    };
  }

  private listComponentSchemas(params: Record<string, unknown>) {
    const query = getOptionalString(params.query)?.toLowerCase();
    const schemas = query
      ? this.componentSchemas.filter((schema) =>
          `${schema.id} ${schema.name ?? ''} ${schema.description ?? ''}`
            .toLowerCase()
            .includes(query),
        )
      : this.componentSchemas;
    return {
      componentSchemas: schemas,
    };
  }

  private getDocumentResult() {
    return {
      dirty: this.dirty,
      document: this.document,
    };
  }

  private getHierarchy(params: Record<string, unknown>) {
    const parentId = getOptionalString(params.parentId);
    const maxDepth = getOptionalNumber(params.maxDepth) ?? 5;
    const nodes =
      parentId == null
        ? this.document.nodes
        : (findRequiredNodeLocation(this.document.nodes, parentId).node
            .children ?? []);
    return {
      hierarchy: nodes.map((node) => serializeNodeHierarchy(node, maxDepth)),
    };
  }

  private getSelection() {
    return {
      nodeIds: [...this.selection],
    };
  }

  private select(params: Record<string, unknown>) {
    const nodeIds = getStringArray(params.nodeIds, 'nodeIds');
    for (const nodeId of nodeIds) {
      findRequiredNodeLocation(this.document.nodes, nodeId);
    }
    this.selection = [...nodeIds];
    this.log('info', `Selected ${nodeIds.length} node(s)`);
    return this.getSelection();
  }

  private addNode(params: Record<string, unknown>) {
    const node = getRecord(params.node, 'node') as unknown as SceneNode;
    const patch: ScenePatch = {
      index: getOptionalNumber(params.index),
      node,
      op: 'addNode',
      parentId: getOptionalString(params.parentId) ?? null,
    };
    this.applyPatch(patch);
    this.selection = [node.id];
    return this.mutationResult('nodeAdded', { nodeId: node.id });
  }

  private removeNode(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const removedIds = collectSubtreeIds(
      findRequiredNodeLocation(this.document.nodes, nodeId).node,
    );
    this.applyPatch({ nodeId, op: 'removeNode' });
    this.selection = this.selection.filter(
      (selectedId) => !removedIds.has(selectedId),
    );
    return this.mutationResult('nodeRemoved', { nodeId });
  }

  private duplicateNode(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const location = findRequiredNodeLocation(this.document.nodes, nodeId);
    const newNodeId =
      getOptionalString(params.newNodeId) ??
      createCopyId(this.document, nodeId);
    const duplicate = cloneNodeWithNewIds(location.node, nodeId, newNodeId);
    const parentId =
      getOptionalString(params.parentId) ?? location.parent?.id ?? null;
    const index =
      parentId === (location.parent?.id ?? null)
        ? location.index + 1
        : undefined;

    this.applyPatch({
      index,
      node: duplicate,
      op: 'addNode',
      parentId,
    });
    this.selection = [duplicate.id];
    return this.mutationResult('nodeDuplicated', {
      nodeId,
      newNodeId: duplicate.id,
    });
  }

  private setTransform(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const transform = getRecord(
      params.transform,
      'transform',
    ) as unknown as SceneTransform;
    this.applyPatch({ nodeId, op: 'updateTransform', transform });
    return this.mutationResult('transformUpdated', { nodeId, transform });
  }

  private applyPatchTool(params: Record<string, unknown>) {
    const patch = getRecord(params.patch, 'patch') as unknown as ScenePatch;
    this.applyPatch(patch);
    if (patch.op === 'renameNode') {
      this.selection = this.selection.map((nodeId) =>
        nodeId === patch.nodeId ? patch.newNodeId : nodeId,
      );
    }
    return this.mutationResult('patchApplied', { patch });
  }

  private placeOn(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const targetId = getRequiredString(params.targetId, 'targetId');
    const placeOn: ScenePlaceOn = {
      target: targetId,
      ...(params.clearance != null
        ? { clearance: getOptionalNumber(params.clearance) ?? 0 }
        : {}),
      ...(params.align != null ? { align: getAlign(params.align) } : {}),
    };
    const transform = resolvePlaceOnTransform(this.document, nodeId, placeOn);
    this.applyPatch({ nodeId, op: 'updateTransform', transform });
    return this.mutationResult('nodePlaced', { nodeId, targetId, transform });
  }

  private lookAt(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const target = getVec3(params.target, 'target');
    const transform = resolveLookAtTransformInDocument(
      this.document,
      nodeId,
      target,
    );
    this.applyPatch({ nodeId, op: 'updateTransform', transform });
    return this.mutationResult('nodeOriented', { nodeId, target, transform });
  }

  private validate() {
    const document = this.document;
    const base = validateSceneDocument(this.document);
    const issues: SceneEditorValidationIssue[] = [
      ...enrichBaseValidationIssues(document, base.issues),
      ...validateBoundsPlacement(document),
      ...validateComponentTypes(document, this.knownComponents),
      ...validateComponentPayloads(document, this.componentSchemas),
    ];
    return {
      valid: issues.length === 0,
      issues,
    };
  }

  private async save() {
    if (this.options.saveDocument == null) {
      throw new Error('Scene editor was not configured with a save handler');
    }
    const validation = this.validate();
    if (!validation.valid) {
      const issueSummary = summarizeValidationIssues(validation.issues);
      this.log('error', `Scene save blocked: ${issueSummary}`);
      throw Object.assign(
        new Error(`Cannot save invalid scene: ${issueSummary}`),
        {
          issues: validation.issues,
        },
      );
    }
    const document = this.document;
    const serialized = serializeSceneDocument(document);
    const result = await this.options.saveDocument(serialized, document);
    this.savedDocumentSnapshot = serialized;
    this.updateDirtyState();
    this.log('info', 'Scene editor document saved');
    return {
      dirty: this.dirty,
      ...result,
    };
  }

  private undo() {
    this.history.undo();
    this.pruneSelectionToExistingNodes();
    this.updateDirtyState();
    this.log('info', 'Undo applied');
    return this.mutationResult('undone');
  }

  private redo() {
    this.history.redo();
    this.pruneSelectionToExistingNodes();
    this.updateDirtyState();
    this.log('info', 'Redo applied');
    return this.mutationResult('redone');
  }

  private getLogs(params: Record<string, unknown>) {
    const level = getOptionalLogLevel(params.level);
    const count = getOptionalNumber(params.count);
    const filtered =
      level == null
        ? this.logs
        : this.logs.filter((entry) => entry.level === level);
    return {
      logs: count != null && count > 0 ? filtered.slice(-count) : filtered,
    };
  }

  private setCamera(params: Record<string, unknown>) {
    this.camera = resolveCamera(params, this.camera);
    this.log('info', `Camera set to ${this.camera.view}`);
    return {
      camera: this.camera,
    };
  }

  private async screenshot(params: Record<string, unknown>) {
    this.camera = resolveCamera(params, this.camera);
    return this.captureScreenshot(this.camera, {
      height: getOptionalNumber(params.height),
      width: getOptionalNumber(params.width),
    });
  }

  private async compareScreenshots(
    params: Record<string, unknown>,
  ): Promise<SceneEditorScreenshotComparisonResult> {
    const firstParams = getRecord(params.first, 'first');
    const secondParams = getRecord(params.second, 'second');
    const size = {
      height: getOptionalNumber(params.height),
      width: getOptionalNumber(params.width),
    };
    const firstCamera = resolveCamera(firstParams, this.camera);
    const secondCamera = resolveCamera(secondParams, firstCamera);
    const first = await this.captureScreenshot(firstCamera, size);
    const second = await this.captureScreenshot(secondCamera, size);
    this.camera = secondCamera;

    return {
      first,
      firstImageDataLength: first.imageData.length,
      matches:
        first.mimeType === second.mimeType &&
        first.imageData === second.imageData,
      second,
      secondImageDataLength: second.imageData.length,
    };
  }

  private async captureScreenshot(
    camera: SceneEditorCameraState,
    size: { width?: number; height?: number },
  ) {
    if (this.options.screenshot == null) {
      throw new Error(
        'Scene editor was not configured with a screenshot handler',
      );
    }
    return this.options.screenshot(camera, size);
  }

  private applyPatch(patch: ScenePatch) {
    this.history.apply(patch);
    this.updateDirtyState();
    this.log('info', `Applied scene patch ${patch.op}`);
  }

  private updateDirtyState() {
    this.dirty =
      snapshotSceneDocument(this.document) !== this.savedDocumentSnapshot;
  }

  private pruneSelectionToExistingNodes() {
    const ids = new Set<string>();
    visitNodes(this.document.nodes, (node) => ids.add(node.id));
    this.selection = this.selection.filter((nodeId) => ids.has(nodeId));
  }

  private mutationResult(action: string, extra: Record<string, unknown> = {}) {
    const validation = this.validate();
    return {
      action,
      dirty: this.dirty,
      selection: [...this.selection],
      valid: validation.valid,
      issues: validation.issues,
      ...extra,
    };
  }

  private log(level: SceneEditorLogEntry['level'], message: string) {
    this.logs.push({ level, message, timestamp: Date.now() });
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }
}

function serializeNodeHierarchy(node: SceneNode, maxDepth: number): unknown {
  const children = node.children ?? [];
  return {
    id: node.id,
    name: node.name,
    asset: node.asset,
    childCount: children.length,
    ...(maxDepth > 0
      ? {
          children: children.map((child) =>
            serializeNodeHierarchy(child, maxDepth - 1),
          ),
        }
      : {}),
  };
}

function resolveCamera(
  params: Record<string, unknown>,
  current: SceneEditorCameraState,
): SceneEditorCameraState {
  const explicitPosition =
    params.position == null ? undefined : getVec3(params.position, 'position');
  const explicitLookAt =
    params.lookAt == null ? undefined : getVec3(params.lookAt, 'lookAt');
  const fov = getOptionalNumber(params.fov) ?? current.fov;

  if (explicitPosition != null || explicitLookAt != null) {
    return {
      fov,
      lookAt: explicitLookAt ?? current.lookAt,
      position: explicitPosition ?? current.position,
      view: 'custom',
    };
  }

  const view = getOptionalString(params.view) as
    | SceneEditorCameraView
    | undefined;
  if (view == null) {
    return { ...current, fov };
  }
  if (!isCameraView(view)) {
    throw new Error(
      'view must be one of current, top, front, back, left, right, quarter, orbit',
    );
  }
  if (view === 'current') {
    return { ...current, fov };
  }

  if (view === 'orbit') {
    return {
      ...cameraForOrbitStep(getOrbitStep(params)),
      fov,
    };
  }

  return {
    ...cameraForView(view),
    fov,
  };
}

function isCameraView(value: string): value is SceneEditorCameraView {
  return (
    value === 'current' ||
    value === 'top' ||
    value === 'front' ||
    value === 'back' ||
    value === 'left' ||
    value === 'right' ||
    value === 'quarter' ||
    value === 'orbit'
  );
}

function cameraForView(
  view: SceneEditorResolvedCameraView,
): SceneEditorCameraState {
  switch (view) {
    case 'top':
      return { fov: 50, lookAt: [0, 0, 0], position: [0, 8, 0], view };
    case 'front':
      return { fov: 50, lookAt: [0, 0, 0], position: [0, 2, 8], view };
    case 'back':
      return { fov: 50, lookAt: [0, 0, 0], position: [0, 2, -8], view };
    case 'left':
      return { fov: 50, lookAt: [0, 0, 0], position: [-8, 2, 0], view };
    case 'right':
      return { fov: 50, lookAt: [0, 0, 0], position: [8, 2, 0], view };
    case 'quarter':
      return { fov: 50, lookAt: [0, 0, 0], position: [4, 3, 4], view };
    case 'orbit':
      return cameraForOrbitStep(0);
  }
}

function getOrbitStep(params: Record<string, unknown>): number {
  const explicitStep =
    getOptionalNumber(params.orbitStep) ?? getOptionalNumber(params.step);
  if (explicitStep == null) {
    return 0;
  }
  return Math.trunc(explicitStep);
}

function cameraForOrbitStep(step: number): SceneEditorCameraState {
  const angle = ((((step % 8) + 8) % 8) * Math.PI) / 4;
  const radius = 5.66;
  return {
    fov: 50,
    lookAt: [0, 0, 0],
    position: [
      roundCameraNumber(Math.cos(angle) * radius),
      3,
      roundCameraNumber(Math.sin(angle) * radius),
    ],
    view: 'orbit',
  };
}

function roundCameraNumber(value: number): number {
  return Number(value.toFixed(4));
}

function enrichBaseValidationIssues(
  document: SceneDocument,
  issues: ValidationIssue[],
): SceneEditorValidationIssue[] {
  const nodePathToId = collectNodePathIds(document);
  return issues.map((issue) => ({
    ...issue,
    ...nodeMetadataForPath(nodePathToId, issue.path),
    suggestedFix: suggestFixForIssue(issue),
  }));
}

function validateBoundsPlacement(
  document: SceneDocument,
): SceneEditorValidationIssue[] {
  const assetById = new Map(
    (document.assets ?? []).map((asset) => [asset.id, asset]),
  );
  const issues: SceneEditorValidationIssue[] = [];
  const placements: NodePlacement[] = [];
  let hasUnreliableSupportCandidate = false;

  visitNodes(document.nodes, (node, path) => {
    if (node.asset == null) {
      return;
    }
    const asset = assetById.get(node.asset);
    if (asset?.bounds == null) {
      return;
    }
    if (!hasReliablePlacementBounds(asset)) {
      hasUnreliableSupportCandidate =
        hasUnreliableSupportCandidate || isEnvironmentLikeNode(node, asset);
      return;
    }
    const scale = scaleToVec3(node.transform?.scale);
    const position = node.transform?.position ?? [0, 0, 0];
    const placement: NodePlacement = {
      bounds: {
        max: [
          position[0] + asset.bounds.max[0] * scale[0],
          position[1] + asset.bounds.max[1] * scale[1],
          position[2] + asset.bounds.max[2] * scale[2],
        ],
        min: [
          position[0] + asset.bounds.min[0] * scale[0],
          position[1] + asset.bounds.min[1] * scale[1],
          position[2] + asset.bounds.min[2] * scale[2],
        ],
      },
      node,
      path,
    };
    placements.push(placement);

    if (placement.bounds.min[1] < -PLACEMENT_EPSILON) {
      issues.push({
        message: `node "${node.id}" penetrates below the floor by ${Math.abs(
          placement.bounds.min[1],
        ).toFixed(3)}m`,
        nodeId: node.id,
        path: `${path}.transform.position`,
        suggestedFix: `Move "${node.id}" above y=0 or call scene_place_on with a support object.`,
      });
    }
    if (node.transform?.placeOn != null) {
      issues.push({
        message: `node "${node.id}" has unresolved placeOn metadata`,
        nodeId: node.id,
        path: `${path}.transform.placeOn`,
        suggestedFix: `Call scene_place_on for "${node.id}" so the helper resolves to a concrete transform before saving.`,
      });
    }
  });

  if (hasUnreliableSupportCandidate) {
    return issues;
  }

  for (const placement of placements) {
    if (isFloatingAllowed(placement.node)) {
      continue;
    }

    if (placement.bounds.min[1] <= SUPPORT_CONTACT_EPSILON) {
      continue;
    }

    const support = placements.find(
      (candidate) =>
        candidate.node.id !== placement.node.id &&
        Math.abs(candidate.bounds.max[1] - placement.bounds.min[1]) <=
          SUPPORT_CONTACT_EPSILON &&
        overlapsOnAxis(
          candidate.bounds.min[0],
          candidate.bounds.max[0],
          placement.bounds.min[0],
          placement.bounds.max[0],
        ) &&
        overlapsOnAxis(
          candidate.bounds.min[2],
          candidate.bounds.max[2],
          placement.bounds.min[2],
          placement.bounds.max[2],
        ),
    );

    if (support == null) {
      issues.push({
        message: `node "${placement.node.id}" appears unsupported at y=${placement.bounds.min[1].toFixed(
          3,
        )}m; use scene_place_on or mark metadata.validation.allowFloating for intentional wall/air placement`,
        nodeId: placement.node.id,
        path: `${placement.path}.transform.position`,
        suggestedFix: `Call scene_place_on for "${placement.node.id}" with the intended support node, lower it to the floor, or set metadata.validation.allowFloating for intentional suspended placement.`,
      });
    }
  }

  return issues;
}

function hasReliablePlacementBounds(asset: SceneAsset): boolean {
  const explicit = readPlacementBoundsFlag(asset.metadata?.validation);
  if (explicit != null) {
    return explicit;
  }

  const bounds = asset.bounds;
  if (bounds == null) {
    return false;
  }

  const extents = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  return extents.every(
    (extent) =>
      Number.isFinite(extent) &&
      extent >= 0 &&
      extent <= MAX_PLACEMENT_BOUNDS_EXTENT_METERS,
  );
}

function readPlacementBoundsFlag(value: unknown): boolean | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const flag = (value as { placementBounds?: unknown }).placementBounds;
  return typeof flag === 'boolean' ? flag : undefined;
}

function isEnvironmentLikeNode(node: SceneNode, asset: SceneAsset): boolean {
  if (
    Object.keys(node.components ?? {}).some(
      (componentName) =>
        stripComponentPrefix(componentName) === 'LocomotionEnvironment',
    )
  ) {
    return true;
  }

  const label = [node.id, node.name, node.asset, asset.id, asset.name]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return /\b(environment|floor|ground|level|room|terrain|world)\b/.test(label);
}

interface NodePlacement {
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  node: SceneNode;
  path: string;
}

function overlapsOnAxis(
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number,
): boolean {
  return Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin) > 0;
}

function isFloatingAllowed(node: SceneNode): boolean {
  return (
    hasAllowFloatingFlag(node.metadata?.validation) ||
    hasAllowFloatingFlag(node.editor?.validation)
  );
}

function hasAllowFloatingFlag(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { allowFloating?: unknown }).allowFloating === true
  );
}

function validateComponentTypes(
  document: SceneDocument,
  knownComponents: Set<string>,
): SceneEditorValidationIssue[] {
  const issues: SceneEditorValidationIssue[] = [];

  visitNodes(document.nodes, (node, path) => {
    if (node.components == null || hasAllowUnknownComponentsFlag(node)) {
      return;
    }

    for (const componentName of Object.keys(node.components)) {
      const componentId = normalizeComponentId(
        stripComponentPrefix(componentName),
      );
      if (!knownComponents.has(componentId)) {
        issues.push({
          message: `node "${node.id}" references unknown component "${componentName}"`,
          nodeId: node.id,
          path: `${path}.components[${JSON.stringify(componentName)}]`,
          suggestedFix: `Register "${componentId}" as an app-specific component for the editor session or remove/rename the component payload.`,
        });
      }
    }
  });

  return issues;
}

function validateComponentPayloads(
  document: SceneDocument,
  componentSchemas: readonly SceneComponentSchema[],
): SceneEditorValidationIssue[] {
  const issues: SceneEditorValidationIssue[] = [];
  const schemaById = new Map(
    componentSchemas.map((schema) => [schema.id, schema]),
  );

  visitNodes(document.nodes, (node, path) => {
    if (node.components == null) {
      return;
    }

    for (const [componentName, payload] of Object.entries(node.components)) {
      const componentType = normalizeComponentId(
        componentPayloadType(componentName, payload),
      );
      const schema = schemaById.get(componentType);
      if (!schema) {
        continue;
      }
      const props = componentPayloadProps(payload);
      if (props == null) {
        continue;
      }
      const payloadPath = `${path}.components[${JSON.stringify(componentName)}]`;
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        if (field.internal === true || !(fieldName in props)) {
          continue;
        }
        validateComponentFieldValue(
          node,
          fieldName,
          field,
          props[fieldName],
          `${payloadPath}${isTypedComponentPayload(payload) ? '.props' : ''}[${JSON.stringify(fieldName)}]`,
          issues,
        );
      }
    }
  });

  return issues;
}

function componentPayloadType(componentName: string, payload: unknown): string {
  return isTypedComponentPayload(payload)
    ? payload.type
    : stripComponentPrefix(componentName);
}

function componentPayloadProps(
  payload: unknown,
): Record<string, unknown> | null {
  if (isTypedComponentPayload(payload)) {
    return isPlainEditorRecord(payload.props) ? payload.props : {};
  }
  return isPlainEditorRecord(payload) ? payload : null;
}

function validateComponentFieldValue(
  node: SceneNode,
  fieldName: string,
  field: SceneComponentFieldSchema,
  value: unknown,
  path: string,
  issues: SceneEditorValidationIssue[],
) {
  const fail = (message: string) => {
    issues.push({
      message: `component field "${fieldName}" ${message}`,
      nodeId: node.id,
      path,
      suggestedFix: `Set "${fieldName}" to a ${componentFieldTypeDescription(field)} value before saving.`,
    });
  };

  switch (field.type) {
    case 'Boolean':
      if (typeof value !== 'boolean') {
        fail('must be a boolean');
      }
      return;
    case 'String':
    case 'FilePath':
      if (typeof value !== 'string') {
        fail('must be a string');
      }
      return;
    case 'Enum':
      if (
        typeof value !== 'string' ||
        (field.enum != null && !Object.values(field.enum).includes(value))
      ) {
        fail('must be one of the schema enum values');
      }
      return;
    case 'Int8':
    case 'Int16':
    case 'Int32':
      if (!isFiniteNumber(value) || !Number.isInteger(value)) {
        fail('must be an integer');
        return;
      }
      if (!isInNumericRange(value, field)) {
        fail('is outside the allowed range');
      }
      return;
    case 'Float32':
    case 'Float64':
      if (!isFiniteNumber(value)) {
        fail('must be a finite number');
        return;
      }
      if (!isInNumericRange(value, field)) {
        fail('is outside the allowed range');
      }
      return;
    case 'Vec2':
      validateFiniteNumberTuple(value, 2, fail);
      return;
    case 'Vec3':
      validateFiniteNumberTuple(value, 3, fail);
      return;
    case 'Vec4':
    case 'Color':
      validateFiniteNumberTuple(value, 4, fail);
      return;
    case 'Object':
    case 'Entity':
      if (!isSceneJsonObject(value)) {
        fail('must be a JSON object');
      }
      return;
    default:
      return;
  }
}

function validateFiniteNumberTuple(
  value: unknown,
  length: number,
  fail: (message: string) => void,
) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((entry) => !isFiniteNumber(entry))
  ) {
    fail(`must be a finite ${length}-number tuple`);
  }
}

function isInNumericRange(
  value: number,
  field: SceneComponentFieldSchema,
): boolean {
  return (
    (field.min == null || value >= field.min) &&
    (field.max == null || value <= field.max)
  );
}

function componentFieldTypeDescription(
  field: SceneComponentFieldSchema,
): string {
  if (field.type === 'Enum' && field.enum != null) {
    return `valid enum (${Object.values(field.enum).join(', ')})`;
  }
  return field.type;
}

function isTypedComponentPayload(
  value: unknown,
): value is { type: string; props?: unknown } {
  if (!isPlainEditorRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.every((key) => key === 'type' || key === 'props') &&
    typeof value.type === 'string' &&
    value.type.length > 0
  );
}

function isPlainEditorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSceneJsonObject(value: unknown): value is Record<string, unknown> {
  return isPlainEditorRecord(value) && isSceneJsonValue(value);
}

function isSceneJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isSceneJsonValue);
  }
  if (isPlainEditorRecord(value)) {
    return Object.values(value).every(isSceneJsonValue);
  }
  return false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function mergeComponentSchemas(
  schemas: readonly SceneComponentSchema[],
): SceneComponentSchema[] {
  const merged = new Map<string, SceneComponentSchema>();
  for (const schema of schemas) {
    merged.set(schema.id, schema);
  }
  return [...merged.values()].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

function summarizeValidationIssues(
  issues: readonly SceneEditorValidationIssue[],
): string {
  if (issues.length === 0) {
    return 'no validation issues';
  }
  const [first] = issues;
  const location = first.nodeId ? ` on node "${first.nodeId}"` : '';
  const remaining = issues.length > 1 ? ` (+${issues.length - 1} more)` : '';
  return `${first.message}${location}${remaining}`;
}

function collectNodePathIds(document: SceneDocument) {
  const nodePathToId = new Map<string, string>();
  visitNodes(document.nodes, (node, path) => {
    nodePathToId.set(path, node.id);
  });
  return nodePathToId;
}

function nodeMetadataForPath(
  nodePathToId: Map<string, string>,
  issuePath: string,
) {
  let matchedPath = '';
  let nodeId: string | undefined;
  for (const [path, id] of nodePathToId) {
    if (
      issuePath === path ||
      issuePath.startsWith(`${path}.`) ||
      issuePath.startsWith(`${path}[`)
    ) {
      if (path.length > matchedPath.length) {
        matchedPath = path;
        nodeId = id;
      }
    }
  }

  return nodeId == null ? {} : { nodeId };
}

function suggestFixForIssue(issue: ValidationIssue): string | undefined {
  if (
    issue.path.endsWith('.asset') &&
    issue.message.includes('unknown asset')
  ) {
    return 'Call scene_list_assets, then update the node asset to a known asset id or add the missing asset entry.';
  }
  if (issue.message.includes('duplicate node id')) {
    return 'Rename one duplicate node id or remove the duplicate node before saving.';
  }
  if (
    issue.path.includes('.transform.') ||
    issue.message.includes('[x, y, z]') ||
    issue.message.includes('scale')
  ) {
    return 'Set transform values to finite numeric tuples and keep scale values greater than 0.';
  }
  if (issue.path.includes('.components')) {
    return 'Use JSON-serializable component payloads and component names that the runtime/editor can resolve.';
  }
  return undefined;
}

function stripComponentPrefix(componentName: string): string {
  return componentName.startsWith(LEVEL_COMPONENT_PREFIX)
    ? componentName.slice(LEVEL_COMPONENT_PREFIX.length)
    : componentName;
}

function normalizeComponentId(componentId: string): string {
  return SCENE_EDITOR_COMPONENT_ALIASES[componentId] ?? componentId;
}

function hasAllowUnknownComponentsFlag(node: SceneNode): boolean {
  return (
    hasUnknownComponentFlag(node.metadata?.validation) ||
    hasUnknownComponentFlag(node.editor?.validation)
  );
}

function hasUnknownComponentFlag(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { allowUnknownComponents?: unknown }).allowUnknownComponents ===
      true
  );
}

function visitNodes(
  nodes: SceneNode[],
  visitor: (node: SceneNode, path: string) => void,
  path = '$.nodes',
) {
  nodes.forEach((node, index) => {
    const nodePath = `${path}[${index}]`;
    visitor(node, nodePath);
    visitNodes(node.children ?? [], visitor, `${nodePath}.children`);
  });
}

interface NodeLocation {
  node: SceneNode;
  parent: SceneNode | null;
  index: number;
}

function findRequiredNodeLocation(
  nodes: SceneNode[],
  nodeId: string,
  parent: SceneNode | null = null,
): NodeLocation {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index !== -1) {
    return { index, node: nodes[index], parent };
  }

  for (const node of nodes) {
    const location = findNodeLocation(node.children ?? [], nodeId, node);
    if (location != null) {
      return location;
    }
  }

  throw new Error(`Unknown scene node "${nodeId}"`);
}

function findNodeLocation(
  nodes: SceneNode[],
  nodeId: string,
  parent: SceneNode,
): NodeLocation | undefined {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index !== -1) {
    return { index, node: nodes[index], parent };
  }

  for (const node of nodes) {
    const location = findNodeLocation(node.children ?? [], nodeId, node);
    if (location != null) {
      return location;
    }
  }

  return undefined;
}

function cloneNodeWithNewIds(
  node: SceneNode,
  originalRootId: string,
  newRootId: string,
): SceneNode {
  const cloned = cloneJson(node);
  rewriteNodeIds(cloned, originalRootId, newRootId);
  return cloned;
}

function rewriteNodeIds(
  node: SceneNode,
  originalRootId: string,
  newRootId: string,
) {
  node.id = node.id === originalRootId ? newRootId : `${newRootId}-${node.id}`;
  node.children?.forEach((child) =>
    rewriteNodeIds(child, originalRootId, newRootId),
  );
}

function collectSubtreeIds(node: SceneNode, ids = new Set<string>()) {
  ids.add(node.id);
  node.children?.forEach((child) => collectSubtreeIds(child, ids));
  return ids;
}

function createCopyId(document: SceneDocument, nodeId: string) {
  const ids = new Set<string>();
  visitNodes(document.nodes, (node) => ids.add(node.id));

  let index = 1;
  let candidate = `${nodeId}-copy`;
  while (ids.has(candidate)) {
    index += 1;
    candidate = `${nodeId}-copy-${index}`;
  }
  return candidate;
}

function getRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function getRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

function getOptionalString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error('Expected string value');
  }
  return value;
}

function getOptionalNumber(value: unknown): number | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expected finite number value');
  }
  return value;
}

function getOptionalLogLevel(
  value: unknown,
): SceneEditorLogEntry['level'] | undefined {
  const level = getOptionalString(value);
  if (level == null) {
    return undefined;
  }
  if (level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  throw new Error('level must be one of info, warn, error');
}

function getVec3(value: unknown, fieldName: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    throw new Error(`${fieldName} must be [x, y, z] finite numbers`);
  }
  return [value[0], value[1], value[2]];
}

function getStringArray(value: unknown, fieldName: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  return [...value];
}

function getAlign(value: unknown): ScenePlaceOn['align'] {
  if (value === 'center' || value === 'preserve-xz') {
    return value;
  }
  throw new Error('align must be "center" or "preserve-xz"');
}

function scaleToVec3(scale: SceneTransform['scale']): Vec3 {
  if (scale == null) {
    return [1, 1, 1];
  }
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function snapshotSceneDocument(document: SceneDocument): string {
  try {
    return serializeSceneDocument(document);
  } catch {
    return JSON.stringify(document);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
