/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  SCENE_IMPORT_ID_PATTERN,
  type SceneComponentCatalog,
  type SceneComponentValue,
  type SceneDocument,
  type SceneImport,
  type SceneNode,
  type SceneNodeContent,
  type ScenePrefab,
  type ScenePrefabNodeOverride,
  type SceneResources,
} from './types.js';
import { deepClone, isPlainObject } from './utils.js';
import { assertValidSceneDocument } from './validation.js';

const SAFE_IMPORT_ID_PATTERN = new RegExp(SCENE_IMPORT_ID_PATTERN, 'u');

export interface SceneImportResolveRequest {
  /** The import's local identifier. */
  id: string;
  /** The source specifier exactly as declared by the importing document. */
  src: string;
  /** Canonical source of the importing document, when known. */
  importer?: string;
  /** Full deterministic namespace assigned to this import. */
  namespace: string;
}

export interface SceneModuleResolution {
  /** Canonical URL or path used for cycle detection and relative asset URIs. */
  source: string;
  /** A parsed document value or its JSON text. */
  document: unknown;
}

export type SceneModuleResolver = (
  request: SceneImportResolveRequest,
) => SceneModuleResolution | Promise<SceneModuleResolution>;

export interface ComposeSceneDocumentOptions {
  resolve: SceneModuleResolver;
  /** Canonical URL or path of the root, used to detect cycles through it. */
  source?: string;
  /** Component definitions used to validate root and imported modules. */
  componentCatalog?: SceneComponentCatalog;
  /** Disable formal composition/review policy checks for editor integrity use. */
  validateAuthoringWorkflow?: boolean;
  /** Disable required component-link checks while loading editable drafts. */
  validateComponentLinks?: boolean;
}

export interface SceneCompositionDependency {
  id: string;
  namespace: string;
  src: string;
  source: string;
  importer?: string;
}

export interface ComposedSceneDocument {
  document: SceneDocument;
  /** Declaration-order preorder traversal of all resolved imports. */
  dependencies: SceneCompositionDependency[];
}

interface ModuleContribution {
  prefabs: ScenePrefab[];
  nodes: SceneNode[];
}

interface ActiveModule {
  namespace: string;
  source: string;
}

/**
 * Resolve and flatten all imports into one validated, runtime-ready document.
 * Resolution is deliberately sequential so resolver timing cannot affect output.
 */
export async function composeSceneDocument(
  root: unknown,
  options: ComposeSceneDocumentOptions,
): Promise<ComposedSceneDocument> {
  if (typeof options?.resolve !== 'function') {
    throw new Error('Scene composition requires a module resolver');
  }

  const rootDocument = parseAndValidateDocument(
    root,
    'root scene document',
    options.componentCatalog,
    options.validateAuthoringWorkflow !== false,
    options.validateComponentLinks !== false,
  );
  const rootSource = normalizeOptionalSource(options.source, 'root source');
  const dependencies: SceneCompositionDependency[] = [];
  const activeModules: ActiveModule[] =
    rootSource == null ? [] : [{ namespace: '<root>', source: rootSource }];
  const contribution = await collectModuleContribution(
    rootDocument,
    rootSource,
    undefined,
    false,
    options.resolve,
    options.componentCatalog,
    options.validateAuthoringWorkflow !== false,
    options.validateComponentLinks !== false,
    dependencies,
    activeModules,
  );

  const document: SceneDocument = {
    version: rootDocument.version,
    units: rootDocument.units,
    ...(rootDocument.metadata == null
      ? {}
      : { metadata: deepClone(rootDocument.metadata) }),
    ...(rootDocument.components == null
      ? {}
      : { components: deepClone(rootDocument.components) }),
    ...(rootDocument.player == null
      ? {}
      : { player: deepClone(rootDocument.player) }),
    ...(rootDocument.authoring == null
      ? {}
      : { authoring: deepClone(rootDocument.authoring) }),
    resources: contributionToResources(contribution, rootDocument.resources),
    ...(rootDocument.environment == null
      ? {}
      : { environment: deepClone(rootDocument.environment) }),
    nodes: contribution.nodes,
  };

  try {
    assertValidSceneDocument(document, {
      componentCatalog: options.componentCatalog,
      validateAuthoringWorkflow: options.validateAuthoringWorkflow !== false,
      validateComponentLinks: options.validateComponentLinks !== false,
    });
  } catch (error) {
    throw new Error(
      `Composed scene document is invalid: ${errorMessage(error)}`,
    );
  }
  return { document, dependencies };
}

async function collectModuleContribution(
  document: SceneDocument,
  source: string | undefined,
  namespace: string | undefined,
  _rebaseAssets: boolean,
  resolve: SceneModuleResolver,
  componentCatalog: SceneComponentCatalog | undefined,
  validateAuthoringWorkflow: boolean,
  validateComponentLinks: boolean,
  dependencies: SceneCompositionDependency[],
  activeModules: ActiveModule[],
): Promise<ModuleContribution> {
  const contribution: ModuleContribution = {
    prefabs: deepClone(document.resources.prefabs ?? []),
    nodes: deepClone(document.nodes),
  };

  for (const sceneImport of document.imports ?? []) {
    assertSafeImport(sceneImport);
    const childNamespace = joinNamespace(namespace, sceneImport.id);
    const resolution = await resolveImport(resolve, sceneImport, {
      importer: source,
      namespace: childNamespace,
    });
    const cycleIndex = activeModules.findIndex(
      (active) => active.source === resolution.source,
    );
    if (cycleIndex !== -1) {
      const cycle = [
        ...activeModules.slice(cycleIndex).map((active) => active.source),
        resolution.source,
      ];
      throw new Error(`Scene import cycle detected: ${cycle.join(' -> ')}`);
    }

    const childDocument = parseAndValidateDocument(
      resolution.document,
      `scene module "${resolution.source}" at "${childNamespace}"`,
      componentCatalog,
      validateAuthoringWorkflow,
      validateComponentLinks,
    );
    dependencies.push({
      id: sceneImport.id,
      namespace: childNamespace,
      src: sceneImport.src,
      source: resolution.source,
      ...(source == null ? {} : { importer: source }),
    });
    const childContribution = await collectModuleContribution(
      childDocument,
      resolution.source,
      childNamespace,
      true,
      resolve,
      componentCatalog,
      validateAuthoringWorkflow,
      validateComponentLinks,
      dependencies,
      [
        ...activeModules,
        { namespace: childNamespace, source: resolution.source },
      ],
    );
    const namespaced = namespaceContribution(childContribution, sceneImport.id);
    contribution.prefabs.push(...namespaced.prefabs);
    contribution.nodes.push({
      id: sceneImport.id,
      content: { type: 'group' },
      ...(sceneImport.transform == null
        ? {}
        : { transform: deepClone(sceneImport.transform) }),
      children: namespaced.nodes,
    });
  }

  return contribution;
}

async function resolveImport(
  resolve: SceneModuleResolver,
  sceneImport: SceneImport,
  context: { importer?: string; namespace: string },
): Promise<SceneModuleResolution> {
  let resolution: SceneModuleResolution;
  try {
    resolution = await resolve({
      id: sceneImport.id,
      src: sceneImport.src,
      ...(context.importer == null ? {} : { importer: context.importer }),
      namespace: context.namespace,
    });
  } catch (error) {
    throw new Error(
      `Failed to resolve scene import "${context.namespace}" from "${sceneImport.src}": ${errorMessage(
        error,
      )}`,
    );
  }
  if (!isPlainObject(resolution)) {
    throw new Error(
      `Resolver result for scene import "${context.namespace}" must be an object`,
    );
  }
  if (
    typeof resolution.source !== 'string' ||
    resolution.source.trim().length === 0
  ) {
    throw new Error(
      `Resolver result for scene import "${context.namespace}" requires a canonical source`,
    );
  }
  if (!('document' in resolution)) {
    throw new Error(
      `Resolver result for scene import "${context.namespace}" requires a document`,
    );
  }
  return {
    source: resolution.source,
    document: resolution.document,
  };
}

function parseAndValidateDocument(
  value: unknown,
  label: string,
  componentCatalog: SceneComponentCatalog | undefined,
  validateAuthoringWorkflow: boolean,
  validateComponentLinks: boolean,
): SceneDocument {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (error) {
      throw new Error(`${label} is not valid JSON: ${errorMessage(error)}`);
    }
  }
  try {
    assertValidSceneDocument(parsed, {
      componentCatalog,
      validateAuthoringWorkflow,
      validateComponentLinks,
    });
  } catch (error) {
    throw new Error(`${label} is invalid: ${errorMessage(error)}`);
  }
  return deepClone(parsed);
}

function assertSafeImport(sceneImport: SceneImport) {
  if (!SAFE_IMPORT_ID_PATTERN.test(sceneImport.id)) {
    throw new Error(
      `Unsafe scene import id "${sceneImport.id}"; use an ASCII letter followed by ASCII letters, digits, "_", or "-"`,
    );
  }
}

function namespaceContribution(
  contribution: ModuleContribution,
  namespace: string,
): ModuleContribution {
  return {
    prefabs: contribution.prefabs.map((prefab) => ({
      ...deepClone(prefab),
      id: namespaceId(namespace, prefab.id),
      root: namespaceNode(prefab.root, namespace),
    })),
    nodes: contribution.nodes.map((node) => namespaceNode(node, namespace)),
  };
}

function namespaceNode(node: SceneNode, namespace: string): SceneNode {
  const constraints =
    node.constraints == null ? undefined : deepClone(node.constraints);

  return {
    ...deepClone(node),
    id: namespaceId(namespace, node.id),
    ...(node.content == null
      ? {}
      : { content: namespaceNodeContent(node.content, namespace) }),
    ...(constraints == null ? {} : { constraints }),
    ...(node.components == null
      ? {}
      : { components: namespaceComponents(node.components, namespace) }),
    ...(node.children == null
      ? {}
      : {
          children: node.children.map((child) =>
            namespaceNode(child, namespace),
          ),
        }),
  };
}

function namespaceNodeContent(
  source: SceneNodeContent,
  namespace: string,
): SceneNodeContent {
  const content = deepClone(source);
  switch (content.type) {
    case 'asset':
      // Manifest asset IDs are application-global and remain stable across
      // imported scene modules.
      break;
    case 'instance':
    case 'pattern':
      content.prefab = namespaceId(namespace, content.prefab);
      if (content.overrides != null) {
        content.overrides = namespacePrefabOverrides(
          content.overrides,
          namespace,
        );
      }
      break;
    case 'group':
      break;
  }
  return content;
}

function namespacePrefabOverrides(
  overrides: Record<string, ScenePrefabNodeOverride>,
  namespace: string,
) {
  return Object.fromEntries(
    Object.entries(overrides).map(([nodeId, source]) => {
      const override = deepClone(source);
      if (override.components != null) {
        override.components = namespaceComponents(
          override.components,
          namespace,
        );
      }
      return [namespaceId(namespace, nodeId), override];
    }),
  );
}

function namespaceComponents(
  components: Record<string, SceneComponentValue>,
  _namespace: string,
) {
  return deepClone(components);
}

function namespaceId(namespace: string, id: string) {
  return `${namespace}/${id}`;
}

function joinNamespace(parent: string | undefined, id: string) {
  return parent == null ? id : namespaceId(parent, id);
}

function contributionToResources(
  contribution: ModuleContribution,
  rootResources: SceneResources,
): SceneResources {
  return {
    ...(contribution.prefabs.length > 0 || rootResources.prefabs != null
      ? { prefabs: contribution.prefabs }
      : {}),
  };
}

function normalizeOptionalSource(source: string | undefined, label: string) {
  if (source == null) {
    return undefined;
  }
  if (source.trim().length === 0) {
    throw new Error(`${label} must not be blank`);
  }
  return source;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
