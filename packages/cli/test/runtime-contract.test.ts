/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  APP_RUNTIME_SCENE_MCP_TOOL_NAMES,
  RUNTIME_MCP_TOOLS,
  SCENE_MCP_TOOL_NAMES,
  getRuntimeOperationByToolName,
  resolveRuntimeOperationRequest,
} from '../src/runtime-contract.js';

describe('runtime contract scene tools', () => {
  test('exposes the file-first and app-runtime inspection surfaces', () => {
    const sceneTools = RUNTIME_MCP_TOOLS.map((tool) => tool.name).filter(
      (name) => name.startsWith('scene_'),
    );

    expect(new Set(sceneTools)).toEqual(
      new Set([...SCENE_MCP_TOOL_NAMES, ...APP_RUNTIME_SCENE_MCP_TOOL_NAMES]),
    );
    expect(sceneTools).toHaveLength(13);
    expect(
      RUNTIME_MCP_TOOLS.some((tool) => tool.name.startsWith('workspace_')),
    ).toBe(false);
  });

  test('routes every scene tool to the managed editor page', () => {
    for (const toolName of SCENE_MCP_TOOL_NAMES) {
      expect(getRuntimeOperationByToolName(toolName)).toMatchObject({
        mcpName: toolName,
        target: { role: 'editor' },
        wsMethod: toolName,
      });
    }
  });

  test('routes runtime inspection tools to the application page', () => {
    expect(
      getRuntimeOperationByToolName('scene_get_render_stats'),
    ).toMatchObject({
      cliPath: ['scene', 'render-stats'],
      wsMethod: 'get_render_stats',
    });
    expect(
      getRuntimeOperationByToolName('scene_get_runtime_hierarchy'),
    ).toMatchObject({
      cliPath: ['scene', 'runtime-hierarchy'],
      wsMethod: 'get_scene_hierarchy',
    });
    expect(
      getRuntimeOperationByToolName('scene_get_object_transform'),
    ).toMatchObject({
      cliPath: ['scene', 'transform'],
      wsMethod: 'get_object_transform',
    });
    for (const toolName of APP_RUNTIME_SCENE_MCP_TOOL_NAMES) {
      expect(getRuntimeOperationByToolName(toolName)?.target).toBeUndefined();
    }
  });

  test('makes render-file the validate, compose, and PNG operation', () => {
    const render = getRuntimeOperationByToolName('scene_render_file');

    expect(render).toMatchObject({
      cliPath: ['scene', 'render-file'],
      target: { role: 'editor' },
      wsMethod: 'scene_render_file',
    });
    expect(render?.inputSchema.required).toEqual(['path']);
    expect(render?.description).toContain('Invalid files');
    expect(render?.description).toContain('PNG');
  });

  test('exposes one-way hash-verified scene flattening', () => {
    const flatten = getRuntimeOperationByToolName('scene_flatten_file');
    expect(flatten).toMatchObject({
      cliPath: ['scene', 'flatten'],
      target: { role: 'editor' },
      wsMethod: 'scene_flatten_file',
    });
    expect(flatten?.inputSchema.required).toEqual(['path']);
    expect(flatten?.description).toContain('runtime-loadable');
  });

  test('describes the consolidated live scene state', () => {
    const state = getRuntimeOperationByToolName('scene_get_state');

    expect(state).toMatchObject({
      cliPath: ['scene', 'state'],
      target: { role: 'editor' },
      wsMethod: 'scene_get_state',
    });
    expect(state?.description).toContain('source/composed/runtime hashes');
    expect(state?.description).toContain('conflict');
  });

  test('retains deterministic camera and screenshot controls', () => {
    const screenshot = getRuntimeOperationByToolName('scene_screenshot');
    const camera = getRuntimeOperationByToolName('scene_set_camera');

    expect(screenshot?.inputSchema.properties?.orbitStep).toMatchObject({
      type: 'number',
    });
    expect(camera?.inputSchema.properties?.viewId).toMatchObject({
      type: 'string',
    });
    expect(screenshot?.inputSchema.properties?.captureMode).toMatchObject({
      enum: ['render', 'editor'],
    });
  });

  test('routes browser screenshots exclusively to the app runtime', () => {
    const operation = getRuntimeOperationByToolName('browser_screenshot');
    expect(operation).toMatchObject({
      target: { role: 'app' },
    });
    expect(operation?.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        expectedTab: expect.objectContaining({ type: 'object' }),
      },
    });
    expect(resolveRuntimeOperationRequest(operation!, {})).toEqual({
      params: {},
      target: { role: 'app' },
    });
    expect(() =>
      resolveRuntimeOperationRequest(operation!, { target: 'editor' }),
    ).toThrow(
      'browser_screenshot does not accept parameters; it always captures the application runtime',
    );
  });

  test('turns result._tab into a strict routing precondition', () => {
    const operation = getRuntimeOperationByToolName('scene_get_state')!;
    expect(
      resolveRuntimeOperationRequest(operation, {
        expectedTab: { id: 'tab-1', generation: 7 },
      }),
    ).toEqual({
      params: {},
      target: { role: 'editor', pageId: 'tab-1', tabGeneration: 7 },
    });
    expect(() =>
      resolveRuntimeOperationRequest(operation, {
        expectedTab: { id: 'tab-1', generation: 0 },
      }),
    ).toThrow(/expectedTab requires/);
  });

  test('rejects runtime requests that omit required parameters', () => {
    const operation = getRuntimeOperationByToolName('xr_set_gamepad_state');

    expect(() =>
      resolveRuntimeOperationRequest(operation!, {
        handedness: 'right',
        buttonIndex: 3,
      }),
    ).toThrow('xr_set_gamepad_state requires parameter: device');
    expect(() => resolveRuntimeOperationRequest(operation!, [])).toThrow(
      'xr_set_gamepad_state requires an object with parameter: device',
    );
    expect(
      resolveRuntimeOperationRequest(operation!, {
        device: 'controller-right',
        buttons: [{ index: 3, value: 1 }],
      }),
    ).toEqual({
      params: {
        device: 'controller-right',
        buttons: [{ index: 3, value: 1 }],
      },
      target: undefined,
    });
  });

  test('exposes isolated UIKitML rendering as an editor-targeted image tool', () => {
    const assets = getRuntimeOperationByToolName('ui_list_assets');
    const operation = getRuntimeOperationByToolName('ui_render_preview');
    expect(assets).toMatchObject({
      cliPath: ['ui', 'assets'],
      target: { role: 'editor' },
      wsMethod: 'ui_list_assets',
    });
    expect(operation).toMatchObject({
      cliPath: ['ui', 'render-preview'],
      target: { role: 'editor' },
      wsMethod: 'ui_render_preview',
    });
    expect(operation?.inputSchema.required).toEqual(['assetId']);
  });
});
