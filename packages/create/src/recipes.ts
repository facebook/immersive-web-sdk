/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Recipe } from '@pmndrs/chef';
import type { VariantId } from './types.js';

export const DEFAULT_ASSETS_BASE =
  process.env.IWSDK_ASSET_BASE || 'https://iwsdk-assets.pages.dev';

async function fetchJSON<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchRecipesIndex(base = DEFAULT_ASSETS_BASE) {
  const url = new URL(
    'recipes/index.json',
    base.endsWith('/') ? base : base + '/',
  ).toString();
  return fetchJSON<{ id: VariantId; name: string; recipe: string }[]>(url);
}

export async function fetchRecipe(id: VariantId, base = DEFAULT_ASSETS_BASE) {
  const url = new URL(
    `recipes/${id}.recipe.json`,
    base.endsWith('/') ? base : base + '/',
  ).toString();
  return fetchJSON<Recipe>(url);
}

export async function fetchRecipeByFileName(
  fileName: string,
  base = DEFAULT_ASSETS_BASE,
) {
  const url = new URL(
    `recipes/${fileName}`,
    base.endsWith('/') ? base : base + '/',
  ).toString();
  return fetchJSON<Recipe>(url);
}
