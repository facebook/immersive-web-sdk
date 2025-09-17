/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  DracoParams,
  MeshoptParams,
  TextureCompressionParams,
} from './types.js';

/**
 * Maps user-friendly 0-1 scale values to gltf-transform specific parameters
 */
export class CompressionMapper {
  /**
   * Convert 0-1 quality scale to Draco compression parameters
   */
  static toDracoParams(
    quality: number = 0.75,
    speed: number = 0.5,
    precision: number = 0.8,
  ): DracoParams {
    // Clamp values to valid range
    quality = Math.max(0, Math.min(1, quality));
    speed = Math.max(0, Math.min(1, speed));
    precision = Math.max(0, Math.min(1, precision));

    return {
      method: quality > 0.5 ? 'edgebreaker' : 'sequential',
      encodeSpeed: Math.round(speed * 10), // 0-10
      decodeSpeed: Math.round(quality * 10), // 0-10, higher quality = faster decode
      quantizationBits: {
        POSITION: 10 + Math.round(precision * 6), // 10-16
        NORMAL: 8 + Math.round(precision * 2), // 8-10
        TEXCOORD_0: 10 + Math.round(precision * 2), // 10-12
      },
    };
  }

  /**
   * Convert 0-1 quality scale to Meshopt compression parameters
   */
  static toMeshoptParams(quality: number = 0.75): MeshoptParams {
    quality = Math.max(0, Math.min(1, quality));
    return {
      level: quality > 0.6 ? 'medium' : 'high', // high = more compression
    };
  }

  /**
   * Convert 0-1 quality scale to quantization bits
   */
  static toQuantizationBits(precision: number = 0.8) {
    precision = Math.max(0, Math.min(1, precision));
    return {
      quantizePosition: 10 + Math.round(precision * 6), // 10-16
      quantizeNormal: 8 + Math.round(precision * 2), // 8-10
      quantizeTexcoord: 10 + Math.round(precision * 2), // 10-12
      quantizeColor: 8, // Fixed at 8 bits
      quantizeWeight: 8, // Fixed at 8 bits
      quantizeGeneric: 10 + Math.round(precision * 2), // 10-12
    };
  }

  /**
   * Convert 0-1 quality scale to ETC1S compression parameters
   */
  static toETC1SParams(
    quality: number = 0.75,
    pattern?: string,
  ): TextureCompressionParams {
    quality = Math.max(0, Math.min(1, quality));
    return {
      mode: 'etc1s',
      quality: Math.round(quality * 255), // 0-255
      pattern,
    };
  }

  /**
   * Convert 0-1 quality scale to UASTC compression parameters
   */
  static toUASTCParams(
    quality: number = 0.75,
    pattern?: string,
  ): TextureCompressionParams {
    quality = Math.max(0, Math.min(1, quality));
    return {
      mode: 'uastc',
      quality: Math.round((1 - quality) * 4), // 0-4, inverted (0 = best quality)
      pattern,
    };
  }

  /**
   * Get auto-detection patterns for texture compression modes
   */
  static getAutoTexturePatterns() {
    return {
      // High-quality UASTC for detail-critical textures
      uastc: [
        /normalTexture/,
        /metallicRoughnessTexture/,
        /emissiveTexture/,
        /occlusionTexture/,
        /detail|bump|height/i,
        /hero|main|primary/i,
        /normal|detail|specular/i,
      ],

      // Efficient ETC1S for simple/large textures
      etc1s: [
        /baseColorTexture/,
        /diffuseTexture/,
        /ui|interface|overlay/i,
        /sky|environment/i,
        /logo|icon|simple/i,
        /background|ambient/i,
      ],
    };
  }

  /**
   * Determine compression mode for a texture based on auto-detection rules
   */
  static detectTextureCompressionMode(textureName: string): 'etc1s' | 'uastc' {
    const patterns = this.getAutoTexturePatterns();

    // Check UASTC patterns first (higher quality)
    for (const pattern of patterns.uastc) {
      if (pattern.test(textureName)) {
        return 'uastc';
      }
    }

    // Check ETC1S patterns
    for (const pattern of patterns.etc1s) {
      if (pattern.test(textureName)) {
        return 'etc1s';
      }
    }

    // Default to ETC1S for unknown textures
    return 'etc1s';
  }

  /**
   * Determine compression mode using manual patterns
   */
  static detectManualTextureCompressionMode(
    textureName: string,
    etc1sPatterns: RegExp[] = [],
    uastcPatterns: RegExp[] = [],
  ): 'etc1s' | 'uastc' {
    // Check UASTC patterns first
    for (const pattern of uastcPatterns) {
      if (pattern.test(textureName)) {
        return 'uastc';
      }
    }

    // Check ETC1S patterns
    for (const pattern of etc1sPatterns) {
      if (pattern.test(textureName)) {
        return 'etc1s';
      }
    }

    // Default to ETC1S if no patterns match
    return 'etc1s';
  }
}
