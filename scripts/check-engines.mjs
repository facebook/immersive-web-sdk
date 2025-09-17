#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import semver from 'semver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

async function pathExists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(p) {
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function gatherPnpmPackages(root) {
  const out = [];
  const pnpmRoot = path.join(root, 'node_modules', '.pnpm');
  if (!(await pathExists(pnpmRoot))) return out;
  const entries = await fs.readdir(pnpmRoot, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(pnpmRoot, ent.name);
    // Typical structure: .pnpm/<name>@<ver>.../node_modules/<name>/package.json
    // Walk shallowly to find any package.json files
    try {
      const maybeNm = path.join(dir, 'node_modules');
      const nmExists = await pathExists(maybeNm);
      if (!nmExists) continue;
      const nmEntries = await fs.readdir(maybeNm, { withFileTypes: true });
      for (const e2 of nmEntries) {
        if (!e2.isDirectory()) continue;
        const pj = path.join(maybeNm, e2.name, 'package.json');
        if (await pathExists(pj)) out.push(pj);
      }
    } catch {}
  }
  return out;
}

async function gatherWorkspacePackages(root) {
  const out = [];
  const packagesDir = path.join(root, 'packages');
  if (!(await pathExists(packagesDir))) return out;
  // Shallow scan packages/*/package.json (and one more level for subpackages)
  const first = await fs.readdir(packagesDir, { withFileTypes: true });
  for (const ent of first) {
    const p = path.join(packagesDir, ent.name);
    if (ent.isDirectory()) {
      const pj = path.join(p, 'package.json');
      if (await pathExists(pj)) out.push(pj);
      // one more nested level
      try {
        const nested = await fs.readdir(p, { withFileTypes: true });
        for (const sub of nested) {
          if (!sub.isDirectory()) continue;
          const pj2 = path.join(p, sub.name, 'package.json');
          if (await pathExists(pj2)) out.push(pj2);
        }
      } catch {}
    }
  }
  return out;
}

function addToMap(map, key, val) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(val);
}

function summarize(rangesMap) {
  const rows = [];
  for (const [range, set] of rangesMap.entries()) {
    let min = null;
    try {
      const v = semver.minVersion(range);
      min = v ? v.version : null;
    } catch {}
    rows.push({ range, count: set.size, min });
  }
  rows.sort((a, b) => {
    // Sort by minimal version desc (stricter first), then by count desc
    const av = a.min ? semver.coerce(a.min) : null;
    const bv = b.min ? semver.coerce(b.min) : null;
    if (av && bv) {
      const cmp = semver.rcompare(av, bv);
      if (cmp !== 0) return cmp;
    } else if (av && !bv) {
      return -1;
    } else if (!av && bv) {
      return 1;
    }
    return b.count - a.count;
  });
  return rows;
}

async function main() {
  const root = REPO_ROOT;
  const args = process.argv.slice(2);
  // Flags:
  //   --set-engines             => write engines.node to root + all workspace package.json files using the computed floor
  const setEnginesFlag = args.includes('--set-engines');
  const ignoreScopes = new Set(['@iwsdk/']); // always ignored; no flag to override
  const seen = new Set(); // name@version
  const byRange = new Map(); // range -> Set(name@version)
  const invalid = new Map(); // invalidRange -> Set(name@version)
  const unspecified = new Set();

  const rootsToScan = [path.join(root, 'package.json')];
  const workspacePkgs = await gatherWorkspacePackages(root);
  rootsToScan.push(...workspacePkgs);
  const pnpmPkgs = await gatherPnpmPackages(root);
  rootsToScan.push(...pnpmPkgs);

  for (const pjPath of rootsToScan) {
    const pkg = await readJsonSafe(pjPath);
    if (!pkg || !pkg.name || !pkg.version) continue;

    // Skip ignored scopes entirely (affects both calculation and reporting)
    let ignored = false;
    if (typeof pkg.name === 'string' && pkg.name.startsWith('@')) {
      for (const sc of ignoreScopes) {
        if (pkg.name.startsWith(sc)) {
          ignored = true;
          break;
        }
      }
    }
    if (ignored) continue;

    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const range = pkg.engines && pkg.engines.node;
    if (!range) {
      unspecified.add(key);
      continue;
    }
    try {
      // Validate range
      // semver.validRange returns null if invalid
      const vr = semver.validRange(range);
      if (!vr) {
        addToMap(invalid, String(range), key);
        continue;
      }
      addToMap(byRange, vr, key);
    } catch {
      addToMap(invalid, String(range), key);
    }
  }

  // Compute conservative floor
  let floor = null;
  for (const range of byRange.keys()) {
    try {
      const mv = semver.minVersion(range);
      if (!mv) continue;
      if (!floor || semver.gt(mv, floor)) floor = mv;
    } catch {}
  }

  console.log('Engine audit (node)');
  console.log('  Packages scanned:', seen.size);
  console.log(
    '  With engines.node:',
    [...byRange.values()].reduce((a, s) => a + s.size, 0),
  );
  console.log('  Without engines.node:', unspecified.size);
  console.log(
    '  With invalid engines.node:',
    [...invalid.values()].reduce((a, s) => a + s.size, 0),
  );
  if (floor) {
    console.log(
      '\nConservative minimum Node version required across deps: >=',
      floor.version,
    );
    // Find which packages/ranges set this floor
    const providers = [];
    for (const [range, set] of byRange.entries()) {
      try {
        const mv = semver.minVersion(range);
        if (mv && semver.eq(mv, floor)) {
          providers.push({ range, pkgs: Array.from(set).sort() });
        }
      } catch {}
    }
    if (providers.length) {
      console.log('\nPackages requiring this floor:');
      for (const p of providers) {
        const list = p.pkgs;
        const head = list.slice(0, 10).join(', ');
        const more = list.length > 10 ? ` …(+${list.length - 10} more)` : '';
        console.log(
          `  range ${p.range} -> ${list.length} pkg(s): ${head}${more}`,
        );
      }
    }
  } else {
    console.log(
      '\nNo valid engines.node constraints found; cannot compute a floor.',
    );
  }

  const rows = summarize(byRange);
  if (rows.length) {
    console.log('\nTop engine ranges (stricter first):');
    for (const r of rows.slice(0, 20)) {
      console.log(
        `  ${r.range.padEnd(24)} | min ${r.min || '-'} | ${r.count} packages`,
      );
    }
  }

  if (invalid.size) {
    console.log('\nInvalid engine ranges:');
    for (const [rng, set] of invalid.entries()) {
      console.log(
        `  ${rng}: ${[...set].slice(0, 5).join(', ')}${set.size > 5 ? '…' : ''}`,
      );
    }
  }

  // Write engines.node to workspace packages + root if requested
  if (setEnginesFlag) {
    if (!floor) {
      console.log('\nCannot set engines.node: no computed floor from audit.');
      return;
    }
    const setEnginesValue = `>=${floor.version}`;
    console.log(
      `\nApplying computed floor to engines.node: ${setEnginesValue}`,
    );
    const targets = [path.join(root, 'package.json'), ...workspacePkgs];
    let changed = 0;
    for (const pj of targets) {
      const pkg = await readJsonSafe(pj);
      if (!pkg) continue;
      pkg.engines = pkg.engines || {};
      if (pkg.engines.node !== setEnginesValue) {
        pkg.engines.node = setEnginesValue;
        await fs.writeFile(pj, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        changed++;
      }
    }
    console.log(
      `\nUpdated engines.node to ${setEnginesValue} in ${changed} package.json file(s).`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
