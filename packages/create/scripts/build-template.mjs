/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const templateRoot = path.join(packageRoot, 'template');
const outputRoot = path.join(packageRoot, 'dist', 'template');
const guidanceOutputRoot = path.join(packageRoot, 'dist', 'guidance');

await rm(outputRoot, { recursive: true, force: true });
await rm(guidanceOutputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(path.join(templateRoot, 'common'), path.join(outputRoot, 'common'), {
  recursive: true,
});
await cp(path.join(templateRoot, 'scenes'), path.join(outputRoot, 'scenes'), {
  recursive: true,
});
await cp(path.join(packageRoot, 'guidance'), guidanceOutputRoot, {
  recursive: true,
});
await mkdir(path.join(guidanceOutputRoot, 'common'), { recursive: true });
await cp(
  path.join(packageRoot, '..', 'cli', 'guidance', 'AGENTS.md'),
  path.join(guidanceOutputRoot, 'common', 'AGENTS.md'),
);
const canonicalSkillRoot = path.join(
  guidanceOutputRoot,
  'claude',
  '.claude',
  'skills',
);
const portableSkillRoot = path.join(
  guidanceOutputRoot,
  'agents',
  '.agents',
  'skills',
);
await mkdir(path.dirname(portableSkillRoot), { recursive: true });
await cp(canonicalSkillRoot, portableSkillRoot, { recursive: true });

const canonicalRules = await readClaudeRules(
  path.join(guidanceOutputRoot, 'claude', '.claude', 'rules'),
);
await emitCursorRules(canonicalRules);
await emitCopilotInstructions(canonicalRules);
await emitScopedAgentInstructions(canonicalRules);
await emitJavaScriptTemplate(
  path.join(templateRoot, 'common'),
  path.join(outputRoot, 'common-js'),
);

async function readClaudeRules(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const source = await readFile(path.join(root, entry.name), 'utf8');
        const match = source.match(
          /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u,
        );
        if (match == null) {
          throw new Error(`Claude rule ${entry.name} is missing frontmatter`);
        }
        const paths = [];
        let readingPaths = false;
        for (const line of match[1].split(/\r?\n/u)) {
          if (/^paths:\s*$/u.test(line)) {
            readingPaths = true;
            continue;
          }
          const pathMatch = readingPaths
            ? line.match(/^\s*-\s*["']?(.+?)["']?\s*$/u)
            : null;
          if (pathMatch != null) {
            paths.push(pathMatch[1]);
            continue;
          }
          if (line.trim().length > 0) {
            readingPaths = false;
          }
        }
        if (paths.length === 0) {
          throw new Error(`Claude rule ${entry.name} has no paths`);
        }
        const body = match[2].trim();
        const title = body.match(/^#\s+(.+)$/mu)?.[1] ?? entry.name;
        return {
          body,
          name: entry.name.slice(0, -3),
          paths,
          title,
        };
      }),
  );
}

async function emitCursorRules(rules) {
  for (const rule of rules) {
    await writeGuidanceFile(
      path.join(
        guidanceOutputRoot,
        'cursor',
        '.cursor',
        'rules',
        `${rule.name}.mdc`,
      ),
      `---\ndescription: ${JSON.stringify(rule.title)}\nglobs:\n${rule.paths
        .map((glob) => `  - ${JSON.stringify(glob)}`)
        .join(
          '\n',
        )}\nalwaysApply: false\n---\n\n${portableRuleBody(rule.body)}\n`,
    );
  }
}

async function emitCopilotInstructions(rules) {
  for (const rule of rules) {
    await writeGuidanceFile(
      path.join(
        guidanceOutputRoot,
        'copilot',
        '.github',
        'instructions',
        `${rule.name}.instructions.md`,
      ),
      `---\napplyTo: ${JSON.stringify(rule.paths.join(','))}\n---\n\n${portableRuleBody(rule.body)}\n`,
    );
  }
}

async function emitScopedAgentInstructions(rules) {
  const byName = new Map(rules.map((rule) => [rule.name, rule]));
  const targets = [
    ['public/scenes/AGENTS.md', ['scene-json']],
    ['public/ui/AGENTS.md', ['uikitml']],
    ['src/AGENTS.md', ['ecs-api', 'assets-and-manifest']],
  ];
  for (const [relativePath, ruleNames] of targets) {
    const bodies = ruleNames.map((name) => {
      const rule = byName.get(name);
      if (rule == null) {
        throw new Error(`Missing canonical Claude rule ${name}`);
      }
      return portableRuleBody(rule.body);
    });
    await writeGuidanceFile(
      path.join(guidanceOutputRoot, 'scoped-agents', relativePath),
      `# IWSDK scoped project guidance\n\nThis file augments the repository-root \`AGENTS.md\` for files in this directory.\n\n${bodies.join('\n\n')}\n`,
    );
  }
}

function portableRuleBody(body) {
  return body.replaceAll('.claude/skills/', '.agents/skills/');
}

async function writeGuidanceFile(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

async function emitJavaScriptTemplate(
  sourceRoot,
  destinationRoot,
  relative = '',
) {
  const sourceDirectory = path.join(sourceRoot, relative);
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      await emitJavaScriptTemplate(sourceRoot, destinationRoot, childRelative);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Template entry is not a regular file: ${childRelative}`);
    }
    if (entry.name === 'tsconfig.json' || entry.name.endsWith('.d.ts')) {
      continue;
    }
    const sourcePath = path.join(sourceRoot, childRelative);
    const isTypeScript = entry.name.endsWith('.ts');
    const outputRelative = isTypeScript
      ? childRelative.slice(0, -3) + '.js'
      : childRelative;
    const outputPath = path.join(destinationRoot, outputRelative);
    await mkdir(path.dirname(outputPath), { recursive: true });
    if (isTypeScript) {
      const source = await readFile(sourcePath, 'utf8');
      const result = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2021,
          importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        },
        fileName: childRelative,
        reportDiagnostics: true,
      });
      const errors = (result.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );
      if (errors.length > 0) {
        throw new Error(
          `Failed to transpile starter template ${childRelative}: ${errors
            .map((diagnostic) =>
              ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            )
            .join('; ')}`,
        );
      }
      await writeFile(outputPath, result.outputText, 'utf8');
      continue;
    }
    if (entry.name === 'index.html') {
      const source = await readFile(sourcePath, 'utf8');
      await writeFile(
        outputPath,
        source.replace('/src/index.ts', '/src/index.js'),
        'utf8',
      );
      continue;
    }
    await cp(sourcePath, outputPath);
  }
}
