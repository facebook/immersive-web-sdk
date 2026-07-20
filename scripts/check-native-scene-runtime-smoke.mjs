#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { createServer } from 'http';
import path from 'path';
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

const SMOKE_TARGETS = [
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
    physicsStep: true,
    root: 'examples/physics',
  },
];

async function main() {
  const failures = [];
  let browser;

  try {
    browser = await launchChromium();

    for (const target of SMOKE_TARGETS) {
      try {
        await smokeTarget(browser, target);
        console.log(`Native scene runtime smoke passed: ${target.id}`);
      } catch (error) {
        failures.push(
          `${target.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await browser?.close();
  }

  if (failures.length > 0) {
    console.error('Native scene runtime smoke failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Native scene runtime smoke passed for ${SMOKE_TARGETS.length} migrated examples.`,
  );
}

async function smokeTarget(browser, target) {
  const root = path.join(REPO_ROOT, target.root);
  const port = await getFreePort();
  const server = startDevServer(root, port);
  const page = await browser.newPage({ viewport: { height: 720, width: 960 } });
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const assetResponses = new Map();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${
        request.failure()?.errorText ?? 'failed'
      }`,
    );
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400) {
      badResponses.push(`${response.status()} ${url}`);
    }
    for (const assetId of target.assetIds) {
      if (url.includes(`/iwsdk-assets/${assetId}/`)) {
        const statuses = assetResponses.get(assetId) ?? [];
        statuses.push(response.status());
        assetResponses.set(assetId, statuses);
      }
    }
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}/`;
    await waitForHttpOk(baseUrl, server);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(window.FRAMEWORK_MCP_RUNTIME),
      undefined,
      { timeout: 90000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('canvas').length > 0,
      undefined,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1000);

    const hierarchy = await dispatch(page, 'get_scene_hierarchy', {
      maxChildren: 100,
      maxDepth: 10,
    });
    const hierarchyNames = new Set(flattenHierarchyNames(hierarchy));
    for (const name of target.names) {
      if (!hierarchyNames.has(name)) {
        throw new Error(
          `runtime hierarchy missing "${name}"; found ${Array.from(
            hierarchyNames,
          )
            .slice(0, 20)
            .join(', ')}`,
        );
      }
    }

    for (const componentId of target.componentIds) {
      const result = await dispatch(page, 'ecs_find_entities', {
        limit: 20,
        withComponents: [componentId],
      });
      if (!isPositiveEntityResult(result)) {
        throw new Error(`no active entities found with ${componentId}`);
      }
    }

    for (const assetId of target.assetIds) {
      const statuses = assetResponses.get(assetId) ?? [];
      if (statuses.length === 0) {
        throw new Error(`no shared asset request observed for ${assetId}`);
      }
      const badStatus = statuses.find(
        (status) => status < 200 || status >= 300,
      );
      if (badStatus != null) {
        throw new Error(
          `shared asset ${assetId} returned HTTP ${badStatus}; statuses: ${statuses.join(
            ', ',
          )}`,
        );
      }
    }

    if (target.physicsStep) {
      await assertPhysicsStepMoves(page);
    }

    const screenshotStats = await getScreenshotStats(page);
    if (screenshotStats.uniqueColors < 8) {
      throw new Error(
        `screenshot appears blank: ${JSON.stringify(screenshotStats)}`,
      );
    }

    const relevantFailures = failedRequests.filter(
      (entry) =>
        !entry.includes('/favicon.ico') && !entry.includes('/.well-known/'),
    );
    if (relevantFailures.length > 0) {
      throw new Error(`request failures:\n${relevantFailures.join('\n')}`);
    }
    const relevantBadResponses = badResponses.filter(
      (entry) =>
        !entry.includes('/favicon.ico') && !entry.includes('/.well-known/'),
    );
    if (relevantBadResponses.length > 0) {
      throw new Error(
        `bad HTTP responses:\n${relevantBadResponses.join('\n')}`,
      );
    }
    const relevantPageErrors = pageErrors.filter(
      (entry) =>
        !entry.includes('Failed to load resource') ||
        relevantBadResponses.length > 0,
    );
    if (relevantPageErrors.length > 0) {
      throw new Error(`console/page errors:\n${relevantPageErrors.join('\n')}`);
    }
  } finally {
    await page.close();
    await server.close();
  }
}

async function assertPhysicsStepMoves(page) {
  const candidates = await dispatch(page, 'ecs_find_entities', {
    limit: 20,
    withComponents: ['PhysicsBody'],
  });
  if (!isPositiveEntityResult(candidates)) {
    throw new Error('no physics entity with PhysicsBody found');
  }

  const targetEntity =
    candidates.entities.find((entity) => entity.name === 'Plant') ??
    candidates.entities.find(
      (entity) => entity.name === 'One Hand Physics Robot',
    ) ??
    candidates.entities.find((entity) => entity.name !== 'Environment') ??
    candidates.entities[0];
  const entityIndex = targetEntity.entityIndex;
  const hierarchy = await dispatch(page, 'get_scene_hierarchy', {
    maxChildren: 100,
    maxDepth: 10,
  });
  const hierarchyNode = findHierarchyByEntityIndex(hierarchy, entityIndex);
  if (hierarchyNode == null) {
    throw new Error(
      `could not locate hierarchy node for entity ${entityIndex}`,
    );
  }

  await dispatch(page, 'ecs_pause', {});
  const before = await dispatch(page, 'get_object_transform', {
    uuid: hierarchyNode.uuid,
  });
  await dispatch(page, 'ecs_step', { count: 8, delta: 1 / 30 });
  const after = await dispatch(page, 'get_object_transform', {
    uuid: hierarchyNode.uuid,
  });
  await dispatch(page, 'ecs_resume', {});

  const distance = distanceBetween(before.globalPosition, after.globalPosition);
  if (distance < 0.0001) {
    throw new Error(
      `physics step did not move entity ${entityIndex}; before=${before.globalPosition.join(
        ',',
      )} after=${after.globalPosition.join(',')}`,
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

function findHierarchyByEntityIndex(node, entityIndex) {
  if (node.entityIndex === entityIndex) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findHierarchyByEntityIndex(child, entityIndex);
    if (found != null) {
      return found;
    }
  }
  return undefined;
}

function distanceBetween(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2],
  );
}

async function dispatch(page, method, params) {
  return page.evaluate(
    ({ method: runtimeMethod, params: runtimeParams }) =>
      window.FRAMEWORK_MCP_RUNTIME.dispatch(runtimeMethod, runtimeParams),
    { method, params },
  );
}

async function getScreenshotStats(page) {
  const screenshot = await page.screenshot({ type: 'png' });
  return page.evaluate(async (base64) => {
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
    const colors = new Set();
    const step = Math.max(4, Math.floor(data.length / 4000));
    let sampledPixels = 0;
    for (let index = 0; index < data.length; index += step - (step % 4)) {
      const color = `${data[index]},${data[index + 1]},${data[index + 2]},${
        data[index + 3]
      }`;
      colors.add(color);
      sampledPixels += 1;
      if (colors.size >= 32) {
        break;
      }
    }

    return { sampledPixels, uniqueColors: colors.size };
  }, screenshot.toString('base64'));
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

function findSystemChromium() {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
