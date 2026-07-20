/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { iwsdkDev } from '../src/index.js';

type Middleware = (
  request: Readable & {
    headers: Record<string, string>;
    method?: string;
    url?: string;
  },
  response: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    end(body?: string): void;
    setHeader(name: string, value: string): void;
  },
  next: () => void,
) => void;

let tempRoot: string;
let previousManagedWorkspaceToken: string | undefined;

const TEST_MANAGED_WORKSPACE_TOKEN = 'test-managed-workspace-token';
const MANAGED_WORKSPACE_HEADERS = {
  'x-iwsdk-managed-workspace': TEST_MANAGED_WORKSPACE_TOKEN,
};

beforeEach(async () => {
  previousManagedWorkspaceToken =
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TEST_MANAGED_WORKSPACE_TOKEN;
  tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-editor-route-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(tempRoot, { recursive: true });
});

afterEach(async () => {
  if (previousManagedWorkspaceToken == null) {
    delete process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  } else {
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN =
      previousManagedWorkspaceToken;
  }
  await rm(tempRoot, { recursive: true, force: true });
});

describe('native editor route middleware', () => {
  test('serves the managed workspace shell with document endpoint configuration', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace?scene=public/scenes/custom.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('window.__IWSDK_MCP_PAGE_ROLE =');
    expect(response.body).toContain(
      '"/__iwsdk/editor/document?scene=public/scenes/custom.iwsdk.scene.json"',
    );
    expect(response.body).toContain(
      '<link rel="stylesheet" href="/@iwsdk-editor-styles.css" />',
    );
    expect(response.body).not.toContain('<style>');
  });

  test('serves the managed workspace shell in workspace-only mode', async () => {
    const middleware = createEditorMiddleware(tempRoot, {
      workspace: { enabled: true },
    });
    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace?scene=public/scenes/custom.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('window.__IWSDK_EDITOR_CONFIG =');
  });

  test('workspace-only headed mode suppresses duplicate Vite auto-open', () => {
    const plugin = iwsdkDev({ workspace: { enabled: true } });
    const userConfig: { server?: { open?: boolean } } = {};

    plugin.config?.(userConfig as never, {} as never);

    expect(userConfig.server?.open).toBe(false);
  });

  test('redirects unmanaged workspace and legacy editor routes to the runtime app', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const workspace = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace',
    );
    expect(workspace.statusCode).toBe(302);
    expect(workspace.headers.Location).toBe('/');

    const legacy = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor?scene=public/scenes/custom.iwsdk.scene.json',
    );
    expect(legacy.statusCode).toBe(302);
    expect(legacy.headers.Location).toBe('/');
  });

  test('redirects managed legacy editor URLs to the workspace and preserves scene query', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor?scene=public/scenes/custom.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(302);
    expect(response.headers.Location).toBe(
      '/__iwsdk/workspace?scene=public/scenes/custom.iwsdk.scene.json',
    );
  });

  test('serves the editor shell stylesheet as a virtual CSS module', async () => {
    const plugin = createConfiguredPlugin(tempRoot);
    const resolved = plugin.resolveId?.('/@iwsdk-editor-styles.css');
    expect(resolved).toBe('\0/@iwsdk-editor-styles.css');

    const css = plugin.load?.('\0/@iwsdk-editor-styles.css');
    expect(css).toContain('.editor-shell');
    expect(css).toContain('.inspector-title-edit');
  });

  test('serves the editor shell stylesheet to browser stylesheet requests', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const response = await runMiddleware(
      middleware,
      'GET',
      '/@iwsdk-editor-styles.css',
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/css; charset=utf-8');
    expect(response.body).toContain('.editor-shell');
    expect(response.body).toContain('.inspector-title-edit');
  });

  test('loads default JSON and saves valid scene documents inside the workspace', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const empty = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(empty.statusCode).toBe(200);
    expect(JSON.parse(empty.body)).toMatchObject({
      nodes: [],
      units: 'meters',
      version: 'iwsdk.scene.v1',
    });
    expect(empty.headers['X-IWSDK-Scene-Revision']).toBe('missing');

    const saved = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
      JSON.stringify({
        nodes: [{ id: 'cube' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body)).toMatchObject({
      path: 'public/scenes/scene.iwsdk.scene.json',
      previousRevision: 'missing',
      revision: expect.any(String),
      writtenRevision: expect.any(String),
    });
    await expect(
      readFile(
        path.join(tempRoot, 'public', 'scenes', 'scene.iwsdk.scene.json'),
        'utf8',
      ),
    ).resolves.toContain('"id": "cube"');
  });

  test('blocks stale scene document saves with revision conflicts', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const scenePath = path.join(
      tempRoot,
      'public',
      'scenes',
      'conflict.iwsdk.scene.json',
    );
    await mkdir(path.dirname(scenePath), { recursive: true });
    await writeFile(
      scenePath,
      JSON.stringify({
        nodes: [{ id: 'first' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      'utf8',
    );

    const opened = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const revision = opened.headers['X-IWSDK-Scene-Revision'];
    expect(opened.statusCode).toBe(200);
    expect(revision).toEqual(expect.any(String));

    const missingRevision = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      JSON.stringify({
        nodes: [{ id: 'second' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(missingRevision.statusCode).toBe(409);
    expect(JSON.parse(missingRevision.body)).toMatchObject({
      code: 'scene_revision_required',
      currentRevision: revision,
      path: 'public/scenes/conflict.iwsdk.scene.json',
    });

    await writeFile(
      scenePath,
      JSON.stringify({
        nodes: [{ id: 'external-writer' }, { id: 'extra-size' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      'utf8',
    );

    const stale = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      JSON.stringify({
        nodes: [{ id: 'second' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': revision,
      },
    );
    expect(stale.statusCode).toBe(409);
    const staleBody = JSON.parse(stale.body);
    expect(staleBody).toMatchObject({
      code: 'scene_revision_conflict',
      expectedRevision: revision,
      path: 'public/scenes/conflict.iwsdk.scene.json',
    });
    expect(staleBody.currentRevision).not.toBe(revision);

    const current = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const saved = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      JSON.stringify({
        nodes: [{ id: 'second' }],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      }),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': current.headers['X-IWSDK-Scene-Revision'],
      },
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body)).toMatchObject({
      path: 'public/scenes/conflict.iwsdk.scene.json',
      previousRevision: current.headers['X-IWSDK-Scene-Revision'],
      revision: expect.any(String),
      writtenRevision: expect.any(String),
    });
  });

  test('lists and creates managed scene files under public scenes', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const created = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({
        path: 'public/scenes/nested/new-scene.iwsdk.scene.json',
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body)).toMatchObject({
      document: {
        nodes: [],
        units: 'meters',
        version: 'iwsdk.scene.v1',
      },
      path: 'public/scenes/nested/new-scene.iwsdk.scene.json',
      previousRevision: 'missing',
      revision: expect.any(String),
      writtenRevision: expect.any(String),
    });

    const listed = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace/scenes',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(listed.statusCode).toBe(200);
    expect(JSON.parse(listed.body)).toMatchObject({
      files: [
        expect.objectContaining({
          path: 'public/scenes/nested/new-scene.iwsdk.scene.json',
          revision: expect.any(String),
        }),
      ],
    });
  });

  test('rejects scene creation outside public scenes or with the wrong suffix', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const outside = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({ path: '../outside.iwsdk.scene.json' }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(outside.statusCode).toBe(400);
    expect(JSON.parse(outside.body)).toMatchObject({
      error: expect.stringContaining('inside the Vite workspace root'),
    });

    const wrongSuffix = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({ path: 'public/scenes/scene.json' }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(wrongSuffix.statusCode).toBe(400);
    expect(JSON.parse(wrongSuffix.body)).toMatchObject({
      error: expect.stringContaining('.iwsdk.scene.json'),
    });
  });

  test('rejects unmanaged editor document access', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
    );

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('managed workspace browser'),
    });
  });

  test('rejects scene document paths outside the workspace', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=../outside.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('inside the Vite workspace root'),
    });
  });

  test('rejects document paths outside public scenes', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=src/scene.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('inside public/scenes'),
    });
  });
});

function createEditorMiddleware(
  root: string,
  options: Parameters<typeof iwsdkDev>[0] = { ai: { mode: 'agent' } },
): Middleware {
  const plugin = createConfiguredPlugin(root, options);
  const middlewares: Middleware[] = [];
  plugin.configureServer?.({
    httpServer: { on: vi.fn() },
    middlewares: {
      use: (middleware: Middleware) => {
        middlewares.push(middleware);
      },
    },
  } as never);

  expect(middlewares).toHaveLength(1);
  return middlewares[0];
}

function createConfiguredPlugin(
  root: string,
  options: Parameters<typeof iwsdkDev>[0] = { ai: { mode: 'agent' } },
) {
  const plugin = iwsdkDev(options);
  plugin.configResolved?.({
    command: 'serve',
    root,
    server: {},
  } as never);
  return plugin;
}

function runMiddleware(
  middleware: Middleware,
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
) {
  return new Promise<{
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const request = Readable.from(body ? [body] : []) as Readable & {
      headers: Record<string, string>;
      method?: string;
      url?: string;
    };
    request.headers = headers;
    request.method = method;
    request.url = url;
    const response = {
      body: '',
      headers: {} as Record<string, string>,
      statusCode: 0,
      end: (responseBody?: string) => {
        response.body = responseBody ?? '';
        resolve(response);
      },
      setHeader: (name: string, value: string) => {
        response.headers[name] = value;
      },
    };

    try {
      middleware(request, response, () =>
        reject(new Error(`Unexpected next() for ${method} ${url}`)),
      );
    } catch (error) {
      reject(error);
    }
  });
}
