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
  EXPERIENCE_TARGETS,
  FEATURE_CATALOG,
  ScaffoldConfiguration,
  formatAppFeatures,
  formatWorldOptions,
  formatXRConfiguration,
  formatXRFeatures,
  getRecommendedConfiguration,
  getVariantId,
} from './catalog.js';
import {
  hasCliOption,
  validateFeatureOptionsForTarget,
} from './cli-options.js';
import {
  installDependencies,
  installDependenciesFromBundle,
  printNextSteps,
  printPrerequisites,
} from './installer.js';
import {
  isValidProjectTarget,
  resolveProjectTarget,
  targetHasContent,
} from './project-target.js';
import { promptFlow } from './prompts.js';
import { scaffoldProject } from './scaffold.js';
import { resolveSource, SDK_PACKAGES_DIR } from './source.js';
import {
  AiTool,
  ExperienceTarget,
  FeatureFlags,
  Language,
  PromptResult,
  XRMode,
} from './types.js';
import { VERSION, NODE_ENGINE } from './version.js';

type CliOptions = {
  yes?: boolean;
  canary?: string | boolean;
  force?: boolean;
  target?: ExperienceTarget;
  mode?: XRMode;
  language?: Language;
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

const VALID_AI_TOOLS: AiTool[] = ['claude', 'cursor', 'copilot', 'codex'];

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function resolveBooleanFlag(
  args: string[],
  enabledFlag: string,
  disabledFlag: string,
): boolean | undefined {
  const enabled = hasFlag(args, enabledFlag);
  const disabled = hasFlag(args, disabledFlag);
  if (enabled && disabled) {
    throw new Error(`Use either ${enabledFlag} or ${disabledFlag}, not both.`);
  }
  if (disabled) {
    return false;
  }
  if (enabled) {
    return true;
  }
  return undefined;
}

function resolveExplicitTarget(
  options: CliOptions,
  args: string[],
): ExperienceTarget | undefined {
  const target = options.target;
  const mode = options.mode;
  const xrFlag = hasFlag(args, '--xr');
  const noXrFlag = hasFlag(args, '--no-xr');

  if (target && target !== 'vr' && target !== 'ar' && target !== 'browser') {
    throw new Error(
      `Invalid --target "${target}". Must be "vr", "ar", or "browser".`,
    );
  }
  if (mode && mode !== 'vr' && mode !== 'ar') {
    throw new Error(`Invalid --mode "${mode}". Must be "vr" or "ar".`);
  }
  if (xrFlag && noXrFlag) {
    throw new Error('Use either --xr or --no-xr, not both.');
  }
  if (target === 'browser' && (mode || xrFlag)) {
    throw new Error('--target browser cannot be combined with --mode or --xr.');
  }
  if (target && target !== 'browser' && noXrFlag) {
    throw new Error(`--target ${target} cannot be combined with --no-xr.`);
  }
  if (target && mode && target !== mode) {
    throw new Error(`--target ${target} conflicts with --mode ${mode}.`);
  }
  if (mode && noXrFlag) {
    throw new Error('--mode cannot be combined with --no-xr.');
  }

  if (target) {
    return target;
  }
  if (noXrFlag) {
    return 'browser';
  }
  if (mode) {
    return mode;
  }
  if (xrFlag) {
    return 'vr';
  }
  return undefined;
}

function parseAiTools(raw: string | undefined): AiTool[] {
  if (!raw || raw.trim() === '' || raw.trim() === 'none') {
    return [];
  }
  const requested = raw
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
  if (requested.includes('none')) {
    throw new Error('--ai-tools none cannot be combined with other tools.');
  }
  const invalid = requested.filter(
    (tool) => !VALID_AI_TOOLS.includes(tool as AiTool),
  );
  if (invalid.length > 0) {
    throw new Error(`Unsupported AI tools: ${invalid.join(', ')}.`);
  }
  return Array.from(new Set(requested)) as AiTool[];
}

function isInsideGitWorkTree(directory: string): boolean {
  try {
    return (
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === 'true'
    );
  } catch {
    return false;
  }
}

function printConfigurationSummary(result: PromptResult): void {
  const config: ScaffoldConfiguration = {
    target: result.target,
    xrEnabled: result.xrEnabled,
    mode: result.mode,
    featureFlags: result.featureFlags,
    xrFeatureStates: result.xrFeatureStates,
  };
  const enabledFeatures = Object.entries(result.featureFlags)
    .filter(([key, enabled]) => key !== 'locomotionUseWorker' && enabled)
    .map(([key]) => FEATURE_CATALOG[key as keyof FeatureFlags].label);

  console.log(chalk.bold('\nProject configuration'));
  console.log(`  Starting point: ${EXPERIENCE_TARGETS[result.target].label}`);
  console.log(
    `  Language: ${result.language === 'ts' ? 'TypeScript' : 'JavaScript'}`,
  );
  console.log(
    `  SDK features: ${enabledFeatures.length > 0 ? enabledFeatures.join(', ') : 'none'}`,
  );
  console.log('  Generated World.create options:');
  for (const line of formatWorldOptions(config).split('\n')) {
    console.log(`    ${line}`);
  }
  console.log(
    chalk.dim(
      '  Change these later in src/index.ts; no re-scaffold is required.\n',
    ),
  );
}

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
    .argument('[name]', 'Project directory (use "." for the current directory)')
    .option(
      '--canary [url]',
      'Use canary SDK bundle (optionally from a custom URL)',
    )
    .option('-y, --yes', 'Use defaults and skip prompts')
    .option(
      '--force',
      'Overwrite conflicting generated files in a non-empty target directory',
    )
    .option('--target <target>', 'Starting point: vr, ar, or browser')
    .option('--mode <mode>', 'XR mode alias: vr or ar')
    .option('--language <lang>', 'Language: ts or js')
    .option('--xr', 'Use an XR starting point (VR unless --mode is provided)')
    .option('--no-xr', 'Use the desktop 3D starting point')
    .option('--install', 'Install dependencies after scaffolding')
    .option('--no-install', 'Skip dependency installation')
    .option('--git', 'Initialize git repository')
    .option('--no-git', 'Skip git initialization')
    .option('--locomotion', 'Enable locomotion feature')
    .option('--no-locomotion', 'Disable locomotion feature')
    .option('--grabbing', 'Enable grabbing feature')
    .option('--no-grabbing', 'Disable grabbing feature')
    .option('--physics', 'Enable physics feature')
    .option('--no-physics', 'Disable physics feature')
    .option('--scene-understanding', 'Enable scene understanding (AR mode)')
    .option('--no-scene-understanding', 'Disable scene understanding')
    .option('--environment-raycast', 'Enable environment raycast (AR mode)')
    .option('--no-environment-raycast', 'Disable environment raycast')
    .option(
      '--ai-tools <tools>',
      'AI tools to configure (comma-separated: claude,cursor,copilot,codex; or "none")',
    )
    .action((n: string | undefined, opts: CliOptions) => {
      nameArg = n;
      cliOpts = opts;
    });
  program.parse(process.argv);

  try {
    // Collapse the target selector and legacy XR flags into one starting point.
    const explicitTarget = resolveExplicitTarget(
      cliOpts,
      process.argv.slice(2),
    );
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
    const hasExplicitFlags = explicitFlags.some((flag) =>
      hasCliOption(process.argv, flag),
    );
    if (hasExplicitFlags && !cliOpts.yes) {
      console.warn(
        chalk.yellow(
          'Warning: advanced CLI flags (--language, --physics, etc.) only take effect with -y/--yes.\n' +
            'Add -y to use non-interactive mode, or remove flags for interactive prompts.',
        ),
      );
    }

    // Build PromptResult from CLI flags or interactive prompts
    let res: PromptResult;
    if (cliOpts.yes) {
      const target = explicitTarget ?? 'vr';
      validateFeatureOptionsForTarget(target, process.argv);
      const language = cliOpts.language ?? 'ts';
      const overrides: Partial<FeatureFlags> = {};
      const locomotion = resolveBooleanFlag(
        process.argv,
        '--locomotion',
        '--no-locomotion',
      );
      const grabbing = resolveBooleanFlag(
        process.argv,
        '--grabbing',
        '--no-grabbing',
      );
      const physics = resolveBooleanFlag(
        process.argv,
        '--physics',
        '--no-physics',
      );
      const sceneUnderstanding = resolveBooleanFlag(
        process.argv,
        '--scene-understanding',
        '--no-scene-understanding',
      );
      const environmentRaycast = resolveBooleanFlag(
        process.argv,
        '--environment-raycast',
        '--no-environment-raycast',
      );
      if (locomotion !== undefined) {
        overrides.locomotionEnabled = locomotion;
      }
      if (grabbing !== undefined) {
        overrides.grabbingEnabled = grabbing;
      }
      if (physics !== undefined) {
        overrides.physicsEnabled = physics;
      }
      if (sceneUnderstanding !== undefined) {
        overrides.sceneUnderstandingEnabled = sceneUnderstanding;
      }
      if (environmentRaycast !== undefined) {
        overrides.environmentRaycastEnabled = environmentRaycast;
      }
      const configuration = getRecommendedConfiguration(target, overrides);

      res = {
        name: nameArg || 'iwsdk-app',
        id: getVariantId(target, language),
        installNow:
          resolveBooleanFlag(process.argv, '--install', '--no-install') ?? true,
        target,
        xrEnabled: configuration.xrEnabled,
        mode: configuration.mode,
        language,
        features: [],
        featureFlags: configuration.featureFlags,
        gitInit: resolveBooleanFlag(process.argv, '--git', '--no-git') ?? true,
        aiTools: parseAiTools(cliOpts.aiTools),
        xrFeatureStates: configuration.xrFeatureStates,
      };
    } else {
      res = await promptFlow(nameArg, { target: explicitTarget });
    }

    // Validate the requested directory (both interactive and non-interactive paths).
    if (!isValidProjectTarget(res.name)) {
      throw new Error(
        `Invalid project name "${res.name}". ` +
          'Use "." for the current directory, or use only letters, numbers, hyphens, underscores, dots, and @.',
      );
    }

    const projectTarget = resolveProjectTarget(res.name, process.cwd());
    const hasTargetContent = targetHasContent(projectTarget);
    if (hasTargetContent && !cliOpts.force) {
      throw new Error(
        `${projectTarget.inPlace ? 'Current directory' : `Directory "${projectTarget.displayPath}"`} is not empty. ` +
          'Re-run with --force to overwrite conflicting generated files; unrelated files will be preserved.',
      );
    }
    if (hasTargetContent) {
      console.warn(
        chalk.yellow(
          `Warning: --force will overwrite conflicting generated files in ${projectTarget.displayPath}; unrelated files will be preserved.`,
        ),
      );
    }
    res.name = projectTarget.appName;

    printConfigurationSummary(res);

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
      const configuration: ScaffoldConfiguration = {
        target: res.target,
        xrEnabled: res.xrEnabled,
        mode: res.mode,
        featureFlags: res.featureFlags,
        xrFeatureStates: res.xrFeatureStates,
      };
      resolvedRecipe.edits['@appFeaturesStr'] = formatAppFeatures(
        configuration.featureFlags,
      );
      resolvedRecipe.edits['@xrFeaturesStr'] = formatXRFeatures(
        configuration.xrFeatureStates,
      );
      resolvedRecipe.edits['@xrConfigStr'] =
        formatXRConfiguration(configuration);

      const outDir = projectTarget.outDir;

      // Load AI tool configuration recipes based on user selection
      const aiRecipes: Recipe[] = [];
      const loadAiRecipe = async (fileName: string, label: string) => {
        try {
          const recipe = await source.fetchRecipe(fileName);
          aiRecipes.push(source.resolveRecipeUrls(recipe));
        } catch (error) {
          console.warn(
            chalk.yellow(
              `Could not configure ${label}: ${error instanceof Error ? error.message : String(error)}. ` +
                'Project creation will continue without it. Re-run this create command in a new directory to retry, or add the missing configuration manually.',
            ),
          );
        }
      };

      if (res.aiTools.includes('codex')) {
        // AGENTS.md recipe — Codex reads AGENTS.md natively; other tools have
        // their own config files with equivalent content.
        await loadAiRecipe('base-agents-config.recipe.json', 'Codex guidance');
      }

      // Claude Code recipe (conditional)
      if (res.aiTools.includes('claude')) {
        await loadAiRecipe('base-claude-config.recipe.json', 'Claude Code');
      }

      // Cursor recipe (conditional)
      if (res.aiTools.includes('cursor')) {
        await loadAiRecipe('base-cursor-config.recipe.json', 'Cursor');
      }

      // Copilot recipe (conditional)
      if (res.aiTools.includes('copilot')) {
        await loadAiRecipe('base-copilot-config.recipe.json', 'GitHub Copilot');
      }

      // Codex recipe (conditional)
      if (res.aiTools.includes('codex')) {
        await loadAiRecipe('base-codex-config.recipe.json', 'Codex adapter');
      }

      const recipes: Recipe[] = [resolvedRecipe, ...aiRecipes];
      await scaffoldProject(recipes, outDir, { force: cliOpts.force });

      // Git init
      if (
        res.gitInit &&
        !(projectTarget.inPlace && isInsideGitWorkTree(outDir))
      ) {
        try {
          const gitInit = spawn('git', ['init'], {
            cwd: outDir,
            stdio: 'ignore',
          });
          await new Promise<void>((resolve) => {
            gitInit.once('error', () => resolve());
            gitInit.once('exit', () => resolve());
          });
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
        } catch (error) {
          console.warn(
            chalk.yellow(
              `Project created, but coding-tool adapter sync failed: ${error instanceof Error ? error.message : String(error)}. ` +
                `Run "npx iwsdk adapter sync --tools ${res.aiTools.join(',')}" from the project directory.`,
            ),
          );
        }
      }

      const prereqs = [...(res.prerequisites || [])];
      // Print prerequisites first, then next steps
      printPrerequisites(prereqs);
      printNextSteps(
        projectTarget.displayPath,
        res.installNow,
        res.actionItems || [],
        projectTarget.inPlace,
      );
    } finally {
      await source.cleanup();
    }
  } catch (err: any) {
    console.error(chalk.red(err?.message || String(err)));
    process.exit(1);
  }
}

void main();
