#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Post-process Typedoc Markdown to flatten the extra `src/` layer per package.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const ts = require('typescript');

const apiRoot = path.resolve(__dirname, '..', 'docs', 'api');

async function moveContentsUp(dir) {
  const srcDir = path.join(dir, 'src');
  const exists = fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory();
  if (!exists) return;
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(srcDir, e.name);
    const to = path.join(dir, e.name);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.rename(from, to).catch(async () => {
      // fallback to copy for cross-device moves
      const { default: fsExtra } = await import('fs-extra');
      await fsExtra.copy(from, to, { overwrite: true });
      await fsExtra.remove(from);
    });
  }
  // remove now-empty src dir
  await fsp.rm(srcDir, { recursive: true, force: true });
}

function rewriteSidebarLinks(obj) {
  if (Array.isArray(obj)) return obj.map(rewriteSidebarLinks);
  if (obj && typeof obj === 'object') {
    if (typeof obj.link === 'string') {
      obj.link = obj.link
        .replace(/\/src\//g, '/')
        .replace(/\/src$/g, '/')
        .replace(/\.md$/g, '/');
    }
    if (typeof obj.text === 'string' && obj.text === 'src') {
      obj.text = 'Overview';
    }
    if (Array.isArray(obj.items))
      obj.items = obj.items.map(rewriteSidebarLinks);
  }
  return obj;
}

function flattenOverview(list) {
  if (!Array.isArray(list)) return list;
  return list.map((pkg) => {
    if (pkg && pkg.items && pkg.items.length) {
      const first = pkg.items[0];
      if (first && first.text === 'Overview' && Array.isArray(first.items)) {
        // Use the overview link for the package root if missing
        if (!pkg.link && first.link) pkg.link = first.link;
        // Hoist children of Overview into package level
        pkg.items = [...first.items, ...pkg.items.slice(1)];
      }
    }
    return pkg;
  });
}

async function fixMainIndexFile() {
  const mainIndexPath = path.join(apiRoot, 'index.md');
  if (!fs.existsSync(mainIndexPath)) return;
  
  const content = await fsp.readFile(mainIndexPath, 'utf8');
  const updated = content
    .replace(/\[([^\]]+)\/src\]\(([^)]+)\/src\/index\.md\)/g, '[$1]($2/index.md)')
    .replace(/\/src\//g, '/')
    .replace(/\/src\]/g, ']');
  
  if (updated !== content) {
    await fsp.writeFile(mainIndexPath, updated);
  }
}

async function main() {
  const entries = await fsp.readdir(apiRoot, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory());
  for (const d of packageDirs) {
    await moveContentsUp(path.join(apiRoot, d.name));
  }

  const sidebarPath = path.join(apiRoot, 'typedoc-sidebar.json');
  if (fs.existsSync(sidebarPath)) {
    const raw = await fsp.readFile(sidebarPath, 'utf8');
    const json = JSON.parse(raw);
    const updated = flattenOverview(rewriteSidebarLinks(json));
    await fsp.writeFile(sidebarPath, JSON.stringify(updated, null, 0));
  }

  // Fix main API index file to remove src/ references
  await fixMainIndexFile();

  // Custom: rewrite all System class pages into minimal, consistent schema-focused pages
  await minimizeAllSystemPages();

  // Custom: rewrite all Component variable pages (createComponent) into schema-focused pages
  await rewriteAllComponentPages();
}

main().catch((e) => {
  console.error('postprocess-typedoc failed:', e);
  process.exit(1);
});

// -------------------- helpers for UI System pages --------------------

function extractSchema(obj) {
  if (!obj || !ts.isObjectLiteralExpression(obj)) return [];
  const fields = [];
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const name = prop.name.text;
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
    let typeStr = '';
    let defStr = undefined;
    for (const p of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
      const key = p.name.text;
      const val = p.initializer;
      if (!val) continue;
      const toStr = (expr) => {
        if (!expr) return '';
        if (
          ts.isStringLiteral(expr) ||
          ts.isNoSubstitutionTemplateLiteral(expr)
        )
          return `'${expr.text}'`;
        if (ts.isNumericLiteral(expr)) return expr.text;
        if (expr.kind === ts.SyntaxKind.TrueKeyword) return 'true';
        if (expr.kind === ts.SyntaxKind.FalseKeyword) return 'false';
        if (ts.isIdentifier(expr)) return expr.text;
        if (ts.isPropertyAccessExpression(expr))
          return `${toStr(expr.expression)}.${expr.name.text}`;
        if (ts.isArrayLiteralExpression(expr))
          return `[${expr.elements.map(toStr).join(', ')}]`;
        return '';
      };
      if (key === 'type') typeStr = toStr(val);
      if (key === 'default') defStr = toStr(val);
    }
    fields.push({ name, type: typeStr, default: defStr });
  }
  return fields;
}

function extractRequiredComponents(queriesObj) {
  const req = [];
  if (!queriesObj || !ts.isObjectLiteralExpression(queriesObj)) return req;
  for (const prop of queriesObj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const val = prop.initializer;
    if (!ts.isObjectLiteralExpression(val)) continue;
    for (const p of val.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
      if (p.name.text !== 'required') continue;
      if (ts.isArrayLiteralExpression(p.initializer)) {
        for (const el of p.initializer.elements) {
          if (ts.isIdentifier(el)) req.push(el.text);
          else if (ts.isPropertyAccessExpression(el)) req.push(el.name.text);
        }
      }
    }
  }
  return Array.from(new Set(req)).sort();
}

function mapTypeName(t) {
  return (t || '')
    .replace(/Types\.String\b/g, 'string')
    .replace(
      /Types\.(Float32|Float64|Int8|Int16|Int32|Uint8|Uint16|Uint32)\b/g,
      'number',
    )
    .replace(/Types\.Boolean\b/g, 'boolean')
    .replace(/Types\.Vec3\b/g, '[number, number, number]')
    .replace(/Types\.Object\b/g, 'object')
    .replace(/Types\.Enum\b/g, 'enum')
    .replace(/^Types\./, '');
}

function getJsDocSummary(node) {
  const blocks = ts.getJSDocCommentsAndTags(node) || [];
  for (const b of blocks) {
    if (b.kind === ts.SyntaxKind.JSDoc && b.comment) {
      if (typeof b.comment === 'string')
        return b.comment.split(/\n\n+/)[0].trim();
      if (Array.isArray(b.comment))
        return b.comment
          .map((p) => p.text || '')
          .join('')
          .split(/\n\n+/)[0]
          .trim();
    }
  }
  return '';
}

function getJsDocRemarks(node) {
  const tags = ts.getJSDocTags(node) || [];
  for (const t of tags) {
    if (t.tagName?.text === 'remarks') {
      const c = t.comment;
      if (typeof c === 'string') return c.trim();
      if (Array.isArray(c))
        return c
          .map((p) => p.text || '')
          .join('')
          .trim();
    }
  }
  return '';
}

function getLeadingJsDocForProperty(sf, node) {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.pos) || [];
  if (!ranges.length) return '';
  // Find the nearest JSDoc-style block
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const c = text.slice(r.pos, r.end);
    if (c.startsWith('/**')) {
      // strip /** */ and leading *
      return c
        .replace(/^\/\*\*[\r\n]?/, '')
        .replace(/\*\/$/, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\* ?/, ''))
        .join('\n')
        .trim();
    }
  }
  return '';
}

async function minimizeAllSystemPages() {
  // Look for all classes across packages
  const packages = await fsp.readdir(path.join(apiRoot), {
    withFileTypes: true,
  });
  const classDirs = [];
  for (const p of packages) {
    if (p.isDirectory()) {
      const dir = path.join(apiRoot, p.name, 'classes');
      if (fs.existsSync(dir)) classDirs.push(dir);
    }
  }

  for (const classesDir of classDirs) {
    const files = (await fsp.readdir(classesDir)).filter((f) =>
      f.endsWith('.md'),
    );
    for (const file of files) {
      const mdPath = path.join(classesDir, file);
      const md = await fsp.readFile(mdPath, 'utf8');

      // Source path and original "Defined in" line from the first occurrence
      const m = md.match(/Defined in: (.+?):(\d+)/);
      const defLine = m ? `Defined in: ${m[1]}:${m[2]}` : null;
      let srcPath = m ? m[1] : null;
      if (!srcPath) continue;
      if (!path.isAbsolute(srcPath))
        srcPath = path.resolve(__dirname, '..', srcPath);
      if (!fs.existsSync(srcPath)) continue;

      const program = ts.createProgram([srcPath], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      });
      const sf = program.getSourceFile(srcPath);
      if (!sf) continue;

      let classNode = null;
      let isEcsSystem = false;
      sf.forEachChild((node) => {
        if (ts.isClassDeclaration(node) && node.name) {
          const className = file.replace(/\.md$/, '');
          if (node.name.text === className) {
            classNode = node;
            const ext = node.heritageClauses?.find(
              (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
            );
            if (ext && ext.types.length) {
              const t = ext.types[0].expression;
              if (
                ts.isCallExpression(t) &&
                ts.isIdentifier(t.expression) &&
                t.expression.text === 'createSystem'
              ) {
                isEcsSystem = true;
              }
            }
          }
        }
      });
      if (!classNode || !isEcsSystem) continue;

      // Extract queries + config from createSystem call in extends
      let dependsOn = [];
      let configSchema = [];
      let rawSchemaTypes = new Map();
      const ext = classNode.heritageClauses.find(
        (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
      );
      const call = ext.types[0].expression;
      const [queriesArg, configArg] = call.arguments || [];
      dependsOn = extractRequiredComponents(queriesArg);
      const extracted = extractSchema(configArg).filter(
        (f) => !String(f.name || '').startsWith('_'),
      );
      configSchema = extracted.map((f) => ({
        name: f.name,
        type: mapTypeName(f.type),
        default: f.default,
      }));
      extracted.forEach((f) => rawSchemaTypes.set(f.name, f.type));

      // Get JSDoc: try TypeScript API first, then fallback to leading comment block parsing
      let summary = getJsDocSummary(classNode);
      let remarks = getJsDocRemarks(classNode);
      if (!summary || !remarks) {
        const text = sf.getFullText();
        const ranges = ts.getLeadingCommentRanges(text, classNode.pos) || [];
        for (let i = ranges.length - 1; i >= 0; i--) {
          const r = ranges[i];
          const c = text.slice(r.pos, r.end);
          if (c.startsWith('/**')) {
            const body = c
              .replace(/^\/\*\*[\r\n]?/, '')
              .replace(/\*\/$/, '')
              .split('\n')
              .map((l) => l.replace(/^\s*\* ?/, ''))
              .join('\n');
            if (!summary) summary = body.split(/\n\n|\n@/)[0].trim();
            if (!remarks) {
              const rm = body.split(/\n@remarks\b/i)[1];
              if (rm) remarks = rm.split(/\n@/)[0].trim();
            }
            break;
          }
        }
      }

      // Get per-option descriptions from JSDoc on each property assignment
      const propDocs = new Map();
      if (configArg && ts.isObjectLiteralExpression(configArg)) {
        for (const p of configArg.properties) {
          if (
            ts.isPropertyAssignment(p) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
          ) {
            const key = ts.isIdentifier(p.name) ? p.name.text : p.name.text;
            const doc = getLeadingJsDocForProperty(sf, p);
            if (doc) propDocs.set(key, doc);
          }
        }
      }

      // Build content
      const className = file.replace(/\.md$/, '');
      const lines = [];
      // Title with explicit "System:" prefix
      lines.push(`# System: ${className}`, '');
      if (defLine) lines.push(defLine, '');

      // Intro paragraph
      if (summary) {
        const sTrim = summary.trim().replace(/\s+/g, ' ');
        const lc = sTrim.charAt(0).toLowerCase() + sTrim.slice(1);
        const isArticle = /^(a|an|the|this)\b/i.test(sTrim);
        const intro = isArticle
          ? `${className} is ${lc}`
          : `${className} is a system that ${lc}`;
        lines.push(intro.endsWith('.') ? intro : intro + '.', '');
      }

      // Remarks as bullet list if present
      if (remarks) {
        const raw = remarks.split('\n');
        const bullets = [];
        let cur = '';
        for (const line of raw) {
          const t = line.trim();
          if (!t) continue;
          if (t.startsWith('-')) {
            if (cur) bullets.push(cur);
            cur = t;
          } else {
            cur = cur ? cur + ' ' + t : '- ' + t;
          }
        }
        if (cur) bullets.push(cur);
        if (bullets.length) lines.push(...bullets, '');
      }

      // Dependencies
      lines.push('## Component Dependencies', '');
      lines.push(
        `${className} depends on the following components used in its queries:`,
        '',
      );
      if (dependsOn.length)
        dependsOn.forEach((c) => lines.push(`- [${c}](../variables/${c}.md)`));
      else lines.push('- (none)');
      lines.push('');

      // Schema (only if options exist)
      if (configSchema.length) {
        lines.push('## Schema', '');
        lines.push(
          `${className} can be configured with the following options:`,
          '',
        );
        for (const opt of configSchema) {
          const rawType = rawSchemaTypes.get(opt.name) || '';
          const desc = propDocs.get(opt.name) || '';
          lines.push(`### \`${opt.name}: ${opt.type}\``, '');
          if (desc) lines.push(desc, '');
          if (opt.default !== undefined)
            lines.push(`- Default value: \`${opt.default}\``);
          if (rawType) lines.push(`- Schema type: \`${rawType}\``);
          // Config signal type
          lines.push(
            `- Config type: \`this.config.${opt.name}: Signal<${opt.type}>\``,
            '',
          );
        }
      }

      await fsp.writeFile(mdPath, lines.join('\n'));
    }
  }
}

function getVarJsDocSummary(node) {
  // Prefer the VariableStatement for const exports, since TS often attaches JSDoc there.
  let docNode = node;
  if (ts.isVariableDeclaration(node)) {
    const vs = node.parent && node.parent.parent;
    if (vs && ts.isVariableStatement(vs)) docNode = vs;
  }
  const blocks = ts.getJSDocCommentsAndTags(docNode) || [];
  for (const b of blocks) {
    if (b.kind === ts.SyntaxKind.JSDoc && b.comment) {
      if (typeof b.comment === 'string')
        return b.comment.split(/\n\n+/)[0].trim();
      if (Array.isArray(b.comment))
        return b.comment
          .map((p) => p.text || '')
          .join('')
          .split(/\n\n+/)[0]
          .trim();
    }
  }
  return '';
}

function getInlineOrLeadingCommentForProperty(sf, prop) {
  const text = sf.getFullText();
  // Prefer leading JSDoc
  const lead = getLeadingJsDocForProperty(sf, prop);
  if (lead) return lead;
  // Try trailing line comment after the property
  const lineStart = text.lastIndexOf('\n', prop.end) + 1;
  const lineEnd = text.indexOf('\n', prop.end);
  const end = lineEnd === -1 ? text.length : lineEnd;
  const line = text.slice(lineStart, end);
  const idx = line.indexOf('//');
  if (idx !== -1) return line.slice(idx + 2).trim();
  // Try block comment trailing on the same line
  const idxBlock = line.indexOf('/*');
  if (idxBlock !== -1) {
    const block = line
      .slice(idxBlock)
      .replace(/^\/\*+|\*+\/$/g, '')
      .trim();
    return block;
  }
  return '';
}

async function rewriteAllComponentPages() {
  const packages = await fsp.readdir(path.join(apiRoot), {
    withFileTypes: true,
  });
  const varDirs = [];
  for (const p of packages) {
    if (p.isDirectory()) {
      const dir = path.join(apiRoot, p.name, 'variables');
      if (fs.existsSync(dir)) varDirs.push(dir);
    }
  }
  for (const varsDir of varDirs) {
    const files = (await fsp.readdir(varsDir)).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const mdPath = path.join(varsDir, file);
      const md = await fsp.readFile(mdPath, 'utf8');

      // Parse source location
      const m = md.match(/Defined in: (.+?):(\d+)/);
      if (!m) continue;
      const defLine = `Defined in: ${m[1]}:${m[2]}`;
      let srcPath = m[1];
      if (!path.isAbsolute(srcPath))
        srcPath = path.resolve(__dirname, '..', srcPath);
      if (!fs.existsSync(srcPath)) continue;

      // Find matching variable in source
      const varName = file.replace(/\.md$/, '');
      const program = ts.createProgram([srcPath], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      });
      const sf = program.getSourceFile(srcPath);
      if (!sf) continue;
      let target = null;
      sf.forEachChild((node) => {
        if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach((decl) => {
            if (
              ts.isIdentifier(decl.name) &&
              decl.name.text === varName &&
              decl.initializer &&
              ts.isCallExpression(decl.initializer)
            ) {
              if (
                ts.isIdentifier(decl.initializer.expression) &&
                decl.initializer.expression.text === 'createComponent'
              ) {
                target = decl;
              }
            }
          });
        }
      });
      if (!target) continue; // not a component

      // Extract fields from createComponent args
      const call = target.initializer;
      const [idArg, schemaArg, descArg] = call.arguments;
      const compId =
        idArg &&
        (ts.isStringLiteral(idArg) || ts.isNoSubstitutionTemplateLiteral(idArg))
          ? idArg.text
          : varName;
      const compDesc =
        descArg &&
        (ts.isStringLiteral(descArg) ||
          ts.isNoSubstitutionTemplateLiteral(descArg))
          ? descArg.text
          : '';
      const schema = extractSchema(schemaArg).filter(
        (f) => !String(f.name || '').startsWith('_'),
      ); // returns {name,type,default}

      // JSDoc summary for the variable
      let summary = getVarJsDocSummary(target) || '';

      // Per-field descriptions
      const fieldDocs = new Map();
      if (schemaArg && ts.isObjectLiteralExpression(schemaArg)) {
        for (const p of schemaArg.properties) {
          if (
            ts.isPropertyAssignment(p) &&
            (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
          ) {
            const key = ts.isIdentifier(p.name) ? p.name.text : p.name.text;
            const doc = getInlineOrLeadingCommentForProperty(sf, p);
            if (doc) fieldDocs.set(key, doc);
          }
        }
      }

      // Build content
      const lines = [];
      lines.push(`# Component: ${varName}`, '');
      lines.push(defLine, '');
      if (!summary && compDesc) summary = compDesc;
      if (summary) {
        const sTrim = summary.trim().replace(/\s+/g, ' ');
        const lc = sTrim.charAt(0).toLowerCase() + sTrim.slice(1);
        const isArticle = /^(a|an|the|this)\b/i.test(sTrim);
        const startsWithComponent = /^((a|an|the)\s+)?component\b/i.test(sTrim);
        let intro;
        if (startsWithComponent) intro = `${varName} is ${lc}`;
        else if (isArticle) intro = `${varName} is ${lc}`;
        else intro = `${varName} is a component that ${lc}`;
        lines.push(intro.endsWith('.') ? intro : intro + '.', '');
      }
      lines.push(
        `- Component ID: \`${compId}\``,
        `- Component Description: ${compDesc || summary || ''}`,
        '',
      );

      if (schema.length) {
        lines.push('## Schema', '');
        lines.push(
          `${varName} component can be configured with the following options:`,
          '',
        );
        for (const f of schema) {
          const mapped = mapTypeName(f.type);
          const rawType = f.type;
          const doc = fieldDocs.get(f.name) || '';
          lines.push(`### \`${f.name}: ${mapped}\``, '');
          if (doc) lines.push(doc, '');
          if (f.default !== undefined)
            lines.push(`- Default value: \`${f.default}\``);
          if (rawType) lines.push(`- Schema type: \`${rawType}\``);
          lines.push('');
        }
      }

      await fsp.writeFile(mdPath, lines.join('\n'));
    }
  }
}
