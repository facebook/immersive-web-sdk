#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { Command } from 'commander';
import semver from 'semver';
import {
  installDependencies,
  printNextSteps,
  printPrerequisites,
} from './installer.js';
import { promptFlow } from './prompts.js';
import {
  DEFAULT_ASSETS_BASE,
  fetchRecipesIndex,
  fetchRecipeByFileName,
} from './recipes.js';
import { scaffoldProject } from './scaffold.js';
import { PromptResult, TriState, VariantId } from './types.js';
import { VERSION, NODE_ENGINE } from './version.js';

async function main() {
  // Enforce Node engines range from generated version.ts
  const nodeVer = process.versions.node;
  const requiredRange = NODE_ENGINE;
  if (!semver.satisfies(nodeVer, requiredRange, { includePrerelease: true })) {
    console.error(
      chalk.red(
        `Unsupported Node.js version: ${nodeVer}.\nRequires Node ${requiredRange}. Please upgrade (e.g., via nvm or Volta) and try again.`,
      ),
    );
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkgPath = join(__dirname, '../package.json');
  let version = '0.0.0';
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    version = JSON.parse(raw).version ?? version;
  } catch {}

  // Print banner
  const banner = `                                                 
▄▄▄▄▄▄  ▄▄      ▄▄   ▄▄▄▄    ▄▄▄▄▄     ▄▄   ▄▄▄ 
▀▀██▀▀  ██      ██ ▄█▀▀▀▀█   ██▀▀▀██   ██  ██▀  
  ██    ▀█▄ ██ ▄█▀ ██▄       ██    ██  ██▄██    
  ██     ██ ██ ██   ▀████▄   ██    ██  █████    
  ██     ███▀▀███       ▀██  ██    ██  ██  ██▄  
▄▄██▄▄   ███  ███  █▄▄▄▄▄█▀  ██▄▄▄██   ██   ██▄ 
▀▀▀▀▀▀   ▀▀▀  ▀▀▀   ▀▀▀▀▀    ▀▀▀▀▀     ▀▀    ▀▀
===============================================
IWSDK Create CLI v${VERSION}\nNode ${process.version}`;
  console.log(banner);

  const program = new Command();
  let nameArg: string | undefined;
  let yes = false;
  let assetsBaseFlag: string | undefined;
  program
    .name('Create IWSDK')
    .description('Official CLI for creating Immersive Web SDK projects')
    .version(version)
    .argument('[name]', 'Project name')
    .option('--assets-base <url>', 'Override CDN base for recipes and assets')
    .option('-y, --yes', 'Use defaults and skip prompts')
    .action((n: string | undefined, opts: any) => {
      nameArg = n;
      yes = !!opts.yes;
      assetsBaseFlag = opts.assetsBase;
    });
  program.parse(process.argv);

  try {
    const res = yes
      ? ({
          name: nameArg || 'iwsdk-app',
          id: 'vr-manual-ts' as VariantId,
          installNow: true,
          metaspatial: false,
          mode: 'vr',
          language: 'ts',
          features: [],
          featureFlags: {
            locomotionEnabled: true,
            locomotionUseWorker: true,
            grabbingEnabled: true,
            physicsEnabled: false,
            sceneUnderstandingEnabled: false,
          },
          gitInit: true,
          xrFeatureStates: { handTracking: 'optional', layers: 'optional' },
        } satisfies PromptResult)
      : await promptFlow(nameArg);
    const assetsBase = assetsBaseFlag || DEFAULT_ASSETS_BASE;
    // Fetch Chef recipes index and the chosen recipe (no local fallback)
    const index = await fetchRecipesIndex(assetsBase);
    const found = index.find((r) => r.id === res.id);
    if (!found) {
      throw new Error(`Recipe id ${res.id} not found in index`);
    }
    const recipe = await fetchRecipeByFileName(found.recipe, assetsBase);

    // Override Chef variables from prompts
    // Ensure edits exists
    recipe.edits = recipe.edits || {};
    // Project name
    recipe.edits['@appName'] = res.name;
    // World features (stringified JS object-literal expected by recipes)
    const ff = res.featureFlags || {
      locomotionEnabled: res.mode === 'vr',
      locomotionUseWorker: true,
      grabbingEnabled: true,
      physicsEnabled: false,
      sceneUnderstandingEnabled: false,
    };
    const locomotionLiteral = ff.locomotionEnabled
      ? ff.locomotionUseWorker
        ? '{ useWorker: true }'
        : 'true'
      : 'false';
    const sceneUnderstandingLiteral =
      res.mode === 'ar' && ff.sceneUnderstandingEnabled ? 'true' : 'false';
    recipe.edits['@appFeaturesStr'] =
      `{ locomotion: ${locomotionLiteral}, grabbing: ${ff.grabbingEnabled ? 'true' : 'false'}, physics: ${ff.physicsEnabled ? 'true' : 'false'}, sceneUnderstanding: ${sceneUnderstandingLiteral} }`;
    // XR features (tri-state -> JS object literal)
    const toFlag = (s: TriState) =>
      s === 'required'
        ? '{ required: true }'
        : s === 'optional'
          ? 'true'
          : 'false';
    const entries: string[] = [];
    for (const [k, v] of Object.entries(res.xrFeatureStates || {})) {
      entries.push(`${k}: ${toFlag(v as TriState)}`);
    }
    const xrLiteral = `{ ${entries.join(', ')} }`;
    recipe.edits['@xrFeaturesStr'] = xrLiteral;
    const outDir = join(process.cwd(), res.name);

    await scaffoldProject(recipe, outDir);

    // 8) Git init
    if (res.gitInit) {
      try {
        const gitInit = spawn('git', ['init'], {
          cwd: outDir,
          stdio: 'ignore',
        });
        await new Promise<void>((resolve) =>
          gitInit.on('exit', () => resolve()),
        );
      } catch {}
    }

    if (res.installNow) {
      await installDependencies(outDir);
    }
    // Build prerequisites list (e.g., Meta Spatial Editor), including path-aware notes
    const prereqs = [...(res.prerequisites || [])];
    if (res.metaspatial) {
      const metaProjectPath = join(outDir, 'metaspatial');
      const metaMainPath = join(metaProjectPath, 'Main.metaspatial');
      prereqs.push({
        level: 'important',
        message:
          `Open the Meta Spatial Editor project.\n` +
          `Project Folder: ${metaProjectPath}\n` +
          `Open in Meta Spatial Editor: ${metaMainPath}`,
      });
    }
    // Print prerequisites first, then next steps
    printPrerequisites(prereqs);
    printNextSteps(res.name, res.installNow, res.actionItems || []);
  } catch (err: any) {
    console.error(chalk.red(err?.message || String(err)));
    process.exit(1);
  }
}

void main();
