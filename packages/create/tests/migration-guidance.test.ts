/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const MIGRATION_SKILL_PATH = path.join(
  WORKSPACE_ROOT,
  'docs',
  'public',
  'skills',
  'iwsdk-migrate-0-5',
  'SKILL.md',
);
const CORE_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'core');
const PLUGIN_ROOT = path.join(WORKSPACE_ROOT, 'packages', 'vite-plugin-dev');
const TSC_PATH = path.join(
  WORKSPACE_ROOT,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe('0.5 migration guidance', () => {
  it('typechecks the documented manifest-first API shape', async () => {
    const skill = await readFile(MIGRATION_SKILL_PATH, 'utf8');
    for (const documentedSurface of [
      'iwsdkDev()',
      'defineAssets({',
      'defineComponents([MyBehavior])',
      "from 'virtual:iwsdk-project'",
      "requireSceneObject<UIKitMLAsset>('settings-panel')",
    ]) {
      expect(skill).toContain(documentedSurface);
    }

    const appRoot = await mkdtemp(
      path.join(os.tmpdir(), 'iwsdk-migration-guidance-'),
    );
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'src', 'components'), { recursive: true });
    await mkdir(path.join(appRoot, 'node_modules', '@iwsdk'), {
      recursive: true,
    });
    const viteRoot = await realpath(
      path.join(PLUGIN_ROOT, 'node_modules', 'vite'),
    );
    await Promise.all([
      symlink(
        CORE_ROOT,
        path.join(appRoot, 'node_modules', '@iwsdk', 'core'),
        'dir',
      ),
      symlink(
        PLUGIN_ROOT,
        path.join(appRoot, 'node_modules', '@iwsdk', 'vite-plugin-dev'),
        'dir',
      ),
      symlink(viteRoot, path.join(appRoot, 'node_modules', 'vite'), 'dir'),
    ]);

    await Promise.all([
      writeFile(
        path.join(appRoot, 'src', 'vite-env.d.ts'),
        '/// <reference types="vite/client" />\n',
      ),
      writeFile(
        path.join(appRoot, 'src', 'assets.ts'),
        `import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (assetPath: string) =>
  \`${'${import.meta.env.BASE_URL}'}${"${assetPath.replace(/^\\/+/, '')}"}\`;

export default defineAssets({
  environment: {
    name: 'Environment',
    type: AssetType.GLTF,
    url: publicAssetUrl('models/environment.glb'),
  },
  'settings-panel': {
    name: 'Settings Panel',
    type: AssetType.UIKitML,
    url: publicAssetUrl('ui/settings.uikitml'),
  },
});
`,
      ),
      writeFile(
        path.join(appRoot, 'src', 'components', 'my-behavior.ts'),
        `import { createComponent } from '@iwsdk/core';

export const MyBehavior = createComponent('MyBehavior', {});
`,
      ),
      writeFile(
        path.join(appRoot, 'src', 'components.ts'),
        `import { defineComponents } from '@iwsdk/core';
import { MyBehavior } from './components/my-behavior.js';

export default defineComponents([MyBehavior]);
`,
      ),
      writeFile(
        path.join(appRoot, 'src', 'index.ts'),
        `import { UIKitMLAsset, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

const container = document.querySelector<HTMLDivElement>('#scene-container');
if (container == null) throw new Error('Missing #scene-container');

const world = await World.create(container, projectOptions);
const panel = world.requireSceneObject<UIKitMLAsset>('settings-panel');
const saveButton = panel.requireElementById('save-button');
const onSave = () => undefined;
saveButton.addEventListener('click', onSave);
`,
      ),
      writeFile(
        path.join(appRoot, 'vite.config.ts'),
        `import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', open: false },
});
`,
      ),
      writeFile(
        path.join(appRoot, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              isolatedModules: true,
              module: 'ESNext',
              moduleResolution: 'Bundler',
              noEmit: true,
              skipLibCheck: true,
              strict: true,
              target: 'ES2022',
              types: ['@iwsdk/vite-plugin-dev/client'],
            },
            include: ['src/**/*.ts', 'vite.config.ts'],
          },
          null,
          2,
        )}\n`,
      ),
    ]);

    await expect(
      execFileAsync(process.execPath, [TSC_PATH, '--project', appRoot], {
        cwd: appRoot,
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({ stderr: '', stdout: '' });
  }, 30_000);
});
