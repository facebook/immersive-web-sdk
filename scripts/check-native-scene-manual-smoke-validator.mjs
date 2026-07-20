#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CHECKER = path.join(
  REPO_ROOT,
  'scripts/check-native-scene-manual-smoke.mjs',
);

const TARGETS = [
  [
    'vr-starter',
    [
      'scaffoldedFreshProject',
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'controllerRayInteractionWorks',
      'nativeEditorOpened',
      'assetPlacedSavedAndReloaded',
      'noVisibleErrors',
    ],
  ],
  [
    'ar-starter',
    [
      'scaffoldedFreshProject',
      'openedAppInQuestBrowser',
      'enteredImmersiveAr',
      'sceneVisibleAndAnchored',
      'controllerRayInteractionWorks',
      'nativeEditorOpened',
      'assetPlacedSavedAndReloaded',
      'noVisibleErrors',
    ],
  ],
  [
    'grab-example',
    [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'oneHandGrabWorks',
      'twoHandGrabWorks',
      'distanceGrabWorks',
      'noVisibleErrors',
    ],
  ],
  [
    'physics-example',
    [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'physicsBodiesMove',
      'grabbablePhysicsObjectResponds',
      'noVisibleErrors',
    ],
  ],
  [
    'audio-example',
    [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'spatialAudioPlays',
      'audioInteractionWorks',
      'noVisibleErrors',
    ],
  ],
];

function main() {
  const tempRoot = mkdtempSync(
    path.join(tmpdir(), 'iwsdk-manual-smoke-validator-'),
  );
  try {
    const artifactDir = path.join(tempRoot, 'manual-smoke');
    mkdirSync(artifactDir, { recursive: true });
    const screenshotPath = path.join(artifactDir, 'quest-proof.png');
    writeFakePng(screenshotPath);

    assertStatus(
      'valid local screenshot evidence',
      makeEvidence(tempRoot, { path: screenshotPath, type: 'screenshot' }),
      0,
    );
    assertStatus(
      'URL-only evidence',
      makeEvidence(tempRoot, {
        type: 'screenshot',
        url: 'https://example.com/quest-proof.png',
      }),
      1,
      'path is required so evidence is machine-checked',
    );
    assertStatus(
      'log-only evidence',
      makeEvidence(tempRoot, {
        path: path.join(tempRoot, 'manual-smoke.log'),
        type: 'log',
      }),
      1,
      'must include at least one local screenshot or video artifact',
      (evidence) => {
        writeFileSync(
          path.join(tempRoot, 'manual-smoke.log'),
          `${'Quest smoke log\n'.repeat(100)}`,
        );
        return evidence;
      },
    );
    assertStatus(
      'tiny screenshot evidence',
      makeEvidence(tempRoot, {
        path: path.join(artifactDir, 'tiny.png'),
        type: 'screenshot',
      }),
      1,
      'too small to be useful evidence',
      (evidence) => {
        writeFileSync(path.join(artifactDir, 'tiny.png'), Buffer.from('tiny'));
        return evidence;
      },
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }

  console.log('Native scene manual smoke validator smoke test passed.');
}

function makeEvidence(tempRoot, artifact) {
  return {
    schemaVersion: 1,
    run: {
      gitCommit: '0000000000000000000000000000000000000000',
      releaseRehearsalCommand:
        'node scripts/native-scene-release-rehearsal.mjs --require-manual-smoke',
      testedAt: '2026-07-02T00:00:00.000Z',
      tester: 'validator-smoke',
    },
    device: {
      browser: 'Quest Browser smoke fixture',
      headset: 'Quest smoke fixture',
      osVersion: 'smoke fixture',
    },
    targets: TARGETS.map(([id, checks]) => ({
      artifacts: [artifact],
      checks: Object.fromEntries(checks.map((check) => [check, true])),
      commands: ['pnpm dev --host 0.0.0.0'],
      id,
      notes: 'validator smoke fixture',
      status: 'passed',
      title: id,
      url: 'http://127.0.0.1:5173/',
    })),
  };
}

function assertStatus(
  label,
  evidence,
  expectedStatus,
  expectedOutput,
  beforeWrite = (value) => value,
) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'iwsdk-manual-smoke-case-'));
  try {
    const evidencePath = path.join(tempDir, 'evidence.json');
    writeFileSync(
      evidencePath,
      `${JSON.stringify(beforeWrite(evidence), null, 2)}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [CHECKER, '--evidence', evidencePath],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    );
    if (result.status !== expectedStatus) {
      throw new Error(
        `${label}: expected status ${expectedStatus}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    if (expectedOutput != null && !combinedOutput.includes(expectedOutput)) {
      throw new Error(
        `${label}: expected output to include ${JSON.stringify(
          expectedOutput,
        )}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function writeFakePng(filePath) {
  writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(1200, 0),
    ]),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
