/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  SceneDocument,
  SceneNode,
  ScenePatternDistribution,
  SceneScale,
  SceneTransform,
  Vec3,
} from './types.js';
import { deepClone } from './utils.js';

export const MAX_SCENE_PATTERN_INSTANCES = 10_000;

export interface GenerateScenePatternOptions {
  collisionRadius?: number;
  maxInstances?: number;
  seedKey?: string;
}

export interface SceneRuntimeNodeIdEntry {
  derived: boolean;
  id: string;
  sourcePath: string;
}

interface CollectRuntimeIdOptions {
  derived: boolean;
  namespace?: string;
  prefabStack: readonly string[];
  sourcePath: string;
}

/**
 * Expand a pattern in stable order. Scatter uses the declared PCG32
 * algorithm; other distributions derive a stable seed from the scene data.
 */
export function generateScenePatternTransforms(
  distribution: ScenePatternDistribution,
  options: GenerateScenePatternOptions = {},
): SceneTransform[] {
  const maxInstances = options.maxInstances ?? MAX_SCENE_PATTERN_INSTANCES;
  const requestedCount = getScenePatternRequestedCount(distribution);
  if (requestedCount > maxInstances) {
    throw new Error(
      `Scene pattern expansion of ${requestedCount} exceeds the limit of ${maxInstances}`,
    );
  }

  if (distribution.type === 'explicit') {
    return deepClone(distribution.transforms);
  }

  const random = new Pcg32(
    distribution.type === 'scatter'
      ? distribution.seed
      : stableStringSeed(
          `${options.seedKey ?? ''}:${canonicalizeForSeed(distribution)}`,
        ),
  );
  if (distribution.type === 'scatter') {
    return generateScatterTransforms(
      distribution,
      random,
      options.collisionRadius ?? 0,
    );
  }

  const bases: SceneTransform[] = [];
  switch (distribution.type) {
    case 'linear':
      for (let index = 0; index < distribution.count; index += 1) {
        bases.push({
          position: distribution.step.map(
            (component) => component * index,
          ) as Vec3,
        });
      }
      break;
    case 'grid':
      for (let z = 0; z < distribution.count[2]; z += 1) {
        for (let y = 0; y < distribution.count[1]; y += 1) {
          for (let x = 0; x < distribution.count[0]; x += 1) {
            bases.push({
              position: [
                x * distribution.spacing[0],
                y * distribution.spacing[1],
                z * distribution.spacing[2],
              ],
            });
          }
        }
      }
      break;
    case 'radial': {
      const start = distribution.startAngleDeg ?? 0;
      const arc = distribution.arcDeg ?? 360;
      const step = arc / distribution.count;
      for (let index = 0; index < distribution.count; index += 1) {
        const angleDeg = start + step * index;
        const angle = degreesToRadians(angleDeg);
        bases.push({
          position: [
            Math.sin(angle) * distribution.radius,
            0,
            Math.cos(angle) * distribution.radius,
          ],
          ...(distribution.faceCenter
            ? { rotationDeg: [0, angleDeg + 180, 0] as Vec3 }
            : {}),
        });
      }
      break;
    }
    case 'along-path':
      bases.push(...generateAlongPathTransforms(distribution));
      break;
  }
  return bases.map((base) =>
    applyPatternVariation(base, distribution.variation, random),
  );
}

export function getScenePatternRequestedCount(
  distribution: ScenePatternDistribution,
): number {
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

/** Actual materialized instance count for the supplied deterministic options. */
export function getScenePatternInstanceCount(
  distribution: ScenePatternDistribution,
  options: GenerateScenePatternOptions = {},
): number {
  return generateScenePatternTransforms(distribution, options).length;
}

/** Stable ID for a local prefab node expanded by an instance node. */
export function deriveSceneInstanceNodeId(
  instanceNodeId: string,
  prefabNodeId: string,
): string {
  return `${instanceNodeId}/${prefabNodeId}`;
}

/** Stable namespace for one expanded pattern instance. */
export function deriveScenePatternInstanceNamespace(
  patternNodeId: string,
  instanceIndex: number,
): string {
  return `${patternNodeId}/${String(instanceIndex).padStart(4, '0')}`;
}

/** Stable ID for a local prefab node expanded by a pattern instance. */
export function deriveScenePatternNodeId(
  patternNodeId: string,
  instanceIndex: number,
  prefabNodeId: string,
): string {
  return deriveSceneInstanceNodeId(
    deriveScenePatternInstanceNamespace(patternNodeId, instanceIndex),
    prefabNodeId,
  );
}

/**
 * Enumerate authored and reserved derived runtime IDs using the exact same
 * namespace rules as lowering. Scatter reserves its declared contiguous ID
 * range even when collision skipping materializes fewer instances.
 */
export function collectSceneRuntimeNodeIds(
  document: SceneDocument,
  maxDerivedNodes = MAX_SCENE_PATTERN_INSTANCES,
): SceneRuntimeNodeIdEntry[] {
  const prefabs = new Map(
    (document.resources.prefabs ?? []).map((prefab) => [prefab.id, prefab]),
  );
  const entries: SceneRuntimeNodeIdEntry[] = [];
  let derivedCount = 0;

  const visit = (node: SceneNode, options: CollectRuntimeIdOptions): void => {
    if (options.derived) {
      derivedCount += 1;
      if (derivedCount > maxDerivedNodes) {
        throw new Error(
          `Scene derived-node expansion exceeds the limit of ${maxDerivedNodes}`,
        );
      }
    }
    const id =
      options.namespace == null
        ? node.id
        : deriveSceneInstanceNodeId(options.namespace, node.id);
    entries.push({
      derived: options.derived,
      id,
      sourcePath: options.sourcePath,
    });

    const content = node.content;
    if (content?.type === 'instance' || content?.type === 'pattern') {
      const prefab = prefabs.get(content.prefab);
      if (prefab == null) {
        throw new Error(`Scene references unknown prefab "${content.prefab}"`);
      }
      if (options.prefabStack.includes(prefab.id)) {
        throw new Error(
          `Recursive scene prefab expansion: ${[
            ...options.prefabStack,
            prefab.id,
          ].join(' -> ')}`,
        );
      }
      const nextStack = [...options.prefabStack, prefab.id];
      if (content.type === 'instance') {
        visit(prefab.root, {
          derived: true,
          namespace: id,
          prefabStack: nextStack,
          sourcePath: `${options.sourcePath}.content.prefab(${JSON.stringify(
            prefab.id,
          )}).root`,
        });
      } else {
        const count = getScenePatternRequestedCount(content.distribution);
        for (let index = 0; index < count; index += 1) {
          visit(prefab.root, {
            derived: true,
            namespace: deriveScenePatternInstanceNamespace(id, index),
            prefabStack: nextStack,
            sourcePath: `${options.sourcePath}.content.prefab(${JSON.stringify(
              prefab.id,
            )}).root`,
          });
        }
      }
    }

    (node.children ?? []).forEach((child, index) =>
      visit(child, {
        derived: options.derived,
        namespace: options.namespace,
        prefabStack: options.prefabStack,
        sourcePath: `${options.sourcePath}.children[${index}]`,
      }),
    );
  };

  document.nodes.forEach((node, index) =>
    visit(node, {
      derived: false,
      prefabStack: [],
      sourcePath: `$.nodes[${index}]`,
    }),
  );
  return entries;
}

function generateScatterTransforms(
  distribution: Extract<ScenePatternDistribution, { type: 'scatter' }>,
  random: Pcg32,
  collisionRadius: number,
): SceneTransform[] {
  const transforms: SceneTransform[] = [];
  const accepted: { position: Vec3; radius: number }[] = [];
  const maxAttempts = Math.max(256, distribution.count * 64);
  for (
    let attempt = 0;
    attempt < maxAttempts && transforms.length < distribution.count;
    attempt += 1
  ) {
    const position = randomScatterPosition(distribution.region, random);
    const transform = applyPatternVariation(
      { position },
      distribution.variation,
      random,
    );
    const finalPosition = transform.position ?? position;
    const scale = Math.max(...scaleToVec3(transform.scale));
    const radius = collisionRadius * scale;
    if (
      distribution.collision === 'skip' &&
      accepted.some(
        (entry) =>
          distanceSquared(finalPosition, entry.position) <
          (radius + entry.radius) * (radius + entry.radius),
      )
    ) {
      continue;
    }
    transforms.push(transform);
    accepted.push({ position: finalPosition, radius });
  }
  return transforms;
}

function randomScatterPosition(
  region: Extract<ScenePatternDistribution, { type: 'scatter' }>['region'],
  random: Pcg32,
): Vec3 {
  if (region.type === 'box') {
    return [
      random.signed() * region.size[0] * 0.5,
      random.signed() * region.size[1] * 0.5,
      random.signed() * region.size[2] * 0.5,
    ];
  }
  for (;;) {
    const point: Vec3 = [random.signed(), random.signed(), random.signed()];
    if (distanceSquared(point, [0, 0, 0]) <= 1) {
      return point.map((component) => component * region.radius) as Vec3;
    }
  }
}

function generateAlongPathTransforms(
  distribution: Extract<ScenePatternDistribution, { type: 'along-path' }>,
): SceneTransform[] {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < distribution.points.length; index += 1) {
    const length = Math.sqrt(
      distanceSquared(
        distribution.points[index - 1],
        distribution.points[index],
      ),
    );
    segmentLengths.push(length);
    totalLength += length;
  }
  const transforms: SceneTransform[] = [];
  for (let index = 0; index < distribution.count; index += 1) {
    const distance =
      distribution.count === 1
        ? 0
        : (totalLength * index) / (distribution.count - 1);
    let traversed = 0;
    let segmentIndex = 0;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      traversed + segmentLengths[segmentIndex] < distance
    ) {
      traversed += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }
    const start = distribution.points[segmentIndex];
    const end = distribution.points[segmentIndex + 1];
    const length = segmentLengths[segmentIndex] || 1;
    const t = Math.min(1, Math.max(0, (distance - traversed) / length));
    const position = start.map(
      (component, axis) => component + (end[axis] - component) * t,
    ) as Vec3;
    transforms.push({
      position,
      ...(distribution.orientToPath
        ? {
            rotationDeg: [
              0,
              radiansToDegrees(
                Math.atan2(end[0] - start[0], end[2] - start[2]),
              ),
              0,
            ] as Vec3,
          }
        : {}),
    });
  }
  return transforms;
}

function applyPatternVariation(
  base: SceneTransform,
  variation: Exclude<
    ScenePatternDistribution,
    { type: 'explicit' }
  >['variation'],
  random: Pcg32,
): SceneTransform {
  if (variation == null) {
    return base;
  }
  const result = deepClone(base);
  if (variation.positionJitter != null) {
    const position = result.position ?? [0, 0, 0];
    result.position = position.map(
      (component, index) =>
        component + random.signed() * variation.positionJitter![index],
    ) as Vec3;
  }
  if (variation.yawDeg != null) {
    const rotation = result.rotationDeg ?? [0, 0, 0];
    result.rotationDeg = [
      rotation[0],
      rotation[1] + random.range(...variation.yawDeg),
      rotation[2],
    ];
  }
  if (variation.scale != null) {
    const multiplier = random.range(...variation.scale);
    const scale = scaleToVec3(result.scale);
    result.scale = scale.map((component) => component * multiplier) as Vec3;
  }
  return result;
}

function scaleToVec3(scale: SceneScale | undefined): Vec3 {
  if (scale == null) {
    return [1, 1, 1];
  }
  return typeof scale === 'number' ? [scale, scale, scale] : scale;
}

function distanceSquared(first: Vec3, second: Vec3): number {
  const x = first[0] - second[0];
  const y = first[1] - second[1];
  const z = first[2] - second[2];
  return x * x + y * y + z * z;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function canonicalizeForSeed(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeForSeed(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeForSeed(record[key])}`)
    .join(',')}}`;
}

function stableStringSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

class Pcg32 {
  private state: number;

  constructor(seed: number) {
    this.state = (seed ^ 0x853c49e6) >>> 0;
    this.nextUint32();
  }

  nextUint32(): number {
    this.state = (Math.imul(this.state, 747796405) + 2891336453) >>> 0;
    const shift = (this.state >>> 28) + 4;
    const word = Math.imul((this.state >>> shift) ^ this.state, 277803737);
    return ((word >>> 22) ^ word) >>> 0;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  signed(): number {
    return this.next() * 2 - 1;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
