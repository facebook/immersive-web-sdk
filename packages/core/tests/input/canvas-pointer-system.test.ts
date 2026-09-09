/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Container } from '@pmndrs/uikit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasPointerSystem } from '../../src/input/canvas-pointer-system.js';
import {
  EventDispatcher,
  Object3D,
  PerspectiveCamera,
  Scene,
} from '../../src/runtime/index.js';
import type { ScenePointerDescendants } from '../../src/runtime/scene-pointer-descendants.js';

const mocks = vi.hoisted(() => {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        arc: () => {},
        beginPath: () => {},
        clearRect: () => {},
        fill: () => {},
        fillStyle: '',
        lineWidth: 0,
        stroke: () => {},
        strokeStyle: '',
      }),
      height: 0,
      width: 0,
    }),
  };
  const update = vi.fn();
  const destroy = vi.fn();
  const forwardHtmlEvents = vi.fn(() => ({ destroy, update }));
  return { destroy, forwardHtmlEvents, update };
});

vi.mock('@pmndrs/pointer-events', () => ({
  forwardHtmlEvents: mocks.forwardHtmlEvents,
}));

function createCanvasPointerSystem(scene: Scene, camera: PerspectiveCamera) {
  const xr = Object.assign(new EventDispatcher(), {
    getSession: () => undefined,
  });
  const world = {
    camera,
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: {
      domElement: {},
      xr,
    },
    scene,
    session: undefined,
    visibilityState: { value: 'non-immersive' },
  };
  const system = new CanvasPointerSystem(world as any, {} as any, 0);
  system.init();
  return system;
}

function getForwardedRoot() {
  return mocks.forwardHtmlEvents.mock.calls[0][2] as Object3D &
    ScenePointerDescendants;
}

function getForwardingOptions() {
  return mocks.forwardHtmlEvents.mock.calls[0][3] as
    | {
        batchEvents?: boolean;
        filter?: (object: Object3D) => boolean;
      }
    | undefined;
}

describe('CanvasPointerSystem', () => {
  beforeEach(() => {
    mocks.destroy.mockReset();
    mocks.update.mockReset();
    mocks.forwardHtmlEvents.mockClear();
    mocks.forwardHtmlEvents.mockReturnValue({
      destroy: mocks.destroy,
      update: mocks.update,
    });
  });

  it('forwards events synchronously to preserve browser user activation', () => {
    const system = createCanvasPointerSystem(
      new Scene(),
      new PerspectiveCamera(),
    );

    expect(getForwardingOptions()?.batchEvents).toBe(false);
    system.destroy();
  });

  it('removes synchronous canvas listeners while XR forwarding is disabled', () => {
    const system = createCanvasPointerSystem(
      new Scene(),
      new PerspectiveCamera(),
    );

    expect(mocks.forwardHtmlEvents).toHaveBeenCalledTimes(1);
    system.xrManager.dispatchEvent({ type: 'sessionstart' });
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.forwardHtmlEvents).toHaveBeenCalledTimes(1);

    system.update();
    expect(mocks.update).not.toHaveBeenCalled();

    system.xrManager.dispatchEvent({ type: 'sessionend' });
    expect(mocks.forwardHtmlEvents).toHaveBeenCalledTimes(2);
    system.destroy();
  });

  it('filters objects hidden directly or by an ancestor', () => {
    const system = createCanvasPointerSystem(
      new Scene(),
      new PerspectiveCamera(),
    );
    const filter = getForwardingOptions()?.filter;
    const visibleParent = new Object3D();
    const visibleChild = new Object3D();
    visibleParent.add(visibleChild);
    const hiddenParent = new Object3D();
    const hiddenChild = new Object3D();
    hiddenParent.visible = false;
    hiddenParent.add(hiddenChild);

    expect(filter?.(visibleChild)).toBe(true);
    expect(filter?.(hiddenChild)).toBe(false);
    visibleChild.visible = false;
    expect(filter?.(visibleChild)).toBe(false);
    system.destroy();
  });

  it('keeps semantically visible renderless UIKit components interactive', async () => {
    const scene = new Scene();
    const system = createCanvasPointerSystem(scene, new PerspectiveCamera());
    const filter = getForwardingOptions()?.filter;
    const root = new Container({ height: 100, width: 100 });
    const button = new Container({
      height: 50,
      onClick: () => {},
      width: 50,
    });
    const renderlessChild = new Container({ height: 10, width: 10 });
    button.add(renderlessChild);
    root.add(button);
    scene.add(root);

    await vi.waitFor(() => {
      root.update(0.016);
      expect(button.isVisible.value).toBe(true);
    });
    expect(button.visible).toBe(false);
    expect(filter?.(button)).toBe(true);

    root.dispose();
    system.destroy();
  });

  it('uses ray and screen-space descendants without sweeping all camera children', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const rayTarget = new Object3D();
    const touchTarget = new Object3D();
    const screenSpaceDocument = new Object3D();
    const cameraHelper = new Object3D();
    camera.add(screenSpaceDocument);
    camera.add(cameraHelper);
    const originalDescendants = [rayTarget];
    scene.rayDescendants = originalDescendants;
    scene.touchDescendants = [touchTarget];
    scene.screenSpaceDescendants = [screenSpaceDocument];
    scene.interactableDescendants = originalDescendants;

    const system = createCanvasPointerSystem(scene, camera);
    expect(getForwardedRoot().children).toHaveLength(1);
    let rootDescendantsDuringUpdate: Object3D[] | undefined;
    mocks.update.mockImplementation(() => {
      const root = getForwardedRoot();
      rootDescendantsDuringUpdate = root.interactableDescendants
        ? [...root.interactableDescendants]
        : undefined;
    });

    system.update();

    expect(rootDescendantsDuringUpdate).toEqual([
      rayTarget,
      screenSpaceDocument,
    ]);
    expect(rootDescendantsDuringUpdate).not.toContain(touchTarget);
    expect(rootDescendantsDuringUpdate).not.toContain(cameraHelper);
    expect(scene.interactableDescendants).toBe(originalDescendants);
    expect(getForwardedRoot().interactableDescendants).toEqual([
      rayTarget,
      screenSpaceDocument,
    ]);

    system.destroy();
    expect(getForwardedRoot().interactableDescendants).toBeUndefined();
    expect(getForwardedRoot().children).toHaveLength(0);
  });

  it('falls back to full-scene traversal when no optimized descendants exist', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();

    const system = createCanvasPointerSystem(scene, camera);
    let rootDescendantsDuringUpdate: Object3D[] | undefined;
    mocks.update.mockImplementation(() => {
      const root = getForwardedRoot();
      rootDescendantsDuringUpdate = root.interactableDescendants
        ? [...root.interactableDescendants]
        : undefined;
    });

    system.update();

    expect(rootDescendantsDuringUpdate).toEqual([scene]);
    expect(scene.interactableDescendants).toBeUndefined();
    expect(getForwardedRoot().interactableDescendants).toEqual([scene]);
  });
});
