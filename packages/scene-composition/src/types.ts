/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const CURRENT_SCENE_VERSION = 'iwsdk.scene.v1' as const;
export const CURRENT_SCENE_REVIEW_VERSION = 'iwsdk.scene-review.v1' as const;
export const MAX_SCENE_CORRECTION_ROUNDS = 10;
export const SCENE_PROCEDURAL_TEXTURE_RESOLUTIONS = [
  64, 128, 256, 512, 1024, 2048,
] as const;
export const MAX_SCENE_PROCEDURAL_TEXTURE_DIMENSION = 2048;
export const MAX_SCENE_PROCEDURAL_TEXTURE_TEXELS = 16_777_216;
export const MAX_SCENE_PROCEDURAL_TEXTURE_SAMPLES = 67_108_864;
export const SCENE_IMPORT_ID_PATTERN = '^[A-Za-z][A-Za-z0-9_-]*$';

export type SceneDocumentVersion = typeof CURRENT_SCENE_VERSION;
export type SceneReviewVersion = typeof CURRENT_SCENE_REVIEW_VERSION;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type SceneScale = number | Vec3;
export type SceneAxis = 'x' | 'y' | 'z';
export type SceneAlignment = 'min' | 'center' | 'max';
export type SceneColor = `#${string}`;
export type Sha256 = `sha256:${string}`;

export interface SceneSnapOptions {
  gridSize?: number | Vec3;
  axes?: SceneAxis[];
  origin?: Vec3;
}

export interface SceneAlignOptions {
  axis: SceneAxis;
  edge?: SceneAlignment;
  targetEdge?: SceneAlignment;
  targetNodeId?: string;
  targetValue?: number;
}

export interface SceneBounds {
  min: Vec3;
  max: Vec3;
}

export type SceneComponentFieldType =
  | 'Int8'
  | 'Int16'
  | 'Int32'
  | 'Entity'
  | 'Float32'
  | 'Float64'
  | 'Boolean'
  | 'String'
  | 'FilePath'
  | 'Object'
  | 'Vec2'
  | 'Vec3'
  | 'Vec4'
  | 'Color'
  | 'Enum';

export interface SceneComponentFieldSchema {
  type: SceneComponentFieldType;
  default?: JsonValue;
  description?: string;
  label?: string;
  help?: string;
  widget?: 'slider' | 'color' | 'vector' | 'text' | 'select' | 'entity';
  required?: boolean;
  step?: number;
  enum?: Record<string, string>;
  fileTypes?: string;
  subfolder?: string;
  min?: number;
  max?: number;
  hidden?: boolean;
}

export interface SceneComponentSchema {
  id: string;
  name?: string;
  description?: string;
  fields: Record<string, SceneComponentFieldSchema>;
  source?: 'iwsdk' | 'app' | 'scene';
  editor?: {
    hidden?: boolean;
    intrinsic?: boolean;
  };
}

/** Application-owned component schemas supplied separately from scene JSON. */
export type SceneComponentCatalog = Readonly<
  Record<string, SceneComponentSchema>
>;

/** Serialized component properties. The component ID is the containing key. */
export type SceneComponentValue = JsonObject;

export interface SceneTransform {
  position?: Vec3;
  rotationDeg?: Vec3;
  scale?: SceneScale;
}

/** A reusable scene module mounted below a deterministic namespace. */
export interface SceneImport {
  id: string;
  src: string;
  transform?: SceneTransform;
}

export interface SceneLookAtConstraint {
  target: Vec3;
  mode: 'yaw-v1';
}

export interface SceneNodeConstraints {
  lookAt?: SceneLookAtConstraint;
}

export type SceneMaterialSide = 'front' | 'back' | 'double';

export type SceneProceduralTextureAlgorithm = 'periodic-fbm-v1';
export type SceneProceduralTextureWrap = 'clamp' | 'mirror' | 'repeat';

export interface SceneProceduralTextureBand {
  frequency: [number, number];
  amplitude: number;
}

export interface SceneProceduralTextureSampler {
  wrapU?: SceneProceduralTextureWrap;
  wrapV?: SceneProceduralTextureWrap;
  repeat?: Vec2;
  offset?: Vec2;
  rotationDeg?: number;
  anisotropy?: number;
}

interface SceneProceduralTextureBase {
  type: 'procedural';
  algorithm: SceneProceduralTextureAlgorithm;
  resolution: [number, number];
  seed: number;
  bands: SceneProceduralTextureBand[];
  contrast?: number;
  bias?: number;
  sampler?: SceneProceduralTextureSampler;
}

export interface SceneProceduralColorStop {
  at: number;
  color: SceneColor;
}

export interface SceneProceduralAlbedoTexture
  extends SceneProceduralTextureBase {
  ramp: SceneProceduralColorStop[];
}

export interface SceneProceduralScalarTexture
  extends SceneProceduralTextureBase {
  range: Vec2;
}

export interface SceneProceduralNormalTexture
  extends SceneProceduralTextureBase {
  scale?: Vec2;
}

export interface SceneProceduralBumpTexture extends SceneProceduralTextureBase {
  range?: Vec2;
  scale: number;
}

export interface SceneMaterialTextures {
  albedo?: SceneProceduralAlbedoTexture;
  emissive?: SceneProceduralAlbedoTexture;
  roughness?: SceneProceduralScalarTexture;
  metalness?: SceneProceduralScalarTexture;
  ambientOcclusion?: SceneProceduralScalarTexture;
  alpha?: SceneProceduralScalarTexture;
  normal?: SceneProceduralNormalTexture;
  bump?: SceneProceduralBumpTexture;
}

interface SceneMaterialBase {
  id: string;
  baseColor?: SceneColor;
  opacity?: number;
  emissive?: SceneColor;
  emissiveIntensity?: number;
  side?: SceneMaterialSide;
  flatShading?: boolean;
}

interface ScenePbrMaterialBase extends SceneMaterialBase {
  roughness?: number;
  metalness?: number;
  textures?: SceneMaterialTextures;
}

export interface SceneStandardMaterial extends ScenePbrMaterialBase {
  model: 'standard';
}

export interface ScenePhysicalMaterial extends ScenePbrMaterialBase {
  model: 'physical';
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  envMapIntensity?: number;
  sheen?: number;
  sheenColor?: SceneColor;
  sheenRoughness?: number;
  transmission?: number;
  thickness?: number;
  attenuationColor?: SceneColor;
  attenuationDistance?: number;
  specularIntensity?: number;
  specularColor?: SceneColor;
  anisotropy?: number;
  anisotropyRotationDeg?: number;
}

export interface SceneBasicMaterial extends SceneMaterialBase {
  model: 'basic';
}

export type SceneMaterial =
  | SceneStandardMaterial
  | ScenePhysicalMaterial
  | SceneBasicMaterial;

export interface SceneBoxGeometry {
  type: 'box';
  size: Vec3;
}

export interface SceneSphereGeometry {
  type: 'sphere';
  radius: number;
  segments?: number;
}

export interface SceneUniformCylinderGeometry {
  type: 'cylinder';
  radius: number;
  height: number;
  segments?: number;
}

export interface SceneTaperedCylinderGeometry {
  type: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
  segments?: number;
}

export type SceneCylinderGeometry =
  | SceneUniformCylinderGeometry
  | SceneTaperedCylinderGeometry;

export interface SceneConeGeometry {
  type: 'cone';
  radius: number;
  height: number;
  segments?: number;
}

export interface ScenePlaneGeometry {
  type: 'plane';
  size: Vec2;
}

export interface SceneCapsuleGeometry {
  type: 'capsule';
  radius: number;
  length: number;
  capSegments?: number;
  radialSegments?: number;
}

export interface SceneExtrudeBevel {
  enabled: boolean;
  size: number;
  thickness: number;
  segments?: number;
}

export interface SceneExtrudeGeometry {
  type: 'extrude';
  points: Vec2[];
  holes?: Vec2[][];
  depth: number;
  bevel?: SceneExtrudeBevel;
}

export interface SceneTubeGeometry {
  type: 'tube';
  points: Vec3[];
  radius: number;
  radialSegments?: number;
  tubularSegments?: number;
  closed?: boolean;
}

export interface SceneLatheGeometry {
  type: 'lathe';
  profile: Vec2[];
  segments?: number;
  phiStartDeg?: number;
  phiLengthDeg?: number;
}

export interface SceneTorusGeometry {
  type: 'torus';
  radius: number;
  tube: number;
  radialSegments?: number;
  tubularSegments?: number;
  arcDeg?: number;
}

export interface SceneRoundedBoxGeometry {
  type: 'roundedBox';
  size: Vec3;
  radius: number;
  segments?: number;
}

export type SceneGeometry =
  | SceneBoxGeometry
  | SceneSphereGeometry
  | SceneCylinderGeometry
  | SceneConeGeometry
  | ScenePlaneGeometry
  | SceneCapsuleGeometry
  | SceneExtrudeGeometry
  | SceneTubeGeometry
  | SceneLatheGeometry
  | SceneTorusGeometry
  | SceneRoundedBoxGeometry;

export interface SceneGroupContent {
  type: 'group';
}

export interface SceneAssetContent {
  type: 'asset';
  asset: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface ScenePrefabNodeOverride {
  transform?: SceneTransform;
  components?: Record<string, SceneComponentValue>;
  visible?: boolean;
}

export interface SceneInstanceContent {
  type: 'instance';
  prefab: string;
  overrides?: Record<string, ScenePrefabNodeOverride>;
}

export interface ScenePatternVariation {
  scale?: [number, number];
  yawDeg?: [number, number];
  positionJitter?: Vec3;
}

export interface SceneLinearDistribution {
  type: 'linear';
  count: number;
  step: Vec3;
  variation?: ScenePatternVariation;
}

export interface SceneGridDistribution {
  type: 'grid';
  count: [number, number, number];
  spacing: Vec3;
  variation?: ScenePatternVariation;
}

export interface SceneRadialDistribution {
  type: 'radial';
  count: number;
  radius: number;
  startAngleDeg?: number;
  arcDeg?: number;
  faceCenter?: boolean;
  variation?: ScenePatternVariation;
}

export interface SceneAlongPathDistribution {
  type: 'along-path';
  points: Vec3[];
  count: number;
  orientToPath?: boolean;
  variation?: ScenePatternVariation;
}

export interface SceneScatterBoxRegion {
  type: 'box';
  size: Vec3;
}

export interface SceneScatterSphereRegion {
  type: 'sphere';
  radius: number;
}

export interface SceneScatterDistribution {
  type: 'scatter';
  count: number;
  seed: number;
  algorithm: 'pcg32-box-rejection-v1';
  collision: 'allow' | 'skip';
  region: SceneScatterBoxRegion | SceneScatterSphereRegion;
  variation?: ScenePatternVariation;
}

export interface SceneExplicitDistribution {
  type: 'explicit';
  transforms: SceneTransform[];
}

export type ScenePatternDistribution =
  | SceneLinearDistribution
  | SceneGridDistribution
  | SceneRadialDistribution
  | SceneAlongPathDistribution
  | SceneScatterDistribution
  | SceneExplicitDistribution;

export interface ScenePatternContent {
  type: 'pattern';
  prefab: string;
  distribution: ScenePatternDistribution;
  overrides?: Record<string, ScenePrefabNodeOverride>;
}

export type SceneNodeContent =
  | SceneGroupContent
  | SceneAssetContent
  | SceneInstanceContent
  | ScenePatternContent;

export type SceneNodeFramingRole = 'content' | 'support';

/** Persistent player-rig space used as the parent of a top-level scene node. */
export interface ScenePlayerSpaceParent {
  type: 'player-space';
  target: ScenePlayerTarget;
}

export interface SceneNode {
  id: string;
  name?: string;
  /** Authored runtime visibility. Omitted means visible. */
  visible?: boolean;
  /** Camera framing includes content by default and excludes support nodes. */
  framingRole?: SceneNodeFramingRole;
  content?: SceneNodeContent;
  transform?: SceneTransform;
  constraints?: SceneNodeConstraints;
  components?: Record<string, SceneComponentValue>;
  children?: SceneNode[];
  metadata?: JsonObject;
  /** Optional persistent player-space parent. Only valid on top-level nodes. */
  parent?: ScenePlayerSpaceParent;
}

export interface ScenePrefab {
  id: string;
  root: SceneNode;
}

export interface SceneResources {
  prefabs?: ScenePrefab[];
}

export type ScenePlayerTarget =
  | 'player'
  | 'camera'
  | 'head'
  | 'left-target-ray'
  | 'right-target-ray'
  | 'left-grip'
  | 'right-grip';

/** Stable authored reference to an ECS entity in or around a scene. */
export type SceneEntityReference =
  | { type: 'node'; id: string }
  | ScenePlayerSpaceParent
  | { type: 'level-root' };

export interface SceneBuiltinEntity {
  components?: Record<string, SceneComponentValue>;
  /** @deprecated Tracked-space transforms are retained for file compatibility but ignored. */
  transform?: SceneTransform;
}

/** Components authored onto persistent runtime player-rig entities. */
export interface ScenePlayerRig extends SceneBuiltinEntity {
  /** Authored virtual-environment placement of the persistent player origin. */
  transform?: SceneTransform;
  camera?: SceneBuiltinEntity;
  head?: SceneBuiltinEntity;
  leftTargetRay?: SceneBuiltinEntity;
  rightTargetRay?: SceneBuiltinEntity;
  leftGrip?: SceneBuiltinEntity;
  rightGrip?: SceneBuiltinEntity;
}

export type SceneFog =
  | { type: 'linear'; color?: SceneColor; near: number; far: number }
  | { type: 'exponential'; color?: SceneColor; density: number };

export interface SceneEnvironment {
  fog?: SceneFog;
  toneMapping?: 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces';
  exposure?: number;
  shadows?: boolean;
  shadowMapType?: 'basic' | 'pcf' | 'pcf-soft';
}

export type SceneInputKind = 'text' | 'image' | 'hybrid';
export type SceneReferenceRole = 'layout' | 'identity' | 'palette' | 'style';
export interface SceneSourceReference {
  id: string;
  uri: string;
  roles: SceneReferenceRole[];
  width: number;
  height: number;
  sha256: string;
}

export interface SceneCompositionInput {
  kind: SceneInputKind;
  prompt?: string;
  references?: SceneSourceReference[];
}

export interface SceneCompositionTarget {
  surfaces: ('browser' | 'vr' | 'ar' | 'shared')[];
  style?: string;
  assetPolicy: 'manifest-assets';
}

export interface SceneAcceptedApproximation {
  feature: string;
  requested: string;
  implementation: string;
  status: 'accepted';
}

export interface SceneRepresentationPolicy {
  fidelityCeiling: string;
  allowed: ('asset' | 'prefab' | 'pattern')[];
  acceptedApproximations?: SceneAcceptedApproximation[];
}

interface SceneAcceptanceBase {
  id: string;
}
export interface ScenePresenceAcceptance extends SceneAcceptanceBase {
  kind: 'presence';
  nodeRefs: string[];
  view?: string;
}
export interface SceneCountAcceptance extends SceneAcceptanceBase {
  kind: 'count';
  nodeRefs?: string[];
  pattern?: string;
  equals?: number;
  minimum?: number;
  maximum?: number;
}
export type SceneProjectedRegionMeasurement =
  | {
      method: 'projected-world-aabb-v1';
      applicability: 'single-axis-aligned-box';
    }
  | {
      method: 'capture-node-mask-bounds-v1';
      applicability: 'visible-node-mask';
    };
export interface SceneProjectedRegionAcceptance extends SceneAcceptanceBase {
  kind: 'projected-region';
  measurement: SceneProjectedRegionMeasurement;
  nodeRefs: string[];
  view: string;
  reference: string;
  region: Vec4;
  centerTolerance?: number;
  extentTolerance?: number;
}
export interface SceneSpatialRelationAcceptance extends SceneAcceptanceBase {
  kind: 'spatial-relation';
  nodeRefs: string[];
  target: string;
  relation:
    | 'above'
    | 'below'
    | 'left-of'
    | 'right-of'
    | 'in-front-of'
    | 'behind'
    | 'touching';
  tolerance?: number;
}
export interface SceneVisualJudgmentAcceptance extends SceneAcceptanceBase {
  kind: 'visual-judgment';
  view: string;
  criterion: string;
}
export type SceneFeatureAcceptance =
  | ScenePresenceAcceptance
  | SceneCountAcceptance
  | SceneProjectedRegionAcceptance
  | SceneSpatialRelationAcceptance
  | SceneVisualJudgmentAcceptance;

export interface SceneFeatureEvidence {
  reference: string;
  region?: Vec4;
  point?: Vec2;
}

export interface SceneObjectInspectionPart {
  id: string;
  description: string;
  nodeRefs: string[];
}

export interface SceneObjectInspectionContact {
  id: string;
  description: string;
  nodeRefs: string[];
  targetNodeRefs: string[];
}

export interface SceneObjectInspectionContext {
  background: 'authored' | 'neutral';
  lighting: 'authored' | 'neutral';
  includeNodeRefs?: string[];
}

/** Machine-readable identity checks retained in the authoring contract. */
export interface SceneObjectInspectionSpec {
  silhouette: string[];
  proportions: string[];
  parts: SceneObjectInspectionPart[];
  negativeSpace: string[];
  contacts: SceneObjectInspectionContact[];
  materialResponse: string[];
  requiredViews: string[];
  context: SceneObjectInspectionContext;
}

export interface SceneFeature {
  id: string;
  priority: 'required' | 'optional';
  description: string;
  nodeRefs: string[];
  acceptance: SceneFeatureAcceptance[];
  evidence?: SceneFeatureEvidence[];
  identityCritical?: boolean;
  objectInspection?: SceneObjectInspectionSpec;
}

export interface SceneAssumption {
  id: string;
  statement: string;
  certainty: 'low' | 'medium' | 'high';
}

export interface SceneReviewConfiguration {
  heroView: string;
  requiredViews: string[];
  lenses: ('layout' | 'geometry' | 'final')[];
  maxCorrectionRounds: number;
}

export interface SceneCompositionFeasibility {
  status: 'supported' | 'conditional' | 'blocked';
  reasons?: string[];
}

export interface SceneCompilationProvenance {
  adapter: { id: string; version: string };
  skill: { id: 'iwsdk-scene-composer'; version: string };
  capabilityHash: Sha256;
  inputHashes: Sha256[];
}

export interface SceneComposition {
  mode: 'static';
  input: SceneCompositionInput;
  target: SceneCompositionTarget;
  feasibility: SceneCompositionFeasibility;
  provenance: SceneCompilationProvenance;
  representationPolicy: SceneRepresentationPolicy;
  features: SceneFeature[];
  assumptions?: SceneAssumption[];
  review: SceneReviewConfiguration;
}

export interface SceneNodeAnnotation {
  node: string;
  featureRefs?: string[];
  reviewLayer: 'layout' | 'geometry' | 'final';
}

interface SceneViewBase {
  id: string;
  role: 'hero' | 'diagnostic';
  position: Vec3;
  target: Vec3;
}
export interface ScenePerspectiveView extends SceneViewBase {
  projection: 'perspective';
  fov: number;
}
export interface SceneOrthographicView extends SceneViewBase {
  projection: 'orthographic';
  height: number;
}
export type SceneAuthoringView = ScenePerspectiveView | SceneOrthographicView;

export interface SceneAuthoring {
  composition?: SceneComposition;
  nodeAnnotations?: SceneNodeAnnotation[];
  views?: SceneAuthoringView[];
}

export interface SceneDocument {
  version: SceneDocumentVersion;
  units: 'meters';
  imports?: SceneImport[];
  /** Components applied to the runtime level-root entity. */
  components?: Record<string, SceneComponentValue>;
  /** Components applied to persistent runtime player-space entities. */
  player?: ScenePlayerRig;
  metadata?: JsonObject;
  authoring?: SceneAuthoring;
  resources: SceneResources;
  environment?: SceneEnvironment;
  nodes: SceneNode[];
}

export type RuntimeSceneDocument = Omit<SceneDocument, 'authoring' | 'imports'>;

export interface ValidationIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface SceneCapabilitySnapshot {
  sdkVersion: string;
  sceneVersions: string[];
  nodeContentTypes: SceneNodeContent['type'][];
  patternTypes: ScenePatternDistribution['type'][];
  shadowMapTypes: NonNullable<SceneEnvironment['shadowMapType']>[];
  componentSchemaHashes: Record<string, Sha256>;
  limits?: {
    maxNodes?: number;
    maxResources?: number;
    maxPatternExpansion?: number;
  };
}

export type SceneReviewStatus = 'pass' | 'partial' | 'fail' | 'not-applicable';
export interface SceneReviewCamera {
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  target: Vec3;
  fov?: number;
  height?: number;
}
export interface SceneReviewCapture {
  id: string;
  view: string;
  path: string;
  screenshotSha256: Sha256;
  width: number;
  height: number;
  camera: SceneReviewCamera;
  rendererEnvironment: JsonObject;
  visibleNodeIds: string[];
  nodeMaskRegions?: Record<string, Vec4>;
}
export interface SceneReviewLens {
  id: 'layout' | 'geometry' | 'final';
  status: SceneReviewStatus;
  captures: SceneReviewCapture[];
}
export interface SceneReviewFeatureResult {
  feature: string;
  criterion: string;
  status: SceneReviewStatus;
  evidenceRefs: string[];
  observation?: string;
}
export interface SceneReviewWaiver {
  feature: string;
  criterion: string;
  reason: string;
  authorizedBy: 'user';
}
export interface SceneReviewStop {
  reason:
    | 'success'
    | 'continue-refining'
    | 'round-limit'
    | 'repeated-defect'
    | 'oscillation'
    | 'plateau'
    | 'missing-input'
    | 'representation-gap';
  openDefectTags: string[];
}
export interface SceneReviewLineage {
  path: string;
  reviewSha256: Sha256;
}
export interface SceneReviewCorrectionLineage {
  path: string;
  correctionSha256: Sha256;
}
export interface SceneReview {
  version: SceneReviewVersion;
  documentHash: Sha256;
  runtimeHash: Sha256;
  capabilityHash: Sha256;
  sourceHashes: Sha256[];
  round: number;
  previousReview?: SceneReviewLineage;
  correction?: SceneReviewCorrectionLineage;
  result: 'pass' | 'accepted-with-gaps' | 'fail';
  lenses: SceneReviewLens[];
  featureResults: SceneReviewFeatureResult[];
  waivers: SceneReviewWaiver[];
  stop: SceneReviewStop;
}

/** Human-authored review facts accepted by the assisted review finalizer. */
export interface SceneReviewVisualResultInput {
  feature: string;
  criterion: string;
  status: SceneReviewStatus;
  evidenceRefs?: string[];
  observation: string;
}

/**
 * Minimal caller-authored review draft. Revision identity, source hashes,
 * deterministic feature results, overall result, and success routing are
 * computed from the active scene by finalizeSceneReviewDraft.
 */
export interface SceneReviewFinalizeDraft {
  round: number;
  lenses: SceneReviewLens[];
  visualResults?: SceneReviewVisualResultInput[];
  previousReview?: SceneReviewLineage;
  correction?: SceneReviewCorrectionLineage;
  openDefectTags?: string[];
  stopReason?: Exclude<SceneReviewStop['reason'], 'success'>;
}

export type ScenePatch =
  | { op: 'replaceDocument'; document: SceneDocument }
  | { op: 'transaction'; patches: ScenePatch[] }
  | { op: 'addNode'; node: SceneNode; parentId?: string | null; index?: number }
  | { op: 'removeNode'; nodeId: string }
  | {
      op: 'moveNode';
      nodeId: string;
      parentId?: string | null;
      parent?: ScenePlayerSpaceParent;
      index?: number;
      preserveWorldTransform?: boolean;
    }
  | { op: 'renameNode'; nodeId: string; newNodeId: string }
  | { op: 'updateTransform'; nodeId: string; transform?: SceneTransform }
  | { op: 'updateVisibility'; nodeId: string; visible?: boolean }
  | {
      op: 'updateFramingRole';
      nodeId: string;
      framingRole?: SceneNodeFramingRole;
    }
  | {
      op: 'updateComponent';
      nodeId: string;
      component: string;
      value?: SceneComponentValue;
    }
  | {
      op: 'updateRootComponent';
      component: string;
      value?: SceneComponentValue;
    }
  | {
      op: 'updatePlayerComponent';
      target: ScenePlayerTarget;
      component: string;
      value?: SceneComponentValue;
    }
  | {
      op: 'updatePlayerTransform';
      target: 'player';
      transform?: SceneTransform;
    }
  | { op: 'reorderChildren'; childIds: string[]; parentId?: string | null }
  | { op: 'updateContent'; content?: SceneNodeContent; nodeId: string }
  | {
      op: 'updateConstraints';
      constraints?: SceneNodeConstraints;
      nodeId: string;
    }
  | { op: 'setNodeMetadata'; value?: JsonObject; nodeId: string }
  | { op: 'setAuthoring'; authoring?: SceneAuthoring }
  | { op: 'setEnvironment'; environment?: SceneEnvironment }
  | { op: 'addPrefab'; prefab: ScenePrefab; index?: number }
  | { op: 'updatePrefab'; prefabId: string; prefab: ScenePrefab }
  | { op: 'removePrefab'; prefabId: string }
  | { op: 'addAuthoringView'; view: SceneAuthoringView; index?: number }
  | { op: 'updateAuthoringView'; viewId: string; view: SceneAuthoringView }
  | { op: 'removeAuthoringView'; viewId: string };

export interface PatchResult {
  document: SceneDocument;
  inverse: ScenePatch;
}
