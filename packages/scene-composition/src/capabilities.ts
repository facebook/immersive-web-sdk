/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { hashSceneComponentSchema } from './component-catalog.js';
import { canonicalizeJson, sha256 } from './serialize.js';
import type {
  SceneComponentCatalog,
  SceneCapabilitySnapshot,
  SceneDocument,
  SceneNode,
  Sha256,
  ValidationIssue,
  ValidationResult,
} from './types.js';
import { assertValidSceneDocument } from './validation.js';

export function hashSceneCapabilitySnapshot(
  snapshot: SceneCapabilitySnapshot,
): Sha256 {
  return sha256(canonicalizeJson(snapshot));
}

export function validateSceneCapabilities(
  document: SceneDocument,
  snapshot: SceneCapabilitySnapshot,
  options: {
    componentCatalog?: SceneComponentCatalog;
    validateAuthoringWorkflow?: boolean;
  } = {},
): ValidationResult {
  assertValidSceneDocument(document, options);
  const issues: ValidationIssue[] = [];
  if (!snapshot.sceneVersions.includes(document.version)) {
    addUnsupported(issues, '$.version', 'scene version', document.version);
  }
  const authoredCapabilityHash =
    document.authoring?.composition?.provenance.capabilityHash;
  const activeCapabilityHash = hashSceneCapabilitySnapshot(snapshot);
  if (
    options.validateAuthoringWorkflow !== false &&
    authoredCapabilityHash != null &&
    authoredCapabilityHash.toLowerCase() !== activeCapabilityHash.toLowerCase()
  ) {
    issues.push({
      code: 'capability',
      path: '$.authoring.composition.provenance.capabilityHash',
      message: `compilation capability hash does not match the active snapshot (expected ${activeCapabilityHash})`,
    });
  }

  const shadowMapType = document.environment?.shadowMapType;
  if (
    shadowMapType != null &&
    !(snapshot.shadowMapTypes ?? []).includes(shadowMapType)
  ) {
    addUnsupported(
      issues,
      '$.environment.shadowMapType',
      'shadow map type',
      shadowMapType,
    );
  }
  if (options.componentCatalog != null) {
    validateComponentCapabilities(
      document.components,
      '$.components',
      snapshot,
      options.componentCatalog,
      issues,
    );
  }

  walkNodes(document.nodes, '$.nodes', (node, path) => {
    validateNodeCapability(node, path, snapshot, issues);
    if (options.componentCatalog != null) {
      validateComponentCapabilities(
        node.components,
        `${path}.components`,
        snapshot,
        options.componentCatalog,
        issues,
      );
    }
  });
  document.resources.prefabs?.forEach((prefab, index) => {
    walkNodes(
      [prefab.root],
      `$.resources.prefabs[${index}].root`,
      (node, path) => {
        validateNodeCapability(node, path, snapshot, issues);
        if (options.componentCatalog != null) {
          validateComponentCapabilities(
            node.components,
            `${path}.components`,
            snapshot,
            options.componentCatalog,
            issues,
          );
        }
      },
    );
  });

  const nodeCount =
    countNodes(document.nodes) +
    (document.resources.prefabs ?? []).reduce(
      (count, prefab) => count + countNodes([prefab.root]),
      0,
    );
  const resourceCount = document.resources.prefabs?.length ?? 0;
  if (
    snapshot.limits?.maxNodes != null &&
    nodeCount > snapshot.limits.maxNodes
  ) {
    issues.push({
      code: 'capability-limit',
      path: '$.nodes',
      message: `scene has ${nodeCount} nodes; capability limit is ${snapshot.limits.maxNodes}`,
    });
  }
  if (
    snapshot.limits?.maxResources != null &&
    resourceCount > snapshot.limits.maxResources
  ) {
    issues.push({
      code: 'capability-limit',
      path: '$.resources',
      message: `scene has ${resourceCount} resources; capability limit is ${snapshot.limits.maxResources}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function validateComponentCapabilities(
  components: Record<string, unknown> | undefined,
  path: string,
  snapshot: SceneCapabilitySnapshot,
  catalog: SceneComponentCatalog | undefined,
  issues: ValidationIssue[],
) {
  for (const componentName of Object.keys(components ?? {})) {
    const componentId = stripComponentPrefix(componentName);
    const actual = snapshot.componentSchemaHashes[componentId];
    if (actual == null) {
      issues.push({
        code: 'capability',
        path: `${path}[${JSON.stringify(componentName)}]`,
        message: `component "${componentId}" is not registered`,
      });
      continue;
    }
    const schema = catalog?.[componentId] ?? catalog?.[componentName];
    if (schema != null && actual !== hashSceneComponentSchema(schema)) {
      issues.push({
        code: 'capability',
        path: `${path}[${JSON.stringify(componentName)}]`,
        message: `component "${componentId}" schema does not match the active capability snapshot`,
      });
    }
  }
}

function stripComponentPrefix(name: string) {
  const prefix = 'com.iwsdk.components.';
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

function validateNodeCapability(
  node: SceneNode,
  path: string,
  snapshot: SceneCapabilitySnapshot,
  issues: ValidationIssue[],
) {
  const content = node.content;
  if (content != null && !snapshot.nodeContentTypes.includes(content.type)) {
    addUnsupported(
      issues,
      `${path}.content.type`,
      'node content',
      content.type,
    );
  }
  if (
    content?.type === 'pattern' &&
    !snapshot.patternTypes.includes(content.distribution.type)
  ) {
    addUnsupported(
      issues,
      `${path}.content.distribution.type`,
      'pattern distribution',
      content.distribution.type,
    );
  }
}

function walkNodes(
  nodes: SceneNode[],
  path: string,
  visitor: (node: SceneNode, path: string) => void,
) {
  nodes.forEach((node, index) => {
    const nodePath =
      nodes.length === 1 && path.endsWith('.root') ? path : `${path}[${index}]`;
    visitor(node, nodePath);
    walkNodes(node.children ?? [], `${nodePath}.children`, visitor);
  });
}

function countNodes(nodes: SceneNode[]): number {
  return nodes.reduce(
    (count, node) => count + 1 + countNodes(node.children ?? []),
    0,
  );
}

function addUnsupported(
  issues: ValidationIssue[],
  path: string,
  kind: string,
  value: string,
) {
  issues.push({
    code: 'capability',
    path,
    message: `${kind} "${value}" is not supported by this capability snapshot`,
  });
}
