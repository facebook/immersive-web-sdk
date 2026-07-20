#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Recipe } from '@pmndrs/chef';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import semver from 'semver';
import {
  installDependencies,
  installDependenciesFromBundle,
  printNextSteps,
  printPrerequisites,
} from './installer.js';
import { promptFlow } from './prompts.js';
import { scaffoldProject } from './scaffold.js';
import { resolveSource, SDK_PACKAGES_DIR } from './source.js';
import { PromptResult, TriState, VariantId, AiTool } from './types.js';
import { VERSION, NODE_ENGINE } from './version.js';

type CliOptions = {
  yes?: boolean;
  canary?: string | boolean;
  mode?: 'vr' | 'ar';
  language?: 'ts' | 'js';
  xr?: boolean;
  install?: boolean;
  git?: boolean;
  locomotion?: boolean;
  grabbing?: boolean;
  physics?: boolean;
  sceneUnderstanding?: boolean;
  environmentRaycast?: boolean;
  aiTools?: string;
};

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
  let cliOpts: CliOptions = {};

  program
    .name('Create IWSDK')
    .description('Official CLI for creating Immersive Web SDK projects')
    .version(version)
    .argument('[name]', 'Project name')
    .option(
      '--canary [url]',
      'Use canary SDK bundle (optionally from a custom URL)',
    )
    .option('-y, --yes', 'Use defaults and skip prompts')
    .option('--mode <mode>', 'Experience mode: vr or ar', 'vr')
    .option('--language <lang>', 'Language: ts or js', 'ts')
    .option('--xr', 'Enable XR support', true)
    .option('--no-xr', 'Disable XR support for a browser-only 3D project')
    .option('--install', 'Install dependencies after scaffolding', true)
    .option('--no-install', 'Skip dependency installation')
    .option('--git', 'Initialize git repository', true)
    .option('--no-git', 'Skip git initialization')
    .option('--locomotion', 'Enable locomotion feature', true)
    .option('--no-locomotion', 'Disable locomotion feature')
    .option('--grabbing', 'Enable grabbing feature', true)
    .option('--no-grabbing', 'Disable grabbing feature')
    .option('--physics', 'Enable physics feature', false)
    .option('--no-physics', 'Disable physics feature (default)')
    .option(
      '--scene-understanding',
      'Enable scene understanding (AR mode)',
      true,
    )
    .option('--no-scene-understanding', 'Disable scene understanding')
    .option(
      '--environment-raycast',
      'Enable environment raycast (AR mode)',
      true,
    )
    .option('--no-environment-raycast', 'Disable environment raycast')
    .option(
      '--ai-tools <tools>',
      'AI tools to configure (comma-separated: claude,cursor,copilot,codex; or "none")',
      'claude,cursor,copilot,codex',
    )
    .action((n: string | undefined, opts: CliOptions) => {
      nameArg = n;
      cliOpts = opts;
    });
  program.parse(process.argv);

  try {
    // Validate flag values
    if (
      cliOpts.mode !== undefined &&
      cliOpts.mode !== 'vr' &&
      cliOpts.mode !== 'ar'
    ) {
      console.error(
        chalk.red(`Invalid --mode "${cliOpts.mode}". Must be "vr" or "ar".`),
      );
      process.exit(1);
    }
    if (
      cliOpts.language !== undefined &&
      cliOpts.language !== 'ts' &&
      cliOpts.language !== 'js'
    ) {
      console.error(
        chalk.red(
          `Invalid --language "${cliOpts.language}". Must be "ts" or "js".`,
        ),
      );
      process.exit(1);
    }
    if (typeof cliOpts.canary === 'string') {
      const isUrl =
        cliOpts.canary.startsWith('http://') ||
        cliOpts.canary.startsWith('https://');
      if (!isUrl) {
        console.error(
          chalk.red(
            `--canary URL must be an HTTP or HTTPS URL. Got: "${cliOpts.canary}".`,
          ),
        );
        process.exit(1);
      }
    }

    // Warn if flags are provided without --yes (they only take effect in non-interactive mode)
    const explicitFlags = [
      '--mode',
      '--language',
      '--install',
      '--no-install',
      '--git',
      '--no-git',
      '--locomotion',
      '--no-locomotion',
      '--grabbing',
      '--no-grabbing',
      '--physics',
      '--no-physics',
      '--scene-understanding',
      '--no-scene-understanding',
      '--environment-raycast',
      '--no-environment-raycast',
      '--ai-tools',
    ];
    const hasExplicitFlags = process.argv.some((arg) =>
      explicitFlags.includes(arg),
    );
    if (hasExplicitFlags && !cliOpts.yes) {
      console.warn(
        chalk.yellow(
          'Warning: CLI flags (--mode, --language, etc.) only take effect with -y/--yes.\n' +
            'Add -y to use non-interactive mode, or remove flags for interactive prompts.',
        ),
      );
    }

    // Build PromptResult from CLI flags or interactive prompts
    let res: PromptResult;
    if (cliOpts.yes) {
      const mode = (cliOpts.mode || 'vr') as 'vr' | 'ar';
      const language = (cliOpts.language || 'ts') as 'ts' | 'js';
      const xrEnabled = cliOpts.xr ?? true;
      const variantId = `${mode}-manual-${language}` as VariantId;

      const validAiTools = ['claude', 'cursor', 'copilot', 'codex'] as const;
      const rawAiTools = (cliOpts.aiTools || 'claude,cursor,copilot,codex')
        .split(',')
        .map((t) => t.trim());
      const aiTools = rawAiTools.includes('none')
        ? []
        : rawAiTools.filter((t): t is AiTool =>
            validAiTools.includes(t as AiTool),
          );

      const locomotionEnabled =
        xrEnabled && mode === 'vr' ? (cliOpts.locomotion ?? true) : false;

      res = {
        name: nameArg || 'iwsdk-app',
        id: variantId,
        installNow: cliOpts.install ?? true,
        xrEnabled,
        mode,
        language,
        features: [],
        featureFlags: {
          locomotionEnabled,
          locomotionUseWorker: locomotionEnabled ? true : undefined,
          grabbingEnabled: xrEnabled ? (cliOpts.grabbing ?? true) : false,
          physicsEnabled: cliOpts.physics ?? false,
          sceneUnderstandingEnabled:
            xrEnabled && mode === 'ar'
              ? (cliOpts.sceneUnderstanding ?? true)
              : false,
          environmentRaycastEnabled:
            xrEnabled && mode === 'ar'
              ? (cliOpts.environmentRaycast ?? true)
              : false,
        },
        gitInit: cliOpts.git ?? true,
        aiTools,
        xrFeatureStates: !xrEnabled
          ? {}
          : mode === 'ar'
            ? {
                handTracking: 'optional',
                anchors: 'optional',
                hitTest: 'optional',
                planeDetection: 'optional',
                meshDetection: 'optional',
                layers: 'optional',
              }
            : { handTracking: 'optional', layers: 'optional' },
      };
    } else {
      const xrFlagProvided =
        process.argv.includes('--xr') || process.argv.includes('--no-xr');
      res = await promptFlow(
        nameArg,
        xrFlagProvided ? { xrEnabled: cliOpts.xr ?? true } : {},
      );
    }

    // Validate project name (both interactive and non-interactive paths)
    if (!/^[a-zA-Z0-9._@-]+$/.test(res.name)) {
      throw new Error(
        `Invalid project name "${res.name}". ` +
          'Use only letters, numbers, hyphens, underscores, dots, and @.',
      );
    }

    const source = resolveSource(cliOpts.canary);

    // Prepare source (downloads tgz files for remote bundles)
    if (source.isBundleMode) {
      const prepSpinner = ora({
        text: 'Preparing SDK bundle ...',
        stream: process.stderr,
        discardStdin: false,
        hideCursor: false,
        isEnabled: process.stderr.isTTY,
      }).start();
      try {
        await source.prepare();
        prepSpinner.stopAndPersist({
          symbol: chalk.green('✔'),
          text: 'SDK bundle ready',
        });
      } catch (e) {
        prepSpinner.stopAndPersist({
          symbol: chalk.red('✖'),
          text: 'Bundle preparation failed',
        });
        throw e;
      }
    }

    try {
      // Fetch Chef recipes index and the chosen recipe
      const index = await source.fetchIndex();
      const found = index.find((r) => r.id === res.id);
      if (!found) {
        throw new Error(`Recipe id ${res.id} not found in index`);
      }
      const recipe = await source.fetchRecipe(found.recipe);

      // Resolve relative asset URLs in the recipe
      const resolvedRecipe = source.resolveRecipeUrls(recipe);

      // Override Chef variables from prompts
      // Ensure edits exists
      resolvedRecipe.edits = resolvedRecipe.edits || {};
      // Project name
      resolvedRecipe.edits['@appName'] = res.name;
      // World features (stringified JS object-literal expected by recipes)
      const ff = res.featureFlags || {
        locomotionEnabled: res.xrEnabled && res.mode === 'vr',
        locomotionUseWorker: true,
        grabbingEnabled: res.xrEnabled,
        physicsEnabled: false,
        sceneUnderstandingEnabled: false,
        environmentRaycastEnabled: false,
      };
      const locomotionLiteral = ff.locomotionEnabled
        ? ff.locomotionUseWorker
          ? '{ useWorker: true }'
          : 'true'
        : 'false';
      const sceneUnderstandingLiteral =
        res.xrEnabled && res.mode === 'ar' && ff.sceneUnderstandingEnabled
          ? 'true'
          : 'false';
      const environmentRaycastLiteral =
        res.xrEnabled && res.mode === 'ar' && ff.environmentRaycastEnabled
          ? 'true'
          : 'false';
      resolvedRecipe.edits['@appFeaturesStr'] =
        `{ locomotion: ${locomotionLiteral}, grabbing: ${ff.grabbingEnabled ? 'true' : 'false'}, physics: ${ff.physicsEnabled ? 'true' : 'false'}, sceneUnderstanding: ${sceneUnderstandingLiteral}, environmentRaycast: ${environmentRaycastLiteral} }`;
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
      resolvedRecipe.edits['@xrFeaturesStr'] = xrLiteral;
      resolvedRecipe.edits['@xrConfigStr'] = res.xrEnabled
        ? `{ sessionMode: SessionMode.Immersive${res.mode === 'ar' ? 'AR' : 'VR'}, offer: 'always', features: ${xrLiteral} }`
        : 'false';

      const outDir = join(process.cwd(), res.name);

      // Check if target directory already exists and is non-empty
      if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
        throw new Error(
          `Directory "${res.name}" already exists and is not empty. ` +
            'Please choose a different name or remove the existing directory.',
        );
      }

      // Load AI tool configuration recipes based on user selection
      const aiRecipes: Recipe[] = [];

      if (res.aiTools.includes('codex')) {
        // AGENTS.md recipe — Codex reads AGENTS.md natively; other tools have
        // their own config files with equivalent content.
        try {
          const rawAgentsRecipe = await source.fetchRecipe(
            'base-agents-config.recipe.json',
          );
          aiRecipes.push(source.resolveRecipeUrls(rawAgentsRecipe));
        } catch {
          // Not yet published — skip silently
        }
      }

      // Claude Code recipe (conditional)
      if (res.aiTools.includes('claude')) {
        try {
          const rawClaudeRecipe = await source.fetchRecipe(
            'base-claude-config.recipe.json',
          );
          aiRecipes.push(source.resolveRecipeUrls(rawClaudeRecipe));
        } catch {
          // Not yet published — skip silently
        }
      }

      // Cursor recipe (conditional)
      if (res.aiTools.includes('cursor')) {
        try {
          const rawCursorRecipe = await source.fetchRecipe(
            'base-cursor-config.recipe.json',
          );
          aiRecipes.push(source.resolveRecipeUrls(rawCursorRecipe));
        } catch {
          // Not yet published — skip silently
        }
      }

      // Copilot recipe (conditional)
      if (res.aiTools.includes('copilot')) {
        try {
          const rawCopilotRecipe = await source.fetchRecipe(
            'base-copilot-config.recipe.json',
          );
          aiRecipes.push(source.resolveRecipeUrls(rawCopilotRecipe));
        } catch {
          // Not yet published — skip silently
        }
      }

      // Codex recipe (conditional)
      if (res.aiTools.includes('codex')) {
        try {
          const rawCodexRecipe = await source.fetchRecipe(
            'base-codex-config.recipe.json',
          );
          aiRecipes.push(source.resolveRecipeUrls(rawCodexRecipe));
        } catch {
          // Not yet published — skip silently
        }
      }

      const recipes: Recipe[] = [resolvedRecipe, ...aiRecipes];
      await scaffoldProject(recipes, outDir);

      // Git init
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

      // Download SDK packages into .sdk-packages/ (must happen before install)
      if (source.isBundleMode) {
        const dlSpinner = ora({
          text: 'Downloading SDK packages ...',
          stream: process.stderr,
          discardStdin: false,
          hideCursor: false,
          isEnabled: process.stderr.isTTY,
        }).start();
        try {
          await source.downloadPackages(join(outDir, SDK_PACKAGES_DIR));

          dlSpinner.stopAndPersist({
            symbol: chalk.green('✔'),
            text: 'SDK packages downloaded',
          });
        } catch (e) {
          dlSpinner.stopAndPersist({
            symbol: chalk.red('✖'),
            text: 'SDK package download failed',
          });
          throw e;
        }
      }

      // Install dependencies
      if (res.installNow) {
        if (source.isBundleMode) {
          await installDependenciesFromBundle(outDir, source);
        } else {
          await installDependencies(outDir);
        }
      }

      // Write MCP adapter configs for the selected AI tools
      if (res.installNow && res.aiTools.length > 0) {
        try {
          execFileSync(
            process.execPath,
            [
              join(outDir, 'node_modules/@iwsdk/cli/dist/cli.js'),
              'adapter',
              'sync',
              '--tools',
              res.aiTools.join(','),
            ],
            { cwd: outDir, stdio: 'ignore', timeout: 15000 },
          );
        } catch {
          // Non-fatal: adapter sync failure shouldn't block project creation
        }
      }

      const prereqs = [...(res.prerequisites || [])];
      // Print prerequisites first, then next steps
      printPrerequisites(prereqs);
      printNextSteps(res.name, res.installNow, res.actionItems || []);
    } finally {
      await source.cleanup();
    }
  } catch (err: any) {
    console.error(chalk.red(err?.message || String(err)));
    process.exit(1);
  }
}

void main();
