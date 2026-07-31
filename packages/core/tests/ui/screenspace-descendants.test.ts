/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/index.js';
import type { ScenePointerDescendants } from '../../src/runtime/scene-pointer-descendants.js';
import { UIKitDocument } from '../../src/ui/document.js';
import { ScreenSpaceUISystem } from '../../src/ui/screenspace.js';
import { PanelDocument } from '../../src/ui/ui.js';

vi.hoisted(() => {
  (globalThis as any).document = {
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    createElement: () => ({
      appendChild: () => {},
      style: {},
    }),
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    getComputedStyle: (element: { style: Record<string, string> }) => ({
      height: element.style.height || '0',
      left: element.style.left || '0',
      top: element.style.top || '0',
      width: element.style.width || '0',
    }),
  };
});

function createScreenSpaceSystem({
  camera,
  entity,
  isPresenting = false,
  scene,
}: {
  camera: PerspectiveCamera;
  entity: any;
  isPresenting?: boolean;
  scene: Scene;
}) {
  const renderer = {
    domElement: {
      clientHeight: 720,
      clientWidth: 1280,
    },
    xr: {
      isPresenting,
    },
  };
  const world = {
    camera,
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer,
    scene,
    visibilityState: { value: 'non-immersive' },
  };
  const system = new ScreenSpaceUISystem(world as any, {} as any, 0);
  system.queries = {
    panels: {
      entities: new Set([entity]),
    },
  } as any;
  return { renderer, system };
}

function createDocument() {
  const document = new Object3D() as any;
  Object.defineProperty(document, 'computedSize', {
    get: () => null,
  });
  document.setTargetDimensions = () => {};
  document.clearTargetDimensions = () => {};
  return document as Object3D;
}

function createResizableDocument(width: number, height: number) {
  const document = new Object3D() as any;
  let computedSize = { width, height };
  Object.defineProperty(document, 'computedSize', {
    get: () => computedSize,
  });
  document.setTargetDimensions = vi.fn(
    (targetWidth: number, targetHeight: number) => {
      const scale = Math.min(
        targetWidth / (computedSize.width / 100),
        targetHeight / (computedSize.height / 100),
      );
      document.scale.setScalar(scale);
    },
  );
  document.clearTargetDimensions = vi.fn(() => document.scale.setScalar(1));
  return {
    document: document as Object3D,
    resize(nextWidth: number, nextHeight: number) {
      computedSize = { width: nextWidth, height: nextHeight };
    },
  };
}

describe('ScreenSpaceUISystem screen-space descendants', () => {
  beforeEach(() => {
    // PanelDocument is an ECS component with flat per-entity storage; these
    // tests inject the loaded document directly to isolate ScreenSpaceUISystem.
    (PanelDocument.data as any).document = [];
  });

  it('publishes documents moved under the camera', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const document = createDocument();
    entityObject.add(document);

    const entity = {
      index: 0,
      object3D: entityObject,
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { system } = createScreenSpaceSystem({ camera, entity, scene });

    system.update();

    expect(document.parent).toBe(camera);
    expect(scene.screenSpaceDescendants).toEqual([document]);
  });

  it('clears screen-space descendants after returning documents to world space', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const document = createDocument();
    entityObject.add(document);

    const entity = {
      index: 0,
      object3D: entityObject,
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { renderer, system } = createScreenSpaceSystem({
      camera,
      entity,
      scene,
    });

    system.update();
    renderer.xr.isPresenting = true;
    system.update();

    expect(document.parent).toBe(entityObject);
    expect(scene.screenSpaceDescendants).toBeUndefined();
  });

  it('repositions a screen-space panel when its intrinsic UIKit size settles', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const { document, resize } = createResizableDocument(100, 50);
    entityObject.add(document);

    const values = {
      width: '100px',
      height: '100px',
      top: '20px',
      bottom: 'auto',
      left: '20px',
      right: 'auto',
      zOffset: 0.2,
    };
    const entity = {
      index: 0,
      object3D: entityObject,
      getValue: (_component: unknown, key: keyof typeof values) => values[key],
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { system } = createScreenSpaceSystem({ camera, entity, scene });

    system.update();
    const initialY = document.position.y;
    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(1);

    resize(100, 100);
    system.update();

    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(2);
    expect(document.position.y).not.toBe(initialY);

    system.update();
    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(2);
  });

  it('relayouts after the browser camera projection is restored following XR exit', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera(90, 1280 / 720);
    const entityObject = new Object3D();
    const { document } = createResizableDocument(100, 100);
    entityObject.add(document);

    const values = {
      width: '100px',
      height: '100px',
      top: '20px',
      bottom: 'auto',
      left: '20px',
      right: 'auto',
      zOffset: 0.2,
    };
    const entity = {
      index: 0,
      object3D: entityObject,
      getValue: (_component: unknown, key: keyof typeof values) => values[key],
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { renderer, system } = createScreenSpaceSystem({
      camera,
      entity,
      isPresenting: true,
      scene,
    });

    // Capture the XR projection while the panel remains in world space.
    system.update();
    expect(document.parent).toBe(entityObject);

    // The first non-XR frame can precede the deferred browser-camera restore.
    renderer.xr.isPresenting = false;
    system.update();
    const xrProjectionScale = document.scale.x;
    const xrProjectionPosition = document.position.clone();
    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(1);

    // Camera restoration does not emit a window resize event. The changed
    // projection itself must invalidate the stale screen-space layout.
    camera.fov = 50;
    camera.updateProjectionMatrix();
    system.update();

    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(2);
    expect(document.scale.x).toBeLessThan(xrProjectionScale);
    expect(document.position.equals(xrProjectionPosition)).toBe(false);

    // Stable inputs must not cause needless relayout on every frame.
    system.update();
    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(2);
  });

  it('lays out a manifest-backed UIKit document without PanelDocument', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const { document } = createResizableDocument(100, 50);
    Object.setPrototypeOf(document, UIKitDocument.prototype);
    entityObject.add(document);

    const values = {
      width: '100px',
      height: '100px',
      top: '20px',
      bottom: 'auto',
      left: '20px',
      right: 'auto',
      zOffset: 0.2,
    };
    const entity = {
      index: 0,
      object3D: entityObject,
      getValue: (_component: unknown, key: keyof typeof values) => values[key],
    };
    const { system } = createScreenSpaceSystem({ camera, entity, scene });

    system.update();

    expect(document.parent).toBe(camera);
    expect((document as any).setTargetDimensions).toHaveBeenCalledTimes(1);
    expect(scene.screenSpaceDescendants).toEqual([document]);
  });
});
