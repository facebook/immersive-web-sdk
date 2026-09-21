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
const EDITOR_RUNTIME_SOURCE_PATH = path.join(
  REPO_ROOT,
  'packages',
  'vite-plugin-dev',
  'src',
  'editor',
  'editor-runtime-source.ts',
);
const MCP_TOOLS_DOC_PATH = 'docs/ai/mcp-tools.md';
const REQUIRED_FLATTEN_DOC_PATHS = [MCP_TOOLS_DOC_PATH, 'docs/ai/workflows.md'];
const DOC_TARGETS = [
  'docs/public/skill.md',
  'docs/public/go.md',
  ...REQUIRED_FLATTEN_DOC_PATHS,
];
const REQUIRED_AGENT_GUIDE_TOOLS = [
  'scene_open',
  'scene_render_file',
  'scene_flatten_file',
  'scene_get_state',
  'scene_get_capabilities',
  'scene_select',
  'scene_set_camera',
  'scene_screenshot',
  'scene_set_preview_visibility',
  'scene_measure_image_regions',
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

function loadContractTools(source) {
  const array =
    /export\s+const\s+SCENE_MCP_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s+as\s+const/.exec(
      source,
    )?.[1] ?? '';
  return new Set(
    extractMatches(array, /['"](scene_[a-z0-9_]+)['"]/g).map(
      (match) => match.name,
    ),
  );
}

function extractBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(
      `Could not find required block from ${JSON.stringify(startMarker)} to ${JSON.stringify(endMarker)}`,
    );
  }
  return text.slice(start, end);
}

function parseContractDefaultViews(property) {
  const defaultText = /Defaults to ([^.'\n]+)/u.exec(property)?.[1];
  if (defaultText == null) {
    throw new Error('Could not find the asset_render_preview views default');
  }
  return defaultText
    .split(',')
    .map((view) => view.trim().replace(/^and\s+/u, ''))
    .filter(Boolean);
}

function loadRuntimeAssetPreviewDefaultViews(source) {
  const block =
    /const ASSET_PREVIEW_DEFAULT_VIEWS = Object\.freeze\(\[([\s\S]*?)\]\);/u.exec(
      source,
    )?.[1];
  if (block == null) {
    throw new Error('Could not find ASSET_PREVIEW_DEFAULT_VIEWS');
  }
  return extractMatches(block, /['"]([^'"]+)['"]/gu).map((match) => match.name);
}

function loadRuntimeAssetPreviewFocusLimit(source) {
  const maximum = /const ASSET_PREVIEW_FOCUS_INPUT_LENGTH_LIMIT = (\d+);/u.exec(
    source,
  )?.[1];
  if (maximum == null) {
    throw new Error('Could not find ASSET_PREVIEW_FOCUS_INPUT_LENGTH_LIMIT');
  }
  return maximum;
}

function loadAssetPreviewContract(source) {
  const tool = extractBlock(
    source,
    "name: 'asset_render_preview'",
    "name: 'ui_list_assets'",
  );
  const fields = new Map();
  for (const name of [
    'views',
    'mode',
    'focus',
    'width',
    'height',
    'background',
  ]) {
    const property = new RegExp(
      `\\n        ${name}: \\{([\\s\\S]*?)\\n        \\},`,
    ).exec(tool)?.[1];
    const rawDefaultValue = /Defaults to ([^.'\n]+)/u.exec(property ?? '')?.[1];
    const defaultItems =
      name === 'views' ? parseContractDefaultViews(property ?? '') : undefined;
    const defaultValue =
      defaultItems == null ? rawDefaultValue : `${defaultItems.length} views`;
    const minimum = /minimum:\s*(\d+)/u.exec(property ?? '')?.[1];
    const maximum = /maximum:\s*(\d+)/u.exec(property ?? '')?.[1];
    const minItems = /minItems:\s*(\d+)/u.exec(property ?? '')?.[1];
    const maxItems = /maxItems:\s*(\d+)/u.exec(property ?? '')?.[1];
    const maxLength = /maxLength:\s*(\d+)/u.exec(property ?? '')?.[1];
    fields.set(name, {
      defaultItems,
      defaultValue,
      maximum: maximum ?? maxItems ?? maxLength,
      minimum: minimum ?? minItems,
    });
  }
  return fields;
}

function loadDocumentedAssetPreviewContract() {
  const text = readFileSync(path.join(REPO_ROOT, MCP_TOOLS_DOC_PATH), 'utf8');
  const section = extractBlock(
    text,
    '### `asset_render_preview`',
    '## Modular Scenes',
  );
  const fields = new Map();
  for (const line of section.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    const name = /^`(views|mode|focus|width|height|background)`$/u.exec(
      cells[0] ?? '',
    )?.[1];
    if (name != null) {
      fields.set(name, {
        defaultValue: cells[3],
        minimum: cells[4],
        maximum: cells[5],
      });
    }
  }
  return fields;
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
  const contractSource = readFileSync(CONTRACT_PATH, 'utf8');
  const contractTools = loadContractTools(contractSource);
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
  for (const relativePath of REQUIRED_FLATTEN_DOC_PATHS) {
    const tools = new Set(
      (docs.get(relativePath) ?? []).map((tool) => tool.name),
    );
    if (!tools.has('scene_flatten_file')) {
      failures.push(
        relativePath + ' does not document required scene_flatten_file',
      );
    }
  }

  const contractFields = loadAssetPreviewContract(contractSource);
  const runtimeDefaultViews = loadRuntimeAssetPreviewDefaultViews(
    readFileSync(EDITOR_RUNTIME_SOURCE_PATH, 'utf8'),
  );
  const runtimeFocusLimit = loadRuntimeAssetPreviewFocusLimit(
    readFileSync(EDITOR_RUNTIME_SOURCE_PATH, 'utf8'),
  );
  const contractDefaultViews = contractFields.get('views')?.defaultItems ?? [];
  if (
    JSON.stringify(runtimeDefaultViews) !== JSON.stringify(contractDefaultViews)
  ) {
    failures.push(
      `asset_render_preview defaults to ${contractDefaultViews.join(', ')} in the canonical MCP contract, but the editor runtime uses ${runtimeDefaultViews.join(', ')}`,
    );
  }
  const contractFocusLimit = contractFields.get('focus')?.maximum;
  if (runtimeFocusLimit !== contractFocusLimit) {
    failures.push(
      `asset_render_preview focus allows ${contractFocusLimit ?? 'missing'} characters in the canonical MCP contract, but the editor runtime uses ${runtimeFocusLimit}`,
    );
  }
  const documentedFields = loadDocumentedAssetPreviewContract();
  const comparedFields = new Map([
    ['views', ['defaultValue', 'minimum', 'maximum']],
    ['mode', ['defaultValue']],
    ['focus', ['maximum']],
    ['width', ['defaultValue', 'minimum', 'maximum']],
    ['height', ['defaultValue', 'minimum', 'maximum']],
    ['background', ['defaultValue']],
  ]);
  for (const [name, keys] of comparedFields) {
    const expected = contractFields.get(name);
    const documented = documentedFields.get(name);
    for (const key of keys) {
      if (expected?.[key] !== documented?.[key]) {
        failures.push(
          `${MCP_TOOLS_DOC_PATH} documents asset_render_preview ${name}.${key} as ${documented?.[key] ?? 'missing'}, but the canonical MCP contract uses ${expected?.[key] ?? 'missing'}`,
        );
      }
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
