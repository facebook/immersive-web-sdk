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
const ver = pkg.version || '0.0.0';
const eng = (pkg.engines && pkg.engines.node) || '>=20.19.0';

const out = `export const VERSION = "${ver}";
export const NODE_ENGINE = "${eng}";
`;

fs.writeFileSync(outPath, out);
console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
