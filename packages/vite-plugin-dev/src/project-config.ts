/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  assertValidIwsdkProjectManifest,
  normalizeProjectSourcePath,
  type IwsdkProjectManifestV1,
} from '@iwsdk/core/project';

export const IWSDK_PROJECT_CONFIG_FILE = 'iwsdk.config.json';

const PROJECT_MODULE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
] as const;

export interface LoadedIwsdkProject {
  configPath: string;
  manifest: IwsdkProjectManifestV1;
  scenePath: string;
}

/** Read and validate the project authority without executing browser modules. */
export function loadIwsdkProject(
  projectRoot: string,
): LoadedIwsdkProject | null {
  const root = realProjectRoot(projectRoot);
  const configPath = path.join(root, IWSDK_PROJECT_CONFIG_FILE);
  if (!existsSync(configPath)) {
    return null;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `[IWSDK] ${configPath} must contain valid JSON: ${errorMessage(error)}`,
    );
  }
  assertValidIwsdkProjectManifest(manifest);

  const sceneSource = normalizeProjectSourcePath(manifest.scene, 'scene');
  const scenePath = resolveConfinedExistingFile(
    root,
    sceneSource,
    'Project scene',
  );
  return { configPath, manifest, scenePath };
}

/** Resolve one extensionless, local manifest module deterministically. */
export function resolveProjectModulePath(
  projectRoot: string,
  sourcePath: string,
  label: 'Asset' | 'Component',
): string {
  const root = realProjectRoot(projectRoot);
  const normalized = normalizeProjectSourcePath(sourcePath, 'module');
  const withoutPrefix = normalized.slice(2);
  const basePath = path.resolve(root, withoutPrefix);
  const matches = PROJECT_MODULE_EXTENSIONS.map(
    (extension) => `${basePath}${extension}`,
  ).filter(
    (candidate) =>
      existsSync(candidate) &&
      (lstatSync(candidate).isFile() || lstatSync(candidate).isSymbolicLink()),
  );

  if (matches.length === 0) {
    throw new Error(
      `[IWSDK] ${label} manifest module was not found for ${JSON.stringify(normalized)}. Expected one of: ${PROJECT_MODULE_EXTENSIONS.map((extension) => `${normalized}${extension}`).join(', ')}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `[IWSDK] ${label} manifest module ${JSON.stringify(normalized)} is ambiguous. Keep exactly one supported source file; found: ${matches.map((entry) => path.relative(root, entry)).join(', ')}`,
    );
  }
  return assertRealPathInsideRoot(root, matches[0], `${label} manifest module`);
}

function resolveConfinedExistingFile(
  root: string,
  normalizedSource: string,
  label: string,
): string {
  const resolved = path.resolve(root, normalizedSource.slice(2));
  if (!existsSync(resolved) || !lstatSync(resolved).isFile()) {
    throw new Error(
      `[IWSDK] ${label} was not found: ${path.relative(root, resolved)}`,
    );
  }
  return assertRealPathInsideRoot(root, resolved, label);
}

function assertRealPathInsideRoot(
  root: string,
  candidate: string,
  label: string,
): string {
  const realCandidate = realpathSync(candidate);
  const relative = path.relative(root, realCandidate);
  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`[IWSDK] ${label} must stay inside the project root`);
  }
  return realCandidate;
}

function realProjectRoot(projectRoot: string): string {
  const resolved = path.resolve(projectRoot);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
