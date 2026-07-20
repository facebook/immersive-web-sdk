/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const CURRENT_SCENE_VERSION = 'iwsdk.scene.v1' as const;

export type SceneDocumentVersion = typeof CURRENT_SCENE_VERSION;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type Vec3 = [number, number, number];

export type SceneScale = number | Vec3;

export type SceneAxis = 'x' | 'y' | 'z';

export type SceneAlignment = 'min' | 'center' | 'max';

export interface SceneSnapOptions {
  gridSize?: number | Vec3;
  axes?: SceneAxis[];
  origin?: Vec3;
}

export interface SceneAlignOptions {
  axis: SceneAxis;
  edge?: SceneAlignment;
  targetEdge?: SceneAlignment;
  targetNodeId?: string;
  targetValue?: number;
}

export type SceneAssetType = 'gltf' | 'image' | 'audio' | 'video' | 'other';

export interface SceneBounds {
  min: Vec3;
  max: Vec3;
}

export interface SceneAsset {
  id: string;
  uri: string;
  name?: string;
  type?: SceneAssetType;
  bounds?: SceneBounds;
  metadata?: JsonObject;
}

export interface ScenePlaceOn {
  target: string;
  clearance?: number;
  align?: 'center' | 'preserve-xz';
}

export type SceneComponentFieldType =
  | 'Int8'
  | 'Int16'
  | 'Int32'
  | 'Entity'
  | 'Float32'
  | 'Float64'
  | 'Boolean'
  | 'String'
  | 'FilePath'
  | 'Object'
  | 'Vec2'
  | 'Vec3'
  | 'Vec4'
  | 'Color'
  | 'Enum';

export interface SceneComponentFieldSchema {
  type: SceneComponentFieldType;
  default?: JsonValue;
  description?: string;
  enum?: Record<string, string>;
  fileTypes?: string;
  subfolder?: string;
  min?: number;
  max?: number;
  internal?: boolean;
}

export interface SceneComponentSchema {
  id: string;
  name?: string;
  description?: string;
  fields: Record<string, SceneComponentFieldSchema>;
  source?: 'iwsdk' | 'app' | 'scene';
}

export interface SceneTypedComponent {
  type: string;
  props?: Record<string, JsonValue>;
}

export type SceneComponentValue = JsonValue | SceneTypedComponent;

export interface SceneTransform {
  position?: Vec3;
  rotationDeg?: Vec3;
  scale?: SceneScale;
  lookAt?: Vec3;
  placeOn?: string | ScenePlaceOn;
}

export interface SceneNode {
  id: string;
  name?: string;
  asset?: string;
  transform?: SceneTransform;
  components?: Record<string, SceneComponentValue>;
  children?: SceneNode[];
  editor?: JsonObject;
  metadata?: JsonObject;
}

export interface SceneDocument {
  version: SceneDocumentVersion;
  units: 'meters';
  assets?: SceneAsset[];
  componentSchemas?: SceneComponentSchema[];
  nodes: SceneNode[];
  editor?: JsonObject;
  metadata?: JsonObject;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type ScenePatch =
  | {
      op: 'addNode';
      node: SceneNode;
      parentId?: string | null;
      index?: number;
    }
  | {
      op: 'removeNode';
      nodeId: string;
    }
  | {
      op: 'moveNode';
      nodeId: string;
      parentId?: string | null;
      index?: number;
      preserveWorldTransform?: boolean;
    }
  | {
      op: 'renameNode';
      nodeId: string;
      newNodeId: string;
    }
  | {
      op: 'updateTransform';
      nodeId: string;
      transform?: SceneTransform;
    }
  | {
      op: 'updateComponent';
      nodeId: string;
      component: string;
      value?: SceneComponentValue;
    }
  | {
      op: 'reorderChildren';
      childIds: string[];
      parentId?: string | null;
    }
  | {
      op: 'updateAssetRef';
      asset?: string;
      nodeId: string;
    }
  | {
      op: 'setEditorMetadata';
      value?: JsonObject;
      nodeId?: string;
    }
  | {
      op: 'setNodeMetadata';
      value?: JsonObject;
      nodeId: string;
    };

export interface PatchResult {
  document: SceneDocument;
  inverse: ScenePatch;
}
