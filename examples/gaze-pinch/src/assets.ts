/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  BoxGeometry,
  Color,
  defineAssets,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

const publicAssetUrl = (filePath: string) =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const DEFAULT_STOCK_ASSET_BASE =
  'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets';
const stockAssetBase = (
  import.meta.env.VITE_IWSDK_EXAMPLE_ASSET_BASE_URL?.trim() ||
  DEFAULT_STOCK_ASSET_BASE
).replace(/\/+$/u, '');
const stockAssetUrl = (assetId: string, fileName: string) =>
  `${stockAssetBase}/${assetId}/${fileName}`;

/** Card face colors, one per grid slot. */
const CARD_COLORS = [
  0xff5470, 0xfde74c, 0x9bc53d, 0x5bc0eb, 0xc3a8ff, 0xff9f1c,
] as const;

/**
 * Build one parentless card prototype. `defineAssets` accepts Object3D entries
 * as renderable prototypes, so the gaze targets need no files on disk — the
 * scene references them by id exactly like a glTF.
 *
 * Each card gets its own geometry and material: `AssetManager.instantiate`
 * clones the object graph but *shares* materials with the prototype, and
 * `GazeCardSystem` writes per-card emissive every frame.
 */
const gazeCard = (index: number): Mesh => {
  const card = new Mesh(
    new BoxGeometry(0.24, 0.24, 0.02),
    new MeshStandardMaterial({
      color: new Color(CARD_COLORS[index % CARD_COLORS.length]),
      emissive: new Color(0x000000),
      emissiveIntensity: 1,
      metalness: 0.1,
      roughness: 0.6,
    }),
  );
  card.name = `gaze-card-${index}`;
  return card;
};

/**
 * The gaze-grab target: a chunky cube the user can pull toward themselves by
 * looking at it and pinching, with no hand ray involved.
 */
const gazeCube = (): Mesh => {
  const cube = new Mesh(
    new BoxGeometry(0.18, 0.18, 0.18),
    new MeshStandardMaterial({
      color: new Color(0xff7a18),
      metalness: 0.2,
      roughness: 0.45,
    }),
  );
  cube.name = 'gaze-grab-cube';
  return cube;
};

const assets = defineAssets({
  'environment-desk': {
    name: 'Environment Desk',
    type: AssetType.GLTF,
    url: stockAssetUrl('environment-desk', 'environmentDesk.gltf'),
  },
  'gaze-card-0': gazeCard(0),
  'gaze-card-1': gazeCard(1),
  'gaze-card-2': gazeCard(2),
  'gaze-card-3': gazeCard(3),
  'gaze-card-4': gazeCard(4),
  'gaze-card-5': gazeCard(5),
  'gaze-grab-cube': gazeCube(),
  'gaze-welcome-panel': {
    name: 'Gaze Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
});

export default assets;
