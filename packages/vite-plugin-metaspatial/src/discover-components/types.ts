/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';

export interface PluginOptions {
  readonly outputDir: string;
  readonly include: RegExp;
  readonly exclude: RegExp;
  readonly verbose: boolean;
  readonly clean: boolean;
  readonly scanPackages: ReadonlyArray<string>;
  readonly includeXmlDeclaration: boolean;
}

export interface ComponentMetadata {
  name: string;
  description: string;
  file: string;
  exportName: string;
  schema: Record<string, FieldDefinition>;
  // Indicates origin for naming/cleaning policies
  source?: 'framework' | 'custom';
}

export interface FieldDefinition {
  type?: string;
  default?: ExtractedValue;
  enum?: ValueReference | string;
  // Allow dynamic property access for field extraction
  [key: string]: ExtractedValue;
}

export interface EnumDefinition {
  name: string;
  values: string[];
  keyValueMap?: Record<string, string>; // Maps keys like "STATIC" to values like "static"
}

export interface ValueReference {
  object: string;
  property: string;
}

// Recursive type for extracted values - use any to avoid circular reference issues
export type ExtractedValue =
  | string
  | number
  | boolean
  | ValueReference
  | undefined
  | ReadonlyArray<any>
  | Readonly<Record<string, any>>;

// Error handling types
export interface PluginError extends Error {
  readonly code: string;
  readonly filePath?: string;
  readonly componentName?: string;
}

export type PluginErrorCode =
  | 'PATH_TRAVERSAL'
  | 'INVALID_INPUT'
  | 'PARSE_ERROR'
  | 'FILE_OPERATION_ERROR'
  | 'RECURSION_LIMIT'
  | 'VALIDATION_ERROR';

// Cache types
export interface ParsedEnumCache {
  readonly result: EnumDefinition | null;
  readonly timestamp: number;
}

export interface CacheOptions {
  readonly maxSize: number;
  readonly ttlMs: number;
}

// Validation utilities
export const ValidationUtils = {
  isValidComponentName: (name: string): boolean => {
    return typeof name === 'string' && /^[A-Z][a-zA-Z0-9]*$/.test(name);
  },

  isValidPath: (filePath: string): boolean => {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }
    const normalized = path.normalize(filePath);
    return !normalized.includes('..');
  },

  isValidEnumName: (name: string): boolean => {
    return typeof name === 'string' && /^[A-Z][a-zA-Z0-9_]*$/.test(name);
  },
};
