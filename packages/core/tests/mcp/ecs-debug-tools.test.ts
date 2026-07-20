/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ELICS — must be declared before any imports that use it
// ---------------------------------------------------------------------------

vi.mock('elics', () => {
  const components = new Map<string, any>();
  return {
    ComponentRegistry: {
      getById: (id: string) => components.get(id),
      getAllComponents: () => Array.from(components.values()),
      _register: (comp: any) => components.set(comp.id, comp),
      _clear: () => components.clear(),
    },
  };
});

// ---------------------------------------------------------------------------
// ecsStep timeout tests
// ---------------------------------------------------------------------------

describe('ecsStep', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject with timeout error when render loop is not running', async () => {
    // Use dynamic import with resetModules to get fresh singleton state
    vi.resetModules();
    const { installDebugHook, ecsPause, ecsStep } = await import(
      '../../src/mcp/ecs-debug-tools.js'
    );

    // Create a minimal mock world
    const mockWorld = {
      update: (_delta: number, _time: number) => {},
      getSystems: () => [],
      entityManager: {
        getEntityByIndex: () => null,
        indexLookup: [],
      },
    } as any;

    installDebugHook(mockWorld);
    ecsPause(mockWorld);

    // ecsStep waits for world.update to fire stepResolve.
    // Without a render loop, the 5s timeout should reject.
    // Use fake timers to avoid waiting 5 real seconds.
    vi.useFakeTimers();

    // Capture the rejection immediately so it doesn't become unhandled
    let rejectionError: Error | null = null;
    const stepPromise = ecsStep(mockWorld, { count: 1 }).catch((err: Error) => {
      rejectionError = err;
    });

    // Advance past the 5s timeout
    await vi.advanceTimersByTimeAsync(5001);
    await stepPromise;

    expect(rejectionError).not.toBeNull();
    expect(rejectionError!.message).toContain('Step timeout');
    expect(rejectionError!.message).toContain('render loop may not be running');

    vi.useRealTimers();
  });

  it('should resolve normally when render loop calls update within timeout', async () => {
    vi.resetModules();
    const { installDebugHook, ecsPause, ecsStep } = await import(
      '../../src/mcp/ecs-debug-tools.js'
    );

    const mockWorld = {
      update: (_delta: number, _time: number) => {},
      getSystems: () => [],
      entityManager: { getEntityByIndex: () => null, indexLookup: [] },
    } as any;

    installDebugHook(mockWorld);
    ecsPause(mockWorld);

    vi.useFakeTimers();

    const stepPromise = ecsStep(mockWorld, { count: 1 });

    // Simulate the render loop calling the patched update
    // (which triggers stepResolve)
    mockWorld.update(1 / 72, 100);

    // Allow microtasks to settle
    await vi.advanceTimersByTimeAsync(0);

    const result = await stepPromise;
    expect(result.framesAdvanced).toBe(1);

    vi.useRealTimers();
  });

  it('should throw when not paused', async () => {
    vi.resetModules();
    const { installDebugHook, ecsStep } = await import(
      '../../src/mcp/ecs-debug-tools.js'
    );

    const mockWorld = {
      update: () => {},
      getSystems: () => [],
      entityManager: { getEntityByIndex: () => null, indexLookup: [] },
    } as any;

    installDebugHook(mockWorld);

    await expect(ecsStep(mockWorld, { count: 1 })).rejects.toThrow(
      'Cannot step when ECS is not paused',
    );
  });
});

describe('ecsFindEntities', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { ComponentRegistry } = (await import('elics')) as any;
    ComponentRegistry._clear();
  });

  it('lists mutable content before LevelRoot infrastructure entities', async () => {
    const { ComponentRegistry } = (await import('elics')) as any;
    const { ecsFindEntities } = await import(
      '../../src/mcp/ecs-debug-tools.js'
    );

    const Transform = { id: 'Transform', schema: {} };
    const LevelTag = { id: 'LevelTag', schema: {} };
    const LevelRoot = { id: 'LevelRoot', schema: {} };
    ComponentRegistry._register(Transform);
    ComponentRegistry._register(LevelTag);
    ComponentRegistry._register(LevelRoot);

    const createEntity = (index: number, name: string, components: any[]) => ({
      index,
      active: true,
      object3D: { name },
      hasComponent: (component: any) => components.includes(component),
      getComponents: () => components,
    });

    const world = {
      entityManager: {
        indexLookup: [
          null,
          createEntity(1, 'LevelRoot', [Transform, LevelTag, LevelRoot]),
          createEntity(2, 'Robot', [Transform, LevelTag]),
        ],
      },
    } as any;

    const result = ecsFindEntities(world, { withComponents: ['LevelTag'] });

    expect(result.entities.map((entity) => entity.entityIndex)).toEqual([2, 1]);
    expect(result.total).toBe(2);
  });

  it('falls back to component ids when debug queries see an unregistered component bitmask', async () => {
    const { ComponentRegistry } = (await import('elics')) as any;
    const { ecsFindEntities } = await import(
      '../../src/mcp/ecs-debug-tools.js'
    );

    const Robot = { bitmask: null, id: 'Robot', schema: {} };
    ComponentRegistry._register(Robot);

    const world = {
      entityManager: {
        indexLookup: [
          null,
          {
            active: true,
            getComponents: () => [Robot],
            hasComponent: vi.fn(() => {
              throw new Error('hasComponent should not be called');
            }),
            index: 1,
            object3D: { name: 'Robot' },
          },
        ],
      },
    } as any;

    expect(ecsFindEntities(world, { withComponents: ['Robot'] })).toMatchObject(
      {
        entities: [
          {
            componentIds: ['Robot'],
            entityIndex: 1,
            name: 'Robot',
          },
        ],
        total: 1,
      },
    );
    expect(
      ecsFindEntities(world, { withoutComponents: ['Robot'] }),
    ).toMatchObject({
      entities: [],
      total: 0,
    });
  });
});
