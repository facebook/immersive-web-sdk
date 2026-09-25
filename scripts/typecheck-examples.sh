#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

set -euo pipefail

# pnpm exports internal npm_config keys that npm 11 warns about.
unset npm_config_verify_deps_before_run npm_config__jsr_registry
readonly IWSDK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly EXAMPLES_DIR="$IWSDK_ROOT/examples"
readonly NPM_REGISTRY="${IWSDK_EXAMPLE_NPM_REGISTRY:-https://registry.npmjs.org/}"

# The public package script builds fresh development tarballs before invoking
# this helper. Sandcastle invokes it after its own build phase has done so.
typechecked=0
for example_dir in "$EXAMPLES_DIR"/*/; do
  if [[ ! -f "$example_dir/tsconfig.json" ]]; then
    continue
  fi

  example_name="$(basename "$example_dir")"
  echo "Type-checking $example_name from a fresh tarball install..."
  (
    cd "$example_dir"
    rm -rf node_modules package-lock.json
    npm install \
      --registry "$NPM_REGISTRY" \
      --ignore-scripts \
      --no-package-lock \
      --no-audit \
      --no-fund
    ./node_modules/.bin/tsc --noEmit
  )
  typechecked=$((typechecked + 1))
done

if [[ "$typechecked" -eq 0 ]]; then
  echo "No TypeScript examples found under $EXAMPLES_DIR." >&2
  exit 1
fi

echo "All $typechecked examples pass type checks."
