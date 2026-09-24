/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetType,
  BoxGeometry,
  CylinderGeometry,
  Color,
  defineAssets,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from '@iwsdk/core';
import { CUBE_THEMES } from './theme.js';

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

/** Accent colors, one per target in the interaction field. */
const CARD_ACCENTS = [
  0xff5470, 0xfde74c, 0x9bc53d, 0x5bc0eb, 0xc3a8ff, 0xff9f1c,
] as const;

const CARD_SURFACES = [
  0x3a1824, 0x3a3216, 0x1c351f, 0x173344, 0x2c2545, 0x3c2613,
] as const;

const CARD_BODY_GEOMETRY = new BoxGeometry(0.29, 0.21, 0.025);
const CARD_FACE_GEOMETRY = new PlaneGeometry(0.264, 0.184);
const CARD_RAIL_GEOMETRY = new BoxGeometry(0.19, 0.012, 0.006);
const CARD_MARK_GEOMETRY = new TorusGeometry(0.026, 0.004, 8, 32);

/**
 * Build one parentless card prototype. `defineAssets` accepts Object3D entries
 * as renderable prototypes, so the gaze targets need no files on disk — the
 * scene references them by id exactly like a glTF.
 *
 * The cards share immutable geometry. `AssetManager.instantiate` clones the
 * object graph but shares materials with the prototype, so `GazeCardSystem`
 * clones the three animated surface materials per instance before writing
 * their emissive intensity.
 */
const gazeCard = (index: number): Group => {
  const accent = new Color(CARD_ACCENTS[index % CARD_ACCENTS.length]);
  const card = new Group();
  card.name = `gaze-card-${index}`;

  const body = new Mesh(
    CARD_BODY_GEOMETRY,
    new MeshStandardMaterial({
      color: new Color(0x10131b),
      metalness: 0.45,
      roughness: 0.32,
    }),
  );
  body.name = 'gaze-card-frame';

  const face = new Mesh(
    CARD_FACE_GEOMETRY,
    new MeshStandardMaterial({
      color: new Color(CARD_SURFACES[index % CARD_SURFACES.length]),
      emissive: accent,
      emissiveIntensity: 0.04,
      metalness: 0.08,
      roughness: 0.5,
    }),
  );
  face.name = 'gaze-card-face';
  face.position.z = 0.013;

  const rail = new Mesh(
    CARD_RAIL_GEOMETRY,
    new MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.36),
      emissive: accent,
      emissiveIntensity: 0.04,
      metalness: 0.15,
      roughness: 0.48,
    }),
  );
  rail.name = 'gaze-card-accent';
  rail.position.set(0, -0.064, 0.018);

  const mark = new Mesh(
    CARD_MARK_GEOMETRY,
    new MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.36),
      emissive: accent,
      emissiveIntensity: 0.04,
      metalness: 0.15,
      roughness: 0.48,
    }),
  );
  mark.name = 'gaze-card-mark';
  mark.position.set(0, 0.026, 0.019);

  card.add(body, face, rail, mark);
  return card;
};

/**
 * The gaze-grab target: a chunky cube the user can pull toward themselves by
 * looking at it and pinching, with no hand ray involved.
 */
const gazeCube = (): Group => {
  const theme = CUBE_THEMES[0];
  const cube = new Group();
  cube.name = 'gaze-grab-cube';

  const core = new Mesh(
    new BoxGeometry(0.18, 0.18, 0.18),
    new MeshStandardMaterial({
      color: new Color(theme.core),
      emissive: new Color(theme.emissive),
      emissiveIntensity: 0.08,
      metalness: 0.48,
      roughness: 0.24,
    }),
  );
  core.name = 'gaze-cube-core';

  const cage = new LineSegments(
    new EdgesGeometry(new BoxGeometry(0.202, 0.202, 0.202)),
    new LineBasicMaterial({
      color: new Color(theme.accent),
      transparent: true,
      opacity: 0.22,
    }),
  );
  cage.name = 'gaze-cube-cage';

  const halo = new Mesh(
    new TorusGeometry(0.15, 0.006, 8, 64, Math.PI * 1.55),
    new MeshBasicMaterial({
      color: new Color(theme.accent),
      depthWrite: false,
      opacity: 0,
      transparent: true,
    }),
  );
  halo.name = 'gaze-cube-halo';
  halo.position.z = 0.12;
  halo.visible = false;

  cube.add(core, cage, halo);
  return cube;
};

/** A restrained spatial frame that keeps attention on the interaction demos. */
const gazeStage = (): Group => {
  const stage = new Group();
  stage.name = 'gaze-stage';
  const plinthMaterial = new MeshStandardMaterial({
    color: new Color(0x111722),
    emissive: new Color(0x07101f),
    emissiveIntensity: 0.45,
    metalness: 0.55,
    roughness: 0.35,
  });
  const plinthRingMaterial = new MeshBasicMaterial({
    color: new Color(0x5bc0eb),
    opacity: 0.28,
    transparent: true,
  });

  const cardPlinth = new Mesh(
    new CylinderGeometry(0.34, 0.42, 0.08, 64),
    plinthMaterial,
  );
  cardPlinth.name = 'gaze-stage-card-plinth';
  cardPlinth.position.set(0, -0.091, -0.4);

  const cardPlinthRing = new Mesh(
    new TorusGeometry(0.32, 0.008, 8, 72),
    plinthRingMaterial,
  );
  cardPlinthRing.name = 'gaze-stage-card-plinth-ring';
  cardPlinthRing.rotation.x = Math.PI / 2;
  cardPlinthRing.position.set(0, -0.046, -0.4);

  const cubePlinth = new Mesh(
    new CylinderGeometry(0.2, 0.27, 0.07, 64),
    plinthMaterial,
  );
  cubePlinth.name = 'gaze-stage-cube-plinth';
  cubePlinth.position.set(0.88, -0.096, -0.32);

  const cubePlinthRing = new Mesh(
    new TorusGeometry(0.19, 0.007, 8, 64),
    plinthRingMaterial,
  );
  cubePlinthRing.name = 'gaze-stage-cube-plinth-ring';
  cubePlinthRing.rotation.x = Math.PI / 2;
  cubePlinthRing.position.set(0.88, -0.056, -0.32);

  const targetField = new Mesh(
    new TorusGeometry(0.54, 0.007, 8, 72, Math.PI),
    new MeshBasicMaterial({
      color: new Color(0x2d7ff9),
      depthWrite: false,
      opacity: 0.24,
      transparent: true,
    }),
  );
  targetField.name = 'gaze-stage-target-field';
  targetField.position.set(0, 0.34, -0.15);

  const leftPost = new Mesh(
    new BoxGeometry(0.014, 0.471, 0.014),
    new MeshBasicMaterial({
      color: new Color(0x2d7ff9),
      depthWrite: false,
      opacity: 0.24,
      transparent: true,
    }),
  );
  leftPost.name = 'gaze-stage-left-post';
  leftPost.position.set(-0.54, 0.1045, -0.15);
  const rightPost = leftPost.clone();
  rightPost.name = 'gaze-stage-right-post';
  rightPost.position.x = 0.54;

  stage.add(
    cardPlinth,
    cardPlinthRing,
    cubePlinth,
    cubePlinthRing,
    targetField,
    leftPost,
    rightPost,
  );
  return stage;
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
  'gaze-stage': gazeStage(),
  'gaze-welcome-panel': {
    name: 'Gaze Welcome Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/welcome.uikitml'),
  },
});

export default assets;
