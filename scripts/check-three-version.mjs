#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
const packageJsonPath = path.join(rootDir, 'package.json');
const packagesDir = path.join(rootDir, 'packages');
const ALLOWED_PUBLISHED_THREE_DECLARATIONS = new Map([
  ['@iwsdk/locomotor:peerDependencies', '>=0.160.0'],
  ['@iwsdk/xr-input:peerDependencies', '>=0.160.0'],
]);

/**
 * Read expected versions from package.json pnpm overrides
 */
function getExpectedVersions() {
  if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ package.json not found at:', packageJsonPath);
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const overrides = packageJson?.pnpm?.overrides;

  if (!overrides) {
    console.error('❌ No pnpm.overrides found in package.json');
    process.exit(1);
  }

  const threeOverride = overrides.three;
  const typesThreeOverride = overrides['@types/three'];

  if (!threeOverride) {
    console.error('❌ No "three" override found in pnpm.overrides');
    process.exit(1);
  }

  if (!typesThreeOverride) {
    console.error('❌ No "@types/three" override found in pnpm.overrides');
    process.exit(1);
  }

  // Extract version from "npm:super-three@X.Y.Z" format
  const threeMatch = threeOverride.match(/super-three@([\d.]+)/);
  if (!threeMatch) {
    console.error('❌ Could not parse three version from:', threeOverride);
    process.exit(1);
  }

  return {
    installSpec: threeOverride,
    three: `super-three@${threeMatch[1]}`,
    typesThree: `@types/three@${typesThreeOverride}`,
  };
}

const {
  installSpec: EXPECTED_THREE_INSTALL_SPEC,
  three: EXPECTED_THREE_VERSION,
  typesThree: EXPECTED_TYPES_VERSION,
} = getExpectedVersions();

/** Ensure every published runtime dependency pins the supported build. */
function checkPublishedPackageVersions() {
  const mismatches = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name, 'package.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .map((manifestPath) => ({
      manifestPath,
      packageJson: JSON.parse(fs.readFileSync(manifestPath, 'utf-8')),
    }))
    .flatMap(({ manifestPath, packageJson }) =>
      packageJson.private === true
        ? []
        : findUnsupportedThreeDeclarations(
            packageJson,
            EXPECTED_THREE_INSTALL_SPEC,
          ).map((declaration) => ({
            ...declaration,
            manifestPath,
            packageJson,
          })),
    );

  if (mismatches.length > 0) {
    console.error(
      '❌ Published packages must pin the supported Three.js build.',
    );
    for (const {
      dependencyType,
      manifestPath,
      packageJson,
      version,
    } of mismatches) {
      console.error(
        `   ${packageJson.name ?? path.relative(rootDir, manifestPath)} (${dependencyType}): ${version}`,
      );
    }
    console.error('   Expected:', EXPECTED_THREE_INSTALL_SPEC);
    process.exit(1);
  }
}

export function findUnsupportedThreeDeclarations(
  packageJson,
  expectedInstallSpec,
) {
  return ['dependencies', 'peerDependencies', 'devDependencies'].flatMap(
    (dependencyType) => {
      const version = packageJson?.[dependencyType]?.three;
      if (version == null || version === expectedInstallSpec) {
        return [];
      }
      const exception = ALLOWED_PUBLISHED_THREE_DECLARATIONS.get(
        `${packageJson.name}:${dependencyType}`,
      );
      return exception === version ? [] : [{ dependencyType, version }];
    },
  );
}

/**
 * Check that pnpm-lock.yaml only contains the correct three.js version
 * to prevent accidental dependency on multiple three.js versions.
 */
function checkThreeVersion() {
  if (!fs.existsSync(lockfilePath)) {
    console.error('❌ pnpm-lock.yaml not found at:', lockfilePath);
    process.exit(1);
  }

  const lockfile = fs.readFileSync(lockfilePath, 'utf-8');
  const lines = lockfile.split('\n');

  const errors = [];
  const allowedPatterns = [
    EXPECTED_THREE_VERSION,
    EXPECTED_TYPES_VERSION,
    'three-mesh-bvh', // Separate package, not three.js
    'three:', // Peer dependency declarations (not actual versions)
    "three: '", // Peer dependency version ranges
  ];

  lines.forEach((line, index) => {
    // Look for lines that reference three@ (actual version resolution)
    if (line.includes('three@') || line.includes('three:')) {
      // Skip if it's one of the allowed patterns
      const isAllowed = allowedPatterns.some((pattern) =>
        line.includes(pattern),
      );
      if (isAllowed) {
        return;
      }

      // Skip peer dependency declarations and version ranges
      if (
        line.includes('peerDependencies:') ||
        line.includes('>=') ||
        line.includes('^') ||
        line.includes('~') ||
        line.trim().startsWith('three:') // Peer dep line
      ) {
        return;
      }

      // If we get here, it's a potential issue
      errors.push({
        line: index + 1,
        content: line.trim(),
      });
    }
  });

  if (errors.length > 0) {
    console.error('❌ Found incorrect three.js versions in pnpm-lock.yaml:\n');
    errors.forEach((error) => {
      console.error(`  Line ${error.line}: ${error.content}`);
    });
    console.error(
      `\n✅ Expected version: ${EXPECTED_THREE_VERSION} (aliased as "three")`,
    );
    console.error(`✅ Expected types: ${EXPECTED_TYPES_VERSION}\n`);
    console.error('To fix this:');
    console.error(
      '  1. Check package.json files for direct dependencies on "three"',
    );
    console.error(
      `  2. Ensure all packages use: "three": "npm:${EXPECTED_THREE_VERSION}"`,
    );
    console.error(
      '  3. Run: rm -rf node_modules pnpm-lock.yaml && pnpm install',
    );
    process.exit(1);
  }
}

if (
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkThreeVersion();
  checkPublishedPackageVersions();
  console.log('✅ Three.js version check passed');
  console.log(`   All packages correctly use: ${EXPECTED_THREE_VERSION}`);
}
