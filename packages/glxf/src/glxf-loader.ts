/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  FileLoader,
  Group,
  Loader,
  LoaderUtils,
  LoadingManager,
  Object3D,
} from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Interface for any loader with loadAsync method
interface GLTFLoaderLike {
  loadAsync(url: string): Promise<GLTF>;
}

// GLXF interfaces
export interface GLXFAsset {
  uri: string;
  name?: string;
}

export interface GLXFNode {
  name?: string;
  asset?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
  extras?: {
    meta_spatial?: {
      entity_id?: string;
      components?: Record<string, any>;
      version?: number;
    };
  };
}

export interface GLXFScene {
  nodes: number[];
}

export interface GLXFData {
  assets: GLXFAsset[];
  nodes: GLXFNode[];
  scenes: GLXFScene[];
  scene?: number;
  asset: {
    minVersion: string;
    version: string;
  };
}

export interface GLXF {
  assets: GLTF[];
  nodes: Object3D[];
  scenes: Group[];
  scene: Group;
}

export class GLXFLoader extends Loader<GLXF> {
  private gltfLoader: GLTFLoaderLike;

  constructor(manager?: LoadingManager) {
    super(manager);
    this.gltfLoader = new GLTFLoader(manager);
  }

  load(
    url: string,
    onLoad: (glxf: GLXF) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void,
  ): void {
    const scope = this;

    this.manager.itemStart(url);

    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('text');
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      url,
      function (text) {
        try {
          scope.parse(
            text as string,
            LoaderUtils.extractUrlBase(url),
            onLoad,
            onError,
          );
        } catch (e) {
          if (onError) {
            onError(new ErrorEvent('error', { error: e }));
          } else {
            console.error(e);
          }
          scope.manager.itemError(url);
        }
      },
      onProgress,
      onError
        ? (err) => onError(new ErrorEvent('error', { error: err }))
        : undefined,
    );
  }

  loadAsync(
    url: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<GLXF> {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, (error) => reject(error));
    });
  }

  parse(
    text: string,
    path: string,
    onLoad: (glxf: GLXF) => void,
    onError?: (event: ErrorEvent) => void,
  ): void {
    const scope = this;

    try {
      const glxfData: GLXFData = JSON.parse(text);

      // Validate GLXF format
      if (!glxfData.assets || !glxfData.nodes) {
        throw new Error('Invalid GLXF format: missing assets or nodes');
      }

      // Load all referenced GLTF assets
      const assetPromises = glxfData.assets.map((asset) => {
        const assetUrl = LoaderUtils.resolveURL(asset.uri, path);
        return this.gltfLoader.loadAsync(assetUrl).catch((error) => {
          console.error(`Failed to load GLXF asset ${asset.uri}:`, error);
          // Return empty GLTF as placeholder to maintain array indices
          return { scene: new Group() } as GLTF;
        });
      });

      Promise.all(assetPromises)
        .then((loadedAssets) => {
          // Create nodes and scenes from GLXF composition data
          const { nodes, scenes } = scope.createNodesAndScenesFromGLXF(
            glxfData,
            loadedAssets,
          );

          // Get the active scene (default to first scene if not specified)
          const activeSceneIndex = glxfData.scene ?? 0;
          const activeScene = scenes[activeSceneIndex] || scenes[0];

          const result: GLXF = {
            assets: loadedAssets,
            nodes: nodes,
            scenes: scenes,
            scene: activeScene,
          };

          onLoad(result);
          scope.manager.itemEnd(path);
        })
        .catch((error) => {
          if (onError) {
            onError(error);
          } else {
            console.error('Error loading GLXF assets:', error);
          }
          scope.manager.itemError(path);
        });
    } catch (error) {
      if (onError) {
        onError(error as ErrorEvent);
      } else {
        console.error('Error parsing GLXF:', error);
      }
      this.manager.itemError(path);
    }
  }

  parseAsync(text: string, path: string): Promise<GLXF> {
    return new Promise((resolve, reject) => {
      this.parse(text, path, resolve, reject);
    });
  }

  setGLTFLoader(gltfLoader: GLTFLoaderLike): this {
    this.gltfLoader = gltfLoader;
    return this;
  }

  private createNodesAndScenesFromGLXF(
    glxfData: GLXFData,
    loadedAssets: GLTF[],
  ): { nodes: Object3D[]; scenes: Group[] } {
    const scenes: Group[] = [];
    const nodes: Object3D[] = [];
    const nodeCache = new Map<number, Object3D>();

    // First pass: create all nodes
    glxfData.nodes.forEach((node, index) => {
      let nodeObject: Object3D;

      // If node has an asset, clone it as the base object
      if (node.asset !== undefined && loadedAssets[node.asset]) {
        nodeObject = loadedAssets[node.asset].scene.clone();
      } else {
        nodeObject = new Group();
      }

      nodeObject.name = node.name || `node_${index}`;

      // Apply transforms
      if (node.translation) {
        nodeObject.position.fromArray(node.translation);
      }
      if (node.rotation) {
        nodeObject.quaternion.fromArray(node.rotation);
      }
      if (node.scale) {
        nodeObject.scale.fromArray(node.scale);
      }

      // Store metadata
      if (node.extras?.meta_spatial) {
        nodeObject.userData.meta_spatial = node.extras.meta_spatial;
      }

      nodes.push(nodeObject);
      nodeCache.set(index, nodeObject);
    });

    // Second pass: establish parent-child relationships
    glxfData.nodes.forEach((node, index) => {
      if (node.children) {
        const parent = nodeCache.get(index);
        if (parent) {
          node.children.forEach((childIndex) => {
            const child = nodeCache.get(childIndex);
            if (child) {
              parent.add(child);
            }
          });
        }
      }
    });

    // Create scene groups
    glxfData.scenes.forEach((sceneData, index) => {
      const sceneGroup = new Group();
      sceneGroup.name = `scene_${index}`;

      sceneData.nodes.forEach((nodeIndex) => {
        const node = nodeCache.get(nodeIndex);
        if (node) {
          sceneGroup.add(node);
        }
      });

      scenes.push(sceneGroup);
    });

    return { nodes, scenes };
  }
}
