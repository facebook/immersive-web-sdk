#!/usr/bin/env bash

set -euo pipefail

readonly IWSDK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly PNPM_VERSION="10.18.3"

export CI=1
export COREPACK_HOME="${COREPACK_HOME:-${DISK_TEMP:-/tmp}/iwsdk-corepack}"
export HUSKY=0
export npm_config_registry="${npm_config_registry:-https://registry.npmjs.org}"
export NPM_CONFIG_UPDATE_NOTIFIER=false
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PNPM_STORE_DIR="${PNPM_STORE_DIR:-${DISK_TEMP:-/tmp}/iwsdk-pnpm-store}"

if [[ -n "${SANDCASTLE_INSTANCE_ID:-}" ]]; then
  export HTTP_PROXY="${HTTP_PROXY:-http://fwdproxy:8080}"
  export HTTPS_PROXY="${HTTPS_PROXY:-http://fwdproxy:8080}"
  export NO_PROXY="${NO_PROXY:-.facebook.com,.fb.com,.fbinfra.net,.tfbnw.net}"
fi

cd "$IWSDK_ROOT"

pnpm() {
  corepack "pnpm@${PNPM_VERSION}" "$@"
}

case "${1:-}" in
  preflight)
    node --version
    node -e '
      const [major, minor] = process.versions.node.split(".").map(Number);
      const supported =
        (major === 20 && minor >= 19) ||
        (major === 22 && minor >= 12) ||
        major >= 24;
      if (!supported) {
        console.error(
          `Unsupported Node.js ${process.versions.node}; IWSDK requires ` +
            ">=20.19 <21, >=22.12 <23, or >=24",
        );
        process.exit(1);
      }
    '
    corepack --version
    pnpm --version
    ;;
  install)
    pnpm install --frozen-lockfile --store-dir "$PNPM_STORE_DIR"
    ;;
  lint)
    pnpm lint
    ;;
  format)
    pnpm format:check
    ;;
  build)
    pnpm build:all
    ;;
  typecheck)
    pnpm typecheck:examples
    pnpm engines:audit
    pnpm three:check
    ;;
  unit)
    unit_status=0
    pnpm --filter './packages/**' --filter '!@iwsdk/vite-plugin-dev' \
      -r --no-bail --if-present run test || unit_status=$?
    pnpm --filter @iwsdk/vite-plugin-dev exec vitest run \
      --exclude='test/**/*.e2e.test.ts' \
      --exclude='test/editor-e2e.test.ts' \
      --exclude='test/editor-routing-e2e.test.ts' || unit_status=$?
    exit "$unit_status"
    ;;
  *)
    echo "Usage: $0 {preflight|install|lint|format|build|typecheck|unit}" >&2
    exit 2
    ;;
esac
