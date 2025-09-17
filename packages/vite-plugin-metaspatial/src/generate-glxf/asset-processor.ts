/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import fs from 'fs-extra';
import type { GLXFFile, GLXFAsset, GLTFFile } from './types.js';

/**
 * Process GLTF file and extract its dependencies
 */
export async function processGLTFDependencies(
  gltfPath: string,
): Promise<string[]> {
  const dependencies: string[] = [];

  try {
    const gltfContent = await fs.readFile(gltfPath, 'utf8');
    const gltf: GLTFFile = JSON.parse(gltfContent);

    // Extract buffer dependencies (.bin files)
    if (gltf.buffers) {
      for (const buffer of gltf.buffers) {
        if (buffer.uri && !buffer.uri.startsWith('data:')) {
          dependencies.push(buffer.uri);
        }
      }
    }

    // Extract image dependencies
    if (gltf.images) {
      for (const image of gltf.images) {
        if (image.uri && !image.uri.startsWith('data:')) {
          dependencies.push(image.uri);
        }
      }
    }

    return dependencies;
  } catch (error) {
    throw new Error(`Failed to process GLTF file ${gltfPath}: ${error}`);
  }
}

/**
 * Process and copy assets from temporary directory to final locations
 */
export async function processAssets(
  tempDir: string,
  glxfFiles: string[],
  finalGlxfDir: string,
  finalGltfDir: string,
  verbose: boolean = false,
): Promise<void> {
  // Ensure final output directories exist and clean generated dir
  await fs.ensureDir(finalGlxfDir);
  await fs.ensureDir(finalGltfDir);
  await fs.remove(path.join(finalGltfDir, 'generated'));
  await fs.ensureDir(path.join(finalGltfDir, 'generated'));

  if (verbose) {
    console.log(`📋 Found ${glxfFiles.length} GLXF file(s) to process`);
  }

  // Process each GLXF file
  for (const glxfFile of glxfFiles) {
    const tempGlxfPath = path.join(tempDir, glxfFile);
    const glxfContent = await fs.readFile(tempGlxfPath, 'utf8');
    const glxf: GLXFFile = JSON.parse(glxfContent);

    if (verbose) {
      console.log(`📄 Processing GLXF: ${glxfFile}`);
    }

    // Process each asset in the GLXF file
    if (glxf.assets) {
      for (const asset of glxf.assets) {
        await processAsset(tempDir, asset, finalGltfDir, verbose);
        // Update asset URI to point to new location
        asset.uri = `../gltf/generated/${asset.uri}`;
      }
    }

    // Write processed GLXF file to final location
    const finalGlxfPath = path.join(finalGlxfDir, glxfFile);
    await fs.writeFile(finalGlxfPath, JSON.stringify(glxf, null, 2));

    if (verbose) {
      console.log(`✅ Processed and saved: ${glxfFile}`);
    }
  }
}

/**
 * Process a single asset (GLB or GLTF)
 */
async function processAsset(
  tempDir: string,
  asset: GLXFAsset,
  finalGltfDir: string,
  verbose: boolean,
): Promise<void> {
  const assetPath = path.join(tempDir, asset.uri);
  const assetExt = path.extname(asset.uri).toLowerCase();

  if (assetExt === '.glb') {
    // Copy GLB file directly
    const targetPath = path.join(finalGltfDir, 'generated', asset.uri);
    await fs.copy(assetPath, targetPath);

    if (verbose) {
      console.log(`📦 Copied GLB: ${asset.uri}`);
    }
  } else if (assetExt === '.gltf') {
    // Process GLTF file and its dependencies
    const dependencies = await processGLTFDependencies(assetPath);

    // Copy GLTF file
    const targetGltfPath = path.join(finalGltfDir, 'generated', asset.uri);
    await fs.copy(assetPath, targetGltfPath);

    // Copy all dependencies
    for (const dep of dependencies) {
      const depSourcePath = path.join(tempDir, dep);
      const depTargetPath = path.join(finalGltfDir, 'generated', dep);

      if (await fs.pathExists(depSourcePath)) {
        await fs.copy(depSourcePath, depTargetPath);

        if (verbose) {
          console.log(`📎 Copied dependency: ${dep}`);
        }
      } else if (verbose) {
        console.warn(`⚠️  Dependency not found: ${dep}`);
      }
    }

    if (verbose) {
      console.log(
        `📄 Copied GLTF: ${asset.uri} (with ${dependencies.length} dependencies)`,
      );
    }
  }
}
