/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const outPath = path.join(__dirname, '..', 'src', 'version.ts');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const engine = pkg.engines?.node ?? '>=20.19.0';

fs.writeFileSync(
  outPath,
  `export const NODE_ENGINE = ${JSON.stringify(engine)};\n`,
);
