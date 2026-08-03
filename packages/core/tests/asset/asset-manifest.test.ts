/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ASSET_MANIFEST_BRAND,
  AssetType,
  RenderableAssetRegistry,
  defineAssets,
} from '../../src/asset/asset-manager.js';
import { Group } from '../../src/runtime/index.js';

describe('defineAssets', () => {
  it('preserves literal IDs/types and shallow-freezes only the container', () => {
    const prototype = new Group();
    const robot = {
      name: 'Robot',
      priority: 'lazy' as const,
      type: AssetType.GLTF,
      url: '/robot.glb',
    };
    const manifest = defineAssets({ prototype, robot });

    expectTypeOf(manifest.robot.type).toEqualTypeOf<AssetType.GLTF>();
    expectTypeOf(manifest.robot.priority).toEqualTypeOf<'lazy'>();
    expect(manifest.prototype).toBe(prototype);
    expect(manifest.robot).toBe(robot);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(prototype)).toBe(false);
    expect(Object.isFrozen(robot)).toBe(false);
    expect(manifest[ASSET_MANIFEST_BRAND]).toBe(1);
    expect(Object.keys(manifest)).toEqual(['prototype', 'robot']);
    expect(
      Object.getOwnPropertyDescriptor(manifest, ASSET_MANIFEST_BRAND),
    ).toMatchObject({ enumerable: false, writable: false });
  });

  it('rejects blank IDs and malformed URL-backed entries', () => {
    expect(() =>
      defineAssets({
        '   ': { type: AssetType.GLTF, url: '/model.glb' },
      }),
    ).toThrow('Asset IDs must not be blank');
    expect(() =>
      defineAssets({ missing: { type: AssetType.GLTF } } as any),
    ).toThrow('must have a nonblank URL');
    expect(() =>
      defineAssets({ blank: { type: AssetType.GLTF, url: '  ' } }),
    ).toThrow('must have a nonblank URL');
    expect(() =>
      defineAssets({ bad: { type: 'video', url: '/clip.mp4' } } as any),
    ).toThrow('unsupported type "video"');
    expect(() =>
      defineAssets({
        bad: { priority: 'eventually', type: AssetType.GLTF, url: '/x.glb' },
      } as any),
    ).toThrow('unsupported priority "eventually"');
    expect(() => defineAssets({ bad: null } as any)).toThrow(
      'must be a URL entry or Object3D prototype',
    );
  });

  it('rejects parented Object3D prototypes at declaration time', () => {
    const parent = new Group();
    const child = new Group();
    parent.add(child);

    expect(() => defineAssets({ child })).toThrow(
      'Renderable asset prototype "child" must not have a parent',
    );
  });

  it('keeps raw AssetManifest objects compatible with the registry', () => {
    const raw = {
      model: { priority: 'lazy' as const, type: AssetType.GLTF, url: '/x.glb' },
    };
    const registry = new RenderableAssetRegistry(raw);

    expect(registry.has('model')).toBe(true);
    expect(registry.catalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'model', kind: 'gltf' }),
      ]),
    );
  });
});
