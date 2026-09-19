#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchDevelopmentUrl,
  isExampleAssetRequest,
} from './development-url.mjs';
import { createPackedExampleAssetFixture } from './example-asset-package-fixture.mjs';

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
    componentIds: ['AudioSource', 'LocomotionEnvironment', 'RayInteractable'],
    id: 'audio',
    names: [
      'Environment',
      'Robot Center',
      'Robot Left',
      'Robot Right',
      'Welcome Panel',
    ],
    root: 'examples/audio',
  },
  {
    assetIds: ['environment-desk'],
    componentIds: ['AudioSource', 'LocomotionEnvironment', 'PhysicsBody'],
    id: 'browser-first',
    names: ['Environment', 'Physics Ball', 'Welcome Panel', 'Player Avatar'],
    root: 'examples/browser-first',
  },
  {
    assetIds: ['plant-sansevieria', 'robot'],
    componentIds: ['DepthOccludable', 'DistanceGrabbable', 'XRAnchor'],
    id: 'depth-occlusion',
    names: [
      'Soft Occlusion Sphere',
      'Occludable Plant',
      'Occludable Robot',
      'Welcome Panel',
    ],
    root: 'examples/depth-occlusion',
  },
  {
    assetIds: ['plant-sansevieria'],
    componentIds: ['EnvironmentRaycastTarget', 'RayInteractable'],
    id: 'environment-raycast',
    names: ['Plant Preview', 'Welcome Panel'],
    root: 'examples/environment-raycast',
  },
  {
    assetIds: ['environment-desk'],
    componentIds: [
      'DistanceGrabbable',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'RayInteractable',
      'TwoHandsGrabbable',
    ],
    id: 'grab',
    names: [
      'Earth',
      'Map Pin 1',
      'Two-Hand Grabbable Pyramid',
      'Welcome Panel',
    ],
    root: 'examples/grab',
  },
  {
    assetIds: [],
    componentIds: ['PokeInteractable', 'RayInteractable', 'ScreenSpace'],
    id: 'layers',
    names: ['Grid', 'Orb', 'Quad Layer Anchor', 'Welcome Panel'],
    root: 'examples/layers',
  },
  {
    assetIds: ['environment-desk'],
    componentIds: [
      'Elevator',
      'LocomotionEnvironment',
      'LocomotionSettingsPanel',
    ],
    id: 'locomotion',
    names: ['Environment', 'Elevator', 'Welcome Panel', 'Settings Panel'],
    root: 'examples/locomotion',
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
    names: ['Dynamic Sphere', 'Environment', 'Plant', 'One Hand Physics Robot'],
    physicsExpectation: {
      entityName: 'Dynamic Sphere',
      expectedRestingY: 0.95,
      initialPosition: [0.2, 1.6, -1.8],
      maximumAngularSpeed: 0.05,
      maximumLinearSpeed: 0.05,
      minimumFallDistance: 0.5,
      positionTolerance: 0.005,
      restingHeightTolerance: 0.1,
      rotationTolerance: 0.01,
      sceneNodeId: 'dynamic-sphere',
      settleChunkCount: 20,
      settleChunkSize: 6,
    },
    root: 'examples/physics',
  },
  {
    assetIds: ['environment-desk', 'robot'],
    componentIds: ['AudioSource', 'LocomotionEnvironment', 'Robot'],
    id: 'poke',
    names: ['Environment', 'Robot', 'Welcome Panel', 'WebXR Banner'],
    root: 'examples/poke',
  },
  {
    assetIds: [],
    componentIds: ['DistanceGrabbable', 'RayInteractable', 'XRAnchor'],
    id: 'scene-understanding',
    names: ['Anchor', 'Welcome Panel'],
    root: 'examples/scene-understanding',
  },
];

async function main() {
  const failures = [];
  let browser;
  let packedAssetFixture;

  try {
    packedAssetFixture = await createPackedExampleAssetFixture();
    browser = await launchChromium();

    for (const target of SMOKE_TARGETS) {
      try {
        await smokeTarget(browser, target, packedAssetFixture);
        console.log(`Native scene runtime smoke passed: ${target.id}`);
      } catch (error) {
        failures.push(
          `${target.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await browser?.close();
    await packedAssetFixture?.close();
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

async function smokeTarget(browser, target, packedAssetFixture) {
  const root = path.join(REPO_ROOT, target.root);
  if (target.physicsExpectation != null) {
    await assertAuthoredPhysicsNode(root, target.physicsExpectation);
  }
  const port = await getFreePort();
  const server = startDevServer(root, port, packedAssetFixture.baseUrl);
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    viewport: { height: 720, width: 960 },
  });
  const assetRoute = await packedAssetFixture.installRoute(page, {
    assetIds: target.assetIds,
  });
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
      if (isExampleAssetRequest(url, assetId)) {
        const statuses = assetResponses.get(assetId) ?? [];
        statuses.push(response.status());
        assetResponses.set(assetId, statuses);
      }
    }
  });

  try {
    const baseUrl = `https://127.0.0.1:${port}/`;
    await waitForHttpOk(baseUrl, server);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(
        () => Boolean(window.FRAMEWORK_MCP_RUNTIME),
        undefined,
        { timeout: 90000 },
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
          `console/page errors:\n${pageErrors.join('\n') || '(none)'}\n` +
          `server output:\n${server.output()}`,
      );
    }
    await page.waitForFunction(
      () => document.querySelectorAll('canvas').length > 0,
      undefined,
      { timeout: 30000 },
    );
    const hierarchy = await waitForHierarchyNames(page, target.names);
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
      if (!assetRoute.requests.some((request) => request.assetId === assetId)) {
        throw new Error(
          `packed CDN route did not fulfill a request for ${assetId}`,
        );
      }
    }

    if (target.physicsExpectation != null) {
      await assertPhysicsFallAndCollision(page, target.physicsExpectation);
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

async function assertPhysicsFallAndCollision(page, expectation) {
  const {
    entityName,
    expectedRestingY,
    initialPosition,
    maximumAngularSpeed,
    maximumLinearSpeed,
    minimumFallDistance,
    positionTolerance,
    restingHeightTolerance,
    rotationTolerance,
    settleChunkCount,
    settleChunkSize,
  } = expectation;
  const candidates = await dispatch(page, 'ecs_find_entities', {
    limit: 20,
    namePattern: entityName,
    withComponents: ['PhysicsBody', 'PhysicsShape', 'Visibility'],
  });
  if (!isPositiveEntityResult(candidates)) {
    throw new Error(
      `no visible physics entity named "${entityName}" with PhysicsBody and PhysicsShape found`,
    );
  }

  const targetEntity = candidates.entities.find(
    (entity) => entity.name === entityName,
  );
  if (targetEntity == null) {
    throw new Error(`could not find exact physics entity "${entityName}"`);
  }
  const entityIndex = targetEntity.entityIndex;
  const entityDetails = await dispatch(page, 'ecs_query_entity', {
    components: ['PhysicsBody', 'PhysicsShape'],
    entityIndex,
  });
  const physicsBody = entityDetails.components.find(
    (component) => component.componentId === 'PhysicsBody',
  );
  const physicsShape = entityDetails.components.find(
    (component) => component.componentId === 'PhysicsShape',
  );
  if (physicsBody?.values.state !== 'DYNAMIC') {
    throw new Error(
      `physics entity "${entityName}" is not dynamic; state=${physicsBody?.values.state}`,
    );
  }
  if (!(physicsBody.values._engineBody > 0)) {
    throw new Error(
      `physics entity "${entityName}" does not have an initialized Havok body`,
    );
  }
  if (physicsShape?.values.shape !== 'Sphere') {
    throw new Error(
      `physics entity "${entityName}" does not use a sphere collider; shape=${physicsShape?.values.shape}`,
    );
  }
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
  let current;
  let settledBody;
  let stableChunks = 0;
  let observedNegativeStep = false;
  let viewportState;
  try {
    await resetPhysicsBody(page, entityIndex, initialPosition);
    current = await dispatch(page, 'get_object_transform', {
      uuid: hierarchyNode.uuid,
    });
    for (let index = 0; index < settleChunkCount; index += 1) {
      await dispatch(page, 'ecs_step', {
        count: settleChunkSize,
        delta: 1 / 30,
      });
      const previous = current;
      current = await dispatch(page, 'get_object_transform', {
        uuid: hierarchyNode.uuid,
      });
      observedNegativeStep ||=
        current.globalPosition[1] - previous.globalPosition[1] < -0.0001;
      const positionDistance = distanceBetween(
        current.globalPosition,
        previous.globalPosition,
      );
      const rotationDistance = quaternionDistance(
        current.globalQuaternion,
        previous.globalQuaternion,
      );
      stableChunks =
        positionDistance <= positionTolerance &&
        rotationDistance <= rotationTolerance
          ? stableChunks + 1
          : 0;
      const fallDistance = initialPosition[1] - current.globalPosition[1];
      if (
        observedNegativeStep &&
        fallDistance >= minimumFallDistance &&
        stableChunks >= 2
      ) {
        break;
      }
    }
    const settledDetails = await dispatch(page, 'ecs_query_entity', {
      components: ['PhysicsBody'],
      entityIndex,
    });
    settledBody = settledDetails.components.find(
      (component) => component.componentId === 'PhysicsBody',
    );
    viewportState = await getObjectViewportState(page, hierarchyNode.uuid);
  } finally {
    await dispatch(page, 'ecs_resume', {});
  }

  if (!observedNegativeStep) {
    throw new Error(
      `physics entity "${entityName}" never moved downward during deterministic stepping`,
    );
  }
  const fallDistance = initialPosition[1] - current.globalPosition[1];
  if (fallDistance < minimumFallDistance) {
    throw new Error(
      `physics entity "${entityName}" did not fall from its authored height; initialY=${initialPosition[1]} final=${current.globalPosition.join(',')}`,
    );
  }
  if (stableChunks < 2) {
    throw new Error(
      `physics entity "${entityName}" did not settle after ${settleChunkCount * settleChunkSize} steps; final=${current.globalPosition.join(',')}`,
    );
  }
  if (
    Math.abs(current.globalPosition[1] - expectedRestingY) >
    restingHeightTolerance
  ) {
    throw new Error(
      `physics entity "${entityName}" missed the expected collision surface; expectedY=${expectedRestingY} final=${current.globalPosition.join(',')}`,
    );
  }

  const linearVelocity = settledBody?.values._linearVelocity;
  const angularVelocity = settledBody?.values._angularVelocity;
  const linearSpeed = vectorLength(linearVelocity);
  const angularSpeed = vectorLength(angularVelocity);
  if (linearSpeed == null || linearSpeed > maximumLinearSpeed) {
    throw new Error(
      `physics entity "${entityName}" retained linear velocity after settling; velocity=${JSON.stringify(linearVelocity)}`,
    );
  }
  if (angularSpeed == null || angularSpeed > maximumAngularSpeed) {
    throw new Error(
      `physics entity "${entityName}" retained angular velocity after settling; velocity=${JSON.stringify(angularVelocity)}`,
    );
  }

  if (
    viewportState == null ||
    !viewportState.visible ||
    viewportState.ndc.some(
      (coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 1,
    )
  ) {
    throw new Error(
      `physics entity "${entityName}" is outside the default desktop view; state=${JSON.stringify(viewportState)}`,
    );
  }
}

async function assertAuthoredPhysicsNode(root, expectation) {
  const scenePath = path.join(root, 'public/scenes/physics.iwsdk.scene.json');
  const scene = JSON.parse(await readFile(scenePath, 'utf8'));
  const node = findSceneNodeById(scene.nodes ?? [], expectation.sceneNodeId);
  if (node == null) {
    throw new Error(
      `native scene missing physics node "${expectation.sceneNodeId}"`,
    );
  }
  if (node.name !== expectation.entityName) {
    throw new Error(
      `physics node "${expectation.sceneNodeId}" must be named "${expectation.entityName}"; found "${node.name}"`,
    );
  }
  if (!vectorsEqual(node.transform?.position, expectation.initialPosition)) {
    throw new Error(
      `physics node "${expectation.sceneNodeId}" has unexpected spawn position; expected=${expectation.initialPosition.join(',')} found=${node.transform?.position?.join(',')}`,
    );
  }
}

async function resetPhysicsBody(page, entityIndex, position) {
  await page.evaluate(
    ({ targetEntityIndex, targetPosition }) => {
      const runtime = window.FRAMEWORK_MCP_RUNTIME;
      const world = runtime?.world;
      const entity = world?.entityManager?.getEntityByIndex(targetEntityIndex);
      const physicsSystem = world
        ?.getSystems()
        .find(
          (system) =>
            system.constructor.name === 'PhysicsSystem' &&
            typeof system.setBodyTransform === 'function',
        );
      if (entity?.object3D == null || physicsSystem == null) {
        throw new Error(
          `could not reset physics body for entity ${targetEntityIndex}`,
        );
      }
      physicsSystem.setBodyTransform(entity, {
        position: targetPosition,
        quaternion: entity.object3D.quaternion.toArray(),
      });
    },
    { targetEntityIndex: entityIndex, targetPosition: position },
  );
}

function findSceneNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findSceneNodeById(node.children ?? [], id);
    if (child != null) {
      return child;
    }
  }
  return undefined;
}

function vectorsEqual(first, second) {
  return (
    Array.isArray(first) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function distanceBetween(first, second) {
  return Math.hypot(...first.map((value, index) => value - second[index]));
}

function quaternionDistance(first, second) {
  const dot = Math.abs(
    first.reduce((sum, value, index) => sum + value * second[index], 0),
  );
  return 2 * Math.acos(Math.min(1, dot));
}

function vectorLength(value) {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  return Math.hypot(...value);
}

async function getObjectViewportState(page, uuid) {
  return page.evaluate((targetUuid) => {
    const runtime = window.FRAMEWORK_MCP_RUNTIME;
    const world = runtime?.world;
    const object = world?.scene?.getObjectByProperty('uuid', targetUuid);
    const camera = world?.camera;
    if (object == null || camera == null) {
      return null;
    }

    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const projected = object.getWorldPosition(camera.position.clone());
    projected.project(camera);
    let visible = true;
    for (let ancestor = object; ancestor != null; ancestor = ancestor.parent) {
      visible &&= ancestor.visible;
    }
    return { ndc: projected.toArray(), visible };
  }, uuid);
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

function startDevServer(cwd, port, stockAssetBaseUrl) {
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
        IWSDK_DEV_OPEN: 'false',
        NO_COLOR: '1',
        VITE_IWSDK_EXAMPLE_ASSET_BASE_URL: stockAssetBaseUrl,
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
      const response = await fetchDevelopmentUrl(url);
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
  return chromium.launch({
    args: ['--enable-webgl', '--use-angle=metal'],
    channel: 'chromium',
    headless: true,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
