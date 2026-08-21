#!/usr/bin/env bash

set -euo pipefail

readonly IWSDK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly NODE_VERSION="24.18.1"
readonly NPM_VERSION="10.9.0"
readonly PNPM_VERSION="11.22.0"
readonly XR_INPUT_PROFILES_VERSION="1.0.20"

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
  export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,.facebook.com,.fb.com,.fbinfra.net,.tfbnw.net}"
fi

export npm_config_https_proxy="${npm_config_https_proxy:-${HTTPS_PROXY:-}}"
export npm_config_proxy="${npm_config_proxy:-${HTTP_PROXY:-}}"

if [[ -z "${npm_config_cafile:-}" && -f /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem ]]; then
  export npm_config_cafile=/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
  export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-$npm_config_cafile}"
fi

bootstrap_toolchain() {
  local node_arch
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    aarch64) node_arch=arm64 ;;
    *)
      echo "Unsupported Sandcastle architecture: $(uname -m)" >&2
      return 1
      ;;
  esac

  local toolchain_root
  toolchain_root="${DISK_TEMP:-/tmp}/iwsdk-toolchain-node-${NODE_VERSION}-npm-${NPM_VERSION}-pnpm-${PNPM_VERSION}-${node_arch}"

  if [[ ! -x "$toolchain_root/node_modules/.bin/node" || ! -x "$toolchain_root/node_modules/.bin/npm" || ! -x "$toolchain_root/node_modules/.bin/pnpm" ]]; then
    local bootstrap_npm
    if [[ -x /usr/bin/npm ]]; then
      bootstrap_npm=/usr/bin/npm
    else
      bootstrap_npm="$(command -v npm)"
    fi

    local temp_root="${toolchain_root}.tmp.$$"
    rm -rf "$temp_root"
    mkdir -p "$temp_root"
    trap 'rm -rf "$temp_root"' RETURN
    PATH="$(dirname "$bootstrap_npm"):/usr/bin:/bin:$PATH" \
      "$bootstrap_npm" install \
      --prefix "$temp_root" \
      --no-save \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      "node-linux-${node_arch}@${NODE_VERSION}" \
      "npm@${NPM_VERSION}" \
      "pnpm@${PNPM_VERSION}"
    rm -rf "$toolchain_root"
    mv "$temp_root" "$toolchain_root"
    trap - RETURN
  fi

  cat >"$toolchain_root/node_modules/.bin/corepack" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

readonly bin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "${1:-}" in
  pnpm|pnpm@*)
    shift
    exec "$bin_dir/pnpm" "$@"
    ;;
  --version|-v)
    echo "IWSDK pinned pnpm shim"
    ;;
  *)
    echo "Unsupported Corepack command: ${1:-}" >&2
    exit 2
    ;;
esac
EOF
  chmod +x "$toolchain_root/node_modules/.bin/corepack"

  export PATH="$toolchain_root/node_modules/.bin:$PATH"
  hash -r
}

bootstrap_toolchain

cd "$IWSDK_ROOT"

prepare_xr_input_profiles() {
  local output_file="packages/xr-input/src/gamepad/generated-profiles.ts"
  if [[ -f "$output_file" ]]; then
    return
  fi

  local assets_root
  assets_root="${DISK_TEMP:-/tmp}/iwsdk-xr-input-profiles-${XR_INPUT_PROFILES_VERSION}"
  local profiles_dir="$assets_root/node_modules/@webxr-input-profiles/assets/dist/profiles"
  if [[ ! -f "$profiles_dir/profilesList.json" ]]; then
    local temp_root="${assets_root}.tmp.$$"
    rm -rf "$temp_root"
    mkdir -p "$temp_root"
    trap 'rm -rf "$temp_root"' RETURN
    npm install \
      --prefix "$temp_root" \
      --no-save \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      "@webxr-input-profiles/assets@${XR_INPUT_PROFILES_VERSION}"
    rm -rf "$assets_root"
    mv "$temp_root" "$assets_root"
    trap - RETURN
  fi

  node packages/xr-input/scripts/generate-input-profiles.js \
    --assets-dir "$profiles_dir"
}

typecheck_examples() {
  local example_dir
  for example_dir in examples/*/; do
    if [[ ! -f "$example_dir/tsconfig.json" ]]; then
      continue
    fi

    echo "Type-checking $example_dir..."
    (
      cd "$example_dir"
      npm install \
        --ignore-scripts \
        --no-package-lock \
        --no-audit \
        --no-fund
      ./node_modules/.bin/tsc --noEmit
    )
  done
  echo "All examples pass type checks."
}

case "${1:-}" in
  all)
    for check in preflight install lint format build typecheck unit; do
      echo "=== IWSDK quality: $check ==="
      bash "$IWSDK_ROOT/ci/sandcastle/run-check.sh" "$check"
    done
    ;;
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
    npm --version
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
    prepare_xr_input_profiles
    pnpm build:tgz:dev
    ;;
  typecheck)
    typecheck_examples
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
    echo "Usage: $0 {all|preflight|install|lint|format|build|typecheck|unit}" >&2
    exit 2
    ;;
esac
