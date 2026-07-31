/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { World } from '../ecs/world.js';
import {
  installDebugHook,
  ecsPause,
  ecsResume,
  ecsStep,
  ecsQueryEntity,
  ecsFindEntities,
  ecsListSystems,
  ecsListComponents,
  ecsToggleSystem,
  ecsSetComponent,
  ecsSnapshot,
  ecsDiff,
} from './ecs-debug-tools.js';
import {
  getObjectTransform,
  getRenderStats,
  getSceneHierarchy,
} from './scene-tools.js';

const SUPPORTED_METHODS = [
  'get_scene_hierarchy',
  'get_object_transform',
  'get_render_stats',
  'ecs_pause',
  'ecs_resume',
  'ecs_step',
  'ecs_query_entity',
  'ecs_find_entities',
  'ecs_list_systems',
  'ecs_list_components',
  'ecs_toggle_system',
  'ecs_set_component',
  'ecs_snapshot',
  'ecs_diff',
] as const;
type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

/**
 * MCP Runtime for IWSDK that provides framework-specific tools.
 * This is set on window.FRAMEWORK_MCP_RUNTIME during World.create()
 * for the vite-plugin-dev to route requests to.
 *
 * @category Runtime
 */
export class MCPRuntime {
  constructor(private world: World) {
    installDebugHook(world);
  }

  /**
   * Returns true if this runtime handles the given method.
   * Used by vite-plugin-dev to route requests appropriately.
   */
  handles(method: string): boolean {
    return SUPPORTED_METHODS.includes(method as SupportedMethod);
  }

  /**
   * Dispatch a method call. Returns result or throws an error.
   * @param method - The MCP tool name (e.g., 'get_scene_hierarchy')
   * @param params - Parameters passed to the tool
   * @returns Promise resolving to the tool result
   */
  async dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (method) {
      case 'get_scene_hierarchy':
        return getSceneHierarchy(this.world, params);
      case 'get_object_transform':
        return getObjectTransform(this.world, params);
      case 'get_render_stats':
        return getRenderStats(this.world);
      case 'ecs_pause':
        return ecsPause(this.world);
      case 'ecs_resume':
        return ecsResume(this.world);
      case 'ecs_step':
        return ecsStep(this.world, params);
      case 'ecs_query_entity':
        return ecsQueryEntity(this.world, params);
      case 'ecs_find_entities':
        return ecsFindEntities(this.world, params);
      case 'ecs_list_systems':
        return ecsListSystems(this.world);
      case 'ecs_list_components':
        return ecsListComponents();
      case 'ecs_toggle_system':
        return ecsToggleSystem(this.world, params);
      case 'ecs_set_component':
        return ecsSetComponent(this.world, params);
      case 'ecs_snapshot':
        return ecsSnapshot(this.world, params);
      case 'ecs_diff':
        return ecsDiff(this.world, params);
      default:
        throw new Error(
          `Unknown IWSDK method '${method}'. Available methods: ${SUPPORTED_METHODS.join(', ')}`,
        );
    }
  }
}
