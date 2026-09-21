#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPANION_DIRECTORIES = [
  'iwsdk-replit-template',
  'iwsdk-v0-template',
  'spatial-shopping',
  'webxr-first-steps',
];
const IGNORE_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml']);
const UNSCOPED_IWSDK_PACKAGE = ['iw', 'sdk'].join('');
const DLX_COMMANDS = new Set(['dlx']);
const BUN_X_COMMANDS = new Set(['x']);
const NPM_EXEC_COMMANDS = new Set(['exec', 'x']);
const NPM_INSTALL_COMMANDS = new Set([
  'add',
  'i',
  'in',
  'ins',
  'inst',
  'insta',
  'instal',
  'install',
  'isnt',
  'isnta',
  'isntal',
  'isntall',
]);
const PNPM_INSTALL_COMMANDS = new Set(['add', 'i', 'install']);
const YARN_ADD_COMMANDS = new Set(['add']);
const BUN_INSTALL_COMMANDS = new Set(['add', 'i', 'install']);
const SHELL_COMMAND_PATTERN =
  /(^|[\s`"'=:,;(\[>{|&])((?:"[^"\r\n]*(?:npx|npm|pnpm|pnpx|yarn|bunx?|corepack)(?:\.(?:cmd|exe|ps1))?"|'[^'\r\n]*(?:npx|npm|pnpm|pnpx|yarn|bunx?|corepack)(?:\.(?:cmd|exe|ps1))?'|[^\s"'`;&|()<>]*(?:npx|npm|pnpm|pnpx|yarn|bunx?|corepack)(?:\.(?:cmd|exe|ps1))?)\s+[^`;&|]*)/giu;
const PROGRAMMATIC_PATTERN =
  /\b(?:spawn(?:Sync)?|execFile(?:Sync)?|execa(?:Sync)?|runCommand)\(\s*(["'\x60])([^"'\x60]+)\1\s*,\s*\[([^\]]*)\]/gu;
const OPTIONS_WITH_VALUES = new Set([
  '--allow-build',
  '--cache',
  '--cache-folder',
  '--config',
  '--cwd',
  '--dir',
  '-C',
  '--call',
  '-c',
  '--fetch-retries',
  '--fetch-retry-factor',
  '--fetch-retry-maxtimeout',
  '--fetch-retry-mintimeout',
  '--fetch-timeout',
  '--filter',
  '-F',
  '--https-proxy',
  '--location',
  '--loglevel',
  '--node-options',
  '--otp',
  '--package',
  '--prefix',
  '--proxy',
  '--registry',
  '--reporter',
  '--script-shell',
  '--tag',
  '--use-yarnrc',
  '--user-agent',
  '--userconfig',
  '--workspace',
]);
const OPTIONS_WITHOUT_VALUES = new Set([
  '--bun',
  '--global',
  '-g',
  '--if-present',
  '--workspace-root',
  '--no-install',
  '--offline',
  '--prefer-latest',
  '--prefer-offline',
  '--quiet',
  '-q',
  '--recursive',
  '-r',
  '--silent',
  '-s',
  '--yes',
  '-y',
]);

function normalizeToken(token) {
  const normalized = token.replace(/^[`'"([{]+/u, '');
  if (normalized === '.' || normalized === '..') return normalized;
  return normalized.replace(/[`'"),;.?!:\]}]+$/u, '');
}

function shellTokens(command) {
  return [...command.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/gu)]
    .map((match) => normalizeToken(match[0]))
    .filter(Boolean);
}

function packageSpecMatches(token, packageName) {
  const normalized = normalizeToken(token).toLowerCase();
  const aliasIndex = normalized.indexOf('@npm:');
  const target =
    aliasIndex >= 0
      ? normalized.slice(aliasIndex + '@npm:'.length)
      : normalized.startsWith('npm:')
        ? normalized.slice('npm:'.length)
        : normalized;
  return target === packageName || target.startsWith(`${packageName}@`);
}

function executableName(token) {
  return normalizeToken(token)
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    ?.replace(/\.(?:cmd|exe|ps1)$/iu, '')
    .toLowerCase();
}

function optionParts(token) {
  const equalsIndex = token.indexOf('=');
  return equalsIndex < 0
    ? [token, undefined]
    : [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
}

function packageOption(token, nextToken, directRunner) {
  const [name, inlineValue] = optionParts(token);
  if (name === '--package' || (directRunner && name === '-p')) {
    return {
      value: inlineValue ?? nextToken,
      consumesNext: inlineValue == null,
    };
  }
  if (directRunner && token.startsWith('-p') && token.length > 2) {
    return {
      value: token.slice(token[2] === '=' ? 3 : 2),
      consumesNext: false,
    };
  }
  return undefined;
}

function explicitPackageSpecs(args, directRunner) {
  const specs = [];
  for (let index = 0; index < args.length; index++) {
    const token = normalizeToken(args[index]);
    const selection = packageOption(token, args[index + 1], directRunner);
    if (selection == null) continue;
    if (selection.value != null) {
      specs.push(normalizeToken(selection.value));
    }
    if (selection.consumesNext) index++;
  }
  return specs;
}

function selectedPackageSpecs(
  args,
  directRunner,
  initialExplicitPackages = [],
) {
  const explicitPackages = [...initialExplicitPackages];
  let firstPositional;
  let ambiguousOption = false;
  let parsingOptions = true;

  for (let index = 0; index < args.length; index++) {
    const token = normalizeToken(args[index]);
    if (parsingOptions && token === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions) {
      const selection = packageOption(token, args[index + 1], directRunner);
      if (selection != null) {
        if (selection.value != null) {
          explicitPackages.push(normalizeToken(selection.value));
        }
        if (selection.consumesNext) index++;
        continue;
      }
      if (token.startsWith('-')) {
        const [name, inlineValue] = optionParts(token);
        if (inlineValue == null && OPTIONS_WITH_VALUES.has(name)) {
          index++;
        } else if (
          inlineValue == null &&
          /^(?:true|false)$/iu.test(normalizeToken(args[index + 1] ?? ''))
        ) {
          index++;
        } else if (inlineValue == null) {
          // Unknown options may consume the next token. Fall back to scanning
          // every token so a new npm flag cannot hide a protected package.
          ambiguousOption = true;
        }
        continue;
      }
    }

    firstPositional ??= token;
    // Direct package runners pass every token after the command to that command.
    if (directRunner || !parsingOptions) break;
  }

  if (explicitPackages.length > 0) return explicitPackages;
  if (ambiguousOption) return args;
  return firstPositional == null ? [] : [firstPositional];
}

function npmExecArgs(args) {
  return packageCommandArgs(args, NPM_EXEC_COMMANDS);
}

function packageCommandArgs(args, commands) {
  let ambiguousOption = false;
  for (let index = 0; index < args.length; index++) {
    const token = normalizeToken(args[index]);
    if (token === '--') {
      const command = normalizeToken(args[index + 1] ?? '').toLowerCase();
      return commands.has(command)
        ? { args: args.slice(index + 2), prefixArgs: args.slice(0, index) }
        : undefined;
    }
    if (token.startsWith('-')) {
      const [name, inlineValue] = optionParts(token);
      if (inlineValue == null && OPTIONS_WITH_VALUES.has(name)) {
        index++;
      } else if (
        inlineValue == null &&
        /^(?:true|false)$/iu.test(normalizeToken(args[index + 1] ?? ''))
      ) {
        index++;
      } else if (inlineValue == null && OPTIONS_WITHOUT_VALUES.has(name)) {
        continue;
      } else if (inlineValue == null) {
        // Unknown global options may consume a value. Continue searching so
        // they cannot hide a later download subcommand.
        ambiguousOption = true;
      }
      continue;
    }

    const command = token.toLowerCase();
    if (commands.has(command)) {
      return { args: args.slice(index + 1), prefixArgs: args.slice(0, index) };
    }
    if (!ambiguousOption) return undefined;
  }
  return undefined;
}

function installPackageSpecs(args) {
  const packages = [];
  let parsingOptions = true;
  for (let index = 0; index < args.length; index++) {
    const token = normalizeToken(args[index]);
    if (parsingOptions && token === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && token.startsWith('-')) {
      const [name, inlineValue] = optionParts(token);
      if (inlineValue == null && OPTIONS_WITH_VALUES.has(name)) index++;
      continue;
    }
    packages.push(token);
  }
  return packages;
}

function corepackManagerName(token) {
  const normalized = normalizeToken(token).toLowerCase();
  for (const manager of ['npm', 'npx', 'pnpm', 'pnpx', 'yarn']) {
    if (normalized === manager || normalized.startsWith(manager + '@')) {
      return manager;
    }
  }
  return undefined;
}

function unsafePackageLabel(spec) {
  if (packageSpecMatches(spec, UNSCOPED_IWSDK_PACKAGE)) {
    return 'unscoped IWSDK package';
  }
  return undefined;
}

function classifyInvocation(executable, args, offset, text) {
  const name = executableName(executable);
  if (name === 'corepack') {
    const manager = corepackManagerName(args[0] ?? '');
    return manager == null
      ? []
      : classifyInvocation(manager, args.slice(1), offset, text);
  }
  let execArgs;
  let installArgs;
  let initialExplicitPackages = [];
  let directRunner = false;
  if (name === 'npx' || name === 'pnpx' || name === 'bunx') {
    execArgs = args;
    directRunner = true;
  } else if (name === 'npm') {
    const execCommand = npmExecArgs(args);
    if (execCommand != null) {
      execArgs = execCommand.args;
      initialExplicitPackages = explicitPackageSpecs(
        execCommand.prefixArgs,
        false,
      );
    } else {
      installArgs = packageCommandArgs(args, NPM_INSTALL_COMMANDS)?.args;
    }
  } else if (name === 'pnpm' || name === 'yarn') {
    const execCommand = packageCommandArgs(args, DLX_COMMANDS);
    if (execCommand != null) {
      execArgs = execCommand.args;
    } else {
      installArgs = packageCommandArgs(
        args,
        name === 'pnpm' ? PNPM_INSTALL_COMMANDS : YARN_ADD_COMMANDS,
      )?.args;
    }
    directRunner = true;
  } else if (name === 'bun') {
    const execCommand = packageCommandArgs(args, BUN_X_COMMANDS);
    if (execCommand != null) {
      execArgs = execCommand.args;
    } else {
      installArgs = packageCommandArgs(args, BUN_INSTALL_COMMANDS)?.args;
    }
    directRunner = true;
  }

  const specs =
    installArgs == null
      ? execArgs == null
        ? []
        : selectedPackageSpecs(execArgs, directRunner, initialExplicitPackages)
      : installPackageSpecs(installArgs);
  return specs.flatMap((spec) => {
    const label = unsafePackageLabel(spec);
    return label == null ? [] : [{ label, offset, text: text.trim() }];
  });
}

export function findUnsafeCliInvocations(text) {
  const findings = [];
  const shellText = text.replace(/(?:\\|\^|(?<=\s)`)\r?\n[ \t]*/gu, (match) =>
    ' '.repeat(match.length),
  );
  let lineOffset = 0;
  for (const line of shellText.split('\n')) {
    if (/(?:npx|npm|pnpm|pnpx|yarn|bunx?|corepack)/iu.test(line)) {
      SHELL_COMMAND_PATTERN.lastIndex = 0;
      for (const match of line.matchAll(SHELL_COMMAND_PATTERN)) {
        const prefixLength = match[1]?.length ?? 0;
        const tokens = shellTokens(match[2]);
        const executable = tokens.shift();
        findings.push(
          ...classifyInvocation(
            executable,
            tokens,
            lineOffset + (match.index ?? 0) + prefixLength,
            match[2],
          ),
        );
      }
    }
    lineOffset += line.length + 1;
  }

  for (const match of text.matchAll(PROGRAMMATIC_PATTERN)) {
    const args = [];
    for (const argument of match[3].matchAll(/(["'\x60])([^"'\x60]*)\1/gu)) {
      args.push(argument[2]);
    }
    findings.push(
      ...classifyInvocation(
        match[2],
        args,
        match.index ?? 0,
        `${match[2]} ${args.join(' ')}`,
      ),
    );
  }

  return findings;
}

function lineNumberFor(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (text[index] === '\n') line++;
  }
  return line;
}

function listTrackedTextFiles(root = ROOT) {
  const gitRootResult = spawnSync(
    'git',
    ['-C', root, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' },
  );
  if (gitRootResult.status !== 0) {
    throw new Error(gitRootResult.stderr || 'Unable to locate the git root');
  }
  const gitRoot = gitRootResult.stdout.trim();
  const relativeRoot = path.relative(gitRoot, root) || '.';
  const filesResult = spawnSync(
    'git',
    ['-C', gitRoot, 'grep', '-Ilz', '-e', '', '--', relativeRoot],
    { encoding: 'utf8' },
  );
  if (filesResult.status !== 0 && filesResult.status !== 1) {
    throw new Error(filesResult.stderr || 'Unable to list tracked text files');
  }

  return filesResult.stdout
    .split('\0')
    .filter(Boolean)
    .filter((file) => !IGNORE_FILES.has(path.basename(file)))
    .map((file) => path.join(gitRoot, file));
}

export function checkRepository(root = ROOT) {
  const violations = [];
  const files = listTrackedTextFiles(root);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const finding of findUnsafeCliInvocations(text)) {
      violations.push({
        file: path.relative(root, file),
        line: lineNumberFor(text, finding.offset),
        ...finding,
      });
    }
  }
  return { filesChecked: files.length, violations };
}

export function checkWorkspace(sdkRoot = ROOT) {
  // In the WebXR development-platform monorepo, companion templates and
  // showcases also ship this guidance. Include those directories when they
  // exist without coupling IWSDK release gates to unrelated sibling projects.
  const gitRootResult = spawnSync(
    'git',
    ['-C', sdkRoot, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' },
  );
  if (gitRootResult.status !== 0) {
    throw new Error(gitRootResult.stderr || 'Unable to locate the git root');
  }
  const gitRoot = gitRootResult.stdout.trim();
  const roots = [
    sdkRoot,
    ...COMPANION_DIRECTORIES.map((directory) => path.join(gitRoot, directory)),
  ].filter(
    (root, index, allRoots) =>
      existsSync(root) && allRoots.indexOf(root) === index,
  );
  const result = { filesChecked: 0, violations: [] };
  for (const root of roots) {
    const rootResult = checkRepository(root);
    const prefix = path.relative(gitRoot, root);
    result.filesChecked += rootResult.filesChecked;
    result.violations.push(
      ...rootResult.violations.map((violation) => ({
        ...violation,
        file:
          prefix === '' ? violation.file : path.join(prefix, violation.file),
      })),
    );
  }
  return result;
}

function main() {
  const result = checkWorkspace();
  if (result.violations.length > 0) {
    console.error('Found unsafe CLI package invocations:');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file}:${violation.line} (${violation.label}): ${violation.text}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `CLI command safety check passed: ${result.filesChecked} tracked text files scanned.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
