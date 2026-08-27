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
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Texture,
  WebGLRenderer,
} from '../runtime/index.js';
import { CacheManager } from './cache-manager.js';
import { AudioAssetLoader } from './loaders/audio-loader.js';
import {
  assertAssetLoadTimeout,
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
} from './loaders/cached-asset-load.js';
import {
  DEFAULT_MAX_MODEL_PAYLOAD_BYTES,
  DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES,
  disposeGLTFResources,
  GetGLTFOptions,
  GLTFAssetLoader,
} from './loaders/gltf-loader.js';
import { HDRTextureAssetLoader } from './loaders/hdr-texture-loader.js';
import { TextureAssetLoader } from './loaders/texture-loader.js';
import { UIKitMLAssetLoader } from './loaders/uikitml-loader.js';

export type { GetGLTFOptions } from './loaders/gltf-loader.js';
export {
  DEFAULT_MAX_MODEL_PAYLOAD_BYTES,
  DEFAULT_MAX_TOTAL_MODEL_PAYLOAD_BYTES,
  GLTFPayloadLimitError,
} from './loaders/gltf-loader.js';
export {
  AssetLoadTimeoutError,
  DEFAULT_ASSET_LOAD_TIMEOUT_MS,
} from './loaders/cached-asset-load.js';

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
  UIKitML = 'uikitml', // Spatial UI documents (cached source)
}

export interface LoadableAssetManifestEntry {
  url: string;
  type: AssetType;
  priority?: 'critical' | 'background' | 'lazy';
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

/** Non-enumerable marker carried by manifests created with defineAssets. */
export const ASSET_MANIFEST_BRAND: unique symbol = Symbol(
  '@iwsdk/core/asset-manifest/v1',
);

export type DefinedAssetManifest<T extends AssetManifest = AssetManifest> =
  Readonly<T> & {
    readonly [ASSET_MANIFEST_BRAND]: 1;
  };

/**
 * Declare the complete application asset catalog shared by runtime/editor.
 * The returned container is frozen; entry objects and Three.js prototypes are
 * intentionally left mutable and retain their original identities.
 */
export function defineAssets<const T extends AssetManifest>(
  assets: T,
): DefinedAssetManifest<T> {
  if (assets == null || typeof assets !== 'object' || Array.isArray(assets)) {
    throw new Error('Asset manifest must be an object');
  }
  for (const [id, entry] of Object.entries(assets)) {
    if (id.trim().length === 0) {
      throw new Error('Asset IDs must not be blank');
    }
    assertAssetManifestEntry(id, entry);
  }
  const manifest = { ...assets } as DefinedAssetManifest<T>;
  Object.defineProperty(manifest, ASSET_MANIFEST_BRAND, {
    configurable: false,
    enumerable: false,
    value: 1,
    writable: false,
  });
  return Object.freeze(manifest);
}

/** Structured identity for critical, background, and on-demand failures. */
export class AssetLoadError extends Error {
  constructor(
    readonly assetId: string,
    readonly url: string,
    readonly cause: unknown,
  ) {
    super(
      `Failed to load asset "${assetId}" from "${url}": ${errorMessage(cause)}`,
    );
    this.name = 'AssetLoadError';
  }
}

export interface RenderableAssetInfo {
  id: string;
  kind: 'gltf' | 'primitive' | 'procedural';
  name: string;
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/** Asset metadata exposed to authoring tools. */
export interface AuthoringAssetInfo extends Omit<RenderableAssetInfo, 'kind'> {
  kind: 'gltf' | 'primitive' | 'procedural' | 'uikitml';
  url?: string;
}

const BUILTIN_PRIMITIVE_ASSETS: AssetManifest = Object.freeze({
  'primitive-box': createPrimitivePrototype(
    'Box',
    new BoxGeometry(0.5, 0.5, 0.5),
  ),
  'primitive-capsule': createPrimitivePrototype(
    'Capsule',
    new CapsuleGeometry(0.2, 0.5, 4, 12),
  ),
  'primitive-cylinder': createPrimitivePrototype(
    'Cylinder',
    new CylinderGeometry(0.25, 0.25, 0.6, 24),
  ),
  'primitive-sphere': createPrimitivePrototype(
    'Sphere',
    new SphereGeometry(0.3, 24, 16),
  ),
});

export interface AssetRegistryOptions {
  instantiateUIKitML?: (assetId: string) => Promise<Object3D>;
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

  constructor(
    manifest: AssetManifest = {},
    private readonly options: AssetRegistryOptions = {},
  ) {
    this.manifest = { ...BUILTIN_PRIMITIVE_ASSETS, ...manifest };
    for (const [id, entry] of Object.entries(this.manifest)) {
      if (isObject3DManifestEntry(entry) && entry.parent != null) {
        throw new Error(
          `Renderable asset prototype "${id}" must not have a parent`,
        );
      }
    }
    AssetManager.registerManifest(this.manifest);
  }

  async preload(): Promise<void> {
    await AssetManager.preloadAssets(this.manifest);
  }

  has(id: string): boolean {
    return this.kind(id) != null;
  }

  /** Return whether an id instantiates as a conventional model hierarchy. */
  hasRenderable(id: string): boolean {
    return isRenderableManifestEntry(this.manifest[id]);
  }

  /** Return whether an id is available to authoring, including UIKitML. */
  hasAuthoringAsset(id: string): boolean {
    return this.kind(id) != null;
  }

  /** Resolve the authoring kind for a manifest id. */
  kind(id: string): AuthoringAssetInfo['kind'] | undefined {
    const entry = this.manifest[id];
    if (entry == null) {
      return undefined;
    }
    if (isObject3DManifestEntry(entry)) {
      return isPrimitivePrototype(entry) ? 'primitive' : 'procedural';
    }
    if (entry.type === AssetType.GLTF) {
      return 'gltf';
    }
    if (entry.type === AssetType.UIKitML) {
      return 'uikitml';
    }
    return undefined;
  }

  list(): RenderableAssetInfo[] {
    const result: RenderableAssetInfo[] = [];
    for (const [id, entry] of Object.entries(this.manifest)) {
      if (isObject3DManifestEntry(entry)) {
        result.push({
          bounds: boundsForPrototype(entry),
          id,
          kind: isPrimitivePrototype(entry) ? 'primitive' : 'procedural',
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

  /** List placeable model and UIKitML assets for authoring tools. */
  catalog(): AuthoringAssetInfo[] {
    const result: AuthoringAssetInfo[] = this.list();
    for (const [id, entry] of Object.entries(this.manifest)) {
      if (!isObject3DManifestEntry(entry) && entry.type === AssetType.UIKitML) {
        result.push({
          id,
          kind: 'uikitml',
          name: entry.name || id,
          url: entry.url,
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

  async instantiate<T extends Object3D = Object3D>(id: string): Promise<T> {
    const entry = this.manifest[id];
    if (entry == null) {
      throw new Error(`Unknown renderable asset "${id}"`);
    }
    if (isObject3DManifestEntry(entry)) {
      return cloneObject3D(entry) as unknown as T;
    }
    if (entry.type === AssetType.UIKitML) {
      if (this.options.instantiateUIKitML == null) {
        throw new Error(`UIKitML asset "${id}" requires the spatialUI feature`);
      }
      if (entry.priority === 'lazy') {
        await AssetManager.loadUIKitMLById(id);
      }
      return this.options.instantiateUIKitML(id) as Promise<T>;
    }
    if (entry.type !== AssetType.GLTF) {
      throw new Error(`Manifest entry "${id}" is not a renderable asset`);
    }
    await AssetManager.loadGLTFById(id);
    const gltf = AssetManager.getGLTF(id);
    if (gltf == null) {
      throw new Error(`Renderable glTF asset "${id}" failed to load`);
    }
    return gltf.scene as unknown as T;
  }
}

/** Loader-level options for GLTF/HDR loaders. @category Assets */
export interface AssetManagerOptions {
  dracoDecoderPath: string;
  ktx2TranscoderPath: string;
  /** Finite upper bound for every critical/background/on-demand load. */
  loadTimeoutMs: number;
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
  private static loadTimeoutMs = DEFAULT_ASSET_LOAD_TIMEOUT_MS;
  private static readonly manifestEntries = new Map<
    string,
    LoadableAssetManifestEntry
  >();

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
    this.manifestEntries.clear();
    this.loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_ASSET_LOAD_TIMEOUT_MS;
    assertAssetLoadTimeout(this.loadTimeoutMs);

    // Initialize all specialized loaders
    AudioAssetLoader.init(this.loadingManager);
    GLTFAssetLoader.init(this.loadingManager, renderer, options);
    TextureAssetLoader.init(this.loadingManager);
    HDRTextureAssetLoader.init(this.loadingManager);
  }

  /** Configure the finite timeout used by subsequent asset loads. */
  static setLoadTimeout(timeoutMs: number): void {
    assertAssetLoadTimeout(timeoutMs);
    this.loadTimeoutMs = timeoutMs;
  }

  /** Register catalog identity without starting network requests. */
  static registerManifest(manifest: AssetManifest): void {
    this.manifestEntries.clear();
    for (const [id, entry] of Object.entries(manifest)) {
      if (isObject3DManifestEntry(entry)) {
        continue;
      }
      this.manifestEntries.set(id, entry);
      CacheManager.setKeyToUrl(id, entry.url);
    }
  }

  /** Preload assets with critical/background prioritization. */
  static async preloadAssets(manifest: AssetManifest): Promise<void> {
    this.registerManifest(manifest);
    const loadableAssets = Object.entries(manifest).filter(
      (entry): entry is [string, LoadableAssetManifestEntry] =>
        !isObject3DManifestEntry(entry[1]),
    );
    const criticalAssets = loadableAssets.filter(([_, config]) => {
      return config.priority !== 'background' && config.priority !== 'lazy';
    });

    const backgroundAssets = loadableAssets.filter(([_, config]) => {
      return config.priority === 'background';
    });

    const criticalPromises = criticalAssets.map(([key, config]) => {
      return this.loadAssetByType(config.url, config.type, key);
    });
    await Promise.all(criticalPromises);

    backgroundAssets.forEach(([key, config]) => {
      this.loadAssetByType(config.url, config.type, key).catch((err) =>
        console.warn(`Background asset failed: ${key}`, err),
      );
    });
  }

  private static async loadAssetByType(
    url: string,
    type: AssetType,
    assetId: string = url,
  ): Promise<GLTF | AudioBuffer | Texture | string> {
    CacheManager.setKeyToUrl(assetId, url);
    try {
      switch (type) {
        case AssetType.GLTF:
          return await GLTFAssetLoader.loadGLTF(
            url,
            assetId,
            this.loadTimeoutMs,
          );
        case AssetType.Audio:
          return await AudioAssetLoader.loadAudio(url, this.loadTimeoutMs);
        case AssetType.Texture:
          return await TextureAssetLoader.loadTexture(url, this.loadTimeoutMs);
        case AssetType.HDRTexture:
          return await HDRTextureAssetLoader.loadHDRTexture(
            url,
            this.loadTimeoutMs,
          );
        case AssetType.UIKitML:
          return await UIKitMLAssetLoader.loadUIKitML(
            url,
            assetId,
            false,
            this.loadTimeoutMs,
          );
        default:
          throw new Error(`Unsupported asset type: ${type}`);
      }
    } catch (cause) {
      if (cause instanceof AssetLoadError) {
        throw cause;
      }
      throw new AssetLoadError(assetId, url, cause);
    }
  }

  /** Load one registered manifest entry by asset ID. */
  static async loadAsset(
    assetId: string,
  ): Promise<GLTF | AudioBuffer | Texture | string> {
    const entry = this.requireManifestEntry(assetId);
    return this.loadAssetByType(entry.url, entry.type, assetId);
  }

  static async loadGLTFById(assetId: string): Promise<GLTF> {
    return this.loadTypedManifestAsset(
      assetId,
      AssetType.GLTF,
    ) as Promise<GLTF>;
  }

  static async loadAudioById(assetId: string): Promise<AudioBuffer> {
    return this.loadTypedManifestAsset(
      assetId,
      AssetType.Audio,
    ) as Promise<AudioBuffer>;
  }

  static async loadTextureById(assetId: string): Promise<Texture> {
    return this.loadTypedManifestAsset(
      assetId,
      AssetType.Texture,
    ) as Promise<Texture>;
  }

  static async loadHDRTextureById(assetId: string): Promise<Texture> {
    return this.loadTypedManifestAsset(
      assetId,
      AssetType.HDRTexture,
    ) as Promise<Texture>;
  }

  static async loadUIKitMLById(assetId: string): Promise<string> {
    return this.loadTypedManifestAsset(
      assetId,
      AssetType.UIKitML,
    ) as Promise<string>;
  }

  private static loadTypedManifestAsset(
    assetId: string,
    expectedType: AssetType,
  ): Promise<GLTF | AudioBuffer | Texture | string> {
    const entry = this.requireManifestEntry(assetId);
    if (entry.type !== expectedType) {
      throw new Error(
        `Asset "${assetId}" has type "${entry.type}", expected "${expectedType}"`,
      );
    }
    return this.loadAssetByType(entry.url, entry.type, assetId);
  }

  private static requireManifestEntry(
    assetId: string,
  ): LoadableAssetManifestEntry {
    const entry = this.manifestEntries.get(assetId);
    if (entry == null) {
      throw new Error(`Unknown loadable asset "${assetId}"`);
    }
    return entry;
  }

  /**
   * Load a GLTF by URL; optionally register a logical key.
   *
   * @remarks
   * Resolves with the cached `GLTF` directly. Use {@link AssetManager.getGLTF}
   * after the load resolves to retrieve a clone suitable for placing into
   * multiple entities.
   */
  static loadGLTF(urlOrKey: string, key?: string): Promise<GLTF> {
    const url = key == null ? CacheManager.resolveUrl(urlOrKey) : urlOrKey;
    return this.loadAssetByType(
      url,
      AssetType.GLTF,
      key ?? urlOrKey,
    ) as Promise<GLTF>;
  }

  /** Create an isolated glTF load transaction for scene resource preflight. */
  static createGLTFLoadTransaction(
    limits: GLTFLoadTransactionLimits = {},
  ): GLTFLoadTransaction {
    return new GLTFLoadTransaction(limits);
  }

  // Scene documents are loaded through World.loadLevel(url).

  /** Fetch any cached asset by logical key. */
  static getAsset(key: string): any {
    return CacheManager.getAssetByKey(key);
  }

  // Public API Methods - delegate to specialized loaders
  /** Load an AudioBuffer by URL; optionally register a logical key. */
  static async loadAudio(url: string, key?: string): Promise<AudioBuffer> {
    const resolvedUrl = key == null ? CacheManager.resolveUrl(url) : url;
    return this.loadAssetByType(
      resolvedUrl,
      AssetType.Audio,
      key ?? url,
    ) as Promise<AudioBuffer>;
  }

  /** Get a cached AudioBuffer by logical key. */
  static getAudio(key: string): AudioBuffer | null {
    return AudioAssetLoader.getAudio(key);
  }

  /** Load a Texture by URL; optionally register a logical key. */
  static async loadTexture(url: string, key?: string): Promise<Texture> {
    const resolvedUrl = key == null ? CacheManager.resolveUrl(url) : url;
    return this.loadAssetByType(
      resolvedUrl,
      AssetType.Texture,
      key ?? url,
    ) as Promise<Texture>;
  }

  /** Get a cached Texture by logical key. */
  static getTexture(key: string): Texture | null {
    return TextureAssetLoader.getTexture(key);
  }

  /** Load and cache UIKitML source by URL or manifest key. */
  static loadUIKitML(
    urlOrKey: string,
    key?: string,
    forceReload = false,
  ): Promise<string> {
    const url = key == null ? CacheManager.resolveUrl(urlOrKey) : urlOrKey;
    const assetId = key ?? urlOrKey;
    CacheManager.setKeyToUrl(assetId, url);
    return UIKitMLAssetLoader.loadUIKitML(
      url,
      assetId,
      forceReload,
      this.loadTimeoutMs,
    ).catch((cause) => {
      throw cause instanceof AssetLoadError
        ? cause
        : new AssetLoadError(assetId, url, cause);
    });
  }

  /** Get cached UIKitML source by URL or manifest key. */
  static getUIKitML(keyOrUrl: string): string | null {
    return UIKitMLAssetLoader.getUIKitML(keyOrUrl);
  }

  /** Load an HDR equirectangular texture; optionally register a logical key. */
  static async loadHDRTexture(url: string, key?: string): Promise<Texture> {
    const resolvedUrl = key == null ? CacheManager.resolveUrl(url) : url;
    return this.loadAssetByType(
      resolvedUrl,
      AssetType.HDRTexture,
      key ?? url,
    ) as Promise<Texture>;
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

const SUPPORTED_ASSET_TYPE_NAMES = Object.values(AssetType);
const SUPPORTED_ASSET_TYPES = new Set<string>(SUPPORTED_ASSET_TYPE_NAMES);
const SUPPORTED_ASSET_PRIORITIES = new Set<string>([
  'critical',
  'background',
  'lazy',
]);

function assertAssetManifestEntry(id: string, entry: unknown): void {
  if (isObject3DManifestEntry(entry as AssetManifestEntry)) {
    if ((entry as Object3D).parent != null) {
      throw new Error(
        `Renderable asset prototype "${id}" must not have a parent`,
      );
    }
    return;
  }
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(
      `Asset manifest entry "${id}" must be a URL entry or Object3D prototype`,
    );
  }
  const candidate = entry as Partial<LoadableAssetManifestEntry>;
  if (typeof candidate.url !== 'string' || candidate.url.trim().length === 0) {
    throw new Error(`Asset manifest entry "${id}" must have a nonblank URL`);
  }
  if (
    typeof candidate.type !== 'string' ||
    !SUPPORTED_ASSET_TYPES.has(candidate.type)
  ) {
    throw new Error(
      `Asset manifest entry "${id}" has unsupported type "${String(candidate.type)}". Supported types: ${SUPPORTED_ASSET_TYPE_NAMES.join(', ')}`,
    );
  }
  if (
    candidate.priority !== undefined &&
    !SUPPORTED_ASSET_PRIORITIES.has(candidate.priority)
  ) {
    throw new Error(
      `Asset manifest entry "${id}" has unsupported priority "${String(candidate.priority)}"`,
    );
  }
  if (candidate.name !== undefined && typeof candidate.name !== 'string') {
    throw new Error(`Asset manifest entry "${id}" name must be a string`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPrimitivePrototype(
  name: string,
  geometry: BufferGeometry,
): Mesh {
  const prototype = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: 0x91a4ba,
      metalness: 0.05,
      roughness: 0.72,
    }),
  );
  prototype.name = name;
  prototype.userData.iwsdkAssetKind = 'primitive';
  return prototype;
}

function isPrimitivePrototype(entry: Object3D): boolean {
  return entry.userData.iwsdkAssetKind === 'primitive';
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
