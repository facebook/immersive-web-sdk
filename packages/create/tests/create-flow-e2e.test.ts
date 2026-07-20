/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
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
});

describe('create-iwsdk native scene flow E2E', () => {
  test('scaffolds every supported starter with scene JSON and editor-readable scenes', async () => {
    const workspace = await makeTempDir();
    const bundleServer = await startBundleServer();

    try {
      for (const mode of ['vr', 'ar'] as const) {
        for (const language of ['ts', 'js'] as const) {
          const appName = `app-${mode}-${language}`;
          const result = await runCreate(
            [
              appName,
              '-y',
              '--mode',
              mode,
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
            `${mode}.iwsdk.scene.json`,
          );
          const scene = JSON.parse(await readFile(sceneFile, 'utf8'));
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
          expect(source).toContain(`./scenes/${mode}.iwsdk.scene.json`);
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
            `/__iwsdk/editor/document?scene=public/scenes/${mode}.iwsdk.scene.json`,
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
            `/__iwsdk/workspace?scene=public/scenes/${mode}.iwsdk.scene.json`,
            '',
            MANAGED_WORKSPACE_HEADERS,
          );
          expect(editorShell.statusCode).toBe(200);
          expect(editorShell.body).toContain('IWSDK Scene Editor');
          expect(editorShell.body).toContain(
            `/__iwsdk/editor/document?scene=public/scenes/${mode}.iwsdk.scene.json`,
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

  maybeInstallE2ETest(
    'installs, builds, and serves every generated starter with the native editor route',
    async () => {
      const workspace = await makeTempDir();
      const bundleServer = await startBundleServer({
        packages: BUNDLE_PACKAGE_PATHS,
      });

      try {
        await assertBundleTarballsExist();
        for (const mode of ['vr', 'ar'] as const) {
          for (const language of ['ts', 'js'] as const) {
            const appName = `installed-${mode}-${language}-app`;
            const result = await runCreate(
              [
                appName,
                '-y',
                '--mode',
                mode,
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

              const scenePath = `public/scenes/${mode}.iwsdk.scene.json`;
              const editorPage = await waitForHttpOk(
                `${baseUrl}/__iwsdk/editor?scene=${scenePath}`,
                devServer,
              );
              expect(await editorPage.text()).toContain('IWSDK Scene Editor');

              const documentResponse = await waitForHttpOk(
                `${baseUrl}/__iwsdk/editor/document?scene=${scenePath}`,
                devServer,
              );
              expect(await documentResponse.json()).toMatchObject({
                units: 'meters',
                version: 'iwsdk.scene.v1',
              });

              if (language === 'ts') {
                await smokeGeneratedAppEditorFlow({
                  appRoot,
                  baseUrl,
                  mode,
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
  mode,
  scenePath,
}: {
  appRoot: string;
  baseUrl: string;
  mode: 'ar' | 'vr';
  scenePath: string;
}) {
  const scenePublicUrl = scenePath.replace(/^public\//, '');
  browser ??= await launchChromium();
  const originalScene = JSON.parse(
    await readFile(path.join(appRoot, scenePath), 'utf8'),
  ) as { assets?: unknown[]; nodes?: unknown[] };
  const expectedNodeCount = (originalScene.nodes?.length ?? 0) + 1;
  const assetIds = getSceneAssetIds(originalScene);
  const evidenceDir =
    CREATE_E2E_EVIDENCE_DIR == null
      ? undefined
      : path.join(CREATE_E2E_EVIDENCE_DIR, `generated-${mode}`);
  if (evidenceDir != null) {
    await mkdir(evidenceDir, { recursive: true });
  }

  const appPage = await browser.newPage({
    viewport: { height: 720, width: 960 },
  });
  const editorPage = await browser.newPage({
    viewport: { height: 720, width: 960 },
  });
  const appDiagnostics = collectPageDiagnostics(appPage, assetIds);
  const editorDiagnostics = collectPageDiagnostics(editorPage, assetIds);

  try {
    await appPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
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
    const appScreenshotStats = await getPageScreenshotStats(
      appPage,
      evidenceDir == null ? undefined : path.join(evidenceDir, 'app.png'),
    );
    expect(appScreenshotStats.uniqueColors).toBeGreaterThan(8);

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

    const toolResult = await editorPage.evaluate(async () => {
      const runtime = (window as any).IWSDK_SCENE_EDITOR.runtime;
      await runtime.dispatch('scene_add_node', {
        node: {
          asset: 'plant-sansevieria',
          id: 'scaffold-added-plant',
          metadata: {
            validation: {
              allowFloating: true,
            },
          },
          name: 'Scaffold Added Plant',
          transform: {
            position: [0.25, 0.2, -1.25],
            rotationDeg: [0, 20, 0],
            scale: 1.1,
          },
        },
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
    });

    expect(toolResult.saved).toMatchObject({
      dirty: false,
      path: scenePath,
    });
    expect(
      (toolResult.documentResult as { document: { nodes: unknown[] } }).document
        .nodes,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'scaffold-added-plant' }),
      ]),
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
      expect.arrayContaining([
        expect.objectContaining({ id: 'scaffold-added-plant' }),
      ]),
    );

    const savedScene = JSON.parse(
      await readFile(path.join(appRoot, scenePath), 'utf8'),
    );
    expect(savedScene.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asset: 'plant-sansevieria',
          id: 'scaffold-added-plant',
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
    expect(appAfterReloadScreenshotStats.uniqueColors).toBeGreaterThan(8);

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
              mode,
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

async function startBundleServer(): Promise<{
  close: () => Promise<void>;
  origin: string;
}>;
async function startBundleServer(options?: {
  packages?: Record<string, string>;
}): Promise<{
  close: () => Promise<void>;
  origin: string;
}> {
  const packages = options?.packages ?? {};
  const server: Server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(
      /^\/+/,
      '',
    );

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
      const response = await fetch(url, { cache: 'no-store' });
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
  page.on('pageerror', (error: Error) => consoleErrors.push(error.message));
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

function getSceneAssetIds(scene: { assets?: unknown[] }): string[] {
  return Array.from(
    new Set(
      (scene.assets ?? [])
        .map((asset) =>
          typeof asset === 'object' &&
          asset != null &&
          'id' in asset &&
          typeof asset.id === 'string'
            ? asset.id
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
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const executablePath = findSystemChromium();
    if (executablePath == null) {
      throw error;
    }
    return chromium.launch({
      args: ['--no-sandbox'],
      executablePath,
      headless: true,
    });
  }
}

function findSystemChromium(): string | undefined {
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];
  return candidates.find((candidate) => existsSync(candidate));
}
