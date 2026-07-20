#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const DEFAULT_EVIDENCE_PATH =
  'docs/test-evidence/native-scene-manual-smoke.json';
const MIN_ARTIFACT_BYTES = 1000;
const PNG_SIGNATURE = '89504e470d0a1a0a';
const VALID_ARTIFACT_TYPES = new Set(['screenshot', 'video', 'log']);
const VISUAL_ARTIFACT_TYPES = new Set(['screenshot', 'video']);

const TARGETS = [
  {
    checks: [
      'scaffoldedFreshProject',
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'controllerRayInteractionWorks',
      'nativeEditorOpened',
      'assetPlacedSavedAndReloaded',
      'noVisibleErrors',
    ],
    description:
      'Fresh VR starter can run on Quest Browser and round-trip through the native editor.',
    id: 'vr-starter',
    title: 'VR starter',
  },
  {
    checks: [
      'scaffoldedFreshProject',
      'openedAppInQuestBrowser',
      'enteredImmersiveAr',
      'sceneVisibleAndAnchored',
      'controllerRayInteractionWorks',
      'nativeEditorOpened',
      'assetPlacedSavedAndReloaded',
      'noVisibleErrors',
    ],
    description:
      'Fresh AR starter can run on Quest Browser and round-trip through the native editor.',
    id: 'ar-starter',
    title: 'AR starter',
  },
  {
    checks: [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'oneHandGrabWorks',
      'twoHandGrabWorks',
      'distanceGrabWorks',
      'noVisibleErrors',
    ],
    description:
      'Migrated grab example preserves one-hand, two-hand, and distance grab behavior.',
    id: 'grab-example',
    title: 'grab example',
  },
  {
    checks: [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'physicsBodiesMove',
      'grabbablePhysicsObjectResponds',
      'noVisibleErrors',
    ],
    description:
      'Migrated physics example preserves physics body movement and grab response.',
    id: 'physics-example',
    title: 'physics example',
  },
  {
    checks: [
      'openedAppInQuestBrowser',
      'enteredImmersiveVr',
      'sceneVisibleAndNonblank',
      'spatialAudioPlays',
      'audioInteractionWorks',
      'noVisibleErrors',
    ],
    description:
      'Migrated audio example preserves spatial audio playback and interaction.',
    id: 'audio-example',
    title: 'audio example',
  },
];

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.writeTemplate != null) {
    writeTemplate(options.writeTemplate);
    return;
  }

  const evidencePath = path.resolve(REPO_ROOT, options.evidence);
  const failures = validateEvidenceFile(evidencePath);

  if (failures.length > 0) {
    console.error(
      `Native scene manual smoke evidence failed: ${relativePath(
        evidencePath,
      )}`,
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Native scene manual smoke evidence passed: ${relativePath(
      evidencePath,
    )} (${TARGETS.length} targets).`,
  );
}

function parseArgs(argv) {
  const options = {
    evidence: DEFAULT_EVIDENCE_PATH,
    help: false,
    writeTemplate: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--evidence') {
      const next = argv[index + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--evidence requires a file path');
      }
      options.evidence = next;
      index += 1;
    } else if (arg === '--write-template') {
      const next = argv[index + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--write-template requires a file path');
      }
      options.writeTemplate = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-native-scene-manual-smoke.mjs [options]

Validates manual Quest/browser smoke evidence for the native scene editor
replacement release gate.

Options:
  --evidence <path>        Evidence JSON to validate.
                           Default: ${DEFAULT_EVIDENCE_PATH}
  --write-template <path>  Write a fill-in evidence JSON template.
  -h, --help               Show this help.
`);
}

function writeTemplate(outputPath) {
  const absolutePath = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(createTemplate(), null, 2)}\n`);
  console.log(
    `Wrote manual smoke evidence template: ${relativePath(absolutePath)}`,
  );
}

function createTemplate() {
  return {
    schemaVersion: 1,
    run: {
      gitCommit: '<commit-sha>',
      releaseRehearsalCommand:
        'node scripts/native-scene-release-rehearsal.mjs --require-manual-smoke --manual-smoke-evidence docs/test-evidence/native-scene-manual-smoke.json',
      testedAt: '<ISO-8601 timestamp>',
      tester: '<unixname>',
    },
    device: {
      browser: '<Quest Browser version>',
      headset: '<Quest model>',
      osVersion: '<Quest OS version>',
    },
    targets: TARGETS.map((target) => ({
      artifacts: [
        {
          path: `./manual-smoke/${target.id}-quest.png`,
          type: 'screenshot',
          url: '<optional https URL for sharing>',
        },
      ],
      checks: Object.fromEntries(target.checks.map((check) => [check, false])),
      commands: ['<command used to serve or scaffold this target>'],
      description: target.description,
      id: target.id,
      notes: '<what was observed>',
      status: 'pending',
      title: target.title,
      url: '<URL opened in Quest Browser>',
    })),
  };
}

function validateEvidenceFile(evidencePath) {
  const failures = [];
  if (!existsSync(evidencePath)) {
    return [
      `${relativePath(evidencePath)} does not exist. Generate a template with: node scripts/check-native-scene-manual-smoke.mjs --write-template ${DEFAULT_EVIDENCE_PATH}`,
    ];
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch (error) {
    return [
      `could not parse JSON: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }

  if (evidence?.schemaVersion !== 1) {
    failures.push('schemaVersion must be 1');
  }

  validateRun(evidence.run, failures);
  validateDevice(evidence.device, failures);
  validateTargets(evidence.targets, evidencePath, failures);
  return failures;
}

function validateRun(run, failures) {
  if (!isObject(run)) {
    failures.push('run must be an object');
    return;
  }

  requireFilledString(run.gitCommit, 'run.gitCommit', failures);
  requireFilledString(run.tester, 'run.tester', failures);
  requireFilledString(run.testedAt, 'run.testedAt', failures);
  if (isPlaceholder(run.testedAt) || Number.isNaN(Date.parse(run.testedAt))) {
    failures.push('run.testedAt must be an ISO-8601 timestamp');
  }
}

function validateDevice(device, failures) {
  if (!isObject(device)) {
    failures.push('device must be an object');
    return;
  }

  requireFilledString(device.headset, 'device.headset', failures);
  requireFilledString(device.browser, 'device.browser', failures);
  requireFilledString(device.osVersion, 'device.osVersion', failures);
}

function validateTargets(targets, evidencePath, failures) {
  if (!Array.isArray(targets)) {
    failures.push('targets must be an array');
    return;
  }

  const byId = new Map();
  for (const target of targets) {
    if (!isObject(target)) {
      failures.push('every target must be an object');
      continue;
    }
    if (typeof target.id === 'string') {
      byId.set(target.id, target);
    }
  }

  for (const expected of TARGETS) {
    const target = byId.get(expected.id);
    if (target == null) {
      failures.push(`targets is missing ${expected.id}`);
      continue;
    }

    validateTarget(target, expected, evidencePath, failures);
  }

  for (const target of targets) {
    if (
      isObject(target) &&
      !TARGETS.some((expected) => expected.id === target.id)
    ) {
      failures.push(`targets contains unknown id ${String(target.id)}`);
    }
  }
}

function validateTarget(target, expected, evidencePath, failures) {
  const prefix = `targets.${expected.id}`;
  if (target.status !== 'passed') {
    failures.push(`${prefix}.status must be "passed"`);
  }

  requireFilledString(target.title, `${prefix}.title`, failures);
  requireFilledString(target.url, `${prefix}.url`, failures);
  if (!isHttpUrl(target.url) && !isLocalUrl(target.url)) {
    failures.push(`${prefix}.url must be an http(s) URL or localhost URL`);
  }

  if (!Array.isArray(target.commands) || target.commands.length === 0) {
    failures.push(`${prefix}.commands must contain at least one command`);
  } else {
    target.commands.forEach((command, index) =>
      requireFilledString(command, `${prefix}.commands[${index}]`, failures),
    );
  }

  if (!isObject(target.checks)) {
    failures.push(`${prefix}.checks must be an object`);
  } else {
    for (const check of expected.checks) {
      if (target.checks[check] !== true) {
        failures.push(`${prefix}.checks.${check} must be true`);
      }
    }
  }

  validateArtifacts(target.artifacts, prefix, evidencePath, failures);
}

function validateArtifacts(artifacts, prefix, evidencePath, failures) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    failures.push(`${prefix}.artifacts must contain at least one artifact`);
    return;
  }

  let hasMachineCheckedVisual = false;
  artifacts.forEach((artifact, index) => {
    const artifactPrefix = `${prefix}.artifacts[${index}]`;
    if (!isObject(artifact)) {
      failures.push(`${artifactPrefix} must be an object`);
      return;
    }

    requireFilledString(artifact.type, `${artifactPrefix}.type`, failures);
    if (!VALID_ARTIFACT_TYPES.has(artifact.type)) {
      failures.push(
        `${artifactPrefix}.type must be one of ${Array.from(
          VALID_ARTIFACT_TYPES,
        ).join(', ')}`,
      );
    }

    const hasUrl = typeof artifact.url === 'string' && artifact.url.length > 0;
    const hasPath =
      typeof artifact.path === 'string' && artifact.path.length > 0;
    if (!hasPath) {
      failures.push(
        `${artifactPrefix}.path is required so evidence is machine-checked`,
      );
      return;
    }

    if (hasUrl) {
      if (!isHttpUrl(artifact.url) || isPlaceholder(artifact.url)) {
        failures.push(
          `${artifactPrefix}.url must be a non-placeholder http(s) URL`,
        );
      }
    }

    if (isPlaceholder(artifact.path)) {
      failures.push(`${artifactPrefix}.path must not be a placeholder`);
      return;
    }
    const absolutePath = path.isAbsolute(artifact.path)
      ? artifact.path
      : path.resolve(path.dirname(evidencePath), artifact.path);
    if (!existsSync(absolutePath)) {
      failures.push(
        `${artifactPrefix}.path does not exist: ${relativePath(absolutePath)}`,
      );
      return;
    }

    validateArtifactFile(absolutePath, artifact, artifactPrefix, failures);
    if (VISUAL_ARTIFACT_TYPES.has(artifact.type)) {
      hasMachineCheckedVisual = true;
    }
  });

  if (!hasMachineCheckedVisual) {
    failures.push(
      `${prefix}.artifacts must include at least one local screenshot or video artifact`,
    );
  }
}

function validateArtifactFile(
  absolutePath,
  artifact,
  artifactPrefix,
  failures,
) {
  const stat = statSync(absolutePath);
  if (!stat.isFile()) {
    failures.push(`${artifactPrefix}.path must point to a file`);
    return;
  }
  if (stat.size < MIN_ARTIFACT_BYTES) {
    failures.push(
      `${artifactPrefix}.path is too small to be useful evidence (${stat.size} bytes)`,
    );
  }

  const extension = path.extname(absolutePath).toLowerCase();
  if (artifact.type === 'screenshot') {
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      failures.push(
        `${artifactPrefix}.path must be a PNG, JPEG, or WEBP screenshot`,
      );
      return;
    }
    if (extension === '.png') {
      const signature = readFileSync(absolutePath)
        .subarray(0, 8)
        .toString('hex');
      if (signature !== PNG_SIGNATURE) {
        failures.push(`${artifactPrefix}.path is not a PNG file`);
      }
    }
  } else if (artifact.type === 'video') {
    if (!['.mp4', '.mov', '.webm'].includes(extension)) {
      failures.push(`${artifactPrefix}.path must be an MP4, MOV, or WEBM file`);
    }
  } else if (artifact.type === 'log') {
    if (!['.log', '.txt', '.json'].includes(extension)) {
      failures.push(`${artifactPrefix}.path must be a LOG, TXT, or JSON file`);
    }
  }
}

function requireFilledString(value, field, failures) {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    isPlaceholder(value)
  ) {
    failures.push(`${field} must be a filled string`);
  }
}

function isPlaceholder(value) {
  return /<[^>]+>|\bTODO\b|\bpending\b/i.test(String(value));
}

function isHttpUrl(value) {
  return /^https?:\/\//.test(String(value));
}

function isLocalUrl(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[[\dA-Fa-f:.]+\])(?::\d+)?(?:\/|$)/.test(
    String(value),
  );
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function relativePath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replaceAll('\\', '/');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
