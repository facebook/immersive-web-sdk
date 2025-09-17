/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  GLTFOptimizerOptions,
  ProcessedOptions,
  OptimizationLevel,
} from './types.js';

/**
 * Manages preset configurations and applies defaults
 */
export class PresetManager {
  /**
   * Get preset configuration for a given optimization level
   */
  static getPreset(level: OptimizationLevel): GLTFOptimizerOptions {
    switch (level) {
      case 'light':
        return {
          geometry: {
            compress: 'quantize',
            quality: 0.9,
            precision: 0.95,
            speed: 0.8,
          },
          textures: {
            mode: 'auto',
            quality: 0.85,
            maxSize: 2048,
          },
        };

      case 'medium':
        return {
          geometry: {
            compress: 'meshopt',
            quality: 0.75,
            precision: 0.8,
            speed: 0.5,
          },
          textures: {
            mode: 'auto',
            quality: 0.75,
            maxSize: 1024,
          },
        };

      case 'aggressive':
        return {
          geometry: {
            compress: 'draco',
            quality: 0.5,
            precision: 0.6,
            speed: 0.3,
          },
          textures: {
            mode: 'auto',
            quality: 0.55,
            maxSize: 512,
          },
        };

      default:
        return this.getPreset('medium');
    }
  }

  /**
   * Process and normalize options with defaults and preset overrides
   */
  static processOptions(options: GLTFOptimizerOptions = {}): ProcessedOptions {
    // Start with base defaults
    const baseDefaults: ProcessedOptions = {
      level: 'medium',
      include: /\.(gltf|glb)$/i,
      exclude: undefined as any,
      verbose: false,
      geometry: {
        compress: 'meshopt',
        quality: 0.75,
        speed: 0.5,
        precision: 0.8,
      },
      textures: {
        mode: 'auto',
        quality: 0.75,
        maxSize: 1024,
        etc1sPatterns: [],
        uastcPatterns: [],
      },
    };

    // Apply preset if specified
    let presetConfig: Partial<GLTFOptimizerOptions> = {};
    if (options.level) {
      presetConfig = this.getPreset(options.level);
    }

    // Merge configurations: base defaults < preset < user options
    const merged = this.deepMerge(baseDefaults, presetConfig, options);

    // Handle exclude pattern (can be undefined)
    if (options.exclude === undefined && presetConfig.exclude === undefined) {
      (merged as any).exclude = undefined;
    }

    return merged as ProcessedOptions;
  }

  /**
   * Deep merge multiple configuration objects
   */
  private static deepMerge(...objects: any[]): any {
    const result: any = {};

    for (const obj of objects) {
      if (!obj) {
        continue;
      }

      for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) {
          continue;
        }

        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          !(value instanceof RegExp)
        ) {
          // Deep merge nested objects
          result[key] = this.deepMerge(result[key] || {}, value);
        } else {
          // Direct assignment for primitives, arrays, RegExp, etc.
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Validate processed options and log warnings for invalid values
   */
  static validateOptions(options: ProcessedOptions, verbose: boolean = false) {
    const warnings: string[] = [];

    // Validate geometry options
    if (
      options.geometry.quality < 0 ||
      options.geometry.quality > 1 ||
      isNaN(options.geometry.quality)
    ) {
      warnings.push(
        `Invalid geometry.quality: ${options.geometry.quality} (should be 0-1)`,
      );
      options.geometry.quality = 0.75; // Reset to default
    }

    if (
      options.geometry.speed < 0 ||
      options.geometry.speed > 1 ||
      isNaN(options.geometry.speed)
    ) {
      warnings.push(
        `Invalid geometry.speed: ${options.geometry.speed} (should be 0-1)`,
      );
      options.geometry.speed = 0.5; // Reset to default
    }

    if (
      options.geometry.precision < 0 ||
      options.geometry.precision > 1 ||
      isNaN(options.geometry.precision)
    ) {
      warnings.push(
        `Invalid geometry.precision: ${options.geometry.precision} (should be 0-1)`,
      );
      options.geometry.precision = 0.8; // Reset to default
    }

    // Validate texture options
    if (
      options.textures.quality < 0 ||
      options.textures.quality > 1 ||
      isNaN(options.textures.quality)
    ) {
      warnings.push(
        `Invalid textures.quality: ${options.textures.quality} (should be 0-1)`,
      );
      options.textures.quality = 0.75; // Reset to default
    }

    if (
      options.textures.maxSize <= 0 ||
      !Number.isInteger(options.textures.maxSize)
    ) {
      warnings.push(
        `Invalid textures.maxSize: ${options.textures.maxSize} (should be positive integer)`,
      );
      options.textures.maxSize = 1024; // Reset to default
    }

    // Log warnings if verbose mode is enabled
    if (verbose && warnings.length > 0) {
      console.warn('⚠️  GLTF Optimizer configuration warnings:');
      warnings.forEach((warning) => console.warn(`   ${warning}`));
      console.warn('   Invalid values have been reset to defaults.');
    }

    return options;
  }

  /**
   * Get a human-readable summary of the current configuration
   */
  static getConfigSummary(options: ProcessedOptions): string {
    const geometryCompression = options.geometry.compress || 'none';
    const textureMode = options.textures.mode;

    return [
      `🔧 GLTF Optimizer Configuration:`,
      `   Level: ${options.level}`,
      `   Geometry: ${geometryCompression} (quality: ${(options.geometry.quality * 100).toFixed(0)}%, precision: ${(options.geometry.precision * 100).toFixed(0)}%)`,
      `   Textures: ${textureMode} mode (quality: ${(options.textures.quality * 100).toFixed(0)}%, max size: ${options.textures.maxSize}px)`,
    ].join('\n');
  }
}
