#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const TEXT_EXTENSIONS = new Set([
  '',
  '.cjs',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.md',
  '.map',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
]);

const FORBIDDEN_PATTERNS = [
  {
    id: 'metaspatial-file-extension',
    regex: /\.metaspatial\b/i,
  },
  {
    id: 'metaspatial-plugin-package',
    regex: /@iwsdk\/vite-plugin-metaspatial\b/i,
  },
  {
    id: 'metaspatial-generate-glxf',
    regex: /\bgenerateGLXF\b/,
  },
  {
    id: 'metaspatial-discover-components',
    regex: /\bdiscoverComponents\b/,
  },
  {
    id: 'metaspatial-editor-cli',
    regex: /\bMetaSpatialEditorCLI\b|\bMETA_SPATIAL_EDITOR_CLI_PATH\b/,
  },
  {
    id: 'metaspatial-public-glxf',
    regex: /\bpublic\/glxf\b|\/glxf\/Composition\.glxf\b/,
  },
  {
    id: 'metaspatial-create-flag',
    regex: /--(?:no-)?metaspatial\b/,
  },
  {
    id: 'metaspatial-editor-name',
    regex: /\bMeta\s*Spatial(?:\s+Editor)?\b/,
  },
];

const FORBIDDEN_DOCS_PATH_PATTERNS = [
  {
    id: 'internal-plan-docs',
    regex: /(^|\/)plans\//,
  },
];

function relativePath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/');
}

function listPackageTarballs() {
  const packagesRoot = path.join(REPO_ROOT, 'packages');
  const tarballs = [];

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageDir = path.join(packagesRoot, entry.name);
    for (const packageEntry of readdirSync(packageDir, {
      withFileTypes: true,
    })) {
      if (
        packageEntry.isFile() &&
        packageEntry.name.startsWith('iwsdk-') &&
        packageEntry.name.endsWith('.tgz')
      ) {
        tarballs.push(path.join(packageDir, packageEntry.name));
      }
    }
  }

  return tarballs.sort();
}

function shouldScanTextFile(filePath) {
  const basename = path.basename(filePath);
  if (basename === 'LICENSE') {
    return true;
  }

  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

function isAllowedContentPath(container, filePath) {
  if (container === 'tarball') {
    return /^package\/CHANGELOG\.md$/.test(filePath);
  }

  return (
    filePath.includes('/guides/09-native-scene-migration.html') ||
    filePath.includes('/assets/guides_09-native-scene-migration.md.')
  );
}

function scanText(text, context, failures) {
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        failures.push({
          ...context,
          line: lineIndex + 1,
          pattern: pattern.id,
          text: line.trim().slice(0, 220),
        });
      }
    }
  }
}

function scanPathName(name, context, failures) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(name)) {
      failures.push({
        ...context,
        line: 0,
        pattern: pattern.id,
        text: name,
      });
    }
  }
}

function scanBuiltDocsPathName(name, context, failures) {
  for (const pattern of FORBIDDEN_DOCS_PATH_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(name)) {
      failures.push({
        ...context,
        line: 0,
        pattern: pattern.id,
        text: name,
      });
    }
  }

  scanPathName(name, context, failures);
}

function listTarEntries(tarballPath) {
  return execFileSync('tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readTarEntry(tarballPath, entry) {
  return execFileSync('tar', ['-xOzf', tarballPath, entry], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
}

function scanTarballs(failures) {
  const tarballs = listPackageTarballs();
  if (tarballs.length === 0) {
    failures.push({
      artifact: 'packages',
      file: '<none>',
      line: 0,
      pattern: 'missing-tarballs',
      text: 'No package tarballs found. Run pnpm build:tgz before this check.',
    });
    return 0;
  }

  for (const tarballPath of tarballs) {
    const artifact = relativePath(tarballPath);
    const entries = listTarEntries(tarballPath);
    assertRequiredTarballEntries(artifact, entries, failures);

    for (const entry of entries) {
      if (!isAllowedContentPath('tarball', entry)) {
        scanPathName(entry, { artifact, file: entry }, failures);
      }

      if (
        !shouldScanTextFile(entry) ||
        isAllowedContentPath('tarball', entry)
      ) {
        continue;
      }

      scanText(
        readTarEntry(tarballPath, entry),
        { artifact, file: entry },
        failures,
      );
    }
  }

  return tarballs.length;
}

function assertRequiredTarballEntries(artifact, entries, failures) {
  const basename = path.basename(artifact);
  const requiredEntries =
    basename === 'iwsdk-scene-composition.tgz'
      ? [
          'package/dist/schema.js',
          'package/dist/schema.d.ts',
          'package/dist/schema.js.map',
          'package/README.md',
        ]
      : [];

  for (const requiredEntry of requiredEntries) {
    if (!entries.includes(requiredEntry)) {
      failures.push({
        artifact,
        file: requiredEntry,
        line: 0,
        pattern: 'missing-required-entry',
        text: `${basename} is missing ${requiredEntry}`,
      });
    }
  }
}

function listFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function scanBuiltDocs(failures) {
  const docsDist = path.join(REPO_ROOT, 'docs/.vitepress/dist');
  if (!existsSync(docsDist)) {
    failures.push({
      artifact: 'docs/.vitepress/dist',
      file: '<missing>',
      line: 0,
      pattern: 'missing-docs-dist',
      text: 'Built docs are missing. Run pnpm exec vitepress build docs before this check.',
    });
    return 0;
  }

  let scanned = 0;
  for (const absolutePath of listFiles(docsDist)) {
    if (
      !shouldScanTextFile(absolutePath) ||
      statSync(absolutePath).size > 5_000_000
    ) {
      continue;
    }

    const file = relativePath(absolutePath);
    if (isAllowedContentPath('docs', file)) {
      continue;
    }

    scanned += 1;
    scanBuiltDocsPathName(
      file,
      { artifact: 'docs/.vitepress/dist', file },
      failures,
    );
    scanText(
      readFileSync(absolutePath, 'utf8'),
      {
        artifact: 'docs/.vitepress/dist',
        file,
      },
      failures,
    );
  }

  return scanned;
}

function main() {
  const failures = [];
  const tarballCount = scanTarballs(failures);
  const docsFileCount = scanBuiltDocs(failures);

  if (failures.length > 0) {
    console.error('Native scene release artifact check failed:');
    for (const failure of failures) {
      const line = failure.line > 0 ? `:${failure.line}` : '';
      console.error(
        `- ${failure.artifact}:${failure.file}${line} [${failure.pattern}] ${failure.text}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Native scene release artifact check passed: scanned ${tarballCount} package tarballs and ${docsFileCount} built docs files.`,
  );
}

main();
