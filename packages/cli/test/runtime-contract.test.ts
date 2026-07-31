/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, expect, test } from 'vitest';
import {
  RUNTIME_MCP_TOOLS,
  SCENE_MCP_TOOL_NAMES,
  getRuntimeOperationByToolName,
  resolveRuntimeOperationRequest,
} from '../src/runtime-contract.js';

describe('runtime contract scene tools', () => {
  test('exposes exactly the file-first scene surface', () => {
    const sceneTools = RUNTIME_MCP_TOOLS.map((tool) => tool.name).filter(
      (name) => name.startsWith('scene_'),
    );

    expect(new Set(sceneTools)).toEqual(new Set(SCENE_MCP_TOOL_NAMES));
    expect(sceneTools).toHaveLength(9);
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
      properties: {},
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
