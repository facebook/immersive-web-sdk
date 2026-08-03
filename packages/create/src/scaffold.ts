/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import { constants } from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { Ora } from 'ora';

export type ScaffoldOptions = {
  force?: boolean;
};

export type ProjectFileInput = {
  contents: Buffer | Uint8Array | string;
  path: string;
};

type ProjectFile = {
  collisionKey: string;
  contents: Buffer;
  outPath: string;
  relativePath: string;
};

type StagedProjectFile = ProjectFile & {
  stagedPath: string;
};

async function getStat(targetPath: string) {
  try {
    return await fsp.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function resolveOutputPath(outDir: string, sourcePath: string) {
  const invalidSegment = sourcePath
    .split('/')
    .some((segment) => segment === '' || segment === '.' || segment === '..');
  if (
    sourcePath.includes('\0') ||
    sourcePath.includes('\\') ||
    invalidSegment ||
    /^[a-zA-Z]:/.test(sourcePath)
  ) {
    throw new Error(`Generated output path "${sourcePath}" is not safe.`);
  }
  const outPath = path.resolve(outDir, ...sourcePath.split('/'));
  const relativePath = path.relative(outDir, outPath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Generated output path "${sourcePath}" escapes the target.`,
    );
  }
  return {
    collisionKey: relativePath.normalize('NFC').toLowerCase(),
    outPath,
    relativePath,
  };
}

function buildProjectFiles(
  sources: readonly ProjectFileInput[],
  outDir: string,
): ProjectFile[] {
  const files: ProjectFile[] = [];
  const outputPaths = new Set<string>();
  for (const source of sources) {
    const rel = source.path;
    const { collisionKey, outPath, relativePath } = resolveOutputPath(
      outDir,
      rel,
    );
    if (outputPaths.has(collisionKey)) {
      throw new Error(
        `Generated output path "${rel}" resolves more than once.`,
      );
    }
    outputPaths.add(collisionKey);
    files.push({
      collisionKey,
      contents:
        typeof source.contents === 'string'
          ? Buffer.from(source.contents, 'utf8')
          : Buffer.from(source.contents),
      outPath,
      relativePath,
    });
  }
  return files;
}

function assertManifestPaths(files: ProjectFile[]) {
  const outputPaths = new Set(files.map((file) => file.collisionKey));
  for (const file of files) {
    let ancestor = path.dirname(file.relativePath);
    while (ancestor !== '.') {
      if (outputPaths.has(ancestor.normalize('NFC').toLowerCase())) {
        throw new Error(
          `Generated output "${ancestor}" cannot be both a file and a directory.`,
        );
      }
      ancestor = path.dirname(ancestor);
    }
  }
}

async function ensureTargetDirectory(outDir: string, force: boolean) {
  let targetStat = await getStat(outDir);
  if (targetStat == null) {
    await fsp.mkdir(outDir, { recursive: true });
    targetStat = await getStat(outDir);
  }
  if (targetStat?.isSymbolicLink()) {
    throw new Error('Refusing to scaffold into a symbolic-link target.');
  }
  if (!targetStat?.isDirectory()) {
    throw new Error('Scaffold target is not a directory.');
  }
  if (!force && (await fsp.readdir(outDir)).length > 0) {
    throw new Error(
      'Target directory is not empty. Re-run with --force to overwrite conflicting generated files; unrelated files will be preserved.',
    );
  }
}

async function assertOutputPaths(files: ProjectFile[], outDir: string) {
  const targetStat = await getStat(outDir);
  if (targetStat?.isSymbolicLink()) {
    throw new Error('Refusing to scaffold into a symbolic-link target.');
  }
  if (!targetStat?.isDirectory()) {
    throw new Error('Scaffold target is not a directory.');
  }
  for (const file of files) {
    const pathParts = file.relativePath.split(path.sep);
    let currentPath = outDir;
    for (let index = 0; index < pathParts.length; index++) {
      currentPath = path.join(currentPath, pathParts[index]);
      const currentStat = await getStat(currentPath);
      if (currentStat == null) {
        break;
      }
      const displayPath = path.relative(outDir, currentPath);
      if (currentStat.isSymbolicLink()) {
        throw new Error(
          `Refusing to scaffold through symbolic link "${displayPath}".`,
        );
      }
      const isOutputFile = index === pathParts.length - 1;
      if (!isOutputFile && !currentStat.isDirectory()) {
        throw new Error(
          `Cannot create "${file.relativePath}": "${displayPath}" is not a directory.`,
        );
      }
      if (isOutputFile && !currentStat.isFile()) {
        throw new Error(
          `Cannot overwrite "${file.relativePath}": the existing path is not a regular file.`,
        );
      }
    }
  }
}

async function createOutputDirectories(files: ProjectFile[]) {
  const directories = Array.from(
    new Set(files.map((file) => path.dirname(file.outPath))),
  ).sort((left, right) => left.length - right.length);
  for (const directory of directories) {
    await fsp.mkdir(directory, { recursive: true });
  }
}

async function stageProjectFiles(
  files: ProjectFile[],
): Promise<StagedProjectFile[]> {
  const stagedFiles: StagedProjectFile[] = [];
  try {
    for (const file of files) {
      const stagedPath = path.join(
        path.dirname(file.outPath),
        `.${path.basename(file.outPath)}.iwsdk-${randomUUID()}.tmp`,
      );
      await fsp.writeFile(stagedPath, file.contents, { flag: 'wx' });
      stagedFiles.push({ ...file, stagedPath });
    }
    return stagedFiles;
  } catch (error) {
    await Promise.allSettled(
      stagedFiles.map((file) => fsp.rm(file.stagedPath, { force: true })),
    );
    throw error;
  }
}

async function commitProjectFiles(files: StagedProjectFile[], force: boolean) {
  for (const file of files) {
    if (force) {
      await fsp.rename(file.stagedPath, file.outPath);
    } else {
      await fsp.copyFile(
        file.stagedPath,
        file.outPath,
        constants.COPYFILE_EXCL,
      );
      await fsp.rm(file.stagedPath);
    }
  }
}

export async function scaffoldProject(
  sources: readonly ProjectFileInput[],
  outDir: string,
  options: ScaffoldOptions = {},
) {
  const scaffoldSpinner: Ora = ora({
    text: `Scaffolding in ${chalk.gray(outDir)} ...`,
    stream: process.stderr,
    discardStdin: false,
    hideCursor: false,
    isEnabled: process.stderr.isTTY,
  }).start();
  try {
    const resolvedOutDir = path.resolve(outDir);
    const force = options.force === true;
    const files = buildProjectFiles(sources, resolvedOutDir);
    assertManifestPaths(files);
    await ensureTargetDirectory(resolvedOutDir, force);
    await assertOutputPaths(files, resolvedOutDir);
    await createOutputDirectories(files);
    // Recheck after directory creation so no file is changed when a generated
    // path has an incompatible shape or resolves through a symlink.
    await assertOutputPaths(files, resolvedOutDir);
    const stagedFiles = await stageProjectFiles(files);
    try {
      await assertOutputPaths(files, resolvedOutDir);
      await commitProjectFiles(stagedFiles, force);
    } finally {
      await Promise.allSettled(
        stagedFiles.map((file) => fsp.rm(file.stagedPath, { force: true })),
      );
    }
    scaffoldSpinner.stopAndPersist({
      symbol: chalk.green('✔'),
      text: 'Project files created',
    });
  } catch (e) {
    scaffoldSpinner.stopAndPersist({
      symbol: chalk.red('✖'),
      text: 'Scaffolding failed',
    });
    throw e;
  }
}
