#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scannerPath = resolve(scriptDir, 'check-metaspatial-removal.mjs');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'iwsdk-metaspatial-audit-'));

function writeFixture(relativePath, content) {
  const absolutePath = resolve(tempRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

try {
  writeFixture(
    'examples/grab/metaspatial/Main.metaspatial',
    'Meta Spatial Editor project fixture\n',
  );
  writeFixture(
    'packages/example/vite.config.ts',
    "import { discoverComponents, generateGLXF } from '@iwsdk/vite-plugin-metaspatial';\n",
  );
  writeFixture(
    'CHANGELOG.md',
    'Historical note: Meta Spatial Editor was supported in an older release.\n',
  );

  const strict = spawnSync(
    process.execPath,
    [scannerPath, '--root', tempRoot, '--json'],
    {
      encoding: 'utf8',
    },
  );

  if (strict.status !== 1) {
    throw new Error(`Expected strict scan to exit 1, got ${strict.status}`);
  }

  const strictReport = JSON.parse(strict.stdout);
  if (strictReport.nonAllowlistedCount < 4) {
    throw new Error('Expected strict scan to find non-allowlisted references');
  }
  if (strictReport.allowlistedCount < 1) {
    throw new Error('Expected strict scan to preserve allowlisted history');
  }

  const reportOnly = spawnSync(
    process.execPath,
    [scannerPath, '--root', tempRoot, '--json', '--report-only'],
    {
      encoding: 'utf8',
    },
  );

  if (reportOnly.status !== 0) {
    throw new Error(
      `Expected report-only scan to exit 0, got ${reportOnly.status}`,
    );
  }

  const reportOnlyJson = JSON.parse(reportOnly.stdout);
  if (reportOnlyJson.nonAllowlistedCount !== strictReport.nonAllowlistedCount) {
    throw new Error('Report-only scan should not change match counts');
  }

  console.log('Meta Spatial removal audit smoke test passed.');
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
