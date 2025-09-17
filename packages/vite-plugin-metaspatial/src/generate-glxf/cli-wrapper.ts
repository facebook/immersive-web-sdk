/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import fs from 'fs-extra';
import { processAssets } from './asset-processor.js';

/**
 * Execute Meta Spatial CLI and process the generated assets
 */
export async function executeMetaSpatialExport(
  cliPath: string,
  projectPath: string,
  finalGlxfDir: string,
  finalGltfDir: string,
  verbose: boolean = false,
): Promise<void> {
  // Create temporary directory
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'metaspatial-export-'),
  );

  try {
    const absoluteProjectPath = path.resolve(projectPath);

    if (verbose) {
      console.log(`🚀 Executing Meta Spatial CLI export:`);
      console.log(`   Project: ${absoluteProjectPath}`);
      console.log(`   Temp output: ${tempDir}`);
    }

    // Execute CLI to temporary directory
    await executeCliCommand(cliPath, absoluteProjectPath, tempDir, verbose);

    if (verbose) {
      console.log(`✅ CLI export completed, processing assets...`);
    }

    // Find all GLXF files in temp directory
    const tempFiles = await fs.readdir(tempDir);
    const glxfFiles = tempFiles.filter(
      (file) => path.extname(file) === '.glxf',
    );

    // Process and copy assets
    await processAssets(
      tempDir,
      glxfFiles,
      finalGlxfDir,
      finalGltfDir,
      verbose,
    );
  } finally {
    // Clean up temporary directory
    await fs.remove(tempDir);
    if (verbose) {
      console.log(`🧹 Cleaned up temporary directory`);
    }
  }
}

/**
 * Execute the Meta Spatial CLI command
 */
async function executeCliCommand(
  cliPath: string,
  projectPath: string,
  outputDir: string,
  verbose: boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cliProcess = spawn(
      cliPath,
      ['export', '-p', projectPath, '-o', outputDir],
      {
        stdio: verbose ? 'inherit' : 'pipe',
      },
    );

    cliProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Meta Spatial CLI export failed with code ${code}`));
      }
    });

    cliProcess.on('error', (error) => {
      reject(new Error(`Failed to execute Meta Spatial CLI: ${error.message}`));
    });
  });
}
