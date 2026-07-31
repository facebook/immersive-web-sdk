/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  AssetType,
  RenderableAssetRegistry,
} from '../../src/asset/asset-manager.js';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from '../../src/runtime/index.js';

describe('RenderableAssetRegistry', () => {
  it('instantiates parentless Object3D prototypes without reparenting them', async () => {
    const geometry = new BoxGeometry(2, 4, 6);
    const material = new MeshStandardMaterial({ color: 0x336699 });
    const prototype = new Group();
    prototype.name = 'Procedural cabinet';
    prototype.add(new Mesh(geometry, material));

    const registry = new RenderableAssetRegistry({ cabinet: prototype });
    const first = await registry.instantiate('cabinet');
    const second = await registry.instantiate('cabinet');
    const firstMesh = first.children[0] as Mesh;
    const secondMesh = second.children[0] as Mesh;

    expect(first).not.toBe(second);
    expect(first).not.toBe(prototype);
    expect(firstMesh.geometry).toBe(geometry);
    expect(firstMesh.material).toBe(material);
    expect(secondMesh.geometry).toBe(geometry);
    expect(secondMesh.material).toBe(material);
    expect(prototype.parent).toBeNull();
    expect(registry.list()).toEqual(
      expect.arrayContaining([
        {
          bounds: { min: [-1, -2, -3], max: [1, 2, 3] },
          id: 'cabinet',
          kind: 'procedural',
          name: 'Procedural cabinet',
        },
      ]),
    );
  });

  it('rejects prototypes that already belong to another hierarchy', () => {
    const parent = new Group();
    const child = new Group();
    parent.add(child);

    expect(() => new RenderableAssetRegistry({ child })).toThrow(
      'must not have a parent',
    );
  });

  it('catalogs and instantiates UIKitML through its document factory', async () => {
    const panel = new Group();
    const instantiateUIKitML = async () => panel;
    const registry = new RenderableAssetRegistry(
      {
        ambience: { type: AssetType.Audio, url: '/ambience.mp3' },
        menu: {
          name: 'Main menu',
          type: AssetType.UIKitML,
          url: '/ui/menu.uikitml',
        },
        room: { name: 'Room', type: AssetType.GLTF, url: '/room.glb' },
      },
      { instantiateUIKitML },
    );

    expect(registry.has('ambience')).toBe(false);
    expect(registry.has('room')).toBe(true);
    expect(registry.has('menu')).toBe(true);
    expect(registry.hasRenderable('menu')).toBe(false);
    expect(registry.list()).toEqual(
      expect.arrayContaining([{ id: 'room', kind: 'gltf', name: 'Room' }]),
    );
    expect(registry.catalog()).toEqual(
      expect.arrayContaining([
        { id: 'room', kind: 'gltf', name: 'Room' },
        {
          id: 'menu',
          kind: 'uikitml',
          name: 'Main menu',
          url: '/ui/menu.uikitml',
        },
      ]),
    );
    await expect(registry.instantiate('menu')).resolves.toBe(panel);
  });

  it('offers a concise set of built-in primitive assets', async () => {
    const registry = new RenderableAssetRegistry();

    expect(registry.catalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'primitive-box', kind: 'primitive' }),
        expect.objectContaining({
          id: 'primitive-capsule',
          kind: 'primitive',
        }),
        expect.objectContaining({
          id: 'primitive-cylinder',
          kind: 'primitive',
        }),
        expect.objectContaining({
          id: 'primitive-sphere',
          kind: 'primitive',
        }),
      ]),
    );
    const first = await registry.instantiate<Mesh>('primitive-box');
    const second = await registry.instantiate<Mesh>('primitive-box');
    expect(first).not.toBe(second);
    expect(first.geometry).toBe(second.geometry);
  });
});
