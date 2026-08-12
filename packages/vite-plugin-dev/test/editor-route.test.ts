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
import {
  hashRuntimeSceneDocument,
  hashSceneDocument,
  hashSceneReviewContract,
  sha256,
  type SceneDocument,
} from '@iwsdk/scene-composition';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { iwsdkDev } from '../src/index.js';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock('open', () => ({ default: mocks.open }));

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

function sceneDocument(...nodeIds: string[]) {
  return {
    nodes: nodeIds.map((id) => ({ id })),
    resources: {},
    units: 'meters' as const,
    version: 'iwsdk.scene.v1' as const,
  };
}

function reviewWorkflowScene(): SceneDocument {
  const prompt = 'A blue box';
  return {
    authoring: {
      composition: {
        feasibility: { status: 'supported' },
        features: [
          {
            acceptance: [
              {
                id: 'box-present',
                kind: 'presence',
                nodeRefs: ['box'],
                view: 'hero',
              },
            ],
            description: 'A required blue box',
            id: 'box-feature',
            nodeRefs: ['box'],
            priority: 'required',
          },
        ],
        input: { kind: 'text', prompt },
        mode: 'static',
        provenance: {
          adapter: { id: 'route-test', version: '1' },
          capabilityHash: `sha256:${'c'.repeat(64)}`,
          inputHashes: [sha256(prompt)],
          skill: { id: 'iwsdk-scene-composer', version: '1' },
        },
        representationPolicy: {
          allowed: ['asset'],
          fidelityCeiling: 'test',
        },
        review: {
          heroView: 'hero',
          lenses: ['final'],
          maxCorrectionRounds: 2,
          requiredViews: ['hero'],
        },
        target: {
          assetPolicy: 'manifest-assets',
          surfaces: ['browser'],
        },
      },
      views: [
        {
          fov: 45,
          id: 'hero',
          position: [3, 2, 4],
          projection: 'perspective',
          role: 'hero',
          target: [0, 0, 0],
        },
      ],
    },
    nodes: [
      {
        content: { asset: 'blue-box', type: 'asset' },
        id: 'box',
      },
    ],
    resources: {},
    units: 'meters',
    version: 'iwsdk.scene.v1',
  };
}

beforeEach(async () => {
  mocks.open.mockReset();
  mocks.open.mockResolvedValue({});
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
  test('opens the resolved runtime origin in the default browser for managed requests', async () => {
    const plugin = createConfiguredPlugin(tempRoot);
    const middlewares: Middleware[] = [];
    plugin.configureServer?.({
      httpServer: { on: vi.fn() },
      middlewares: {
        use: (middleware: Middleware) => {
          middlewares.push(middleware);
        },
      },
      resolvedUrls: {
        local: ['https://localhost:4317/nested/path'],
        network: [],
      },
    } as never);
    expect(middlewares).toHaveLength(1);

    const unmanaged = await runMiddleware(
      middlewares[0],
      'POST',
      '/__iwsdk/workspace/open-runtime',
    );
    expect(unmanaged.statusCode).toBe(403);
    expect(mocks.open).not.toHaveBeenCalled();

    const wrongMethod = await runMiddleware(
      middlewares[0],
      'GET',
      '/__iwsdk/workspace/open-runtime',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers.Allow).toBe('POST');

    const opened = await runMiddleware(
      middlewares[0],
      'POST',
      '/__iwsdk/workspace/open-runtime',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(opened.statusCode).toBe(204);
    expect(mocks.open).toHaveBeenCalledWith('https://localhost:4317/', {
      wait: false,
    });
  });

  test('restores the scene after workflow commit failure and permits the same-token retry', async () => {
    const sceneRelativePath = 'public/scenes/retry.iwsdk.scene.json';
    const sceneFile = path.join(tempRoot, sceneRelativePath);
    await mkdir(path.dirname(sceneFile), { recursive: true });
    const blank = sceneDocument();
    await writeFile(sceneFile, `${JSON.stringify(blank, null, 2)}\n`, 'utf8');
    const middleware = createEditorMiddleware(tempRoot);
    const documentUrl = `/__iwsdk/editor/document?scene=${sceneRelativePath}`;
    const opened = await runMiddleware(
      middleware,
      'GET',
      documentUrl,
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const candidate = reviewWorkflowScene();
    const sessionId = 'retry-test-session';
    const authorized = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        candidate,
        expectedBaseDocumentHash: hashSceneDocument(blank),
        operation: 'replace-document',
        patch: { document: candidate, op: 'replaceDocument' },
        scene: sceneRelativePath,
        sessionId,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    const transitionToken = JSON.parse(authorized.body).transitionToken;
    const reviewRoot = path.join(tempRoot, 'public/scenes/retry.iwsdk.review');
    const workflowPath = path.join(
      reviewRoot,
      'workflow.iwsdk.review-workflow.json',
    );
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(
      workflowPath,
      `${JSON.stringify(
        {
          version: 'iwsdk.review-workflow.v1',
          phase: 'awaiting-review',
          contractHash: hashSceneReviewContract(candidate),
          documentHash: hashSceneDocument(candidate),
          runtimeHash: hashRuntimeSceneDocument(candidate),
          lockedMaxCorrectionRounds: 2,
          round: 0,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    const headers = {
      ...MANAGED_WORKSPACE_HEADERS,
      'if-match': opened.headers['X-IWSDK-Scene-Revision'],
      'x-iwsdk-review-transition': transitionToken,
      'x-iwsdk-scene-session': sessionId,
    };
    const failed = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      headers,
    );
    expect(failed.statusCode).toBe(409);
    expect(JSON.parse(failed.body)).toMatchObject({
      code: 'review_transition_race',
    });
    expect(JSON.parse(await readFile(sceneFile, 'utf8'))).toEqual(blank);

    await rm(workflowPath);
    const retried = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      headers,
    );
    expect(retried.statusCode).toBe(200);
    expect(JSON.parse(await readFile(sceneFile, 'utf8'))).toEqual(candidate);
  });

  test('retains a transition token across a revision conflict but binds it to the original base', async () => {
    const sceneRelativePath = 'public/scenes/revision-retry.iwsdk.scene.json';
    const sceneFile = path.join(tempRoot, sceneRelativePath);
    await mkdir(path.dirname(sceneFile), { recursive: true });
    const blank = sceneDocument();
    const blankBytes = `${JSON.stringify(blank, null, 2)}\n`;
    await writeFile(sceneFile, blankBytes, 'utf8');
    const middleware = createEditorMiddleware(tempRoot);
    const documentUrl = `/__iwsdk/editor/document?scene=${sceneRelativePath}`;
    const opened = await runMiddleware(
      middleware,
      'GET',
      documentUrl,
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const candidate = reviewWorkflowScene();
    const sessionId = 'revision-retry-session';
    const authorized = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        candidate,
        expectedBaseDocumentHash: hashSceneDocument(blank),
        operation: 'replace-document',
        patch: { document: candidate, op: 'replaceDocument' },
        scene: sceneRelativePath,
        sessionId,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    const transitionToken = JSON.parse(authorized.body).transitionToken;
    const headers = {
      ...MANAGED_WORKSPACE_HEADERS,
      'if-match': opened.headers['X-IWSDK-Scene-Revision'],
      'x-iwsdk-review-transition': transitionToken,
      'x-iwsdk-scene-session': sessionId,
    };
    await writeFile(
      sceneFile,
      JSON.stringify(sceneDocument('external')),
      'utf8',
    );
    const conflicted = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      headers,
    );
    expect(conflicted.statusCode).toBe(409);
    expect(JSON.parse(conflicted.body)).toMatchObject({
      code: 'scene_revision_conflict',
    });

    const current = await runMiddleware(
      middleware,
      'GET',
      documentUrl,
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const wrongBase = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      {
        ...headers,
        'if-match': current.headers['X-IWSDK-Scene-Revision'],
      },
    );
    expect(wrongBase.statusCode).toBe(409);
    expect(JSON.parse(wrongBase.body)).toMatchObject({
      code: 'review_transition_base_mismatch',
    });

    await writeFile(sceneFile, blankBytes, 'utf8');
    const retried = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      headers,
    );
    expect(retried.statusCode).toBe(200);
  });

  test('saves human edits without mutating external review workflow state', async () => {
    const sceneRelativePath = 'public/scenes/manual-workflow.iwsdk.scene.json';
    const sceneFile = path.join(tempRoot, sceneRelativePath);
    await mkdir(path.dirname(sceneFile), { recursive: true });
    const blank = sceneDocument();
    await writeFile(sceneFile, `${JSON.stringify(blank, null, 2)}\n`, 'utf8');
    const middleware = createEditorMiddleware(tempRoot);
    const documentUrl = `/__iwsdk/editor/document?scene=${sceneRelativePath}`;
    const opened = await runMiddleware(
      middleware,
      'GET',
      documentUrl,
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const candidate = reviewWorkflowScene();
    const sessionId = 'manual-edit-test-session';
    const authorized = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        candidate,
        expectedBaseDocumentHash: hashSceneDocument(blank),
        operation: 'replace-document',
        patch: { document: candidate, op: 'replaceDocument' },
        scene: sceneRelativePath,
        sessionId,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(authorized.statusCode).toBe(200);
    const transitionToken = JSON.parse(authorized.body).transitionToken;
    const materialized = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(candidate),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': opened.headers['X-IWSDK-Scene-Revision'],
        'x-iwsdk-review-transition': transitionToken,
        'x-iwsdk-scene-session': sessionId,
      },
    );
    expect(materialized.statusCode).toBe(200);
    expect(JSON.parse(materialized.body)).toMatchObject({
      workflowPhase: 'draft',
    });
    const runtimePreflightReceipt = await writePassingPreflightReceipt(
      sceneRelativePath,
      candidate,
    );
    const begun = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        action: 'begin-review',
        expectedDocumentHash: hashSceneDocument(candidate),
        runtimePreflightReceipt,
        scene: sceneRelativePath,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(begun.statusCode).toBe(200);
    expect(JSON.parse(begun.body)).toMatchObject({
      documentHash: hashSceneDocument(candidate),
      round: 0,
      status: 'review-begun',
      workflowPhase: 'awaiting-review',
    });

    const edited = structuredClone(candidate);
    edited.nodes[0].transform = { position: [1, 0, 0] };
    const humanSave = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(edited),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': JSON.parse(materialized.body).revision,
      },
    );
    expect(humanSave.statusCode).toBe(200);
    expect(JSON.parse(humanSave.body)).toMatchObject({
      correction: null,
      workflowPhase: null,
    });
    expect(JSON.parse(await readFile(sceneFile, 'utf8'))).toEqual(edited);
    const workflow = JSON.parse(
      await readFile(
        path.join(
          tempRoot,
          'public/scenes/manual-workflow.iwsdk.review/workflow.iwsdk.review-workflow.json',
        ),
        'utf8',
      ),
    );
    expect(workflow).toMatchObject({
      phase: 'awaiting-review',
      documentHash: hashSceneDocument(candidate),
      round: 0,
    });
    expect(workflow).not.toHaveProperty('headReview');
  });

  test('reports review phases only from explicit review endpoints', async () => {
    const sceneRelativePath = 'public/scenes/draft-workflow.iwsdk.scene.json';
    const sceneFile = path.join(tempRoot, sceneRelativePath);
    await mkdir(path.dirname(sceneFile), { recursive: true });
    await writeFile(
      sceneFile,
      `${JSON.stringify(sceneDocument(), null, 2)}\n`,
      'utf8',
    );
    const middleware = createEditorMiddleware(tempRoot);
    const documentUrl = `/__iwsdk/editor/document?scene=${sceneRelativePath}`;
    const opened = await runMiddleware(
      middleware,
      'GET',
      documentUrl,
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const draft = reviewWorkflowScene();
    const firstSave = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(draft),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': opened.headers['X-IWSDK-Scene-Revision'],
      },
    );
    expect(firstSave.statusCode).toBe(200);
    expect(JSON.parse(firstSave.body)).toMatchObject({
      documentHash: hashSceneDocument(draft),
      workflowPhase: null,
    });

    const refinedDraft = structuredClone(draft);
    refinedDraft.nodes[0].transform = { position: [0.5, 0, 0] };
    refinedDraft.authoring!.views![0].position = [4, 3, 6];
    const refinedSave = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(refinedDraft),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': JSON.parse(firstSave.body).revision,
      },
    );
    expect(refinedSave.statusCode).toBe(200);
    expect(JSON.parse(refinedSave.body)).toMatchObject({
      documentHash: hashSceneDocument(refinedDraft),
      workflowPhase: null,
    });

    const withoutPreflight = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        action: 'begin-review',
        expectedDocumentHash: hashSceneDocument(refinedDraft),
        scene: sceneRelativePath,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(withoutPreflight.statusCode).toBe(409);
    expect(JSON.parse(withoutPreflight.body)).toMatchObject({
      code: 'review_entry_evidence_incomplete',
      issues: [
        expect.objectContaining({
          code: 'runtime_preflight_receipt_required',
          retryAction: 'scene_runtime_preflight',
        }),
      ],
    });
    const runtimePreflightReceipt = await writePassingPreflightReceipt(
      sceneRelativePath,
      refinedDraft,
    );

    const begun = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        action: 'begin-review',
        expectedDocumentHash: hashSceneDocument(refinedDraft),
        runtimePreflightReceipt,
        scene: sceneRelativePath,
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(begun.statusCode).toBe(200);
    expect(JSON.parse(begun.body)).toMatchObject({
      workflowPhase: 'awaiting-review',
    });

    const unchangedSave = await runMiddleware(
      middleware,
      'PUT',
      documentUrl,
      JSON.stringify(refinedDraft),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': JSON.parse(refinedSave.body).revision,
      },
    );
    expect(unchangedSave.statusCode).toBe(200);
    expect(JSON.parse(unchangedSave.body)).toMatchObject({
      workflowPhase: null,
    });
  });

  test('rejects a full-document replacement disguised as a correction', async () => {
    const sceneRelativePath = 'public/scenes/operation-scope.iwsdk.scene.json';
    const sceneFile = path.join(tempRoot, sceneRelativePath);
    const current = reviewWorkflowScene();
    await mkdir(path.dirname(sceneFile), { recursive: true });
    await writeFile(sceneFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    const reviewRoot = path.join(
      tempRoot,
      'public/scenes/operation-scope.iwsdk.review',
    );
    const headReview = {
      path: 'public/scenes/operation-scope.iwsdk.review/records/round-0.json',
      reviewSha256: `sha256:${'a'.repeat(64)}`,
    };
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(
      path.join(reviewRoot, 'workflow.iwsdk.review-workflow.json'),
      `${JSON.stringify(
        {
          version: 'iwsdk.review-workflow.v1',
          phase: 'reviewed',
          contractHash: hashSceneReviewContract(current),
          documentHash: hashSceneDocument(current),
          runtimeHash: hashRuntimeSceneDocument(current),
          headReview,
          lockedMaxCorrectionRounds: 2,
          round: 0,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    const candidate = structuredClone(current);
    candidate.nodes[0].transform = { position: [1, 0, 0] };
    const response = await runMiddleware(
      createEditorMiddleware(tempRoot),
      'POST',
      '/__iwsdk/workspace/reviews/transitions',
      JSON.stringify({
        candidate,
        correction: {
          defectTags: ['position'],
          kind: 'scene',
          previousReview: headReview,
        },
        expectedBaseDocumentHash: hashSceneDocument(current),
        operation: 'replace-document',
        patch: { document: candidate, op: 'replaceDocument' },
        scene: sceneRelativePath,
        sessionId: 'operation-scope-session',
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'review_transition_operation_mismatch',
    });
  });

  test('serves the managed workspace shell at the authenticated origin root', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const response = await runMiddleware(
      middleware,
      'GET',
      '/?scene=public/scenes/custom.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('window.__IWSDK_MCP_PAGE_ROLE =');
    expect(response.body).toContain('"/__iwsdk/editor/document"');
    expect(response.body).not.toContain('/__iwsdk/editor/document?scene=');
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

  test('serves development over cached self-signed HTTPS by default', async () => {
    const plugin = iwsdkDev();
    const cacheDir = path.join(tempRoot, 'vite-cache');
    const userConfig: {
      cacheDir: string;
      root: string;
      server?: { https?: { cert?: string; key?: string } };
    } = { cacheDir, root: tempRoot };

    await plugin.config?.(userConfig as never, {
      command: 'serve',
      mode: 'development',
    });

    expect(userConfig.server?.https?.cert).toContain('BEGIN CERTIFICATE');
    expect(userConfig.server?.https?.key).toContain('BEGIN RSA PRIVATE KEY');
    const certPath = path.join(tempRoot, '.iwsdk', 'https', '_cert.pem');
    await expect(readFile(certPath, 'utf8')).resolves.toBe(
      userConfig.server?.https?.cert,
    );

    await rm(cacheDir, { force: true, recursive: true });
    const restartedConfig: typeof userConfig = { cacheDir, root: tempRoot };
    await iwsdkDev().config?.(restartedConfig as never, {
      command: 'serve',
      mode: 'development',
    });
    expect(restartedConfig.server?.https?.cert).toBe(
      userConfig.server?.https?.cert,
    );
  });

  test('preserves explicit HTTP and custom HTTPS configuration', async () => {
    const httpPlugin = iwsdkDev({ https: false });
    const httpConfig: { server?: { https?: unknown } } = {};
    await httpPlugin.config?.(httpConfig as never, {
      command: 'serve',
      mode: 'development',
    });
    expect(httpConfig.server?.https).toBeUndefined();

    const customHttps = { cert: 'custom-cert', key: 'custom-key' };
    const customPlugin = iwsdkDev();
    const customConfig = { server: { https: customHttps } };
    await customPlugin.config?.(customConfig as never, {
      command: 'serve',
      mode: 'development',
    });
    expect(customConfig.server.https).toBe(customHttps);
  });

  test('every auto-opened managed workspace suppresses Vite auto-open', () => {
    const plugin = iwsdkDev({ workspace: { enabled: true } });
    const userConfig: { server?: { open?: boolean } } = {};

    plugin.config?.(userConfig as never, {} as never);

    expect(userConfig.server?.open).toBe(false);

    const headlessPlugin = iwsdkDev({ ai: { mode: 'agent' } });
    const headlessConfig: { server?: { open?: boolean } } = {};
    headlessPlugin.config?.(headlessConfig as never, {} as never);
    expect(headlessConfig.server?.open).toBe(false);
  });

  test('keeps the TTF generator worker out of Vite dependency optimization', () => {
    const plugin = iwsdkDev();
    const userConfig: {
      optimizeDeps?: { exclude?: string[]; include?: string[] };
    } = {
      optimizeDeps: {
        exclude: ['existing-exclusion'],
        include: ['existing-inclusion'],
      },
    };

    plugin.config?.(userConfig as never, {} as never);

    expect(userConfig.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(['existing-exclusion', '@zappar/msdf-generator']),
    );
    expect(userConfig.optimizeDeps?.include).toEqual(
      expect.arrayContaining([
        'existing-inclusion',
        '@iwsdk/scene-composition',
        'three-viewport-gizmo',
        'three/examples/jsm/controls/OrbitControls.js',
        'three/examples/jsm/controls/TransformControls.js',
      ]),
    );
  });

  test('deduplicates Three.js without replacing user resolution settings', () => {
    const plugin = iwsdkDev();
    const userConfig: { resolve?: { dedupe?: string[] } } = {
      resolve: { dedupe: ['existing-dependency'] },
    };

    plugin.config?.(userConfig as never, {} as never);
    plugin.config?.(userConfig as never, {} as never);

    expect(userConfig.resolve?.dedupe).toEqual([
      'existing-dependency',
      'three',
    ]);
  });

  test('does not launch a workspace for AI disabled with IWER', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plugin = iwsdkDev({ ai: {}, emulator: { iwer: false } });
      const userConfig: { server?: { open?: boolean } } = {
        server: { open: true },
      };

      plugin.config?.(userConfig as never, {} as never);

      expect(userConfig.server?.open).toBe(true);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('AI agent tooling requires'),
      );
    } finally {
      warning.mockRestore();
    }
  });

  test('leaves ordinary and managed iframe root requests to the runtime app', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    await expectMiddlewareNext(middleware, 'GET', '/');
    await expectMiddlewareNext(middleware, 'GET', '/', {
      ...MANAGED_WORKSPACE_HEADERS,
      'sec-fetch-dest': 'iframe',
    });
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

    const css = await plugin.load?.('\0/@iwsdk-editor-styles.css');
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

  test('rejects missing scenes and saves existing scene documents', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const scenePath = path.join(
      tempRoot,
      'public',
      'scenes',
      'scene.iwsdk.scene.json',
    );

    const empty = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(empty.statusCode).toBe(404);
    expect(JSON.parse(empty.body)).toMatchObject({
      code: 'scene_file_not_found',
    });

    await mkdir(path.dirname(scenePath), { recursive: true });
    await writeFile(scenePath, JSON.stringify(sceneDocument('first')), 'utf8');
    const opened = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(opened.statusCode).toBe(200);

    const saved = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/scene.iwsdk.scene.json',
      JSON.stringify(sceneDocument('cube')),
      {
        ...MANAGED_WORKSPACE_HEADERS,
        'if-match': opened.headers['X-IWSDK-Scene-Revision'],
      },
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body)).toMatchObject({
      path: 'public/scenes/scene.iwsdk.scene.json',
      previousRevision: opened.headers['X-IWSDK-Scene-Revision'],
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
    await writeFile(scenePath, JSON.stringify(sceneDocument('first')), 'utf8');

    const opened = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    const revision = opened.headers['X-IWSDK-Scene-Revision'];
    expect(opened.statusCode).toBe(200);
    expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);

    const missingRevision = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      JSON.stringify(sceneDocument('second')),
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
      JSON.stringify(sceneDocument('external-writer', 'extra-size')),
      'utf8',
    );

    const stale = await runMiddleware(
      middleware,
      'PUT',
      '/__iwsdk/editor/document?scene=public/scenes/conflict.iwsdk.scene.json',
      JSON.stringify(sceneDocument('second')),
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
      JSON.stringify(sceneDocument('second')),
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

  test('serves a deterministic composed document with dependency hashes', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const sceneRoot = path.join(tempRoot, 'public', 'scenes');
    await mkdir(path.join(sceneRoot, 'modules'), { recursive: true });
    await writeFile(
      path.join(sceneRoot, 'modules', 'chair.iwsdk.scene.json'),
      JSON.stringify(sceneDocument('chair')),
      'utf8',
    );
    await writeFile(
      path.join(sceneRoot, 'room.iwsdk.scene.json'),
      JSON.stringify({
        version: 'iwsdk.scene.v1',
        units: 'meters',
        imports: [
          {
            id: 'reading-nook',
            src: './modules/chair.iwsdk.scene.json',
            transform: { position: [2, 0, 0] },
          },
        ],
        resources: {},
        nodes: [],
      }),
      'utf8',
    );

    const response = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/editor/document?scene=public/scenes/room.iwsdk.scene.json&mode=composed',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      dependencies: [
        {
          namespace: 'reading-nook',
          path: 'public/scenes/modules/chair.iwsdk.scene.json',
        },
      ],
      document: {
        nodes: [
          {
            id: 'reading-nook',
            transform: { position: [2, 0, 0] },
            children: [{ id: 'reading-nook/chair' }],
          },
        ],
      },
      sourceDocument: {
        imports: [{ id: 'reading-nook' }],
      },
      sourceDocumentHash: expect.stringMatching(/^sha256:/),
      runtimeHash: expect.stringMatching(/^sha256:/),
    });
  });

  test('lists managed scene files created through direct file authoring', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const scenePath = path.join(
      tempRoot,
      'public/scenes/nested/new-scene.iwsdk.scene.json',
    );
    await mkdir(path.dirname(scenePath), { recursive: true });
    await writeFile(scenePath, JSON.stringify(sceneDocument('new')), 'utf8');

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
          hasImports: false,
          path: 'public/scenes/nested/new-scene.iwsdk.scene.json',
          revision: expect.any(String),
        }),
      ],
    });
  });

  test('flattens an authoring composition only when runtime semantics are preserved', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const sceneRoot = path.join(tempRoot, 'public', 'scenes');
    await mkdir(path.join(sceneRoot, 'modules'), { recursive: true });
    await writeFile(
      path.join(sceneRoot, 'modules', 'chair.iwsdk.scene.json'),
      JSON.stringify(sceneDocument('chair')),
      'utf8',
    );
    await writeFile(
      path.join(sceneRoot, 'room.composition.iwsdk.scene.json'),
      JSON.stringify({
        version: 'iwsdk.scene.v1',
        units: 'meters',
        imports: [
          {
            id: 'reading-nook',
            src: './modules/chair.iwsdk.scene.json',
            transform: { position: [2, 0, 0] },
          },
        ],
        resources: {},
        nodes: [],
      }),
      'utf8',
    );

    const response = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({
        action: 'flatten',
        path: 'public/scenes/room.composition.iwsdk.scene.json',
        outputPath: 'public/scenes/room.iwsdk.scene.json',
      }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body);
    expect(result).toMatchObject({
      outputPath: 'public/scenes/room.iwsdk.scene.json',
      sourcePath: 'public/scenes/room.composition.iwsdk.scene.json',
      written: true,
    });
    expect(result.outputRuntimeHash).toBe(result.sourceRuntimeHash);
    const flattened = JSON.parse(
      await readFile(path.join(sceneRoot, 'room.iwsdk.scene.json'), 'utf8'),
    );
    expect(flattened.imports).toBeUndefined();
    expect(flattened.nodes).toEqual([
      expect.objectContaining({
        id: 'reading-nook',
        children: [expect.objectContaining({ id: 'reading-nook/chair' })],
      }),
    ]);
  });

  test('lists public project files within the requested schema constraints', async () => {
    const middleware = createEditorMiddleware(tempRoot);
    const audioRoot = path.join(tempRoot, 'public', 'audio');
    await mkdir(path.join(audioRoot, 'nested'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'textures'), { recursive: true });
    await writeFile(path.join(audioRoot, 'voice.mp3'), 'mp3', 'utf8');
    await writeFile(
      path.join(audioRoot, 'nested', 'ambient.wav'),
      'wav',
      'utf8',
    );
    await writeFile(path.join(audioRoot, 'notes.txt'), 'text', 'utf8');
    await writeFile(
      path.join(tempRoot, 'public', 'textures', 'sky.png'),
      'png',
      'utf8',
    );

    const listed = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace/files?subfolder=audio&fileTypes=.mp3,.wav',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(listed.statusCode).toBe(200);
    expect(JSON.parse(listed.body)).toEqual({
      files: [
        { path: './audio/nested/ambient.wav', size: 3 },
        { path: './audio/voice.mp3', size: 3 },
      ],
    });

    const outside = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace/files?subfolder=..',
      '',
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(outside.statusCode).toBe(400);

    const unmanaged = await runMiddleware(
      middleware,
      'GET',
      '/__iwsdk/workspace/files?subfolder=audio',
    );
    expect(unmanaged.statusCode).toBe(403);
  });

  test('rejects unsupported scene-file actions through the managed list endpoint', async () => {
    const middleware = createEditorMiddleware(tempRoot);

    const outside = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({ action: 'delete', path: '../outside.iwsdk.scene.json' }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(outside.statusCode).toBe(400);

    const wrongSuffix = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/scenes',
      JSON.stringify({ action: 'delete', path: 'public/scenes/scene.json' }),
      MANAGED_WORKSPACE_HEADERS,
    );
    expect(wrongSuffix.statusCode).toBe(400);
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

async function writePassingPreflightReceipt(
  sceneRelativePath: string,
  document: SceneDocument,
) {
  const sceneName = path
    .basename(sceneRelativePath)
    .replace(/\.iwsdk\.scene\.json$/, '');
  const report = {
    documentHash: hashSceneDocument(document),
    failedChecks: [],
    issuedBy: 'iwsdk-managed-workspace',
    passed: true,
    runtimeHash: hashRuntimeSceneDocument(document),
    scenePath: sceneRelativePath,
    version: 'iwsdk.runtime-preflight.v1',
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const receiptSha256 = sha256(serialized);
  const relativePath = path.posix.join(
    path.posix.dirname(sceneRelativePath),
    `${sceneName}.iwsdk.review`,
    'runtime',
    `preflight-${receiptSha256.slice('sha256:'.length)}.iwsdk.runtime-preflight.json`,
  );
  await mkdir(path.dirname(path.join(tempRoot, relativePath)), {
    recursive: true,
  });
  await writeFile(path.join(tempRoot, relativePath), serialized, 'utf8');
  return { path: relativePath, sha256: receiptSha256 };
}

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

function expectMiddlewareNext(
  middleware: Middleware,
  method: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = Readable.from([]) as Readable & {
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
      end: () => reject(new Error(`Unexpected response for ${method} ${url}`)),
      setHeader: () => {},
    };
    try {
      middleware(request, response, resolve);
    } catch (error) {
      reject(error);
    }
  });
}
