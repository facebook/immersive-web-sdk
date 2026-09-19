/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const LOCAL_SPECIFIER =
  /^(?:(?:file|link|portal):|\.{1,2}(?:[\\/]|$)|[\\/]|~[\\/]|[A-Za-z]:[\\/])/;

function isLocalSpecifier(specifier) {
  return LOCAL_SPECIFIER.test(String(specifier));
}

export async function findLocalPackageDependencies(packagesDirectory) {
  const violations = [];
  const entries = await readdir(packagesDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(
      packagesDirectory,
      entry.name,
      'package.json',
    );
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
        if (isLocalSpecifier(specifier)) {
          violations.push(
            `${path.relative(packagesDirectory, manifestPath)}: ${field}.${name}=${specifier}`,
          );
        }
      }
    }
  }

  return violations.sort();
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const packagesDirectory = fileURLToPath(
    new URL('../packages/', import.meta.url),
  );
  const violations = await findLocalPackageDependencies(packagesDirectory);
  if (violations.length > 0) {
    console.error(
      'Publishable package manifests must not use local-path dependencies:',
    );
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
  } else {
    console.log('No local package dependencies found.');
  }
}
