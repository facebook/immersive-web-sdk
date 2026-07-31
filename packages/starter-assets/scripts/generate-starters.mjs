#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Generate 6 native-scene starter variants (TS + JS) from the starter template.
 * Outputs to variants-src/ and formats files with Prettier.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { transform as sucraseTransform } from 'sucrase';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PKG_ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(PKG_ROOT, 'variants-src');
const STARTER_DIR = path.join(PKG_ROOT, 'starter-template');

const VARIANTS = [
  {
    key: 'vr-manual',
    outName: 'starter-vr-manual-ts',
  },
  {
    key: 'ar-manual',
    outName: 'starter-ar-manual-ts',
  },
  {
    key: 'browser-manual',
    outName: 'starter-browser-manual-ts',
  },
];

async function emptyDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
    const entries = await fsp.readdir(dir);
    await Promise.all(
      entries.map((n) =>
        fsp.rm(path.join(dir, n), { recursive: true, force: true }),
      ),
    );
  } catch {}
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyDir(src, dst, filterFn = null) {
  const st = await fsp.stat(src);
  if (!st.isDirectory()) throw new Error(`copyDir: ${src} is not a directory`);
  await ensureDir(dst);
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    const rel = path.relative(src, s);
    if (filterFn && !filterFn(s, rel, ent)) continue;
    if (ent.isDirectory()) await copyDir(s, d, filterFn);
    else if (ent.isFile()) {
      await ensureDir(path.dirname(d));
      await fsp.copyFile(s, d);
    }
  }
}

async function removeIfExists(p) {
  await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
}

async function writeJSON(p, obj) {
  await ensureDir(path.dirname(p));
  await fsp.writeFile(p, JSON.stringify(obj, null, 2));
}

async function readJSON(p) {
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}

async function cleanTsconfig(destRoot) {
  const p = path.join(destRoot, 'tsconfig.json');
  try {
    const ts = await readJSON(p);
    if (ts.compilerOptions) {
      delete ts.compilerOptions.baseUrl;
      delete ts.compilerOptions.paths;
    }
    await writeJSON(p, ts);
  } catch {}
}

function readTemplate() {
  return fs.readFileSync(
    path.join(STARTER_DIR, 'src/index.template.ts'),
    'utf8',
  );
}

function readAssetsTemplate() {
  return fs.readFileSync(
    path.join(STARTER_DIR, 'src/assets.template.ts'),
    'utf8',
  );
}

function readComponentsTemplate() {
  return fs.readFileSync(
    path.join(STARTER_DIR, 'src/components.template.ts'),
    'utf8',
  );
}

function applyTemplateBlocks(source, { mode }) {
  const directive =
    /(?:\/\*|<!--)\s*@template:(if\s+mode='(ar|vr|browser)'|else|end)\s*(?:\*\/|-->)/g;
  const stack = [];
  const included = () =>
    stack.length === 0 ? true : stack[stack.length - 1].include;
  let result = '';
  let cursor = 0;
  let match;

  while ((match = directive.exec(source)) !== null) {
    if (included()) {
      result += source.slice(cursor, match.index);
    }

    const command = match[1];
    if (command.startsWith('if')) {
      const parent = included();
      const condition = match[2] === mode;
      stack.push({ parent, condition, include: parent && condition });
    } else if (command === 'else') {
      const frame = stack[stack.length - 1];
      if (!frame) throw new Error('Unexpected @template:else');
      frame.include = frame.parent && !frame.condition;
    } else {
      if (!stack.pop()) throw new Error('Unexpected @template:end');
    }
    cursor = directive.lastIndex;
  }

  if (stack.length > 0) throw new Error('Unclosed @template:if block');
  result += source.slice(cursor);
  return result;
}

function composeIndexTs({ mode }) {
  const isAR = mode === 'ar';
  let t = readTemplate();

  if (mode !== 'browser') {
    t = t.replace(
      /\/\*\s*@session-mode\s*\*\/\s*SessionMode\.[A-Za-z]+/,
      `SessionMode.Immersive${isAR ? 'AR' : 'VR'}`,
    );
  }

  // Clean up excess blank lines
  t = applyTemplateBlocks(t, { mode });
  t = t.replace(/\n{3,}/g, '\n\n');
  return t;
}

async function adjustPackageJson(destRoot, name, isJS) {
  const p = path.join(destRoot, 'package.json');
  const pkg = await readJSON(p);
  pkg.name = `@iwsdk/${name}`;
  if (pkg.scripts) {
    if (isJS) delete pkg.scripts.typecheck;
  }
  if (isJS && pkg.devDependencies) delete pkg.devDependencies.typescript;
  await writeJSON(p, pkg);
}

async function removeLocksAndNodeModules(destRoot) {
  await removeIfExists(path.join(destRoot, 'node_modules'));
  await removeIfExists(path.join(destRoot, 'package-lock.json'));
  await removeIfExists(path.join(destRoot, 'pnpm-lock.yaml'));
  await removeIfExists(path.join(destRoot, 'yarn.lock'));
}

function convertExt(file) {
  if (file.endsWith('.tsx')) return file.slice(0, -4) + '.jsx';
  if (file.endsWith('.ts')) return file.slice(0, -3) + '.js';
  return file;
}

async function transpileDir(srcRoot, outRoot) {
  await emptyDir(outRoot);
  async function walk(cur, rel = '') {
    const st = await fsp.lstat(cur);
    if (st.isDirectory()) {
      if (/^node_modules$|^dist$/.test(path.basename(cur))) return;
      const ents = await fsp.readdir(cur);
      for (const e of ents) await walk(path.join(cur, e), path.join(rel, e));
      return;
    }
    const base = path.basename(cur);
    if (base === 'tsconfig.json') return;
    const dst = path.join(outRoot, rel);
    const isTs = /\.(ts|tsx)$/.test(cur);
    const isHtml = /\.html$/.test(cur);
    const outPath = isTs
      ? path.join(path.dirname(dst), convertExt(path.basename(dst)))
      : dst;
    await ensureDir(path.dirname(outPath));
    if (rel === 'package.json') {
      const pkg = JSON.parse(await fsp.readFile(cur, 'utf8'));
      delete pkg.scripts?.typecheck;
      if (pkg.devDependencies) delete pkg.devDependencies.typescript;
      await fsp.writeFile(outPath, JSON.stringify(pkg, null, 2));
      return;
    }
    const buf = await fsp.readFile(cur, 'utf8');
    if (isTs) {
      const result = sucraseTransform(buf, { transforms: ['typescript'] });
      const code =
        base === 'vite.config.ts'
          ? result.code
              .replace(
                "assetManifest: './src/assets.ts'",
                "assetManifest: './src/assets.js'",
              )
              .replace(
                "componentManifest: './src/components.ts'",
                "componentManifest: './src/components.js'",
              )
          : result.code;
      await fsp.writeFile(outPath, code);
    } else if (isHtml) {
      const fixed = buf.replace(
        /(src\s*=\s*["]?[^"']*?)\.(ts|tsx)(["]?)/g,
        (_, p1, _ext, p3) => `${p1}.js${p3}`,
      );
      await fsp.writeFile(outPath, fixed);
    } else {
      await fsp.copyFile(cur, outPath);
    }
  }
  await walk(srcRoot);
}

let prettierModPromise = null;
async function getPrettier() {
  if (!prettierModPromise) prettierModPromise = import('prettier');
  return prettierModPromise;
}

async function formatTree(root) {
  try {
    const prettier = await getPrettier();
    async function walk(dir) {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(p);
        else if (/\.(js|jsx|ts|tsx|json|html|css|md)$/.test(ent.name)) {
          const cfg = await prettier.resolveConfig(p).catch(() => null);
          const code = await fsp.readFile(p, 'utf8');
          const out = await prettier.format(code, {
            ...(cfg || {}),
            filepath: p,
          });
          await fsp.writeFile(p, out);
        }
      }
    }
    await walk(root);
  } catch {}
}

function readViteTemplate() {
  return fs.readFileSync(
    path.join(STARTER_DIR, 'vite.config.template.ts'),
    'utf8',
  );
}

function pruneViteTemplate(t, { mode }) {
  const isAR = mode === 'ar';
  const removeBlock = (s, a, b) =>
    s.replace(new RegExp(`${a}[\\s\\S]*?${b}`, 'g'), '');
  const removeLinesWith = (s, tag) =>
    s.replace(new RegExp(`^.*${tag}.*$\\n?`, 'gm'), '');
  if (!isAR) t = removeBlock(t, '// @iwer-sem-ar-start', '// @iwer-sem-ar-end');
  t = removeLinesWith(t, '@iwer-sem-ar');
  return applyTemplateBlocks(t, { mode });
}

async function generateTsVariant(v) {
  const mode = v.key.split('-')[0];
  const dest = path.join(OUT_ROOT, v.outName);
  await emptyDir(dest);
  await copyDir(STARTER_DIR, dest, (full, _rel, ent) => {
    if (
      ent.isDirectory() &&
      (ent.name === 'node_modules' || ent.name === 'dist')
    )
      return false;
    return true;
  });
  const viteComposed = pruneViteTemplate(readViteTemplate(), {
    mode,
  });
  const cfgDst = path.join(dest, 'vite.config.ts');
  await fsp.writeFile(cfgDst, viteComposed);
  const composed = composeIndexTs({
    mode,
  });
  const indexDst = path.join(dest, 'src', 'index.ts');
  await ensureDir(path.dirname(indexDst));
  await fsp.writeFile(indexDst, composed);
  await fsp.writeFile(
    path.join(dest, 'src', 'assets.ts'),
    applyTemplateBlocks(readAssetsTemplate(), { mode }),
  );
  await fsp.writeFile(
    path.join(dest, 'src', 'components.ts'),
    applyTemplateBlocks(readComponentsTemplate(), { mode }),
  );
  // Remove original variant-specific index files and template
  const dir = path.join(dest, 'src');
  const entries = await fsp.readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((n) => /^index-(vr|ar|browser)-manual\.ts$/.test(n))
      .map((n) => removeIfExists(path.join(dir, n))),
  );
  await removeIfExists(path.join(dest, 'src', 'index.template.ts'));
  await removeIfExists(path.join(dest, 'src', 'assets.template.ts'));
  await removeIfExists(path.join(dest, 'src', 'components.template.ts'));
  const sceneDir = path.join(dest, 'public', 'scenes');
  for (const sceneMode of ['ar', 'browser', 'vr']) {
    if (sceneMode !== mode) {
      await removeIfExists(
        path.join(sceneDir, `${sceneMode}.iwsdk.scene.json`),
      );
    }
  }
  if (mode === 'browser') {
    await removeIfExists(path.join(dest, 'src', 'panel.ts'));
    await removeIfExists(path.join(dest, 'src', 'mouselook.ts'));
    await removeIfExists(path.join(dest, 'src', 'robot.ts'));
    await removeIfExists(path.join(dest, 'src', 'robot-component.ts'));
    await removeIfExists(path.join(dest, 'public', 'ui', 'welcome.uikitml'));
    await removeIfExists(path.join(dest, 'public', 'audio'));
    await removeIfExists(path.join(dest, 'public', 'textures'));
  } else {
    await removeIfExists(path.join(dest, 'src', 'mouselook.ts'));
  }
  if (mode !== 'browser') {
    const welcomePath = path.join(dest, 'public', 'ui', 'welcome.uikitml');
    const welcomeTemplate = await fsp.readFile(welcomePath, 'utf8');
    await fsp.writeFile(
      welcomePath,
      applyTemplateBlocks(welcomeTemplate, { mode })
        .replace(/^[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n'),
    );
  }
  await cleanTsconfig(dest);
  try {
    const readmePath = path.join(dest, 'README.md');
    const rd = await fsp.readFile(readmePath, 'utf8');
    const entryNote = `- Entry point is \`src/index.ts\`.`;
    const rd2 = rd.replace(/- Entry point is[\s\S]*?\n/, entryNote + '\n');
    await fsp.writeFile(readmePath, rd2);
  } catch {}
  await adjustPackageJson(dest, v.outName, false);
  await removeLocksAndNodeModules(dest);
  await formatTree(dest);
  return dest;
}

async function generateJsVariant(tsDir, tsName) {
  const jsName = tsName.replace(/-ts$/, '-js');
  const out = path.join(OUT_ROOT, jsName);
  await transpileDir(tsDir, out);
  await removeIfExists(path.join(out, 'src', 'index.template.js'));
  await adjustPackageJson(out, jsName, true);
  await removeLocksAndNodeModules(out);
  await formatTree(out);
  return out;
}

async function main() {
  console.log(
    '🧩 Generating native scene starter variants (assets package)...',
  );
  if (!fs.existsSync(STARTER_DIR)) {
    console.error(
      'starter-template/ not found inside @iwsdk/starter-assets package',
    );
    process.exit(1);
  }
  await ensureDir(OUT_ROOT);
  for (const v of VARIANTS) {
    const tsDir = await generateTsVariant(v);
    await generateJsVariant(tsDir, v.outName);
    console.log(`  • ${v.outName} and ${v.outName.replace(/-ts$/, '-js')}`);
  }
  console.log('✅ Done generating 6 variants.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
