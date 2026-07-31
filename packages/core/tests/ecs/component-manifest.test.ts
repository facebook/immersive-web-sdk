/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { hashSceneComponentSchema } from '@iwsdk/scene-composition';
import { describe, expect, it } from 'vitest';
import { setComponentEditorMetadata } from '../../src/ecs/component-editor-metadata.js';
import {
  componentCatalogFromComponents,
  defineComponents,
  sceneComponentSchemaFromComponent,
} from '../../src/ecs/component-manifest.js';
import {
  ComponentRegistry,
  Types,
  createComponent,
} from '../../src/ecs/component.js';
import { IWSDK_LIGHT_COMPONENTS } from '../../src/lighting/light-components.js';

const ManifestCatalogTest = createComponent(
  'ManifestCatalogTest',
  {
    strength: {
      type: Types.Float32,
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'Strength',
      widget: 'slider',
    } as any,
    mode: {
      type: Types.Enum,
      default: 'soft',
      enum: { Soft: 'soft', Hard: 'hard' },
    },
    _runtimeHandle: { type: Types.Object, default: undefined },
  },
  'Manifest catalog test component',
);

const IntrinsicCatalogTest = setComponentEditorMetadata(
  createComponent('IntrinsicCatalogTest', {}),
  { hidden: true, intrinsic: true },
);

describe('component manifests', () => {
  it('preserves component identity and carries the Elics registry token', () => {
    const manifest = defineComponents([ManifestCatalogTest] as const);

    expect(manifest[0]).toBe(ManifestCatalogTest);
    expect(manifest.componentRegistry).toBe(ComponentRegistry);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.keys(manifest)).toEqual(['0']);
  });

  it('rejects duplicate component IDs', () => {
    expect(() =>
      defineComponents([ManifestCatalogTest, ManifestCatalogTest]),
    ).toThrow('Duplicate component manifest ID "ManifestCatalogTest"');
  });

  it('derives editor schemas from the executable component declaration', () => {
    const schema = sceneComponentSchemaFromComponent(ManifestCatalogTest, {
      source: 'app',
    });

    expect(schema).toMatchObject({
      id: 'ManifestCatalogTest',
      description: 'Manifest catalog test component',
      source: 'app',
      fields: {
        strength: {
          type: String(Types.Float32),
          default: 0.5,
          min: 0,
          max: 1,
          step: 0.05,
          label: 'Strength',
          widget: 'slider',
        },
        mode: {
          type: String(Types.Enum),
          default: 'soft',
          enum: { Soft: 'soft', Hard: 'hard' },
        },
        _runtimeHandle: {
          type: String(Types.Object),
          hidden: true,
        },
      },
    });
  });

  it('creates an ID-addressable catalog whose structural hash ignores presentation metadata', () => {
    const catalog = componentCatalogFromComponents([ManifestCatalogTest]);
    const schema = catalog.ManifestCatalogTest;
    const presentationVariant = {
      ...schema,
      name: 'Different display name',
      description: 'Different help text',
      fields: {
        ...schema.fields,
        strength: {
          ...schema.fields.strength,
          label: 'Different label',
          help: 'Different field help',
        },
      },
    };

    expect(schema).toBeDefined();
    expect(hashSceneComponentSchema(presentationVariant)).toBe(
      hashSceneComponentSchema(schema),
    );
  });

  it('publishes non-structural editor metadata from component identity', () => {
    const schema = sceneComponentSchemaFromComponent(IntrinsicCatalogTest);

    expect(schema.editor).toEqual({ hidden: true, intrinsic: true });
    expect(hashSceneComponentSchema(schema)).toBe(
      hashSceneComponentSchema({ ...schema, editor: undefined }),
    );
  });

  it('publishes the complete typed light component catalog', () => {
    const catalog = componentCatalogFromComponents(IWSDK_LIGHT_COMPONENTS, {
      source: 'iwsdk',
    });

    expect(Object.keys(catalog)).toEqual([
      'AmbientLight',
      'HemisphereLight',
      'DirectionalLight',
      'PointLight',
      'SpotLight',
      'RectAreaLight',
    ]);
    expect(catalog.AmbientLight.fields).toMatchObject({
      color: { default: [1, 1, 1, 1], widget: 'color' },
      intensity: { default: 1, min: 0, step: 0.1 },
    });
    expect(catalog.DirectionalLight.fields).toMatchObject({
      castShadow: { default: false },
      shadowCameraFar: { default: 100, min: 0.001 },
      shadowCameraNear: { default: 0.1, min: 0.001 },
      shadowCameraSize: { default: 10, min: 0.001 },
      shadowMapSize: {
        default: '1024',
        enum: {
          Size256: '256',
          Size512: '512',
          Size1024: '1024',
          Size2048: '2048',
        },
      },
    });
    expect(catalog.SpotLight.fields).toMatchObject({
      angleDeg: { default: 60, max: 90, min: 0.1 },
      decay: { default: 2, min: 0 },
      distance: { default: 0, min: 0 },
      penumbra: { default: 0, max: 1, min: 0 },
    });
    expect(catalog.RectAreaLight.fields).not.toHaveProperty('castShadow');
    expect(catalog.HemisphereLight.fields).not.toHaveProperty('castShadow');
  });
});
