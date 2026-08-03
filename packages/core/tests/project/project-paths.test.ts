/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeProjectModuleSourcePath,
  normalizeProjectSourcePath,
  projectSceneSourcePathToRuntimeUrl,
  validateIwsdkProjectManifest,
} from '../../src/project/index.js';

describe('project source paths', () => {
  it('normalizes root-confined scene and extensionless module paths', () => {
    expect(
      normalizeProjectSourcePath(
        'public/scenes/main.iwsdk.scene.json',
        'scene',
      ),
    ).toBe('./public/scenes/main.iwsdk.scene.json');
    expect(
      projectSceneSourcePathToRuntimeUrl(
        './public/scenes/main.iwsdk.scene.json',
      ),
    ).toBe('./scenes/main.iwsdk.scene.json');
    expect(normalizeProjectModuleSourcePath('src/assets')).toBe('./src/assets');
    expect(normalizeProjectModuleSourcePath('./src/components')).toBe(
      './src/components',
    );
  });

  it.each([
    ['../outside', 'module'],
    ['./src/../outside', 'module'],
    ['/absolute/assets', 'module'],
    ['C:/absolute/assets', 'module'],
    ['https://example.com/assets', 'module'],
    ['//server/share/assets', 'module'],
    ['./src/assets.ts', 'module'],
    ['./src/assets.js', 'module'],
    ['./src\\assets', 'module'],
    ['./src//assets', 'module'],
    ['./public/main.iwsdk.scene.json', 'scene'],
    ['./public/scenes/main.scene.json', 'scene'],
    ['./public/scenes/../main.iwsdk.scene.json', 'scene'],
    ['https://example.com/main.iwsdk.scene.json', 'scene'],
    ['./public/scenes/main.iwsdk.scene.json?draft=1', 'scene'],
  ] as const)('rejects unsafe %s %s paths', (sourcePath, kind) => {
    expect(() => normalizeProjectSourcePath(sourcePath, kind)).toThrow();
  });

  it('reports each bad project path at its manifest JSON path', () => {
    const result = validateIwsdkProjectManifest({
      version: 'iwsdk.project.v1',
      scene: '../main.iwsdk.scene.json',
      assets: { module: 'https://example.com/assets' },
      components: { module: './src/components.ts' },
      world: { xr: false },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.scene',
          code: 'invalid-path',
        }),
        expect.objectContaining({
          path: '$.assets.module',
          code: 'invalid-path',
        }),
        expect.objectContaining({
          path: '$.components.module',
          code: 'invalid-path',
        }),
      ]),
    );
  });
});
