/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
} from 'fs';
import { mkdir, rename, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tar from 'tar';

export type ReferenceEmbeddingModelDType =
  | 'auto'
  | 'fp32'
  | 'fp16'
  | 'q8'
  | 'int8'
  | 'uint8'
  | 'q4'
  | 'bnb4'
  | 'q4f16';

export interface ReferenceEmbeddingModelMetadata {
  source: 'archive';
  format: 'transformers-js';
  archiveSha256: string;
  archiveSize: number;
  fileHashes?: Record<string, string>;
  dtype: ReferenceEmbeddingModelDType;
  pooling: 'mean';
  normalize: true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(
  __dirname,
  path.basename(path.dirname(__dirname)) === 'dist-tools'
    ? path.join('..', '..', '..', 'reference', 'src', 'model-contract.json')
    : path.join('..', '..', 'reference', 'src', 'model-contract.json'),
);
const modelContract = JSON.parse(readFileSync(contractPath, 'utf8')) as {
  source: ReferenceEmbeddingModelMetadata['source'];
  format: ReferenceEmbeddingModelMetadata['format'];
  repoId: string;
  revision: string;
  dtype: ReferenceEmbeddingModelMetadata['dtype'];
  pooling: ReferenceEmbeddingModelMetadata['pooling'];
  normalize: ReferenceEmbeddingModelMetadata['normalize'];
  files: Array<{
    relativePath: string;
    sourceUrl: string;
  }>;
};
const REFERENCE_MODEL_ONNX_PATH = 'onnx/model_quantized.onnx';

export const REFERENCE_MODEL_REPO_ID = modelContract.repoId;
export const REFERENCE_MODEL_REVISION = modelContract.revision;
export const REFERENCE_MODEL_FILE_SOURCES = Object.freeze(
  modelContract.files.map((file) => ({
    relativePath: file.relativePath,
    sourceUrl: file.sourceUrl,
  })),
);
export const REFERENCE_MODEL_ONNX_URL =
  REFERENCE_MODEL_FILE_SOURCES.find(
    (file) => file.relativePath === REFERENCE_MODEL_ONNX_PATH,
  )?.sourceUrl ?? '';
const DEFAULT_REFERENCE_MODEL_SETTINGS = Object.freeze({
  source: modelContract.source,
  format: modelContract.format,
  dtype: modelContract.dtype,
  pooling: modelContract.pooling,
  normalize: modelContract.normalize,
});
const REQUIRED_MODEL_FILES = Object.freeze(
  REFERENCE_MODEL_FILE_SOURCES.map((file) => file.relativePath),
);

function buildReferenceEmbeddingModelMetadata(
  archiveSha256: string,
  archiveSize: number,
  fileHashes?: Record<string, string>,
): ReferenceEmbeddingModelMetadata {
  return {
    ...DEFAULT_REFERENCE_MODEL_SETTINGS,
    archiveSha256,
    archiveSize,
    ...(fileHashes ? { fileHashes } : {}),
  };
}

export function formatReferenceEmbeddingModel(
  model: ReferenceEmbeddingModelMetadata,
): string {
  return `sha256:${model.archiveSha256}`;
}

export function hasReferenceEmbeddingModelFiles(
  modelDir: string | null,
): boolean {
  if (!modelDir) {
    return false;
  }

  return REQUIRED_MODEL_FILES.every((relativePath) =>
    existsSync(path.join(modelDir, relativePath)),
  );
}

async function writeResponseToFile(
  response: Response,
  destination: string,
  sourceUrl: string,
): Promise<void> {
  if (!response.body) {
    throw new Error(`No response body received from ${sourceUrl}`);
  }

  const fileStream = createWriteStream(destination);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      if (!fileStream.write(chunk)) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.once('finish', resolve);
      fileStream.once('error', reject);
    });
  } catch (error) {
    fileStream.destroy();
    throw error;
  }
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadPinnedModelFile(
  sourceUrl: string,
  destination: string,
  expected: {
    sha256?: string;
    size?: number;
  } = {},
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Unable to fetch ${sourceUrl}: HTTP ${response.status}`);
    }
    await writeResponseToFile(response, destination, sourceUrl);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`Unable to fetch ${sourceUrl}: HTTP `)
    ) {
      throw error;
    }
    await rm(destination, { force: true }).catch(() => {});
    const curlResult = spawnSync(
      'curl',
      [
        '-L',
        '--fail',
        '--silent',
        '--show-error',
        sourceUrl,
        '--output',
        destination,
      ],
      {
        encoding: 'utf8',
      },
    );
    if (curlResult.status !== 0) {
      throw new Error(
        `Unable to fetch ${sourceUrl}: ${
          curlResult.stderr?.trim() ||
          (error instanceof Error ? error.message : String(error))
        }`,
      );
    }
  }

  const downloaded = await stat(destination);
  if (
    typeof expected.size === 'number' &&
    Number.isFinite(expected.size) &&
    downloaded.size !== expected.size
  ) {
    throw new Error(
      `Size mismatch for ${sourceUrl}: expected ${expected.size}, got ${downloaded.size}`,
    );
  }
  if (expected.sha256) {
    const actualSha = await sha256File(destination);
    if (actualSha !== expected.sha256) {
      throw new Error(
        `Checksum mismatch for ${sourceUrl}: expected ${expected.sha256}, got ${actualSha}`,
      );
    }
  }
}

async function createDeterministicModelArchive(
  sourceDir: string,
  archivePath: string,
): Promise<void> {
  await tar.c(
    {
      cwd: path.dirname(sourceDir),
      file: archivePath,
      gzip: true,
      portable: true,
      noPax: true,
      mtime: new Date(0),
    },
    [path.basename(sourceDir)],
  );
}

async function computeModelFileHashes(
  modelDir: string,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of REFERENCE_MODEL_FILE_SOURCES) {
    hashes[file.relativePath] = await sha256File(
      path.join(modelDir, file.relativePath),
    );
  }
  return hashes;
}

async function validateInstalledModelFiles(
  modelDir: string,
  expectedFileHashes: Record<string, string> | undefined,
): Promise<boolean> {
  if (!hasReferenceEmbeddingModelFiles(modelDir)) {
    return false;
  }

  if (!expectedFileHashes) {
    return true;
  }

  for (const [relativePath, expectedSha] of Object.entries(
    expectedFileHashes,
  )) {
    try {
      const actualSha = await sha256File(path.join(modelDir, relativePath));
      if (actualSha !== expectedSha) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

export interface InstalledReferenceEmbeddingModel {
  metadata: ReferenceEmbeddingModelMetadata;
  modelDir: string;
  sourceUrl: string;
}

function getDefaultSharedCacheRoot(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'iwsdk', 'reference');
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'iwsdk',
      'reference',
    );
  }

  return path.join(
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'),
    'iwsdk',
    'reference',
  );
}

export function getReferenceSharedCacheRoot(): string {
  const override = process.env.IWSDK_REFERENCE_CACHE_DIR;
  return path.resolve(override ? override : getDefaultSharedCacheRoot());
}

export function getReferenceModelsRoot(
  sharedRoot = getReferenceSharedCacheRoot(),
): string {
  return path.join(sharedRoot, 'models');
}

function getReferenceModelStagingRoot(
  sharedRoot = getReferenceSharedCacheRoot(),
): string {
  return path.join(sharedRoot, 'staging', 'reference-assets-model');
}

async function installReferenceModelFiles(
  metadata: ReferenceEmbeddingModelMetadata,
  stagingRoot: string,
  extractedDir: string,
  sharedRoot = getReferenceSharedCacheRoot(),
): Promise<string> {
  const finalRoot = path.join(
    getReferenceModelsRoot(sharedRoot),
    metadata.archiveSha256,
  );
  const finalDir = path.join(finalRoot, 'model');
  if (await validateInstalledModelFiles(finalDir, metadata.fileHashes)) {
    return finalDir;
  }
  await rm(finalRoot, { recursive: true, force: true });

  if (!hasReferenceEmbeddingModelFiles(extractedDir)) {
    throw new Error(
      'Pinned reference model files are incomplete after download.',
    );
  }

  await mkdir(path.dirname(finalRoot), { recursive: true });
  const tempFinalRoot = `${finalRoot}.tmp-${process.pid}-${Date.now()}`;
  await rm(tempFinalRoot, { recursive: true, force: true });
  await rename(stagingRoot, tempFinalRoot);

  try {
    await rename(tempFinalRoot, finalRoot);
  } catch (error) {
    await rm(tempFinalRoot, { recursive: true, force: true });
    if (!(await validateInstalledModelFiles(finalDir, metadata.fileHashes))) {
      throw error;
    }
  }

  return finalDir;
}

export async function installReferenceEmbeddingModel(): Promise<InstalledReferenceEmbeddingModel> {
  const sharedRoot = getReferenceSharedCacheRoot();
  const stagingRoot = path.join(
    getReferenceModelStagingRoot(sharedRoot),
    `${Date.now()}-${process.pid}`,
  );
  const extractedDir = path.join(stagingRoot, 'model');
  const archivePath = path.join(stagingRoot, 'model.tgz');

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(path.join(extractedDir, 'onnx'), { recursive: true });

  try {
    for (const file of REFERENCE_MODEL_FILE_SOURCES) {
      const destination = path.join(extractedDir, file.relativePath);
      await downloadPinnedModelFile(file.sourceUrl, destination);
    }

    const fileHashes = await computeModelFileHashes(extractedDir);

    await createDeterministicModelArchive(extractedDir, archivePath);
    const archiveStat = await stat(archivePath);
    const metadata = buildReferenceEmbeddingModelMetadata(
      await sha256File(archivePath),
      archiveStat.size,
      fileHashes,
    );
    const modelDir = await installReferenceModelFiles(
      metadata,
      stagingRoot,
      extractedDir,
      sharedRoot,
    );
    return {
      metadata,
      modelDir,
      sourceUrl: REFERENCE_MODEL_ONNX_URL,
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}
