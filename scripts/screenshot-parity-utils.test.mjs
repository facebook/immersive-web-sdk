/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  assertPngScreenshotParity,
  inspectPng,
  summarizePngScreenshot,
} from './screenshot-parity-utils.mjs';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  typeBytes.copy(header, 4);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([header, data, checksum]);
}

function makePng(width, height, pixelAt) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = pixelAt(x, y);
      const pixelOffset = rowOffset + 1 + x * 4;
      scanlines[pixelOffset] = pixel & 0xff;
      scanlines[pixelOffset + 1] = (pixel >>> 8) & 0xff;
      scanlines[pixelOffset + 2] = (pixel >>> 16) & 0xff;
      scanlines[pixelOffset + 3] = 0xff;
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  ]);
}

test('accepts valid PNG screenshots with different compressed sizes', () => {
  const width = 128;
  const height = 128;
  const cliImage = makePng(width, height, () => 0x336699);
  const mcpImage = makePng(
    width,
    height,
    (x, y) => (x * 73856093) ^ (y * 19349663),
  );
  assert(
    Math.abs(cliImage.length - mcpImage.length) > 4096,
    'fixture should cover the removed compressed-size heuristic',
  );

  const cli = summarizePngScreenshot(cliImage, 'image/png', 'CLI screenshot');
  const mcp = summarizePngScreenshot(mcpImage, 'image/png', 'MCP screenshot');
  assert.notEqual(cli.hash, mcp.hash);
  assert.doesNotThrow(() =>
    assertPngScreenshotParity('browser_screenshot', cli, mcp),
  );
});

test('rejects screenshots with different dimensions', () => {
  const cli = summarizePngScreenshot(
    makePng(64, 64, () => 0),
    'image/png',
    'CLI screenshot',
  );
  const mcp = summarizePngScreenshot(
    makePng(65, 64, () => 0),
    'image/png',
    'MCP screenshot',
  );

  assert.throws(
    () => assertPngScreenshotParity('browser_screenshot', cli, mcp),
    /different widths/,
  );
});

test('rejects invalid image transport metadata and corrupt PNG data', () => {
  const image = makePng(64, 64, () => 0);
  assert.throws(
    () => summarizePngScreenshot(image, 'image/jpeg', 'screenshot'),
    /must declare image\/png/,
  );

  const corrupt = Buffer.from(image);
  corrupt[0] = 0;
  assert.throws(() => inspectPng(corrupt), /valid PNG signature/);

  const badChecksum = Buffer.from(image);
  badChecksum[41] ^= 1;
  assert.throws(() => inspectPng(badChecksum), /invalid IDAT chunk checksum/);
});
