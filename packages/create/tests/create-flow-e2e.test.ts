/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'fs/promises';
import { createServer, type Server } from 'http';
import { createRequire } from 'module';
import { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { iwsdkDev } from '../../vite-plugin-dev/src/index.js';
import {
  formatAppFeatures,
  formatXRConfiguration,
  getRecommendedConfiguration,
} from '../src/catalog.js';

type Middleware = (
  request: Readable & {
    headers?: Record<string, string | string[] | number | undefined>;
    method?: string;
    url?: string;
  },
  response: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    end(body?: string): void;
    setHeader(name: string, value: string): void;
  },
  next: () => void,
) => void;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREATE_CLI = path.join(REPO_ROOT, 'packages', 'create', 'dist', 'cli.js');
const STARTER_DIST = path.join(REPO_ROOT, 'packages', 'starter-assets', 'dist');
const CREATE_E2E_EVIDENCE_DIR =
  process.env.IWSDK_CREATE_E2E_EVIDENCE_DIR == null
    ? undefined
    : path.resolve(REPO_ROOT, process.env.IWSDK_CREATE_E2E_EVIDENCE_DIR);
const requireFromVitePluginDev = createRequire(
  path.join(REPO_ROOT, 'packages', 'vite-plugin-dev', 'package.json'),
);
const { chromium } = requireFromVitePluginDev('playwright');
const LEGACY_EDITOR_TOKEN = ['meta', 'spatial'].join('');
const LEGACY_EDITOR_LABEL = ['Meta', 'Spatial'].join(' ');
const LEGACY_FLAGS = [
  `--${LEGACY_EDITOR_TOKEN}`,
  `--no-${LEGACY_EDITOR_TOKEN}`,
] as const;
const LEGACY_GENERATE_EXPORT = ['generate', 'GLXF'].join('');
const LEGACY_DISCOVER_EXPORT = ['discover', 'Components'].join('');
const LEGACY_EDITOR_CLI_ENV = ['META', 'SPATIAL', 'EDITOR', 'CLI', 'PATH'].join(
  '_',
);
const TEST_MANAGED_WORKSPACE_TOKEN = 'create-flow-managed-workspace-token';
const MANAGED_WORKSPACE_HEADERS = {
  'x-iwsdk-managed-workspace': TEST_MANAGED_WORKSPACE_TOKEN,
};
const BUNDLE_PACKAGE_PATHS: Record<string, string> = {
  '@iwsdk/cli': 'packages/cli/iwsdk-cli.tgz',
  '@iwsdk/core': 'packages/core/iwsdk-core.tgz',
  '@iwsdk/example-assets': 'packages/example-assets/iwsdk-example-assets.tgz',
  '@iwsdk/glxf': 'packages/glxf/iwsdk-glxf.tgz',
  '@iwsdk/locomotor': 'packages/locomotor/iwsdk-locomotor.tgz',
  '@iwsdk/reference': 'packages/reference/iwsdk-reference.tgz',
  '@iwsdk/scene-composition':
    'packages/scene-composition/iwsdk-scene-composition.tgz',
  '@iwsdk/vite-plugin-dev':
    'packages/vite-plugin-dev/iwsdk-vite-plugin-dev.tgz',
  '@iwsdk/vite-plugin-uikitml':
    'packages/vite-plugin-uikitml/iwsdk-vite-plugin-uikitml.tgz',
  '@iwsdk/xr-input': 'packages/xr-input/iwsdk-xr-input.tgz',
};
const maybeInstallE2ETest =
  process.env.IWSDK_CREATE_INSTALL_E2E === '1' ? test : test.skip;
const EXPERIENCE_TARGETS = ['browser', 'vr', 'ar'] as const;
type ExperienceTarget = (typeof EXPERIENCE_TARGETS)[number];

const tempDirs: string[] = [];
let browser:
  | { close(): Promise<void>; newPage(options?: unknown): Promise<any> }
  | undefined;
let previousManagedWorkspaceToken: string | undefined;

beforeAll(async () => {
  previousManagedWorkspaceToken =
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  await stat(CREATE_CLI);
  await stat(path.join(STARTER_DIST, 'recipes', 'index.json'));
});

afterAll(() => {
  if (previousManagedWorkspaceToken == null) {
    delete process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  } else {
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN =
      previousManagedWorkspaceToken;
  }
});

afterEach(async () => {
  await browser?.close();
  browser = undefined;
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
}, 60000);

describe('create-iwsdk scene flow E2E', () => {
  test('scaffolds in place when the current directory is empty', async () => {
    const workspace = await makeTempDir();
    const bundleServer = await startBundleServer();

    try {
      const result = await runCreate(
        [
          '.',
          '-y',
          '--target',
          'browser',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode, result.stderr + result.stdout).toBe(0);
      const packageJson = JSON.parse(
        await readFile(path.join(workspace, 'package.json'), 'utf8'),
      );
      expect(packageJson.name).toBe(path.basename(workspace).toLowerCase());
      expect(result.stdout).not.toContain('cd .');
      await stat(path.join(workspace, 'src', 'index.ts'));
    } finally {
      await bundleServer.close();
    }
  });

  test('requires --force before scaffolding into a non-empty directory', async () => {
    const workspace = await makeTempDir();
    const sentinelPath = path.join(workspace, 'cloud-harness.txt');
    await writeFile(sentinelPath, 'preserve me', 'utf8');

    const result = await runCreate(
      ['.', '-y', '--target', 'browser', '--no-install', '--no-git'],
      workspace,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toContain(
      'Current directory is not empty',
    );
    expect(result.stderr + result.stdout).toContain('--force');
    expect(await readFile(sentinelPath, 'utf8')).toBe('preserve me');
    await expect(
      stat(path.join(workspace, 'package.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('rechecks an unforced target immediately before writing', async () => {
    const workspace = await makeTempDir();
    const readmePath = path.join(workspace, 'README.md');
    let injectedContent = false;
    const bundleServer = await startBundleServer({
      onRequest: async (relativePath) => {
        if (relativePath === 'bundle.json' && !injectedContent) {
          injectedContent = true;
          await writeFile(readmePath, 'arrived during fetch', 'utf8');
        }
      },
    });

    try {
      const result = await runCreate(
        [
          '.',
          '-y',
          '--target',
          'browser',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain(
        'Target directory is not empty',
      );
      expect(result.stderr + result.stdout).toContain('--force');
      expect(await readFile(readmePath, 'utf8')).toBe('arrived during fetch');
      await expect(
        stat(path.join(workspace, 'package.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await bundleServer.close();
    }
  });

  test('rejects generated-path symlinks without writing outside the target', async () => {
    const workspace = await makeTempDir();
    const externalDirectory = await makeTempDir();
    const externalSource = path.join(externalDirectory, 'index.ts');
    await writeFile(externalSource, 'preserve me', 'utf8');
    await symlink(externalDirectory, path.join(workspace, 'src'), 'dir');
    const bundleServer = await startBundleServer();

    try {
      const result = await runCreate(
        [
          '.',
          '-y',
          '--force',
          '--target',
          'browser',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain(
        'Refusing to scaffold through symbolic link "src"',
      );
      expect(await readFile(externalSource, 'utf8')).toBe('preserve me');
      await expect(
        stat(path.join(workspace, 'package.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await bundleServer.close();
    }
  });

  test('preflights every generated path before a forced overlay', async () => {
    const workspace = await makeTempDir();
    const readmePath = path.join(workspace, 'README.md');
    const sourcePath = path.join(workspace, 'src');
    await writeFile(readmePath, 'preserve me', 'utf8');
    await writeFile(sourcePath, 'not a directory', 'utf8');
    const bundleServer = await startBundleServer();

    try {
      const result = await runCreate(
        [
          '.',
          '-y',
          '--force',
          '--target',
          'browser',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain(
        '"src" is not a directory',
      );
      expect(await readFile(readmePath, 'utf8')).toBe('preserve me');
      expect(await readFile(sourcePath, 'utf8')).toBe('not a directory');
      await expect(
        stat(path.join(workspace, 'package.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await bundleServer.close();
    }
  });

  test('force-overlays generated files while preserving an existing repository', async () => {
    const repository = await makeTempDir();
    const workspace = path.join(repository, 'existing-app');
    await mkdir(workspace);
    const bundleServer = await startBundleServer();
    const gitInit = await runCommand('git', ['init'], repository);
    expect(gitInit.exitCode, gitInit.stderr + gitInit.stdout).toBe(0);
    const sentinelPath = path.join(workspace, 'cloud-harness.txt');
    await writeFile(sentinelPath, 'preserve me', 'utf8');
    await writeFile(path.join(workspace, 'README.md'), 'replace me', 'utf8');

    try {
      const result = await runCreate(
        [
          '.',
          '-y',
          '--force',
          '--target',
          'browser',
          '--no-install',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode, result.stderr + result.stdout).toBe(0);
      expect(result.stderr + result.stdout).toContain(
        '--force will overwrite conflicting generated files',
      );
      expect(await readFile(sentinelPath, 'utf8')).toBe('preserve me');
      expect(
        await readFile(path.join(workspace, 'README.md'), 'utf8'),
      ).not.toBe('replace me');
      await stat(path.join(repository, '.git', 'HEAD'));
      await expect(stat(path.join(workspace, '.git'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await stat(path.join(workspace, 'package.json'));
    } finally {
      await bundleServer.close();
    }
  });

  test('scaffolds every supported starter with scene JSON and editor-readable scenes', async () => {
    const workspace = await makeTempDir();
    const bundleServer = await startBundleServer();

    try {
      for (const target of EXPERIENCE_TARGETS) {
        for (const language of ['ts', 'js'] as const) {
          const appName = `app-${target}-${language}`;
          const result = await runCreate(
            [
              appName,
              '-y',
              '--target',
              target,
              '--language',
              language,
              '--no-install',
              '--no-git',
              '--ai-tools',
              'none',
              '--canary',
              bundleServer.origin,
            ],
            workspace,
          );

          expect(result.exitCode, result.stderr + result.stdout).toBe(0);

          const appRoot = path.join(workspace, appName);
          const packageJson = JSON.parse(
            await readFile(path.join(appRoot, 'package.json'), 'utf8'),
          );
          const sceneFile = path.join(
            appRoot,
            'public',
            'scenes',
            `${target}.iwsdk.scene.json`,
          );
          const scene = JSON.parse(await readFile(sceneFile, 'utf8'));
          const generatedScenes = (
            await readdir(path.join(appRoot, 'public', 'scenes'))
          ).filter((file) => file.endsWith('.iwsdk.scene.json'));
          const viteConfig = await readFile(
            path.join(
              appRoot,
              `vite.config.${language === 'ts' ? 'ts' : 'js'}`,
            ),
            'utf8',
          );
          const source = await readFile(
            path.join(appRoot, 'src', `index.${language}`),
            'utf8',
          );

          expect(packageJson.devDependencies).toHaveProperty(
            '@iwsdk/vite-plugin-dev',
          );
          expect(JSON.stringify(packageJson)).not.toMatch(
            new RegExp(LEGACY_EDITOR_TOKEN, 'i'),
          );
          expect(scene).toMatchObject({
            units: 'meters',
            version: 'iwsdk.scene.v1',
          });
          expect(generatedScenes).toEqual([`${target}.iwsdk.scene.json`]);
          expect(source).toContain(`./scenes/${target}.iwsdk.scene.json`);
          if (target === 'browser') {
            expect(viteConfig).toContain('workspace: { enabled: true }');
          } else {
            expect(viteConfig).toContain('ai: {}');
            expect(viteConfig).not.toContain("mode: 'agent'");
          }
          assertGeneratedSettings(source, viteConfig, result.stdout, target);
          if (target === 'browser') {
            expect(scene).toMatchObject({ nodes: [], resources: {} });
            for (const demoPath of [
              path.join('src', `mouselook.${language}`),
              path.join('src', `robot.${language}`),
              path.join('src', `panel.${language}`),
              path.join('ui', 'welcome.uikitml'),
              path.join('public', 'audio'),
              path.join('public', 'textures'),
            ]) {
              await expect(
                stat(path.join(appRoot, demoPath)),
              ).rejects.toMatchObject({ code: 'ENOENT' });
            }
          }
          expect(viteConfig).toContain('iwsdkDev');
          expect(viteConfig).not.toMatch(
            new RegExp(
              `${LEGACY_GENERATE_EXPORT}|${LEGACY_DISCOVER_EXPORT}`,
              'i',
            ),
          );
          await expect(
            stat(path.join(appRoot, LEGACY_EDITOR_TOKEN)),
          ).rejects.toMatchObject({ code: 'ENOENT' });

          const editorMiddleware = createEditorMiddleware(appRoot);
          const documentResponse = await runMiddleware(
            editorMiddleware,
            'GET',
            `/__iwsdk/editor/document?scene=public/scenes/${target}.iwsdk.scene.json`,
            '',
            MANAGED_WORKSPACE_HEADERS,
          );
          expect(documentResponse.statusCode).toBe(200);
          expect(JSON.parse(documentResponse.body)).toMatchObject({
            units: 'meters',
            version: 'iwsdk.scene.v1',
          });

          const editorShell = await runMiddleware(
            editorMiddleware,
            'GET',
            `/__iwsdk/workspace?scene=public/scenes/${target}.iwsdk.scene.json`,
            '',
            MANAGED_WORKSPACE_HEADERS,
          );
          expect(editorShell.statusCode).toBe(200);
          expect(editorShell.body).toContain('IWSDK Scene Editor');
          expect(editorShell.body).toContain(
            'documentUrl: "/__iwsdk/editor/document"',
          );
          expect(editorShell.body).not.toContain(
            `scene=public/scenes/${target}.iwsdk.scene.json`,
          );
        }
      }
    } finally {
      await bundleServer.close();
    }
  }, 30000);

  test('does not advertise or accept legacy editor flags', async () => {
    const workspace = await makeTempDir();
    const help = await runCreate(['--help'], workspace);

    expect(help.exitCode).toBe(0);
    expect(help.stdout).toMatch(
      /Project directory \(use "\." for the current\s+directory\)/,
    );
    expect(help.stdout).toContain('--force');
    expect(help.stdout).toContain('Use the desktop 3D starting point');
    expect(help.stdout).not.toMatch(
      new RegExp(
        `${LEGACY_EDITOR_LABEL}|${LEGACY_FLAGS.map(escapeRegex).join('|')}`,
        'i',
      ),
    );

    for (const flag of LEGACY_FLAGS) {
      const legacy = await runCreate(
        [`legacy-app-${flag.replace(/^--/, '')}`, '-y', '--no-install', flag],
        workspace,
      );

      expect(legacy.exitCode).not.toBe(0);
      expect(legacy.stderr + legacy.stdout).toMatch(
        new RegExp(`unknown option.*${LEGACY_EDITOR_TOKEN}`, 'i'),
      );
      expect(legacy.stderr + legacy.stdout).not.toMatch(
        /Preparing SDK bundle/i,
      );
    }
  });

  test('applies noninteractive browser feature flags deterministically', async () => {
    const workspace = await makeTempDir();
    const bundleServer = await startBundleServer();

    try {
      const appName = 'browser-overrides-app';
      const result = await runCreate(
        [
          appName,
          '-y',
          '--target',
          'browser',
          '--language',
          'ts',
          '--no-locomotion',
          '--no-grabbing',
          '--physics',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'none',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );

      expect(result.exitCode, result.stderr + result.stdout).toBe(0);
      const source = await readFile(
        path.join(workspace, appName, 'src', 'index.ts'),
        'utf8',
      );
      const configuration = getRecommendedConfiguration('browser', {
        locomotionEnabled: false,
        grabbingEnabled: false,
        physicsEnabled: true,
      });
      const expectedFeatures = formatAppFeatures(configuration.featureFlags);
      const expectedXR = formatXRConfiguration(configuration);

      expect(normalizeWhitespace(source)).toContain(
        normalizeWhitespace(`features: ${expectedFeatures}`),
      );
      expect(normalizeWhitespace(source)).toContain(
        normalizeWhitespace(`xr: ${expectedXR}`),
      );
      expect(normalizeWhitespace(result.stdout)).toContain(
        normalizeWhitespace(`features: ${expectedFeatures}`),
      );
    } finally {
      await bundleServer.close();
    }
  });

  test('rejects feature flags that do not apply to the selected target', async () => {
    const workspace = await makeTempDir();
    const cases = [
      { option: '--locomotion', target: 'ar' },
      { option: '--scene-understanding', target: 'vr' },
      { option: '--environment-raycast', target: 'browser' },
    ] as const;

    for (const { option, target } of cases) {
      const result = await runCreate(
        [
          `incompatible-${target}-app`,
          '-y',
          '--target',
          target,
          option,
          '--no-install',
        ],
        workspace,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr + result.stdout).toContain(
        `${option} is not available for --target ${target}`,
      );
      expect(result.stderr + result.stdout).not.toMatch(
        /Preparing SDK bundle/i,
      );
    }
  });

  test('reports accurate recovery when an AI guidance recipe is unavailable', async () => {
    const workspace = await makeTempDir();
    const bundleServer = await startBundleServer({
      missingPaths: ['recipes/base-agents-config.recipe.json'],
    });

    try {
      const appName = 'missing-ai-guidance-app';
      const result = await runCreate(
        [
          appName,
          '-y',
          '--target',
          'vr',
          '--no-install',
          '--no-git',
          '--ai-tools',
          'codex',
          '--canary',
          bundleServer.origin,
        ],
        workspace,
      );
      const output = result.stderr + result.stdout;

      expect(result.exitCode, output).toBe(0);
      expect(output).toContain('Could not configure Codex guidance');
      expect(output).toContain(
        'Re-run this create command in a new directory to retry',
      );
      expect(output).not.toContain('iwsdk adapter sync');
      await stat(path.join(workspace, appName, 'package.json'));
    } finally {
      await bundleServer.close();
    }
  });

  maybeInstallE2ETest(
    'installs, builds, and serves every generated starter with the native editor route',
    async () => {
      const workspace = await makeTempDir();
      const bundleServer = await startBundleServer({
        packages: BUNDLE_PACKAGE_PATHS,
      });

      try {
        await assertBundleTarballsExist();
        for (const target of EXPERIENCE_TARGETS) {
          for (const language of ['ts', 'js'] as const) {
            const appName = `installed-${target}-${language}-app`;
            const result = await runCreate(
              [
                appName,
                '-y',
                '--target',
                target,
                '--language',
                language,
                '--no-git',
                '--ai-tools',
                'none',
                '--canary',
                bundleServer.origin,
              ],
              workspace,
              { timeoutMs: 240000 },
            );
            expect(result.exitCode, result.stderr + result.stdout).toBe(0);

            const appRoot = path.join(workspace, appName);
            const packageJson = JSON.parse(
              await readFile(path.join(appRoot, 'package.json'), 'utf8'),
            );
            expect(packageJson.dependencies['@iwsdk/core']).toMatch(
              /^file:\.sdk-packages\/core\/iwsdk-core\.tgz$/,
            );
            expect(
              packageJson.devDependencies['@iwsdk/vite-plugin-dev'],
            ).toMatch(
              /^file:\.sdk-packages\/vite-plugin-dev\/iwsdk-vite-plugin-dev\.tgz$/,
            );
            expect(packageJson.overrides).toMatchObject({
              '@iwsdk/scene-composition':
                'file:.sdk-packages/scene-composition/iwsdk-scene-composition.tgz',
            });
            await stat(path.join(appRoot, 'node_modules'));

            if (language === 'ts') {
              const typecheck = await runCommand(
                'npx',
                ['tsc', '--noEmit'],
                appRoot,
                { timeoutMs: 180000 },
              );
              expect(
                typecheck.exitCode,
                typecheck.stderr + typecheck.stdout,
              ).toBe(0);
            }

            const build = await runCommand('npm', ['run', 'build'], appRoot, {
              timeoutMs: 180000,
            });
            expect(build.exitCode, build.stderr + build.stdout).toBe(0);
            await stat(path.join(appRoot, 'dist', 'index.html'));

            const port = await getFreePort();
            const devServer = startLongRunningCommand(
              'npm',
              [
                'run',
                'dev:runtime',
                '--',
                '--host',
                '127.0.0.1',
                '--port',
                String(port),
                '--strictPort',
              ],
              appRoot,
            );

            try {
              const baseUrl = `http://127.0.0.1:${port}`;
              const appPage = await waitForHttpOk(`${baseUrl}/`, devServer);
              expect(await appPage.text()).toContain('scene-container');

              const scenePath = `public/scenes/${target}.iwsdk.scene.json`;
              const editorPage = await waitForHttpOk(
                `${baseUrl}/__iwsdk/editor?scene=${scenePath}`,
                devServer,
                45000,
                MANAGED_WORKSPACE_HEADERS,
              );
              expect(await editorPage.text()).toContain('IWSDK Scene Editor');

              const documentResponse = await waitForHttpOk(
                `${baseUrl}/__iwsdk/editor/document?scene=${scenePath}`,
                devServer,
                45000,
                MANAGED_WORKSPACE_HEADERS,
              );
              expect(await documentResponse.json()).toMatchObject({
                units: 'meters',
                version: 'iwsdk.scene.v1',
              });

              const runtimeSession = await waitForManagedBrowserLaunch(
                appRoot,
                devServer,
              );
              if (target === 'browser') {
                expect(runtimeSession.aiMode).toBeUndefined();
                expect(runtimeSession.browser).toMatchObject({
                  commandReady: false,
                  connected: true,
                  status: 'connected',
                });
                if (language === 'ts') {
                  const workspaceStatus = await runCommand(
                    'npx',
                    ['iwsdk', 'dev', 'status'],
                    appRoot,
                    { timeoutMs: 60000 },
                  );
                  expect(
                    workspaceStatus.exitCode,
                    workspaceStatus.stderr + workspaceStatus.stdout,
                  ).toBe(0);
                  expect(JSON.parse(workspaceStatus.stdout)).toMatchObject({
                    data: {
                      state: {
                        session: {
                          browser: {
                            connected: true,
                            status: 'connected',
                          },
                        },
                      },
                    },
                  });
                }
              } else {
                expect(runtimeSession.aiMode).toBe('collaborate');
              }

              if (language === 'ts') {
                await smokeGeneratedAppEditorFlow({
                  appRoot,
                  baseUrl,
                  language,
                  target,
                  scenePath,
                });
              }
            } finally {
              await devServer.close();
            }
          }
        }
      } finally {
        await bundleServer.close();
      }
    },
    900000,
  );
});

async function smokeGeneratedAppEditorFlow({
  appRoot,
  baseUrl,
  language,
  target,
  scenePath,
}: {
  appRoot: string;
  baseUrl: string;
  language: 'js' | 'ts';
  target: ExperienceTarget;
  scenePath: string;
}) {
  const scenePublicUrl = scenePath.replace(/^public\//, '');
  browser ??= await launchChromium();
  const originalScene = JSON.parse(
    await readFile(path.join(appRoot, scenePath), 'utf8'),
  ) as { assets?: unknown[]; nodes?: unknown[] };
  const expectedNodeCount = (originalScene.nodes?.length ?? 0) + 1;
  const addedNodeId =
    target === 'browser' ? 'scaffold-added-group' : 'scaffold-added-plant';
  const assetIds = getSceneAssetIds(originalScene);
  const evidenceDir =
    CREATE_E2E_EVIDENCE_DIR == null
      ? undefined
      : path.join(CREATE_E2E_EVIDENCE_DIR, `generated-${target}`);
  if (evidenceDir != null) {
    await mkdir(evidenceDir, { recursive: true });
  }

  const appPage = await browser.newPage({
    viewport: { height: 720, width: 960 },
  });
  const editorPage = await browser.newPage({
    extraHTTPHeaders: MANAGED_WORKSPACE_HEADERS,
    viewport: { height: 720, width: 960 },
  });
  const appDiagnostics = collectPageDiagnostics(appPage, assetIds);
  const editorDiagnostics = collectPageDiagnostics(editorPage, assetIds);

  try {
    await appPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    try {
      await appPage.waitForFunction(
        () => Boolean((window as any).FRAMEWORK_MCP_RUNTIME),
        undefined,
        { timeout: 30000 },
      );
    } catch (error) {
      throw new Error(
        `generated ${target}/${language} runtime did not initialize\n${JSON.stringify(
          appDiagnostics.snapshot(),
          null,
          2,
        )}`,
        { cause: error },
      );
    }
    await appPage.waitForFunction(
      () => document.querySelectorAll('canvas').length > 0,
      undefined,
      { timeout: 30000 },
    );
    let appScreenshotStats = await getPageScreenshotStats(
      appPage,
      evidenceDir == null ? undefined : path.join(evidenceDir, 'app.png'),
    );
    if (target !== 'browser') {
      const renderDeadline = Date.now() + 30000;
      while (
        appScreenshotStats.uniqueColors <= 8 &&
        Date.now() < renderDeadline
      ) {
        await appPage.waitForTimeout(250);
        appScreenshotStats = await getPageScreenshotStats(
          appPage,
          evidenceDir == null ? undefined : path.join(evidenceDir, 'app.png'),
        );
      }
      expect(
        appScreenshotStats.uniqueColors,
        `generated ${target} app should render a nonblank frame\n${JSON.stringify(
          appDiagnostics.snapshot(),
          null,
          2,
        )}`,
      ).toBeGreaterThan(8);
    } else {
      expect(appScreenshotStats.sampledPixels).toBeGreaterThan(0);
    }

    await editorPage.goto(`${baseUrl}/__iwsdk/editor?scene=${scenePath}`, {
      waitUntil: 'domcontentloaded',
    });
    await editorPage.waitForFunction(
      () => Boolean((window as any).IWSDK_SCENE_EDITOR),
      undefined,
      { timeout: 15000 },
    );
    await editorPage.waitForFunction(
      () =>
        Boolean(
          (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS?.getProof?.()
            ?.worldReady,
        ),
      undefined,
      { timeout: 30000 },
    );
    await expect
      .poll(() => editorPage.locator('#dirty-status').textContent())
      .toBe('Saved');
    const editorProofBefore = await editorPage.evaluate(() =>
      (window as any).IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
    );
    expect(editorProofBefore).toMatchObject({
      renderer: 'iwsdk-webgl',
      uses2DRenderer: false,
      webgl: true,
      worldReady: true,
    });
    const editorScreenshotStats = await getPageScreenshotStats(
      editorPage,
      evidenceDir == null ? undefined : path.join(evidenceDir, 'editor.png'),
    );
    expect(editorScreenshotStats.uniqueColors).toBeGreaterThan(8);

    const toolResult = await editorPage.evaluate(async (experienceTarget) => {
      const runtime = (window as any).IWSDK_SCENE_EDITOR.runtime;
      const node =
        experienceTarget === 'browser'
          ? {
              content: { type: 'group' },
              id: 'scaffold-added-group',
              name: 'Scaffold Added Group',
            }
          : {
              content: {
                asset: 'plant-sansevieria',
                type: 'asset',
              },
              id: 'scaffold-added-plant',
              name: 'Scaffold Added Plant',
              transform: {
                position: [0.25, 0.2, -1.25],
                rotationDeg: [0, 20, 0],
                scale: 1.1,
              },
            };
      await runtime.dispatch('scene_add_node', {
        node,
      });
      await runtime.dispatch('scene_set_camera', { view: 'top' });
      const screenshots = [];
      for (const view of ['top', 'front', 'right', 'quarter']) {
        screenshots.push(
          await runtime.dispatch('scene_screenshot', {
            height: 240,
            view,
            width: 320,
          }),
        );
      }
      const validation = await runtime.dispatch('scene_validate', {});
      const saved = await runtime.dispatch('scene_save', {});
      const documentResult = await runtime.dispatch('scene_get_document', {});
      return { documentResult, saved, screenshots, validation };
    }, target);

    expect(toolResult.saved).toMatchObject({
      dirty: false,
      path: scenePath,
    });
    expect(
      (toolResult.documentResult as { document: { nodes: unknown[] } }).document
        .nodes,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: addedNodeId })]),
    );
    expect(
      (
        toolResult.screenshots as Array<{
          camera: { view: string };
          imageData: string;
          mimeType: string;
        }>
      ).map((screenshot) => screenshot.camera.view),
    ).toEqual(['top', 'front', 'right', 'quarter']);
    for (const screenshot of toolResult.screenshots as Array<{
      imageData: string;
      mimeType: string;
    }>) {
      expect(screenshot.mimeType).toBe('image/png');
      expect(screenshot.imageData.length).toBeGreaterThan(1000);
    }
    expect(toolResult.validation).toMatchObject({
      issues: expect.any(Array),
      valid: expect.any(Boolean),
    });

    await editorPage.reload({ waitUntil: 'domcontentloaded' });
    await editorPage.waitForFunction(
      () => Boolean((window as any).IWSDK_SCENE_EDITOR),
      undefined,
      { timeout: 15000 },
    );
    await expect
      .poll(() => editorPage.locator('#scene-status').textContent())
      .toContain(`${expectedNodeCount} nodes`);

    await appPage.reload({ waitUntil: 'domcontentloaded' });
    await appPage.waitForFunction(
      () => Boolean((window as any).FRAMEWORK_MCP_RUNTIME),
      undefined,
      { timeout: 90000 },
    );
    await appPage.waitForFunction(
      () => document.querySelectorAll('canvas').length > 0,
      undefined,
      { timeout: 30000 },
    );
    await appPage.waitForTimeout(1000);
    const appScene = await appPage.evaluate(async (url) => {
      const response = await fetch(`/${url}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`scene reload failed: ${response.status}`);
      }
      return response.json();
    }, scenePublicUrl);
    expect(appScene.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: addedNodeId })]),
    );

    const savedScene = JSON.parse(
      await readFile(path.join(appRoot, scenePath), 'utf8'),
    );
    expect(savedScene.nodes).toEqual(
      expect.arrayContaining([
        target === 'browser'
          ? expect.objectContaining({
              content: { type: 'group' },
              id: addedNodeId,
            })
          : expect.objectContaining({
              content: {
                asset: 'plant-sansevieria',
                type: 'asset',
              },
              id: addedNodeId,
              transform: expect.objectContaining({
                position: [0.25, 0.2, -1.25],
              }),
            }),
      ]),
    );
    const savedComponentIds = getSceneComponentIds(savedScene);
    const hierarchy = await dispatchRuntime(appPage, 'get_scene_hierarchy', {
      maxChildren: 100,
      maxDepth: 10,
    });
    for (const componentId of savedComponentIds) {
      expect(
        await waitForRuntimeComponentCount(appPage, componentId),
        `runtime component ${componentId}`,
      ).toBeGreaterThan(0);
    }
    const componentSummary = await getRuntimeComponentSummary(
      appPage,
      savedComponentIds,
    );
    const appAfterReloadScreenshotStats = await getPageScreenshotStats(
      appPage,
      evidenceDir == null
        ? undefined
        : path.join(evidenceDir, 'app-after-reload.png'),
    );
    if (target === 'browser') {
      expect(appAfterReloadScreenshotStats.sampledPixels).toBeGreaterThan(0);
    } else {
      expect(appAfterReloadScreenshotStats.uniqueColors).toBeGreaterThan(8);
    }

    const appSnapshot = appDiagnostics.snapshot();
    const editorSnapshot = editorDiagnostics.snapshot();
    expect(filterIgnorableBrowserErrors(appSnapshot.consoleErrors)).toEqual([]);
    expect(filterIgnorableBrowserErrors(editorSnapshot.consoleErrors)).toEqual(
      [],
    );
    expect(filterIgnorableRequestFailures(appSnapshot.failedRequests)).toEqual(
      [],
    );
    expect(
      filterIgnorableRequestFailures(editorSnapshot.failedRequests),
    ).toEqual([]);
    expect(filterIgnorableBadResponses(appSnapshot.badResponses)).toEqual([]);
    expect(filterIgnorableBadResponses(editorSnapshot.badResponses)).toEqual(
      [],
    );
    assertAssetResponses(appSnapshot.assetResponses, assetIds);
    assertAssetResponses(editorSnapshot.assetResponses, assetIds);

    if (evidenceDir != null) {
      await writeFile(
        path.join(evidenceDir, 'proof.json'),
        JSON.stringify(
          {
            app: {
              afterReloadScreenshot: {
                path: path.join(evidenceDir, 'app-after-reload.png'),
                stats: appAfterReloadScreenshotStats,
              },
              hierarchy,
              initialScreenshot: {
                path: path.join(evidenceDir, 'app.png'),
                stats: appScreenshotStats,
              },
              runtimeComponents: componentSummary,
            },
            browser: {
              baseUrl,
              mode: target,
              target,
              scenePath,
            },
            editor: {
              proofBefore: editorProofBefore,
              screenshot: {
                path: path.join(evidenceDir, 'editor.png'),
                stats: editorScreenshotStats,
              },
              toolResult: {
                saved: toolResult.saved,
                screenshotViews: (
                  toolResult.screenshots as Array<{
                    camera: { view: string };
                    imageData: string;
                    mimeType: string;
                  }>
                ).map((screenshot) => ({
                  imageDataLength: screenshot.imageData.length,
                  mimeType: screenshot.mimeType,
                  view: screenshot.camera.view,
                })),
                validation: toolResult.validation,
              },
            },
            network: {
              app: appSnapshot,
              editor: editorSnapshot,
            },
            scene: {
              after: savedScene,
              before: originalScene,
            },
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await editorPage.close();
    await appPage.close();
  }
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-create-e2e-'));
  tempDirs.push(tempDir);
  return tempDir;
}

async function runCreate(
  args: string[],
  cwd: string,
  options: { timeoutMs?: number } = {},
): Promise<CommandResult> {
  return runCommand(process.execPath, [CREATE_CLI, ...args], cwd, {
    env: {
      [LEGACY_EDITOR_CLI_ENV]: '',
    },
    timeoutMs: options.timeoutMs,
  });
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: { env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return new Promise<CommandResult>((resolve, reject) => {
    const timeout =
      options.timeoutMs == null
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            stderr += `\nCommand timed out after ${options.timeoutMs}ms: ${command} ${args.join(
              ' ',
            )}\n`;
            child.kill('SIGTERM');
          }, options.timeoutMs);
    child.on('error', reject);
    child.on('exit', (exitCode) => {
      if (timeout != null) {
        clearTimeout(timeout);
      }
      resolve({ exitCode, stderr, stdout, timedOut });
    });
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertGeneratedSettings(
  source: string,
  viteConfig: string,
  output: string,
  target: ExperienceTarget,
) {
  const configuration = getRecommendedConfiguration(target);
  const expectedFeatures = formatAppFeatures(configuration.featureFlags);
  const expectedXR = formatXRConfiguration(configuration);
  expect(normalizeWhitespace(source)).toContain(
    normalizeWhitespace(`features: ${expectedFeatures}`),
  );
  expect(normalizeWhitespace(output)).toContain(
    normalizeWhitespace(`xr: ${expectedXR}`),
  );
  expect(normalizeWhitespace(output)).toContain(
    normalizeWhitespace(`features: ${expectedFeatures}`),
  );

  if (target === 'browser') {
    expect(source).toMatch(/\bxr:\s*false\b/);
    expect(source).toMatch(/canvasPointerEvents:\s*true/);
    expect(source).not.toMatch(/SessionMode\.Immersive(?:AR|VR)/);
    expect(viteConfig).toMatch(/iwer:\s*false/);
    return;
  }

  expect(source).toMatch(
    new RegExp(
      `sessionMode:\\s*SessionMode\\.Immersive${target === 'ar' ? 'AR' : 'VR'}`,
    ),
  );
  expect(source).not.toMatch(/\bxr:\s*false\b/);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/,\s*}/g, ' }').trim();
}

type BundleServerOptions = {
  missingPaths?: readonly string[];
  onRequest?: (relativePath: string) => Promise<void> | void;
  packages?: Record<string, string>;
};

type TestBundleServer = {
  close: () => Promise<void>;
  origin: string;
};

async function startBundleServer(
  options: BundleServerOptions = {},
): Promise<TestBundleServer> {
  const missingPaths = new Set(options?.missingPaths ?? []);
  const packages = options?.packages ?? {};
  const server: Server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(
      /^\/+/,
      '',
    );
    await options?.onRequest?.(relativePath);

    if (missingPaths.has(relativePath)) {
      response.writeHead(404).end();
      return;
    }

    if (relativePath === 'bundle.json') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          packages,
          schemaVersion: 1,
          sdkVersion: '0.0.0-test',
        }),
      );
      return;
    }

    const serveRoot = relativePath.startsWith('packages/')
      ? REPO_ROOT
      : STARTER_DIST;
    const filePath = path.resolve(serveRoot, relativePath);
    if (
      filePath !== serveRoot &&
      !filePath.startsWith(`${serveRoot}${path.sep}`)
    ) {
      response.writeHead(403).end();
      return;
    }

    try {
      response.writeHead(200).end(await readFile(filePath));
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function assertBundleTarballsExist() {
  await Promise.all(
    Object.values(BUNDLE_PACKAGE_PATHS).map((relativePath) =>
      stat(path.join(REPO_ROOT, relativePath)),
    ),
  );
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function startLongRunningCommand(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: {
      ...process.env,
      BROWSER: 'none',
      IWSDK_DISABLE_MKCERT: '1',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let exitCode: number | null | undefined;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exitPromise = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => {
      exitCode = code;
      resolve(code);
    });
  });

  return {
    close: async () => {
      if (exitCode === undefined && child.pid != null) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
        await Promise.race([exitPromise, sleep(3000)]);
      }
      if (exitCode === undefined && child.pid != null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
        await Promise.race([exitPromise, sleep(1000)]);
      }
    },
    hasExited: () => exitCode !== undefined,
    output: () => stderr + stdout,
  };
}

async function waitForHttpOk(
  url: string,
  processHandle: { hasExited(): boolean; output(): string },
  timeoutMs = 45000,
  headers?: Record<string, string>,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (processHandle.hasExited()) {
      throw new Error(
        `Dev server exited before ${url} became available:\n${processHandle.output()}`,
      );
    }
    try {
      const response = await fetch(url, { cache: 'no-store', headers });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${processHandle.output()}`,
  );
}

async function waitForManagedBrowserLaunch(
  appRoot: string,
  processHandle: { hasExited(): boolean; output(): string },
  timeoutMs = 45000,
): Promise<{
  aiMode?: string;
  browser: {
    commandReady: boolean;
    connected: boolean;
    status: string;
  };
}> {
  const sessionPath = path.join(appRoot, '.iwsdk', 'runtime', 'session.json');
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (processHandle.hasExited()) {
      throw new Error(
        `Dev server exited before the managed browser launched:\n${processHandle.output()}`,
      );
    }

    try {
      const session = JSON.parse(await readFile(sessionPath, 'utf8'));
      if (session.browser?.status === 'launch_failed') {
        throw new Error(
          `Managed browser launch failed: ${JSON.stringify(session.browser)}`,
        );
      }
      if (
        session.browser?.status === 'waiting_for_connection' ||
        session.browser?.status === 'connected'
      ) {
        return session;
      }
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.startsWith('Managed browser launch failed:')
      ) {
        throw error;
      }
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for the managed browser: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${processHandle.output()}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createEditorMiddleware(root: string): Middleware {
  const middlewares: Middleware[] = [];
  const plugin = iwsdkDev();
  plugin.configResolved?.({
    command: 'serve',
    root,
    server: {},
  } as never);
  plugin.configureServer?.({
    httpServer: { on: vi.fn() },
    middlewares: {
      use: (middleware: Middleware) => {
        middlewares.push(middleware);
      },
    },
  } as never);

  expect(middlewares.length).toBeGreaterThan(0);
  return middlewares[0];
}

function runMiddleware(
  middleware: Middleware,
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
) {
  return new Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const request = Readable.from(body ? [body] : []) as Readable & {
      method?: string;
      url?: string;
    };
    request.method = method;
    request.url = url;
    request.headers = headers;
    const response = {
      body: '',
      headers: {} as Record<string, string>,
      statusCode: 0,
      end: (responseBody?: string) => {
        response.body = responseBody ?? '';
        resolve(response);
      },
      setHeader: (name: string, value: string) => {
        response.headers[name] = value;
      },
    };

    try {
      middleware(request, response, () =>
        reject(new Error(`Unexpected next() for ${method} ${url}`)),
      );
    } catch (error) {
      reject(error);
    }
  });
}

function collectPageDiagnostics(page: any, assetIds: string[]) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const assetResponses = new Map<string, number[]>(
    assetIds.map((assetId) => [assetId, []]),
  );

  page.on('console', (message: { text(): string; type(): string }) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error: Error) =>
    consoleErrors.push(error.stack ?? error.message),
  );
  page.on('requestfailed', (request: any) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${
        request.failure()?.errorText ?? 'failed'
      }`,
    );
  });
  page.on('response', (response: any) => {
    const url = response.url();
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${url}`);
    }
    for (const assetId of assetIds) {
      if (url.includes(`/iwsdk-assets/${assetId}/`)) {
        assetResponses.get(assetId)?.push(response.status());
      }
    }
  });

  return {
    snapshot: () => ({
      assetResponses: Object.fromEntries(assetResponses.entries()),
      badResponses,
      consoleErrors,
      failedRequests,
    }),
  };
}

function filterIgnorableBrowserErrors(errors: string[]): string[] {
  return errors.filter(
    (error) =>
      !error.includes(
        'Failed to load resource: the server responded with a status of 404',
      ) &&
      !error.includes('Outdated Optimize Dep') &&
      !error.includes(
        'Error loading environment living_room from CDN TypeError: Failed to fetch',
      ),
  );
}

function filterIgnorableRequestFailures(failures: string[]): string[] {
  return failures.filter(
    (failure) =>
      !failure.includes('/favicon.ico') &&
      !failure.includes('/.well-known/') &&
      !failure.includes('@iwer/sem@0.2.4/captures/living_room.json') &&
      !(
        failure.includes('/node_modules/.vite/deps/') &&
        failure.includes('net::ERR_ABORTED')
      ),
  );
}

function filterIgnorableBadResponses(responses: string[]): string[] {
  return responses.filter(
    (response) =>
      !response.includes('/favicon.ico') &&
      !response.includes('/.well-known/') &&
      !(
        response.startsWith('504 ') &&
        response.includes('/node_modules/.vite/deps/')
      ) &&
      !response.includes('Outdated Optimize Dep'),
  );
}

function assertAssetResponses(
  assetResponses: Record<string, number[]>,
  assetIds: string[],
) {
  for (const assetId of assetIds) {
    const statuses = assetResponses[assetId] ?? [];
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status >= 200 && status < 300)).toBe(
      true,
    );
  }
}

async function getPageScreenshotStats(page: any): Promise<{
  sampledPixels: number;
  uniqueColors: number;
}>;
async function getPageScreenshotStats(
  page: any,
  screenshotPath?: string,
): Promise<{
  sampledPixels: number;
  uniqueColors: number;
}> {
  const screenshot = await page.screenshot({
    path: screenshotPath,
    type: 'png',
  });
  return page.evaluate(async (base64: string) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context == null) {
      return { sampledPixels: 0, uniqueColors: 0 };
    }

    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    const step = Math.max(4, Math.floor(data.length / 4000));
    let sampledPixels = 0;
    for (let index = 0; index < data.length; index += step - (step % 4)) {
      colors.add(
        `${data[index]},${data[index + 1]},${data[index + 2]},${
          data[index + 3]
        }`,
      );
      sampledPixels += 1;
      if (colors.size >= 32) {
        break;
      }
    }

    return { sampledPixels, uniqueColors: colors.size };
  }, screenshot.toString('base64'));
}

async function dispatchRuntime(
  page: any,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return page.evaluate(
    ({ method: runtimeMethod, params: runtimeParams }) =>
      (window as any).FRAMEWORK_MCP_RUNTIME.dispatch(
        runtimeMethod,
        runtimeParams,
      ),
    { method, params },
  );
}

async function getRuntimeComponentSummary(
  page: any,
  componentIds: string[],
): Promise<Record<string, { total: number }>> {
  const summary: Record<string, { total: number }> = {};
  for (const componentId of componentIds) {
    const result = (await dispatchRuntime(page, 'ecs_find_entities', {
      limit: 50,
      withComponents: [componentId],
    })) as { total?: number };
    summary[componentId] = { total: result.total ?? 0 };
  }
  return summary;
}

async function waitForRuntimeComponentCount(
  page: any,
  componentId: string,
): Promise<number> {
  let lastCount = 0;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const summary = await getRuntimeComponentSummary(page, [componentId]);
    lastCount = summary[componentId]?.total ?? 0;
    if (lastCount > 0) {
      return lastCount;
    }
    await sleep(250);
  }
  return lastCount;
}

function getSceneAssetIds(scene: { nodes?: unknown[] }): string[] {
  return Array.from(
    new Set(
      flattenSceneNodes(scene.nodes ?? [])
        .map((node) =>
          typeof node?.content === 'object' &&
          node.content != null &&
          node.content.type === 'asset' &&
          typeof node.content.asset === 'string'
            ? node.content.asset
            : undefined,
        )
        .filter((assetId): assetId is string => assetId != null),
    ),
  ).sort();
}

function getSceneComponentIds(scene: { nodes?: unknown[] }): string[] {
  return Array.from(
    new Set(
      flattenSceneNodes(scene.nodes ?? []).flatMap((node) =>
        typeof node === 'object' &&
        node != null &&
        'components' in node &&
        typeof node.components === 'object' &&
        node.components != null &&
        !Array.isArray(node.components)
          ? Object.keys(node.components).map(stripComponentPrefix)
          : [],
      ),
    ),
  ).sort();
}

function flattenSceneNodes(nodes: unknown[]): any[] {
  return nodes.flatMap((node) =>
    typeof node === 'object' && node != null && !Array.isArray(node)
      ? [
          node,
          ...flattenSceneNodes(
            Array.isArray((node as { children?: unknown }).children)
              ? ((node as { children: unknown[] }).children ?? [])
              : [],
          ),
        ]
      : [],
  );
}

function stripComponentPrefix(componentName: string): string {
  return componentName.startsWith('com.iwsdk.components.')
    ? componentName.slice('com.iwsdk.components.'.length)
    : componentName;
}

async function launchChromium() {
  return chromium.launch({
    args: ['--enable-webgl', '--use-angle=metal'],
    channel: 'chromium',
    headless: true,
  });
}
