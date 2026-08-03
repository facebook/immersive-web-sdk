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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = readFileSync(
  path.join(root, 'packages/cli/src/runtime-contract.ts'),
  'utf8',
);
const session = readFileSync(
  path.join(
    root,
    'packages/vite-plugin-dev/src/editor/scene-editor-session.ts',
  ),
  'utf8',
);

const expected = [
  'scene_open',
  'scene_render_file',
  'scene_flatten_file',
  'scene_get_state',
  'scene_get_capabilities',
  'scene_screenshot',
  'scene_select',
  'scene_set_camera',
  'scene_set_preview_visibility',
  'scene_measure_image_regions',
];

function array(source, name) {
  const match = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`,
  ).exec(source);
  if (!match) {
    throw new Error(`Missing ${name}`);
  }
  return [...match[1].matchAll(/['"](scene_[a-z0-9_]+)['"]/g)].map(
    (entry) => entry[1],
  );
}

function sameSet(actual, wanted) {
  return (
    actual.length === wanted.length &&
    actual.every((entry) => wanted.includes(entry))
  );
}

const publicTools = array(contract, 'SCENE_MCP_TOOL_NAMES');
const editorTools = array(contract, 'SCENE_EDITOR_MCP_TOOL_NAMES');
const fileTools = array(contract, 'SCENE_FILE_MCP_TOOL_NAMES');
const sessionTools = array(session, 'SCENE_EDITOR_TOOL_METHODS');
const failures = [];

if (!sameSet(publicTools, expected)) {
  failures.push(`SCENE_MCP_TOOL_NAMES must be exactly: ${expected.join(', ')}`);
}
if (!sameSet([...editorTools, ...fileTools], expected)) {
  failures.push(
    'Editor and file tool groups must partition the public surface',
  );
}
if (!sessionTools.every((tool) => publicTools.includes(tool))) {
  failures.push('SceneEditorSession exposes a non-public MCP method');
}
if (
  /workspace_open_scene/.test(arraySource(contract, 'SCENE_MCP_TOOL_NAMES'))
) {
  failures.push('workspace_open_scene must not be public');
}

function arraySource(source, name) {
  return (
    new RegExp(
      `export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`,
    ).exec(source)?.[1] ?? ''
  );
}

if (failures.length > 0) {
  console.error('Scene tool contract verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Scene tool contract check passed: ${publicTools.join(', ')}`);
}
