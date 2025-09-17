#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { VERSION } from './version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, '..');
const VARIANTS_SRC = path.join(PKG_ROOT, 'variants-src');
const DIST_ROOT = path.join(PKG_ROOT, 'dist');
const DIST_ASSETS = path.join(DIST_ROOT, 'assets');

const VARIANT_RE = /^starter-(vr|ar)-(manual|metaspatial)-(ts|js)$/;

function toVariantId(dirName) {
  const m = dirName.match(VARIANT_RE);
  if (!m) throw new Error(`Invalid starter dir: ${dirName}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function titleFromId(id) {
  const [mode, kind, lang] = id.split('-');
  const modeTitle = mode.toUpperCase();
  const kindTitle = kind === 'metaspatial' ? 'Metaspatial' : 'Manual';
  const langTitle = lang.toUpperCase();
  return `${modeTitle} ${kindTitle} (${langTitle})`;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function rimraf(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

async function readAllFiles(root) {
  const out = [];
  async function walk(cur) {
    const entries = await fsp.readdir(cur, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === '.git' || ent.name === '.DS_Store') continue;
      const full = path.join(cur, ent.name);
      const rel = path.relative(root, full);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) out.push(rel);
    }
  }
  await walk(root);
  return out;
}

function joinUrl(...parts) {
  const filtered = parts.filter(Boolean);
  return filtered
    .map((p, i) =>
      i === 0 ? p.replace(/\/$/, '') : p.replace(/^\/+|\/+$/g, ''),
    )
    .join('/')
    .replace(/([^:])\/+/g, '$1/');
}

async function copyDir(src, dst) {
  const files = await readAllFiles(src);
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dst, rel);
    await ensureDir(path.dirname(to));
    await fsp.copyFile(from, to);
  }
}

async function fileSize(file) {
  const st = await fsp.stat(file);
  return st.size;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Global content-addressed storage map shared across variants during one build
const casIndex = new Map(); // hash -> relPath

async function writeCasObject(casRoot, bytes, preferredName) {
  const hash = sha256(bytes);
  if (casIndex.has(hash)) return casIndex.get(hash);
  const safeBase = (preferredName || 'asset').replace(/[^A-Za-z0-9._-]/g, '_');
  const relPath = `${hash}-${safeBase}`;
  const absPath = path.join(casRoot, relPath);
  await ensureDir(path.dirname(absPath));
  await fsp.writeFile(absPath, bytes);
  casIndex.set(hash, relPath);
  return relPath;
}

function toJsObjectLiteral(value) {
  const isIdent = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
  const esc = (s) => JSON.stringify(s);
  const recur = (v) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return `[${v.map(recur).join(', ')}]`;
    switch (typeof v) {
      case 'boolean':
      case 'number':
        return String(v);
      case 'string':
        return esc(v);
      case 'object': {
        const entries = Object.entries(v).map(
          ([k, val]) => `${isIdent(k) ? k : esc(k)}: ${recur(val)}`,
        );
        return `{ ${entries.join(', ')} }`;
      }
      default:
        return esc(String(v));
    }
  };
  return recur(value);
}

async function generateRecipeForStarter(
  starterDir,
  cdnBase,
  casUrlBase,
  casRoot,
  casVersion,
) {
  const starterName = path.basename(starterDir);
  const id = toVariantId(starterName);
  const title = titleFromId(id);
  // We now publish assets to a canonical content-addressed store, not per-variant.

  const metaspatialDir = path.join(starterDir, 'metaspatial');
  const publicDir = path.join(starterDir, 'public');

  const hasMetaspatial =
    fs.existsSync(metaspatialDir) && fs.statSync(metaspatialDir).isDirectory();
  const hasPublic =
    fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory();

  // No per-variant asset output in dist anymore.

  const remotes = [];
  const edits = {};
  if (hasMetaspatial) {
    const files = await readAllFiles(metaspatialDir);
    for (const rel of files) {
      const srcFile = path.join(metaspatialDir, rel);
      const bytes = await fsp.readFile(srcFile);
      const relPath = path.join('metaspatial', rel).replaceAll('\\', '/');
      const casRel = await writeCasObject(casRoot, bytes, path.basename(rel));
      const url = joinUrl(casUrlBase, casRel);
      remotes.push({ path: relPath, url, bytes: bytes.length });
      edits[relPath] = { url };
    }
  }
  if (hasPublic) {
    const files = await readAllFiles(publicDir);
    for (const rel of files) {
      const srcFile = path.join(publicDir, rel);
      const bytes = await fsp.readFile(srcFile);
      const relPath = path.join('public', rel).replaceAll('\\', '/');
      const casRel = await writeCasObject(casRoot, bytes, path.basename(rel));
      const url = joinUrl(casUrlBase, casRel);
      remotes.push({ path: relPath, url, bytes: bytes.length });
      edits[relPath] = { url };
    }
  }

  // Inline text files: not shipped here; recipes consumers will inline these at scaffold time.
  const allFiles = await readAllFiles(starterDir);
  const inlineFiles = allFiles.filter(
    (rel) =>
      !rel.startsWith('metaspatial/') &&
      !rel.startsWith('public/') &&
      rel !== 'vite.config.template.ts' &&
      rel !== 'vite.config.template.js' &&
      rel !== 'src/index.template.ts' &&
      rel !== 'src/index.template.js' &&
      !rel.startsWith('node_modules/') &&
      !rel.startsWith('dist/'),
  );
  const files = [];

  function transformTemplate(source, ctx) {
    // Pass 1: feature anchors /* @chef:xr */ and /* @chef:app */
    // Scan, track brace stack and last closed object; collect edits, then apply back-to-front
    const edits = [];
    let i = 0;
    let n = source.length;
    let inS = false,
      inD = false,
      inB = false,
      inLC = false,
      inBC = false,
      esc = false;
    const braceStack = [];
    let lastClosed = null; // { start, end }
    while (i < n) {
      const ch = source[i];
      const next2 = source.slice(i, i + 2);
      if (inLC) {
        if (ch === '\n') inLC = false;
        i++;
        continue;
      }
      if (inBC) {
        if (next2 === '*/') {
          inBC = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (inS) {
        if (!esc && ch === "'") inS = false;
        esc = ch === '\\' && !esc;
        i++;
        continue;
      }
      if (inD) {
        if (!esc && ch === '"') inD = false;
        esc = ch === '\\' && !esc;
        i++;
        continue;
      }
      if (inB) {
        if (!esc && ch === '`') inB = false;
        esc = ch === '\\' && !esc;
        i++;
        continue;
      }
      if (next2 === '//') {
        inLC = true;
        i += 2;
        continue;
      }
      if (!inS && !inD && !inB && next2 === '/*') {
        // check for anchors
        const end = source.indexOf('*/', i + 2);
        const body = end !== -1 ? source.slice(i + 2, end) : '';
        const trimmed = body.trim();
        if (trimmed === '@chef:xr' || trimmed === '@chef:app') {
          if (!lastClosed) {
            i = end + 2;
            continue;
          }
          const placeholder =
            trimmed === '@chef:xr'
              ? '{{ @xrFeaturesStr }}'
              : '{{ @appFeaturesStr }}';
          edits.push({
            start: lastClosed.start,
            end: lastClosed.end + 1,
            replace: placeholder,
          });
          // also remove the comment itself
          edits.push({ start: i, end: end + 2, replace: '' });
          i = end + 2;
          continue;
        }
        inBC = true;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inS = true;
        esc = false;
        i++;
        continue;
      }
      if (ch === '"') {
        inD = true;
        esc = false;
        i++;
        continue;
      }
      if (ch === '`') {
        inB = true;
        esc = false;
        i++;
        continue;
      }
      if (ch === '{') {
        braceStack.push(i);
        i++;
        continue;
      }
      if (ch === '}') {
        const start = braceStack.pop();
        if (start != null) lastClosed = { start, end: i };
        i++;
        continue;
      }
      i++;
    }
    if (edits.length) {
      edits.sort((a, b) => b.start - a.start);
      let out = source;
      for (const e of edits)
        out = out.slice(0, e.start) + e.replace + out.slice(e.end);
      source = out;
    }

    // Pass 2: block directives /* @template:if ... */ /* @template:else */ /* @template:end */
    // IMPORTANT: the source length may have changed after Pass 1 replacements; recompute n
    n = source.length;
    const ctxMatch = (expr) => {
      // support key='value' with mode/kind
      const m = expr.match(/\b(mode|kind)\s*=\s*'(ar|vr|manual|metaspatial)'/);
      if (!m) return false;
      const [, key, val] = m;
      return String(ctx[key]) === val;
    };
    let out = '';
    i = 0;
    const stack = []; // frames: { include:boolean, parent:boolean, cond:boolean, hasElse:boolean }
    const curInclude = () =>
      stack.length ? stack[stack.length - 1].include : true;
    inS = inD = inB = inLC = inBC = false;
    esc = false;
    while (i < n) {
      const ch2 = source[i];
      const pair = source.slice(i, i + 2);
      if (inLC) {
        if (ch2 === '\n') inLC = false;
        if (curInclude()) out += ch2;
        i++;
        continue;
      }
      if (inBC) {
        if (pair === '*/') {
          inBC = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      // handle quotes first so we never parse comments inside strings/templates
      if (ch2 === "'" && !inD && !inB) {
        inS = !inS;
        if (curInclude()) out += ch2;
        i++;
        continue;
      }
      if (ch2 === '"' && !inS && !inB) {
        inD = !inD;
        if (curInclude()) out += ch2;
        i++;
        continue;
      }
      if (ch2 === '`' && !inS && !inD) {
        inB = !inB;
        if (curInclude()) out += ch2;
        i++;
        continue;
      }
      if (!inS && !inD && !inB && pair === '/*') {
        const end = source.indexOf('*/', i + 2);
        const body = end !== -1 ? source.slice(i + 2, end).trim() : '';
        if (body.startsWith('@template:')) {
          const cmd = body.slice('@template:'.length).trim();
          if (cmd.startsWith('if')) {
            const expr = cmd.slice(2).trim();
            const parent = curInclude();
            const cond = ctxMatch(expr);
            stack.push({
              include: parent && cond,
              parent,
              cond,
              hasElse: false,
            });
          } else if (cmd === 'else') {
            if (stack.length) {
              const f = stack[stack.length - 1];
              f.include = f.parent && !f.cond;
              f.hasElse = true;
            }
          } else if (cmd === 'end') {
            stack.pop();
          }
          i = end + 2; // drop directive comment
          continue;
        } else {
          // ordinary block comment
          inBC = true;
          i += 2;
          continue;
        }
      }
      if (!inS && !inD && !inB && pair === '//') {
        inLC = true;
        if (curInclude()) out += pair;
        i += 2;
        continue;
      }
      if (curInclude()) out += ch2;
      i++;
    }
    // Cleanup trivial comma artifacts from directive pruning
    out = out
      .replace(/,\s*,/g, ', ') // double commas
      .replace(/,(\s*\})/g, '$1') // drop trailing comma before }
      .replace(/(\{\s*),/g, '$1') // drop comma right after {
      .replace(/^\s*,\s*$/gm, '') // lines that are just commas
      // Guard against accidental 'undefined' artifacts at EOF
      .replace(/\n?(?:undefined)+\s*$/m, '');
    return out;
  }

  for (const rel of inlineFiles) {
    const abs = path.join(starterDir, rel);
    let content = await fsp.readFile(abs, 'utf8');
    const relPath = rel.replaceAll('\\', '/');
    const ctx = {
      mode: id.startsWith('ar-') ? 'ar' : 'vr',
      kind: id.includes('-metaspatial-') ? 'metaspatial' : 'manual',
    };
    if (/\.(mjs|cjs|js|jsx|ts|tsx)$/.test(relPath)) {
      content = transformTemplate(content, ctx);
    }
    files.push({ path: relPath, contents: content });
    const ext = path.extname(relPath).toLowerCase();
    if (ext === '.json') {
      try {
        const obj = JSON.parse(content);
        if (relPath === 'package.json') {
          // Promote app name and @iwsdk/* versions to Chef variables (emit as lines for safe quoting)
          obj.name = '{{ @appName }}';
          const maybeProcessDeps = (deps) => {
            if (!deps) return;
            for (const [k, v] of Object.entries(deps)) {
              if (k.startsWith('@iwsdk/')) {
                const varName =
                  '@' + k.replace(/^@/, '').replace(/[\/\-]/g, '_');
                edits[varName] = VERSION; // use VERSION instead of package.json value
                deps[k] = '{{ ' + varName + ' }}'; // placeholder string; JSON.stringify will add quotes
              }
            }
          };
          maybeProcessDeps(obj.dependencies);
          maybeProcessDeps(obj.devDependencies);
          const jsonText = JSON.stringify(obj, null, 2);
          edits[relPath] = { lines: jsonText.split(/\r?\n/) };
        } else {
          const jsonText = JSON.stringify(obj, null, 2);
          edits[relPath] = { lines: jsonText.split(/\r?\n/) };
        }
      } catch {
        const lines = content.split(/\r?\n/);
        edits[relPath] = { lines };
      }
    } else {
      const lines = content.split(/\r?\n/);
      if (lines.length > 1) {
        edits[relPath] = { lines };
      } else {
        edits[relPath] = { set: content };
      }
    }
  }

  // Inject Chef feature variables per variant id
  const isAR = id.startsWith('ar-');
  const appFeaturesObj = { enableGrabbing: true, enableLocomotion: !isAR };
  const xrFeaturesObj = { handTracking: true };
  edits['@appFeaturesStr'] = toJsObjectLiteral(appFeaturesObj);
  edits['@xrFeaturesStr'] = toJsObjectLiteral(xrFeaturesObj);
  edits['@appName'] = title;

  const recipe = { name: id, version: casVersion, edits };
  return { id, title, recipe };
}

async function main() {
  const base = process.env.IWSDK_ASSET_BASE || 'https://iwsdk-assets.pages.dev';
  // Determine SDK version (kept in recipe for traceability only)
  let pkgVersion = '0.0.0';
  try {
    const pkg = JSON.parse(
      await fsp.readFile(path.join(PKG_ROOT, 'package.json'), 'utf8'),
    );
    pkgVersion = pkg.version || pkgVersion;
  } catch {}

  // Clean outputs
  // Clean dist/ completely and recreate recipes + assets dirs
  await rimraf(DIST_ROOT);
  await ensureDir(path.join(DIST_ROOT, 'recipes'));
  const casRoot = DIST_ASSETS; // canonical store lives directly under dist/assets
  await ensureDir(casRoot);

  // Ensure starters exist (generated locally inside this package by starter:sync).
  const entries = await fsp
    .readdir(VARIANTS_SRC, { withFileTypes: true })
    .catch(() => []);
  const starters = entries
    .filter((e) => e.isDirectory() && VARIANT_RE.test(e.name))
    .map((e) => path.join(VARIANTS_SRC, e.name));
  if (starters.length === 0)
    throw new Error('No starter variants found. Run starter:sync first.');

  const index = [];
  const casUrlBase = joinUrl(base, 'assets') + '/';
  for (const starterDir of starters) {
    const { id, title, recipe } = await generateRecipeForStarter(
      starterDir,
      base,
      casUrlBase,
      casRoot,
      pkgVersion,
    );
    const fileName = `${recipe.name}.recipe.json`;
    await fsp.writeFile(
      path.join(DIST_ROOT, 'recipes', fileName),
      JSON.stringify(recipe, null, 2),
    );
    index.push({ id, name: title, recipe: fileName });
    console.log(`• Built assets and recipe for ${id}`);
  }
  await fsp.writeFile(
    path.join(DIST_ROOT, 'recipes', 'index.json'),
    JSON.stringify(index, null, 2),
  );
  // Cleanup variants-src after successful build to keep package clean
  try {
    await rimraf(VARIANTS_SRC);
  } catch {}
  console.log('\nDone. Built dist/:');
  console.log(' - Recipes at dist/recipes');
  console.log(' - Canonical assets at dist/assets/<hash>-<name>');
  console.log(`CDN Base: ${base}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
