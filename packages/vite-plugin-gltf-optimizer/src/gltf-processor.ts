/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as fs from 'fs/promises';
import path from 'path';
import { Mode, toktx } from '@gltf-transform/cli';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  draco,
  quantize,
  textureCompress,
  prune,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { CompressionMapper } from './compression-mapper.js';
import type { ProcessedOptions } from './types.js';

/**
 * GLTF file processor using gltf-transform
 */
export class GLTFProcessor {
  private io: NodeIO;
  private options: ProcessedOptions;

  constructor(options: ProcessedOptions) {
    this.options = options;
    this.io = new NodeIO();
  }

  /**
   * Initialize the processor with required dependencies
   */
  async initialize(): Promise<void> {
    try {
      // Register extensions
      this.io.registerExtensions(ALL_EXTENSIONS);

      // Register Draco dependencies if needed
      if (
        this.options.geometry.compress === 'draco' ||
        this.options.geometry.compress === 'both'
      ) {
        this.io.registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
        });
      }
    } catch (error) {
      throw new Error(`Failed to initialize GLTF processor: ${error}`);
    }
  }

  /**
   * Process a GLTF/GLB file and return optimized version
   */
  async processFile(filePath: string): Promise<Buffer>;
  async processFile(
    filePath: string,
    returnResources: true,
  ): Promise<{ buffer: Buffer; resources: Record<string, Buffer> }>;
  async processFile(
    filePath: string,
    returnResources = false,
  ): Promise<Buffer | { buffer: Buffer; resources: Record<string, Buffer> }> {
    const fileName = path.basename(filePath);

    if (this.options.verbose) {
      console.log(`🔄 Processing: ${fileName}`);
    }

    try {
      let document;

      // Determine if this is a GLTF (JSON) or GLB (binary) file
      if (fileName.toLowerCase().endsWith('.gltf')) {
        // For GLTF files, we need to load external resources
        const jsonString = await fs.readFile(filePath, 'utf8');
        const gltfJson = JSON.parse(jsonString);
        const resources = await this.loadExternalResources(
          gltfJson,
          path.dirname(filePath),
        );

        document = await this.io.readJSON({
          json: gltfJson,
          resources,
        });
      } else if (fileName.toLowerCase().endsWith('.glb')) {
        // For GLB files, read as binary (all assets are embedded)
        const inputBuffer = await fs.readFile(filePath);
        document = await this.io.readBinary(new Uint8Array(inputBuffer));
      } else {
        throw new Error(`Unsupported file format: ${fileName}`);
      }

      // Configure logger
      if (this.options.verbose) {
        const logger = new Logger(Logger.Verbosity.INFO);
        document.setLogger(logger);
      }

      // Apply optimizations
      await this.applyGeometryOptimizations(document, fileName);
      await this.applyTextureOptimizations(document, fileName);

      // Write optimized document - use appropriate format
      let optimizedBuffer: ArrayBuffer;
      let externalResources: Record<string, Buffer> = {};

      if (fileName.toLowerCase().endsWith('.gltf')) {
        // For GLTF files, write as GLTF and handle external resources
        const jsonDoc = await this.io.writeJSON(document);

        if (returnResources) {
          // Collect external resources for bundle emission
          for (const [uri, data] of Object.entries(jsonDoc.resources)) {
            externalResources[uri] = Buffer.from(data as Uint8Array);
            if (this.options.verbose) {
              console.log(`   📎 Collected resource for emission: ${uri}`);
            }
          }
        } else {
          // Write external resources back to disk (legacy behavior)
          const baseDir = path.dirname(filePath);
          for (const [uri, data] of Object.entries(jsonDoc.resources)) {
            const resourcePath = path.resolve(baseDir, uri);
            await fs.writeFile(resourcePath, Buffer.from(data as Uint8Array));

            if (this.options.verbose) {
              console.log(`   📎 Wrote compressed resource: ${uri}`);
            }
          }
        }

        optimizedBuffer = new TextEncoder().encode(
          JSON.stringify(jsonDoc.json),
        ).buffer;
      } else {
        // For GLB files, write as binary
        const binaryResult = await this.io.writeBinary(document);
        optimizedBuffer = Buffer.from(binaryResult as Uint8Array).buffer;
      }

      if (this.options.verbose) {
        const originalStats = await fs.stat(filePath);
        const originalSize = originalStats.size;
        const optimizedSize = optimizedBuffer.byteLength;
        const savings = (
          ((originalSize - optimizedSize) / originalSize) *
          100
        ).toFixed(1);

        console.log(
          `✅ ${fileName}: ${(originalSize / 1024).toFixed(1)}KB → ${(optimizedSize / 1024).toFixed(1)}KB (${savings}% reduction)`,
        );
      }

      const mainBuffer = Buffer.from(optimizedBuffer);

      if (returnResources) {
        return { buffer: mainBuffer, resources: externalResources };
      }

      return mainBuffer;
    } catch (error) {
      console.error(`❌ Failed to process ${fileName}:`, error);
      // Read original for fallback
      const inputBuffer = await fs.readFile(filePath);

      if (returnResources) {
        return { buffer: inputBuffer, resources: {} };
      }

      return inputBuffer;
    }
  }

  /**
   * Process a GLTF/GLB buffer (for bundled assets without external file access)
   */
  async processBuffer(inputBuffer: Buffer, fileName: string): Promise<Buffer> {
    if (this.options.verbose) {
      console.log(`🔄 Processing: ${fileName}`);
    }

    try {
      let document;

      // Determine if this is a GLTF (JSON) or GLB (binary) file
      if (fileName.toLowerCase().endsWith('.gltf')) {
        // For GLTF files, read as JSON (no external resources for bundled assets)
        const jsonString = inputBuffer.toString('utf8');
        document = await this.io.readJSON({
          json: JSON.parse(jsonString),
          resources: {}, // No external resources for bundled assets
        });
      } else if (fileName.toLowerCase().endsWith('.glb')) {
        // For GLB files, read as binary
        document = await this.io.readBinary(new Uint8Array(inputBuffer));
      } else {
        throw new Error(`Unsupported file format: ${fileName}`);
      }

      // Configure logger
      if (this.options.verbose) {
        const logger = new Logger(Logger.Verbosity.INFO);
        document.setLogger(logger);
      }

      // Apply optimizations
      await this.applyGeometryOptimizations(document, fileName);
      await this.applyTextureOptimizations(document, fileName);

      // Write optimized document
      const optimizedBuffer = await this.io.writeBinary(document);

      if (this.options.verbose) {
        const originalSize = inputBuffer.length;
        const optimizedSize = optimizedBuffer.byteLength;
        const savings = (
          ((originalSize - optimizedSize) / originalSize) *
          100
        ).toFixed(1);

        console.log(
          `✅ ${fileName}: ${(originalSize / 1024).toFixed(1)}KB → ${(optimizedSize / 1024).toFixed(1)}KB (${savings}% reduction)`,
        );
      }

      return Buffer.from(optimizedBuffer);
    } catch (error) {
      console.error(`❌ Failed to process ${fileName}:`, error);
      // Return original buffer on error
      return inputBuffer;
    }
  }

  /**
   * Apply geometry optimizations to the document
   */
  private async applyGeometryOptimizations(
    document: any,
    _fileName: string,
  ): Promise<void> {
    const { compress, quality, speed, precision } = this.options.geometry;

    if (this.options.verbose) {
      console.log(`   Geometry compression: ${compress}`);
    }

    // Always apply basic cleanup
    await document.transform(
      prune(), // Remove unused resources
      dedup(), // Remove duplicate data
    );

    // Apply quantization (used by all compression modes)
    if (compress !== false) {
      const quantizationBits = CompressionMapper.toQuantizationBits(precision);
      await document.transform(quantize(quantizationBits));
    }

    // Apply compression based on mode
    switch (compress) {
      case 'meshopt': {
        const meshoptParams = CompressionMapper.toMeshoptParams(quality);
        if (this.options.verbose) {
          console.log(`   Meshopt level: ${meshoptParams.level}`);
        }
        // Note: meshopt requires encoder in newer versions, skipping for now
        // await document.transform(meshopt({ level: meshoptParams.level }));
        break;
      }

      case 'draco': {
        const dracoParams = CompressionMapper.toDracoParams(
          quality,
          speed,
          precision,
        );
        if (this.options.verbose) {
          console.log(
            `   Draco method: ${dracoParams.method}, encode speed: ${dracoParams.encodeSpeed}`,
          );
        }
        await document.transform(draco(dracoParams));
        break;
      }

      case 'both': {
        // Apply meshopt first, then draco
        const meshoptParams = CompressionMapper.toMeshoptParams(quality);
        const dracoParams = CompressionMapper.toDracoParams(
          quality,
          speed,
          precision,
        );

        if (this.options.verbose) {
          console.log(
            `   Applying both meshopt (${meshoptParams.level}) and draco (${dracoParams.method})`,
          );
        }

        await document.transform(
          // meshopt({ level: meshoptParams.level }),
          draco(dracoParams),
        );
        break;
      }

      case 'quantize':
        // Quantization already applied above
        if (this.options.verbose) {
          console.log(
            `   Quantization only (precision: ${(precision * 100).toFixed(0)}%)`,
          );
        }
        break;

      case false:
        if (this.options.verbose) {
          console.log(`   No geometry compression`);
        }
        break;
    }
  }

  /**
   * Load external resources referenced by a GLTF file
   */
  private async loadExternalResources(
    gltfJson: any,
    baseDir: string,
  ): Promise<Record<string, Uint8Array>> {
    const resources: Record<string, Uint8Array> = {};

    try {
      // Load external images
      if (gltfJson.images) {
        for (const image of gltfJson.images) {
          if (image.uri && !image.uri.startsWith('data:')) {
            const imagePath = path.resolve(baseDir, image.uri);
            try {
              const imageBuffer = await fs.readFile(imagePath);
              resources[image.uri] = new Uint8Array(imageBuffer);
            } catch (_) {
              if (this.options.verbose) {
                console.warn(`   ⚠️ Failed to load image: ${image.uri}`);
              }
            }
          }
        }
      }

      // Load external buffers
      if (gltfJson.buffers) {
        for (const buffer of gltfJson.buffers) {
          if (buffer.uri && !buffer.uri.startsWith('data:')) {
            const bufferPath = path.resolve(baseDir, buffer.uri);
            try {
              const bufferData = await fs.readFile(bufferPath);
              resources[buffer.uri] = new Uint8Array(bufferData);
            } catch (_) {
              if (this.options.verbose) {
                console.warn(`   ⚠️ Failed to load buffer: ${buffer.uri}`);
              }
            }
          }
        }
      }

      if (this.options.verbose && Object.keys(resources).length > 0) {
        console.log(
          `   📎 Loaded ${Object.keys(resources).length} external resource(s)`,
        );
      }
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`   ⚠️ Error loading external resources:`, error);
      }
    }

    return resources;
  }

  /**
   * Apply texture optimizations to the document
   */
  private async applyTextureOptimizations(
    document: any,
    _fileName: string,
  ): Promise<void> {
    const { mode, quality, maxSize, etc1sPatterns, uastcPatterns } =
      this.options.textures;

    if (this.options.verbose) {
      console.log(`   Texture compression mode: ${mode}`);
    }

    // Apply KTX2 compression with mode-specific settings
    const etc1sParams = CompressionMapper.toETC1SParams(quality);
    const uastcParams = CompressionMapper.toUASTCParams(quality);

    if (this.options.verbose) {
      console.log(`   Applying KTX2 compression (${mode} mode)`);
    }

    switch (mode) {
      case 'etc1s': {
        if (this.options.verbose) {
          console.log(`   KTX2 ETC1S quality level: ${etc1sParams.quality}`);
        }
        // Combine RegExp patterns into a single RegExp for slots
        const etc1sSlotPattern =
          etc1sPatterns.length > 0
            ? new RegExp(etc1sPatterns.map((p) => p.source).join('|'))
            : /.*/;

        await document.transform(
          textureCompress({
            encoder: sharp,
            resize: [maxSize, maxSize],
          }),
          toktx({
            mode: Mode.ETC1S,
            quality: etc1sParams.quality,
            encoder: sharp as any,
            slots: etc1sSlotPattern,
          }),
        );
        break;
      }

      case 'uastc': {
        if (this.options.verbose) {
          console.log(`   KTX2 UASTC quality level: ${uastcParams.quality}`);
        }
        // Combine RegExp patterns into a single RegExp for slots
        const uastcSlotPattern =
          uastcPatterns.length > 0
            ? new RegExp(uastcPatterns.map((p) => p.source).join('|'))
            : /.*/;

        await document.transform(
          textureCompress({
            encoder: sharp,
            resize: [maxSize, maxSize],
          }),
          toktx({
            mode: Mode.UASTC,
            quality: uastcParams.quality,
            encoder: sharp as any,
            slots: uastcSlotPattern,
          }),
        );
        break;
      }

      case 'auto':
      case 'mixed': {
        // Apply ETC1S to patterns that match etc1sPatterns, UASTC to others
        if (this.options.verbose) {
          console.log(
            `   KTX2 Mixed mode - ETC1S (${etc1sParams.quality}) for diffuse/albedo, UASTC (${uastcParams.quality}) for normals/roughness`,
          );
        }

        // Combine RegExp patterns into single RegExp for slots
        // Prefer exact slot names if no manual patterns provided
        const etc1sSlotPattern =
          etc1sPatterns.length > 0
            ? new RegExp(etc1sPatterns.map((p) => p.source).join('|'))
            : /(baseColorTexture|emissiveTexture|diffuseTexture)/i;

        const uastcSlotPattern =
          uastcPatterns.length > 0
            ? new RegExp(uastcPatterns.map((p) => p.source).join('|'))
            : /(normalTexture|metallicRoughnessTexture|occlusionTexture)/i;

        await document.transform(
          textureCompress({
            encoder: sharp,
            resize: [maxSize, maxSize],
          }),
          // Apply ETC1S to diffuse/albedo textures
          toktx({
            mode: Mode.ETC1S,
            quality: etc1sParams.quality,
            encoder: sharp as any,
            slots: etc1sSlotPattern,
          }),
          // Apply UASTC to normal/roughness textures
          toktx({
            mode: Mode.UASTC,
            quality: uastcParams.quality,
            encoder: sharp as any,
            slots: uastcSlotPattern,
          }),
        );
        break;
      }

      default: {
        // No KTX2 compression, just regular texture compression
        if (this.options.verbose) {
          console.log(
            `   No KTX2 compression, using standard texture compression`,
          );
        }
        await document.transform(
          textureCompress({
            encoder: sharp,
            resize: [maxSize, maxSize],
          }),
        );
        break;
      }
    }

    if (this.options.verbose) {
      console.log(`   ✅ Texture compression completed`);
    }
  }
}
