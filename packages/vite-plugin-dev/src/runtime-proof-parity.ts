/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  lightSpecFromComponentValue,
  type LightColor,
  type LightSpec,
} from '@iwsdk/core/lighting';
import {
  getSceneNodeCollisionRadius,
  getScenePatternInstanceCount,
  resolveScenePrefabRoot,
  type SceneDocument,
  type SceneAuthoringView,
  type SceneNode,
} from '@iwsdk/scene-composition';

export interface RuntimeCameraSnapshot {
  aspect: number | null;
  direction: [number, number, number];
  far: number | null;
  fov: number | null;
  height: number | null;
  near: number | null;
  position: [number, number, number];
  projection: 'orthographic' | 'perspective' | 'unknown';
}

export interface RuntimeFramingSnapshot {
  boundsAvailable: boolean;
  centerNdc: [number, number, number] | null;
  fullyInsideViewport: boolean;
  inFrontCornerCount: number;
  projectedBounds: {
    max: [number, number];
    min: [number, number];
  } | null;
  viewportCoverage: number;
  viewportOverlap: number;
}

export interface RuntimePresentationSnapshot {
  camera: RuntimeCameraSnapshot | null;
  framing: RuntimeFramingSnapshot | null;
}

export interface RuntimePresentationParityResult {
  camera: {
    issues: string[];
    passed: boolean;
  };
  expectedView: SceneAuthoringView | null;
  framing: {
    issues: string[];
    passed: boolean;
  };
  warnings: string[];
}

export interface RuntimeCountExplanation {
  authored: {
    explicitNodeCount: number;
    instanceNodeCount: number;
    patternNodeCount: number;
  };
  editor: Record<string, number | null>;
  explanation: string[];
  runtime: Record<string, number | null>;
}

export interface RuntimeSceneParityResult extends Record<string, unknown> {
  actual: {
    assets: unknown;
    environment: unknown;
    lights: unknown;
  };
  expected: {
    assets: ExpectedAssetState[];
    environment: Record<string, unknown>;
    lights: ExpectedLightState[];
  };
  mismatches: string[];
  passed: boolean;
}

interface ExpectedAssetState {
  count: number;
  id: string;
}

interface ExpectedLightState extends Record<string, unknown> {
  count: number;
  sourceNodeId: string;
  type: string;
}

interface ReachableSceneState {
  assetCounts: Map<string, { count: number; id: string }>;
  lightCounts: Map<string, { count: number; state: Record<string, unknown> }>;
}

/** Compare authored render state with measurements from the reloaded app runtime. */
export function evaluateRuntimeSceneParity(
  document: SceneDocument,
  renderStats: unknown,
): RuntimeSceneParityResult {
  const reachable = collectReachableSceneState(document);
  const expectedAssets = [...reachable.assetCounts.values()].sort(
    compareByJson,
  );
  const expectedLights: ExpectedLightState[] = [
    ...reachable.lightCounts.values(),
  ]
    .map(({ count, state }) => ({ ...state, count }) as ExpectedLightState)
    .sort(compareByJson);
  const expectedEnvironment = expectedEnvironmentState(document);
  const stats = isRecord(renderStats) ? renderStats : {};
  const actualAssets = stats.sceneAssets;
  const actualEnvironment = stats.sceneEnvironment;
  const actualLights = stats.sceneLights;
  const mismatches: string[] = [];

  compareAssetState(expectedAssets, actualAssets, mismatches);
  compareLightState(expectedLights, actualLights, mismatches);
  compareEnvironmentState(expectedEnvironment, actualEnvironment, mismatches);

  return {
    actual: {
      assets: actualAssets,
      environment: actualEnvironment,
      lights: actualLights,
    },
    expected: {
      assets: expectedAssets,
      environment: expectedEnvironment,
      lights: expectedLights,
    },
    mismatches,
    passed: mismatches.length === 0,
  };
}

/**
 * Compare the live app camera and framing with the scene's authored hero view.
 * This deliberately does not use screenshot similarity: the authored view is
 * the stable presentation contract, while projected bounds prove that the
 * live camera is actually looking at renderable scene content.
 */
export function evaluateRuntimePresentationParity(
  expectedView: SceneAuthoringView | null,
  snapshot: RuntimePresentationSnapshot,
): RuntimePresentationParityResult {
  const cameraIssues: string[] = [];
  const framingIssues: string[] = [];
  const warnings: string[] = [];
  const camera = snapshot.camera;

  if (expectedView == null) {
    warnings.push(
      'No authored hero view is configured; runtime camera parity cannot be proven.',
    );
  } else if (camera == null) {
    cameraIssues.push('Runtime camera measurement is unavailable.');
  } else {
    if (camera.projection !== expectedView.projection) {
      cameraIssues.push(
        `Runtime camera projection is ${camera.projection}; expected ${expectedView.projection}.`,
      );
    }
    const positionError = vec3Distance(camera.position, expectedView.position);
    if (positionError > 0.05) {
      cameraIssues.push(
        `Runtime camera position differs from the authored hero view by ${positionError.toFixed(3)}m.`,
      );
    }
    const expectedDirection = normalizedDirection(
      expectedView.position,
      expectedView.target,
    );
    const directionErrorDeg = angleBetweenDegrees(
      camera.direction,
      expectedDirection,
    );
    if (directionErrorDeg > 2) {
      cameraIssues.push(
        `Runtime camera aim differs from the authored hero view by ${directionErrorDeg.toFixed(2)} degrees.`,
      );
    }
    if (
      expectedView.projection === 'perspective' &&
      (camera.fov == null || Math.abs(camera.fov - expectedView.fov) > 0.5)
    ) {
      cameraIssues.push(
        `Runtime camera fov is ${camera.fov ?? 'unavailable'}; expected ${expectedView.fov}.`,
      );
    }
    if (
      expectedView.projection === 'orthographic' &&
      (camera.height == null ||
        Math.abs(camera.height - expectedView.height) > 0.01)
    ) {
      cameraIssues.push(
        `Runtime camera orthographic height is ${camera.height ?? 'unavailable'}; expected ${expectedView.height}.`,
      );
    }
  }

  const framing = snapshot.framing;
  if (framing == null || !framing.boundsAvailable) {
    framingIssues.push('Runtime framing bounds are unavailable.');
  } else {
    if (framing.inFrontCornerCount === 0) {
      framingIssues.push(
        'All measured scene bounds are behind the runtime camera.',
      );
    }
    if (framing.viewportOverlap <= 0.02) {
      framingIssues.push(
        'Measured scene bounds do not occupy a representative area of the runtime viewport.',
      );
    }
    if (framing.viewportCoverage < 0.1) {
      warnings.push(
        `Scene bounds occupy only ${(framing.viewportCoverage * 100).toFixed(1)}% of the runtime viewport.`,
      );
    }
    if (!framing.fullyInsideViewport) {
      warnings.push(
        'Some measured scene bounds are outside the runtime viewport; this can be intentional cropping.',
      );
    }
  }

  return {
    camera: {
      issues: cameraIssues,
      passed: expectedView == null || cameraIssues.length === 0,
    },
    expectedView,
    framing: {
      issues: framingIssues,
      passed: framingIssues.length === 0,
    },
    warnings,
  };
}

/** Explain why authoring, editor, and runtime object counts are not equal. */
export function explainRuntimeCountDifferences(
  document: SceneDocument,
  editorStats: unknown,
  runtimeStats: unknown,
  runtimeHierarchyObjectCount: number | null,
): RuntimeCountExplanation {
  const nodes = flattenAuthoredNodes(document.nodes);
  const editor = isRecord(editorStats) ? editorStats : {};
  const runtime = isRecord(runtimeStats) ? runtimeStats : {};
  return {
    authored: {
      explicitNodeCount: nodes.length,
      instanceNodeCount: nodes.filter(
        (node) => node.content?.type === 'instance',
      ).length,
      patternNodeCount: nodes.filter((node) => node.content?.type === 'pattern')
        .length,
    },
    editor: {
      meshCount: finiteCount(editor.meshCount),
      nodeCount: finiteCount(editor.nodeCount),
      objectCount: finiteCount(editor.objectCount),
    },
    explanation: [
      'Authored node count is the number of explicit JSON nodes before prefab and pattern expansion.',
      'Editor object and mesh counts include preview helpers and lowered render objects, so they are diagnostic rather than identity checks.',
      'Runtime hierarchy and mesh counts include prefab/pattern expansion, model descendants, lights, and application-created objects.',
      'Publish identity is established by runtime hash and semantic node/resource checks, not by requiring these count domains to be equal.',
    ],
    runtime: {
      hierarchyObjectCount: runtimeHierarchyObjectCount,
      meshCount: finiteCount(runtime.meshCount),
      materialCount: finiteCount(runtime.materialCount),
    },
  };
}

function flattenAuthoredNodes(nodes: SceneNode[], result: SceneNode[] = []) {
  for (const node of nodes) {
    result.push(node);
    flattenAuthoredNodes(node.children ?? [], result);
  }
  return result;
}

function finiteCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function vec3Distance(left: number[], right: number[]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function normalizedDirection(
  from: number[],
  to: number[],
): [number, number, number] {
  const direction: [number, number, number] = [
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ];
  const length = Math.hypot(...direction);
  return length <= 1e-9
    ? [0, 0, -1]
    : (direction.map((value) => value / length) as [number, number, number]);
}

function angleBetweenDegrees(left: number[], right: number[]): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (leftLength <= 1e-9 || rightLength <= 1e-9) {
    return 180;
  }
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (left[0] * right[0] + left[1] * right[1] + left[2] * right[2]) /
        (leftLength * rightLength),
    ),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function collectReachableSceneState(
  document: SceneDocument,
): ReachableSceneState {
  const state: ReachableSceneState = {
    assetCounts: new Map(),
    lightCounts: new Map(),
  };
  const prefabs = new Map(
    (document.resources.prefabs ?? []).map((prefab) => [prefab.id, prefab]),
  );

  const visit = (
    node: SceneNode,
    multiplier: number,
    prefabStack: readonly string[],
  ): void => {
    for (const [componentName, value] of Object.entries(
      node.components ?? {},
    )) {
      const spec = lightSpecFromComponentValue(componentName, value);
      if (spec == null) {
        continue;
      }
      const light = expectedLightState(node.id, spec);
      const key = JSON.stringify(light);
      const current = state.lightCounts.get(key);
      state.lightCounts.set(key, {
        count: (current?.count ?? 0) + multiplier,
        state: light,
      });
    }
    const content = node.content;
    switch (content?.type) {
      case 'asset': {
        const key = content.asset;
        const current = state.assetCounts.get(key);
        state.assetCounts.set(key, {
          count: (current?.count ?? 0) + multiplier,
          id: content.asset,
        });
        break;
      }
      case 'instance':
      case 'pattern': {
        const prefab = requireMapValue(prefabs, content.prefab);
        if (prefabStack.includes(prefab.id)) {
          throw new Error(
            `Recursive scene prefab expansion: ${[
              ...prefabStack,
              prefab.id,
            ].join(' -> ')}`,
          );
        }
        const root = resolveScenePrefabRoot(
          document,
          prefab.root,
          content.overrides,
        );
        const instanceCount =
          content.type === 'instance'
            ? 1
            : getScenePatternInstanceCount(content.distribution, {
                collisionRadius: getSceneNodeCollisionRadius(document, root),
                seedKey: node.id,
              });
        visit(root, multiplier * instanceCount, [...prefabStack, prefab.id]);
        break;
      }
    }
    for (const child of node.children ?? []) {
      visit(child, multiplier, prefabStack);
    }
  };

  for (const node of document.nodes) {
    visit(node, 1, []);
  }
  return state;
}

function expectedLightState(
  sourceNodeId: string,
  light: LightSpec,
): Record<string, unknown> {
  const common = {
    castShadow: 'castShadow' in light ? (light.castShadow ?? false) : false,
    intensity: light.intensity,
    ...('castShadow' in light && light.castShadow
      ? { shadow: expectedShadowState(light) }
      : {}),
    sourceNodeId,
    type: light.kind,
  };
  switch (light.kind) {
    case 'ambient':
      return { ...common, color: componentColorToHex(light.color) };
    case 'hemisphere':
      return {
        ...common,
        groundColor: componentColorToHex(light.groundColor),
        skyColor: componentColorToHex(light.skyColor),
      };
    case 'directional':
      return {
        ...common,
        color: componentColorToHex(light.color),
      };
    case 'point':
      return {
        ...common,
        color: componentColorToHex(light.color),
        decay: light.decay ?? 2,
        distance: light.distance ?? 0,
      };
    case 'spot':
      return {
        ...common,
        angleDeg: light.angleDeg,
        color: componentColorToHex(light.color),
        decay: light.decay ?? 2,
        distance: light.distance ?? 0,
        penumbra: light.penumbra ?? 0,
      };
    case 'rect-area':
      return {
        ...common,
        color: componentColorToHex(light.color),
        height: light.height,
        width: light.width,
      };
  }
  throw new Error('Unsupported light specification');
}

function expectedShadowState(
  shadow: Extract<LightSpec, { kind: 'directional' | 'point' | 'spot' }>,
): Record<string, unknown> {
  return {
    bias: shadow.shadowBias,
    camera:
      shadow.kind === 'directional' && 'shadowCameraSize' in shadow
        ? {
            bottom: -shadow.shadowCameraSize / 2,
            far: shadow.shadowCameraFar,
            left: -shadow.shadowCameraSize / 2,
            near: shadow.shadowCameraNear,
            right: shadow.shadowCameraSize / 2,
            top: shadow.shadowCameraSize / 2,
          }
        : {
            far: shadow.shadowCameraFar,
            near: shadow.shadowCameraNear,
          },
    mapSize: [shadow.shadowMapSize, shadow.shadowMapSize],
    normalBias: shadow.shadowNormalBias,
    radius: shadow.shadowRadius,
  };
}

function expectedEnvironmentState(
  document: SceneDocument,
): Record<string, unknown> {
  const environment = document.environment;
  if (environment == null) {
    return {};
  }
  return {
    ...(environment.exposure == null ? {} : { exposure: environment.exposure }),
    ...(environment.fog == null
      ? {}
      : {
          fog:
            environment.fog.type === 'linear'
              ? {
                  color: normalizeColor(environment.fog.color ?? '#000000'),
                  far: environment.fog.far,
                  near: environment.fog.near,
                  type: 'linear',
                }
              : {
                  color: normalizeColor(environment.fog.color ?? '#000000'),
                  density: environment.fog.density,
                  type: 'exponential',
                },
        }),
    ...(environment.shadows == null ? {} : { shadows: environment.shadows }),
    ...(environment.shadowMapType == null
      ? {}
      : { shadowMapType: environment.shadowMapType }),
    ...(environment.toneMapping == null
      ? {}
      : { toneMapping: environment.toneMapping }),
  };
}

function compareAssetState(
  expected: ExpectedAssetState[],
  actualValue: unknown,
  mismatches: string[],
): void {
  if (!Array.isArray(actualValue)) {
    mismatches.push('runtime sceneAssets measurement is unavailable');
    return;
  }
  const actualCounts = new Map<string, number>();
  for (const entry of actualValue) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.meshCount !== 'number'
    ) {
      mismatches.push('runtime sceneAssets contains an invalid entry');
      continue;
    }
    const key = entry.id;
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
    if (entry.meshCount <= 0) {
      mismatches.push(`asset ${entry.id} loaded no renderable meshes`);
    }
  }
  for (const asset of expected) {
    const key = asset.id;
    const count = actualCounts.get(key) ?? 0;
    if (count !== asset.count) {
      mismatches.push(
        `asset ${asset.id} expected ${asset.count} loaded instance(s), measured ${count}`,
      );
    }
    actualCounts.delete(key);
  }
  for (const key of actualCounts.keys()) {
    mismatches.push(`runtime reported unexpected asset ${key}`);
  }
}

function compareLightState(
  expected: ExpectedLightState[],
  actualValue: unknown,
  mismatches: string[],
): void {
  if (!Array.isArray(actualValue)) {
    mismatches.push('runtime sceneLights measurement is unavailable');
    return;
  }
  const actualCounts = new Map<string, number>();
  for (const entry of actualValue) {
    if (!isRecord(entry)) {
      mismatches.push('runtime sceneLights contains an invalid entry');
      continue;
    }
    const comparable = { ...entry };
    delete comparable.nodeId;
    const key = stableMeasuredKey(comparable);
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }
  for (const light of expected) {
    const { count, ...state } = light;
    const key = stableMeasuredKey(state);
    const actualCount = actualCounts.get(key) ?? 0;
    if (actualCount !== count) {
      mismatches.push(
        `scene light ${state.sourceNodeId} expected ${count} runtime instance(s), measured ${actualCount}`,
      );
    }
    actualCounts.delete(key);
  }
  for (const key of actualCounts.keys()) {
    mismatches.push(`runtime reported unexpected scene light ${key}`);
  }
}

function compareEnvironmentState(
  expected: Record<string, unknown>,
  actualValue: unknown,
  mismatches: string[],
): void {
  if (!isRecord(actualValue)) {
    mismatches.push('runtime sceneEnvironment measurement is unavailable');
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!sameMeasuredValue(value, actualValue[key])) {
      mismatches.push(`scene environment ${key} differs from its spec`);
    }
  }
}

function sameMeasuredValue(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Number.isFinite(actual) && Math.abs(expected - actual) <= 1e-6;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return (
      expected.length === actual.length &&
      expected.every((entry, index) => sameMeasuredValue(entry, actual[index]))
    );
  }
  if (isRecord(expected) && isRecord(actual)) {
    return Object.entries(expected).every(([key, value]) =>
      sameMeasuredValue(value, actual[key]),
    );
  }
  return expected === actual;
}

function stableMeasuredKey(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : '';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableMeasuredKey).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableMeasuredKey(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function normalizeColor(value: string): string {
  return value.toLowerCase();
}

function componentColorToHex(value: LightColor): string {
  const channel = (entry: number) =>
    Math.round(Math.max(0, Math.min(1, entry)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(value[0])}${channel(value[1])}${channel(value[2])}`;
}

function requireMapValue<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value == null) {
    throw new Error(`Scene references unknown resource ${String(key)}`);
  }
  return value;
}

function compareByJson(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
