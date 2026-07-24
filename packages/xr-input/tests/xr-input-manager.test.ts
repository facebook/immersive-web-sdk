/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Group,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  WebXRManager,
} from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InputLayout } from '../src/gamepad/input-profiles.js';
import type { XRAssetLoader } from '../src/xr-input-manager.js';

type XRInputManagerConstructor =
  typeof import('../src/xr-input-manager.js').XRInputManager;
type XRInputManagerInstance = InstanceType<XRInputManagerConstructor>;
type XRHandVisualAdapterConstructor =
  typeof import('../src/visual/adapter/hand-visual-adapter.js').XRHandVisualAdapter;

let XRInputManager: XRInputManagerConstructor;
let XRHandVisualAdapter: XRHandVisualAdapterConstructor;
let InteractorState: typeof import('../src/pointer/multi-pointer.js').InteractorState;

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected element created in test: ${tagName}`);
      }
      return createMockCanvas();
    }),
  });

  ({ XRInputManager } = await import('../src/xr-input-manager.js'));
  ({ XRHandVisualAdapter } = await import(
    '../src/visual/adapter/hand-visual-adapter.js'
  ));
  ({ InteractorState } = await import('../src/pointer/multi-pointer.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('XRInputManager pointer visuals', () => {
  it('hides ray and cursor visuals immediately after construction', () => {
    const manager = createManager();
    const rays = getRayMeshes(manager);
    const cursors = getCursorMeshes(manager);

    expect(rays).toHaveLength(2);
    expect(cursors).toHaveLength(2);
    for (const ray of rays) {
      expect(ray.visible).toBe(false);
      expect((ray.material as ShaderMaterial).uniforms.opacity.value).toBe(0);
    }
    for (const cursor of cursors) {
      expect(cursor.visible).toBe(false);
    }
  });

  it('keeps pointer visuals hidden when there is no XR session', () => {
    const manager = createManager();
    const rays = getRayMeshes(manager);
    const cursors = getCursorMeshes(manager);

    for (const visual of [...rays, ...cursors]) {
      visual.visible = true;
    }

    manager.update(createNoSessionXRManager(), 1 / 60, 1);

    for (const visual of [...rays, ...cursors]) {
      expect(visual.visible).toBe(false);
    }
  });
});

describe('XRInputManager touch hand visual offset', () => {
  it('only reports a touch surface visual offset while touch is selecting', () => {
    const manager = createManager();
    const multiPointer = manager.multiPointers.left as any;
    const target = new Vector3();
    const intersection = {
      details: { type: 'sphere' },
      object: new Object3D(),
      pointOnFace: new Vector3(1, 2, 3),
      pointerPosition: new Vector3(0.5, 2.25, 2),
    };

    multiPointer.activeKind = 'touch';
    multiPointer.touch.pointer.getIntersection = vi.fn(() => intersection);
    multiPointer.pointerStates.set('touch', InteractorState.HOVER);

    expect(manager.multiPointers.left.getTouchSurfaceVisualOffset(target)).toBe(
      null,
    );

    multiPointer.pointerStates.set('touch', InteractorState.SELECT);

    expect(manager.multiPointers.left.getTouchSurfaceVisualOffset(target)).toBe(
      target,
    );
    expect(target.x).toBeCloseTo(0.5);
    expect(target.y).toBeCloseTo(-0.25);
    expect(target.z).toBeCloseTo(1);
  });

  it('applies hand visual offsets in world space', () => {
    const parent = new Group();
    const model = new Group();
    parent.position.set(2, 0, 0);
    parent.rotation.y = Math.PI / 2;
    parent.scale.setScalar(2);
    model.position.set(0.25, 0, 0);
    parent.add(model);
    parent.updateMatrixWorld(true);

    const adapter = createHandVisualAdapter(parent);
    (adapter as any).visual = {
      model,
    };

    const before = model.getWorldPosition(new Vector3());
    const offset = new Vector3(0, 0, -0.5);
    adapter.applyVisualOffsetWorld(offset);
    parent.updateMatrixWorld(true);
    const after = model.getWorldPosition(new Vector3());

    expect(after.x - before.x).toBeCloseTo(offset.x);
    expect(after.y - before.y).toBeCloseTo(offset.y);
    expect(after.z - before.z).toBeCloseTo(offset.z);
  });
});

function createManager(): XRInputManagerInstance {
  return new XRInputManager({
    camera: new PerspectiveCamera(),
    scene: new Scene(),
  });
}

function getRayMeshes(manager: XRInputManagerInstance): Mesh[] {
  return [
    getOnlyMesh(manager.xrOrigin.raySpaces.left.children),
    getOnlyMesh(manager.xrOrigin.raySpaces.right.children),
  ];
}

function getCursorMeshes(manager: XRInputManagerInstance): Mesh[] {
  return manager.xrOrigin.children.filter((child): child is Mesh => {
    return child instanceof Mesh;
  });
}

function getOnlyMesh(children: Array<unknown>): Mesh {
  const meshes = children.filter(
    (child): child is Mesh => child instanceof Mesh,
  );
  expect(meshes).toHaveLength(1);
  return meshes[0];
}

function createNoSessionXRManager(): WebXRManager {
  return {
    getSession: () => null,
    getReferenceSpace: () => null,
    getFrame: () => null,
  } as unknown as WebXRManager;
}

function createHandVisualAdapter(parent: Group) {
  return new XRHandVisualAdapter(
    parent,
    'left',
    true,
    TestHandVisual,
    new Scene(),
    new PerspectiveCamera(),
    createTestAssetLoader(),
  );
}

class TestHandVisual {
  static assetKeyPrefix = 'test-hand';
  model: Group;

  constructor(
    _scene: Scene,
    _camera: PerspectiveCamera,
    gltfScene: Group,
    _layout: InputLayout,
  ) {
    this.model = gltfScene;
  }

  init() {}
  connect(_inputSource: XRInputSource, _enabled: boolean) {}
  disconnect() {}
  toggle(_enabled: boolean) {}
  update(_delta: number) {}
}

function createTestAssetLoader(): XRAssetLoader {
  return {
    async loadGLTF() {
      return { scene: new Group() } as Awaited<
        ReturnType<XRAssetLoader['loadGLTF']>
      >;
    },
  };
}

function createMockCanvas() {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };

  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  };
}
