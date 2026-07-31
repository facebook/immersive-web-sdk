/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SessionMode,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  UIKitMLAsset,
  World,
  XRCylinderLayer,
  XRQuadLayer,
} from '@iwsdk/core';
import assets from './assets.js';
import { configureWelcomePanel } from './panel.js';

// ---------------------------------------------------------------------------
// Helper: create a star Shape
// ---------------------------------------------------------------------------
function createStarShape(
  outerRadius: number,
  innerRadius: number,
  points: number,
): Shape {
  const shape = new Shape();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Helper: create a rounded rectangle Shape
// ---------------------------------------------------------------------------
function createRoundedRectShape(w: number, h: number, r: number): Shape {
  const hw = w / 2;
  const hh = h / 2;
  const shape = new Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

// ---------------------------------------------------------------------------
// Quad layer content – a star-shaped panel with a rotating cube
// ---------------------------------------------------------------------------

const quadScene = new Scene();
// No background color — transparent outside the star

const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
quadCamera.position.set(0, 0, 3);

const quadLight = new AmbientLight(0xffffff, 0.6);
quadScene.add(quadLight);
const quadDirLight = new DirectionalLight(0xffffff, 1);
quadDirLight.position.set(1, 2, 3);
quadScene.add(quadDirLight);

// Star-shaped background
const starShape = createStarShape(0.9, 0.4, 5);
const starBg = new Mesh(
  new ShapeGeometry(starShape),
  new MeshBasicMaterial({ color: 0x202040 }),
);
starBg.position.z = -0.1; // behind the cube
quadScene.add(starBg);

const cube = new Mesh(
  new BoxGeometry(0.4, 0.4, 0.4),
  new MeshStandardMaterial({ color: 0x4488ff }),
);
quadScene.add(cube);

// ---------------------------------------------------------------------------
// Cylinder layer content – rounded-corner panel with orbiting shapes
// ---------------------------------------------------------------------------

const cylScene = new Scene();
// No background color — transparent outside the rounded rect

const cylCamera = new OrthographicCamera(-2, 2, 1, -1, 0.1, 10);
cylCamera.position.set(0, 0, 3);

const cylLight = new AmbientLight(0xffffff, 0.6);
cylScene.add(cylLight);
const cylDirLight = new DirectionalLight(0xffffff, 1);
cylDirLight.position.set(-1, 2, 3);
cylScene.add(cylDirLight);

// Rounded rectangle background
const roundedRect = createRoundedRectShape(3.8, 1.8, 0.3);
const roundedBg = new Mesh(
  new ShapeGeometry(roundedRect),
  new MeshBasicMaterial({ color: 0x402020 }),
);
roundedBg.position.z = -0.1;
cylScene.add(roundedBg);

const torus = new Mesh(
  new TorusGeometry(0.3, 0.1, 16, 32),
  new MeshStandardMaterial({ color: 0xff4444 }),
);
cylScene.add(torus);

const sphere = new Mesh(
  new SphereGeometry(0.2, 16, 16),
  new MeshStandardMaterial({ color: 0x44ff44 }),
);
cylScene.add(sphere);

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  level: './scenes/layers.iwsdk.scene.json',
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { layers: true },
  },
  features: {
    spatialUI: true,
  },
}).then((world) => {
  world.camera.position.set(0, 1.5, 0);
  const orb = world.requireSceneObject<Mesh>('orb');

  configureWelcomePanel(
    world,
    world.requireSceneObject<UIKitMLAsset>('welcome-panel'),
  );

  const startTime = performance.now();

  // --- Quad layer: star-shaped floating panel ---
  const quadEntity = world.requireSceneEntity('quad-layer-anchor');
  quadEntity.addComponent(XRQuadLayer, {
    width: 1.0,
    height: 1.0,
    pixelWidth: 1024,
    pixelHeight: 1024,
    renderCallback: () => {
      const elapsed = (performance.now() - startTime) / 1000;
      quadEntity.object3D!.position.y = 1.5 + Math.sin(elapsed) * 0.2;
      orb.position.x = Math.cos(elapsed * 0.5) * 1;
      orb.position.y = 1.5 + Math.sin(elapsed * 0.5) * 1;
      cube.rotation.x = elapsed * 0.7;
      cube.rotation.y = elapsed;
      world.renderer.render(quadScene, quadCamera);
    },
  });

  // --- Cylinder layer: rounded-corner curved panel ---
  const cylEntity = world.requireSceneEntity('cylinder-layer-anchor');
  cylEntity.addComponent(XRCylinderLayer, {
    radius: 2.0,
    centralAngle: Math.PI / 3,
    aspectRatio: 2.0,
    pixelWidth: 1920,
    pixelHeight: 960,
    renderCallback: () => {
      const elapsed = (performance.now() - startTime) / 1000;
      torus.position.x = Math.cos(elapsed) * 0.8;
      torus.position.y = Math.sin(elapsed * 0.7) * 0.3;
      torus.rotation.x = elapsed * 1.2;
      sphere.position.x = Math.cos(elapsed + Math.PI) * 0.8;
      sphere.position.y = Math.sin(elapsed * 0.5 + 1) * 0.3;
      world.renderer.render(cylScene, cylCamera);
    },
  });
});
