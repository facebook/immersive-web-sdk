/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World } from '../ecs/index.js';
import { LoadingManager, Texture, WebGLRenderer } from '../runtime/index.js';
import { CacheManager } from './cache-manager.js';
import { AudioAssetLoader } from './loaders/audio-loader.js';
import { GLTFAssetLoader } from './loaders/gltf-loader.js';
import { HDRTextureAssetLoader } from './loaders/hdr-texture-loader.js';
import { TextureAssetLoader } from './loaders/texture-loader.js';

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

/**
 * Declarative manifest for preloading assets.
 * @category Assets
 */
export interface AssetManifest {
  [key: string]: {
    url: string;
    type: AssetType;
    priority?: 'critical' | 'background'; // Default: 'critical'
  };
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
    const criticalAssets = Object.entries(manifest).filter(([_, config]) => {
      return config.priority !== 'background';
    });

    const backgroundAssets = Object.entries(manifest).filter(([_, config]) => {
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

  /** Load a GLTF by URL; optionally register a logical key. */
  static loadGLTF(url: string, key?: string): Promise<GLTF> {
    return GLTFAssetLoader.loadGLTF(url, key);
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

  /** Get a cached GLTF by logical key. */
  static getGLTF(key: string): GLTF | null {
    return GLTFAssetLoader.getGLTF(key);
  }
}
