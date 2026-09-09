/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'os';
import path from 'path';

export type ScreenshotResult = Record<string, unknown> & {
  imageData: string;
  mimeType?: string;
};

export function isScreenshotResult(value: unknown): value is ScreenshotResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).imageData === 'string'
  );
}

export async function saveScreenshot(
  result: ScreenshotResult,
  requestedPath?: string,
): Promise<string> {
  const outputPath =
    requestedPath ??
    path.join(os.tmpdir(), `iwsdk-screenshot-${randomUUID()}.png`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    Buffer.from(result.imageData, 'base64'),
    requestedPath == null ? { flag: 'wx' } : undefined,
  );
  return outputPath;
}
