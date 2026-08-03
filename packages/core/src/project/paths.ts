/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export type ProjectSourcePathKind = 'module' | 'scene';

/** Error raised when a project source path is not lexically root-confined. */
export class ProjectSourcePathError extends Error {
  constructor(
    readonly sourcePath: string,
    readonly kind: ProjectSourcePathKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectSourcePathError';
  }
}

/**
 * Validate and normalize a project-owned source path without filesystem or
 * Node dependencies. Returned paths always begin with `./` and use `/`.
 */
export function normalizeProjectSourcePath(
  sourcePath: string,
  kind: ProjectSourcePathKind,
): string {
  const fail = (message: string): never => {
    throw new ProjectSourcePathError(sourcePath, kind, message);
  };

  if (sourcePath.length === 0 || sourcePath.trim().length === 0) {
    return fail(`${kind} path must not be blank`);
  }
  if (sourcePath !== sourcePath.trim()) {
    return fail(`${kind} path must not have leading or trailing whitespace`);
  }
  if (sourcePath.includes('\0')) {
    return fail(`${kind} path must not contain a null byte`);
  }
  if (sourcePath.includes('\\')) {
    return fail(`${kind} path must use forward slashes`);
  }
  if (sourcePath.includes('?') || sourcePath.includes('#')) {
    return fail(`${kind} path must not contain a query or fragment`);
  }
  if (
    sourcePath.startsWith('/') ||
    sourcePath.startsWith('//') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(sourcePath)
  ) {
    return fail(`${kind} path must be a local project-relative path`);
  }

  const withoutPrefix = sourcePath.startsWith('./')
    ? sourcePath.slice(2)
    : sourcePath;
  const segments = withoutPrefix.split('/');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    return fail(`${kind} path must not contain empty, ".", or ".." segments`);
  }

  if (kind === 'scene') {
    if (segments[0] !== 'public' || segments[1] !== 'scenes') {
      return fail('scene path must stay inside public/scenes/');
    }
    if (!withoutPrefix.endsWith('.iwsdk.scene.json')) {
      return fail('scene path must end with .iwsdk.scene.json');
    }
  } else {
    const fileName = segments.at(-1)!;
    if (fileName.startsWith('.') || fileName.includes('.')) {
      return fail('module path must be extensionless');
    }
  }

  return `./${segments.join('/')}`;
}

/** Convert a validated public scene source path into its runtime URL. */
export function projectSceneSourcePathToRuntimeUrl(sourcePath: string): string {
  const normalized = normalizeProjectSourcePath(sourcePath, 'scene');
  return `./${normalized.slice('./public/'.length)}`;
}
