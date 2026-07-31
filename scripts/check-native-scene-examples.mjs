#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SCENE_COMPOSITION_DIST = path.join(
  REPO_ROOT,
  'packages/scene-composition/dist/index.js',
);
const EXAMPLE_ASSETS_DIST = path.join(
  REPO_ROOT,
  'packages/example-assets/dist/index.js',
);

const MIGRATED_SCENES = [
  {
    assetIds: ['environment-desk', 'robot'],
    components: [
      'AudioSource',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'RayInteractable',
      'ScreenSpace',
      'Spinner',
    ],
    id: 'audio',
    componentManifest: './src/components.ts',
    scene: 'examples/audio/public/scenes/audio.iwsdk.scene.json',
    source: 'examples/audio/src/index.ts',
    sourceLevelText: './scenes/audio.iwsdk.scene.json',
    viteConfig: 'examples/audio/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    components: [
      'AudioSource',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'PhysicsBody',
      'PhysicsShape',
      'RayInteractable',
    ],
    id: 'browser-first',
    scene:
      'examples/browser-first/public/scenes/browser-first.iwsdk.scene.json',
    source: 'examples/browser-first/src/index.ts',
    sourceLevelText: './scenes/browser-first.iwsdk.scene.json',
    viteConfig: 'examples/browser-first/vite.config.ts',
  },
  {
    assetIds: ['plant-sansevieria', 'robot'],
    components: [
      'DepthOccludable',
      'DistanceGrabbable',
      'IBLGradient',
      'PokeInteractable',
      'RayInteractable',
      'ScreenSpace',
      'XRAnchor',
    ],
    id: 'depth-occlusion',
    scene:
      'examples/depth-occlusion/public/scenes/depth-occlusion.iwsdk.scene.json',
    source: 'examples/depth-occlusion/src/index.ts',
    sourceLevelText: './scenes/depth-occlusion.iwsdk.scene.json',
    viteConfig: 'examples/depth-occlusion/vite.config.ts',
  },
  {
    assetIds: ['plant-sansevieria'],
    components: [
      'EnvironmentRaycastTarget',
      'IBLGradient',
      'RayInteractable',
      'ScreenSpace',
    ],
    id: 'environment-raycast',
    scene:
      'examples/environment-raycast/public/scenes/environment-raycast.iwsdk.scene.json',
    source: 'examples/environment-raycast/src/index.ts',
    sourceLevelText: './scenes/environment-raycast.iwsdk.scene.json',
    viteConfig: 'examples/environment-raycast/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    components: [
      'DistanceGrabbable',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'RayInteractable',
      'TwoHandsGrabbable',
    ],
    id: 'grab',
    scene: 'examples/grab/public/scenes/grab.iwsdk.scene.json',
    source: 'examples/grab/src/index.ts',
    sourceLevelText: './scenes/grab.iwsdk.scene.json',
    viteConfig: 'examples/grab/vite.config.ts',
  },
  {
    assetIds: [],
    components: ['DomeGradient', 'IBLGradient'],
    id: 'layers',
    scene: 'examples/layers/public/scenes/layers.iwsdk.scene.json',
    source: 'examples/layers/src/index.ts',
    sourceLevelText: './scenes/layers.iwsdk.scene.json',
    viteConfig: 'examples/layers/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    components: [
      'AudioSource',
      'DomeGradient',
      'Elevator',
      'IBLGradient',
      'LocomotionEnvironment',
      'LocomotionSettingsPanel',
      'PokeInteractable',
      'RayInteractable',
      'ScreenSpace',
    ],
    id: 'locomotion',
    componentManifest: './src/components.ts',
    scene: 'examples/locomotion/public/scenes/locomotion.iwsdk.scene.json',
    source: 'examples/locomotion/src/index.ts',
    sourceLevelText: './scenes/locomotion.iwsdk.scene.json',
    viteConfig: 'examples/locomotion/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    components: [
      'DistanceGrabbable',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'OneHandGrabbable',
      'PhysicsBody',
      'PhysicsShape',
      'RayInteractable',
    ],
    id: 'physics',
    scene: 'examples/physics/public/scenes/physics.iwsdk.scene.json',
    source: 'examples/physics/src/index.ts',
    sourceLevelText: './scenes/physics.iwsdk.scene.json',
    viteConfig: 'examples/physics/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'robot'],
    components: [
      'AudioSource',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'PokeInteractable',
      'RayInteractable',
      'Robot',
      'ScreenSpace',
    ],
    id: 'poke',
    componentManifest: './src/components.ts',
    scene: 'examples/poke/public/scenes/poke.iwsdk.scene.json',
    source: 'examples/poke/src/index.ts',
    sourceLevelText: './scenes/poke.iwsdk.scene.json',
    viteConfig: 'examples/poke/vite.config.ts',
  },
  {
    assetIds: [],
    components: [
      'DistanceGrabbable',
      'DomeTexture',
      'IBLTexture',
      'PokeInteractable',
      'RayInteractable',
      'ScreenSpace',
      'XRAnchor',
    ],
    id: 'scene-understanding',
    scene:
      'examples/scene-understanding/public/scenes/scene-understanding.iwsdk.scene.json',
    source: 'examples/scene-understanding/src/index.ts',
    sourceLevelText: './scenes/scene-understanding.iwsdk.scene.json',
    viteConfig: 'examples/scene-understanding/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    components: [
      'AudioSource',
      'DistanceGrabbable',
      'DomeGradient',
      'IBLGradient',
      'LocomotionEnvironment',
      'RayInteractable',
      'Robot',
      'ScreenSpace',
    ],
    id: 'starter-vr',
    componentManifest: './src/components.ts',
    manifestAssetIds: ['welcome-panel'],
    scene:
      'packages/starter-assets/starter-template/public/scenes/vr.iwsdk.scene.json',
    source: 'packages/starter-assets/starter-template/src/index.template.ts',
    sourceLevelText: './scenes/vr.iwsdk.scene.json',
    viteConfig:
      'packages/starter-assets/starter-template/vite.config.template.ts',
  },
  {
    assetIds: ['plant-sansevieria', 'robot'],
    components: [
      'AudioSource',
      'DistanceGrabbable',
      'DomeGradient',
      'IBLGradient',
      'RayInteractable',
      'Robot',
      'ScreenSpace',
    ],
    id: 'starter-ar',
    componentManifest: './src/components.ts',
    manifestAssetIds: ['welcome-panel'],
    scene:
      'packages/starter-assets/starter-template/public/scenes/ar.iwsdk.scene.json',
    source: 'packages/starter-assets/starter-template/src/index.template.ts',
    sourceLevelText: './scenes/ar.iwsdk.scene.json',
    viteConfig:
      'packages/starter-assets/starter-template/vite.config.template.ts',
  },
];

const SHARED_ASSET_VITE_CONFIGS = [
  {
    assetIds: ['environment-desk', 'robot'],
    file: 'examples/audio/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    file: 'examples/browser-first/vite.config.ts',
  },
  {
    assetIds: ['plant-sansevieria', 'robot'],
    file: 'examples/depth-occlusion/vite.config.ts',
  },
  {
    assetIds: ['plant-sansevieria'],
    file: 'examples/environment-raycast/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    file: 'examples/grab/vite.config.ts',
  },
  {
    assetIds: ['environment-desk'],
    file: 'examples/locomotion/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    file: 'examples/physics/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'robot'],
    file: 'examples/poke/vite.config.ts',
  },
  {
    assetIds: ['environment-desk', 'plant-sansevieria', 'robot'],
    file: 'packages/starter-assets/starter-template/vite.config.template.ts',
  },
];

const LEGACY_DUPLICATE_ASSET_DIRS = [
  'environmentDesk',
  'plantSansevieria',
  'robot',
];
const REMOVED_AUTHORED_DIR_NAME = ['meta', 'spatial'].join('');
const REMOVED_AUTHORED_DIRS = [
  `examples/audio/${REMOVED_AUTHORED_DIR_NAME}`,
  `examples/grab/${REMOVED_AUTHORED_DIR_NAME}`,
  `examples/physics/${REMOVED_AUTHORED_DIR_NAME}`,
  `packages/starter-assets/starter-template/${REMOVED_AUTHORED_DIR_NAME}-vr`,
  `packages/starter-assets/starter-template/${REMOVED_AUTHORED_DIR_NAME}-ar`,
];
const GENERATED_STARTER_ASSET_DIR = 'packages/starter-assets/dist/assets';

function readRelative(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return existsSync(path.join(REPO_ROOT, relativePath));
}

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [
    node,
    ...flattenNodes(Array.isArray(node.children) ? node.children : []),
  ]);
}

function setDifference(expected, actual) {
  return expected.filter((entry) => !actual.has(entry));
}

async function loadBuiltModule(modulePath, label) {
  if (!existsSync(modulePath)) {
    throw new Error(
      `${label} build output is missing at ${modulePath}. Run the package build before this check.`,
    );
  }

  return import(pathToFileURL(modulePath).href);
}

function assertViteConfigUsesAssets(failures, file, assetIds) {
  const text = readRelative(file);
  if (!text.includes('iwsdkExampleAssets')) {
    failures.push(`${file} does not configure iwsdkExampleAssets`);
  }

  for (const assetId of assetIds) {
    if (!text.includes(assetId)) {
      failures.push(`${file} does not request shared asset "${assetId}"`);
    }
  }
}

function assertManifestLocalAssetFiles(failures, sceneTarget) {
  const sourceMarker = '/src/';
  const markerIndex = sceneTarget.source.indexOf(sourceMarker);
  if (markerIndex < 0) {
    failures.push(
      `${sceneTarget.source} is not under an app src directory; cannot resolve its asset manifest`,
    );
    return;
  }

  const appRoot = sceneTarget.source.slice(0, markerIndex);
  const manifestPath = [
    `${appRoot}/src/assets.ts`,
    `${appRoot}/src/assets.template.ts`,
  ].find(fileExists);
  if (manifestPath == null) {
    failures.push(`asset manifest is missing under ${appRoot}/src`);
    return;
  }

  const manifestText = readRelative(manifestPath);
  for (const assetId of sceneTarget.manifestAssetIds ?? []) {
    if (
      !manifestText.includes(`'${assetId}'`) &&
      !manifestText.includes(`"${assetId}"`)
    ) {
      failures.push(
        `${manifestPath} does not declare required manifest asset "${assetId}"`,
      );
    }
  }
  const urlPattern = /\burl:\s*(['"])([^'"]+)\1/g;
  for (const match of manifestText.matchAll(urlPattern)) {
    const url = match[2];
    if (
      url.startsWith('/iwsdk-assets/') ||
      (!url.startsWith('/') && !url.startsWith('./'))
    ) {
      continue;
    }

    const publicPath = path.posix.join(
      appRoot,
      'public',
      url.replace(/^\.\//, '').replace(/^\//, ''),
    );
    if (!fileExists(publicPath)) {
      failures.push(
        `${manifestPath} references missing local asset "${url}" (${publicPath})`,
      );
    }
  }
}

function assertNoRemovedSourceDirs(failures) {
  for (const relativePath of REMOVED_AUTHORED_DIRS) {
    if (fileExists(relativePath)) {
      failures.push(
        `removed authored scene directory still exists: ${relativePath}`,
      );
    }
  }

  const sourceRoots = [
    'examples/audio',
    'examples/browser-first',
    'examples/depth-occlusion',
    'examples/environment-raycast',
    'examples/grab',
    'examples/locomotion',
    'examples/physics',
    'examples/poke',
    'packages/starter-assets/starter-template',
  ];

  for (const root of sourceRoots) {
    for (const assetDir of LEGACY_DUPLICATE_ASSET_DIRS) {
      const duplicatePath = `${root}/public/gltf/${assetDir}`;
      if (fileExists(duplicatePath)) {
        failures.push(
          `duplicate public asset directory remains: ${duplicatePath}`,
        );
      }
    }
  }
}

function assertGeneratedStarterScenes({
  catalogById,
  failures,
  validateSceneDocument,
}) {
  if (!fileExists(GENERATED_STARTER_ASSET_DIR)) {
    failures.push(
      `${GENERATED_STARTER_ASSET_DIR} is missing; run @iwsdk/starter-assets build before checking generated starters`,
    );
    return 0;
  }

  const generatedScenes = readdirSync(
    path.join(REPO_ROOT, GENERATED_STARTER_ASSET_DIR),
  )
    .filter((file) => file.endsWith('.iwsdk.scene.json'))
    .sort();
  const expectedSuffixes = [
    '-ar.iwsdk.scene.json',
    '-browser.iwsdk.scene.json',
    '-vr.iwsdk.scene.json',
  ];

  for (const suffix of expectedSuffixes) {
    if (!generatedScenes.some((file) => file.endsWith(suffix))) {
      failures.push(
        `${GENERATED_STARTER_ASSET_DIR} is missing a generated ${suffix.slice(
          1,
        )} starter scene`,
      );
    }
  }

  for (const file of generatedScenes) {
    const hasWelcomePanel =
      file.endsWith('-ar.iwsdk.scene.json') ||
      file.endsWith('-vr.iwsdk.scene.json');
    const catalogAssetIds = file.endsWith('-ar.iwsdk.scene.json')
      ? ['plant-sansevieria', 'robot']
      : file.endsWith('-vr.iwsdk.scene.json')
        ? ['environment-desk', 'plant-sansevieria', 'robot']
        : [];
    const document = assertSceneDocument({
      catalogById,
      catalogAssetIds,
      expectedAssetIds: [
        ...catalogAssetIds,
        ...(hasWelcomePanel ? ['welcome-panel'] : []),
      ],
      failures,
      relativePath: `${GENERATED_STARTER_ASSET_DIR}/${file}`,
      validateSceneDocument,
    });
    if (document != null) {
      const rootComponents = new Set(
        Object.keys(document.components ?? {}).map((componentId) =>
          componentId.split('.').at(-1),
        ),
      );
      for (const component of ['DomeGradient', 'IBLGradient']) {
        if (!rootComponents.has(component)) {
          failures.push(
            `${GENERATED_STARTER_ASSET_DIR}/${file} must explicitly author ${component} on the level root`,
          );
        }
      }
    }
  }

  return generatedScenes.length;
}

function assertSceneDocument({
  catalogById,
  catalogAssetIds = expectedAssetIds,
  expectedAssetIds,
  failures,
  relativePath,
  validateSceneDocument,
}) {
  if (!fileExists(relativePath)) {
    failures.push(`scene file is missing: ${relativePath}`);
    return undefined;
  }

  const document = JSON.parse(readRelative(relativePath));
  const validation = validateSceneDocument(document);
  if (!validation.valid) {
    for (const issue of validation.issues) {
      failures.push(`${relativePath}${issue.path}: ${issue.message}`);
    }
  }

  if (document.resources?.assets != null) {
    failures.push(
      `${relativePath} still embeds obsolete resources.assets metadata`,
    );
  }

  const referencedAssetIds = new Set(
    flattenNodes(document.nodes ?? [])
      .filter((node) => node.content?.type === 'asset')
      .map((node) => node.content.asset),
  );
  const missingAssets = setDifference(expectedAssetIds, referencedAssetIds);
  for (const assetId of missingAssets) {
    failures.push(`${relativePath} does not reference asset "${assetId}"`);
  }

  for (const assetId of catalogAssetIds) {
    const catalogAsset = catalogById.get(assetId);
    if (catalogAsset == null) {
      failures.push(
        `${relativePath} expects unknown shared catalog asset "${assetId}"`,
      );
      continue;
    }

    if (catalogAsset.bounds == null) {
      failures.push(`catalog asset "${assetId}" is missing bounds metadata`);
    }
  }

  return document;
}

function assertMigratedScene({
  catalogById,
  failures,
  sceneTarget,
  validateSceneDocument,
}) {
  const document = assertSceneDocument({
    catalogById,
    catalogAssetIds: sceneTarget.assetIds,
    expectedAssetIds: [
      ...sceneTarget.assetIds,
      ...(sceneTarget.manifestAssetIds ?? []),
    ],
    failures,
    relativePath: sceneTarget.scene,
    validateSceneDocument,
  });
  if (document == null) {
    return;
  }

  assertManifestLocalAssetFiles(failures, sceneTarget);

  const nodes = flattenNodes(document.nodes ?? []);
  const componentNames = new Set(
    [
      ...Object.keys(document.components ?? {}),
      ...nodes.flatMap((node) => Object.keys(node.components ?? {})),
    ].map((componentId) => componentId.split('.').at(-1)),
  );
  for (const component of sceneTarget.components) {
    if (!componentNames.has(component)) {
      failures.push(
        `${sceneTarget.scene} is missing required component "${component}"`,
      );
    }
  }

  const sourceText = readRelative(sceneTarget.source);
  if (!sourceText.includes(sceneTarget.sourceLevelText)) {
    failures.push(
      `${sceneTarget.source} does not load ${sceneTarget.sourceLevelText}`,
    );
  }

  if (!sourceText.includes("from './assets.js'")) {
    failures.push(
      `${sceneTarget.source} does not import the shared runtime/editor asset manifest`,
    );
  }

  const viteConfigText = readRelative(sceneTarget.viteConfig);
  if (!viteConfigText.includes("assetManifest: './src/assets.ts'")) {
    failures.push(
      `${sceneTarget.viteConfig} does not expose ./src/assets.ts to the editor`,
    );
  }
  if (
    sceneTarget.componentManifest != null &&
    !viteConfigText.includes(
      `componentManifest: '${sceneTarget.componentManifest}'`,
    )
  ) {
    failures.push(
      `${sceneTarget.viteConfig} does not expose ${sceneTarget.componentManifest} to the editor`,
    );
  }

  if (sceneTarget.assetIds.length > 0) {
    assertViteConfigUsesAssets(
      failures,
      sceneTarget.viteConfig,
      sceneTarget.assetIds,
    );
  }
}

async function main() {
  const { validateSceneDocument } = await loadBuiltModule(
    SCENE_COMPOSITION_DIST,
    '@iwsdk/scene-composition',
  );
  const { EXAMPLE_ASSET_CATALOG } = await loadBuiltModule(
    EXAMPLE_ASSETS_DIST,
    '@iwsdk/example-assets',
  );
  const catalogById = new Map(
    EXAMPLE_ASSET_CATALOG.map((asset) => [asset.id, asset]),
  );
  const failures = [];

  for (const sceneTarget of MIGRATED_SCENES) {
    assertMigratedScene({
      catalogById,
      failures,
      sceneTarget,
      validateSceneDocument,
    });
  }

  for (const config of SHARED_ASSET_VITE_CONFIGS) {
    assertViteConfigUsesAssets(failures, config.file, config.assetIds);
  }

  const generatedStarterSceneCount = assertGeneratedStarterScenes({
    catalogById,
    failures,
    validateSceneDocument,
  });
  assertNoRemovedSourceDirs(failures);

  if (failures.length > 0) {
    console.error('Native scene example migration check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Native scene example migration check passed: ${MIGRATED_SCENES.length} source scene files, ${generatedStarterSceneCount} generated starter scene files, and ${SHARED_ASSET_VITE_CONFIGS.length} shared asset configs are valid.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
