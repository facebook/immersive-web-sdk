/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import {
  EXAMPLE_ASSET_PUBLIC_ROOT,
  copyExampleAssets,
  getExampleAsset,
  getExampleAssetSourceFilePath,
} from './index.js';

export interface IwsdkExampleAssetsPluginOptions {
  assetIds: readonly string[];
  assetRoot?: string;
  publicRoot?: string;
}

export interface IwsdkExampleAssetsVitePlugin {
  name: string;
  configResolved: (config: IwsdkExampleAssetsResolvedConfig) => void;
  configureServer: (server: IwsdkExampleAssetsDevServer) => void;
  writeBundle: () => Promise<void>;
}

interface IwsdkExampleAssetsResolvedConfig {
  build: {
    outDir: string;
  };
  root: string;
}

interface IwsdkExampleAssetsDevServer {
  middlewares: {
    use: (
      handler: (
        request: IncomingMessage,
        response: ServerResponse,
        next: () => void,
      ) => void | Promise<void>,
    ) => void;
  };
}

export function iwsdkExampleAssets({
  assetIds,
  assetRoot,
  publicRoot = EXAMPLE_ASSET_PUBLIC_ROOT,
}: IwsdkExampleAssetsPluginOptions): IwsdkExampleAssetsVitePlugin {
  const requestedAssetIds = [...new Set(assetIds)];
  const requestedAssetIdSet = new Set(requestedAssetIds);
  let config: IwsdkExampleAssetsResolvedConfig | undefined;

  return {
    name: 'iwsdk-example-assets',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestedFile = resolveAssetRequest({
          assetRoot,
          pathname: new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
          publicRoot,
          requestedAssetIds: requestedAssetIdSet,
        });

        if (requestedFile == null) {
          next();
          return;
        }

        try {
          response.setHeader('Content-Type', mimeTypeFor(requestedFile));
          response.writeHead(200).end(await readFile(requestedFile));
        } catch {
          response.writeHead(404).end();
        }
      });
    },

    async writeBundle() {
      if (config == null) {
        return;
      }

      await copyExampleAssets({
        assetIds: requestedAssetIds,
        assetRoot,
        outDir: path.resolve(config.root, config.build.outDir),
        publicRoot,
      });
    },
  };
}

function resolveAssetRequest({
  assetRoot,
  pathname,
  publicRoot,
  requestedAssetIds,
}: {
  assetRoot?: string;
  pathname: string;
  publicRoot: string;
  requestedAssetIds: ReadonlySet<string>;
}): string | undefined {
  const prefix = `/${publicRoot.replace(/^\/+|\/+$/g, '')}/`;
  const normalizedPathname = decodeURIComponent(pathname);
  if (!normalizedPathname.startsWith(prefix)) {
    return undefined;
  }

  const [assetId, ...fileParts] = normalizedPathname
    .slice(prefix.length)
    .split('/');
  const filePath = fileParts.join('/');
  if (!requestedAssetIds.has(assetId) || filePath.length === 0) {
    return undefined;
  }

  const asset = getExampleAsset(assetId);
  if (asset == null || !asset.files.some((file) => file.path === filePath)) {
    return undefined;
  }

  return getExampleAssetSourceFilePath(assetId, filePath, assetRoot);
}

function mimeTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.gltf':
      return 'model/gltf+json';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}
