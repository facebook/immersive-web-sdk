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
import { mkdir, readFile, rename, rm, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import {
  hasReferenceEmbeddingModelFiles,
  REFERENCE_MODEL_FILE_SOURCES,
  REFERENCE_MODEL_ONNX_URL,
} from './model-contract.js';
import { findReferenceWorkspaceRoot, PACKAGE_ROOT } from './paths.js';
import {
  isReferenceEmbeddingModelMetadata,
  type EmbeddingsData,
  type ReferenceEmbeddingModelMetadata,
} from './types.js';

export { REFERENCE_MODEL_ONNX_URL } from './model-contract.js';

const STATE_SCHEMA_VERSION = 4;
const MANIFEST_SCHEMA_VERSION = 3;
const REFERENCE_ASSETS_PACKAGE_NAME = '@iwsdk/reference-assets';
const REFERENCE_STATE_RELATIVE_DIR = path.join('.iwsdk', 'reference');

export type ReferenceInitState =
  | 'not_started'
  | 'in_progress'
  | 'ready'
  | 'failed';

type AssetKind = 'data' | 'model';

interface AssetArchiveDescriptor {
  file: string;
  sha256: string;
  size: number;
}

interface ReferenceAssetsManifest {
  schemaVersion: number;
  referenceVersion: string;
  assetsPackage: {
    name: string;
    version: string;
  };
  generatedAt: string;
  assets: {
    data: AssetArchiveDescriptor;
  };
}

interface ReferenceStateFile {
  schemaVersion: number;
  packageVersion: string;
  assetsPackage: {
    name: string;
    version: string;
  };
  status: Exclude<ReferenceInitState, 'not_started'>;
  pid: number | null;
  manifestUrl: string | null;
  dataDir: string | null;
  dataSha256: string | null;
  modelDir: string | null;
  modelSha256: string | null;
  modelUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  error: {
    message: string;
    at: string;
  } | null;
}

export interface ReferenceCacheStatus {
  packageVersion: string;
  assetsPackage: {
    name: string;
    version: string;
  };
  workspaceRoot: string;
  stateRoot: string;
  sharedDataRoot: string;
  sharedModelRoot: string;
  initState: ReferenceInitState;
  manifestUrl: string | null;
  dataDir: string | null;
  dataSha256: string | null;
  modelDir: string | null;
  modelSha256: string | null;
  modelUrl: string | null;
  model: ReferenceEmbeddingModelMetadata | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  error: {
    message: string;
    at: string;
  } | null;
  warmupRequired: boolean;
}

export interface ReferenceWarmupEvent {
  phase: 'checking' | 'downloading' | 'extracting' | 'finalizing';
  message: string;
  asset?: AssetKind;
  sourceUrl?: string;
  completedBytes?: number;
  totalBytes?: number;
}

export class ReferenceWarmupRequiredError extends Error {
  readonly code = 'warmup_required';

  constructor(message = buildWarmupRequiredMessage()) {
    super(message);
    this.name = 'ReferenceWarmupRequiredError';
  }
}

export class ReferenceWarmupFailedError extends Error {
  readonly code = 'warmup_failed';

  constructor(message: string) {
    super(message);
    this.name = 'ReferenceWarmupFailedError';
  }
}

function readReferencePackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  ) as { version?: string };
  return packageJson.version ?? '0.0.0';
}

export function getReferencePackageVersion(): string {
  return readReferencePackageVersion();
}

export function getReferenceAssetsPackageVersion(): string {
  return (
    process.env.IWSDK_REFERENCE_ASSETS_VERSION ?? getReferencePackageVersion()
  );
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getReferenceAssetsBaseUrls(): string[] {
  const override = process.env.IWSDK_REFERENCE_ASSETS_BASE_URL;
  if (override) {
    return override
      .split(',')
      .map((entry) => trimTrailingSlash(entry.trim()))
      .filter(Boolean);
  }

  const assetsVersion = getReferenceAssetsPackageVersion();
  return [
    `https://unpkg.com/${REFERENCE_ASSETS_PACKAGE_NAME}@${assetsVersion}/dist`,
  ];
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

export function getReferenceCacheRoot(): string {
  return getReferenceSharedCacheRoot();
}

export function getReferenceWorkspaceRoot(): string {
  return path.resolve(findReferenceWorkspaceRoot());
}

export function getReferenceStateRoot(
  workspaceRoot = getReferenceWorkspaceRoot(),
): string {
  return path.join(workspaceRoot, REFERENCE_STATE_RELATIVE_DIR);
}

function getStateFilePath(): string {
  return path.join(getReferenceStateRoot(), 'state.json');
}

function getCorporaRoot(sharedRoot = getReferenceSharedCacheRoot()): string {
  return path.join(sharedRoot, 'corpora');
}

function getModelsRoot(sharedRoot = getReferenceSharedCacheRoot()): string {
  return path.join(sharedRoot, 'models');
}

function getStagingRoot(sharedRoot = getReferenceSharedCacheRoot()): string {
  return path.join(sharedRoot, 'staging');
}

function nowIso(): string {
  return new Date().toISOString();
}

function downloadWithCurl(sourceUrl: string, destination: string): void {
  const result = spawnSync(
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
  if (result.status !== 0) {
    throw new Error(
      `Unable to fetch ${sourceUrl}: ${result.stderr?.trim() || 'curl failed'}`,
    );
  }
}

function fetchJsonWithCurl(sourceUrl: string): unknown {
  const result = spawnSync(
    'curl',
    ['-L', '--fail', '--silent', '--show-error', sourceUrl],
    {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Unable to fetch ${sourceUrl}: ${result.stderr?.trim() || 'curl failed'}`,
    );
  }
  return JSON.parse(result.stdout);
}

function isPidAlive(pid: number | null): boolean {
  if (!Number.isInteger(pid) || Number(pid) <= 0) {
    return false;
  }

  try {
    process.kill(pid as number, 0);
    return true;
  } catch {
    return false;
  }
}

function buildWarmupRequiredMessage(): string {
  return (
    'IWSDK reference assets are not initialized yet. ' +
    'Run "iwsdk reference warmup" before using reference tools so the corpus and pinned embedding model are ready.'
  );
}

async function ensureCacheDirectories(
  sharedRoot = getReferenceSharedCacheRoot(),
): Promise<void> {
  await Promise.all([
    mkdir(getReferenceStateRoot(), { recursive: true }),
    mkdir(getCorporaRoot(sharedRoot), { recursive: true }),
    mkdir(getModelsRoot(sharedRoot), { recursive: true }),
    mkdir(getStagingRoot(sharedRoot), { recursive: true }),
  ]);
}

async function readStateFile(): Promise<ReferenceStateFile | null> {
  const stateFile = getStateFilePath();
  if (!existsSync(stateFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(stateFile, 'utf8')) as {
      schemaVersion?: number;
    };
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
      return null;
    }
    return parsed as ReferenceStateFile;
  } catch {
    return null;
  }
}

async function writeStateFile(state: ReferenceStateFile): Promise<void> {
  const filePath = getStateFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function createInProgressState(packageVersion: string): ReferenceStateFile {
  const timestamp = nowIso();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    packageVersion,
    assetsPackage: {
      name: REFERENCE_ASSETS_PACKAGE_NAME,
      version: getReferenceAssetsPackageVersion(),
    },
    status: 'in_progress',
    pid: process.pid,
    manifestUrl: null,
    dataDir: null,
    dataSha256: null,
    modelDir: null,
    modelSha256: null,
    modelUrl: null,
    startedAt: timestamp,
    completedAt: null,
    updatedAt: timestamp,
    error: null,
  };
}

function buildBaseStatus(
  packageVersion: string,
  assetsPackage: { name: string; version: string },
): Pick<
  ReferenceCacheStatus,
  | 'packageVersion'
  | 'assetsPackage'
  | 'workspaceRoot'
  | 'stateRoot'
  | 'sharedDataRoot'
  | 'sharedModelRoot'
> {
  const workspaceRoot = getReferenceWorkspaceRoot();
  const stateRoot = getReferenceStateRoot(workspaceRoot);
  return {
    packageVersion,
    assetsPackage,
    workspaceRoot,
    stateRoot,
    sharedDataRoot: getCorporaRoot(),
    sharedModelRoot: getModelsRoot(),
  };
}

function buildFailureStatus(
  packageVersion: string,
  state: ReferenceStateFile,
  message: string,
): ReferenceCacheStatus {
  return {
    ...buildBaseStatus(packageVersion, state.assetsPackage),
    initState: 'failed',
    manifestUrl: state.manifestUrl,
    dataDir: state.dataDir,
    dataSha256: state.dataSha256,
    modelDir: state.modelDir,
    modelSha256: state.modelSha256,
    modelUrl: state.modelUrl,
    model: null,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    updatedAt: state.updatedAt,
    error: {
      message,
      at: state.updatedAt,
    },
    warmupRequired: true,
  };
}

async function readEmbeddingsData(
  dataDir: string,
): Promise<EmbeddingsData & { model: ReferenceEmbeddingModelMetadata }> {
  const embeddingsPath = path.join(dataDir, 'embeddings.json');
  const parsed = JSON.parse(
    await readFile(embeddingsPath, 'utf8'),
  ) as Partial<EmbeddingsData>;

  if (!isReferenceEmbeddingModelMetadata(parsed.model)) {
    throw new Error(
      `Reference embeddings at ${embeddingsPath} are missing pinned model metadata.`,
    );
  }

  if (!Number.isFinite(parsed.dimensions)) {
    throw new Error(
      `Reference embeddings at ${embeddingsPath} are missing a valid dimensions field.`,
    );
  }

  if (!Array.isArray(parsed.iwsdk) || !Array.isArray(parsed.deps)) {
    throw new Error(
      `Reference embeddings at ${embeddingsPath} are missing chunk arrays.`,
    );
  }

  return parsed as EmbeddingsData & { model: ReferenceEmbeddingModelMetadata };
}

async function validateDataDir(dataDir: string): Promise<boolean> {
  const requiredPaths = ['embeddings.json', 'sources'];
  for (const relativePath of requiredPaths) {
    try {
      await stat(path.join(dataDir, relativePath));
    } catch {
      return false;
    }
  }

  try {
    await readEmbeddingsData(dataDir);
    return true;
  } catch {
    return false;
  }
}

async function validateModelDir(modelDir: string): Promise<boolean> {
  return hasReferenceEmbeddingModelFiles(modelDir);
}

async function validateInstalledModelFiles(
  modelDir: string,
  expectedFileHashes: Record<string, string> | undefined,
): Promise<boolean> {
  if (!(await validateModelDir(modelDir))) {
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

async function readCurrentModelMetadata(
  dataDir: string | null,
): Promise<ReferenceEmbeddingModelMetadata | null> {
  if (!dataDir) {
    return null;
  }

  const embeddings = await readEmbeddingsData(dataDir);
  return embeddings.model;
}

function manifestUrlMatchesConfiguredSources(
  manifestUrl: string | null,
): boolean {
  if (!manifestUrl) {
    return true;
  }

  if (!process.env.IWSDK_REFERENCE_ASSETS_BASE_URL) {
    return true;
  }

  return getReferenceAssetsBaseUrls().some(
    (baseUrl) => manifestUrl === `${baseUrl}/manifest.json`,
  );
}

export async function getReferenceCacheStatus(): Promise<ReferenceCacheStatus> {
  const packageVersion = getReferencePackageVersion();
  const assetsPackage = {
    name: REFERENCE_ASSETS_PACKAGE_NAME,
    version: getReferenceAssetsPackageVersion(),
  };
  const state = await readStateFile();

  if (!state) {
    return {
      ...buildBaseStatus(packageVersion, assetsPackage),
      initState: 'not_started',
      manifestUrl: null,
      dataDir: null,
      dataSha256: null,
      modelDir: null,
      modelSha256: null,
      modelUrl: null,
      model: null,
      startedAt: null,
      completedAt: null,
      updatedAt: null,
      error: null,
      warmupRequired: true,
    };
  }

  if (state.packageVersion !== packageVersion) {
    return buildFailureStatus(
      packageVersion,
      state,
      `Reference cache was initialized for @iwsdk/reference@${state.packageVersion}, but the current package version is ${packageVersion}. Run "iwsdk reference warmup" again.`,
    );
  }

  if (
    state.assetsPackage.name !== assetsPackage.name ||
    state.assetsPackage.version !== assetsPackage.version
  ) {
    return buildFailureStatus(
      packageVersion,
      state,
      `Reference cache was initialized for ${state.assetsPackage.name}@${state.assetsPackage.version}, but the current assets package is ${assetsPackage.name}@${assetsPackage.version}. Run "iwsdk reference warmup" again.`,
    );
  }

  if (!manifestUrlMatchesConfiguredSources(state.manifestUrl)) {
    return buildFailureStatus(
      packageVersion,
      state,
      'Reference cache was initialized from a different assets source than the current configuration. Run "iwsdk reference warmup" again.',
    );
  }

  if (state.status === 'in_progress' && !isPidAlive(state.pid)) {
    return buildFailureStatus(
      packageVersion,
      state,
      'Reference warmup was interrupted before completion. Run "iwsdk reference warmup" again.',
    );
  }

  if (state.status === 'ready') {
    if (!(await validateDataDir(state.dataDir ?? ''))) {
      return buildFailureStatus(
        packageVersion,
        state,
        'Reference corpus cache is incomplete or corrupted. Run "iwsdk reference warmup" again.',
      );
    }

    try {
      const model = await readCurrentModelMetadata(state.dataDir);
      if (!model) {
        return buildFailureStatus(
          packageVersion,
          state,
          'Reference corpus metadata is missing model information. Run "iwsdk reference warmup" again.',
        );
      }

      if (!state.modelDir || !state.modelSha256) {
        return buildFailureStatus(
          packageVersion,
          state,
          'Reference model cache state is missing. Run "iwsdk reference warmup" again.',
        );
      }

      if (state.modelSha256 !== model.archiveSha256) {
        return buildFailureStatus(
          packageVersion,
          state,
          `Reference model cache sha ${state.modelSha256} does not match the warmed corpus metadata ${model.archiveSha256}. Run "iwsdk reference warmup" again to refresh the pinned model files.`,
        );
      }

      if (
        !(await validateInstalledModelFiles(state.modelDir, model.fileHashes))
      ) {
        return buildFailureStatus(
          packageVersion,
          state,
          'Reference model cache is incomplete or corrupted. Run "iwsdk reference warmup" again.',
        );
      }

      return {
        ...buildBaseStatus(packageVersion, state.assetsPackage),
        initState: 'ready',
        manifestUrl: state.manifestUrl,
        dataDir: state.dataDir,
        dataSha256: state.dataSha256,
        modelDir: state.modelDir,
        modelSha256: state.modelSha256,
        modelUrl: state.modelUrl,
        model,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        updatedAt: state.updatedAt,
        error: null,
        warmupRequired: false,
      };
    } catch (error) {
      return buildFailureStatus(
        packageVersion,
        state,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    ...buildBaseStatus(packageVersion, state.assetsPackage),
    initState: state.status,
    manifestUrl: state.manifestUrl,
    dataDir: state.dataDir,
    dataSha256: state.dataSha256,
    modelDir: state.modelDir,
    modelSha256: state.modelSha256,
    modelUrl: state.modelUrl,
    model: null,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    updatedAt: state.updatedAt,
    error: state.error,
    warmupRequired: true,
  };
}

export async function resolveReferenceAssets(): Promise<{
  dataDir: string;
  modelDir: string;
  model: ReferenceEmbeddingModelMetadata;
  status: ReferenceCacheStatus;
}> {
  const status = await getReferenceCacheStatus();
  if (
    status.initState === 'ready' &&
    status.dataDir &&
    status.modelDir &&
    status.model &&
    !status.warmupRequired
  ) {
    return {
      dataDir: status.dataDir,
      modelDir: status.modelDir,
      model: status.model,
      status,
    };
  }

  if (status.initState === 'failed') {
    throw new ReferenceWarmupFailedError(
      status.error?.message ?? buildWarmupRequiredMessage(),
    );
  }

  if (status.initState === 'in_progress') {
    throw new ReferenceWarmupFailedError(
      'Reference warmup is already in progress. Wait for it to finish or rerun "iwsdk reference warmup" if it was interrupted.',
    );
  }

  throw new ReferenceWarmupRequiredError();
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

function validateManifest(
  manifest: ReferenceAssetsManifest,
  packageVersion: string,
): ReferenceAssetsManifest {
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported reference assets manifest schema: ${manifest.schemaVersion}`,
    );
  }

  if (manifest.referenceVersion !== packageVersion) {
    throw new Error(
      `Reference assets version mismatch: expected ${packageVersion}, got ${manifest.referenceVersion}`,
    );
  }

  if (
    manifest.assetsPackage.name !== REFERENCE_ASSETS_PACKAGE_NAME ||
    !manifest.assetsPackage.version
  ) {
    throw new Error('Reference assets manifest is missing package metadata.');
  }

  const descriptor = manifest.assets.data;
  if (
    !descriptor?.file ||
    !descriptor?.sha256 ||
    !Number.isFinite(descriptor.size)
  ) {
    throw new Error('Reference assets manifest is missing data metadata.');
  }

  return manifest;
}

async function fetchManifest(
  packageVersion: string,
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<{
  manifest: ReferenceAssetsManifest;
  manifestUrl: string;
  baseUrl: string;
}> {
  const errors: string[] = [];

  for (const baseUrl of getReferenceAssetsBaseUrls()) {
    const manifestUrl = `${baseUrl}/manifest.json`;
    onEvent?.({
      phase: 'checking',
      message: `Fetching reference asset manifest from ${manifestUrl}`,
      sourceUrl: manifestUrl,
    });

    try {
      let parsedManifest: ReferenceAssetsManifest;
      try {
        const response = await fetch(manifestUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        parsedManifest = (await response.json()) as ReferenceAssetsManifest;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('HTTP ')) {
          throw error;
        }
        parsedManifest = fetchJsonWithCurl(
          manifestUrl,
        ) as ReferenceAssetsManifest;
      }

      const manifest = validateManifest(parsedManifest, packageVersion);
      return {
        manifest,
        manifestUrl,
        baseUrl,
      };
    } catch (error) {
      errors.push(
        `${manifestUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const unpublishedHint = process.env.IWSDK_REFERENCE_ASSETS_BASE_URL
    ? ''
    : '\nIf you are working against an unpublished @iwsdk/reference-assets version, host packages/reference-assets/dist locally and set IWSDK_REFERENCE_ASSETS_BASE_URL to that base URL.';
  throw new Error(
    `Unable to fetch reference assets manifest.\n${errors.join('\n')}${unpublishedHint}`,
  );
}

async function writeResponseToFile(
  response: Response,
  destination: string,
  asset: AssetKind,
  sourceUrl: string,
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error(`No response body received from ${sourceUrl}`);
  }

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : undefined;
  const fileStream = createWriteStream(destination);
  const reader = response.body.getReader();
  let completedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      completedBytes += chunk.length;
      if (!fileStream.write(chunk)) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }

      onEvent?.({
        phase: 'downloading',
        asset,
        message: `Downloading ${asset} archive`,
        sourceUrl,
        completedBytes,
        totalBytes,
      });
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

async function downloadArchive(
  asset: AssetKind,
  destination: string,
  sourceUrls: string[],
  expectedSha256: string,
  expectedSize: number,
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<string> {
  const errors: string[] = [];

  for (const sourceUrl of sourceUrls) {
    onEvent?.({
      phase: 'downloading',
      asset,
      message: `Fetching ${asset} archive from ${sourceUrl}`,
      sourceUrl,
      completedBytes: 0,
      totalBytes: expectedSize,
    });

    try {
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        await writeResponseToFile(
          response,
          destination,
          asset,
          sourceUrl,
          onEvent,
        );
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('HTTP ')) {
          throw error;
        }
        await rm(destination, { force: true });
        downloadWithCurl(sourceUrl, destination);
      }

      const actualSha = await sha256File(destination);
      if (actualSha !== expectedSha256) {
        throw new Error(
          `Checksum mismatch for ${asset}: expected ${expectedSha256}, got ${actualSha}`,
        );
      }

      const archiveStat = await stat(destination);
      if (archiveStat.size !== expectedSize) {
        throw new Error(
          `Size mismatch for ${asset}: expected ${expectedSize}, got ${archiveStat.size}`,
        );
      }

      return sourceUrl;
    } catch (error) {
      errors.push(
        `${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await rm(destination, { force: true });
    }
  }

  throw new Error(`Failed to download ${asset} archive.\n${errors.join('\n')}`);
}

async function installDataArchive(
  descriptor: AssetArchiveDescriptor,
  stagingRoot: string,
  baseUrl: string,
  sharedRoot = getReferenceSharedCacheRoot(),
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<string> {
  const finalRoot = path.join(getCorporaRoot(sharedRoot), descriptor.sha256);
  const finalDir = path.join(finalRoot, 'data');
  if (await validateDataDir(finalDir)) {
    return finalDir;
  }

  const archivePath = path.join(stagingRoot, 'data.tgz');
  const extractRoot = path.join(stagingRoot, 'data-extract');
  await rm(archivePath, { force: true });
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });

  const fallbackBaseUrls = getReferenceAssetsBaseUrls();
  const preferredUrls = [
    `${baseUrl}/${descriptor.file}`,
    ...fallbackBaseUrls
      .filter((candidateBaseUrl) => candidateBaseUrl !== baseUrl)
      .map((candidateBaseUrl) => `${candidateBaseUrl}/${descriptor.file}`),
  ];
  await downloadArchive(
    'data',
    archivePath,
    preferredUrls,
    descriptor.sha256,
    descriptor.size,
    onEvent,
  );

  onEvent?.({
    phase: 'extracting',
    asset: 'data',
    message: 'Extracting data archive',
  });
  await tar.x({
    file: archivePath,
    cwd: extractRoot,
  });

  const extractedDir = path.join(extractRoot, 'data');
  if (!(await validateDataDir(extractedDir))) {
    throw new Error(
      'Extracted data archive is missing expected files. Run "iwsdk reference warmup" again.',
    );
  }

  await mkdir(path.dirname(finalRoot), { recursive: true });
  const tempFinalRoot = `${finalRoot}.tmp-${process.pid}-${Date.now()}`;
  await rm(tempFinalRoot, { recursive: true, force: true });
  await rename(path.dirname(extractedDir), tempFinalRoot);

  try {
    await rename(tempFinalRoot, finalRoot);
  } catch (error) {
    await rm(tempFinalRoot, { recursive: true, force: true });
    if (!(await validateDataDir(finalDir))) {
      throw error;
    }
  }

  return finalDir;
}

async function downloadPinnedModelFile(
  destination: string,
  sourceUrl: string,
  expected: {
    sha256?: string;
    size?: number;
  } = {},
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<void> {
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Unable to fetch ${sourceUrl}: HTTP ${response.status}`);
    }

    await writeResponseToFile(
      response,
      destination,
      'model',
      sourceUrl,
      onEvent,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`Unable to fetch ${sourceUrl}: HTTP `)
    ) {
      throw error;
    }
    await rm(destination, { force: true }).catch(() => {});
    try {
      downloadWithCurl(sourceUrl, destination);
    } catch (curlError) {
      throw new Error(
        `Unable to fetch ${sourceUrl}: ${
          curlError instanceof Error
            ? curlError.message.replace(/^Unable to fetch [^:]+: /, '')
            : error instanceof Error
              ? error.message
              : String(error)
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

async function installPinnedModelFiles(
  metadata: ReferenceEmbeddingModelMetadata,
  stagingRoot: string,
  sharedRoot = getReferenceSharedCacheRoot(),
  onEvent?: (event: ReferenceWarmupEvent) => void,
): Promise<string> {
  const finalRoot = path.join(
    getModelsRoot(sharedRoot),
    metadata.archiveSha256,
  );
  const finalDir = path.join(finalRoot, 'model');
  if (await validateInstalledModelFiles(finalDir, metadata.fileHashes)) {
    return finalDir;
  }
  await rm(finalRoot, { recursive: true, force: true });

  const extractedDir = path.join(stagingRoot, 'model-extract', 'model');
  await rm(path.dirname(extractedDir), { recursive: true, force: true });
  await mkdir(path.join(extractedDir, 'onnx'), { recursive: true });

  for (const file of REFERENCE_MODEL_FILE_SOURCES) {
    const destination = path.join(extractedDir, file.relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await downloadPinnedModelFile(destination, file.sourceUrl, {}, onEvent);
  }

  if (!(await validateModelDir(extractedDir))) {
    throw new Error(
      'Pinned reference model files are incomplete after download.',
    );
  }

  if (metadata.fileHashes) {
    for (const [relativePath, expectedSha] of Object.entries(
      metadata.fileHashes,
    )) {
      const actualSha = await sha256File(path.join(extractedDir, relativePath));
      if (actualSha !== expectedSha) {
        throw new Error(
          `Pinned reference model file ${relativePath} has unexpected content after download. Run "iwsdk reference warmup" again.`,
        );
      }
    }
  }

  await mkdir(path.dirname(finalRoot), { recursive: true });
  const tempFinalRoot = `${finalRoot}.tmp-${process.pid}-${Date.now()}`;
  await rm(tempFinalRoot, { recursive: true, force: true });
  await rename(path.dirname(extractedDir), tempFinalRoot);

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

export async function warmupReferenceAssets({
  onEvent,
}: {
  onEvent?: (event: ReferenceWarmupEvent) => void;
} = {}): Promise<ReferenceCacheStatus> {
  const packageVersion = getReferencePackageVersion();
  const existingState = await readStateFile();
  if (
    existingState?.status === 'in_progress' &&
    isPidAlive(existingState.pid)
  ) {
    throw new ReferenceWarmupFailedError(
      `Reference warmup is already running under pid ${existingState.pid}.`,
    );
  }

  const existingStatus = await getReferenceCacheStatus();
  if (existingStatus.initState === 'ready' && !existingStatus.warmupRequired) {
    onEvent?.({
      phase: 'checking',
      message: 'Reference cache is already ready.',
    });
    return existingStatus;
  }

  await ensureCacheDirectories();

  let state = createInProgressState(packageVersion);
  await writeStateFile(state);
  const stagingRoot = path.join(
    getStagingRoot(),
    `${packageVersion}-${process.pid}-${Date.now()}`,
  );

  try {
    onEvent?.({
      phase: 'checking',
      message: 'Resolving reference assets manifest',
    });
    const { manifest, manifestUrl, baseUrl } = await fetchManifest(
      packageVersion,
      onEvent,
    );
    state = {
      ...state,
      assetsPackage: manifest.assetsPackage,
      manifestUrl,
      updatedAt: nowIso(),
    };
    await writeStateFile(state);

    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });

    const sharedRoot = getReferenceSharedCacheRoot();
    const dataDir = await installDataArchive(
      manifest.assets.data,
      stagingRoot,
      baseUrl,
      sharedRoot,
      onEvent,
    );
    state = {
      ...state,
      dataDir,
      dataSha256: manifest.assets.data.sha256,
      updatedAt: nowIso(),
    };
    await writeStateFile(state);

    const embeddings = await readEmbeddingsData(dataDir);
    const modelDir = await installPinnedModelFiles(
      embeddings.model,
      stagingRoot,
      sharedRoot,
      onEvent,
    );
    state = {
      ...state,
      modelDir,
      modelSha256: embeddings.model.archiveSha256,
      modelUrl: REFERENCE_MODEL_ONNX_URL,
      updatedAt: nowIso(),
    };
    await writeStateFile(state);

    onEvent?.({
      phase: 'finalizing',
      message: 'Finalizing reference cache state',
    });

    const completedAt = nowIso();
    await writeStateFile({
      ...state,
      status: 'ready',
      pid: null,
      dataDir,
      dataSha256: manifest.assets.data.sha256,
      modelDir,
      modelSha256: embeddings.model.archiveSha256,
      modelUrl: REFERENCE_MODEL_ONNX_URL,
      completedAt,
      updatedAt: completedAt,
      error: null,
    });

    return getReferenceCacheStatus();
  } catch (error) {
    const failedAt = nowIso();
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    await writeStateFile({
      ...state,
      status: 'failed',
      pid: null,
      updatedAt: failedAt,
      error: {
        message,
        at: failedAt,
      },
    });
    throw new ReferenceWarmupFailedError(message);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}
