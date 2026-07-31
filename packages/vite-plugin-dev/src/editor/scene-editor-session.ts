/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CURRENT_SCENE_REVIEW_VERSION,
  CURRENT_SCENE_VERSION,
  MAX_SCENE_COORDINATE,
  MAX_SCENE_NODES,
  MAX_SCENE_PATTERN_EXPANSION,
  MAX_SCENE_RESOURCES,
  SCENE_DOCUMENT_JSON_SCHEMA,
  SCENE_REVIEW_JSON_SCHEMA,
  SceneCommandHistory,
  applyScenePatch,
  assertValidSceneDocument,
  canonicalizeJson,
  hashSceneComponentSchema,
  hashRuntimeSceneDocument,
  hashSceneDocument,
  resolveLookAtTransformInDocument,
  serializeSceneDocument,
  sha256,
  validateSceneCapabilities,
  validateSceneDocument,
  type SceneComponentCatalog,
  type SceneComponentSchema,
  type SceneCapabilitySnapshot,
  type SceneBounds,
  type SceneDocument,
  type SceneNode,
  type SceneNodeFramingRole,
  type ScenePatch,
  type SceneTransform,
  type SceneAuthoringView,
  type Sha256,
  type ValidationIssue,
  type Vec3,
  type Vec4,
} from '@iwsdk/scene-composition';

export const SCENE_EDITOR_TOOL_METHODS = [
  'scene_get_capabilities',
  'scene_select',
  'scene_set_camera',
  'scene_screenshot',
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
  viewId?: string;
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  height?: number;
}

export interface SceneEditorScreenshotResult {
  imageData: string;
  mimeType: 'image/png';
  camera: SceneEditorCameraState;
  width?: number;
  height?: number;
  visibleNodeIds?: string[];
  rendererEnvironment?: Record<string, unknown>;
  renderStats?: SceneEditorRenderStats | SceneEditorUnavailableRenderStats;
  screenshotSha256?: Sha256;
  captureMode?: SceneEditorCaptureMode;
  nodeMaskRegions?: Record<string, Vec4>;
}

export type SceneEditorCaptureMode = 'render' | 'editor';

export interface SceneEditorScreenshotOptions {
  width?: number;
  height?: number;
  captureMode: SceneEditorCaptureMode;
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

export type SceneEditorReviewLens = 'layout' | 'geometry' | 'final';

export interface SceneEditorRenderStats {
  available: true;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  textures: number;
  programs: number;
  shadowCasters: number;
  frameTimeSamplesMs: number[];
  environment: Record<string, unknown>;
  framingBounds: { min: Vec3; max: Vec3; size: Vec3 } | null;
  worldBounds: { min: Vec3; max: Vec3; size: Vec3 } | null;
  objectCount: number;
  nodeCount: number;
  meshCount: number;
  geometryCount: number;
  materialCount: number;
  visibleNodeIds: string[];
}

export interface SceneEditorUnavailableRenderStats {
  available: false;
  reason: string;
}

export interface SceneEditorValidationIssue extends ValidationIssue {
  nodeId?: string;
  suggestedFix?: string;
}

export type SceneEditorLifecycleStatus = 'passed' | 'failed' | 'not-run';

export interface SceneEditorLifecycleReport {
  schemaValid: SceneEditorLifecycleStatus;
  capabilityCompatible: SceneEditorLifecycleStatus;
  resourcesReady: SceneEditorLifecycleStatus;
  editorCommitted: SceneEditorLifecycleStatus;
  runtimeProven: SceneEditorLifecycleStatus;
}

export interface SceneEditorDocumentTransitionRequest {
  candidate: SceneDocument;
  correction?: unknown;
  expectedBaseDocumentHash: Sha256;
  operation: 'replace-document' | 'transaction';
  patch: ScenePatch;
  previousDocument: SceneDocument;
}

export interface SceneEditorSessionOptions {
  document: unknown;
  listAssets?: () => readonly SceneEditorAssetInfo[];
  resolveAssetBounds?: (assetId: string) => SceneBounds | undefined;
  componentCatalog?: SceneComponentCatalog;
  knownComponents?: readonly string[];
  saveDocument?: (
    serializedDocument: string,
    document: SceneDocument,
  ) => Promise<SceneEditorSaveResult> | SceneEditorSaveResult;
  screenshot?: (
    camera: SceneEditorCameraState,
    options: SceneEditorScreenshotOptions,
  ) => Promise<SceneEditorScreenshotResult> | SceneEditorScreenshotResult;
  registerReviewCapture?: (
    capture: Record<string, unknown>,
  ) => Promise<{ captureToken: Sha256 }> | { captureToken: Sha256 };
  setReviewLens?: (lens: SceneEditorReviewLens) => Promise<void> | void;
  renderStats?: () => Promise<SceneEditorRenderStats> | SceneEditorRenderStats;
  preloadDocumentResources?: (document: SceneDocument) => Promise<void> | void;
  instantiateDocumentPreview?: (
    document: SceneDocument,
  ) => Promise<void> | void;
  commitDocument?: (document: SceneDocument) => Promise<void> | void;
  authorizeDocumentTransition?: (
    request: SceneEditorDocumentTransitionRequest,
  ) => Promise<void> | void;
  discardDocumentTransition?: () => Promise<void> | void;
  rollbackDocument?: (
    candidate: SceneDocument,
    previousDocument: SceneDocument,
  ) => Promise<void> | void;
}

export interface SceneEditorAssetInfo {
  id: string;
  name?: string;
  kind?: string;
  bounds?: SceneBounds;
}

export interface FrameworkMCPRuntime {
  handles(method: string): boolean;
  dispatch(method: string, params: Record<string, unknown>): Promise<unknown>;
}

const SCENE_EDITOR_TOOL_METHOD_SET = new Set<string>(SCENE_EDITOR_TOOL_METHODS);
const SCENE_EDITOR_WRITE_METHODS = new Set<string>([
  'scene_select',
  'scene_add_node',
  'scene_remove_node',
  'scene_duplicate_node',
  'scene_set_transform',
  'scene_set_framing_role',
  'scene_apply_patch',
  'scene_apply_transaction',
  'scene_replace_document',
  'scene_look_at',
  'scene_save',
  'scene_undo',
  'scene_redo',
]);
const LEVEL_COMPONENT_PREFIX = 'com.iwsdk.components.';
const SCENE_EDITOR_COMPONENT_ALIASES: Record<string, string> = {
  Interactable: 'RayInteractable',
};
const DEFAULT_CAMERA: SceneEditorCameraState = {
  fov: 50,
  lookAt: [0, 0, 0],
  position: [4, 3, 4],
  projection: 'perspective',
  view: 'quarter',
};
const IWSDK_EDITOR_SDK_VERSION = '0.4.2';
const EDITOR_DOCUMENT_VALIDATION_OPTIONS = {
  validateAuthoringWorkflow: false,
} as const;

export class SceneEditorSession implements FrameworkMCPRuntime {
  private history: SceneCommandHistory;
  private readonly knownComponents: Set<string>;
  private readonly pendingReviewCaptures = new Map<
    string,
    Record<string, unknown>
  >();
  private readonly registeredComponentSchemas: SceneComponentSchema[];
  private readonly componentCatalog: SceneComponentCatalog | undefined;
  private selection: string[] = [];
  private camera: SceneEditorCameraState = { ...DEFAULT_CAMERA };
  private reviewLens: SceneEditorReviewLens = 'final';
  private materializationInProgress = false;
  private dirty = false;
  private savedDocumentSnapshot: string;
  private logs: SceneEditorLogEntry[] = [];
  private readonly reviewCaptureSessionNonce =
    createReviewCaptureSessionNonce();
  private reviewCaptureSequence = 0;

  constructor(private readonly options: SceneEditorSessionOptions) {
    const document = structuredClone(options.document);
    this.componentCatalog = options.componentCatalog;
    assertValidSceneDocument(document, EDITOR_DOCUMENT_VALIDATION_OPTIONS);
    this.history = new SceneCommandHistory(document, {
      validationOptions: EDITOR_DOCUMENT_VALIDATION_OPTIONS,
    });
    this.registeredComponentSchemas = mergeComponentSchemas(
      Object.values(this.componentCatalog ?? {}),
    );
    this.knownComponents = new Set([
      ...this.registeredComponentSchemas.map((schema) => schema.id),
      ...(options.knownComponents ?? []),
    ]);
    this.savedDocumentSnapshot = snapshotSceneDocument(this.history.document);
    this.log('info', 'Scene editor document loaded');
  }

  handles(method: string): boolean {
    return SCENE_EDITOR_TOOL_METHOD_SET.has(method);
  }

  getPendingReviewCapture(captureTokenValue: unknown): Record<string, unknown> {
    const captureToken = getSha256(captureTokenValue, 'captureToken');
    const capture = this.pendingReviewCaptures.get(captureToken);
    if (capture == null) {
      throw new Error(
        'captureToken is unknown or was invalidated by a scene revision',
      );
    }
    const documentHash = hashSceneDocument(this.document);
    const runtimeHash = hashRuntimeSceneDocument(this.document);
    if (
      capture.documentHash !== documentHash ||
      capture.runtimeHash !== runtimeHash
    ) {
      this.pendingReviewCaptures.delete(captureToken);
      throw new Error(
        'Review capture is stale for the active scene document revision',
      );
    }
    return cloneJson(capture);
  }

  async dispatch(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (
      this.materializationInProgress &&
      SCENE_EDITOR_WRITE_METHODS.has(method)
    ) {
      throw new Error(
        `Cannot run ${method} while a scene materialization is in progress`,
      );
    }
    switch (method) {
      case 'scene_get_capabilities':
        return this.getCapabilities(params);
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
      case 'scene_set_framing_role':
        return this.setFramingRole(params);
      case 'scene_apply_patch':
        return this.applyPatchTool(params);
      case 'scene_apply_transaction':
        return this.applyTransaction(params);
      case 'scene_replace_document':
        return this.replaceDocument(params);
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
      case 'scene_set_review_lens':
        return this.setReviewLens(params);
      case 'scene_capture_review':
        return this.captureReview(params);
      case 'scene_get_render_stats':
        return this.getRenderStats();
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

  /**
   * Atomically adopts a validated document read from disk without creating an
   * editor command or marking the document dirty. This is intentionally not an
   * MCP tool: files are the agent authoring API, while the session remains the
   * human editor's local command surface.
   */
  async replaceFromDisk(document: unknown): Promise<{
    documentHash: Sha256;
    runtimeHash: Sha256;
  }> {
    if (this.dirty) {
      throw new Error(
        'The scene has unsaved editor changes and cannot be replaced from disk',
      );
    }
    if (this.materializationInProgress) {
      throw new Error('Another scene materialization is already in progress');
    }
    const candidate = structuredClone(document);
    assertValidSceneDocument(candidate, EDITOR_DOCUMENT_VALIDATION_OPTIONS);
    const previousDocument = this.document;
    this.materializationInProgress = true;
    try {
      await this.options.preloadDocumentResources?.(cloneJson(candidate));
      await this.options.instantiateDocumentPreview?.(cloneJson(candidate));
      await this.options.commitDocument?.(cloneJson(candidate));
      this.history = new SceneCommandHistory(candidate, {
        validationOptions: EDITOR_DOCUMENT_VALIDATION_OPTIONS,
      });
      this.savedDocumentSnapshot = snapshotSceneDocument(candidate);
      this.dirty = false;
      this.pendingReviewCaptures.clear();
      this.pruneSelectionToExistingNodes();
      this.log('info', 'Reloaded scene document from disk');
      return {
        documentHash: hashSceneDocument(candidate),
        runtimeHash: hashRuntimeSceneDocument(candidate),
      };
    } catch (error) {
      await this.options.rollbackDocument?.(
        cloneJson(candidate),
        cloneJson(previousDocument),
      );
      throw error;
    } finally {
      this.materializationInProgress = false;
    }
  }

  private get componentSchemas(): SceneComponentSchema[] {
    return this.registeredComponentSchemas;
  }

  private buildCapabilities() {
    const componentSchemas = this.registeredComponentSchemas.map((schema) => ({
      ...schema,
      schemaHash: hashSceneComponentSchema(schema),
    }));
    const snapshot: SceneCapabilitySnapshot = {
      componentSchemaHashes: Object.fromEntries(
        componentSchemas.map((schema) => [schema.id, schema.schemaHash]),
      ),
      imageBasedLightingTypes: ['room'],
      limits: {
        maxNodes: MAX_SCENE_NODES,
        maxPatternExpansion: MAX_SCENE_PATTERN_EXPANSION,
        maxResources: MAX_SCENE_RESOURCES,
      },
      nodeContentTypes: ['group', 'asset', 'instance', 'pattern'],
      patternTypes: [
        'linear',
        'grid',
        'radial',
        'along-path',
        'scatter',
        'explicit',
      ],
      sceneVersions: [CURRENT_SCENE_VERSION],
      shadowMapTypes: ['basic', 'pcf', 'pcf-soft'],
      sdkVersion: IWSDK_EDITOR_SDK_VERSION,
    };
    const capabilities = {
      schemaVersions: [CURRENT_SCENE_VERSION],
      reviewVersions: [CURRENT_SCENE_REVIEW_VERSION],
      sceneSchemaHash: sha256(canonicalizeJson(SCENE_DOCUMENT_JSON_SCHEMA)),
      reviewSchemaHash: sha256(canonicalizeJson(SCENE_REVIEW_JSON_SCHEMA)),
      ownershipModes: ['replace-new'],
      assetPolicies: ['manifest-assets'],
      nodeContentKinds: ['group', 'asset', 'instance', 'pattern'],
      resourceKinds: ['prefab'],
      imageBasedLightingKinds: ['room'],
      shadowMapKinds: ['basic', 'pcf', 'pcf-soft'],
      patternDistributionKinds: [
        'linear',
        'grid',
        'radial',
        'along-path',
        'scatter',
        'explicit',
      ],
      patternAlgorithms: ['pcg32-box-rejection-v1'],
      patchOperations: [
        'addNode',
        'removeNode',
        'moveNode',
        'renameNode',
        'updateTransform',
        'updateFramingRole',
        'updateComponent',
        'updateRootComponent',
        'reorderChildren',
        'updateContent',
        'updateConstraints',
        'setNodeMetadata',
        'setAuthoring',
        'setEnvironment',
        'addPrefab',
        'updatePrefab',
        'removePrefab',
        'addAuthoringView',
        'updateAuthoringView',
        'removeAuthoringView',
      ],
      registeredComponents: [...this.knownComponents].sort(),
      componentSchemas,
      componentSchemaHash: sha256(canonicalizeJson(componentSchemas)),
      safetyLimits: {
        maxAbsoluteCoordinate: MAX_SCENE_COORDINATE,
        maxNodes: MAX_SCENE_NODES,
        maxPatternExpansion: MAX_SCENE_PATTERN_EXPANSION,
        maxResources: MAX_SCENE_RESOURCES,
      },
      savedViewProjections: ['perspective', 'orthographic'],
      uriSchemes: ['relative', 'http', 'https'],
    };
    return {
      ...capabilities,
      capabilityHash: sha256(canonicalizeJson(snapshot)),
      snapshot,
    };
  }

  private getCapabilities(params: Record<string, unknown> = {}) {
    const full = getOptionalBoolean(params.full, 'full') ?? false;
    const capabilities = this.buildCapabilities();
    if (full) {
      return {
        ...capabilities,
        detail: 'full' as const,
      };
    }

    const { componentSchemas, ...summary } = capabilities;
    return {
      ...summary,
      componentSchemaCount: componentSchemas.length,
      detail: 'summary' as const,
      fullAvailable: true,
    };
  }

  private listAssets(params: Record<string, unknown>) {
    const query = getOptionalString(params.query)?.toLowerCase();
    const assets = [...(this.options.listAssets?.() ?? [])];
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
    const document = this.document;
    return {
      dirty: this.dirty,
      document,
      documentHash: hashSceneDocument(document),
      runtimeHash: hashRuntimeSceneDocument(document),
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

  private setFramingRole(params: Record<string, unknown>) {
    const nodeId = getRequiredString(params.nodeId, 'nodeId');
    const framingRole = getFramingRole(params.framingRole);
    this.applyPatch({ framingRole, nodeId, op: 'updateFramingRole' });
    return this.mutationResult('framingRoleUpdated', {
      framingRole,
      nodeId,
    });
  }

  private applyPatchTool(params: Record<string, unknown>) {
    const patch = getRecord(params.patch, 'patch') as unknown as ScenePatch;
    if (patch.op === 'replaceDocument' || patch.op === 'transaction') {
      throw new Error(
        `Use scene_${patch.op === 'replaceDocument' ? 'replace_document' : 'apply_transaction'} so document hashes and preflight are enforced`,
      );
    }
    this.applyPatch(patch);
    if (patch.op === 'updateComponent' || patch.op === 'updateRootComponent') {
      const validation = this.validate();
      if (!validation.valid) {
        this.history.undo();
        this.updateDirtyState();
        throw Object.assign(
          new Error(
            `Cannot apply invalid component update: ${summarizeValidationIssues(validation.issues)}`,
          ),
          { issues: validation.issues, lifecycle: validation.lifecycle },
        );
      }
    }
    if (patch.op === 'renameNode') {
      this.selection = this.selection.map((nodeId) =>
        nodeId === patch.nodeId ? patch.newNodeId : nodeId,
      );
    }
    return this.mutationResult('patchApplied', { patch });
  }

  private async applyTransaction(params: Record<string, unknown>) {
    const ownershipMode = getOwnershipMode(params.ownershipMode);
    const baseDocument = this.document;
    const baseDocumentHash = hashSceneDocument(baseDocument);
    assertExpectedBaseDocumentHash(params, baseDocument, baseDocumentHash);
    const patchValues = params.patches;
    if (!Array.isArray(patchValues) || patchValues.length === 0) {
      throw new Error('patches must be a non-empty array');
    }
    const patches = patchValues.map((value, index) => {
      const patch = getRecord(
        value,
        `patches[${index}]`,
      ) as unknown as ScenePatch;
      if (patch.op === 'replaceDocument' || patch.op === 'transaction') {
        throw new Error(
          `patches[${index}] cannot contain the control operation "${patch.op}"`,
        );
      }
      return patch;
    });
    const transaction: ScenePatch = { op: 'transaction', patches };
    const candidate = applyScenePatch(baseDocument, transaction).document;
    const candidateDocumentHash = assertCandidateDocumentHash(
      params.candidateDocumentHash,
      candidate,
    );
    const lifecycle = await this.commitStagedDocument(
      candidate,
      transaction,
      baseDocumentHash,
      {
        correction: params.correction,
        operation: 'transaction',
      },
    );
    this.updateSelectionForPatches(patches);

    return this.mutationResult('transactionApplied', {
      baseDocumentHash,
      candidateDocumentHash,
      ownershipMode,
      patchCount: patches.length,
      runtimeHash: hashRuntimeSceneDocument(candidate),
      lifecycle,
    });
  }

  private async replaceDocument(params: Record<string, unknown>) {
    const ownershipMode = getOwnershipMode(params.ownershipMode);
    const baseDocument = this.document;
    const baseDocumentHash = hashSceneDocument(baseDocument);
    assertExpectedBaseDocumentHash(params, baseDocument, baseDocumentHash);
    const rawDocument = getRecord(params.document, 'document');
    if (rawDocument.version !== CURRENT_SCENE_VERSION) {
      throw new Error(
        `scene_replace_document requires ${CURRENT_SCENE_VERSION}`,
      );
    }
    const candidate = cloneJson(rawDocument) as unknown as SceneDocument;
    const candidateDocumentHash = assertCandidateDocumentHash(
      params.candidateDocumentHash,
      candidate,
    );
    const replacement: ScenePatch = {
      document: candidate,
      op: 'replaceDocument',
    };
    const lifecycle = await this.commitStagedDocument(
      candidate,
      replacement,
      baseDocumentHash,
      { operation: 'replace-document' },
    );
    this.pruneSelectionToExistingNodes();

    return this.mutationResult('documentReplaced', {
      baseDocumentHash,
      candidateDocumentHash,
      ownershipMode,
      runtimeHash: hashRuntimeSceneDocument(candidate),
      lifecycle,
    });
  }

  private async commitStagedDocument(
    candidate: SceneDocument,
    patch: ScenePatch,
    expectedLiveHash: string,
    transition: {
      correction?: unknown;
      operation: SceneEditorDocumentTransitionRequest['operation'];
    },
  ): Promise<SceneEditorLifecycleReport> {
    const validation = this.validate(candidate);
    if (!validation.valid) {
      const issueSummary = summarizeValidationIssues(validation.issues);
      throw Object.assign(
        new Error(`Cannot commit invalid scene: ${issueSummary}`),
        { issues: validation.issues, lifecycle: validation.lifecycle },
      );
    }
    if (this.materializationInProgress) {
      throw new Error('Another scene materialization is already in progress');
    }
    this.materializationInProgress = true;
    const previousDocument = this.document;
    const lifecycle = { ...validation.lifecycle };
    let editorAttempted = false;
    let transitionAuthorized = false;
    try {
      if (this.options.preloadDocumentResources != null) {
        try {
          await this.options.preloadDocumentResources(cloneJson(candidate));
          lifecycle.resourcesReady = 'passed';
        } catch (error) {
          lifecycle.resourcesReady = 'failed';
          throw error;
        }
      }
      if (this.options.instantiateDocumentPreview != null) {
        editorAttempted = true;
        try {
          await this.options.instantiateDocumentPreview(cloneJson(candidate));
        } catch (error) {
          lifecycle.editorCommitted = 'failed';
          throw error;
        }
      }
      if (this.options.authorizeDocumentTransition != null) {
        await this.options.authorizeDocumentTransition({
          candidate: cloneJson(candidate),
          correction: transition.correction,
          expectedBaseDocumentHash: expectedLiveHash as Sha256,
          operation: transition.operation,
          patch: cloneJson(patch),
          previousDocument: cloneJson(previousDocument),
        });
        transitionAuthorized = true;
      }
      assertLiveDocumentHash(this.document, expectedLiveHash);
      if (this.options.commitDocument != null) {
        editorAttempted = true;
        try {
          await this.options.commitDocument(cloneJson(candidate));
        } catch (error) {
          lifecycle.editorCommitted = 'failed';
          throw error;
        }
      }
      assertLiveDocumentHash(this.document, expectedLiveHash);
      this.history.replace(candidate);
      if (this.options.commitDocument != null) {
        lifecycle.editorCommitted = 'passed';
      }
      this.updateDirtyState();
      this.log('info', `Committed staged scene patch ${patch.op}`);
      return lifecycle;
    } catch (error) {
      if (editorAttempted && lifecycle.editorCommitted !== 'passed') {
        lifecycle.editorCommitted = 'failed';
      }
      if (transitionAuthorized) {
        try {
          await this.options.discardDocumentTransition?.();
        } catch (discardError) {
          this.log(
            'error',
            `Scene transition discard failed: ${errorMessage(discardError)}`,
          );
        }
      }
      try {
        await this.options.rollbackDocument?.(
          cloneJson(candidate),
          cloneJson(previousDocument),
        );
      } catch (rollbackError) {
        this.log(
          'error',
          `Scene materialization rollback failed: ${errorMessage(rollbackError)}`,
        );
      }
      throw attachLifecycleReport(error, lifecycle);
    } finally {
      this.materializationInProgress = false;
    }
  }

  private updateSelectionForPatches(patches: readonly ScenePatch[]) {
    for (const patch of patches) {
      if (patch.op === 'renameNode') {
        this.selection = this.selection.map((nodeId) =>
          nodeId === patch.nodeId ? patch.newNodeId : nodeId,
        );
      }
    }
    this.pruneSelectionToExistingNodes();
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

  private validate(document: SceneDocument = this.document) {
    const validationOptions = {
      ...(this.componentCatalog == null
        ? {}
        : { componentCatalog: this.componentCatalog }),
      validateAuthoringWorkflow: false,
    };
    const base = validateSceneDocument(document, validationOptions);
    const schemaIssues: SceneEditorValidationIssue[] = [
      ...enrichBaseValidationIssues(document, base.issues),
    ];
    const capabilitySnapshot = this.buildCapabilities().snapshot;
    const capabilityIssues: SceneEditorValidationIssue[] = base.valid
      ? [
          ...validateSceneCapabilities(
            document,
            capabilitySnapshot,
            validationOptions,
          ).issues,
          ...(this.componentCatalog == null
            ? validateComponentTypes(document, this.knownComponents)
            : []),
        ]
      : [];
    const semanticIssues = base.valid
      ? [
          ...(this.options.listAssets == null
            ? []
            : validateManifestAssetReferences(
                document,
                this.options.listAssets(),
              )),
        ]
      : [];
    const issues: SceneEditorValidationIssue[] = [
      ...schemaIssues,
      ...capabilityIssues,
      ...semanticIssues,
    ];
    const lifecycle: SceneEditorLifecycleReport = {
      schemaValid: schemaIssues.length === 0 ? 'passed' : 'failed',
      capabilityCompatible: base.valid
        ? capabilityIssues.length === 0
          ? 'passed'
          : 'failed'
        : 'not-run',
      resourcesReady: 'not-run',
      editorCommitted: 'not-run',
      runtimeProven: 'not-run',
    };
    return {
      valid: issues.length === 0,
      issues,
      lifecycle,
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
      ...result,
      dirty: this.dirty,
      documentHash: hashSceneDocument(document),
      lifecycle: validation.lifecycle,
      runtimeHash: hashRuntimeSceneDocument(document),
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
    this.camera = resolveCamera(
      params,
      this.camera,
      this.document.authoring?.views,
    );
    this.log('info', `Camera set to ${this.camera.view}`);
    return {
      camera: this.camera,
    };
  }

  private async screenshot(params: Record<string, unknown>) {
    this.camera = resolveCamera(
      params,
      this.camera,
      this.document.authoring?.views,
    );
    return this.captureScreenshot(this.camera, {
      captureMode: getCaptureMode(params.captureMode),
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
    const firstCamera = resolveCamera(
      firstParams,
      this.camera,
      this.document.authoring?.views,
    );
    const secondCamera = resolveCamera(
      secondParams,
      firstCamera,
      this.document.authoring?.views,
    );
    const first = await this.captureScreenshot(firstCamera, {
      ...size,
      captureMode: getCaptureMode(firstParams.captureMode),
    });
    const second = await this.captureScreenshot(secondCamera, {
      ...size,
      captureMode: getCaptureMode(secondParams.captureMode),
    });
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

  private async setReviewLens(params: Record<string, unknown>) {
    const lens = getReviewLens(params.lens);
    await this.options.setReviewLens?.(lens);
    this.reviewLens = lens;
    this.log('info', `Review lens set to ${lens}`);
    return {
      lens,
      documentHash: hashSceneDocument(this.document),
      runtimeHash: hashRuntimeSceneDocument(this.document),
    };
  }

  private async captureReview(params: Record<string, unknown>) {
    const includeImageData =
      getOptionalBoolean(params.includeImageData, 'includeImageData') ?? false;
    if (this.reviewLens === 'layout') {
      const layoutVisibilityIssues = this.validate().issues.filter(
        (issue) => issue.code === 'review-visibility',
      );
      if (layoutVisibilityIssues.length > 0) {
        const issueSummary = summarizeValidationIssues(layoutVisibilityIssues);
        throw Object.assign(
          new Error(`Cannot capture layout review: ${issueSummary}`),
          { issues: layoutVisibilityIssues },
        );
      }
    }
    const width = getRequiredPositiveInteger(params.width, 'width');
    const height = getRequiredPositiveInteger(params.height, 'height');
    const camera = resolveCamera(
      params,
      this.camera,
      this.document.authoring?.views,
    );
    const documentHash = hashSceneDocument(this.document);
    const runtimeHash = hashRuntimeSceneDocument(this.document);
    const capabilities = this.buildCapabilities();
    const screenshot = await this.captureScreenshot(camera, {
      captureMode: 'render',
      height,
      width,
    });
    const renderStats =
      screenshot.renderStats == null
        ? await this.getRenderStats()
        : cloneRenderStatsSnapshot(screenshot.renderStats);
    const currentDocumentHash = hashSceneDocument(this.document);
    const currentRuntimeHash = hashRuntimeSceneDocument(this.document);
    const currentCapabilityHash = this.buildCapabilities().capabilityHash;
    if (
      currentDocumentHash !== documentHash ||
      currentRuntimeHash !== runtimeHash ||
      currentCapabilityHash !== capabilities.capabilityHash
    ) {
      throw new Error(
        'Scene document or capabilities changed while review capture was in progress; retry the capture',
      );
    }
    const featureState =
      params.featureState == null
        ? {}
        : getRecord(params.featureState, 'featureState');
    const screenshotSha256 =
      screenshot.screenshotSha256 == null
        ? null
        : getSha256(screenshot.screenshotSha256, 'screenshotSha256');
    this.camera = camera;

    let captureToken: string = sha256(
      canonicalizeJson({
        capabilityHash: capabilities.capabilityHash,
        documentHash,
        runtimeHash,
        sessionNonce: this.reviewCaptureSessionNonce,
        screenshotSha256,
        sequence: ++this.reviewCaptureSequence,
      }),
    );
    const capture: Record<string, unknown> = {
      capabilityHash: capabilities.capabilityHash,
      camera: screenshot.camera,
      captureToken,
      documentHash,
      featureState,
      height: screenshot.height ?? height,
      imageData: screenshot.imageData,
      lens: this.reviewLens,
      logs: [...this.logs],
      mimeType: screenshot.mimeType,
      renderStats,
      rendererEnvironment:
        screenshot.rendererEnvironment ??
        (renderStats.available ? renderStats.environment : null),
      reviewCamera: cameraAsReviewCamera(screenshot.camera),
      runtimeHash,
      screenshotHashAvailable: screenshotSha256 != null,
      screenshotSha256,
      visibilityAvailable: screenshot.visibleNodeIds != null,
      visibleNodeIds: screenshot.visibleNodeIds ?? null,
      nodeMaskRegions: screenshot.nodeMaskRegions ?? null,
      width: screenshot.width ?? width,
    };
    if (this.options.registerReviewCapture != null) {
      const registration = await this.options.registerReviewCapture(
        cloneJson(capture),
      );
      captureToken = getSha256(
        registration.captureToken,
        'registered captureToken',
      );
      capture.captureToken = captureToken;
    }
    this.pendingReviewCaptures.set(captureToken, cloneJson(capture));
    if (includeImageData) {
      return capture;
    }
    const { imageData: _imageData, ...metadata } = capture;
    return metadata;
  }

  private async getRenderStats(): Promise<
    SceneEditorRenderStats | SceneEditorUnavailableRenderStats
  > {
    if (this.options.renderStats == null) {
      return {
        available: false,
        reason:
          'The editor runtime has not registered a renderer statistics bridge.',
      };
    }
    const stats = await this.options.renderStats();
    assertRenderStats(stats);
    return cloneJson(stats);
  }

  private async captureScreenshot(
    camera: SceneEditorCameraState,
    options: SceneEditorScreenshotOptions,
  ) {
    if (this.options.screenshot == null) {
      throw new Error(
        'Scene editor was not configured with a screenshot handler',
      );
    }
    return this.options.screenshot(camera, options);
  }

  private applyPatch(patch: ScenePatch) {
    this.history.apply(patch);
    this.updateDirtyState();
    this.log('info', `Applied scene patch ${patch.op}`);
  }

  private updateDirtyState() {
    const documentHash = hashSceneDocument(this.document);
    const runtimeHash = hashRuntimeSceneDocument(this.document);
    for (const [captureToken, capture] of this.pendingReviewCaptures) {
      if (
        capture.documentHash !== documentHash ||
        capture.runtimeHash !== runtimeHash
      ) {
        this.pendingReviewCaptures.delete(captureToken);
      }
    }
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
    const document = this.document;
    return {
      action,
      dirty: this.dirty,
      documentHash: hashSceneDocument(document),
      runtimeHash: hashRuntimeSceneDocument(document),
      selection: [...this.selection],
      valid: validation.valid,
      issues: validation.issues,
      lifecycle: validation.lifecycle,
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
  const content = node.content;
  return {
    id: node.id,
    name: node.name,
    contentType: content?.type,
    ...(content?.type === 'asset' ? { asset: content.asset } : {}),
    ...(content?.type === 'instance' || content?.type === 'pattern'
      ? { prefab: content.prefab }
      : {}),
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

function attachLifecycleReport(
  value: unknown,
  lifecycle: SceneEditorLifecycleReport,
): Error & { lifecycle: SceneEditorLifecycleReport } {
  const error = value instanceof Error ? value : new Error(String(value));
  return Object.assign(error, { lifecycle: { ...lifecycle } });
}

function cameraAsReviewCamera(camera: SceneEditorCameraState) {
  const shared = {
    position: [...camera.position] as Vec3,
    projection: camera.projection,
    target: [...camera.lookAt] as Vec3,
  };
  if (camera.projection === 'orthographic') {
    return {
      ...shared,
      height: camera.height ?? 10,
      projection: 'orthographic' as const,
    };
  }
  return {
    ...shared,
    fov: camera.fov,
    projection: 'perspective' as const,
  };
}

function resolveCamera(
  params: Record<string, unknown>,
  current: SceneEditorCameraState,
  savedViews: readonly SceneAuthoringView[] | undefined,
): SceneEditorCameraState {
  const viewId = getOptionalString(params.viewId);
  if (viewId != null) {
    const savedView = savedViews?.find((view) => view.id === viewId);
    if (savedView == null) {
      throw new Error(`Saved authoring view "${viewId}" does not exist`);
    }
    return savedAuthoringViewCamera(savedView, current.fov);
  }

  const explicitPosition =
    params.position == null ? undefined : getVec3(params.position, 'position');
  const explicitLookAt =
    params.lookAt == null ? undefined : getVec3(params.lookAt, 'lookAt');
  const fov = getOptionalNumber(params.fov) ?? current.fov;
  const projection =
    getCameraProjection(params.projection) ?? current.projection;
  const orthographicHeight = getOptionalNumber(params.orthographicHeight);
  if (orthographicHeight != null && orthographicHeight <= 0) {
    throw new Error('orthographicHeight must be greater than 0');
  }

  if (
    explicitPosition != null ||
    explicitLookAt != null ||
    params.projection != null ||
    orthographicHeight != null
  ) {
    return cameraWithProjection(
      {
        fov,
        lookAt: explicitLookAt ?? current.lookAt,
        position: explicitPosition ?? current.position,
        projection,
        view: 'custom',
      },
      projection,
      orthographicHeight ?? current.height,
    );
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
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [0, 8, 0],
        projection: 'perspective',
        view,
      };
    case 'front':
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [0, 2, 8],
        projection: 'perspective',
        view,
      };
    case 'back':
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [0, 2, -8],
        projection: 'perspective',
        view,
      };
    case 'left':
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [-8, 2, 0],
        projection: 'perspective',
        view,
      };
    case 'right':
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [8, 2, 0],
        projection: 'perspective',
        view,
      };
    case 'quarter':
      return {
        fov: 50,
        lookAt: [0, 0, 0],
        position: [4, 3, 4],
        projection: 'perspective',
        view,
      };
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
    projection: 'perspective',
    view: 'orbit',
  };
}

function savedAuthoringViewCamera(
  view: SceneAuthoringView,
  fallbackFov: number,
): SceneEditorCameraState {
  const base = {
    fov: view.projection === 'perspective' ? view.fov : fallbackFov,
    lookAt: [...view.target] as Vec3,
    position: [...view.position] as Vec3,
    projection: view.projection,
    view: 'custom' as const,
    viewId: view.id,
  };
  return view.projection === 'orthographic'
    ? { ...base, height: view.height }
    : base;
}

function cameraWithProjection(
  camera: SceneEditorCameraState,
  projection: SceneEditorCameraState['projection'],
  height: number | undefined,
): SceneEditorCameraState {
  if (projection === 'orthographic') {
    return { ...camera, height: height ?? 10, projection };
  }
  const { height: _height, viewId: _viewId, ...perspective } = camera;
  return { ...perspective, projection };
}

function getCameraProjection(
  value: unknown,
): SceneEditorCameraState['projection'] | undefined {
  const projection = getOptionalString(value);
  if (projection == null) {
    return undefined;
  }
  if (projection !== 'perspective' && projection !== 'orthographic') {
    throw new Error('projection must be perspective or orthographic');
  }
  return projection;
}

function roundCameraNumber(value: number): number {
  return Number(value.toFixed(4));
}

function enrichBaseValidationIssues(
  document: SceneDocument,
  issues: ValidationIssue[],
): SceneEditorValidationIssue[] {
  const nodePathToId = collectNodePathIds(document);
  return issues.map((issue) => {
    const annotationMatch = /^\$\.authoring\.nodeAnnotations\[(\d+)\]/.exec(
      issue.path,
    );
    const annotationNodeId =
      annotationMatch == null
        ? undefined
        : document.authoring?.nodeAnnotations?.[Number(annotationMatch[1])]
            ?.node;
    return {
      ...issue,
      ...nodeMetadataForPath(nodePathToId, issue.path),
      ...(annotationNodeId == null ? {} : { nodeId: annotationNodeId }),
      suggestedFix: suggestFixForIssue(issue),
    };
  });
}

function validateManifestAssetReferences(
  document: SceneDocument,
  assets: readonly SceneEditorAssetInfo[],
): SceneEditorValidationIssue[] {
  const known = new Set(assets.map((asset) => asset.id));
  const issues: SceneEditorValidationIssue[] = [];
  const visit = (nodes: readonly SceneNode[], path: string) => {
    nodes.forEach((node, index) => {
      const nodePath = `${path}[${index}]`;
      if (node.content?.type === 'asset' && !known.has(node.content.asset)) {
        issues.push({
          code: 'reference',
          message: `unknown manifest asset "${node.content.asset}"`,
          nodeId: node.id,
          path: `${nodePath}.content.asset`,
          suggestedFix:
            'Register the asset in the project asset manifest or choose a registered asset.',
        });
      }
      visit(node.children ?? [], `${nodePath}.children`);
    });
  };
  visit(document.nodes, '$.nodes');
  document.resources.prefabs?.forEach((prefab, index) =>
    visit([prefab.root], `$.resources.prefabs[${index}].root`),
  );
  return issues;
}

function validateComponentTypes(
  document: SceneDocument,
  knownComponents: Set<string>,
): SceneEditorValidationIssue[] {
  const issues: SceneEditorValidationIssue[] = [];

  const validateOwner = (
    components: SceneDocument['components'],
    path: string,
    owner: string,
    nodeId?: string,
  ) => {
    for (const componentName of Object.keys(components ?? {})) {
      const componentId = normalizeComponentId(
        stripComponentPrefix(componentName),
      );
      if (!knownComponents.has(componentId)) {
        issues.push({
          message: `${owner} references unknown component "${componentName}"`,
          ...(nodeId == null ? {} : { nodeId }),
          path: `${path}[${JSON.stringify(componentName)}]`,
          suggestedFix: `Register "${componentId}" as an app-specific component for the editor session or remove/rename the component payload.`,
        });
      }
    }
  };

  validateOwner(document.components, '$.components', 'scene root');

  visitNodes(document.nodes, (node, path) => {
    if (node.components == null || hasAllowUnknownComponentsFlag(node)) {
      return;
    }
    validateOwner(
      node.components,
      `${path}.components`,
      `node "${node.id}"`,
      node.id,
    );
  });

  return issues;
}

function isPlainEditorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
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
  if (issue.code === 'review-visibility') {
    return 'Add a manifest asset that resolves to the layout layer, or move the layout annotation to a subtree with visible renderable content.';
  }
  if (
    issue.path.endsWith('.content.asset') &&
    issue.message.includes('unknown asset')
  ) {
    return 'Call scene_list_assets, then update the node to a registered manifest asset id.';
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
    const missingComponent = issue.message.match(
      /component "([^"]+)" is not present in the active component catalog/u,
    )?.[1];
    if (missingComponent != null) {
      return `Register "${missingComponent}" in the application component manifest or remove/rename the component payload.`;
    }
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
  return hasUnknownComponentFlag(node.metadata?.['iwsdk.validation']);
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

function getOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
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

function getReviewLens(value: unknown): SceneEditorReviewLens {
  if (value === 'layout' || value === 'geometry' || value === 'final') {
    return value;
  }
  throw new Error('lens must be one of layout, geometry, final');
}

function getCaptureMode(value: unknown): SceneEditorCaptureMode {
  if (value == null || value === 'render') {
    return 'render';
  }
  if (value === 'editor') {
    return 'editor';
  }
  throw new Error('captureMode must be one of render, editor');
}

function getOwnershipMode(value: unknown): 'replace-new' {
  if (value == null || value === 'replace-new') {
    return 'replace-new';
  }
  throw new Error(
    'ownershipMode must be "replace-new"; merge-under-root is not supported',
  );
}

function assertExpectedBaseDocumentHash(
  params: Record<string, unknown>,
  document: SceneDocument,
  actualHash: string,
) {
  if (
    !Object.prototype.hasOwnProperty.call(params, 'expectedBaseDocumentHash')
  ) {
    throw new Error('expectedBaseDocumentHash is required');
  }
  const expected = params.expectedBaseDocumentHash;
  if (expected === null) {
    if (!isBlankSceneDocument(document)) {
      throw new Error(
        `expectedBaseDocumentHash is null but the live document is not blank (${actualHash})`,
      );
    }
    return;
  }
  const expectedHash = getSha256(expected, 'expectedBaseDocumentHash');
  if (expectedHash !== actualHash) {
    throw new Error(
      `Scene document changed: expected ${expectedHash}, received ${actualHash}`,
    );
  }
}

function assertCandidateDocumentHash(
  value: unknown,
  candidate: SceneDocument,
): string {
  const actualHash = hashSceneDocument(candidate);
  if (value === undefined) {
    return actualHash;
  }
  const suppliedHash = getSha256(value, 'candidateDocumentHash');
  if (suppliedHash !== actualHash) {
    throw new Error(
      `Candidate document hash mismatch: supplied ${suppliedHash}, computed ${actualHash}`,
    );
  }
  return actualHash;
}

function assertLiveDocumentHash(document: SceneDocument, expectedHash: string) {
  const actualHash = hashSceneDocument(document);
  if (actualHash !== expectedHash) {
    throw new Error(
      `Scene document changed during materialization: expected ${expectedHash}, received ${actualHash}`,
    );
  }
}

function getSha256(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${fieldName} must be a sha256:<64 lowercase hex> hash`);
  }
  return value;
}

function isBlankSceneDocument(document: SceneDocument): boolean {
  return (
    document.nodes.length === 0 &&
    (document.resources.prefabs?.length ?? 0) === 0 &&
    document.environment == null
  );
}

function createReviewCaptureSessionNonce(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return [...bytes]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256(
    canonicalizeJson({ createdAt: Date.now(), random: Math.random() }),
  );
}

function getRequiredPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value as number;
}

function assertRenderStats(
  value: SceneEditorRenderStats,
): asserts value is SceneEditorRenderStats {
  const counters: (keyof SceneEditorRenderStats)[] = [
    'calls',
    'triangles',
    'points',
    'lines',
    'textures',
    'programs',
    'shadowCasters',
    'objectCount',
    'nodeCount',
    'meshCount',
    'geometryCount',
    'materialCount',
  ];
  if (value?.available !== true) {
    throw new Error('Renderer statistics bridge returned unavailable data');
  }
  for (const counter of counters) {
    const entry = value[counter];
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0) {
      throw new Error(`Renderer statistic ${counter} must be a finite number`);
    }
  }
  if (
    !Array.isArray(value.frameTimeSamplesMs) ||
    value.frameTimeSamplesMs.some(
      (entry) =>
        typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0,
    )
  ) {
    throw new Error(
      'Renderer statistic frameTimeSamplesMs must contain finite non-negative numbers',
    );
  }
  if (!isPlainEditorRecord(value.environment)) {
    throw new Error('Renderer statistic environment must be an object');
  }
  if (
    !Array.isArray(value.visibleNodeIds) ||
    value.visibleNodeIds.some((nodeId) => typeof nodeId !== 'string')
  ) {
    throw new Error('Renderer statistic visibleNodeIds must be string ids');
  }
  if (value.worldBounds != null) {
    if (!isPlainEditorRecord(value.worldBounds)) {
      throw new Error(
        'Renderer statistic worldBounds must be an object or null',
      );
    }
    getVec3(value.worldBounds.min, 'worldBounds.min');
    getVec3(value.worldBounds.max, 'worldBounds.max');
    const size = getVec3(value.worldBounds.size, 'worldBounds.size');
    if (size.some((entry) => entry < 0)) {
      throw new Error(
        'Renderer statistic worldBounds.size must be non-negative',
      );
    }
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'framingBounds')) {
    throw new Error(
      'Renderer statistic framingBounds must be an object or null',
    );
  }
  if (value.framingBounds != null) {
    if (!isPlainEditorRecord(value.framingBounds)) {
      throw new Error(
        'Renderer statistic framingBounds must be an object or null',
      );
    }
    getVec3(value.framingBounds.min, 'framingBounds.min');
    getVec3(value.framingBounds.max, 'framingBounds.max');
    const size = getVec3(value.framingBounds.size, 'framingBounds.size');
    if (size.some((entry) => entry < 0)) {
      throw new Error(
        'Renderer statistic framingBounds.size must be non-negative',
      );
    }
  }
}

function cloneRenderStatsSnapshot(
  value: SceneEditorRenderStats | SceneEditorUnavailableRenderStats,
): SceneEditorRenderStats | SceneEditorUnavailableRenderStats {
  if (value?.available === true) {
    assertRenderStats(value);
  } else if (
    value?.available !== false ||
    typeof value.reason !== 'string' ||
    value.reason.length === 0
  ) {
    throw new Error(
      'Screenshot renderer statistics must be available metrics or an unavailable reason',
    );
  }
  return cloneJson(value);
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

function getFramingRole(value: unknown): SceneNodeFramingRole {
  if (value === 'content' || value === 'support') {
    return value;
  }
  throw new Error('framingRole must be "content" or "support"');
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
