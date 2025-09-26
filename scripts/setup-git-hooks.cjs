#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Setup git hooks conditionally based on repository structure
 *
 * Two scenarios:
 * 1. Standalone repo: immersive-web-sdk/.git exists
 * 2. Monorepo: ../immersive-web-sdk/.git exists (parent is git root)
 */
function setupGitHooks() {
  const currentDir = process.cwd();
  const parentDir = path.dirname(currentDir);

  // Check if we're in the standalone immersive-web-sdk repository
  const hasOwnGit = fs.existsSync(path.join(currentDir, '.git'));

  // Check if we're in a parent monorepo (git root is parent of immersive-web-sdk)
  const parentHasGit = fs.existsSync(path.join(parentDir, '.git'));
  const isImmersiveWebSdkFolder =
    path.basename(currentDir) === 'immersive-web-sdk';

  console.log('🔍 Detecting repository structure...');
  console.log(`   Current directory: ${currentDir}`);
  console.log(`   Parent directory: ${parentDir}`);
  console.log(`   Own .git exists: ${hasOwnGit}`);
  console.log(`   Parent .git exists: ${parentHasGit}`);
  console.log(`   Is immersive-web-sdk folder: ${isImmersiveWebSdkFolder}`);

  if (hasOwnGit) {
    // Scenario 1: Standalone immersive-web-sdk repository (GitHub mirror)
    console.log('✅ Detected standalone immersive-web-sdk repository');
    console.log('   Setting up git hooks with husky...');

    try {
      execSync('husky install', { stdio: 'inherit' });
      console.log('✅ Git hooks installed successfully');

      // Ensure pre-commit hook exists
      const hookContent =
        '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\n';
      const hookPath = '.husky/pre-commit';

      if (!fs.existsSync('.husky')) {
        fs.mkdirSync('.husky', { recursive: true });
      }

      fs.writeFileSync(hookPath, hookContent);
      execSync(`chmod +x ${hookPath}`);
      console.log('✅ Pre-commit hook configured');
    } catch (error) {
      console.error('❌ Failed to install husky:', error.message);
      process.exit(1);
    }
  } else if (parentHasGit && isImmersiveWebSdkFolder) {
    // Scenario 2: immersive-web-sdk inside parent monorepo
    console.log('✅ Detected immersive-web-sdk in parent monorepo');
    console.log(
      '   Skipping git hooks installation (parent repo handles this)',
    );
    console.log('');
    console.log('ℹ️  To manually run linting and formatting:');
    console.log('   npm run lint     - Run ESLint');
    console.log('   npm run format   - Run Prettier');
    console.log('   npm run lint-staged - Run pre-commit checks');
  } else {
    // Unexpected scenario
    console.log('⚠️  Unexpected repository structure detected');
    console.log('   Expected scenarios:');
    console.log('   1. immersive-web-sdk/.git (standalone repo)');
    console.log(
      '   2. parent-monorepo/.git + parent-monorepo/immersive-web-sdk/ (monorepo)',
    );
    console.log('');
    console.log('   Skipping git hooks installation');
  }
}

// Only run if called directly (not when required as module)
if (require.main === module) {
  setupGitHooks();
}

module.exports = { setupGitHooks };
