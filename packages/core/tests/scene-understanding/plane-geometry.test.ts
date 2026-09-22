/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from '../../src/runtime/three.js';
import { XRAnchor } from '../../src/scene-understanding/anchor.js';
import { XRMesh } from '../../src/scene-understanding/mesh.js';
import { XRPlane } from '../../src/scene-understanding/plane.js';
import { SceneUnderstandingSystem } from '../../src/scene-understanding/scene-understanding-system.js';

// The runtime barrel pulls in xr-input's cursor-visual.ts, which touches
// `document` at module load; provide a minimal canvas stub before importing.
vi.hoisted(() => {
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
});

const IDENTITY = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function createSystem(createTransformEntity = vi.fn()) {
  const xr = {
    addEventListener: vi.fn(),
    getFrame: vi.fn(() => ({
      getPose: () => ({ transform: { matrix: IDENTITY } }),
    })),
    getSession: vi.fn((): XRSession | null => null),
    removeEventListener: vi.fn(),
  };
  const scene = new Scene();
  const world = {
    camera: new PerspectiveCamera(),
    createTransformEntity,
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer: { xr },
    scene,
    session: undefined,
    visibilityState: { value: 'visible' },
  };
  const system = new SceneUnderstandingSystem(world as any, {} as any, 0);
  return { system, scene, xr };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function getXRListener(
  xr: ReturnType<typeof createSystem>['xr'],
  type: 'sessionstart' | 'sessionend',
): () => void | Promise<void> {
  const listener = xr.addEventListener.mock.calls.find(
    ([eventType]) => eventType === type,
  )?.[1];
  expect(listener).toBeTypeOf('function');
  return listener as () => void | Promise<void>;
}

function initSystemForAnchorRestoration() {
  const result = createSystem();
  (result.system as any).queries = {
    anchoredEntities: { entities: new Set() },
    meshEntities: { entities: new Set() },
    planeEntities: { entities: new Set() },
  };
  result.system.init();
  return result;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SceneUnderstandingSystem.disposeEntityGeometry', () => {
  it('disposes the geometry but not the shared material', () => {
    const { system } = createSystem();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    (system as any).disposeEntityGeometry({ object3D: mesh });

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('is a no-op for entities without a Mesh object3D', () => {
    const { system } = createSystem();
    expect(() =>
      (system as any).disposeEntityGeometry({ object3D: new Object3D() }),
    ).not.toThrow();
    expect(() =>
      (system as any).disposeEntityGeometry({ object3D: undefined }),
    ).not.toThrow();
  });
});

describe('SceneUnderstandingSystem.updatePlanes geometry allocation', () => {
  it('rebuilds plane geometry only when lastChangedTime advances', () => {
    let polygonAccessCount = 0;
    let polygon = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 1 },
    ];
    const planeState = {
      lastChangedTime: 1,
      planeSpace: {},
      get polygon() {
        polygonAccessCount++;
        return polygon;
      },
    };
    const plane = planeState as unknown as XRPlane;

    const trackedEntity = {
      addComponent: vi.fn(),
      getValue: (component: unknown, key: string) =>
        component === XRPlane && key === '_plane' ? plane : undefined,
      object3D: undefined as Object3D | undefined,
    };

    const createTransformEntity = vi.fn((object3D: Object3D) => {
      trackedEntity.object3D = object3D;
      return trackedEntity;
    });
    const { system } = createSystem(createTransformEntity);
    (system as any).queries = { planeEntities: { entities: [] as any[] } };

    const planes = new Set([plane]) as unknown as XRPlaneSet;

    // Frame 1: plane is new -> geometry built (polygon read once), entity made.
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);
    expect(polygonAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    const planeObject = trackedEntity.object3D as Mesh;
    const initialGeometry = planeObject.geometry;
    const initialGeometryDispose = vi.spyOn(initialGeometry, 'dispose');

    // Now the plane is tracked by an existing entity (as the planeEntities
    // query would report after creation).
    (system as any).queries.planeEntities.entities = [trackedEntity];

    // Frame 2: an unchanged plane keeps its geometry and does no polygon work.
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);
    expect(polygonAccessCount).toBe(1);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    expect(planeObject.geometry).toBe(initialGeometry);
    expect(initialGeometryDispose).not.toHaveBeenCalled();

    // Some emulators advance lastChangedTime every frame. If the polygon still
    // has the same identity, do not restore the old per-frame allocation leak.
    planeState.lastChangedTime = 2;
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);
    expect(polygonAccessCount).toBe(2);
    expect(planeObject.geometry).toBe(initialGeometry);
    expect(initialGeometryDispose).not.toHaveBeenCalled();

    // Frame 4: WebXR retains the XRPlane identity but publishes a new polygon
    // and lastChangedTime. Replace and dispose the stale geometry in place.
    polygon = [
      { x: -1, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -1, z: 2 },
    ];
    planeState.lastChangedTime = 3;
    (system as any).updatePlanes(planes, {} as XRReferenceSpace);

    expect(polygonAccessCount).toBe(3);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    expect(planeObject.geometry).not.toBe(initialGeometry);
    expect(initialGeometryDispose).toHaveBeenCalledTimes(1);
    expect((planeObject.geometry as BoxGeometry).parameters.width).toBe(3);
    expect((planeObject.geometry as BoxGeometry).parameters.depth).toBe(4);
  });
});

describe('SceneUnderstandingSystem.updateMeshes geometry allocation', () => {
  it.each([
    ['empty', new Float32Array([])],
    ['non-triplet', new Float32Array([1, 2])],
  ])(
    'skips a new mesh with %s vertices without blocking a following mesh',
    (_description, invalidVertices) => {
      const invalidMesh = {
        indices: new Uint32Array([]),
        lastChangedTime: 1,
        meshSpace: {},
        semanticLabel: 'table',
        vertices: invalidVertices,
      } as unknown as XRMesh;
      const validMesh = {
        indices: new Uint32Array([0, 1, 2]),
        lastChangedTime: 1,
        meshSpace: {},
        semanticLabel: 'desk',
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]),
      } as unknown as XRMesh;
      const addComponent = vi.fn();
      const createTransformEntity = vi.fn(() => ({ addComponent }));
      const { scene, system } = createSystem(createTransformEntity);
      (system as any).queries = {
        meshEntities: { entities: [] as any[] },
      };
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() =>
        (system as any).updateMeshes(
          new Set([invalidMesh, validMesh]) as unknown as XRMeshSet,
          {} as XRReferenceSpace,
        ),
      ).not.toThrow();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(createTransformEntity).toHaveBeenCalledTimes(1);
      expect(scene.children).toHaveLength(1);
      expect(addComponent).toHaveBeenCalledWith(
        XRMesh,
        expect.objectContaining({
          _mesh: validMesh,
          dimensions: [1, 2, 0],
          max: [1, 2, 0],
          min: [0, 0, 0],
        }),
      );
      warn.mockRestore();
    },
  );

  it('rebuilds mesh geometry and metadata only when lastChangedTime advances', () => {
    let verticesAccessCount = 0;
    let vertices = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    let indices = new Uint32Array([0, 1, 2]);
    const meshState = {
      lastChangedTime: 1,
      meshSpace: {},
      semanticLabel: 'table',
      get indices() {
        return indices;
      },
      get vertices() {
        verticesAccessCount++;
        return vertices;
      },
    };
    const mesh = meshState as unknown as XRMesh;
    const metadataViews = {
      dimensions: new Float32Array(3),
      max: new Float32Array(3),
      min: new Float32Array(3),
    };
    const scalarMetadata: Record<string, unknown> = {
      isBounded3D: true,
      semanticLabel: 'table',
    };

    const trackedEntity = {
      addComponent: vi.fn(),
      getVectorView: vi.fn(
        (_component: unknown, key: keyof typeof metadataViews) =>
          metadataViews[key],
      ),
      getValue: (component: unknown, key: string) => {
        if (component !== XRMesh) {
          return undefined;
        }
        return key === '_mesh' ? mesh : scalarMetadata[key];
      },
      object3D: undefined as Object3D | undefined,
      setValue: vi.fn((_component: unknown, key: string, value: unknown) => {
        scalarMetadata[key] = value;
      }),
    };

    const createTransformEntity = vi.fn((object3D: Object3D) => {
      trackedEntity.object3D = object3D;
      return trackedEntity;
    });
    const { system } = createSystem(createTransformEntity);
    (system as any).queries = { meshEntities: { entities: [] as any[] } };

    const meshes = new Set([mesh]) as unknown as XRMeshSet;

    // Frame 1: mesh is new -> geometry and component metadata are built.
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    const initialVerticesAccessCount = verticesAccessCount;
    const meshObject = trackedEntity.object3D as Mesh;
    const initialGeometry = meshObject.geometry;
    const initialGeometryDispose = vi.spyOn(initialGeometry, 'dispose');

    // Now the mesh is tracked by an existing entity.
    (system as any).queries.meshEntities.entities = [trackedEntity];

    // Frame 2: an unchanged mesh keeps its geometry and does no vertex work.
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);
    expect(verticesAccessCount).toBe(initialVerticesAccessCount);
    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    expect(meshObject.geometry).toBe(initialGeometry);
    expect(initialGeometryDispose).not.toHaveBeenCalled();
    expect(trackedEntity.setValue).not.toHaveBeenCalled();

    // Some emulators advance lastChangedTime every frame. If the topology and
    // label identities are stable, do not rebuild geometry or metadata.
    meshState.lastChangedTime = 2;
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);
    expect(verticesAccessCount).toBe(initialVerticesAccessCount + 1);
    expect(meshObject.geometry).toBe(initialGeometry);
    expect(initialGeometryDispose).not.toHaveBeenCalled();
    expect(trackedEntity.setValue).not.toHaveBeenCalled();

    // Invalid topology updates keep the last-known-good geometry and metadata.
    // They must not partially swap/dispose before bounds validation.
    metadataViews.dimensions.set([2, 2, 2]);
    metadataViews.max.set([2, 2, 2]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalidUpdates = [new Float32Array([]), new Float32Array([1, 2])];

    for (const invalidVertices of invalidUpdates) {
      vertices = invalidVertices;
      indices = new Uint32Array([]);
      meshState.lastChangedTime++;

      expect(() =>
        (system as any).updateMeshes(meshes, {} as XRReferenceSpace),
      ).not.toThrow();
      expect(meshObject.geometry).toBe(initialGeometry);
      expect(initialGeometryDispose).not.toHaveBeenCalled();
      expect([...metadataViews.dimensions]).toEqual([2, 2, 2]);
      expect([...metadataViews.max]).toEqual([2, 2, 2]);
      expect(trackedEntity.setValue).not.toHaveBeenCalled();
    }
    expect(warn).toHaveBeenCalledTimes(invalidUpdates.length);
    warn.mockRestore();

    // A later valid update recovers from the rejected topology, replaces the
    // geometry, and refreshes public mesh metadata.
    vertices = new Float32Array([-1, -2, -3, 4, 5, 6]);
    indices = new Uint32Array([0, 1, 0]);
    meshState.semanticLabel = 'desk';
    meshState.lastChangedTime = 5;
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);

    expect(createTransformEntity).toHaveBeenCalledTimes(1);
    expect(meshObject.geometry).not.toBe(initialGeometry);
    expect(initialGeometryDispose).toHaveBeenCalledTimes(1);
    expect(meshObject.geometry.getAttribute('position').array).toBe(vertices);
    expect(meshObject.geometry.getIndex()?.array).toBe(indices);
    expect(trackedEntity.setValue).toHaveBeenCalledWith(
      XRMesh,
      'semanticLabel',
      'desk',
    );
    expect([...metadataViews.dimensions]).toEqual([5, 7, 9]);

    // Attribute-only changes still refresh copied component metadata without
    // replacing an unchanged topology. Global meshes reset bounded values.
    const updatedGeometry = meshObject.geometry;
    trackedEntity.setValue.mockClear();
    meshState.semanticLabel = 'global mesh';
    meshState.lastChangedTime = 6;
    (system as any).updateMeshes(meshes, {} as XRReferenceSpace);

    expect(meshObject.geometry).toBe(updatedGeometry);
    expect(trackedEntity.setValue).toHaveBeenCalledWith(
      XRMesh,
      'isBounded3D',
      false,
    );
    expect([...metadataViews.dimensions]).toEqual([0, 0, 0]);
  });
});

describe('SceneUnderstandingSystem persistent anchor restoration', () => {
  function stubPersistentAnchorStorage() {
    const storage = {
      getItem: vi.fn(() => 'saved-anchor'),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);
    return storage;
  }

  function createRestoringSession(promise: Promise<XRAnchor | null>) {
    return {
      enabledFeatures: ['anchors'],
      restorePersistentAnchor: vi.fn(() => promise),
    } as unknown as XRSession;
  }

  function createNativeAnchor(requestPersistentHandle?: () => Promise<string>) {
    return {
      anchorSpace: {},
      delete: vi.fn(),
      requestPersistentHandle,
    };
  }

  it('does not install a late old-session anchor or clear the new restore marker', async () => {
    stubPersistentAnchorStorage();
    const firstRestore = deferred<XRAnchor>();
    const secondRestore = deferred<XRAnchor>();
    const firstSession = createRestoringSession(firstRestore.promise);
    const secondSession = createRestoringSession(secondRestore.promise);
    const oldAnchor = createNativeAnchor();
    const newAnchor = createNativeAnchor();
    const { system, xr } = initSystemForAnchorRestoration();

    xr.getSession.mockReturnValue(firstSession);
    const onSessionStart = getXRListener(xr, 'sessionstart');
    const onSessionEnd = getXRListener(xr, 'sessionend');

    const firstStart = onSessionStart();
    expect((system as any).anchorRequested).toBe(true);

    onSessionEnd();
    xr.getSession.mockReturnValue(secondSession);
    const secondStart = onSessionStart();
    expect((system as any).anchorRequested).toBe(true);

    firstRestore.resolve(oldAnchor);
    await firstStart;
    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(true);
    expect(oldAnchor.delete).toHaveBeenCalledTimes(1);

    secondRestore.resolve(newAnchor);
    await secondStart;
    expect((system as any).xrAnchor).toBe(newAnchor);
    expect((system as any).anchorRequested).toBe(false);

    onSessionEnd();
    expect((system as any).xrAnchor).toBeUndefined();
    expect(newAnchor.delete).toHaveBeenCalledTimes(1);
    system.destroy();
    expect(newAnchor.delete).toHaveBeenCalledTimes(1);
  });

  it('does not install an anchor when the active session is replaced', async () => {
    stubPersistentAnchorStorage();
    const restore = deferred<XRAnchor>();
    const firstSession = createRestoringSession(restore.promise);
    const replacementSession = createRestoringSession(
      new Promise<XRAnchor>(() => {}),
    );
    const { system, xr } = initSystemForAnchorRestoration();

    xr.getSession.mockReturnValue(firstSession);
    const pendingStart = getXRListener(xr, 'sessionstart')();
    expect((system as any).anchorRequested).toBe(true);

    xr.getSession.mockReturnValue(replacementSession);
    const staleAnchor = createNativeAnchor();
    restore.resolve(staleAnchor);
    await pendingStart;

    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    expect(staleAnchor.delete).toHaveBeenCalledTimes(1);
    system.destroy();
  });

  it('does not install an anchor that resolves after system teardown', async () => {
    const storage = stubPersistentAnchorStorage();
    const restore = deferred<XRAnchor>();
    const session = createRestoringSession(restore.promise);
    const { system, xr } = initSystemForAnchorRestoration();

    xr.getSession.mockReturnValue(session);
    const pendingStart = getXRListener(xr, 'sessionstart')();
    expect((system as any).anchorRequested).toBe(true);

    system.destroy();
    const staleAnchor = createNativeAnchor();
    restore.resolve(staleAnchor);
    await pendingStart;

    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    expect(staleAnchor.delete).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('leaves the anchor empty and permits creation when restore returns null', async () => {
    stubPersistentAnchorStorage();
    const restore = deferred<XRAnchor | null>();
    const { system, xr } = initSystemForAnchorRestoration();
    xr.getSession.mockReturnValue(createRestoringSession(restore.promise));

    const pendingStart = getXRListener(xr, 'sessionstart')();
    restore.resolve(null);
    await pendingStart;

    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    system.destroy();
  });

  it('clears only its own marker and invalid UUID when restoration rejects', async () => {
    const storage = stubPersistentAnchorStorage();
    const restore = deferred<XRAnchor>();
    const { system, xr } = initSystemForAnchorRestoration();
    xr.getSession.mockReturnValue(createRestoringSession(restore.promise));

    const pendingStart = getXRListener(xr, 'sessionstart')();
    restore.reject(new Error('restore failed'));
    await expect(pendingStart).resolves.toBeUndefined();

    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith('iwsdk_scene_anchor_uuid');
    system.destroy();
  });
});

describe('SceneUnderstandingSystem anchor creation', () => {
  function stubAnchorGlobals() {
    const storage = {
      getItem: vi.fn(() => 'saved-anchor'),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('XRRigidTransform', class {});
    return storage;
  }

  function createNativeAnchor(requestPersistentHandle?: () => Promise<string>) {
    return {
      anchorSpace: {},
      delete: vi.fn(),
      requestPersistentHandle,
    };
  }

  it('logs only when a real anchor request starts and backs off after a null result', async () => {
    stubAnchorGlobals();
    const firstCreation = deferred<XRAnchor | null>();
    const secondCreation = deferred<XRAnchor | null>();
    const createAnchorRequest = vi
      .fn()
      .mockImplementationOnce(() => firstCreation.promise)
      .mockImplementationOnce(() => secondCreation.promise);
    const referenceSpace = {} as XRReferenceSpace;
    const session = {} as XRSession;
    const { system, xr } = createSystem();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const getReferenceSpace = vi.fn(() => referenceSpace);
    const frame = {
      createAnchor: createAnchorRequest,
      getPose: vi.fn(() => null),
    };
    (xr as any).getReferenceSpace = getReferenceSpace;
    (xr.getFrame as any).mockReturnValue(frame);
    (system as any).anchorFeatureEnabled = true;
    (system as any).queries = {
      anchoredEntities: { entities: new Set() },
    };

    // Retry absent prerequisites silently instead of logging every frame.
    system.update(0, 0);
    system.update(0, 0);
    xr.getSession.mockReturnValue(session);
    (xr.getFrame as any).mockReturnValue({});
    system.update(0, 0);
    (xr.getFrame as any).mockReturnValue(frame);
    getReferenceSpace.mockReturnValue(null);
    system.update(0, 0);
    expect(log).not.toHaveBeenCalled();
    expect(createAnchorRequest).not.toHaveBeenCalled();
    expect((system as any).anchorRequested).toBe(false);

    getReferenceSpace.mockReturnValue(referenceSpace);
    system.update(0, 0);
    system.update(0, 0.1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);
    expect((system as any).anchorRequested).toBe(true);
    system.update(0, 10);
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);

    firstCreation.resolve(null);
    await vi.waitFor(() => {
      expect((system as any).anchorRequested).toBe(false);
    });

    system.update(0, 10);
    system.update(0, 10.249);
    expect(log).toHaveBeenCalledTimes(1);
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);

    system.update(0, 10.25);
    expect(log).toHaveBeenCalledTimes(2);
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);
    expect((system as any).anchorRequested).toBe(true);

    // A request remains single-flight even after its retry deadline passes.
    system.update(0, 20);
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);

    const createdAnchor = createNativeAnchor();
    secondCreation.resolve(createdAnchor);
    await vi.waitFor(() => {
      expect((system as any).anchorRequested).toBe(false);
    });

    expect((system as any).xrAnchor).toBe(createdAnchor);
    expect((system as any).anchorRetryDelayIndex).toBe(0);
    expect((system as any).nextAnchorRequestTime).toBe(0);
    system.update(0, 21);
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);
  });

  it('exponentially backs off rejected anchor requests to a five-second cap', async () => {
    stubAnchorGlobals();
    const createAnchorRequest = vi.fn(() =>
      Promise.reject(new Error('creation failed')),
    );
    const referenceSpace = {} as XRReferenceSpace;
    const session = {} as XRSession;
    const { system, xr } = createSystem();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    (xr as any).getReferenceSpace = vi.fn(() => referenceSpace);
    (xr.getFrame as any).mockReturnValue({ createAnchor: createAnchorRequest });
    xr.getSession.mockReturnValue(session);
    (system as any).anchorFeatureEnabled = true;

    const attemptAt = async (time: number, expectedCalls: number) => {
      system.update(0, time);
      expect(createAnchorRequest).toHaveBeenCalledTimes(expectedCalls);
      await vi.waitFor(() => {
        expect((system as any).anchorRequested).toBe(false);
      });
    };

    await attemptAt(0, 1);
    expect((system as any).anchorRetryDelayIndex).toBe(1);
    system.update(0, 0.249);
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);

    await attemptAt(0.25, 2);
    expect((system as any).anchorRetryDelayIndex).toBe(2);
    system.update(0, 0.749);
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);

    await attemptAt(0.75, 3);
    expect((system as any).anchorRetryDelayIndex).toBe(3);
    system.update(0, 1.749);
    expect(createAnchorRequest).toHaveBeenCalledTimes(3);

    await attemptAt(1.75, 4);
    expect((system as any).anchorRetryDelayIndex).toBe(4);
    system.update(0, 3.749);
    expect(createAnchorRequest).toHaveBeenCalledTimes(4);

    await attemptAt(3.75, 5);
    expect((system as any).anchorRetryDelayIndex).toBe(4);
    system.update(0, 8.749);
    expect(createAnchorRequest).toHaveBeenCalledTimes(5);

    await attemptAt(8.75, 6);
    expect((system as any).anchorRetryDelayIndex).toBe(4);
    system.update(0, 13.749);
    expect(createAnchorRequest).toHaveBeenCalledTimes(6);
    await attemptAt(13.75, 7);
    expect((system as any).anchorRetryDelayIndex).toBe(4);
  });

  it('resets retry state for a replacement session and ignores stale failures', async () => {
    stubAnchorGlobals();
    const firstCreation = deferred<XRAnchor>();
    const secondCreation = deferred<XRAnchor>();
    const createAnchorRequest = vi
      .fn()
      .mockImplementationOnce(() => firstCreation.promise)
      .mockImplementationOnce(() => secondCreation.promise);
    const firstSession = {} as XRSession;
    const secondSession = {} as XRSession;
    let activeSession = firstSession;
    const { system, xr } = createSystem();
    const createAnchorSpy = vi.spyOn(system as any, 'createAnchor');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    (xr as any).getReferenceSpace = vi.fn(() => ({}) as XRReferenceSpace);
    (xr.getFrame as any).mockReturnValue({ createAnchor: createAnchorRequest });
    xr.getSession.mockImplementation(() => activeSession);
    (system as any).anchorFeatureEnabled = true;

    system.update(0, 1);
    const firstAttempt = createAnchorSpy.mock.results[0].value as Promise<void>;
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);
    expect((system as any).anchorRequested).toBe(true);

    (system as any).resetSessionState();
    activeSession = secondSession;
    (system as any).anchorFeatureEnabled = true;
    system.update(0, 1.05);
    const secondAttempt = createAnchorSpy.mock.results[1]
      .value as Promise<void>;
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);
    expect((system as any).anchorRequested).toBe(true);

    firstCreation.reject(new Error('stale creation failed'));
    await firstAttempt;
    expect((system as any).anchorRequested).toBe(true);
    expect((system as any).anchorRetryDelayIndex).toBe(0);
    system.update(0, 20);
    expect(createAnchorRequest).toHaveBeenCalledTimes(2);

    const newAnchor = createNativeAnchor();
    secondCreation.resolve(newAnchor);
    await secondAttempt;
    expect((system as any).xrAnchor).toBe(newAnchor);
    expect((system as any).anchorRequested).toBe(false);
    expect((system as any).anchorRetryDelayIndex).toBe(0);
  });

  it('deletes an anchor returned after its XR session was replaced', async () => {
    const storage = stubAnchorGlobals();
    const creation = deferred<ReturnType<typeof createNativeAnchor>>();
    const firstSession = {} as XRSession;
    const replacementSession = {} as XRSession;
    const { system, xr } = createSystem();
    (xr.getFrame as any).mockReturnValue({
      createAnchor: vi.fn(() => creation.promise),
    });
    xr.getSession.mockReturnValue(firstSession);

    const pendingCreation = (system as any).createAnchor(
      {} as XRReferenceSpace,
    );
    expect((system as any).anchorRequested).toBe(true);

    xr.getSession.mockReturnValue(replacementSession);
    const staleAnchor = createNativeAnchor();
    creation.resolve(staleAnchor);
    await expect(pendingCreation).resolves.toBeUndefined();

    expect(staleAnchor.delete).toHaveBeenCalledTimes(1);
    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not persist a stale anchor or clear a newer restore marker', async () => {
    const storage = stubAnchorGlobals();
    const persistentHandle = deferred<string>();
    const requestPersistentHandle = vi.fn(() => persistentHandle.promise);
    const createdAnchor = createNativeAnchor(requestPersistentHandle);
    const firstSession = {} as XRSession;
    const nextRestore = deferred<XRAnchor>();
    const nextAnchor = createNativeAnchor();
    const nextSession = {
      restorePersistentAnchor: vi.fn(() => nextRestore.promise),
    } as unknown as XRSession;
    const { system, xr } = createSystem();
    (xr.getFrame as any).mockReturnValue({
      createAnchor: vi.fn(() => Promise.resolve(createdAnchor)),
    });
    xr.getSession.mockReturnValue(firstSession);

    const pendingCreation = (system as any).createAnchor(
      {} as XRReferenceSpace,
    );
    await vi.waitFor(() => {
      expect(requestPersistentHandle).toHaveBeenCalledTimes(1);
    });
    expect((system as any).xrAnchor).toBe(createdAnchor);

    (system as any).resetSessionState();
    expect(createdAnchor.delete).toHaveBeenCalledTimes(1);
    xr.getSession.mockReturnValue(nextSession);
    const pendingRestore = (system as any).tryRestorePersistentAnchor();
    expect((system as any).anchorRequested).toBe(true);

    persistentHandle.resolve('stale-handle');
    await pendingCreation;
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(createdAnchor.delete).toHaveBeenCalledTimes(1);
    expect((system as any).anchorRequested).toBe(true);

    nextRestore.resolve(nextAnchor);
    await pendingRestore;
    expect((system as any).xrAnchor).toBe(nextAnchor);
    expect((system as any).anchorRequested).toBe(false);
    (system as any).resetSessionState();
    expect(nextAnchor.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes an installed anchor when the session changes while persistence is pending', async () => {
    const storage = stubAnchorGlobals();
    const persistentHandle = deferred<string>();
    const requestPersistentHandle = vi.fn(() => persistentHandle.promise);
    const createdAnchor = createNativeAnchor(requestPersistentHandle);
    const firstSession = {} as XRSession;
    const replacementSession = {} as XRSession;
    const { system, xr } = createSystem();
    (xr.getFrame as any).mockReturnValue({
      createAnchor: vi.fn(() => Promise.resolve(createdAnchor)),
    });
    xr.getSession.mockReturnValue(firstSession);

    const pendingCreation = (system as any).createAnchor(
      {} as XRReferenceSpace,
    );
    await vi.waitFor(() => {
      expect(requestPersistentHandle).toHaveBeenCalledTimes(1);
    });

    xr.getSession.mockReturnValue(replacementSession);
    persistentHandle.resolve('stale-handle');
    await pendingCreation;

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(createdAnchor.delete).toHaveBeenCalledTimes(1);
    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
  });

  it('catches creation rejection and clears its request marker', async () => {
    stubAnchorGlobals();
    const creation = deferred<ReturnType<typeof createNativeAnchor>>();
    const { system, xr } = createSystem();
    (xr.getFrame as any).mockReturnValue({
      createAnchor: vi.fn(() => creation.promise),
    });
    xr.getSession.mockReturnValue({} as XRSession);

    const pendingCreation = (system as any).createAnchor(
      {} as XRReferenceSpace,
    );
    expect((system as any).anchorRequested).toBe(true);
    creation.reject(new Error('creation failed'));

    await expect(pendingCreation).resolves.toBeUndefined();
    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
  });

  it('keeps the active anchor when persistent-handle creation rejects', async () => {
    const storage = stubAnchorGlobals();
    const requestPersistentHandle = vi.fn(() =>
      Promise.reject(new Error('persistence failed')),
    );
    const createdAnchor = createNativeAnchor(requestPersistentHandle);
    const { system, xr } = createSystem();
    const referenceSpace = {} as XRReferenceSpace;
    const createAnchorRequest = vi.fn(() => Promise.resolve(createdAnchor));
    (xr.getFrame as any).mockReturnValue({
      createAnchor: createAnchorRequest,
      getPose: vi.fn(() => null),
    });
    xr.getSession.mockReturnValue({} as XRSession);
    (system as any).queries = {
      anchoredEntities: { entities: new Set() },
    };

    await expect(
      (system as any).createAnchor(referenceSpace),
    ).resolves.toBeUndefined();

    expect((system as any).xrAnchor).toBe(createdAnchor);
    expect((system as any).anchorRequested).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(createdAnchor.delete).not.toHaveBeenCalled();
    expect((system as any).anchorRetryDelayIndex).toBe(0);
    expect((system as any).nextAnchorRequestTime).toBe(0);

    (xr as any).getReferenceSpace = vi.fn(() => referenceSpace);
    (system as any).anchorFeatureEnabled = true;
    system.update(0, 10);
    expect(createAnchorRequest).toHaveBeenCalledTimes(1);

    (system as any).resetSessionState();
    expect(createdAnchor.delete).toHaveBeenCalledTimes(1);
  });
});

describe('SceneUnderstandingSystem teardown', () => {
  it('releases owned resources and listeners while preserving anchored content', () => {
    const planeEntities = new Set<any>();
    const meshEntities = new Set<any>();
    const anchoredEntities = new Set<any>();
    const groupEntity = { active: true, destroy: vi.fn() };
    const { scene, system, xr } = createSystem();
    (system.world as any).sceneEntity = {};
    (system.world as any).createTransformEntity = vi.fn((object: Object3D) => {
      scene.add(object);
      return groupEntity;
    });
    (system as any).queries = {
      anchoredEntities: { entities: anchoredEntities },
      meshEntities: { entities: meshEntities },
      planeEntities: { entities: planeEntities },
    };
    system.init();

    const planeMaterial = (system as any).planeMaterial as MeshBasicMaterial;
    const meshMaterial = (system as any).meshMaterial as MeshBasicMaterial;
    const planeMaterialDispose = vi.spyOn(planeMaterial, 'dispose');
    const meshMaterialDispose = vi.spyOn(meshMaterial, 'dispose');
    const planeGeometry = new BoxGeometry(1, 0.001, 1);
    const meshGeometry = new BoxGeometry(1, 1, 1);
    const planeGeometryDispose = vi.spyOn(planeGeometry, 'dispose');
    const meshGeometryDispose = vi.spyOn(meshGeometry, 'dispose');
    const planeEntity = {
      active: true,
      destroy: vi.fn(),
      object3D: new Mesh(planeGeometry, planeMaterial),
    };
    const meshEntity = {
      active: true,
      destroy: vi.fn(),
      object3D: new Mesh(meshGeometry, meshMaterial),
    };
    planeEntities.add(planeEntity);
    meshEntities.add(meshEntity);

    const anchoredObject = new Object3D();
    const anchoredEntity = {
      active: true,
      object3D: anchoredObject,
      setValue: vi.fn(),
    };
    anchoredEntities.add(anchoredEntity);
    const anchoredGroup = (system as any).anchoredGroup as Object3D;
    anchoredGroup.add(anchoredObject);

    const plane = {} as XRPlane;
    const mesh = {} as XRMesh;
    const activeAnchorDelete = vi.fn();
    (system as any).currentPlanes.set(plane, planeEntity);
    (system as any).currentMeshes.set(mesh, meshEntity);
    (system as any).planeGeometryStates.set(plane, {});
    (system as any).meshGeometryStates.set(mesh, {});
    (system as any).xrAnchor = { delete: activeAnchorDelete };
    (system as any).anchorRequested = true;
    (system as any).planeFeatureEnabled = true;
    (system as any).meshFeatureEnabled = true;
    (system as any).anchorFeatureEnabled = true;

    system.destroy();

    expect(xr.removeEventListener).toHaveBeenCalledTimes(2);
    expect(planeGeometryDispose).toHaveBeenCalledTimes(1);
    expect(meshGeometryDispose).toHaveBeenCalledTimes(1);
    expect(planeEntity.destroy).toHaveBeenCalledTimes(1);
    expect(meshEntity.destroy).toHaveBeenCalledTimes(1);
    expect(planeMaterialDispose).toHaveBeenCalledTimes(1);
    expect(meshMaterialDispose).toHaveBeenCalledTimes(1);
    expect(activeAnchorDelete).toHaveBeenCalledTimes(1);
    expect(anchoredEntity.setValue).toHaveBeenCalledWith(
      XRAnchor,
      'attached',
      false,
    );
    expect(anchoredObject.parent).toBe(scene);
    expect(anchoredGroup.parent).toBeNull();
    expect(groupEntity.destroy).toHaveBeenCalledTimes(1);
    expect((system as any).currentPlanes.size).toBe(0);
    expect((system as any).currentMeshes.size).toBe(0);
    expect((system as any).planeGeometryStates.size).toBe(0);
    expect((system as any).meshGeometryStates.size).toBe(0);
    expect((system as any).xrAnchor).toBeUndefined();
    expect((system as any).anchorRequested).toBe(false);
    expect((system as any).planeFeatureEnabled).toBeUndefined();
    expect((system as any).meshFeatureEnabled).toBeUndefined();
    expect((system as any).anchorFeatureEnabled).toBeUndefined();
  });
});
