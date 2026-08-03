#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as tar from 'tar';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const distDir = path.join(packageRoot, 'dist');
const ALLOW_MISSING = process.argv.includes('--if-ready');
const SKIP_BUILD = process.env.IWSDK_REFERENCE_ASSETS_SKIP_BUILD === '1';

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function buildArchive(kind) {
  const sourceDir = path.join(packageRoot, kind);
  const outputFile = path.join(distDir, `${kind}.tgz`);

  try {
    await fsp.access(sourceDir);
  } catch {
    if (ALLOW_MISSING) {
      return null;
    }
    throw new Error(
      `Missing ${kind}/ in @iwsdk/reference-assets. Run "pnpm --filter @iwsdk/reference-assets run ingest" first.`,
    );
  }
  await tar.c(
    {
      cwd: packageRoot,
      file: outputFile,
      gzip: true,
      portable: true,
      noPax: true,
      mtime: new Date(0),
    },
    [kind],
  );

  const archiveStat = await fsp.stat(outputFile);
  return {
    file: path.basename(outputFile),
    size: archiveStat.size,
    sha256: await sha256File(outputFile),
  };
}

async function main() {
  if (SKIP_BUILD) {
    process.stdout.write(
      'Skipping @iwsdk/reference-assets dist build because IWSDK_REFERENCE_ASSETS_SKIP_BUILD=1.\n',
    );
    return;
  }

  const assetsPackage = JSON.parse(
    await fsp.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );
  const embeddingsPath = path.join(packageRoot, 'data', 'embeddings.json');

  await fsp.rm(distDir, { recursive: true, force: true });
  await fsp.mkdir(distDir, { recursive: true });

  const data = await buildArchive('data');
  if (!data) {
    process.stdout.write(
      'Skipping @iwsdk/reference-assets dist build because producer artifacts are not present yet.\n',
    );
    await fsp.rm(distDir, { recursive: true, force: true });
    return;
  }

  const embeddings = JSON.parse(await fsp.readFile(embeddingsPath, 'utf8'));
  if (
    typeof embeddings !== 'object' ||
    embeddings === null ||
    embeddings.model?.source !== 'archive' ||
    embeddings.model?.format !== 'transformers-js' ||
    typeof embeddings.model?.archiveSha256 !== 'string' ||
    typeof embeddings.model?.archiveSize !== 'number'
  ) {
    throw new Error(
      'data/embeddings.json is missing pinned model metadata. Re-run the ingest pipeline.',
    );
  }

  const manifest = {
    schemaVersion: 3,
    referenceVersion: assetsPackage.version,
    assetsPackage: {
      name: assetsPackage.name,
      version: assetsPackage.version,
    },
    generatedAt: new Date().toISOString(),
    assets: {
      data,
    },
  };

  await fsp.writeFile(
    path.join(distDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  process.stdout.write(
    `Built reference assets in ${distDir} (${data.size} B data)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Failed to build @iwsdk/reference-assets: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});
