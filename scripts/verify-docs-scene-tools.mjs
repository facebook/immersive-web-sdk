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
  'packages',
  'cli',
  'src',
  'runtime-contract.ts',
);
const DOC_TARGETS = ['docs/public/skill.md', 'docs/public/go.md'];
const REQUIRED_AGENT_GUIDE_TOOLS = [
  'scene_list_assets',
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
];

function extractMatches(text, regex) {
  const matches = [];
  for (const match of text.matchAll(regex)) {
    matches.push({
      name: match[1] ?? match[0],
      offset: match.index ?? 0,
    });
  }
  return matches;
}

function lineNumberFor(text, offset) {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

function loadContractTools() {
  const source = readFileSync(CONTRACT_PATH, 'utf8');
  return new Set(
    extractMatches(source, /name:\s*['"](scene_[a-z0-9_]+)['"]/g).map(
      (match) => match.name,
    ),
  );
}

function loadDocumentedTools() {
  const docs = new Map();
  for (const relativePath of DOC_TARGETS) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    const text = readFileSync(absolutePath, 'utf8');
    const tools = extractMatches(text, /\b(scene_[a-z0-9_]+)\b/g).map(
      (match) => ({
        line: lineNumberFor(text, match.offset),
        name: match.name,
      }),
    );
    docs.set(relativePath, tools);
  }
  return docs;
}

function main() {
  const contractTools = loadContractTools();
  const docs = loadDocumentedTools();
  const failures = [];
  const documentedTools = new Set();

  for (const [relativePath, tools] of docs) {
    for (const tool of tools) {
      documentedTools.add(tool.name);
      if (!contractTools.has(tool.name)) {
        failures.push(
          `${relativePath}:${tool.line} documents ${tool.name}, but it is missing from the canonical MCP contract`,
        );
      }
    }
  }

  const skillTools = new Set(
    (docs.get('docs/public/skill.md') ?? []).map((tool) => tool.name),
  );
  for (const requiredTool of REQUIRED_AGENT_GUIDE_TOOLS) {
    if (!skillTools.has(requiredTool)) {
      failures.push(
        `docs/public/skill.md does not document required native scene tool ${requiredTool}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('Scene tool docs verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Scene tool docs check passed: ${documentedTools.size} documented scene tools all exist in the canonical MCP contract.`,
  );
}

main();
