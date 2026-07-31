/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCENE_VERSION,
  composeSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
  type SceneDocument,
  type SceneImportResolveRequest,
  type SceneModuleResolution,
} from '../src/index.js';

function emptyScene(overrides: Partial<SceneDocument> = {}): SceneDocument {
  return {
    version: CURRENT_SCENE_VERSION,
    units: 'meters',
    resources: {},
    nodes: [],
    ...overrides,
  };
}

function makeLeafModule(): SceneDocument {
  return emptyScene({
    environment: {
      exposure: 5,
    },
    resources: {
      prefabs: [
        {
          id: 'seat',
          root: {
            id: 'seat-root',
            content: { type: 'asset', asset: 'chair' },
          },
        },
      ],
    },
    nodes: [
      {
        id: 'anchor',
        content: { type: 'group' },
      },
      {
        id: 'chair',
        content: { type: 'asset', asset: 'chair' },
        components: {
          'com.iwsdk.components.Spin': {
            enabled: true,
          },
        },
      },
      {
        id: 'seat-instance',
        content: {
          type: 'instance',
          prefab: 'seat',
          overrides: {
            'seat-root': {
              components: {
                'com.iwsdk.components.Spin': {
                  enabled: false,
                },
              },
            },
          },
        },
      },
    ],
  });
}

describe('scene module composition', () => {
  it('composes nested imports while keeping manifest asset IDs global', async () => {
    const leaf = makeLeafModule();
    const middle = emptyScene({
      imports: [
        {
          id: 'chair-kit',
          src: './leaf/leaf.scene.json',
          transform: { rotationDeg: [0, 45, 0] },
        },
      ],
      environment: { exposure: 4 },
      nodes: [{ id: 'middle-root', content: { type: 'group' } }],
    });
    const root = emptyScene({
      components: {
        'com.iwsdk.components.DomeGradient': { intensity: 0.75 },
      },
      imports: [
        {
          id: 'showroom',
          src: './modules/middle.scene.json',
          transform: { position: [1, 2, 3], scale: 2 },
        },
      ],
      authoring: { views: [] },
      environment: {
        exposure: 1,
      },
      nodes: [{ id: 'root-node', content: { type: 'group' } }],
    });

    const requests: SceneImportResolveRequest[] = [];
    const result = await composeSceneDocument(root, {
      source: '/project/root.scene.json',
      resolve(request) {
        requests.push(request);
        if (request.namespace === 'showroom') {
          return {
            source: '/project/modules/middle.scene.json',
            document: middle,
          };
        }
        return {
          source: '/project/modules/leaf/leaf.scene.json',
          document: leaf,
        };
      },
    });

    expect(result.document.components).toEqual({
      'com.iwsdk.components.DomeGradient': { intensity: 0.75 },
    });

    expect(requests).toEqual([
      {
        id: 'showroom',
        src: './modules/middle.scene.json',
        importer: '/project/root.scene.json',
        namespace: 'showroom',
      },
      {
        id: 'chair-kit',
        src: './leaf/leaf.scene.json',
        importer: '/project/modules/middle.scene.json',
        namespace: 'showroom/chair-kit',
      },
    ]);
    expect(result.dependencies).toEqual([
      {
        id: 'showroom',
        namespace: 'showroom',
        src: './modules/middle.scene.json',
        source: '/project/modules/middle.scene.json',
        importer: '/project/root.scene.json',
      },
      {
        id: 'chair-kit',
        namespace: 'showroom/chair-kit',
        src: './leaf/leaf.scene.json',
        source: '/project/modules/leaf/leaf.scene.json',
        importer: '/project/modules/middle.scene.json',
      },
    ]);
    expect(result.document.imports).toBeUndefined();
    expect(result.document.authoring).toEqual({ views: [] });
    expect(result.document.environment).toEqual(root.environment);
    expect(result.document.nodes).toMatchObject([
      { id: 'root-node' },
      {
        id: 'showroom',
        content: { type: 'group' },
        transform: { position: [1, 2, 3], scale: 2 },
        children: [
          { id: 'showroom/middle-root' },
          {
            id: 'showroom/chair-kit',
            transform: { rotationDeg: [0, 45, 0] },
            children: [
              { id: 'showroom/chair-kit/anchor' },
              {
                id: 'showroom/chair-kit/chair',
                content: { type: 'asset', asset: 'chair' },
                components: {
                  'com.iwsdk.components.Spin': {
                    enabled: true,
                  },
                },
              },
              {
                id: 'showroom/chair-kit/seat-instance',
                content: {
                  prefab: 'showroom/chair-kit/seat',
                  overrides: {
                    'showroom/chair-kit/seat-root': {
                      components: {
                        'com.iwsdk.components.Spin': {
                          enabled: false,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ]);
    expect(result.document.resources).toMatchObject({
      prefabs: [
        {
          id: 'showroom/chair-kit/seat',
          root: {
            id: 'showroom/chair-kit/seat-root',
            content: { type: 'asset', asset: 'chair' },
          },
        },
      ],
    });
    expect(validateSceneDocument(result.document)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('does not namespace manifest asset IDs referenced by imported modules', async () => {
    const module = emptyScene({
      nodes: [{ id: 'subject', content: { type: 'asset', asset: 'model' } }],
    });
    const { document } = await composeSceneDocument(
      emptyScene({ imports: [{ id: 'remote', src: './module.json' }] }),
      {
        resolve: () => ({
          source: 'https://example.com/scenes/modules/module.json',
          document: module,
        }),
      },
    );

    expect(document.nodes[0].children?.[0]).toMatchObject({
      id: 'remote/subject',
      content: { type: 'asset', asset: 'model' },
    });
  });

  it('rejects canonical-source cycles', async () => {
    const moduleA = emptyScene({
      imports: [{ id: 'b', src: './b.scene.json' }],
    });
    const moduleB = emptyScene({
      imports: [{ id: 'a-again', src: './a.scene.json' }],
    });
    const root = emptyScene({
      imports: [{ id: 'a', src: './a.scene.json' }],
    });

    await expect(
      composeSceneDocument(root, {
        resolve({ src }): SceneModuleResolution {
          return src.includes('b.scene')
            ? { source: '/modules/b.scene.json', document: moduleB }
            : { source: '/modules/a.scene.json', document: moduleA };
        },
      }),
    ).rejects.toThrow(
      'Scene import cycle detected: /modules/a.scene.json -> /modules/b.scene.json -> /modules/a.scene.json',
    );
  });

  it('rejects unsafe import IDs before calling the resolver', async () => {
    let resolverCalled = false;
    await expect(
      composeSceneDocument(
        emptyScene({ imports: [{ id: '../outside', src: './module.json' }] }),
        {
          resolve: () => {
            resolverCalled = true;
            return { source: '/module.json', document: emptyScene() };
          },
        },
      ),
    ).rejects.toThrow('import id must start with an ASCII letter');
    expect(resolverCalled).toBe(false);
  });

  it('rejects invalid resolved modules with source context', async () => {
    const invalidModule = emptyScene({
      nodes: [
        {
          id: 'broken',
          content: { type: 'asset', asset: '' },
        },
      ],
    });

    await expect(
      composeSceneDocument(
        emptyScene({ imports: [{ id: 'broken', src: './broken.json' }] }),
        {
          resolve: () => ({
            source: '/modules/broken.json',
            document: JSON.stringify(invalidModule),
          }),
        },
      ),
    ).rejects.toThrow(
      'scene module "/modules/broken.json" at "broken" is invalid',
    );
  });

  it('is deterministic regardless of resolver latency', async () => {
    const root = emptyScene({
      imports: [
        { id: 'first', src: './first.json' },
        { id: 'second', src: './second.json' },
      ],
    });
    const modules = {
      first: emptyScene({
        nodes: [{ id: 'node', content: { type: 'group' } }],
      }),
      second: emptyScene({
        nodes: [{ id: 'node', content: { type: 'group' } }],
      }),
    };
    const composeWithDelays = (firstDelay: number, secondDelay: number) =>
      composeSceneDocument(root, {
        source: '/root.json',
        async resolve(request) {
          const delay = request.id === 'first' ? firstDelay : secondDelay;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return {
            source: `/modules/${request.id}.json`,
            document: modules[request.id as keyof typeof modules],
          };
        },
      });

    const slowFirst = await composeWithDelays(15, 0);
    const slowSecond = await composeWithDelays(0, 15);
    expect(serializeSceneDocument(slowFirst.document)).toBe(
      serializeSceneDocument(slowSecond.document),
    );
    expect(slowFirst.dependencies).toEqual(slowSecond.dependencies);
    expect(slowFirst.dependencies.map((entry) => entry.namespace)).toEqual([
      'first',
      'second',
    ]);
  });
});
