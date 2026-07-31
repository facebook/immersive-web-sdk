/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * File service for reading source files
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { resolveReferenceAssets } from './assets.js';

export class FileService {
  private sourcesDirPromise: Promise<string> | null = null;

  private async getSourcesDir(): Promise<string> {
    if (!this.sourcesDirPromise) {
      this.sourcesDirPromise = resolveReferenceAssets().then(({ dataDir }) =>
        path.join(dataDir, 'sources'),
      );
    }
    try {
      return await this.sourcesDirPromise;
    } catch (error) {
      this.sourcesDirPromise = null;
      throw error;
    }
  }

  /**
   * Find a file by searching across all source directories
   */
  private normalizeDependencyPath(relativePath: string): string[] {
    const trimmed = relativePath.replace(/^\/+/, '').replace(/^deps\/+/, '');
    const normalized = trimmed.replace(/\\/g, '/');
    const searchPaths: string[] = [];

    const candidates = [normalized];
    if (normalized.includes('/node_modules/')) {
      candidates.push(normalized.split('/node_modules/').pop() ?? normalized);
    }

    const packagePrefixes = [
      '@types/three/',
      '@types/webxr/',
      '@pmndrs/pointer-events/',
      '@pmndrs/uikit/',
      '@drawcall/uikitml/',
      '@preact/signals-core/',
      '@babylonjs/havok/',
      'elics/',
    ];

    for (const candidate of candidates) {
      for (const prefix of packagePrefixes) {
        const index = candidate.indexOf(prefix);
        if (index !== -1) {
          searchPaths.push(candidate.slice(index));
        }
      }
    }

    if (!searchPaths.includes(normalized)) {
      searchPaths.push(normalized);
    }

    return Array.from(new Set(searchPaths));
  }

  private async findFile(
    relativePath: string,
    source: string,
  ): Promise<string | null> {
    const sourcesDir = await this.getSourcesDir();
    const searchPaths: string[] = [];

    if (source === 'iwsdk') {
      searchPaths.push(path.join(sourcesDir, 'iwsdk', relativePath));
    } else if (source === 'deps') {
      const depsDir = path.join(sourcesDir, 'deps');
      for (const candidate of this.normalizeDependencyPath(relativePath)) {
        searchPaths.push(path.join(depsDir, candidate));
      }
    }

    for (const candidatePath of searchPaths) {
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }

  /**
   * Read a file with optional line range
   */
  async readFile(
    relativePath: string,
    source: string,
    options?: {
      startLine?: number;
      endLine?: number;
    },
  ): Promise<string | null> {
    const filePath = await this.findFile(relativePath, source);
    if (!filePath) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');

      if (options?.startLine !== undefined || options?.endLine !== undefined) {
        const lines = content.split('\n');
        const start = (options.startLine ?? 1) - 1; // Convert to 0-indexed
        const end = options.endLine ?? lines.length;
        return lines.slice(start, end).join('\n');
      }

      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string, source: string): Promise<boolean> {
    return (await this.findFile(relativePath, source)) !== null;
  }
}
