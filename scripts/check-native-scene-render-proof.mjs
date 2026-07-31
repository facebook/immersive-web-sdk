#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import path from 'path';
import { format as formatWithPrettier } from 'prettier';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const PLUGIN_PACKAGE_JSON = path.join(
  REPO_ROOT,
  'packages/vite-plugin-dev/package.json',
);
const requireFromPlugin = createRequire(PLUGIN_PACKAGE_JSON);
const { chromium } = requireFromPlugin('playwright');

const DEFAULT_ARTIFACT_ROOT = path.join(
  REPO_ROOT,
  'docs/test-evidence/native-scene-examples/current',
);
const MANAGED_WORKSPACE_HEADER = 'x-iwsdk-managed-workspace';
const RENDER_PROOF_MANAGED_WORKSPACE_TOKEN =
  'native-scene-render-proof-managed-workspace';
const PERFORMANCE_THRESHOLDS = {
  appCanvasReadyMs: 30_000,
  appRuntimeReadyMs: 60_000,
  appScreenshotCaptureMs: 10_000,
  editorScreenshotCaptureMs: 10_000,
  editorWorldReadyMs: 60_000,
  targetTotalMs: 120_000,
};

async function writeJsonFile(filePath, value) {
  writeFileSync(
    filePath,
    await formatWithPrettier(JSON.stringify(value), { parser: 'json' }),
  );
}

const TARGETS = [
  {
    assetIds: ['environment-desk', 'robot'],
    componentIds: [
      'AudioSource',
      'LocomotionEnvironment',
      'PanelUI',
      'RayInteractable',
    ],
    id: 'audio',
    names: ['Environment', 'Robot Center', 'Robot Left', 'Robot Right'],
    root: 'examples/audio',
    scene: 'public/scenes/audio.iwsdk.scene.json',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    componentIds: [
      'DistanceGrabbable',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'RayInteractable',
      'TwoHandsGrabbable',
    ],
    id: 'grab',
    names: [
      'Distance Grabbable Robot',
      'One Hand Grabbable Plant',
      'Two Hands Grabbable Plant',
    ],
    root: 'examples/grab',
    scene: 'public/scenes/grab.iwsdk.scene.json',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    componentIds: [
      'DistanceGrabbable',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'PhysicsBody',
      'PhysicsShape',
      'RayInteractable',
    ],
    id: 'physics',
    names: ['Environment', 'Plant', 'One Hand Physics Robot'],
    root: 'examples/physics',
    scene: 'public/scenes/physics.iwsdk.scene.json',
  },
];

function parseArgs(argv) {
  const options = {
    artifactRoot: DEFAULT_ARTIFACT_ROOT,
    targets: TARGETS.map((target) => target.id),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact-root') {
      const next = argv[index + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--artifact-root requires a path');
      }
      options.artifactRoot = path.resolve(next);
      index += 1;
    } else if (arg === '--target') {
      const next = argv[index + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--target requires a comma-separated target list');
      }
      options.targets = next.split(',').map((entry) => entry.trim());
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-native-scene-render-proof.mjs [options]

Options:
  --artifact-root <path>  Directory for screenshots and proof JSON.
                          Defaults to docs/test-evidence/native-scene-examples/current.
  --target <ids>          Comma-separated target ids: audio,grab,physics.
  -h, --help              Show this help.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selectedTargets = TARGETS.filter((target) =>
    options.targets.includes(target.id),
  );
  const unknownTargets = options.targets.filter(
    (id) => !TARGETS.some((target) => target.id === id),
  );
  if (unknownTargets.length > 0) {
    throw new Error(
      `Unknown native scene render-proof target(s): ${unknownTargets.join(', ')}`,
    );
  }

  mkdirSync(options.artifactRoot, { recursive: true });
  const failures = [];
  const summaries = [];
  let browser;

  try {
    browser = await launchChromium();
    for (const target of selectedTargets) {
      try {
        const summary = await proveTarget(
          browser,
          target,
          options.artifactRoot,
        );
        summaries.push(summary);
        console.log(
          `Native scene render proof passed: ${target.id} (${summary.editor.meshCount} editor meshes, ${summary.app.uniqueColors} app colors, ${summary.performance.totalMs}ms total)`,
        );
      } catch (error) {
        failures.push(
          `${target.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await browser?.close();
  }

  const manifest = {
    artifactRoot: options.artifactRoot,
    generatedAt: new Date().toISOString(),
    performanceThresholds: PERFORMANCE_THRESHOLDS,
    summaries,
  };
  await writeJsonFile(
    path.join(options.artifactRoot, 'manifest.json'),
    manifest,
  );

  if (failures.length > 0) {
    console.error('Native scene render proof failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Native scene render proof passed for ${selectedTargets.length} migrated examples.`,
  );
}

async function proveTarget(browser, target, artifactRoot) {
  const targetStartMs = Date.now();
  const root = path.join(REPO_ROOT, target.root);
  const targetArtifactRoot = path.join(artifactRoot, target.id);
  mkdirSync(targetArtifactRoot, { recursive: true });

  const port = await getFreePort();
  const server = startDevServer(root, port);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const appPage = await newInstrumentedPage(browser);
  let editorPage;

  try {
    await waitForHttpOk(baseUrl, server);
    const appProof = await proveAppPage({
      baseUrl,
      pageContext: appPage,
      screenshotPath: path.join(targetArtifactRoot, 'app.png'),
      target,
    });
    editorPage = await newInstrumentedPage(browser, {
      managedWorkspace: true,
    });
    const editorProof = await proveEditorPage({
      baseUrl,
      pageContext: editorPage,
      screenshotPath: path.join(targetArtifactRoot, 'editor.png'),
      target,
    });

    const performance = {
      app: appProof.performance,
      editor: editorProof.performance,
      thresholds: PERFORMANCE_THRESHOLDS,
      totalMs: Date.now() - targetStartMs,
    };
    assertPerformance(
      `${target.id} total render proof`,
      performance.totalMs,
      PERFORMANCE_THRESHOLDS.targetTotalMs,
    );

    const proof = {
      app: appProof,
      baseUrl,
      editor: editorProof,
      performance,
      scene: target.scene,
      target: target.id,
    };
    await writeJsonFile(path.join(targetArtifactRoot, 'proof.json'), proof);
    return {
      app: {
        screenshot: appProof.screenshot,
        uniqueColors: appProof.screenshotStats.uniqueColors,
      },
      editor: {
        meshCount: editorProof.viewport.meshCount,
        nodeObjectCount: editorProof.viewport.nodeObjectCount,
        screenshot: editorProof.screenshot,
      },
      performance: {
        appRuntimeReadyMs: appProof.performance.runtimeReadyMs,
        editorWorldReadyMs: editorProof.performance.worldReadyMs,
        totalMs: performance.totalMs,
      },
      target: target.id,
    };
  } finally {
    await appPage.page.close();
    await editorPage?.page.close();
    await server.close();
  }
}

async function proveAppPage({ baseUrl, pageContext, screenshotPath, target }) {
  const { page } = pageContext;
  const assetResponses = new Map();
  page.on('response', (response) => {
    const url = response.url();
    for (const assetId of target.assetIds) {
      if (url.includes(`/iwsdk-assets/${assetId}/`)) {
        const statuses = assetResponses.get(assetId) ?? [];
        statuses.push(response.status());
        assetResponses.set(assetId, statuses);
      }
    }
  });

  const performance = {};
  const gotoStartMs = Date.now();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  performance.gotoMs = Date.now() - gotoStartMs;
  const runtimeStartMs = Date.now();
  await waitForAppRuntime(pageContext, screenshotPath);
  performance.runtimeReadyMs = Date.now() - runtimeStartMs;
  assertPerformance(
    'app runtime ready',
    performance.runtimeReadyMs,
    PERFORMANCE_THRESHOLDS.appRuntimeReadyMs,
  );
  const canvasStartMs = Date.now();
  await page.waitForFunction(
    () => document.querySelectorAll('canvas').length > 0,
    undefined,
    { timeout: 30000 },
  );
  performance.canvasReadyMs = Date.now() - canvasStartMs;
  assertPerformance(
    'app canvas ready',
    performance.canvasReadyMs,
    PERFORMANCE_THRESHOLDS.appCanvasReadyMs,
  );
  await page.waitForTimeout(1000);

  const hierarchy = await waitForHierarchyNames(page, target.names);
  const hierarchyNames = new Set(flattenHierarchyNames(hierarchy));
  for (const name of target.names) {
    if (!hierarchyNames.has(name)) {
      const diagnostics = [
        ...pageContext.consoleErrors,
        ...pageContext.badResponses,
        ...pageContext.failedRequests,
      ]
        .slice(-10)
        .join(' | ');
      throw new Error(
        `app hierarchy missing "${name}"; found ${Array.from(hierarchyNames)
          .slice(0, 20)
          .join(', ')}${diagnostics ? `; diagnostics: ${diagnostics}` : ''}`,
      );
    }
  }

  const componentSummary = {};
  for (const componentId of target.componentIds) {
    const result = await dispatch(page, 'ecs_find_entities', {
      limit: 20,
      withComponents: [componentId],
    });
    if (!isPositiveEntityResult(result)) {
      throw new Error(`app has no active entities with ${componentId}`);
    }
    componentSummary[componentId] = result.total;
  }

  const assetSummary = {};
  for (const assetId of target.assetIds) {
    const statuses = assetResponses.get(assetId) ?? [];
    assetSummary[assetId] = statuses;
    if (statuses.length === 0) {
      throw new Error(`app observed no shared asset request for ${assetId}`);
    }
    const badStatus = statuses.find((status) => status < 200 || status >= 300);
    if (badStatus != null) {
      throw new Error(
        `app shared asset ${assetId} returned HTTP ${badStatus}; statuses: ${statuses.join(', ')}`,
      );
    }
  }

  const screenshotStartMs = Date.now();
  const screenshot = await page.screenshot({
    fullPage: true,
    path: screenshotPath,
  });
  const screenshotStats = await getScreenshotStats(
    page,
    screenshot.toString('base64'),
    screenshotPath,
  );
  performance.screenshotCaptureMs = Date.now() - screenshotStartMs;
  assertPerformance(
    'app screenshot capture',
    performance.screenshotCaptureMs,
    PERFORMANCE_THRESHOLDS.appScreenshotCaptureMs,
  );
  assertScreenshotNotBlank('app', screenshotStats);
  assertCleanPage('app', pageContext);

  return {
    assets: assetSummary,
    components: componentSummary,
    hierarchyNameCount: hierarchyNames.size,
    performance,
    screenshot: screenshotPath,
    screenshotStats,
  };
}

async function waitForHierarchyNames(page, expectedNames, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let hierarchy = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      hierarchy = await dispatch(page, 'get_scene_hierarchy', {
        maxChildren: 100,
        maxDepth: 10,
      });
      const names = new Set(flattenHierarchyNames(hierarchy));
      if (expectedNames.every((name) => names.has(name))) {
        return hierarchy;
      }
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(100);
  }
  if (lastError != null) {
    throw lastError;
  }
  return hierarchy;
}

async function waitForAppRuntime(pageContext, screenshotPath) {
  try {
    await pageContext.page.waitForFunction(
      () => Boolean(window.FRAMEWORK_MCP_RUNTIME),
      undefined,
      { timeout: 90000 },
    );
  } catch (error) {
    const diagnostics = await collectPageDiagnostics(pageContext);
    const diagnosticsPath = screenshotPath.replace(
      /\.png$/,
      '-runtime-timeout.json',
    );
    await writeJsonFile(diagnosticsPath, diagnostics);
    await pageContext.page.screenshot({
      fullPage: true,
      path: screenshotPath.replace(/\.png$/, '-runtime-timeout.png'),
    });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; wrote ${diagnosticsPath}`,
    );
  }
}

async function proveEditorPage({
  baseUrl,
  pageContext,
  screenshotPath,
  target,
}) {
  const { page } = pageContext;
  const editorUrl = new URL('/__iwsdk/workspace', baseUrl);
  editorUrl.searchParams.set('scene', target.scene);

  const performance = {};
  const gotoStartMs = Date.now();
  await page.goto(editorUrl.href, { waitUntil: 'domcontentloaded' });
  performance.gotoMs = Date.now() - gotoStartMs;
  const worldStartMs = Date.now();
  await waitForEditorRuntime(pageContext, screenshotPath);
  performance.worldReadyMs = Date.now() - worldStartMs;
  assertPerformance(
    'editor world ready',
    performance.worldReadyMs,
    PERFORMANCE_THRESHOLDS.editorWorldReadyMs,
  );
  await page.waitForTimeout(500);
  const viewport = await page.evaluate(() =>
    window.IWSDK_SCENE_EDITOR_TEST_HOOKS.getProof(),
  );
  const sceneDocument = await page.evaluate(() => ({
    assetCount:
      window.IWSDK_SCENE_EDITOR.session.document.resources?.assets?.length ?? 0,
    nodeCount: window.IWSDK_SCENE_EDITOR.session.document.nodes.length,
  }));

  if (
    viewport.renderer !== 'iwsdk-webgl' ||
    viewport.uses2DRenderer !== false ||
    viewport.webgl !== true ||
    viewport.worldReady !== true
  ) {
    throw new Error(
      `editor viewport is not a real IWSDK WebGL scene: ${JSON.stringify(viewport)}`,
    );
  }
  if (viewport.nodeObjectCount < target.names.length) {
    throw new Error(
      `editor mounted ${viewport.nodeObjectCount} objects, expected at least ${target.names.length}`,
    );
  }
  if (viewport.meshCount <= 0) {
    throw new Error('editor did not render any meshes');
  }
  const failedAssetLoads = (viewport.assetLoads ?? []).filter(
    (entry) => entry.status === 'failed',
  );
  if (failedAssetLoads.length > 0) {
    throw new Error(
      `editor asset loads failed: ${JSON.stringify(failedAssetLoads)}`,
    );
  }

  const screenshotStartMs = Date.now();
  const screenshot = await page.screenshot({
    fullPage: true,
    path: screenshotPath,
  });
  const screenshotStats = await getScreenshotStats(
    page,
    screenshot.toString('base64'),
    screenshotPath,
  );
  performance.screenshotCaptureMs = Date.now() - screenshotStartMs;
  assertPerformance(
    'editor screenshot capture',
    performance.screenshotCaptureMs,
    PERFORMANCE_THRESHOLDS.editorScreenshotCaptureMs,
  );
  assertScreenshotNotBlank('editor', screenshotStats);
  assertCleanPage('editor', pageContext);

  return {
    performance,
    sceneDocument,
    screenshot: screenshotPath,
    screenshotStats,
    viewport: {
      assetLoads: viewport.assetLoads,
      meshCount: viewport.meshCount,
      nodeObjectCount: viewport.nodeObjectCount,
      objectHierarchy: viewport.objectHierarchy,
      renderer: viewport.renderer,
      webgl: viewport.webgl,
      worldReady: viewport.worldReady,
    },
  };
}

async function waitForEditorRuntime(pageContext, screenshotPath) {
  try {
    await pageContext.page.waitForFunction(
      () =>
        Boolean(window.IWSDK_SCENE_EDITOR_TEST_HOOKS?.getProof?.().worldReady),
      undefined,
      { timeout: 90000 },
    );
  } catch (error) {
    const diagnostics = await collectPageDiagnostics(pageContext);
    const diagnosticsPath = screenshotPath.replace(
      /\.png$/,
      '-runtime-timeout.json',
    );
    await writeJsonFile(diagnosticsPath, diagnostics);
    await pageContext.page.screenshot({
      fullPage: true,
      path: screenshotPath.replace(/\.png$/, '-runtime-timeout.png'),
    });
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; wrote ${diagnosticsPath}`,
    );
  }
}

async function newInstrumentedPage(browser, options = {}) {
  const page = await browser.newPage({
    viewport: { height: 768, width: 1180 },
  });
  if (options.managedWorkspace === true) {
    await page.setExtraHTTPHeaders({
      [MANAGED_WORKSPACE_HEADER]: RENDER_PROOF_MANAGED_WORKSPACE_TOKEN,
    });
  }
  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return { badResponses, consoleErrors, failedRequests, page };
}

function assertCleanPage(label, pageContext) {
  const relevantFailures = pageContext.failedRequests.filter(
    (entry) =>
      !entry.includes('/favicon.ico') &&
      !entry.includes('/.well-known/') &&
      !isTransientViteAbort(entry),
  );
  if (relevantFailures.length > 0) {
    throw new Error(
      `${label} request failures:\n${relevantFailures.join('\n')}`,
    );
  }
  const relevantBadResponses = pageContext.badResponses.filter(
    (entry) =>
      !entry.includes('/favicon.ico') && !entry.includes('/.well-known/'),
  );
  if (relevantBadResponses.length > 0) {
    throw new Error(
      `${label} bad HTTP responses:\n${relevantBadResponses.join('\n')}`,
    );
  }
  const relevantErrors = pageContext.consoleErrors.filter(
    (entry) =>
      !entry.includes('Failed to load resource') ||
      relevantBadResponses.length > 0,
  );
  if (relevantErrors.length > 0) {
    throw new Error(
      `${label} console/page errors:\n${relevantErrors.join('\n')}`,
    );
  }
}

function isTransientViteAbort(entry) {
  return (
    entry.includes('/node_modules/.vite/deps/') &&
    entry.includes('net::ERR_ABORTED')
  );
}

async function collectPageDiagnostics(pageContext) {
  const pageState = await pageContext.page.evaluate(() => ({
    bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
    canvasCount: document.querySelectorAll('canvas').length,
    hasFrameworkRuntime: Boolean(window.FRAMEWORK_MCP_RUNTIME),
    href: window.location.href,
    readyState: document.readyState,
    title: document.title,
    windowKeys: Object.keys(window)
      .filter(
        (key) =>
          key.includes('FRAMEWORK') ||
          key.includes('IWSDK') ||
          key.includes('__'),
      )
      .slice(0, 100),
  }));
  return {
    badResponses: pageContext.badResponses,
    consoleErrors: pageContext.consoleErrors,
    failedRequests: pageContext.failedRequests,
    pageState,
  };
}

function assertScreenshotNotBlank(label, stats) {
  if (stats.uniqueColors < 8) {
    throw new Error(
      `${label} screenshot appears blank: ${JSON.stringify(stats)}`,
    );
  }
}

function assertPerformance(label, actualMs, thresholdMs) {
  if (!Number.isFinite(actualMs) || actualMs > thresholdMs) {
    throw new Error(
      `${label} exceeded ${thresholdMs}ms threshold: ${actualMs}ms`,
    );
  }
}

function isPositiveEntityResult(result) {
  return (
    result != null &&
    typeof result.total === 'number' &&
    result.total > 0 &&
    Array.isArray(result.entities) &&
    result.entities.length > 0
  );
}

function flattenHierarchyNames(node) {
  return [
    node.name,
    ...(node.children ?? []).flatMap((child) => flattenHierarchyNames(child)),
  ];
}

async function dispatch(page, method, params) {
  return page.evaluate(
    ({ method: runtimeMethod, params: runtimeParams }) =>
      window.FRAMEWORK_MCP_RUNTIME.dispatch(runtimeMethod, runtimeParams),
    { method, params },
  );
}

async function getScreenshotStats(page, screenshotBase64, screenshotPath) {
  return page.evaluate(
    async ({ base64, pathForDebug }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context == null) {
        return { path: pathForDebug, sampledPixels: 0, uniqueColors: 0 };
      }

      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const colors = new Set();
      const step = Math.max(4, Math.floor(data.length / 4000));
      const alignedStep = step - (step % 4) || 4;
      let sampledPixels = 0;
      for (let index = 0; index < data.length; index += alignedStep) {
        const color = `${data[index]},${data[index + 1]},${data[index + 2]},${
          data[index + 3]
        }`;
        colors.add(color);
        sampledPixels += 1;
        if (colors.size >= 32) {
          break;
        }
      }

      return { path: pathForDebug, sampledPixels, uniqueColors: colors.size };
    },
    { base64: screenshotBase64, pathForDebug: screenshotPath },
  );
}

function startDevServer(cwd, port) {
  const child = spawn(
    'npm',
    [
      'run',
      'dev:runtime',
      '--',
      '--host',
      '127.0.0.1',
      '--force',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd,
      detached: true,
      env: {
        ...process.env,
        BROWSER: 'none',
        IWSDK_DISABLE_MKCERT: '1',
        IWSDK_TEST_MANAGED_WORKSPACE_TOKEN:
          RENDER_PROOF_MANAGED_WORKSPACE_TOKEN,
        NODE_ENV: process.env.NODE_ENV ?? 'test',
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  let exitCode;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const exitPromise = new Promise((resolve) => {
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
    output: () => output,
  };
}

async function waitForHttpOk(url, processHandle, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
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

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function launchChromium() {
  return chromium.launch({ headless: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
