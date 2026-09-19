/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parse,
  resolveKitComponentSets,
  type UIKitMLAst,
  type UIKitMLNode,
} from '@drawcall/uikitml';
import type {
  ProductionBundleOptions,
  UIKitMLBundledFontName,
} from './types.js';

export const BUNDLED_FONT_MODULES: Record<
  UIKitMLBundledFontName,
  { module: string; exportName: string }
> = {
  'crimson-text': {
    module: '@pmndrs/msdfonts/crimson-text',
    exportName: 'crimsonText',
  },
  'fira-code': {
    module: '@pmndrs/msdfonts/fira-code',
    exportName: 'firaCode',
  },
  inconsolata: {
    module: '@pmndrs/msdfonts/inconsolata',
    exportName: 'inconsolata',
  },
  inter: { module: '@pmndrs/msdfonts/inter', exportName: 'inter' },
  lato: { module: '@pmndrs/msdfonts/lato', exportName: 'lato' },
  'libre-baskerville': {
    module: '@pmndrs/msdfonts/libre-baskerville',
    exportName: 'libreBaskerville',
  },
  merriweather: {
    module: '@pmndrs/msdfonts/merriweather',
    exportName: 'merriweather',
  },
  montserrat: {
    module: '@pmndrs/msdfonts/montserrat',
    exportName: 'montserrat',
  },
  nunito: { module: '@pmndrs/msdfonts/nunito', exportName: 'nunito' },
  'open-sans': {
    module: '@pmndrs/msdfonts/open-sans',
    exportName: 'openSans',
  },
  'playfair-display': {
    module: '@pmndrs/msdfonts/playfair-display',
    exportName: 'playfairDisplay',
  },
  poppins: { module: '@pmndrs/msdfonts/poppins', exportName: 'poppins' },
  raleway: { module: '@pmndrs/msdfonts/raleway', exportName: 'raleway' },
  roboto: { module: '@pmndrs/msdfonts/roboto', exportName: 'roboto' },
  'source-code-pro': {
    module: '@pmndrs/msdfonts/source-code-pro',
    exportName: 'sourceCodePro',
  },
  'space-mono': {
    module: '@pmndrs/msdfonts/space-mono',
    exportName: 'spaceMono',
  },
  'work-sans': {
    module: '@pmndrs/msdfonts/work-sans',
    exportName: 'workSans',
  },
};

const FONT_NAMES = new Set<UIKitMLBundledFontName>(
  Object.keys(BUNDLED_FONT_MODULES) as UIKitMLBundledFontName[],
);

function collectFontValue(
  value: unknown,
  result: Set<UIKitMLBundledFontName>,
): void {
  if (
    typeof value === 'string' &&
    FONT_NAMES.has(value as UIKitMLBundledFontName)
  ) {
    result.add(value as UIKitMLBundledFontName);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function collectRecordFonts(
  record: Record<string, unknown>,
  result: Set<UIKitMLBundledFontName>,
): void {
  collectFontValue(record.fontFamily, result);
  for (const value of Object.values(record)) {
    if (isRecord(value)) {
      collectRecordFonts(value, result);
    }
  }
}

function collectNodeFonts(
  node: UIKitMLNode,
  result: Set<UIKitMLBundledFontName>,
): void {
  if (node.kind === 'text') {
    return;
  }
  collectRecordFonts(node.props, result);
  if (node.kind === 'element') {
    for (const child of node.children) {
      collectNodeFonts(child, result);
    }
  }
}

function collectAstFonts(ast: UIKitMLAst): ReadonlySet<UIKitMLBundledFontName> {
  const result = new Set<UIKitMLBundledFontName>();
  collectNodeFonts(ast.root, result);
  for (const declarations of Object.values(ast.stylesheet)) {
    collectRecordFonts(declarations, result);
  }
  for (const face of ast.fontFaces ?? []) {
    result.delete(face.fontFamily as UIKitMLBundledFontName);
  }
  return result;
}

async function collectUIKitMLFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectUIKitMLFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.uikitml')
        ? [entryPath]
        : [];
    }),
  );
  return nested.flat();
}

export async function resolveBundledFontNames(
  publicDirectory: string | undefined,
  configured: ProductionBundleOptions['fonts'],
): Promise<ReadonlySet<UIKitMLBundledFontName>> {
  if (configured === 'all') {
    return FONT_NAMES;
  }
  const result = new Set<UIKitMLBundledFontName>();
  for (const font of configured ?? []) {
    if (!FONT_NAMES.has(font)) {
      throw new Error(
        `iwsdkDev().bundle.fonts contains unknown bundled font "${font}"`,
      );
    }
    result.add(font);
  }
  if (!publicDirectory) {
    return result;
  }

  for (const file of await collectUIKitMLFiles(publicDirectory)) {
    const parsed = parse(await readFile(file, 'utf8'), {
      componentSets: resolveKitComponentSets('horizon'),
    });
    if (!parsed.success) {
      // UIKitML validation owns the actionable syntax failure. Preserve every
      // bundled font when this independent size pass cannot safely analyze it.
      return FONT_NAMES;
    }
    for (const font of collectAstFonts(parsed.ast)) {
      result.add(font);
    }
  }
  return result;
}

export function createDisabledBundledFontsModule(): string {
  const exports = Object.entries(BUNDLED_FONT_MODULES).map(
    ([font, definition]) =>
      `export const ${definition.exportName} = unavailable(${JSON.stringify(font)});`,
  );
  return `const unavailable = (font) => new Proxy({}, {
  get() {
    throw new Error('[IWSDK] Bundled font "' + font + '" was excluded from this production build. Add it to iwsdkDev({ bundle: { fonts: [...] } }) when UIKitML is loaded dynamically.');
  }
});
${exports.join('\n')}`;
}
