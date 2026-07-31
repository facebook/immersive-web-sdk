#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildProject } from '@pmndrs/chef';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const RECIPES_DIR = path.join(ROOT, 'dist', 'recipes');

const REQUIRED_RECIPE_EDITS = {
  'base-claude-config.recipe.json': [
    '.claude/skills/iwsdk-scene-composer/SKILL.md',
    '.claude/skills/iwsdk-scene-composer/agents/openai.yaml',
    '.claude/skills/iwsdk-scene-composer/references/composition-patterns.md',
    '.claude/skills/iwsdk-scene-composer/references/image-intake.md',
    '.claude/skills/iwsdk-scene-composer/references/review-and-stop.md',
    '.claude/skills/iwsdk-scene-composer/references/scene-format.md',
    '.claude/skills/iwsdk-scene-composer/references/text-intake.md',
  ],
  'base-codex-config.recipe.json': [
    '.agents/skills/iwsdk-scene-composer/SKILL.md',
    '.agents/skills/iwsdk-scene-composer/agents/openai.yaml',
    '.agents/skills/iwsdk-scene-composer/references/composition-patterns.md',
    '.agents/skills/iwsdk-scene-composer/references/image-intake.md',
    '.agents/skills/iwsdk-scene-composer/references/review-and-stop.md',
    '.agents/skills/iwsdk-scene-composer/references/scene-format.md',
    '.agents/skills/iwsdk-scene-composer/references/text-intake.md',
  ],
};

const MIME_TYPES = {
  '.css': 'text/css',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain',
  '.txt': 'text/plain',
  '.uikitml': 'application/xml',
  '.xml': 'application/xml',
};

function resolveRecipeUrls(recipe, baseUrl) {
  if (!recipe.edits) {
    return recipe;
  }

  const edits = {};
  for (const [key, value] of Object.entries(recipe.edits)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.url === 'string' &&
      !URL.canParse(value.url)
    ) {
      edits[key] = { ...value, url: new URL(value.url, baseUrl).href };
      continue;
    }
    edits[key] = value;
  }

  return { ...recipe, edits };
}

async function startDistServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(
      /^\/+/,
      '',
    );
    const filePath = path.resolve(DIST_DIR, relativePath);

    if (
      filePath !== DIST_DIR &&
      !filePath.startsWith(`${DIST_DIR}${path.sep}`)
    ) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fsp
      .readFile(filePath)
      .then((bytes) => {
        const contentType =
          MIME_TYPES[path.extname(filePath).toLowerCase()] ||
          'application/octet-stream';
        res.writeHead(200, { 'content-type': contentType });
        res.end(bytes);
      })
      .catch(() => {
        res.writeHead(404).end('Not found');
      });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not bind local verification server.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function main() {
  const files = (await fsp.readdir(RECIPES_DIR)).filter((f) =>
    f.endsWith('.recipe.json'),
  );
  if (files.length === 0) {
    console.error('No *.recipe.json files found in dist/recipes. Build first.');
    process.exit(1);
  }
  const distServer = await startDistServer();
  let ok = 0;
  try {
    for (const f of files) {
      const p = path.join(RECIPES_DIR, f);
      const recipe = resolveRecipeUrls(
        JSON.parse(await fsp.readFile(p, 'utf8')),
        distServer.baseUrl,
      );
      try {
        for (const requiredEdit of REQUIRED_RECIPE_EDITS[f] || []) {
          if (recipe.edits?.[requiredEdit] == null) {
            throw new Error(`missing required edit ${requiredEdit}`);
          }
        }
        const result = await buildProject([recipe], undefined, {
          allowUrl: true,
        });
        const count = Object.keys(result).length;
        console.log(`OK ${f} (${count} files)`);
        ok++;
      } catch (e) {
        console.error(`FAIL ${f}:`, e?.message || e);
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await distServer.close();
  }
  console.log(`Summary: ${ok} / ${files.length} recipes OK`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
