/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFile, rm } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { saveScreenshot } from '../src/screenshot-output.js';

const generatedPaths: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    generatedPaths.splice(0).map((filePath) => rm(filePath, { force: true })),
  );
});

test('uses exclusive unique paths for implicit screenshot output', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  const firstData = Buffer.from('first screenshot');
  const secondData = Buffer.from('second screenshot');

  const [firstPath, secondPath] = await Promise.all([
    saveScreenshot({ imageData: firstData.toString('base64') }),
    saveScreenshot({ imageData: secondData.toString('base64') }),
  ]);
  generatedPaths.push(firstPath, secondPath);

  expect(firstPath).not.toBe(secondPath);
  await expect(readFile(firstPath)).resolves.toEqual(firstData);
  await expect(readFile(secondPath)).resolves.toEqual(secondData);
});
