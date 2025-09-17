#!/bin/bash
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# Build script to create standalone tgz files for all packages
# Places all tgz files in examples folder for easy consumption

set -e

echo "🚀 Building standalone tgz packages..."

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES_DIR="$BASE_DIR/packages"
EXAMPLES_DIR="$BASE_DIR/examples"

# Package build order (dependencies first)
LEAF_PACKAGES=("glxf" "xr-input" "locomotor" "vite-plugin-gltf-optimizer" "vite-plugin-iwer" "vite-plugin-metaspatial" "vite-plugin-uikitml" "create")
ROOT_PACKAGES=("core")

# Function to backup package.json
backup_package_json() {
    local package_dir="$1"
    cp "$package_dir/package.json" "$package_dir/package.json.backup"
}

# Function to restore package.json
restore_package_json() {
    local package_dir="$1"
    if [ -f "$package_dir/package.json.backup" ]; then
        mv "$package_dir/package.json.backup" "$package_dir/package.json"
    fi
}

# Create a versionless alias for a packed tarball (keeps the original too)
alias_tarball() {
    local tarball="$1"
    local dir="$(dirname "$tarball")"
    local base="$(basename "$tarball")"
    # Strip the trailing -<version>.tgz
    local alias_name="${base%-*.tgz}.tgz"
    local alias_path="$dir/$alias_name"
    if [ "$alias_path" != "$tarball" ]; then
        mv -f "$tarball" "$alias_path"
        echo "$alias_path"
    else
        echo "$tarball"
    fi
}

# Function to build and pack leaf packages (no workspace dependencies)
build_leaf_packages() {
    echo "📦 Building leaf packages (no workspace dependencies)..."
    
    for package in "${LEAF_PACKAGES[@]}"; do
        local package_dir="$PACKAGES_DIR/$package"
        
        if [ ! -d "$package_dir" ]; then
            echo "❌ Package directory not found: $package_dir"
            continue
        fi
        
        echo "   Building $package..."
        cd "$package_dir"
        
        # Clean previous builds
        rm -rf lib dist build *.tgz
        
        if pnpm run build 2>/dev/null; then
            echo "     ✅ Build completed"
        fi
        
        # Pack - this works because no workspace dependencies
        local tarball=$(pnpm pack 2>/dev/null | tail -n1)
        echo "     📦 Packed:  $tarball"
        local alias_path=$(alias_tarball "$tarball")
        if [ -n "$alias_path" ]; then
            echo "     🔁 Renamed: $alias_path"
        fi
    done
}

# Function to replace workspace dependencies with file dependencies
replace_workspace_deps() {
    local package_dir="$1"
    local package_json="$package_dir/package.json"
    
    echo "   🔄 Replacing workspace: dependencies with file: dependencies..."
    
    # Use Node.js to replace workspace dependencies
    node -e "
    const fs = require('fs');
    const path = require('path');
    const pkgPath = '$package_json';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const here = path.dirname(pkgPath);
    function repl(deps){
      if (!deps) return;
      for (const [name, ver] of Object.entries(deps)){
        if (!name.startsWith('@iwsdk/')) continue;
        const short = name.replace('@iwsdk/', '');
        const versionedRe = new RegExp('^file:\\.{2}\/' + short + '\/iwsdk-' + short + '-.*\\.tgz$');
        const isWorkspace = String(ver).startsWith('workspace:');
        const isVersionedFile = versionedRe.test(String(ver));
        if (!(isWorkspace || isVersionedFile)) continue;
        const rel = path.join('..', short, 'iwsdk-' + short + '.tgz');
        deps[name] = 'file:' + rel;
        console.log('     Replaced', name, '→', deps[name]);
      }
    }
    repl(pkg.dependencies); repl(pkg.devDependencies); repl(pkg.peerDependencies);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    "
}

# Function to build root packages (with workspace dependencies)
build_root_packages() {
    echo "📦 Building root packages (with workspace dependencies)..."
    
    for package in "${ROOT_PACKAGES[@]}"; do
        local package_dir="$PACKAGES_DIR/$package"
        
        if [ ! -d "$package_dir" ]; then
            echo "❌ Package directory not found: $package_dir"
            continue
        fi
        
        echo "   Building $package..."
        cd "$package_dir"
        
        # Backup original package.json
        backup_package_json "$package_dir"
        
        # Replace workspace dependencies with file dependencies
        replace_workspace_deps "$package_dir"
        
        # Install the file dependencies
        echo "   📥 Installing file dependencies..."
        pnpm install
        
        # Clean and build
        rm -rf lib dist build *.tgz
        
        if pnpm run build 2>/dev/null; then
            echo "     ✅ Build completed"
        fi
        
        # Pack - now works because dependencies are file: references
        local tarball=$(pnpm pack 2>/dev/null | tail -n1)
        echo "     📦 Packed:  $tarball"
        local alias_path=$(alias_tarball "$tarball")
        if [ -n "$alias_path" ]; then
            echo "     🔁 Renamed: $alias_path"
        fi
        
        # Restore original package.json and reinstall workspace dependencies
        echo "   🔄 Restoring workspace dependencies..."
        restore_package_json "$package_dir"
        pnpm install --silent
    done
}

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up backup files and temporary changes..."
    find "$PACKAGES_DIR" -name "package.json.backup" -delete
    # Ensure all workspace dependencies are restored
    for package in "${ROOT_PACKAGES[@]}"; do
        local package_dir="$PACKAGES_DIR/$package"
        if [ -f "$package_dir/package.json.backup" ]; then
            restore_package_json "$package_dir"
            cd "$package_dir"
            pnpm install --silent
        fi
    done
}

# Trap cleanup on exit (success or failure)
trap cleanup EXIT

# Main execution
main() {
    echo "Building standalone tgz packages for examples..."
    echo ""
    
    # Step 1: Build packages without workspace dependencies
    build_leaf_packages
    echo ""
    
    # Step 2: Build packages with workspace dependencies (with temporary changes)
    build_root_packages
    echo ""
    
    echo "🎉 All packages built and moved to examples folder!"
    echo ""
    echo "📋 Available tgz files in examples/:"
    ls -la "$EXAMPLES_DIR"/*.tgz 2>/dev/null || echo "   (No tgz files found)"
    echo ""
    echo "💡 Examples can now install these packages with:"
    echo "   npm install ./iwsdk-core.tgz"
    echo "   npm install ./iwsdk-vite-plugin-gltf-optimizer.tgz --save-dev"
    echo "   npm install ./iwsdk-vite-plugin-iwer.tgz --save-dev"
    echo "   npm install ./iwsdk-vite-plugin-metaspatial.tgz --save-dev"
    echo "   npm install ./iwsdk-vite-plugin-uikitml.tgz --save-dev"
}

main
