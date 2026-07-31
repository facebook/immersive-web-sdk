/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { AnyComponent } from '../ecs/component.js';
import type { Entity } from '../ecs/entity.js';
import { createSystem } from '../ecs/system.js';
import {
  LightBinding,
  type LightColor,
  type LightSpec,
} from './light-binding.js';
import {
  AmbientLightComponent,
  DirectionalLightComponent,
  HemisphereLightComponent,
  PointLightComponent,
  RectAreaLightComponent,
  SpotLightComponent,
} from './light-components.js';

const COMPONENTS = [
  AmbientLightComponent,
  HemisphereLightComponent,
  DirectionalLightComponent,
  PointLightComponent,
  SpotLightComponent,
  RectAreaLightComponent,
] as const;

type ComponentId = (typeof COMPONENTS)[number]['id'];

export class LightSystem extends createSystem({
  ambientLights: { required: [AmbientLightComponent] },
  directionalLights: { required: [DirectionalLightComponent] },
  hemisphereLights: { required: [HemisphereLightComponent] },
  pointLights: { required: [PointLightComponent] },
  rectAreaLights: { required: [RectAreaLightComponent] },
  spotLights: { required: [SpotLightComponent] },
}) {
  private readonly bindings = new Map<Entity, Map<ComponentId, LightBinding>>();

  init(): void {
    const entries = [
      [this.queries.ambientLights, AmbientLightComponent],
      [this.queries.hemisphereLights, HemisphereLightComponent],
      [this.queries.directionalLights, DirectionalLightComponent],
      [this.queries.pointLights, PointLightComponent],
      [this.queries.spotLights, SpotLightComponent],
      [this.queries.rectAreaLights, RectAreaLightComponent],
    ] as const;
    for (const [query, component] of entries) {
      this.cleanupFuncs.push(
        query.subscribe(
          'qualify',
          (entity) => this.attach(entity as Entity, component),
          true,
        ),
        query.subscribe('disqualify', (entity) =>
          this.detach(entity as Entity, component.id as ComponentId),
        ),
      );
    }
  }

  update(): void {
    for (const [entity, byComponent] of this.bindings) {
      for (const component of COMPONENTS) {
        const binding = byComponent.get(component.id as ComponentId);
        if (binding == null) {
          continue;
        }
        binding.update(readLightSpec(entity, component));
        binding.syncTransform();
      }
    }
  }

  destroy(): void {
    for (const byComponent of this.bindings.values()) {
      for (const binding of byComponent.values()) {
        binding.dispose();
      }
    }
    this.bindings.clear();
    super.destroy();
  }

  private attach(entity: Entity, component: AnyComponent): void {
    if (entity.object3D == null) {
      return;
    }
    let byComponent = this.bindings.get(entity);
    if (byComponent == null) {
      byComponent = new Map();
      this.bindings.set(entity, byComponent);
    }
    const componentId = component.id as ComponentId;
    if (byComponent.has(componentId)) {
      return;
    }
    byComponent.set(
      componentId,
      new LightBinding(
        entity.object3D,
        this.world.scene,
        readLightSpec(entity, component),
      ),
    );
  }

  private detach(entity: Entity, componentId: ComponentId): void {
    const byComponent = this.bindings.get(entity);
    const binding = byComponent?.get(componentId);
    binding?.dispose();
    byComponent?.delete(componentId);
    if (byComponent?.size === 0) {
      this.bindings.delete(entity);
    }
  }
}

function readColor(
  entity: Entity,
  component: AnyComponent,
  field: string,
): LightColor {
  return (entity as any).getVectorView(component, field) as LightColor;
}

function readNumber(
  entity: Entity,
  component: AnyComponent,
  field: string,
): number {
  return Number(entity.getValue(component, field));
}

function readShadow(entity: Entity, component: AnyComponent) {
  return {
    castShadow: Boolean(entity.getValue(component, 'castShadow')),
    shadowBias: readNumber(entity, component, 'shadowBias'),
    shadowCameraFar: readNumber(entity, component, 'shadowCameraFar'),
    shadowCameraNear: readNumber(entity, component, 'shadowCameraNear'),
    shadowMapSize: readNumber(entity, component, 'shadowMapSize'),
    shadowNormalBias: readNumber(entity, component, 'shadowNormalBias'),
    shadowRadius: readNumber(entity, component, 'shadowRadius'),
  };
}

export function readLightSpec(
  entity: Entity,
  component: AnyComponent,
): LightSpec {
  switch (component.id) {
    case 'AmbientLight':
      return {
        color: readColor(entity, component, 'color'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'ambient',
      };
    case 'HemisphereLight':
      return {
        groundColor: readColor(entity, component, 'groundColor'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'hemisphere',
        skyColor: readColor(entity, component, 'skyColor'),
      };
    case 'DirectionalLight':
      return {
        color: readColor(entity, component, 'color'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'directional',
        shadowCameraSize: readNumber(entity, component, 'shadowCameraSize'),
        ...readShadow(entity, component),
      };
    case 'PointLight':
      return {
        color: readColor(entity, component, 'color'),
        decay: readNumber(entity, component, 'decay'),
        distance: readNumber(entity, component, 'distance'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'point',
        ...readShadow(entity, component),
      };
    case 'SpotLight':
      return {
        angleDeg: readNumber(entity, component, 'angleDeg'),
        color: readColor(entity, component, 'color'),
        decay: readNumber(entity, component, 'decay'),
        distance: readNumber(entity, component, 'distance'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'spot',
        penumbra: readNumber(entity, component, 'penumbra'),
        ...readShadow(entity, component),
      };
    case 'RectAreaLight':
      return {
        color: readColor(entity, component, 'color'),
        height: readNumber(entity, component, 'height'),
        intensity: readNumber(entity, component, 'intensity'),
        kind: 'rect-area',
        width: readNumber(entity, component, 'width'),
      };
    default:
      throw new Error(`Unsupported light component "${component.id}"`);
  }
}

/** Convert one serialized component payload to the shared light specification. */
export function lightSpecFromComponentValue(
  componentName: string,
  value: unknown,
): LightSpec | undefined {
  const componentId = componentName.startsWith('com.iwsdk.components.')
    ? componentName.slice('com.iwsdk.components.'.length)
    : componentName;
  const component = COMPONENTS.find((entry) => entry.id === componentId);
  if (component == null) {
    return undefined;
  }
  const payload =
    value != null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const field = (name: string) =>
    payload[name] ??
    (component.schema as Record<string, { default?: unknown }>)[name]?.default;
  const numeric = (name: string) => Number(field(name));
  const color = (name: string) => field(name) as LightColor;
  const shadow = () => ({
    castShadow: Boolean(field('castShadow')),
    shadowBias: numeric('shadowBias'),
    shadowCameraFar: numeric('shadowCameraFar'),
    shadowCameraNear: numeric('shadowCameraNear'),
    shadowMapSize: numeric('shadowMapSize'),
    shadowNormalBias: numeric('shadowNormalBias'),
    shadowRadius: numeric('shadowRadius'),
  });
  switch (componentId) {
    case 'AmbientLight':
      return {
        color: color('color'),
        intensity: numeric('intensity'),
        kind: 'ambient',
      };
    case 'HemisphereLight':
      return {
        groundColor: color('groundColor'),
        intensity: numeric('intensity'),
        kind: 'hemisphere',
        skyColor: color('skyColor'),
      };
    case 'DirectionalLight':
      return {
        color: color('color'),
        intensity: numeric('intensity'),
        kind: 'directional',
        shadowCameraSize: numeric('shadowCameraSize'),
        ...shadow(),
      };
    case 'PointLight':
      return {
        color: color('color'),
        decay: numeric('decay'),
        distance: numeric('distance'),
        intensity: numeric('intensity'),
        kind: 'point',
        ...shadow(),
      };
    case 'SpotLight':
      return {
        angleDeg: numeric('angleDeg'),
        color: color('color'),
        decay: numeric('decay'),
        distance: numeric('distance'),
        intensity: numeric('intensity'),
        kind: 'spot',
        penumbra: numeric('penumbra'),
        ...shadow(),
      };
    case 'RectAreaLight':
      return {
        color: color('color'),
        height: numeric('height'),
        intensity: numeric('intensity'),
        kind: 'rect-area',
        width: numeric('width'),
      };
  }
  return undefined;
}
