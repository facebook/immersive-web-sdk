/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUNDLED_FONT_MODULES,
  createDisabledBundledFontsModule,
  resolveBundledFontNames,
} from '../src/bundle-feature-gates.js';
import { iwsdkDev } from '../src/index.js';

const tempDirectories: string[] = [];
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('production bundle feature gates', () => {
  it.each([
    '<div><h1>Score</h1><button>Putt</button></div>',
    '<style>@font-face { font-family: inter; src: url("./custom.ttf"); font-weight: 400; }</style><div>Default</div>',
  ])(
    'retains UIKit default Inter when no family is referenced: %s',
    async (source) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-default-font-'));
      tempDirectories.push(root);
      await writeFile(path.join(root, 'panel.uikitml'), source);

      await expect(resolveBundledFontNames(root, undefined)).resolves.toEqual(
        new Set(['inter']),
      );
    },
  );

  it('retains static and explicitly configured bundled fonts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-font-bundle-'));
    tempDirectories.push(root);
    await mkdir(path.join(root, 'ui'));
    await writeFile(
      path.join(root, 'ui', 'panel.uikitml'),
      `<style>
        @font-face { font-family: "Brand"; src: url("./brand.ttf"); font-weight: 400; }
        .copy { font-family: roboto; }
        .brand { font-family: "Brand"; }
      </style><div class="copy">Copy</div>`,
    );

    await expect(resolveBundledFontNames(root, ['inter'])).resolves.toEqual(
      new Set(['inter', 'roboto']),
    );
  });

  it('resolves custom-face exclusions before merging fonts across files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-font-bundle-'));
    tempDirectories.push(root);
    await mkdir(path.join(root, 'ui'));
    await writeFile(
      path.join(root, 'ui', 'first.uikitml'),
      `<style>
        @font-face { font-family: inter; src: url("./inter.ttf"); font-weight: 400; }
        .copy { font-family: roboto; }
      </style><div class="copy">Roboto</div>`,
    );
    await writeFile(
      path.join(root, 'ui', 'second.uikitml'),
      `<style>
        @font-face { font-family: roboto; src: url("./roboto.ttf"); font-weight: 400; }
        .copy { font-family: inter; }
      </style><div class="copy">Inter</div>`,
    );

    await expect(resolveBundledFontNames(root, undefined)).resolves.toEqual(
      new Set(['inter', 'roboto']),
    );
  });

  it('retains fonts declared in nested UIKitML style sections', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-font-bundle-'));
    tempDirectories.push(root);
    await mkdir(path.join(root, 'ui'));
    await writeFile(
      path.join(root, 'ui', 'panel.uikitml'),
      `<style>
        .copy:hover { font-family: roboto; }
        .copy:dark { font-family: inter; }
        .copy:md { font-family: poppins; }
      </style><div class="copy">Responsive copy</div>`,
    );

    await expect(resolveBundledFontNames(root, undefined)).resolves.toEqual(
      new Set(['inter', 'poppins', 'roboto']),
    );
  });

  it('keeps every font when analysis cannot safely parse an asset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'iwsdk-font-bundle-'));
    tempDirectories.push(root);
    await writeFile(path.join(root, 'broken.uikitml'), '<Unknown />');

    const fonts = await resolveBundledFontNames(root, undefined);

    expect(fonts.size).toBe(Object.keys(BUNDLED_FONT_MODULES).length);
  });

  it('emits all named exports from one diagnostic fallback module', () => {
    const source = createDisabledBundledFontsModule();
    expect(source).toContain('export const roboto = unavailable("roboto")');
    expect(source).toContain(
      'export const openSans = unavailable("open-sans")',
    );
    expect(source).toContain('iwsdkDev({ bundle: { fonts: [...] } })');
  });

  it.each([
    {
      name: 'custom font only',
      source: `<style>
  @font-face { font-family: "Brand"; src: url("./brand.ttf"); font-weight: 400; }
  .copy { font-family: "Brand"; }
</style><div><div class="copy">Copy</div><div>Unstyled custom default</div></div>`,
      retainsInter: false,
    },
    {
      name: 'implicit UIKit default font',
      source: '<div><h1>Score</h1><button>Putt</button></div>',
      retainsInter: true,
    },
  ])(
    'omits Havok and retains only needed font atlases: $name',
    { timeout: 20000 },
    async ({ source, retainsInter }) => {
      const root = await mkdtemp(path.join(PACKAGE_ROOT, '.bundle-gate-'));
      tempDirectories.push(root);
      await mkdir(path.join(root, 'src'), { recursive: true });
      await mkdir(path.join(root, 'public', 'scenes'), { recursive: true });
      await mkdir(path.join(root, 'public', 'ui'), { recursive: true });
      await writeFile(
        path.join(root, 'index.html'),
        '<script type="module" src="/src/main.ts"></script>',
      );
      await writeFile(
        path.join(root, 'src', 'main.ts'),
        `import { PhysicsSystem, loadUIKitMLComponent } from '@iwsdk/core';
console.log(PhysicsSystem, loadUIKitMLComponent);`,
      );
      await writeFile(
        path.join(root, 'public', 'scenes', 'main.iwsdk.scene.json'),
        '{}\n',
      );
      await writeFile(path.join(root, 'public', 'ui', 'panel.uikitml'), source);
      await writeFile(
        path.join(root, 'iwsdk.config.json'),
        `${JSON.stringify({
          version: 'iwsdk.project.v1',
          scene: './public/scenes/main.iwsdk.scene.json',
          world: {
            xr: false,
            features: { physics: false, spatialUI: true },
          },
          dev: { emulator: { iwer: false } },
        })}\n`,
      );

      const buildResult = (await build({
        configFile: false,
        root,
        publicDir: 'public',
        logLevel: 'silent',
        plugins: [iwsdkDev({ https: false })],
        build: { write: false, target: 'esnext' },
      })) as {
        output: Array<{ fileName: string; code?: string }>;
      };
      const fileNames = buildResult.output.map((entry) => entry.fileName);
      const emittedCode = buildResult.output
        .map((entry) => entry.code ?? '')
        .join('\n');

      expect(emittedCode).toContain(
        'Physics was excluded from this production build',
      );
      expect(emittedCode).not.toContain('HavokPhysics');
      expect(fileNames).toContainEqual(
        expect.stringContaining('_virtual_iwsdk-disabled-bundled-fonts'),
      );
      expect(fileNames.some((name) => /HavokPhysics|\.wasm$/i.test(name))).toBe(
        false,
      );
      expect(
        fileNames.some((name) =>
          Object.values(BUNDLED_FONT_MODULES).some(({ exportName }) =>
            name.toLowerCase().includes(exportName.toLowerCase()),
          ),
        ),
      ).toBe(retainsInter);
      expect(fileNames.some((name) => /(?:^|\/)inter-/.test(name))).toBe(
        retainsInter,
      );
    },
  );
});
