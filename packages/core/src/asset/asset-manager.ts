/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneObject3D } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { World } from '../ecs/world.js';
import {
  Box3,
  LoadingManager,
  Object3D,
  Texture,
  WebGLRenderer,
} from '../runtime/index.js';
import { CacheManager } from './cache-manager.js';
import { AudioAssetLoader } from './loaders/audio-loader.js';
import {
  DEFAULT_MAX_MODEL_PAYLOAD_BYTES,
  DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES,
  disposeGLTFResources,
  GetGLTFOptions,
  GLTFAssetLoader,
} from './loaders/gltf-loader.js';
import { HDRTextureAssetLoader } from './loaders/hdr-texture-loader.js';
import { TextureAssetLoader } from './loaders/texture-loader.js';

export type { GetGLTFOptions } from './loaders/gltf-loader.js';
export {
  DEFAULT_MAX_MODEL_PAYLOAD_BYTES,
  DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES,
  GLTFPayloadLimitError,
} from './loaders/gltf-loader.js';

/** Payload ceilings applied to detached model resource preflight. */
export interface GLTFLoadTransactionLimits {
  maxModelPayloadBytes?: number;
  maxTotalModelPayloadBytes?: number;
}

export interface StagedGLTFLoad {
  gltf: GLTF;
  payloadBytes: number;
  source: 'cache' | 'detached';
  url: string;
}

/**
 * Asset types supported by the {@link AssetManager}.
 * @category Assets
 */
export enum AssetType {
  GLTF = 'gltf', // 3D models (cached)
  Audio = 'audio', // Audio buffers (cached)
  Texture = 'texture', // 3D textures (cached)
  HDRTexture = 'hdr-texture', // HDR/EXR equirect textures (cached)
}

export interface LoadableAssetManifestEntry {
  url: string;
  type: AssetType;
  priority?: 'critical' | 'background';
  /** Human-readable label used by authoring tools. */
  name?: string;
}

export type AssetManifestEntry = LoadableAssetManifestEntry | Object3D;

/**
 * Application asset catalog. Parentless Object3D entries are immutable
 * renderable prototypes; URL entries are loaded and cached by type.
 * @category Assets
 */
export interface AssetManifest {
  [key: string]: AssetManifestEntry;
}

export interface RenderableAssetInfo {
  id: string;
  kind: 'gltf' | 'object3d';
  name: string;
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * World-owned view of the application's renderable asset manifest.
 *
 * The registry never places registered prototypes into a scene. Each request
 * returns a hierarchy clone while retaining shared geometry and material
 * references, matching the existing glTF cache behavior.
 */
export class RenderableAssetRegistry {
  private readonly manifest: AssetManifest;

  constructor(manifest: AssetManifest = {}) {
    this.manifest = manifest;
    for (const [id, entry] of Object.entries(manifest)) {
      if (isObject3DManifestEntry(entry) && entry.parent != null) {
        throw new Error(
          `Renderable asset prototype "${id}" must not have a parent`,
        );
      }
    }
  }

  async preload(): Promise<void> {
    await AssetManager.preloadAssets(this.manifest);
  }

  has(id: string): boolean {
    return isRenderableManifestEntry(this.manifest[id]);
  }

  list(): RenderableAssetInfo[] {
    const result: RenderableAssetInfo[] = [];
    for (const [id, entry] of Object.entries(this.manifest)) {
      if (isObject3DManifestEntry(entry)) {
        result.push({
          bounds: boundsForPrototype(entry),
          id,
          kind: 'object3d',
          name: entry.name || id,
        });
      } else if (entry.type === AssetType.GLTF) {
        result.push({
          bounds: this.bounds(id),
          id,
          kind: 'gltf',
          name: entry.name || id,
        });
      }
    }
    return result;
  }

  bounds(id: string): RenderableAssetInfo['bounds'] | undefined {
    const entry = this.manifest[id];
    if (entry == null) {
      return undefined;
    }
    if (isObject3DManifestEntry(entry)) {
      return boundsForPrototype(entry);
    }
    if (entry.type !== AssetType.GLTF) {
      return undefined;
    }
    const gltf = AssetManager.getGLTF(id, { shared: true });
    return gltf == null ? undefined : boundsForPrototype(gltf.scene);
  }

  async instantiate(id: string): Promise<Object3D> {
    const entry = this.manifest[id];
    if (entry == null) {
      throw new Error(`Unknown renderable asset "${id}"`);
    }
    if (isObject3DManifestEntry(entry)) {
      return cloneObject3D(entry);
    }
    if (entry.type !== AssetType.GLTF) {
      throw new Error(`Manifest entry "${id}" is not a renderable asset`);
    }
    await AssetManager.loadGLTF(entry.url, id);
    const gltf = AssetManager.getGLTF(id);
    if (gltf == null) {
      throw new Error(`Renderable glTF asset "${id}" failed to load`);
    }
    return gltf.scene;
  }
}

/** Loader-level options for GLTF/HDR loaders. @category Assets */
export interface AssetManagerOptions {
  dracoDecoderPath: string;
  ktx2TranscoderPath: string;
}

/**
 * Centralized asset loader with caching and priority‑based preloading.
 *
 * @remarks
 * - Initializes loader instances against a shared `LoadingManager`.
 * - `preloadAssets` loads critical assets first (blocking), then starts background ones.
 * - Use `getGLTF`/`getTexture`/`getAudio` to retrieve cached results by key.
 * @category Assets
 */
export class AssetManager {
  static loadingManager: LoadingManager;
  static world: World;

  /**
   * Initialize loaders and bind to the current world/renderer.
   */
  static init(
    renderer: WebGLRenderer,
    world: World,
    options: Partial<AssetManagerOptions> = {},
  ) {
    this.world = world;
    this.loadingManager = new LoadingManager();

    // Initialize all specialized loaders
    AudioAssetLoader.init(this.loadingManager);
    GLTFAssetLoader.init(this.loadingManager, renderer, options);
    TextureAssetLoader.init(this.loadingManager);
    HDRTextureAssetLoader.init(this.loadingManager);
  }

  /** Preload assets with critical/background prioritization. */
  static async preloadAssets(manifest: AssetManifest): Promise<void> {
    // Separate by priority
    const loadableAssets = Object.entries(manifest).filter(
      (entry): entry is [string, LoadableAssetManifestEntry] =>
        !isObject3DManifestEntry(entry[1]),
    );
    const criticalAssets = loadableAssets.filter(([_, config]) => {
      return config.priority !== 'background';
    });

    const backgroundAssets = loadableAssets.filter(([_, config]) => {
      return config.priority === 'background';
    });

    // Phase 1: Load critical assets (blocking)
    const criticalPromises = criticalAssets.map(([key, config]) => {
      CacheManager.setKeyToUrl(key, config.url);
      return this.loadAssetByType(config.url, config.type, key);
    });
    await Promise.all(criticalPromises);

    // Phase 2: Start background loading (non-blocking)
    backgroundAssets.forEach(([key, config]) => {
      CacheManager.setKeyToUrl(key, config.url);
      this.loadAssetByType(config.url, config.type, key).catch((err) =>
        console.warn(`Background asset failed: ${key}`, err),
      );
    });
  }

  private static async loadAssetByType(
    url: string,
    type: AssetType,
    key?: string,
  ): Promise<any> {
    switch (type) {
      case AssetType.GLTF:
        return GLTFAssetLoader.loadGLTF(url, key);
      case AssetType.Audio:
        return AudioAssetLoader.loadAudio(url);
      case AssetType.Texture:
        return TextureAssetLoader.loadTexture(url);
      case AssetType.HDRTexture:
        return HDRTextureAssetLoader.loadHDRTexture(url);
      default:
        throw new Error(`Unsupported asset type: ${type}`);
    }
  }

  /**
   * Load a GLTF by URL; optionally register a logical key.
   *
   * @remarks
   * Resolves with the cached `GLTF` directly. Use {@link AssetManager.getGLTF}
   * after the load resolves to retrieve a clone suitable for placing into
   * multiple entities.
   */
  static loadGLTF(url: string, key?: string): Promise<GLTF> {
    return GLTFAssetLoader.loadGLTF(url, key);
  }

  /** Create an isolated glTF load transaction for scene resource preflight. */
  static createGLTFLoadTransaction(
    limits: GLTFLoadTransactionLimits = {},
  ): GLTFLoadTransaction {
    return new GLTFLoadTransaction(limits);
  }

  // GLXF has been removed from the asset pipeline. Use World.loadLevel(url).

  /** Fetch any cached asset by logical key. */
  static getAsset(key: string): any {
    return CacheManager.getAssetByKey(key);
  }

  // Public API Methods - delegate to specialized loaders
  /** Load an AudioBuffer by URL; optionally register a logical key. */
  static async loadAudio(url: string, key?: string): Promise<AudioBuffer> {
    if (key) {
      CacheManager.setKeyToUrl(key, url);
    } else {
      CacheManager.setKeyToUrl(url, url);
    }
    return AudioAssetLoader.loadAudio(url);
  }

  /** Get a cached AudioBuffer by logical key. */
  static getAudio(key: string): AudioBuffer | null {
    return AudioAssetLoader.getAudio(key);
  }

  /** Load a Texture by URL; optionally register a logical key. */
  static async loadTexture(url: string, key?: string): Promise<Texture> {
    if (key) {
      CacheManager.setKeyToUrl(key, url);
    } else {
      CacheManager.setKeyToUrl(url, url);
    }
    return TextureAssetLoader.loadTexture(url);
  }

  /** Get a cached Texture by logical key. */
  static getTexture(key: string): Texture | null {
    return TextureAssetLoader.getTexture(key);
  }

  /** Load an HDR equirectangular texture; optionally register a logical key. */
  static async loadHDRTexture(url: string, key?: string): Promise<Texture> {
    if (key) {
      CacheManager.setKeyToUrl(key, url);
    } else {
      CacheManager.setKeyToUrl(url, url);
    }
    return HDRTextureAssetLoader.loadHDRTexture(url);
  }

  /**
   * Get a cached GLTF by logical key.
   *
   * @remarks
   * Returns a fresh clone by default (`scene`/`scenes` are new `Object3D`
   * trees; geometries, materials, animations stay shared), so the same key
   * may be safely used for multiple entities. Pass `{ shared: true }` to
   * return the cached instance directly.
   */
  static getGLTF(key: string, options?: GetGLTFOptions): GLTF | null {
    return GLTFAssetLoader.getGLTF(key, options);
  }
}

function isObject3DManifestEntry(entry: AssetManifestEntry): entry is Object3D {
  return (entry as Object3D | undefined)?.isObject3D === true;
}

function isRenderableManifestEntry(
  entry: AssetManifestEntry | undefined,
): entry is Object3D | LoadableAssetManifestEntry {
  return (
    entry != null &&
    (isObject3DManifestEntry(entry) || entry.type === AssetType.GLTF)
  );
}

function boundsForPrototype(
  prototype: Object3D,
): RenderableAssetInfo['bounds'] | undefined {
  const instance = cloneObject3D(prototype);
  instance.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(instance);
  if (bounds.isEmpty()) {
    return undefined;
  }
  return {
    min: bounds.min.toArray() as [number, number, number],
    max: bounds.max.toArray() as [number, number, number],
  };
}

/**
 * Stages model resources without mutating shared AssetManager caches. A
 * successful scene commit adopts owned resources; rollback disposes them.
 */
export class GLTFLoadTransaction {
  private readonly maxModelPayloadBytes: number;
  private readonly maxTotalModelPayloadBytes: number;
  private readonly stagedByUrl = new Map<string, StagedGLTFLoad>();
  private readonly urlByKey = new Map<string, string>();
  private state: 'open' | 'committed' | 'rolled-back' = 'open';
  private totalPayloadBytes = 0;

  constructor(limits: GLTFLoadTransactionLimits = {}) {
    this.maxModelPayloadBytes =
      limits.maxModelPayloadBytes ?? DEFAULT_MAX_MODEL_PAYLOAD_BYTES;
    this.maxTotalModelPayloadBytes =
      limits.maxTotalModelPayloadBytes ?? DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES;
    assertPositiveByteLimit('maxModelPayloadBytes', this.maxModelPayloadBytes);
    assertPositiveByteLimit(
      'maxTotalModelPayloadBytes',
      this.maxTotalModelPayloadBytes,
    );
  }

  /** Stage one logical key. Repeated URLs share one detached response. */
  async stage(url: string, key: string): Promise<StagedGLTFLoad> {
    this.assertOpen();
    const priorUrl = this.urlByKey.get(key);
    if (priorUrl != null && priorUrl !== url) {
      throw new Error(
        `Staged model key "${key}" already refers to "${priorUrl}"`,
      );
    }
    let staged = this.stagedByUrl.get(url);
    if (staged == null) {
      const cached = await getSettledCachedGLTF(url);
      if (cached != null) {
        staged = { gltf: cached, payloadBytes: 0, source: 'cache', url };
      } else {
        const loaded = await GLTFAssetLoader.loadGLTFDetached(
          url,
          this.maxModelPayloadBytes,
        );
        if (
          this.totalPayloadBytes + loaded.payloadBytes >
          this.maxTotalModelPayloadBytes
        ) {
          disposeGLTFResources(loaded.gltf);
          throw new Error(
            `Staged model payloads total ${
              this.totalPayloadBytes + loaded.payloadBytes
            } bytes; the configured scene limit is ${
              this.maxTotalModelPayloadBytes
            } bytes`,
          );
        }
        staged = {
          gltf: loaded.gltf,
          payloadBytes: loaded.payloadBytes,
          source: 'detached',
          url,
        };
        this.totalPayloadBytes += loaded.payloadBytes;
      }
      this.stagedByUrl.set(url, staged);
    }
    this.urlByKey.set(key, url);
    return staged;
  }

  /** Retrieve a clone for materialization without transferring ownership. */
  getGLTF(key: string, options: GetGLTFOptions = {}): GLTF | null {
    const url = this.urlByKey.get(key);
    const staged = url == null ? null : this.stagedByUrl.get(url);
    if (staged == null) {
      return null;
    }
    return options.shared
      ? staged.gltf
      : GLTFAssetLoader.cloneGLTF(staged.gltf);
  }

  /** Exact newly fetched primary-response bytes in this transaction. */
  get payloadBytes(): number {
    return this.totalPayloadBytes;
  }

  /** Verify cache ownership can transfer synchronously after scene install. */
  assertCanCommit(): void {
    this.assertOpen();
    for (const staged of this.stagedByUrl.values()) {
      const cached = CacheManager.getAsset<GLTF>(staged.url);
      if (staged.source === 'cache') {
        if (cached !== staged.gltf) {
          throw new Error(
            `Cached model "${staged.url}" changed during resource preflight`,
          );
        }
      } else if (cached != null || CacheManager.hasPromise(staged.url)) {
        throw new Error(
          `Model "${staged.url}" entered the shared cache during resource preflight`,
        );
      }
    }
  }

  /** Atomically transfer staged resources and logical keys to the shared cache. */
  commit(): void {
    this.assertCanCommit();
    for (const staged of this.stagedByUrl.values()) {
      if (staged.source === 'detached') {
        CacheManager.setAsset(staged.url, staged.gltf);
      }
    }
    for (const [key, url] of this.urlByKey) {
      CacheManager.setKeyToUrl(key, url);
    }
    this.state = 'committed';
  }

  /** Dispose all transaction-owned model resources; cached resources are borrowed. */
  rollback(): void {
    if (this.state !== 'open') {
      return;
    }
    for (const staged of this.stagedByUrl.values()) {
      if (staged.source === 'detached') {
        disposeGLTFResources(staged.gltf);
      }
    }
    this.state = 'rolled-back';
    this.stagedByUrl.clear();
    this.urlByKey.clear();
  }

  private assertOpen(): void {
    if (this.state !== 'open') {
      throw new Error(`GLTF load transaction is already ${this.state}`);
    }
  }
}

async function getSettledCachedGLTF(url: string): Promise<GLTF | null> {
  const cached = CacheManager.getAsset<GLTF>(url);
  if (cached != null) {
    return cached;
  }
  const inFlight = CacheManager.getPromise<GLTF>(url);
  if (inFlight == null) {
    return null;
  }
  await inFlight;
  return CacheManager.getAsset<GLTF>(url) ?? null;
}

function assertPositiveByteLimit(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}
