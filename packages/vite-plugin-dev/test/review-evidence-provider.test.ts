/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { deflateSync } from 'zlib';
import {
  hashRuntimeSceneDocument,
  hashSceneDocument,
  type SceneDocument,
  type SceneReview,
} from '@iwsdk/scene-composition';
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

const TOKEN = 'review-evidence-provider-token';
const HEADERS = { 'x-iwsdk-managed-workspace': TOKEN };
const SCENE = 'public/scenes/review.iwsdk.scene.json';
const CAPABILITY_HASH = `sha256:${'c'.repeat(64)}` as const;
const SESSION_ID = 'scene-review-provider-test';
let previousToken: string | undefined;
let tempRoot: string;

beforeEach(async () => {
  previousToken = process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = TOKEN;
  tempRoot = path.join(
    os.tmpdir(),
    `iwsdk-review-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(path.join(tempRoot, 'public', 'scenes'), { recursive: true });
  await writeFile(
    path.join(tempRoot, SCENE),
    `${JSON.stringify(createScene(), null, 2)}\n`,
    'utf8',
  );
});

afterEach(async () => {
  if (previousToken == null) {
    delete process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN;
  } else {
    process.env.IWSDK_TEST_MANAGED_WORKSPACE_TOKEN = previousToken;
  }
  await rm(tempRoot, { force: true, recursive: true });
});

describe('managed review evidence routes', () => {
  test('verifies PNG hashes, rejects traversal, and writes idempotently', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const screenshotSha256 = hash(png);

    const mismatch = await issueCapture(middleware, png, {
      screenshotSha256: `sha256:${'0'.repeat(64)}`,
    });
    expect(mismatch.statusCode).toBe(400);
    expect(JSON.parse(mismatch.body)).toMatchObject({
      code: 'screenshot_hash_mismatch',
    });

    const issued = await issueCapture(middleware, png);
    expect(issued.statusCode).toBe(201);
    const captureToken = JSON.parse(issued.body).captureToken as string;
    const traversal = await persistCapture(
      middleware,
      captureToken,
      '../../outside',
    );
    expect(traversal.statusCode).toBe(400);
    expect(JSON.parse(traversal.body)).toMatchObject({
      code: 'invalid_capture_id',
    });

    const created = await persistCapture(
      middleware,
      captureToken,
      'hero-final',
    );
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(created.body);
    expect(createdBody).toMatchObject({
      bytes: png.length,
      captureId: 'hero-final',
      capabilityHash: CAPABILITY_HASH,
      documentHash: hashSceneDocument(createScene()),
      height: 3,
      metadataPath: expect.stringMatching(
        /^public\/scenes\/review\.iwsdk\.review\/evidence\/hero-final-[0-9a-f]{64}\.iwsdk\.review-capture\.json$/,
      ),
      path: expect.stringMatching(
        /^public\/scenes\/review\.iwsdk\.review\/evidence\/hero-final-[0-9a-f]{64}\.png$/,
      ),
      screenshotSha256,
      status: 'created',
      width: 2,
    });
    const metadata = JSON.parse(
      await readFile(path.join(tempRoot, createdBody.metadataPath), 'utf8'),
    );
    expect(metadata).toMatchObject({
      byteLength: png.length,
      captureToken,
      facts: {
        camera: {
          fov: 50,
          lookAt: [0, 0, 0],
          position: [4, 3, 4],
          projection: 'perspective',
          view: 'custom',
          viewId: 'hero',
        },
        lens: 'final',
        rendererEnvironment: {},
        visibleNodeIds: ['known-node'],
      },
      sessionIdSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      version: 'iwsdk.review-capture.v1',
    });

    const repeated = await persistCapture(
      middleware,
      captureToken,
      'hero-final',
    );
    expect(repeated.statusCode).toBe(200);
    expect(JSON.parse(repeated.body)).toMatchObject({
      path: createdBody.path,
      status: 'existing',
    });

    const maximumIssued = await issueCapture(middleware, png);
    const maximumId = await persistCapture(
      middleware,
      JSON.parse(maximumIssued.body).captureToken,
      'a'.repeat(128),
    );
    expect(maximumId.statusCode).toBe(201);
    const maximumIdBody = JSON.parse(maximumId.body);
    expect(path.basename(maximumIdBody.path).length).toBeLessThanOrEqual(255);
    expect(
      path.basename(maximumIdBody.metadataPath).length,
    ).toBeLessThanOrEqual(255);

    const unmanaged = await runMiddleware(
      middleware,
      'POST',
      '/__iwsdk/workspace/reviews/captures',
      JSON.stringify({}),
      {},
    );
    expect(unmanaged.statusCode).toBe(403);
  });

  test('rejects malformed PNGs and tokens not issued to the active session', async () => {
    const middleware = createMiddleware(tempRoot);
    const fakeHeader = createPngHeaderOnly(2, 3);
    const malformed = await issueCapture(middleware, fakeHeader);
    expect(malformed.statusCode).toBe(400);
    expect(JSON.parse(malformed.body)).toMatchObject({ code: 'invalid_png' });

    const validPng = createPng(2, 3);
    const truncated = await issueCapture(
      middleware,
      validPng.subarray(0, validPng.length - 5),
    );
    expect(truncated.statusCode).toBe(400);
    expect(JSON.parse(truncated.body)).toMatchObject({ code: 'invalid_png' });

    const corruptCrcPng = Buffer.from(validPng);
    corruptCrcPng[29] ^= 1;
    const corruptCrc = await issueCapture(middleware, corruptCrcPng);
    expect(corruptCrc.statusCode).toBe(400);
    expect(JSON.parse(corruptCrc.body)).toMatchObject({ code: 'invalid_png' });

    const unknown = await persistCapture(
      middleware,
      `sha256:${'f'.repeat(64)}`,
      'hero-final',
    );
    expect(unknown.statusCode).toBe(400);
    expect(JSON.parse(unknown.body)).toMatchObject({
      code: 'unknown_review_capture',
    });

    const issued = await issueCapture(middleware, validPng);
    const captureToken = JSON.parse(issued.body).captureToken;
    const wrongSession = await persistCapture(
      middleware,
      captureToken,
      'hero-final',
      'scene-other-session',
    );
    expect(wrongSession.statusCode).toBe(403);
    expect(JSON.parse(wrongSession.body)).toMatchObject({
      code: 'review_capture_session_mismatch',
    });

    const created = await persistCapture(
      middleware,
      captureToken,
      'hero-final',
    );
    expect(created.statusCode).toBe(201);
    const relabeledId = await persistCapture(
      middleware,
      captureToken,
      'different-id',
    );
    expect(relabeledId.statusCode).toBe(409);
    expect(JSON.parse(relabeledId.body)).toMatchObject({
      code: 'review_capture_id_mismatch',
    });
  });

  test('persists identical pixels independently across scene revisions', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const firstIssued = await issueCapture(middleware, png);
    const first = await persistCapture(
      middleware,
      JSON.parse(firstIssued.body).captureToken,
      'hero-final',
    );
    expect(first.statusCode).toBe(201);

    const changedScene: SceneDocument = {
      ...createScene(),
      nodes: [{ id: 'new-revision' }],
    };
    await writeFile(
      path.join(tempRoot, SCENE),
      `${JSON.stringify(changedScene, null, 2)}\n`,
      'utf8',
    );
    const secondIssued = await issueCapture(middleware, png, {
      documentHash: hashSceneDocument(changedScene),
      runtimeHash: hashRuntimeSceneDocument(changedScene),
    });
    const secondToken = JSON.parse(secondIssued.body).captureToken;
    const second = await persistCapture(middleware, secondToken, 'hero-final');
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(second.body)).toMatchObject({ status: 'created' });
    expect(JSON.parse(second.body).path).not.toBe(JSON.parse(first.body).path);

    const repeated = await persistCapture(
      middleware,
      secondToken,
      'hero-final',
    );
    expect(repeated.statusCode).toBe(200);
    expect(JSON.parse(repeated.body)).toMatchObject({
      metadataPath: JSON.parse(second.body).metadataPath,
      path: JSON.parse(second.body).path,
      status: 'existing',
    });
  });

  test('rejects a capture token bound to a stale scene revision', async () => {
    const middleware = createMiddleware(tempRoot);
    const changedScene: SceneDocument = {
      ...createScene(),
      nodes: [{ id: 'new-revision' }],
    };
    await writeFile(
      path.join(tempRoot, SCENE),
      `${JSON.stringify(changedScene, null, 2)}\n`,
      'utf8',
    );
    const png = createPng(2, 3);
    const response = await issueCapture(middleware, png);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'stale_review_capture',
      documentHash: hashSceneDocument(createScene()),
    });
  });

  test('rejects review evidence whose revision metadata was relabeled', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const screenshotSha256 = hash(png);
    const captureResponse = await issueAndPersistCapture(middleware, png);
    const capture = JSON.parse(captureResponse.body) as {
      metadataPath: string;
      path: string;
    };
    const metadataFile = path.join(tempRoot, capture.metadataPath);
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
    metadata.documentHash = `sha256:${'d'.repeat(64)}`;
    await writeFile(
      metadataFile,
      `${JSON.stringify(metadata, null, 2)}\n`,
      'utf8',
    );

    const response = await postReview(
      middleware,
      createReview(capture.path, screenshotSha256),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'invalid_review_evidence',
      issues: [
        expect.objectContaining({
          code: 'evidence-integrity',
          message: expect.stringContaining('revision metadata'),
        }),
      ],
    });
  });

  test('rejects review records that relabel trusted capture facts', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const screenshotSha256 = hash(png);
    const captureResponse = await issueAndPersistCapture(middleware, png);
    const capturePath = JSON.parse(captureResponse.body).path as string;
    const base = createReview(capturePath, screenshotSha256);
    const cameraRelabel = structuredClone(base);
    cameraRelabel.lenses[0].captures[0].camera.position = [99, 3, 4];
    const cameraResponse = await postReview(middleware, cameraRelabel);
    expect(cameraResponse.statusCode).toBe(400);
    expect(JSON.parse(cameraResponse.body).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'camera-mismatch' }),
      ]),
    );
    const variants = [
      (review: SceneReview) => {
        review.lenses[0].captures[0].rendererEnvironment = {
          renderer: 'relabeled',
        };
      },
      (review: SceneReview) => {
        review.lenses[0].captures[0].visibleNodeIds = [];
      },
    ];
    for (const mutate of variants) {
      const review = structuredClone(base);
      mutate(review);
      const response = await postReview(middleware, review);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toMatchObject({
        code: 'invalid_review_evidence',
        issues: [
          expect.objectContaining({
            code: 'evidence-integrity',
            message: expect.stringContaining('issued capture'),
          }),
        ],
      });
    }
  });

  test('validates, immutably saves, lists, and gets typed review records', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const screenshotSha256 = hash(png);
    const captureResponse = await issueAndPersistCapture(middleware, png);
    const capturePath = JSON.parse(captureResponse.body).path as string;
    const review = createReview(capturePath, screenshotSha256);

    const invalidSchema = await postReview(middleware, {
      ...review,
      unexpected: true,
    });
    expect(invalidSchema.statusCode).toBe(400);
    expect(JSON.parse(invalidSchema.body)).toMatchObject({
      code: 'invalid_scene_review',
    });

    const hashMismatch = await postReview(middleware, {
      ...review,
      documentHash: `sha256:${'d'.repeat(64)}`,
    });
    expect(hashMismatch.statusCode).toBe(400);
    expect(JSON.parse(hashMismatch.body).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'hash-mismatch' }),
      ]),
    );

    const capabilityMismatch = await postReview(
      middleware,
      review,
      `sha256:${'e'.repeat(64)}`,
    );
    expect(capabilityMismatch.statusCode).toBe(400);
    expect(JSON.parse(capabilityMismatch.body).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.capabilityHash' }),
      ]),
    );

    const invalidWaiver = await postReview(middleware, {
      ...review,
      waivers: [
        {
          authorizedBy: 'user',
          criterion: 'missing',
          feature: 'missing',
          reason: 'User accepted this gap.',
        },
      ],
    });
    expect(invalidWaiver.statusCode).toBe(400);
    expect(JSON.parse(invalidWaiver.body).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('waiver'),
        }),
      ]),
    );

    const created = await postReview(middleware, review);
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(created.body);
    expect(createdBody).toMatchObject({
      path: expect.stringMatching(
        /^public\/scenes\/review\.iwsdk\.review\/records\/round-000000-/,
      ),
      reviewSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      status: 'created',
      summary: {
        captureCount: 1,
        current: true,
        result: 'pass',
        round: 0,
      },
    });

    const repeated = await postReview(middleware, review);
    expect(repeated.statusCode).toBe(200);
    expect(JSON.parse(repeated.body)).toMatchObject({
      path: createdBody.path,
      status: 'existing',
    });

    const conflict = await postReview(middleware, {
      ...review,
      stop: { openDefectTags: [], reason: 'plateau' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body)).toMatchObject({
      code: 'immutable_review_conflict',
    });

    const listed = await runMiddleware(
      middleware,
      'GET',
      `/__iwsdk/workspace/reviews?scene=${encodeURIComponent(SCENE)}&capabilityHash=${encodeURIComponent(CAPABILITY_HASH)}`,
      '',
      HEADERS,
    );
    expect(listed.statusCode).toBe(200);
    expect(JSON.parse(listed.body).reviews).toEqual([
      expect.objectContaining({
        current: true,
        path: createdBody.path,
        version: 'iwsdk.scene-review.v1',
      }),
    ]);

    const fetched = await runMiddleware(
      middleware,
      'GET',
      `/__iwsdk/workspace/reviews?scene=${encodeURIComponent(SCENE)}&capabilityHash=${encodeURIComponent(CAPABILITY_HASH)}&path=${encodeURIComponent(createdBody.path)}`,
      '',
      HEADERS,
    );
    expect(fetched.statusCode).toBe(200);
    expect(JSON.parse(fetched.body)).toMatchObject({
      current: true,
      path: createdBody.path,
      review: { version: 'iwsdk.scene-review.v1' },
    });

    const escaped = await runMiddleware(
      middleware,
      'GET',
      `/__iwsdk/workspace/reviews?scene=${encodeURIComponent(SCENE)}&capabilityHash=${encodeURIComponent(CAPABILITY_HASH)}&path=${encodeURIComponent('../outside.iwsdk.scene-review.json')}`,
      '',
      HEADERS,
    );
    expect(escaped.statusCode).toBe(400);
    expect(JSON.parse(escaped.body)).toMatchObject({
      code: 'review_path_escape',
    });
  });

  test('requires adjacent immutable lineage for every correction round', async () => {
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const screenshotSha256 = hash(png);
    const persisted = await issueAndPersistCapture(middleware, png);
    const capturePath = JSON.parse(persisted.body).path as string;
    const initial = createReview(capturePath, screenshotSha256);
    const savedInitial = await postReview(middleware, initial);
    expect(savedInitial.statusCode).toBe(201);
    const initialIdentity = JSON.parse(savedInitial.body) as {
      path: string;
      reviewSha256: `sha256:${string}`;
    };

    const standalone = await postReview(middleware, {
      ...initial,
      round: 1,
    });
    expect(standalone.statusCode).toBe(400);
    expect(JSON.parse(standalone.body)).toMatchObject({
      code: 'invalid_review_lineage',
      issues: [expect.objectContaining({ code: 'lineage-required' })],
    });

    const wrongHash = await postReview(middleware, {
      ...initial,
      previousReview: {
        path: initialIdentity.path,
        reviewSha256: `sha256:${'0'.repeat(64)}`,
      },
      round: 1,
    });
    expect(wrongHash.statusCode).toBe(400);
    expect(JSON.parse(wrongHash.body)).toMatchObject({
      code: 'invalid_review_lineage',
      issues: [expect.objectContaining({ code: 'lineage-integrity' })],
    });

    const corrected = await postReview(middleware, {
      ...initial,
      capabilityHash:
        `sha256:${initial.capabilityHash.slice('sha256:'.length).toUpperCase()}` as `sha256:${string}`,
      previousReview: {
        path: initialIdentity.path,
        reviewSha256: initialIdentity.reviewSha256,
      },
      round: 1,
    });
    expect(corrected.statusCode).toBe(201);
    expect(JSON.parse(corrected.body)).toMatchObject({
      summary: { current: true, round: 1 },
    });
  });

  test('rejects claimed user waivers without a trusted approval artifact', async () => {
    const prompt = 'A known marker';
    const scene: SceneDocument = {
      ...createScene(),
      authoring: {
        composition: {
          feasibility: { status: 'supported' },
          features: [
            {
              acceptance: [
                {
                  id: 'known-present',
                  kind: 'presence',
                  nodeRefs: ['known-node'],
                  view: 'hero',
                },
              ],
              description: 'The known marker remains visible',
              id: 'known-feature',
              nodeRefs: ['known-node'],
              priority: 'optional',
            },
          ],
          input: { kind: 'text', prompt },
          mode: 'static',
          provenance: {
            adapter: { id: 'text-intake', version: '1.0.0' },
            capabilityHash: CAPABILITY_HASH,
            inputHashes: [hash(Buffer.from(prompt, 'utf8'))],
            skill: { id: 'iwsdk-scene-composer', version: '1.0.0' },
          },
          representationPolicy: {
            allowed: ['asset'],
            fidelityCeiling: 'static',
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
        views: createScene().authoring!.views,
      },
    };
    await writeFile(
      path.join(tempRoot, SCENE),
      `${JSON.stringify(scene, null, 2)}\n`,
      'utf8',
    );
    const middleware = createMiddleware(tempRoot);
    const png = createPng(2, 3);
    const issued = await issueCapture(middleware, png, {
      documentHash: hashSceneDocument(scene),
      runtimeHash: hashRuntimeSceneDocument(scene),
    });
    expect(issued.statusCode).toBe(201);
    const persisted = await persistCapture(
      middleware,
      JSON.parse(issued.body).captureToken,
      'hero-final',
    );
    const review = createReview(JSON.parse(persisted.body).path, hash(png));
    review.documentHash = hashSceneDocument(scene);
    review.runtimeHash = hashRuntimeSceneDocument(scene);
    review.sourceHashes = [hash(Buffer.from(prompt, 'utf8'))];
    review.result = 'accepted-with-gaps';
    review.featureResults = [
      {
        criterion: 'known-present',
        evidenceRefs: ['hero-final'],
        feature: 'known-feature',
        status: 'partial',
      },
    ];
    review.waivers = [
      {
        authorizedBy: 'user',
        criterion: 'known-present',
        feature: 'known-feature',
        reason: 'Claimed by an untrusted agent payload',
      },
    ];

    const response = await postReview(middleware, review);
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'trusted_review_waiver_unavailable',
    });
  });
});

function createScene(): SceneDocument {
  return {
    authoring: {
      views: [
        {
          fov: 50,
          id: 'hero',
          position: [4, 3, 4],
          projection: 'perspective',
          role: 'hero',
          target: [0, 0, 0],
        },
      ],
    },
    nodes: [{ id: 'known-node' }],
    resources: {},
    units: 'meters',
    version: 'iwsdk.scene.v1',
  };
}

function createReview(
  capturePath: string,
  screenshotSha256: `sha256:${string}`,
): SceneReview {
  const scene = createScene();
  return {
    capabilityHash: CAPABILITY_HASH,
    documentHash: hashSceneDocument(scene),
    featureResults: [],
    lenses: [
      {
        captures: [
          {
            camera: {
              fov: 50,
              position: [4, 3, 4],
              projection: 'perspective',
              target: [0, 0, 0],
            },
            height: 3,
            id: 'hero-final',
            path: capturePath,
            rendererEnvironment: {},
            screenshotSha256,
            view: 'hero',
            visibleNodeIds: ['known-node'],
            width: 2,
          },
        ],
        id: 'final',
        status: 'pass',
      },
    ],
    result: 'pass',
    round: 0,
    runtimeHash: hashRuntimeSceneDocument(scene),
    sourceHashes: [],
    stop: { openDefectTags: [], reason: 'success' },
    version: 'iwsdk.scene-review.v1',
    waivers: [],
  };
}

function createPngHeaderOnly(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function createPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      scanlines[row * (width * 4 + 1) + 1 + column * 4 + 3] = 255;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hash(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function issueCapture(
  middleware: Middleware,
  png: Buffer,
  overrides: Record<string, unknown> = {},
  sessionId = SESSION_ID,
) {
  const scene = createScene();
  return runMiddleware(
    middleware,
    'POST',
    '/__iwsdk/workspace/reviews/captures',
    JSON.stringify({
      action: 'issue',
      capture: {
        camera: {
          fov: 50,
          lookAt: [0, 0, 0],
          position: [4, 3, 4],
          projection: 'perspective',
          view: 'custom',
          viewId: 'hero',
        },
        capabilityHash: CAPABILITY_HASH,
        captureToken: `sha256:${'a'.repeat(64)}`,
        documentHash: hashSceneDocument(scene),
        featureState: {},
        height: 3,
        imageData: png.toString('base64'),
        lens: 'final',
        logs: [],
        mimeType: 'image/png',
        renderStats: { available: false, reason: 'test' },
        rendererEnvironment: {},
        runtimeHash: hashRuntimeSceneDocument(scene),
        screenshotHashAvailable: true,
        screenshotSha256: hash(png),
        visibilityAvailable: true,
        visibleNodeIds: ['known-node'],
        width: 2,
        ...overrides,
      },
      scene: SCENE,
      sessionId,
    }),
    HEADERS,
  );
}

function persistCapture(
  middleware: Middleware,
  captureToken: string,
  captureId: string,
  sessionId = SESSION_ID,
) {
  return runMiddleware(
    middleware,
    'POST',
    '/__iwsdk/workspace/reviews/captures',
    JSON.stringify({
      action: 'persist',
      captureId,
      captureToken,
      scene: SCENE,
      sessionId,
    }),
    HEADERS,
  );
}

async function issueAndPersistCapture(
  middleware: Middleware,
  png: Buffer,
  captureId = 'hero-final',
) {
  const issued = await issueCapture(middleware, png);
  expect(issued.statusCode).toBe(201);
  return persistCapture(
    middleware,
    JSON.parse(issued.body).captureToken,
    captureId,
  );
}

function postReview(
  middleware: Middleware,
  review: Record<string, unknown> | SceneReview,
  capabilityHash = CAPABILITY_HASH,
) {
  return runMiddleware(
    middleware,
    'POST',
    '/__iwsdk/workspace/reviews',
    JSON.stringify({ capabilityHash, review, scene: SCENE }),
    HEADERS,
  );
}

function createMiddleware(root: string): Middleware {
  const plugin = iwsdkDev({ workspace: { enabled: true, open: false } });
  plugin.configResolved?.({ command: 'serve', root, server: {} } as never);
  const middlewares: Middleware[] = [];
  plugin.configureServer?.({
    httpServer: { on: vi.fn() },
    middlewares: {
      use: (middleware: Middleware) => middlewares.push(middleware),
    },
  } as never);
  expect(middlewares).toHaveLength(1);
  return middlewares[0];
}

function runMiddleware(
  middleware: Middleware,
  method: string,
  url: string,
  body: string,
  headers: Record<string, string>,
) {
  return new Promise<{
    body: string;
    headers: Record<string, string>;
    statusCode: number;
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
      end(responseBody?: string) {
        this.body = responseBody ?? '';
        resolve(this);
      },
      setHeader(name: string, value: string) {
        this.headers[name] = value;
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
