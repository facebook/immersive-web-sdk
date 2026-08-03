/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  MAX_SCENE_MODEL_PAYLOAD_BYTES,
  MAX_SCENE_TOTAL_MODEL_PAYLOAD_BYTES,
} from '@iwsdk/scene-composition';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  Group,
  LoadingManager,
  Material,
  Object3D,
  REVISION,
  Texture,
  WebGLRenderer,
} from '../../runtime/index.js';
import { CacheManager } from '../cache-manager.js';
import {
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  loadCachedAsset,
} from './cached-asset-load.js';

/** Default maximum combined response size for one staged model. */
export const DEFAULT_MAX_MODEL_PAYLOAD_BYTES = MAX_SCENE_MODEL_PAYLOAD_BYTES;

/** Default maximum combined primary-response size for staged scene models. */
export const DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES =
  MAX_SCENE_TOTAL_MODEL_PAYLOAD_BYTES;

/** Exact response-byte result from a detached, non-caching glTF load. */
export interface DetachedGLTFLoad {
  gltf: GLTF;
  payloadBytes: number;
}

/** Error raised when an actual model response exceeds its configured ceiling. */
export class GLTFPayloadLimitError extends Error {
  constructor(
    readonly url: string,
    readonly actualBytes: number,
    readonly limitBytes: number,
  ) {
    super(
      `Model payload "${url}" is ${actualBytes} bytes; the configured limit is ${limitBytes} bytes`,
    );
    this.name = 'GLTFPayloadLimitError';
  }
}

/** Options for retrieving a cached GLTF. @category Assets */
export interface GetGLTFOptions {
  /**
   * If true, return the cached GLTF directly (shared across calls).
   * Default `false`: returns a fresh clone whose `scene`/`scenes` are new
   * `Object3D` trees, allowing the same key to be used for multiple entities.
   * Geometries, materials, and animation clips remain shared by reference.
   */
  shared?: boolean;
}

const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.0`;

/**
 * GLTF loader with DRACO/KTX2 support, de-duplication, and caching.
 *
 * @category Assets
 */
export class GLTFAssetLoader {
  private static gltfLoader: GLTFLoader;
  private static dracoLoader: DRACOLoader;
  private static ktx2Loader: KTX2Loader;

  /**
   * Initialize loader instances and configure decoders/transcoders.
   * @param loadingManager Shared Three.js `LoadingManager`.
   * @param renderer Renderer used to detect KTX2 support.
   * @param options Optional decoder/transcoder paths (fall back to CDN paths matching Three r{REVISION}).
   */
  static init(
    loadingManager: LoadingManager,
    renderer: WebGLRenderer,
    options: {
      dracoDecoderPath?: string;
      ktx2TranscoderPath?: string;
    } = {},
  ): void {
    // Initialize DRACO loader
    this.dracoLoader = new DRACOLoader(loadingManager).setDecoderPath(
      options.dracoDecoderPath ?? `${THREE_PATH}/examples/jsm/libs/draco/gltf/`,
    );

    // Initialize KTX2 loader
    this.ktx2Loader = new KTX2Loader(loadingManager)
      .setTranscoderPath(
        options.ktx2TranscoderPath ?? `${THREE_PATH}/examples/jsm/libs/basis/`,
      )
      .detectSupport(renderer);

    // Initialize GLTF loader with compression support
    this.gltfLoader = new GLTFLoader(loadingManager)
      .setDRACOLoader(this.dracoLoader)
      .setKTX2Loader(this.ktx2Loader);
  }

  /**
   * Load a GLTF by URL, caching the result; optionally register a logical key.
   *
   * @remarks
   * Resolves with the cached `GLTF` instance directly. To retrieve a clone
   * suitable for placing into multiple entities, call {@link GLTFAssetLoader.getGLTF}
   * (or `AssetManager.getGLTF`) by key after the load resolves.
   */
  static loadGLTF(
    urlOrKey: string,
    key?: string,
    timeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS,
  ): Promise<GLTF> {
    const url = CacheManager.resolveUrl(urlOrKey);
    if (key) {
      CacheManager.setKeyToUrl(key, url);
    }
    return loadCachedAsset({
      discard: disposeGLTFResources,
      load: (resolve, reject) => {
        this.gltfLoader.load(
          url,
          resolve,
          () => {}, // progress callback
          reject,
        );
      },
      timeoutMs,
      url,
    });
  }

  /**
   * Fetch and parse a glTF without touching the shared URL, promise, or key
   * caches. The glTF/GLB response plus external glTF buffers and images are
   * measured from their actual decoded bytes; `Content-Length` is used only as
   * an early rejection signal.
   */
  static async loadGLTFDetached(
    url: string,
    maxPayloadBytes = DEFAULT_MAX_MODEL_PAYLOAD_BYTES,
  ): Promise<DetachedGLTFLoad> {
    const primary = await fetchResponseBytes(url, maxPayloadBytes);
    let payloadBytes = primary.bytes.byteLength;
    let parseBytes = primary.bytes;
    const objectUrls: string[] = [];
    try {
      if (!isGLB(primary.bytes)) {
        const json = tryParseGLTFJson(primary.bytes);
        if (json != null) {
          const dependencies = collectExternalGLTFDependencies(json);
          const objectUrlByUri = new Map<string, string>();
          for (const dependency of dependencies) {
            let objectUrl = objectUrlByUri.get(dependency.uri);
            if (objectUrl == null) {
              const resolvedUrl = resolveDependencyUrl(dependency.uri, url);
              let loaded: FetchedResponseBytes;
              try {
                loaded = await fetchResponseBytes(
                  resolvedUrl,
                  maxPayloadBytes - payloadBytes,
                );
              } catch (error) {
                if (error instanceof GLTFPayloadLimitError) {
                  throw new GLTFPayloadLimitError(
                    url,
                    payloadBytes + error.actualBytes,
                    maxPayloadBytes,
                  );
                }
                throw error;
              }
              payloadBytes += loaded.bytes.byteLength;
              const dependencyPayload = new ArrayBuffer(
                loaded.bytes.byteLength,
              );
              new Uint8Array(dependencyPayload).set(loaded.bytes);
              objectUrl = URL.createObjectURL(
                new Blob([dependencyPayload], {
                  type: loaded.contentType ?? 'application/octet-stream',
                }),
              );
              objectUrls.push(objectUrl);
              objectUrlByUri.set(dependency.uri, objectUrl);
            }
            dependency.owner.uri = objectUrl;
          }
          parseBytes = new TextEncoder().encode(JSON.stringify(json));
        }
      }
      const resourcePath = url.slice(0, Math.max(0, url.lastIndexOf('/') + 1));
      const payload = new ArrayBuffer(parseBytes.byteLength);
      new Uint8Array(payload).set(parseBytes);
      const gltf = await this.gltfLoader.parseAsync(payload, resourcePath);
      return { gltf, payloadBytes };
    } finally {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    }
  }

  /** Clone a glTF object tree while retaining its renderer resources by reference. */
  static cloneGLTF(gltf: GLTF): GLTF {
    return {
      ...gltf,
      scene: cloneSkinned(gltf.scene) as Group,
      scenes: gltf.scenes.map((scene) => cloneSkinned(scene) as Group),
    };
  }

  /**
   * Get a cached GLTF by logical key.
   *
   * @remarks
   * By default, returns a fresh clone: `scene` and `scenes` are new
   * `Object3D` trees (correctly handling `SkinnedMesh`/`Bone` hierarchies),
   * while geometries, materials, `animations`, `cameras`, `asset`,
   * `parser`, and `userData` remain shared by reference. This makes it
   * safe to call `getGLTF(key)` once per entity — adding the result's
   * `scene` to multiple parents will not silently re-parent a single
   * shared object.
   *
   * Pass `{ shared: true }` to return the cached `GLTF` directly (the
   * pre-0.4.x behavior), e.g. for framework code that intentionally
   * mutates the canonical instance.
   */
  static getGLTF(key: string, options: GetGLTFOptions = {}): GLTF | null {
    const cached = CacheManager.getAssetByKey(key) as GLTF | undefined;
    if (!cached) {
      return null;
    }
    if (options.shared) {
      return cached;
    }
    return this.cloneGLTF(cached);
  }
}

/** Dispose every renderer resource reachable from a detached glTF scene tree. */
export function disposeGLTFResources(gltf: GLTF): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const visited = new Set<unknown>();
  const visitValue = (value: unknown): void => {
    if (value == null || typeof value !== 'object' || visited.has(value)) {
      return;
    }
    visited.add(value);
    if ((value as Texture).isTexture === true) {
      textures.add(value as Texture);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visitValue);
      return;
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      visitValue(nested);
    }
  };
  const roots = new Set<Object3D>([gltf.scene, ...gltf.scenes]);
  for (const root of roots) {
    root.traverse((object) => {
      const renderable = object as Object3D & {
        geometry?: { dispose(): void };
        material?: Material | Material[];
        skeleton?: { boneTexture?: Texture };
      };
      if (renderable.geometry?.dispose != null) {
        geometries.add(renderable.geometry);
      }
      const objectMaterials = Array.isArray(renderable.material)
        ? renderable.material
        : renderable.material != null
          ? [renderable.material]
          : [];
      for (const material of objectMaterials) {
        materials.add(material);
        visitValue(material);
      }
      visitValue(renderable.skeleton?.boneTexture);
    });
  }
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function parseContentLength(value: string | null): number | null {
  if (value == null || !/^\d+$/.test(value)) {
    return null;
  }
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

interface FetchedResponseBytes {
  bytes: Uint8Array;
  contentType: string | null;
}

interface ExternalGLTFDependency {
  owner: { uri: string };
  uri: string;
}

async function fetchResponseBytes(
  url: string,
  maxPayloadBytes: number,
): Promise<FetchedResponseBytes> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load model resource "${url}": ${response.status} ${response.statusText}`,
    );
  }
  const declaredBytes = parseContentLength(
    response.headers.get('content-length'),
  );
  if (declaredBytes != null && declaredBytes > maxPayloadBytes) {
    await response.body?.cancel().catch(() => {});
    throw new GLTFPayloadLimitError(url, declaredBytes, maxPayloadBytes);
  }
  return {
    bytes: await readResponseBytes(response, url, maxPayloadBytes),
    contentType: response.headers.get('content-type'),
  };
}

function isGLB(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46
  );
}

function tryParseGLTFJson(bytes: Uint8Array): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value != null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function collectExternalGLTFDependencies(
  json: Record<string, unknown>,
): ExternalGLTFDependency[] {
  const dependencies: ExternalGLTFDependency[] = [];
  for (const collectionName of ['buffers', 'images'] as const) {
    const collection = json[collectionName];
    if (!Array.isArray(collection)) {
      continue;
    }
    for (const value of collection) {
      if (
        value != null &&
        typeof value === 'object' &&
        typeof (value as { uri?: unknown }).uri === 'string' &&
        !isEmbeddedGLTFUri((value as { uri: string }).uri)
      ) {
        dependencies.push({
          owner: value as { uri: string },
          uri: (value as { uri: string }).uri,
        });
      }
    }
  }
  return dependencies;
}

function isEmbeddedGLTFUri(uri: string): boolean {
  return uri.startsWith('data:') || uri.startsWith('blob:');
}

function resolveDependencyUrl(uri: string, modelUrl: string): string {
  const base =
    globalThis.location == null
      ? new URL(modelUrl, 'https://iwsdk.local/')
      : new URL(modelUrl, globalThis.location.href);
  return new URL(uri, base).href;
}

async function readResponseBytes(
  response: Response,
  url: string,
  maxPayloadBytes: number,
): Promise<Uint8Array> {
  if (response.body == null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertPayloadWithinLimit(url, bytes.byteLength, maxPayloadBytes);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value == null) {
        continue;
      }
      byteLength += value.byteLength;
      assertPayloadWithinLimit(url, byteLength, maxPayloadBytes);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertPayloadWithinLimit(
  url: string,
  actualBytes: number,
  limitBytes: number,
): void {
  if (actualBytes > limitBytes) {
    throw new GLTFPayloadLimitError(url, actualBytes, limitBytes);
  }
}
