/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Complete TypeScript ingestion pipeline.
 *
 * Uses ts-morph for parsing and transformers.js for embeddings. By default it
 * indexes the checked-out IWSDK workspace resolved from INIT_CWD or
 * process.cwd(). Cloning remains an explicit override.
 */

import { execSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';
import { ASTChunker } from './ingestion/chunker.js';
import { TypeScriptParser } from './ingestion/parser.js';
import { TypeScriptChunk } from './ingestion/types.js';
import { installReferenceEmbeddingModel } from './model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function findPackageRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = resolve(dir, '..');
  }
  return resolve(__dirname, '..');
}

const PACKAGE_ROOT = findPackageRoot();
const IWSDK_REPO = 'https://github.com/facebook/immersive-web-sdk.git';
const INCLUDED_DEPENDENCIES = [
  '@types/three',
  '@types/webxr',
  '@pmndrs/pointer-events',
  '@pmndrs/uikit',
  '@drawcall/uikitml',
  '@preact/signals-core',
  'elics',
  '@babylonjs/havok',
] as const;
const MAX_CHUNK_LINES = 500;
const MAX_CHUNK_BYTES = 20_000;

export interface DependencyManifestEntry {
  packageName: string;
  sourceRoot: string;
  outputRoot: string;
  files: string[];
}

export interface CorpusManifest {
  schemaVersion: number;
  generatedAt: string;
  iwsdkFiles: string[];
  deps: Array<{
    packageName: string;
    outputRoot: string;
    files: string[];
  }>;
}

interface IngestOptions {
  clone?: boolean;
  keepRepo?: boolean;
  repoPath?: string;
  skipBuild?: boolean;
  skipEmbeddings?: boolean;
}

export function createEmbeddingsPayload(
  referenceVersion: string,
  model: Awaited<ReturnType<typeof installReferenceEmbeddingModel>>['metadata'],
  iwsdkData: Array<{ embedding?: unknown }>,
  depsData: Array<{ embedding?: unknown }>,
) {
  const firstEmbedding = iwsdkData[0]?.embedding;
  return {
    version: referenceVersion,
    model,
    dimensions: Array.isArray(firstEmbedding) ? firstEmbedding.length : 768,
    iwsdk: iwsdkData,
    deps: depsData,
  };
}

export function getProducerPaths() {
  return {
    packageRoot: PACKAGE_ROOT,
    tempDir: resolve(PACKAGE_ROOT, 'tools', '.temp'),
    legacyTempDir: resolve(PACKAGE_ROOT, '..', 'tools', '.temp'),
    dataDir: resolve(PACKAGE_ROOT, 'data'),
    modelDir: resolve(PACKAGE_ROOT, 'model'),
  };
}

function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}

export function detectMonorepoRoot(
  startDir = resolve(process.env.INIT_CWD ?? process.cwd()),
): string | null {
  let current = startDir;
  while (true) {
    if (
      existsSync(join(current, 'pnpm-workspace.yaml')) &&
      existsSync(join(current, 'packages', 'reference-assets', 'package.json'))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveDependencyRoot(
  nodeModules: string,
  packageName: string,
): string | null {
  const directPath = join(nodeModules, packageName);
  if (existsSync(directPath)) {
    return directPath;
  }

  const pnpmToken = packageName.startsWith('@')
    ? packageName.slice(1).replace('/', '+')
    : packageName;
  const matches = glob.sync(
    `.pnpm/${pnpmToken}@*/node_modules/${packageName}`,
    {
      cwd: nodeModules,
      absolute: true,
      follow: true,
    },
  );
  return matches[0] ?? null;
}

export async function collectIwsdkSourceFiles(
  iwsdkDir: string,
): Promise<string[]> {
  return glob('**/*.{ts,tsx}', {
    cwd: iwsdkDir,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'packages/reference/data/**',
      'packages/reference-assets/data/**',
      'packages/reference-assets/tools/.temp/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__tests__/**',
    ],
    absolute: true,
  });
}

export async function resolveIncludedDependencyRoots(
  iwsdkDir: string,
): Promise<DependencyManifestEntry[]> {
  const nodeModules = resolve(iwsdkDir, 'node_modules');
  if (!existsSync(nodeModules)) {
    return [];
  }

  const manifests: DependencyManifestEntry[] = [];
  for (const packageName of INCLUDED_DEPENDENCIES) {
    const sourceRoot = resolveDependencyRoot(nodeModules, packageName);
    if (!sourceRoot) {
      continue;
    }

    const files = await glob('**/*.d.ts', {
      cwd: sourceRoot,
      ignore: ['**/@types/node/**'],
      absolute: true,
      follow: true,
    });

    manifests.push({
      packageName,
      sourceRoot,
      outputRoot: packageName,
      files,
    });
  }

  return manifests;
}

function filterLargeChunks(chunks: TypeScriptChunk[]): {
  filtered: TypeScriptChunk[];
  skipped: number;
} {
  const filtered: TypeScriptChunk[] = [];
  let skipped = 0;

  for (const chunk of chunks) {
    const lineCount = chunk.end_line - chunk.start_line + 1;
    const byteSize = Buffer.byteLength(chunk.content, 'utf-8');

    if (lineCount > MAX_CHUNK_LINES || byteSize > MAX_CHUNK_BYTES) {
      skipped++;
      continue;
    }
    filtered.push(chunk);
  }

  return { filtered, skipped };
}

class IngestionPipeline {
  private packageRoot = getProducerPaths().packageRoot;
  private tempDir = getProducerPaths().tempDir;
  private dataDir = getProducerPaths().dataDir;

  async run(options: IngestOptions = {}) {
    console.error('='.repeat(80));
    console.error('🚀 IWSDK REFERENCE ASSET INGESTION PIPELINE');
    console.error('='.repeat(80));
    console.error('');

    try {
      const iwsdkDir = await this.resolveIwsdkDir(options);
      const iwsdkFiles = await collectIwsdkSourceFiles(iwsdkDir);
      const dependencyManifest = await resolveIncludedDependencyRoots(iwsdkDir);
      const corpusManifest: CorpusManifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        iwsdkFiles: iwsdkFiles.map((file) =>
          toPosixPath(relative(iwsdkDir, file)),
        ),
        deps: dependencyManifest.map((entry) => ({
          packageName: entry.packageName,
          outputRoot: entry.outputRoot,
          files: entry.files.map((file) =>
            toPosixPath(relative(entry.sourceRoot, file)),
          ),
        })),
      };

      const iwsdkChunks = await this.ingestIWSDK(iwsdkFiles);
      const depsChunks = await this.ingestDependencies(dependencyManifest);
      const iwsdkFile = await this.exportChunks(
        iwsdkChunks,
        'iwsdk_chunks.json',
        iwsdkDir,
      );
      const depsFile = await this.exportChunks(
        depsChunks,
        'deps_chunks.json',
        null,
      );

      if (options.skipEmbeddings) {
        console.error('');
        console.error('='.repeat(80));
        console.error('⏹️  STOPPED BEFORE EMBEDDINGS (--skip-embeddings)');
        console.error('='.repeat(80));
        console.error(`  - ${iwsdkFile}`);
        console.error(`  - ${depsFile}`);
        console.error('');
        return;
      }

      const [iwsdkEmbeddings, depsEmbeddings] = await this.generateEmbeddings(
        iwsdkFile,
        depsFile,
      );
      await this.exportFinalEmbeddings(iwsdkEmbeddings, depsEmbeddings);
      this.copySourceFiles(iwsdkDir, corpusManifest, dependencyManifest);

      if (!options.keepRepo) {
        this.cleanup();
      }

      console.error('');
      console.error('='.repeat(80));
      console.error('✅ INGESTION PIPELINE COMPLETED SUCCESSFULLY');
      console.error('='.repeat(80));
      console.error('Next steps:');
      console.error('  1. pnpm --filter @iwsdk/reference-assets run build');
      console.error(
        '  2. pnpm --filter @iwsdk/reference-assets run build:model',
      );
      console.error(
        '  3. Warm a fresh runtime cache with iwsdk reference warmup',
      );
      console.error('');
    } catch (error) {
      console.error('');
      console.error('❌ INGESTION PIPELINE FAILED');
      console.error(error);
      process.exit(1);
    }
  }

  private async resolveIwsdkDir(options: IngestOptions): Promise<string> {
    console.error('='.repeat(80));
    console.error('📦 RESOLVING IWSDK SOURCE');
    console.error('='.repeat(80));
    console.error('');

    if (options.repoPath) {
      console.error(`📂 Using explicit repo path: ${options.repoPath}`);
      return resolve(options.repoPath);
    }

    const monorepoRoot = detectMonorepoRoot();
    if (monorepoRoot) {
      console.error(`📂 Detected monorepo root: ${monorepoRoot}`);
      console.error(
        '   Using local workspace (pass --clone to clone from GitHub instead)',
      );
      console.error('');
      return monorepoRoot;
    }

    if (!options.clone) {
      throw new Error(
        'No IWSDK repo root found from the current working directory. Run this command inside the checked-out monorepo, pass --repo-path=<path>, or opt into cloning with --clone.',
      );
    }

    const iwsdkDir = resolve(this.tempDir, 'immersive-web-sdk');
    mkdirSync(this.tempDir, { recursive: true });

    if (existsSync(iwsdkDir)) {
      console.error('🗑️  Removing existing repo...');
      rmSync(iwsdkDir, { recursive: true, force: true });
    }

    console.error(`🔽 Cloning ${IWSDK_REPO}...`);
    execSync(`git clone --depth 1 ${IWSDK_REPO} ${iwsdkDir}`, {
      stdio: 'inherit',
    });
    console.error('✅ Repository cloned');
    console.error('');

    if (!options.skipBuild) {
      console.error('📥 Installing dependencies...');
      execSync('pnpm install', {
        cwd: iwsdkDir,
        stdio: 'inherit',
      });
      console.error('✅ Dependencies installed');
      console.error('');
    }

    return iwsdkDir;
  }

  private async ingestIWSDK(iwsdkFiles: string[]): Promise<TypeScriptChunk[]> {
    console.error('='.repeat(80));
    console.error('📝 INGESTING IWSDK SOURCE CODE');
    console.error('='.repeat(80));
    console.error(`✅ Found ${iwsdkFiles.length} TypeScript files`);
    console.error('');

    const parser = new TypeScriptParser();
    const chunker = new ASTChunker();
    const allChunks: TypeScriptChunk[] = [];
    let successful = 0;
    let failed = 0;
    let totalSkipped = 0;

    for (let i = 0; i < iwsdkFiles.length; i++) {
      const file = iwsdkFiles[i];
      try {
        const chunks = parser.parseFile(file);
        if (chunks.length > 0) {
          const optimized = chunker.optimizeChunks(chunks);
          const { filtered, skipped } = filterLargeChunks(optimized);
          totalSkipped += skipped;
          for (const chunk of filtered) {
            chunk.source = 'iwsdk';
          }
          allChunks.push(...filtered);
          successful++;
        }

        if ((i + 1) % 25 === 0 || i + 1 === iwsdkFiles.length) {
          const progress = Math.round(((i + 1) / iwsdkFiles.length) * 100);
          console.error(
            `   Progress: ${i + 1}/${iwsdkFiles.length} files (${progress}%) - ${allChunks.length} chunks so far`,
          );
        }
      } catch (error) {
        failed++;
        if (failed <= 5) {
          console.error(`  ⚠️  Error processing ${file}: ${error}`);
        }
      }
    }

    console.error('');
    console.error(`✅ Processed ${successful} files successfully`);
    if (failed > 0) {
      console.error(`⚠️  Failed to process ${failed} files`);
    }
    if (totalSkipped > 0) {
      console.error(`📊 Filtered out ${totalSkipped} oversized chunks`);
    }
    console.error(`📊 Generated ${allChunks.length} code chunks`);
    console.error('');
    return allChunks;
  }

  private async ingestDependencies(
    dependencyManifest: DependencyManifestEntry[],
  ): Promise<TypeScriptChunk[]> {
    console.error('='.repeat(80));
    console.error('📦 INGESTING DEPENDENCIES');
    console.error('='.repeat(80));
    console.error('');

    const dtsFiles = dependencyManifest.flatMap((entry) => entry.files);
    console.error(
      `✅ Found ${dtsFiles.length} type definition files from dependencies`,
    );
    console.error('');

    if (dtsFiles.length === 0) {
      return [];
    }

    const parser = new TypeScriptParser();
    const chunker = new ASTChunker();
    const allChunks: TypeScriptChunk[] = [];
    let totalSkipped = 0;

    for (let i = 0; i < dtsFiles.length; i++) {
      const file = dtsFiles[i];
      const entry = dependencyManifest.find((manifest) =>
        manifest.files.includes(file),
      );
      if (!entry) {
        continue;
      }

      try {
        const chunks = parser.parseFile(file);
        if (chunks.length > 0) {
          const optimized = chunker.optimizeChunks(chunks);
          const { filtered, skipped } = filterLargeChunks(optimized);
          totalSkipped += skipped;

          for (const chunk of filtered) {
            chunk.source = 'deps';
            chunk.file_path = toPosixPath(
              join(
                entry.outputRoot,
                relative(entry.sourceRoot, chunk.file_path),
              ),
            );
          }

          allChunks.push(...filtered);
        }

        if ((i + 1) % 50 === 0 || i + 1 === dtsFiles.length) {
          const progress = Math.round(((i + 1) / dtsFiles.length) * 100);
          console.error(
            `   Progress: ${i + 1}/${dtsFiles.length} files (${progress}%) - ${allChunks.length} chunks so far`,
          );
        }
      } catch {
        // Skip dependency parse failures to keep ingest moving.
      }
    }

    console.error('');
    if (totalSkipped > 0) {
      console.error(`📊 Filtered out ${totalSkipped} oversized chunks`);
    }
    console.error(`📊 Generated ${allChunks.length} dependency chunks`);
    console.error('');
    return allChunks;
  }

  private async exportChunks(
    chunks: TypeScriptChunk[],
    filename: string,
    basePath: string | null,
  ): Promise<string> {
    console.error(`📤 Exporting chunks to ${filename}...`);

    const chunksWithRelativePaths = chunks.map((chunk) => ({
      ...chunk,
      file_path: basePath
        ? toPosixPath(relative(basePath, chunk.file_path))
        : toPosixPath(chunk.file_path),
    }));

    mkdirSync(this.tempDir, { recursive: true });
    const outputPath = resolve(this.tempDir, filename);
    writeFileSync(outputPath, JSON.stringify(chunksWithRelativePaths, null, 2));
    console.error(`✅ Exported ${chunks.length} chunks to ${outputPath}`);
    console.error('');
    return outputPath;
  }

  private async generateEmbeddings(
    iwsdkFile: string,
    depsFile: string,
  ): Promise<[string, string]> {
    console.error('='.repeat(80));
    console.error('🧠 GENERATING EMBEDDINGS');
    console.error('='.repeat(80));
    console.error('');

    const embedScript = resolve(
      this.packageRoot,
      'dist-tools',
      'tools',
      'generate-embeddings.js',
    );

    if (!existsSync(embedScript)) {
      console.error('🔨 Building TypeScript embeddings script...');
      execSync('npm run build:tools', {
        cwd: this.packageRoot,
        stdio: 'inherit',
      });
      console.error('');
    }

    const iwsdkOutput = resolve(this.tempDir, 'iwsdk_embeddings.json');
    const depsOutput = resolve(this.tempDir, 'deps_embeddings.json');

    console.error('📊 Generating IWSDK embeddings...');
    execSync(`node ${embedScript} ${iwsdkFile} ${iwsdkOutput}`, {
      cwd: this.packageRoot,
      stdio: 'inherit',
    });
    console.error('');

    console.error('📊 Generating dependency embeddings...');
    execSync(`node ${embedScript} ${depsFile} ${depsOutput}`, {
      cwd: this.packageRoot,
      stdio: 'inherit',
    });
    console.error('');

    return [iwsdkOutput, depsOutput];
  }

  private async exportFinalEmbeddings(
    iwsdkFile: string,
    depsFile: string,
  ): Promise<void> {
    console.error('='.repeat(80));
    console.error('📤 EXPORTING TO JSON');
    console.error('='.repeat(80));
    console.error('');

    const iwsdkData = JSON.parse(readFileSync(iwsdkFile, 'utf-8'));
    const depsData = JSON.parse(readFileSync(depsFile, 'utf-8'));

    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    let referenceVersion = 'unknown';
    try {
      const pkg = JSON.parse(
        readFileSync(resolve(this.packageRoot, 'package.json'), 'utf-8'),
      ) as { version?: string };
      referenceVersion = pkg.version ?? 'unknown';
    } catch (error) {
      console.error(`⚠️  Could not extract package version: ${error}`);
    }

    const { metadata: model } = await installReferenceEmbeddingModel();

    const outputData = createEmbeddingsPayload(
      referenceVersion,
      model,
      iwsdkData,
      depsData,
    );

    const embeddingsFile = resolve(this.dataDir, 'embeddings.json');
    writeFileSync(embeddingsFile, JSON.stringify(outputData));
    console.error(`✅ Exported to ${embeddingsFile}`);
    console.error(`   Total chunks: ${iwsdkData.length + depsData.length}`);
    console.error('');
  }

  private copySourceFiles(
    iwsdkDir: string,
    corpusManifest: CorpusManifest,
    dependencyManifest: DependencyManifestEntry[],
  ): void {
    console.error('='.repeat(80));
    console.error('📋 COPYING SOURCE FILES');
    console.error('='.repeat(80));
    console.error('');

    const sourcesDir = resolve(this.dataDir, 'sources');
    if (existsSync(sourcesDir)) {
      console.error('🧹 Clearing existing source files...');
      rmSync(sourcesDir, { recursive: true, force: true });
    }

    mkdirSync(sourcesDir, { recursive: true });
    console.error(`📁 Target directory: ${sourcesDir}`);
    console.error('');

    console.error('📦 Copying IWSDK source files...');
    for (const relativePath of corpusManifest.iwsdkFiles) {
      const sourcePath = join(iwsdkDir, relativePath);
      const targetPath = join(sourcesDir, 'iwsdk', relativePath);
      mkdirSync(dirname(targetPath), { recursive: true });
      cpSync(sourcePath, targetPath);
    }
    console.error(
      `✅ Copied ${corpusManifest.iwsdkFiles.length} IWSDK source files`,
    );
    console.error('');

    console.error('📦 Copying dependency type definitions...');
    for (const entry of dependencyManifest) {
      console.error(`  - Copying ${entry.packageName}...`);
      for (const file of entry.files) {
        const relativePath = toPosixPath(relative(entry.sourceRoot, file));
        const targetPath = join(
          sourcesDir,
          'deps',
          entry.outputRoot,
          relativePath,
        );
        mkdirSync(dirname(targetPath), { recursive: true });
        cpSync(file, targetPath);
      }
    }

    const manifestPath = resolve(this.dataDir, 'corpus-manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(corpusManifest, null, 2)}\n`);
    console.error('✅ Source files copied');
    console.error('');
  }

  private cleanup(): void {
    console.error('🗑️  Cleaning up temporary files...');
    if (existsSync(this.tempDir)) {
      rmSync(this.tempDir, { recursive: true, force: true });
    }
    console.error('✅ Cleanup complete');
    console.error('');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: IngestOptions = {};

  for (const arg of args) {
    if (arg === '--keep-repo') {
      options.keepRepo = true;
    } else if (arg === '--clone') {
      options.clone = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--skip-embeddings') {
      options.skipEmbeddings = true;
      options.keepRepo = true;
    } else if (arg.startsWith('--repo-path=')) {
      options.repoPath = arg.split('=')[1];
    }
  }

  await new IngestionPipeline().run(options);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
