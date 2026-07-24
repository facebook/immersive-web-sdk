#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'packages/cli/src/runtime-contract.ts',
);
const SESSION_PATH = path.join(
  REPO_ROOT,
  'packages/vite-plugin-dev/src/editor/scene-editor-session.ts',
);

function readSource(filePath) {
  return readFileSync(filePath, 'utf8');
}

function extractArray(source, exportName) {
  const regex = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`,
  );
  const match = regex.exec(source);
  if (match == null) {
    throw new Error(`Could not find exported const array ${exportName}`);
  }

  return extractSceneToolNames(match[1]);
}

function extractSceneToolNames(source) {
  return [...source.matchAll(/['"](scene_[a-z0-9_]+)['"]/g)].map(
    (match) => match[1],
  );
}

function extractRuntimeSceneTools(source) {
  return [
    ...source.matchAll(
      /name:\s*['"](scene_[a-z0-9_]+)['"][\s\S]*?inputSchema:/g,
    ),
  ].map((match) => match[1]);
}

function extractRuntimeCliPaths(source) {
  const match =
    /export\s+const\s+RUNTIME_CLI_PATHS:[\s\S]*?=\s*\{([\s\S]*?)\};/.exec(
      source,
    );
  if (match == null) {
    throw new Error('Could not find RUNTIME_CLI_PATHS');
  }

  return [...match[1].matchAll(/^\s*(scene_[a-z0-9_]+)\s*:/gm)].map(
    (entry) => entry[1],
  );
}

function extractDispatchCases(source) {
  const dispatchMatch =
    /async\s+dispatch\([\s\S]*?\)\s*:\s*Promise<unknown>\s*\{([\s\S]*?)\n\s*\}/.exec(
      source,
    );
  if (dispatchMatch == null) {
    throw new Error('Could not find SceneEditorSession.dispatch');
  }

  return extractSceneToolNames(dispatchMatch[1]);
}

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function assertUnique(label, values, failures) {
  if (values.length !== unique(values).length) {
    failures.push(`${label} contains duplicate tool names`);
  }
}

function assertSameSet(leftLabel, left, rightLabel, right, failures) {
  const missingFromRight = difference(left, right);
  const missingFromLeft = difference(right, left);

  if (missingFromRight.length > 0) {
    failures.push(
      `${rightLabel} is missing tools from ${leftLabel}: ${missingFromRight.join(
        ', ',
      )}`,
    );
  }

  if (missingFromLeft.length > 0) {
    failures.push(
      `${leftLabel} is missing tools from ${rightLabel}: ${missingFromLeft.join(
        ', ',
      )}`,
    );
  }
}

function main() {
  const contractSource = readSource(CONTRACT_PATH);
  const sessionSource = readSource(SESSION_PATH);
  const runtimeTools = unique(extractRuntimeSceneTools(contractSource));
  const editorContractTools = extractArray(
    contractSource,
    'SCENE_EDITOR_MCP_TOOL_NAMES',
  );
  const sceneFileTools = extractArray(
    contractSource,
    'SCENE_FILE_MCP_TOOL_NAMES',
  );
  const appRuntimeSceneTools = extractArray(
    contractSource,
    'APP_RUNTIME_SCENE_MCP_TOOL_NAMES',
  );
  const runtimeCliPathTools = unique(extractRuntimeCliPaths(contractSource));
  const sessionTools = extractArray(sessionSource, 'SCENE_EDITOR_TOOL_METHODS');
  const dispatchCases = unique(extractDispatchCases(sessionSource));
  const sessionRuntimeTools = runtimeTools.filter(
    (tool) =>
      !appRuntimeSceneTools.includes(tool) && !sceneFileTools.includes(tool),
  );
  const failures = [];

  assertUnique('SCENE_EDITOR_MCP_TOOL_NAMES', editorContractTools, failures);
  assertUnique('SCENE_FILE_MCP_TOOL_NAMES', sceneFileTools, failures);
  assertUnique(
    'APP_RUNTIME_SCENE_MCP_TOOL_NAMES',
    appRuntimeSceneTools,
    failures,
  );
  assertUnique('SCENE_EDITOR_TOOL_METHODS', sessionTools, failures);

  assertSameSet(
    'SCENE_EDITOR_MCP_TOOL_NAMES',
    editorContractTools,
    'SCENE_EDITOR_TOOL_METHODS',
    sessionTools,
    failures,
  );
  assertSameSet(
    'SCENE_EDITOR_MCP_TOOL_NAMES',
    editorContractTools,
    'SceneEditorSession.dispatch cases',
    dispatchCases,
    failures,
  );
  assertSameSet(
    'SCENE_EDITOR_MCP_TOOL_NAMES',
    editorContractTools,
    'RUNTIME_MCP_TOOLS scene tool definitions',
    sessionRuntimeTools,
    failures,
  );
  assertSameSet(
    'SCENE_FILE_MCP_TOOL_NAMES',
    sceneFileTools,
    'RUNTIME_MCP_TOOLS scene file tool definitions',
    runtimeTools.filter((tool) => sceneFileTools.includes(tool)),
    failures,
  );
  assertSameSet(
    'APP_RUNTIME_SCENE_MCP_TOOL_NAMES',
    appRuntimeSceneTools,
    'RUNTIME_MCP_TOOLS app-runtime scene tool definitions',
    runtimeTools.filter((tool) => appRuntimeSceneTools.includes(tool)),
    failures,
  );
  assertSameSet(
    'RUNTIME_MCP_TOOLS scene tool definitions',
    runtimeTools,
    'RUNTIME_CLI_PATHS scene entries',
    runtimeCliPathTools,
    failures,
  );

  if (failures.length > 0) {
    console.error('Scene editor tool contract verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Scene editor tool contract check passed: ${sorted(
      editorContractTools,
    ).join(', ')}`,
  );
}

main();
