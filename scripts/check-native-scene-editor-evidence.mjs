#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const DEFAULT_EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs/test-evidence/native-scene-editor/current',
);

const REQUIRED_JSON_FILES = [
  'proof.json',
  'network.json',
  'console.json',
  'scene-before.json',
  'scene-after.json',
  'hierarchy-before.json',
  'hierarchy-after.json',
  'proof-after-reload.json',
  'app-after-reload-proof.json',
  'camera-states.json',
  'image-diff.json',
  'performance.json',
  'workspace-proof.json',
];

const REQUIRED_PNG_FILES = [
  'editor-top.png',
  'editor-front.png',
  'editor-right.png',
  'editor-quarter.png',
  'app-after-reload.png',
  'workspace-create-scene.png',
  'workspace-editor.png',
  'workspace-runtime.png',
  'workspace-scene-picker.png',
  'workspace-split.png',
];

const REQUIRED_CAMERA_VIEWS = ['top', 'front', 'right', 'quarter'];
const MIN_PNG_BYTES = 1000;
const PNG_SIGNATURE = '89504e470d0a1a0a';

function parseArgs(argv) {
  const options = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    writeManifest: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--evidence-dir') {
      const next = argv[index + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--evidence-dir requires a path');
      }
      options.evidenceDir = path.resolve(next);
      index += 1;
    } else if (arg === '--no-write-manifest') {
      options.writeManifest = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-native-scene-editor-evidence.mjs [options]

Options:
  --evidence-dir <path>   Native scene editor evidence directory.
                          Defaults to docs/test-evidence/native-scene-editor/current.
  --no-write-manifest     Do not write evidence-manifest.json after validation.
  -h, --help              Show this help.
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  const checks = [];

  const assert = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };

  assert(
    existsSync(options.evidenceDir),
    `Evidence directory does not exist: ${options.evidenceDir}`,
  );
  if (!existsSync(options.evidenceDir)) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }

  const json = new Map();
  for (const file of REQUIRED_JSON_FILES) {
    const fullPath = path.join(options.evidenceDir, file);
    assert(existsSync(fullPath), `Missing required JSON evidence: ${file}`);
    if (!existsSync(fullPath)) {
      continue;
    }
    try {
      json.set(file, JSON.parse(readFileSync(fullPath, 'utf8')));
      checks.push(`parsed ${file}`);
    } catch (error) {
      failures.push(
        `Invalid JSON evidence ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const file of REQUIRED_PNG_FILES) {
    const fullPath = path.join(options.evidenceDir, file);
    assert(existsSync(fullPath), `Missing required PNG evidence: ${file}`);
    if (!existsSync(fullPath)) {
      continue;
    }
    const buffer = readFileSync(fullPath);
    assert(
      buffer.length > MIN_PNG_BYTES,
      `${file} is too small to be useful evidence (${buffer.length} bytes)`,
    );
    assert(
      buffer.subarray(0, 8).toString('hex') === PNG_SIGNATURE,
      `${file} is not a PNG file`,
    );
    checks.push(`validated ${file}`);
  }

  const proof = json.get('proof.json');
  const proofAfterReload = json.get('proof-after-reload.json');
  const appAfterReload = json.get('app-after-reload-proof.json');
  const network = json.get('network.json');
  const consoleEvidence = json.get('console.json');
  const sceneBefore = json.get('scene-before.json');
  const sceneAfter = json.get('scene-after.json');
  const hierarchyBefore = json.get('hierarchy-before.json');
  const hierarchyAfter = json.get('hierarchy-after.json');
  const cameraStates = json.get('camera-states.json');
  const imageDiff = json.get('image-diff.json');
  const performanceEvidence = json.get('performance.json');
  const workspaceProof = json.get('workspace-proof.json');
  const determinism = readOptionalJson(
    path.join(options.evidenceDir, 'screenshot-determinism-proof.json'),
    failures,
  );

  if (proof != null) {
    assertEditorProof(assert, 'proof.json', proof, { minNodeCount: 1 });
    checks.push('validated initial editor WebGL proof');
  }
  if (proofAfterReload != null) {
    assertEditorProof(assert, 'proof-after-reload.json', proofAfterReload, {
      minNodeCount: 2,
    });
    checks.push('validated post-reload editor WebGL proof');
  }
  if (appAfterReload != null) {
    assertAppProof(assert, appAfterReload);
    checks.push('validated app reload proof');
  }
  if (network != null) {
    assertNetworkEvidence(assert, network);
    checks.push('validated network evidence');
  }
  if (consoleEvidence != null) {
    assertConsoleEvidence(assert, consoleEvidence);
    checks.push('validated console evidence');
  }
  if (sceneBefore != null && sceneAfter != null) {
    assertSceneMutationEvidence(assert, sceneBefore, sceneAfter);
    checks.push('validated scene mutation evidence');
  }
  if (hierarchyBefore != null && hierarchyAfter != null) {
    assertHierarchyEvidence(
      assert,
      hierarchyBefore,
      hierarchyAfter,
      sceneAfter,
    );
    checks.push('validated hierarchy evidence');
  }
  if (cameraStates != null && imageDiff != null) {
    assertCameraEvidence(assert, cameraStates, imageDiff);
    checks.push('validated camera and image-diff evidence');
  }
  if (performanceEvidence != null) {
    assertPerformanceEvidence(assert, performanceEvidence);
    checks.push('validated performance threshold evidence');
  }
  if (workspaceProof != null) {
    assertWorkspaceEvidence(assert, workspaceProof);
    checks.push('validated managed workspace evidence');
  }
  if (determinism != null) {
    assertDeterminismEvidence(assert, determinism);
    checks.push('validated screenshot determinism evidence');
  }
  if (sceneAfter != null && appAfterReload != null && hierarchyAfter != null) {
    assertReloadParity(assert, sceneAfter, appAfterReload, hierarchyAfter);
    checks.push('validated saved scene, app reload, and hierarchy parity');
  }

  if (failures.length > 0) {
    printFailures(failures);
    process.exitCode = 1;
    return;
  }

  const manifest = buildManifest(options.evidenceDir, checks);
  if (options.writeManifest) {
    writeFileSync(
      path.join(options.evidenceDir, 'evidence-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  console.log(
    `Native scene editor evidence passed: ${checks.length} checks, ${REQUIRED_JSON_FILES.length} JSON files, ${REQUIRED_PNG_FILES.length} PNG files.`,
  );
}

function assertEditorProof(assert, label, proof, options) {
  assert(isObject(proof), `${label} must be a JSON object`);
  assert(proof.renderer === 'iwsdk-webgl', `${label} must use iwsdk-webgl`);
  assert(proof.webgl === true, `${label} must report webgl: true`);
  assert(
    proof.uses2DRenderer === false,
    `${label} must reject the 2D placeholder renderer`,
  );
  assert(proof.worldReady === true, `${label} must report worldReady: true`);
  assert(
    typeof proof.webglContextType === 'string' &&
      /WebGL/i.test(proof.webglContextType),
    `${label} must include a WebGL context type`,
  );
  assertPositiveNumber(proof.canvasWidth, `${label}.canvasWidth`, assert, 100);
  assertPositiveNumber(
    proof.canvasHeight,
    `${label}.canvasHeight`,
    assert,
    100,
  );
  assertPositiveNumber(proof.meshCount, `${label}.meshCount`, assert);
  assertPositiveNumber(proof.materialCount, `${label}.materialCount`, assert);
  assert(
    typeof proof.nodeObjectCount === 'number' &&
      proof.nodeObjectCount >= options.minNodeCount,
    `${label}.nodeObjectCount must be >= ${options.minNodeCount}`,
  );
  assert(
    Array.isArray(proof.objectHierarchy) && proof.objectHierarchy.length > 0,
    `${label} must include objectHierarchy entries`,
  );
  if (Array.isArray(proof.objectHierarchy)) {
    for (const entry of proof.objectHierarchy) {
      assert(
        isObject(entry) && typeof entry.nodeId === 'string',
        `${label}.objectHierarchy entries must include nodeId`,
      );
      assertVector(
        entry.worldPosition,
        `${label}.${entry.nodeId}.worldPosition`,
        assert,
      );
    }
  }
  assert(
    Array.isArray(proof.assetLoads) && proof.assetLoads.length > 0,
    `${label} must include loaded asset evidence`,
  );
  if (Array.isArray(proof.assetLoads)) {
    for (const load of proof.assetLoads) {
      assert(
        isObject(load) &&
          typeof load.assetId === 'string' &&
          load.status === 'loaded' &&
          typeof load.url === 'string',
        `${label}.assetLoads entries must include loaded asset id and URL`,
      );
    }
  }
}

function assertAppProof(assert, proof) {
  assert(isObject(proof), 'app-after-reload-proof.json must be an object');
  assert(
    proof.renderer === 'iwsdk-webgl',
    'app-after-reload-proof.json must use iwsdk-webgl',
  );
  assert(proof.webgl === true, 'app-after-reload-proof.json must be WebGL');
  assert(
    typeof proof.nodeCount === 'number' && proof.nodeCount >= 2,
    'app-after-reload-proof.json must include at least two saved nodes',
  );
  assert(
    Array.isArray(proof.importedEntities) &&
      proof.importedEntities.length >= proof.nodeCount,
    'app-after-reload-proof.json must include imported runtime entities',
  );
  if (Array.isArray(proof.nodes)) {
    for (const node of proof.nodes) {
      assert(
        isObject(node) && typeof node.id === 'string',
        'app-after-reload-proof.json nodes must include ids',
      );
      assertVector(node.position, `app node ${node.id} position`, assert);
    }
  }
}

function assertNetworkEvidence(assert, network) {
  assert(isObject(network), 'network.json must be an object');
  assert(
    Array.isArray(network.editorAssetResponses) &&
      network.editorAssetResponses.length > 0,
    'network.json must include editor asset responses',
  );
  for (const response of network.editorAssetResponses ?? []) {
    assertGoodResponse(assert, 'editor asset response', response);
  }
  for (const response of network.editorModuleResponses ?? []) {
    assertGoodResponse(assert, 'editor module response', response);
  }
  assert(
    Array.isArray(network.editorRequestFailures) &&
      network.editorRequestFailures.length === 0,
    'network.json must not include editor request failures',
  );
}

function assertGoodResponse(assert, label, response) {
  assert(
    isObject(response) &&
      typeof response.url === 'string' &&
      typeof response.status === 'number' &&
      ((response.status >= 200 && response.status < 400) ||
        response.status === 304),
    `${label} must be a successful HTTP response`,
  );
}

function assertConsoleEvidence(assert, consoleEvidence) {
  assert(isObject(consoleEvidence), 'console.json must be an object');
  for (const key of ['appErrors', 'editorErrors']) {
    assert(
      Array.isArray(consoleEvidence[key]) && consoleEvidence[key].length === 0,
      `console.json ${key} must be empty`,
    );
  }
}

function assertSceneMutationEvidence(assert, before, after) {
  assertSceneDocument(assert, 'scene-before.json', before);
  assertSceneDocument(assert, 'scene-after.json', after);
  if (Array.isArray(before.nodes) && Array.isArray(after.nodes)) {
    assert(
      after.nodes.length > before.nodes.length,
      'scene-after.json must contain the saved added node',
    );
    const beforeIds = new Set(before.nodes.map((node) => node.id));
    const afterIds = new Set(after.nodes.map((node) => node.id));
    for (const id of beforeIds) {
      assert(afterIds.has(id), `scene-after.json dropped original node ${id}`);
    }
    assert(
      JSON.stringify(before.nodes) !== JSON.stringify(after.nodes),
      'scene-after.json must differ from scene-before.json',
    );
  }
}

function assertSceneDocument(assert, label, scene) {
  assert(isObject(scene), `${label} must be an object`);
  assert(scene.version === 'iwsdk.scene.v1', `${label} must be iwsdk.scene.v1`);
  assert(scene.units === 'meters', `${label} must use meters`);
  assert(isObject(scene.resources), `${label} must include resources`);
  assert(
    Array.isArray(scene.resources?.assets),
    `${label} resources must include assets`,
  );
  assert(Array.isArray(scene.nodes), `${label} must include nodes`);
}

function assertHierarchyEvidence(assert, before, after, sceneAfter) {
  const beforeHierarchy = getHierarchy(before);
  const afterHierarchy = getHierarchy(after);
  assert(beforeHierarchy.length > 0, 'hierarchy-before.json must not be empty');
  assert(
    afterHierarchy.length >= beforeHierarchy.length,
    'hierarchy-after.json must preserve or add hierarchy entries',
  );
  const afterIds = new Set(
    flattenHierarchy(afterHierarchy).map((entry) => entry.id),
  );
  for (const node of sceneAfter?.nodes ?? []) {
    assert(
      afterIds.has(node.id),
      `hierarchy-after.json missing saved scene node ${node.id}`,
    );
  }
}

function assertCameraEvidence(assert, cameraStates, imageDiff) {
  assert(
    Array.isArray(cameraStates.screenshots),
    'camera-states.json must include screenshots',
  );
  const byView = new Map();
  for (const screenshot of cameraStates.screenshots ?? []) {
    if (!byView.has(screenshot.view)) {
      byView.set(screenshot.view, screenshot);
    }
  }
  const requiredHashes = new Set();
  for (const view of REQUIRED_CAMERA_VIEWS) {
    const screenshot = byView.get(view);
    assert(screenshot != null, `camera-states.json missing ${view} view`);
    if (screenshot == null) {
      continue;
    }
    assert(
      screenshot.mimeType === 'image/png',
      `camera-states.json ${view} screenshot must be PNG`,
    );
    assertPositiveNumber(
      screenshot.imageDataLength,
      `camera-states.json ${view} imageDataLength`,
      assert,
      MIN_PNG_BYTES,
    );
    assert(
      typeof screenshot.hash === 'string' && screenshot.hash.length >= 32,
      `camera-states.json ${view} must include an image hash`,
    );
    assertVector(
      screenshot.camera?.position,
      `camera-states.json ${view} camera position`,
      assert,
    );
    requiredHashes.add(screenshot.hash);
  }
  assert(
    requiredHashes.size === REQUIRED_CAMERA_VIEWS.length,
    'required named camera views must produce distinct image hashes',
  );

  assert(isObject(imageDiff), 'image-diff.json must be an object');
  assert(imageDiff.matches === false, 'image-diff.json must prove a mismatch');
  assert(
    imageDiff.first?.hash !== imageDiff.second?.hash,
    'image-diff.json first and second hashes must differ',
  );
  assert(
    imageDiff.first?.camera?.view !== imageDiff.second?.camera?.view,
    'image-diff.json must compare different camera views',
  );
  assertVector(
    imageDiff.first?.camera?.position,
    'image-diff.json first camera position',
    assert,
  );
  assertVector(
    imageDiff.second?.camera?.position,
    'image-diff.json second camera position',
    assert,
  );
}

function assertDeterminismEvidence(assert, determinism) {
  assert(
    isObject(determinism),
    'screenshot-determinism-proof.json must be an object',
  );
  for (const key of ['explicit', 'sameNamed']) {
    const entry = determinism[key];
    assert(
      isObject(entry),
      `screenshot-determinism-proof.json ${key} must exist`,
    );
    assert(entry?.matches === true, `${key} screenshots must be deterministic`);
    assert(
      entry?.firstHash === entry?.secondHash,
      `${key} screenshots must have matching hashes`,
    );
    assertPositiveNumber(
      entry?.firstLength,
      `${key}.firstLength`,
      assert,
      MIN_PNG_BYTES,
    );
    assertPositiveNumber(
      entry?.secondLength,
      `${key}.secondLength`,
      assert,
      MIN_PNG_BYTES,
    );
  }
}

function assertPerformanceEvidence(assert, performanceEvidence) {
  assert(isObject(performanceEvidence), 'performance.json must be an object');
  assert(
    isObject(performanceEvidence.thresholds),
    'performance.json must include thresholds',
  );
  assert(
    isObject(performanceEvidence.timings),
    'performance.json must include timings',
  );
  for (const [key, threshold] of Object.entries(
    performanceEvidence.thresholds ?? {},
  )) {
    assertPositiveNumber(threshold, `performance threshold ${key}`, assert);
    const actual = performanceEvidence.timings?.[key];
    assert(
      typeof actual === 'number' &&
        Number.isFinite(actual) &&
        actual >= 0 &&
        actual <= threshold,
      `performance timing ${key} must be within ${threshold}ms threshold`,
    );
  }
  for (const requiredKey of [
    'appInitialReadyMs',
    'editorStartupMs',
    'singleScreenshotCaptureMs',
    'namedScreenshotBatchMs',
    'compareScreenshotsMs',
    'explicitScreenshotPairMs',
    'transformCommitMs',
  ]) {
    assert(
      typeof performanceEvidence.timings?.[requiredKey] === 'number',
      `performance.json missing ${requiredKey}`,
    );
  }
}

function assertWorkspaceEvidence(assert, workspaceProof) {
  assert(
    isObject(workspaceProof),
    'workspace-proof.json must be a JSON object',
  );
  const viewStates = workspaceProof.viewStates;
  assert(isObject(viewStates), 'workspace-proof.json must include viewStates');

  for (const view of ['runtime', 'editor', 'split']) {
    const state = viewStates?.[view];
    assert(isObject(state), `workspace-proof.json missing ${view} state`);
    assert(state?.managed === true, `${view} workspace state must be managed`);
    assert(state?.view === view, `${view} workspace state must report view`);
    assert(
      typeof state?.workspace?.pageId === 'string' &&
        state.workspace.pageId.length > 0,
      `${view} workspace state must include a workspace page id`,
    );
    assert(
      state?.runtime?.ready === true,
      `${view} workspace state must include ready runtime target`,
    );
    assert(
      state?.editor?.ready === true,
      `${view} workspace state must include ready editor target`,
    );
    assert(
      typeof state?.editor?.sceneSessionId === 'string' &&
        state.editor.sceneSessionId.length > 0,
      `${view} workspace state must include scene session id`,
    );
  }

  const pickerState = workspaceProof.pickerState;
  assert(
    pickerState?.view === 'editor',
    'workspace picker state must open in editor view',
  );
  assert(
    pickerState?.editor?.ready === false &&
      pickerState?.editor?.scenePath == null,
    'workspace picker state must represent no active scene',
  );

  const createState = workspaceProof.createState;
  assert(
    createState?.editor?.ready === true,
    'workspace create flow must open a scene editor session',
  );
  assert(
    createState?.editor?.scenePath ===
      'public/scenes/evidence-create-flow.iwsdk.scene.json',
    'workspace create flow must open the created scene path',
  );
}

function assertReloadParity(
  assert,
  sceneAfter,
  appAfterReload,
  hierarchyAfter,
) {
  const appNodeIds = new Set(
    (appAfterReload.nodes ?? []).map((node) => node.id),
  );
  const entityIds = new Set(
    (appAfterReload.importedEntities ?? []).map((entity) => entity.id),
  );
  const hierarchyIds = new Set(
    flattenHierarchy(getHierarchy(hierarchyAfter)).map((entry) => entry.id),
  );

  for (const node of sceneAfter.nodes ?? []) {
    assert(appNodeIds.has(node.id), `app reload missing node ${node.id}`);
    assert(
      entityIds.has(node.id),
      `runtime entity import missing node ${node.id}`,
    );
    assert(
      hierarchyIds.has(node.id),
      `editor hierarchy missing node ${node.id}`,
    );

    const appNode = (appAfterReload.nodes ?? []).find(
      (entry) => entry.id === node.id,
    );
    if (node.transform?.position != null && appNode?.position != null) {
      assertVectorsClose(
        node.transform.position,
        appNode.position,
        `saved/app position parity for ${node.id}`,
        assert,
      );
    }
  }
}

function readOptionalJson(fullPath, failures) {
  if (!existsSync(fullPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    failures.push(
      `Invalid JSON evidence ${path.basename(fullPath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function getHierarchy(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.hierarchy)) {
    return value.hierarchy;
  }
  return [];
}

function flattenHierarchy(entries) {
  const flattened = [];
  for (const entry of entries) {
    flattened.push(entry);
    if (Array.isArray(entry.children)) {
      flattened.push(...flattenHierarchy(entry.children));
    }
  }
  return flattened;
}

function assertPositiveNumber(value, label, assert, minimum = 0) {
  assert(
    typeof value === 'number' && Number.isFinite(value) && value > minimum,
    `${label} must be a finite number greater than ${minimum}`,
  );
}

function assertVector(value, label, assert) {
  assert(
    Array.isArray(value) &&
      value.length === 3 &&
      value.every(
        (entry) => typeof entry === 'number' && Number.isFinite(entry),
      ),
    `${label} must be a finite [x, y, z] vector`,
  );
}

function assertVectorsClose(first, second, label, assert) {
  const close =
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((entry, index) => Math.abs(entry - second[index]) < 1e-4);
  assert(close, `${label} vectors must match`);
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function buildManifest(evidenceDir, checks) {
  const jsonFiles = REQUIRED_JSON_FILES.map((file) =>
    getFileSummary(evidenceDir, file),
  );
  const pngFiles = REQUIRED_PNG_FILES.map((file) =>
    getFileSummary(evidenceDir, file),
  );

  return {
    browser: {
      engine: 'playwright-chromium',
    },
    commandLog: {
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      script: fileURLToPath(import.meta.url),
    },
    device: {
      editorFixtureDevice: 'metaQuest3 default IWSDK dev runtime',
      physicalDevice: 'not required for automated editor evidence',
    },
    evidenceDir,
    files: {
      json: jsonFiles,
      png: pngFiles,
    },
    generatedAt: new Date().toISOString(),
    packageVersions: getPackageVersions(),
    checks,
    environment: {
      arch: process.arch,
      node: process.version,
      platform: process.platform,
    },
  };
}

function getFileSummary(evidenceDir, file) {
  const fullPath = path.join(evidenceDir, file);
  const buffer = readFileSync(fullPath);
  return {
    bytes: statSync(fullPath).size,
    file,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function getPackageVersions() {
  const packages = [
    ['root', 'package.json'],
    ['@iwsdk/cli', 'packages/cli/package.json'],
    ['@iwsdk/core', 'packages/core/package.json'],
    ['@iwsdk/create', 'packages/create/package.json'],
    ['@iwsdk/example-assets', 'packages/example-assets/package.json'],
    ['@iwsdk/scene-composition', 'packages/scene-composition/package.json'],
    ['@iwsdk/starter-assets', 'packages/starter-assets/package.json'],
    ['@iwsdk/vite-plugin-dev', 'packages/vite-plugin-dev/package.json'],
  ];

  return Object.fromEntries(
    packages.map(([name, relativePath]) => {
      const fullPath = path.join(REPO_ROOT, relativePath);
      if (!existsSync(fullPath)) {
        return [name, null];
      }
      const pkg = JSON.parse(readFileSync(fullPath, 'utf8'));
      return [name, pkg.version ?? null];
    }),
  );
}

function printFailures(failures) {
  console.error('Native scene editor evidence failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
