#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COREPACK_COMMAND = /\bcorepack(?:\.(?:cmd|exe|ps1))?\b/iu;

export function findCorepackPackageScripts(root = ROOT) {
  const packagesRoot = path.join(root, 'packages');
  const findings = [];

  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesRoot, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const [script, command] of Object.entries(manifest.scripts ?? {})) {
      if (typeof command !== 'string' || !COREPACK_COMMAND.test(command)) {
        continue;
      }
      findings.push({
        command,
        packageName: manifest.name ?? entry.name,
        script,
      });
    }
  }

  return findings;
}

function main() {
  const findings = findCorepackPackageScripts();
  if (findings.length > 0) {
    console.error(
      'Package scripts must not require a global Corepack command. Use npm for local or sibling-package script composition:',
    );
    for (const finding of findings) {
      console.error(
        `- ${finding.packageName}#${finding.script}: ${finding.command}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log('Package script portability check passed.');
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
