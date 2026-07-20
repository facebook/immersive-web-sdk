/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  RUNTIME_MCP_TOOLS,
  SCENE_FILE_MCP_TOOL_NAMES,
  SCENE_EDITOR_MCP_TOOL_NAMES,
  WORKSPACE_MCP_TOOL_NAMES,
  getRuntimeOperationByToolName,
  resolveRuntimeOperationRequest,
} from '../src/runtime-contract.js';

describe('runtime contract scene editor tools', () => {
  test('lists every native scene editor MCP tool with editor routing', () => {
    const listedToolNames = new Set(RUNTIME_MCP_TOOLS.map((tool) => tool.name));

    for (const toolName of [
      ...SCENE_EDITOR_MCP_TOOL_NAMES,
      ...SCENE_FILE_MCP_TOOL_NAMES,
      ...WORKSPACE_MCP_TOOL_NAMES,
    ]) {
      expect(listedToolNames.has(toolName)).toBe(true);
      expect(getRuntimeOperationByToolName(toolName)).toMatchObject({
        mcpName: toolName,
        target: { role: 'editor' },
      });
    }
  });

  test('keeps legacy object transform on the app/framework runtime path', () => {
    expect(
      getRuntimeOperationByToolName('scene_get_object_transform'),
    ).toMatchObject({
      mcpName: 'scene_get_object_transform',
      wsMethod: 'get_object_transform',
    });
    expect(
      getRuntimeOperationByToolName('scene_get_object_transform')?.target,
    ).toBeUndefined();
  });

  test('documents deterministic orbit screenshot steps in the scene camera schema', () => {
    const screenshot = getRuntimeOperationByToolName('scene_screenshot');
    const camera = getRuntimeOperationByToolName('scene_set_camera');

    expect(screenshot?.inputSchema.properties?.orbitStep).toMatchObject({
      type: 'number',
    });
    expect(camera?.inputSchema.properties?.step).toMatchObject({
      type: 'number',
    });
  });

  test('routes browser screenshot by semantic target parameter', () => {
    const operation = getRuntimeOperationByToolName('browser_screenshot');
    expect(operation?.inputSchema.properties?.target).toMatchObject({
      enum: ['runtime', 'editor', 'workspace'],
    });
    expect(
      resolveRuntimeOperationRequest(operation!, {
        count: 1,
        target: 'runtime',
      }),
    ).toEqual({
      params: { __iwsdkScreenshotTarget: 'runtime', count: 1 },
      target: { role: 'app' },
    });
    expect(
      resolveRuntimeOperationRequest(operation!, {
        target: 'workspace',
      }),
    ).toEqual({
      params: { __iwsdkScreenshotTarget: 'workspace' },
      target: { role: 'editor' },
    });
    expect(() =>
      resolveRuntimeOperationRequest(operation!, { target: 'other' }),
    ).toThrow(/runtime, editor, or workspace/);
  });
});
