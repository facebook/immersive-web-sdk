/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSceneDocument } from '@iwsdk/scene-composition';
import { describe, expect, it } from 'vitest';
import { getRecommendedConfiguration } from '../src/catalog.js';
import { buildStarterProjectFiles } from '../src/project-files.js';

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const TEMPLATE_ROOT = path.join(PACKAGE_ROOT, 'dist', 'template');
const npmSource = { getPackageInstallSpec: () => undefined };

describe('common starter project files', () => {
  it('uses byte-identical TypeScript application source for every target', async () => {
    const outputs = await Promise.all(
      (['vr', 'ar', 'browser'] as const).map((target) =>
        buildStarterProjectFiles({
          appName: 'starter-app',
          configuration: getRecommendedConfiguration(target),
          language: 'ts',
          packageSource: npmSource,
          templateRoot: TEMPLATE_ROOT,
        }),
      ),
    );
    const expectedSourcePaths = [
      'src/AGENTS.md',
      'src/assets.ts',
      'src/components.ts',
      'src/index.ts',
      'src/panel.ts',
      'src/robot-component.ts',
      'src/robot.ts',
      'src/vite-env.d.ts',
    ];
    for (const files of outputs) {
      expect(
        files
          .map((file) => file.path)
          .filter((filePath) => filePath.startsWith('src/')),
      ).toEqual(expectedSourcePaths);
    }
    const commonPaths = [
      ...expectedSourcePaths,
      'vite.config.ts',
      'public/ui/welcome.uikitml',
    ];
    for (const filePath of commonPaths) {
      const [first, ...rest] = outputs.map((files) =>
        textFile(files, filePath),
      );
      expect(rest).toEqual([first, first]);
      expect(first).not.toMatch(/@template:|@chef:|@session-mode/u);
    }

    expect(outputs[0].some((file) => file.path.includes('mouselook'))).toBe(
      false,
    );

    expect(textFile(outputs[0], 'iwsdk.config.json')).toContain('"mode": "vr"');
    expect(textFile(outputs[1], 'iwsdk.config.json')).toContain('"mode": "ar"');
    expect(textFile(outputs[2], 'iwsdk.config.json')).toContain('"xr": false');
    expect(
      JSON.parse(textFile(outputs[0], 'iwsdk.config.json')).world.features
        .spatialUI,
    ).toEqual({ kit: 'horizon' });
    expect(textFile(outputs[0], 'vite.config.ts')).toContain('iwsdkDev()');
    expect(textFile(outputs[0], 'src/assets.ts')).toContain(
      'VITE_IWSDK_EXAMPLE_ASSET_BASE_URL',
    );
    expect(textFile(outputs[0], 'src/assets.ts')).toContain(
      'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets',
    );
    expect(textFile(outputs[0], 'src/assets.ts')).toContain(
      'import.meta.env.BASE_URL',
    );
    expect(textFile(outputs[0], 'src/assets.ts')).not.toContain(
      "url: '/iwsdk-assets/",
    );
  });

  it('demonstrates the bundled Horizon kit, Lucide icons, and a remote font', async () => {
    const files = await buildStarterProjectFiles({
      appName: 'uikit-app',
      configuration: getRecommendedConfiguration('vr'),
      language: 'ts',
      packageSource: npmSource,
      templateRoot: TEMPLATE_ROOT,
    });
    const panel = textFile(files, 'public/ui/welcome.uikitml');

    expect(panel).toContain('@font-face');
    expect(panel).toContain('font-family: "DM Sans"');
    expect(panel).toContain('https://fonts.gstatic.com/s/dmsans/');
    expect(panel).toContain('<Panel class="panel-root">');
    expect(panel).toContain('<Button id="xr-button"');
    expect(panel).toContain('<RectangleGoggles>');
    expect(panel).toContain('<LogIn>');
  });

  it('uses build-time mechanical JavaScript output with no TypeScript files', async () => {
    const files = await buildStarterProjectFiles({
      appName: 'starter-js',
      configuration: getRecommendedConfiguration('vr'),
      language: 'js',
      packageSource: npmSource,
      templateRoot: TEMPLATE_ROOT,
    });

    expect(files.some((file) => file.path.endsWith('.ts'))).toBe(false);
    expect(textFile(files, 'src/index.js')).not.toContain('as HTMLDivElement');
    expect(textFile(files, 'index.html')).toContain('/src/index.js');
    expect(files.some((file) => file.path === 'tsconfig.json')).toBe(false);
  });

  it('generates package metadata and package-safe dotfiles locally', async () => {
    const files = await buildStarterProjectFiles({
      appName: 'thin-app',
      configuration: getRecommendedConfiguration('browser'),
      language: 'ts',
      packageSource: npmSource,
      templateRoot: TEMPLATE_ROOT,
    });
    const packageJson = JSON.parse(textFile(files, 'package.json'));

    expect(files.some((file) => file.path === '.gitignore')).toBe(true);
    expect(files.some((file) => file.path === '.nvmrc')).toBe(true);
    expect(packageJson.dependencies['@iwsdk/core']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(
      packageJson.devDependencies['@iwsdk/example-assets'],
    ).toBeUndefined();
    expect(packageJson.devDependencies['@meta-quest/metavr']).toBe('^1.3.2');
    expect(packageJson.devDependencies['@meta-quest/hzdb']).toBeUndefined();
    expect(packageJson.devDependencies['@types/three']).toBe('^0.181.0');
    expect(packageJson.overrides).toEqual({ sharp: '0.35.3' });
    expect(packageJson.scripts.typecheck).toBe('tsc --noEmit');
    expect(JSON.stringify(packageJson)).not.toContain('@latest');
    expect(JSON.stringify(packageJson)).not.toContain('@pmndrs/chef');
  });

  it.each(['vr', 'ar', 'browser'] as const)(
    'emits a structurally valid %s scene whose assets exist in the common catalog',
    async (target) => {
      const files = await buildStarterProjectFiles({
        appName: 'scene-app',
        configuration: getRecommendedConfiguration(target),
        language: 'ts',
        packageSource: npmSource,
        templateRoot: TEMPLATE_ROOT,
      });
      const scene = JSON.parse(
        textFile(files, 'public/scenes/main.iwsdk.scene.json'),
      );

      expect(scene.player).toBeUndefined();

      expect(
        validateSceneDocument(scene, {
          knownAssetIds: [
            'environment-desk',
            'plant-sansevieria',
            'robot',
            'welcome-panel',
            'webxr-banner',
          ],
          validateAuthoringWorkflow: false,
        }),
      ).toEqual({ valid: true, issues: [] });
      expect(
        scene.nodes.find((node: { id?: string }) => node.id === 'webxr-banner'),
      ).toMatchObject({
        content: { asset: 'webxr-banner', type: 'asset' },
        transform: { position: [0, 1, 1.8], rotationDeg: [0, 180, 0] },
      });
    },
  );

  it('keeps static starter composition out of the application entry point', async () => {
    const files = await buildStarterProjectFiles({
      appName: 'scene-owned-composition',
      configuration: getRecommendedConfiguration('vr'),
      language: 'ts',
      packageSource: npmSource,
      templateRoot: TEMPLATE_ROOT,
    });
    const index = textFile(files, 'src/index.ts');

    expect(index).not.toContain('createTransformEntity');
    expect(index).not.toContain('PlaneGeometry');
    expect(textFile(files, 'src/assets.ts')).toContain("'webxr-banner'");
  });

  it('always adapts canonical guidance to every supported coding harness', async () => {
    const files = await buildStarterProjectFiles({
      appName: 'all-harness-app',
      configuration: getRecommendedConfiguration('vr'),
      language: 'ts',
      packageSource: npmSource,
      templateRoot: TEMPLATE_ROOT,
    });
    const paths = files.map((file) => file.path);

    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('CLAUDE.md');
    expect(paths).toContain('.claude/settings.json');
    expect(paths).toContain('.claude/skills/iwsdk-debug/SKILL.md');
    expect(paths).toContain('.agents/skills/iwsdk-debug/SKILL.md');
    expect(paths).toContain('.agents/skills/iwsdk-planner/SKILL.md');
    expect(paths).toContain('.codex/config.toml');
    expect(paths).toContain('.cursor/rules/scene-json.mdc');
    expect(paths).toContain('.github/instructions/scene-json.instructions.md');
    expect(paths).toContain('src/AGENTS.md');
    expect(paths).toContain('public/scenes/AGENTS.md');
    expect(paths).toContain('public/ui/AGENTS.md');
    expect(paths).not.toContain('.agents/skills/iwsdk-migrate-0-5/SKILL.md');
    expect(
      files.filter((file) => file.path === '.agents/skills/iwsdk-ui/SKILL.md'),
    ).toHaveLength(1);
    expect(textFile(files, 'AGENTS.md')).toContain('# IWSDK');
    expect(textFile(files, 'CLAUDE.md')).toContain('# IWSDK project');
    expect(files.some((file) => file.path.startsWith('.claude/rules/'))).toBe(
      true,
    );
    expect(
      files.some((file) => file.path === '.claude/skills/iwsdk-debug/SKILL.md'),
    ).toBe(true);
    expect(files.some((file) => file.path.startsWith('.agents/skills/'))).toBe(
      true,
    );
    expect(files.some((file) => file.path.includes('iwsdk-migrate-0-5'))).toBe(
      false,
    );
  });
});

function textFile(
  files: Awaited<ReturnType<typeof buildStarterProjectFiles>>,
  filePath: string,
): string {
  const file = files.find((candidate) => candidate.path === filePath);
  if (file == null) {
    throw new Error(`Missing generated file ${filePath}`);
  }
  return typeof file.contents === 'string'
    ? file.contents
    : Buffer.from(file.contents).toString('utf8');
}
