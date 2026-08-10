#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { execFile } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const CDN_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles';
const PINNED_ASSETS_SOURCE = 'npm:@webxr-input-profiles/assets@1.0.20';
const OUTPUT_FILE = path.join(
  __dirname,
  '../src/gamepad/generated-profiles.ts',
);

function readFlagValue(flag) {
  const prefix = `${flag}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(flag);
  if (index !== -1) {
    return process.argv[index + 1];
  }

  return undefined;
}

const forceRefresh =
  process.argv.includes('--force') || process.argv.includes('--refresh');
const offline = process.argv.includes('--offline');
const assetsDirectory = readFlagValue('--assets-dir');
const proxyUrl =
  readFlagValue('--proxy') ??
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy;

function redactUrlForLogs(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '<configured>';
  }
}

function explainNetworkMode() {
  if (assetsDirectory) {
    console.log(`🌐 Network mode: local assets from ${assetsDirectory}.`);
  } else if (offline) {
    console.log(
      '🌐 Network mode: offline; using existing generated profiles only.',
    );
  } else if (proxyUrl) {
    console.log(
      `🌐 Network mode: fetching input profiles through proxy ${redactUrlForLogs(proxyUrl)}`,
    );
  } else {
    console.log('🌐 Network mode: direct HTTPS fetch.');
  }
}

function findInstalledProfilesDirectory() {
  try {
    const packageJson = require.resolve(
      '@webxr-input-profiles/assets/package.json',
    );
    return path.join(path.dirname(packageJson), 'dist', 'profiles');
  } catch {
    return undefined;
  }
}

function readInstalledProfile(profilesDirectory, relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(profilesDirectory, relativePath), 'utf8'),
  );
}

const installedProfilesDirectory = findInstalledProfilesDirectory();

// Check if we should skip fetching (file exists and --force/--refresh not passed)
if (!forceRefresh && fs.existsSync(OUTPUT_FILE)) {
  console.log(
    `✅ Input profiles already exist at ${OUTPUT_FILE}, skipping generation.`,
  );
  console.log(
    '   Use --force or --refresh to regenerate from the pinned assets.',
  );
  process.exit(0);
}

if (offline && !assetsDirectory && !installedProfilesDirectory) {
  console.error(
    `❌ Offline profile generation requested, but ${OUTPUT_FILE} does not exist.`,
  );
  console.error('   Run this command once with network access to create it.');
  process.exit(1);
}

function fetchJsonDirect(url, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsRemaining > 0
        ) {
          res.resume();
          const redirectedUrl = new URL(res.headers.location, url).toString();
          fetchJsonDirect(redirectedUrl, redirectsRemaining - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(`Request failed for ${url}: HTTP ${res.statusCode}`),
          );
          return;
        }

        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });

        res.on('error', (error) => {
          reject(error);
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function fetchJsonWithCurl(url) {
  const { stdout } = await execFileAsync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proxy',
      proxyUrl,
      url,
    ],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout);
}

async function fetchJson(url) {
  if (assetsDirectory) {
    const relativePath = url.slice(`${CDN_BASE_URL}/`.length);
    const basePath = path.resolve(assetsDirectory);
    const filePath = path.resolve(basePath, relativePath);
    if (!filePath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error(`Invalid profile path: ${relativePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  try {
    return proxyUrl ? await fetchJsonWithCurl(url) : await fetchJsonDirect(url);
  } catch (error) {
    const hint = proxyUrl
      ? 'Check that the proxy is reachable and that curl is available.'
      : 'If you are on a Linux dev server that requires a proxy, set HTTPS_PROXY/HTTP_PROXY or pass --proxy <url>.';
    throw new Error(`Failed to fetch ${url}. ${hint}`, { cause: error });
  }
}

async function generateInputProfiles() {
  try {
    let profilesList;
    if (installedProfilesDirectory) {
      console.log(
        `📦 Loading pinned input profiles from ${installedProfilesDirectory}`,
      );
      profilesList = readInstalledProfile(
        installedProfilesDirectory,
        'profilesList.json',
      );
    } else {
      explainNetworkMode();
      console.log('Fetching profiles list...');
      profilesList = await fetchJson(`${CDN_BASE_URL}/profilesList.json`);
    }

    const profilePaths = Object.values(profilesList).map(
      (profile) => profile.path,
    );
    const uniquePaths = [...new Set(profilePaths)]; // Remove duplicates

    console.log(
      `Found ${uniquePaths.length} unique profiles to ${installedProfilesDirectory ? 'load' : 'fetch'}...`,
    );

    // Fetch all profile data in parallel
    const profilePromises = uniquePaths.map(async (profilePath) => {
      const profileData = installedProfilesDirectory
        ? readInstalledProfile(installedProfilesDirectory, profilePath)
        : await fetchJson(`${CDN_BASE_URL}/${profilePath}`);
      return { path: profilePath, data: profileData };
    });

    const profiles = await Promise.all(profilePromises);

    // Generate TypeScript content
    let tsContent = `// This file is auto-generated. Do not edit manually.
// Generated from: ${installedProfilesDirectory ? PINNED_ASSETS_SOURCE : `${CDN_BASE_URL}/profilesList.json`}

`;

    // Add type definitions
    tsContent += `export interface ProfilesListItem {
  path: string;
  deprecated?: boolean;
}

export type ProfilesList = Record<string, ProfilesListItem>;

`;

    // Add profiles list
    tsContent += `export const PROFILES_LIST: ProfilesList = ${JSON.stringify(profilesList, null, 2)};

`;

    // Add profile data mappings
    tsContent += `export const PROFILE_DATA: Record<string, any> = {\n`;

    profiles.forEach(({ path, data }) => {
      tsContent += `  '${path}': ${JSON.stringify(data, null, 2)},\n`;
    });

    tsContent += `};

export function getProfile(profilePath: string): any {
  const profile = PROFILE_DATA[profilePath];
  if (!profile) {
    throw new Error(\`Profile not found: \${profilePath}\`);
  }
  return profile;
}

export function getProfilesList(): ProfilesList {
  return PROFILES_LIST;
}
`;

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the generated file
    fs.writeFileSync(OUTPUT_FILE, tsContent);

    console.log(`✅ Generated ${OUTPUT_FILE} with ${profiles.length} profiles`);
  } catch (error) {
    console.error('❌ Error generating input profiles:', error);
    if (error?.cause) {
      console.error('Caused by:', error.cause);
    }
    process.exit(1);
  }
}

generateInputProfiles();
