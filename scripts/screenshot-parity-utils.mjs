/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_MIME_TYPE = 'image/png';
const MIN_PNG_BYTES = 64;
const MAX_PNG_DIMENSION = 0x7fffffff;
const VALID_BIT_DEPTHS_BY_COLOR_TYPE = new Map([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
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

function assertPngHeader(data, label) {
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = data[8];
  const colorType = data[9];
  const compressionMethod = data[10];
  const filterMethod = data[11];
  const interlaceMethod = data[12];

  assert(
    width > 0 && width <= MAX_PNG_DIMENSION,
    `${label} has an invalid PNG width (${width})`,
  );
  assert(
    height > 0 && height <= MAX_PNG_DIMENSION,
    `${label} has an invalid PNG height (${height})`,
  );
  assert(
    VALID_BIT_DEPTHS_BY_COLOR_TYPE.get(colorType)?.has(bitDepth),
    `${label} has an invalid PNG bit-depth/color-type combination (${bitDepth}/${colorType})`,
  );
  assert.equal(
    compressionMethod,
    0,
    `${label} uses an unsupported PNG compression method`,
  );
  assert.equal(
    filterMethod,
    0,
    `${label} uses an unsupported PNG filter method`,
  );
  assert(
    interlaceMethod === 0 || interlaceMethod === 1,
    `${label} uses an invalid PNG interlace method`,
  );

  return { width, height, bitDepth, colorType };
}

export function inspectPng(image, label = 'screenshot') {
  assert(Buffer.isBuffer(image), `${label} must be a Buffer`);
  assert(
    image.length >= MIN_PNG_BYTES,
    `${label} is too small to be a nontrivial PNG (${image.length} bytes)`,
  );
  assert(
    image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `${label} does not have a valid PNG signature`,
  );

  let offset = PNG_SIGNATURE.length;
  let header = null;
  let idatBytes = 0;
  let sawEnd = false;

  while (offset < image.length) {
    assert(
      offset + 12 <= image.length,
      `${label} has a truncated PNG chunk header`,
    );
    const chunkLength = image.readUInt32BE(offset);
    const chunkTypeOffset = offset + 4;
    const chunkDataOffset = chunkTypeOffset + 4;
    const chunkCrcOffset = chunkDataOffset + chunkLength;
    const nextOffset = chunkCrcOffset + 4;
    assert(
      nextOffset <= image.length,
      `${label} has a truncated PNG chunk payload`,
    );

    const chunkTypeBytes = image.subarray(chunkTypeOffset, chunkDataOffset);
    const chunkType = chunkTypeBytes.toString('ascii');
    assert(
      /^[A-Za-z]{4}$/.test(chunkType),
      `${label} has an invalid PNG chunk type`,
    );
    const chunkData = image.subarray(chunkDataOffset, chunkCrcOffset);
    const expectedCrc = image.readUInt32BE(chunkCrcOffset);
    const actualCrc = crc32(Buffer.concat([chunkTypeBytes, chunkData]));
    assert.equal(
      actualCrc,
      expectedCrc,
      `${label} has an invalid ${chunkType} chunk checksum`,
    );

    if (header === null) {
      assert.equal(chunkType, 'IHDR', `${label} must start with a PNG IHDR`);
      assert.equal(chunkLength, 13, `${label} has an invalid PNG IHDR length`);
      header = assertPngHeader(chunkData, label);
    } else {
      assert.notEqual(
        chunkType,
        'IHDR',
        `${label} contains more than one PNG IHDR`,
      );
    }

    if (chunkType === 'IDAT') {
      idatBytes += chunkLength;
    }
    if (chunkType === 'IEND') {
      assert.equal(chunkLength, 0, `${label} has an invalid PNG IEND length`);
      assert(idatBytes > 0, `${label} does not contain PNG image data`);
      assert.equal(
        nextOffset,
        image.length,
        `${label} has trailing data after its PNG IEND chunk`,
      );
      sawEnd = true;
    }

    offset = nextOffset;
  }

  assert(header !== null, `${label} does not contain a PNG IHDR`);
  assert(sawEnd, `${label} does not contain a PNG IEND chunk`);
  return header;
}

export function summarizePngScreenshot(image, mimeType, label = 'screenshot') {
  assert.equal(
    mimeType,
    PNG_MIME_TYPE,
    `${label} must declare ${PNG_MIME_TYPE}`,
  );
  const metadata = inspectPng(image, label);
  return {
    kind: 'image',
    mimeType,
    ...metadata,
    bytes: image.length,
    hash: createHash('sha256').update(image).digest('hex'),
  };
}

export function assertPngScreenshotParity(label, cliValue, mcpValue) {
  assert.equal(
    cliValue?.kind,
    'image',
    `${label}: CLI did not return an image payload`,
  );
  assert.equal(
    mcpValue?.kind,
    'image',
    `${label}: MCP did not return an image payload`,
  );
  assert.equal(
    cliValue.mimeType,
    mcpValue.mimeType,
    `${label}: CLI and MCP screenshots used different MIME types`,
  );
  assert.equal(
    cliValue.width,
    mcpValue.width,
    `${label}: CLI and MCP screenshots used different widths`,
  );
  assert.equal(
    cliValue.height,
    mcpValue.height,
    `${label}: CLI and MCP screenshots used different heights`,
  );
  assert.equal(
    cliValue.bitDepth,
    mcpValue.bitDepth,
    `${label}: CLI and MCP screenshots used different PNG bit depths`,
  );
  assert.equal(
    cliValue.colorType,
    mcpValue.colorType,
    `${label}: CLI and MCP screenshots used different PNG color types`,
  );
}
