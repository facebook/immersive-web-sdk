#!/bin/bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# Preflight checks for Linux dev servers and other network-restricted shells.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILES_URL="https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/profilesList.json"
PROXY_URL="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}"

pass() { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*"; exit 1; }
redact_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit
value = sys.argv[1]
try:
    parts = urlsplit(value)
    netloc = parts.netloc
    if "@" in netloc:
        netloc = "***@" + netloc.rsplit("@", 1)[1]
    print(urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment)))
except Exception:
    print("<configured>")
PY
}

cd "$ROOT_DIR"

echo "🔎 IWSDK Linux dev-server preflight"
echo "   Repo: $ROOT_DIR"

node_version="$(node -v 2>/dev/null || true)"
[ -n "$node_version" ] || fail "node is not on PATH"
pass "node $node_version"

node - <<'NODE' || fail "Node must be >=20.19, >=22.12, or >=24 for this workspace"
const major = Number(process.versions.node.split('.')[0]);
const [maj, min] = process.versions.node.split('.').map(Number);
const ok = (maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj >= 24;
process.exit(ok ? 0 : 1);
NODE

pnpm_version="$(pnpm -v 2>/dev/null || true)"
[ -n "$pnpm_version" ] || fail "pnpm is not on PATH"
pass "pnpm $pnpm_version"

if command -v curl >/dev/null 2>&1; then
  pass "curl is available"
  if [ -n "$PROXY_URL" ]; then
    echo "🌐 Proxy detected: $(redact_url "$PROXY_URL")"
    if curl --fail --silent --show-error --location --proxy "$PROXY_URL" --max-time 20 "$PROFILES_URL" >/dev/null; then
      pass "WebXR input profiles CDN reachable through proxy"
    else
      fail "Could not reach WebXR input profiles CDN through proxy"
    fi
  else
    warn "No HTTP_PROXY/HTTPS_PROXY detected. Direct CDN fetch will be attempted by profile generation."
    if curl --fail --silent --show-error --location --max-time 20 "$PROFILES_URL" >/dev/null; then
      pass "WebXR input profiles CDN reachable directly"
    else
      warn "WebXR input profiles CDN is not reachable directly. Set HTTPS_PROXY/HTTP_PROXY or run generate:profiles with --proxy."
    fi
  fi
else
  if [ -n "$PROXY_URL" ]; then
    fail "curl is required when using proxy-based profile generation"
  fi
  warn "curl is not available; direct Node HTTPS fetch will be used for profile generation"
fi

if [ -f packages/xr-input/src/gamepad/generated-profiles.ts ]; then
  pass "generated input profiles file exists"
else
  warn "generated input profiles file is missing; run pnpm --filter @iwsdk/xr-input run generate:profiles"
fi

if [ -f packages/xr-input/dist/index.d.ts ] && [ -f packages/xr-input/dist/index.js ]; then
  pass "xr-input dist exists"
else
  warn "xr-input dist is missing; run pnpm --filter @iwsdk/xr-input run build"
fi

pass "preflight complete"
