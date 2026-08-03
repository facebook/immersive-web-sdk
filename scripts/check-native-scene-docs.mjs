#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');

const REQUIRED_FILES = [
  'docs/guides/09-native-scene-editor.md',
  'docs/guides/09-native-scene-migration.md',
  'docs/guides/01-project-setup.md',
  'docs/guides/overview.md',
  'docs/troubleshooting/index.md',
  'docs/public/skill.md',
  'docs/public/go.md',
];

const REMOVED_FILES = ['docs/guides/09-meta-spatial-editor.md'];

const REQUIRED_NAV_PATTERNS = [
  {
    description: 'VitePress sidebar links to the native scene editor guide',
    file: 'docs/.vitepress/config.ts',
    regex: /\/guides\/09-native-scene-editor\b/,
  },
  {
    description: 'VitePress sidebar links to the native scene migration guide',
    file: 'docs/.vitepress/config.ts',
    regex: /\/guides\/09-native-scene-migration\b/,
  },
];

const FORBIDDEN_NAV_PATTERNS = [
  {
    description:
      'VitePress sidebar must not link to the old Meta Spatial guide',
    file: 'docs/.vitepress/config.ts',
    regex: /09-meta-spatial-editor\b/,
  },
];

const REQUIRED_CONTENT = [
  {
    file: 'docs/guides/09-native-scene-editor.md',
    patterns: [
      ['native scene editor title', /# Chapter 9: Native Scene Editor\b/],
      ['scene JSON extension', /\.iwsdk\.scene\.json\b/],
      ['public scenes path', /public\/scenes\b/],
      ['module imports', /\bimports\b/],
      ['file watcher', /watches the active root\b/],
      ['scene_open tool', /\bscene_open\b/],
      ['scene_render_file tool', /\bscene_render_file\b/],
      ['scene_get_state tool', /\bscene_get_state\b/],
      ['scene_get_capabilities tool', /\bscene_get_capabilities\b/],
      ['scene_set_camera tool', /\bscene_set_camera\b/],
      ['scene_screenshot tool', /\bscene_screenshot\b/],
      ['scene_select tool', /\bscene_select\b/],
      ['preview visibility tool', /\bscene_set_preview_visibility\b/],
      ['top camera view', /\btop\b/],
      ['front camera view', /\bfront\b/],
      ['left camera view', /\bleft\b/],
      ['right camera view', /\bright\b/],
      ['quarter camera view', /\bquarter\b/],
      ['orbit camera view', /\borbit\b/],
    ],
  },
  {
    file: 'docs/guides/09-native-scene-migration.md',
    patterns: [
      ['native scene migration title', /# Native Scene Migration\b/],
      ['new scene JSON path', /public\/scenes\b/],
      ['module workflow', /\bmodules\b/],
      ['scene_open workflow', /\bscene_open\b/],
      ['scene_render_file workflow', /\bscene_render_file\b/],
      ['scene_get_state workflow', /\bscene_get_state\b/],
      ['runtime parity', /Runtime Parity\b/],
    ],
  },
  {
    file: 'docs/guides/01-project-setup.md',
    patterns: [
      ['native editor guide link', /09-native-scene-editor\.md\b/],
      ['scene JSON path', /public\/scenes\b/],
    ],
  },
  {
    file: 'docs/guides/overview.md',
    patterns: [
      ['native scene JSON workflow', /Native scene JSON editing\b/],
      ['developer tools mention', /visual editors\b/],
    ],
  },
  {
    file: 'docs/troubleshooting/index.md',
    patterns: [
      ['scene JSON 404 troubleshooting', /Scene JSON 404\b/],
      ['public scenes troubleshooting', /\/public\/scenes\b/],
    ],
  },
  {
    file: 'docs/public/skill.md',
    patterns: [
      ['native scene composition section', /Native Scene Composition Tools\b/],
      [
        'multi-angle screenshot guidance',
        /top\b[\s\S]*front\b[\s\S]*left\b[\s\S]*right\b[\s\S]*quarter\b[\s\S]*orbit\b/,
      ],
    ],
  },
  {
    file: 'docs/public/go.md',
    patterns: [
      [
        'scene tool guidance',
        /\bscene_render_file\b[\s\S]*\bscene_get_state\b/,
      ],
      [
        'multi-angle screenshot guidance',
        /top\/front\/side or quarter screenshots\b/,
      ],
    ],
  },
];

const SELECTED_MARKDOWN_LINK_FILES = [
  'docs/guides/01-project-setup.md',
  'docs/guides/09-native-scene-editor.md',
  'docs/guides/09-native-scene-migration.md',
  'docs/guides/overview.md',
  'docs/troubleshooting/index.md',
];

const DIST_CHECKS = [
  {
    description: 'built native scene editor page exists',
    path: 'docs/.vitepress/dist/guides/09-native-scene-editor.html',
    regex: /Native Scene Editor/,
  },
  {
    description: 'built native scene migration page exists',
    path: 'docs/.vitepress/dist/guides/09-native-scene-migration.html',
    regex: /Native Scene Migration/,
  },
  {
    description: 'built setup page links to native scene editor',
    path: 'docs/.vitepress/dist/guides/01-project-setup.html',
    regex: /09-native-scene-editor/,
  },
];

function relativePath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/');
}

function readRelative(relativeFilePath) {
  return readFileSync(path.join(REPO_ROOT, relativeFilePath), 'utf8');
}

function fileExists(relativeFilePath) {
  return existsSync(path.join(REPO_ROOT, relativeFilePath));
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

function pushPatternFailures(failures, checks) {
  for (const check of checks) {
    const text = readRelative(check.file);
    for (const [description, regex] of check.patterns) {
      regex.lastIndex = 0;
      if (!regex.test(text)) {
        failures.push(`${check.file} is missing ${description}`);
      }
    }
  }
}

function resolveMarkdownTarget(sourceRelativePath, href) {
  const withoutHash = href.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];

  if (withoutQuery === '') {
    return null;
  }

  if (
    /^(?:https?:|mailto:|tel:)/.test(withoutQuery) ||
    withoutQuery.startsWith('//')
  ) {
    return null;
  }

  if (withoutQuery.startsWith('/api')) {
    return null;
  }

  const sourceDir = path.dirname(path.join(REPO_ROOT, sourceRelativePath));
  const absoluteBases = withoutQuery.startsWith('/')
    ? [
        path.join(DOCS_ROOT, withoutQuery),
        path.join(DOCS_ROOT, 'public', withoutQuery),
      ]
    : [path.resolve(sourceDir, withoutQuery)];
  const candidates = [];
  for (const absoluteBase of absoluteBases) {
    if (path.extname(absoluteBase) === '') {
      candidates.push(`${absoluteBase}.md`);
      candidates.push(path.join(absoluteBase, 'index.md'));
    } else {
      candidates.push(absoluteBase);
    }
  }

  return candidates;
}

function extractMarkdownLinks(text) {
  const links = [];
  const regex = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of text.matchAll(regex)) {
    links.push({
      href: match[1],
      line: lineNumberFor(text, match.index ?? 0),
    });
  }
  return links;
}

function checkSelectedMarkdownLinks(failures) {
  for (const relativeFilePath of SELECTED_MARKDOWN_LINK_FILES) {
    const text = readRelative(relativeFilePath);
    for (const link of extractMarkdownLinks(text)) {
      if (/09-meta-spatial-editor/.test(link.href)) {
        failures.push(
          `${relativeFilePath}:${link.line} links to removed Meta Spatial guide ${link.href}`,
        );
        continue;
      }

      const candidates = resolveMarkdownTarget(relativeFilePath, link.href);
      if (candidates == null) {
        continue;
      }

      if (!candidates.some((candidate) => existsSync(candidate))) {
        failures.push(
          `${relativeFilePath}:${link.line} has unresolved local link ${link.href}`,
        );
      }
    }
  }
}

function listMarkdownFiles(dir = DOCS_ROOT) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.vitepress' || entry.name === 'node_modules') {
      continue;
    }

    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(absolutePath);
    }
  }

  return files;
}

function checkRemovedGuideLinks(failures) {
  for (const absolutePath of listMarkdownFiles()) {
    const relativeMarkdownPath = relativePath(absolutePath);
    if (
      relativeMarkdownPath.startsWith('docs/plans/') ||
      relativeMarkdownPath === 'docs/guides/09-native-scene-migration.md'
    ) {
      continue;
    }

    const text = readFileSync(absolutePath, 'utf8');
    if (!/09-meta-spatial-editor/.test(text)) {
      continue;
    }

    failures.push(`${relativeMarkdownPath} references removed guide path`);
  }
}

function checkDist(failures) {
  for (const check of DIST_CHECKS) {
    const absolutePath = path.join(REPO_ROOT, check.path);
    if (!existsSync(absolutePath)) {
      failures.push(`${check.description}: ${check.path} is missing`);
      continue;
    }

    if (!statSync(absolutePath).isFile()) {
      failures.push(`${check.description}: ${check.path} is not a file`);
      continue;
    }

    const text = readFileSync(absolutePath, 'utf8');
    if (!check.regex.test(text)) {
      failures.push(`${check.description}: ${check.path} did not match check`);
    }
  }
}

function main() {
  const checkBuiltDocs = process.argv.includes('--dist');
  const failures = [];

  for (const relativeFilePath of REQUIRED_FILES) {
    if (!fileExists(relativeFilePath)) {
      failures.push(`required docs file is missing: ${relativeFilePath}`);
    }
  }

  for (const relativeFilePath of REMOVED_FILES) {
    if (fileExists(relativeFilePath)) {
      failures.push(`removed docs file still exists: ${relativeFilePath}`);
    }
  }

  for (const check of REQUIRED_NAV_PATTERNS) {
    const text = readRelative(check.file);
    if (!check.regex.test(text)) {
      failures.push(check.description);
    }
  }

  for (const check of FORBIDDEN_NAV_PATTERNS) {
    const text = readRelative(check.file);
    if (check.regex.test(text)) {
      failures.push(check.description);
    }
  }

  pushPatternFailures(failures, REQUIRED_CONTENT);
  checkSelectedMarkdownLinks(failures);
  checkRemovedGuideLinks(failures);

  if (checkBuiltDocs) {
    checkDist(failures);
  }

  if (failures.length > 0) {
    console.error('Native scene docs check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const distMessage = checkBuiltDocs ? ' Built docs were checked.' : '';
  console.log(
    `Native scene docs check passed: ${REQUIRED_FILES.length} source docs, nav, required tool guidance, and local links are valid.${distMessage}`,
  );
}

main();
