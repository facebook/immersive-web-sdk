#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CDN_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles';
const OUTPUT_FILE = path.join(
  __dirname,
  '../src/gamepad/generated-profiles.ts',
);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
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

function toCamelCase(str) {
  return str
    .replace(/[-\/]/g, ' ')
    .replace(/\.json$/, '')
    .split(' ')
    .map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

async function generateInputProfiles() {
  try {
    console.log('Fetching profiles list...');
    const profilesList = await fetchJson(`${CDN_BASE_URL}/profilesList.json`);

    const profilePaths = Object.values(profilesList).map(
      (profile) => profile.path,
    );
    const uniquePaths = [...new Set(profilePaths)]; // Remove duplicates

    console.log(`Found ${uniquePaths.length} unique profiles to fetch...`);

    // Fetch all profile data in parallel
    const profilePromises = uniquePaths.map(async (profilePath) => {
      const profileUrl = `${CDN_BASE_URL}/${profilePath}`;
      const profileData = await fetchJson(profileUrl);
      return { path: profilePath, data: profileData };
    });

    const profiles = await Promise.all(profilePromises);

    // Generate TypeScript content
    let tsContent = `// This file is auto-generated. Do not edit manually.
// Generated from: ${CDN_BASE_URL}/profilesList.json
// Generated at: ${new Date().toISOString()}

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
    process.exit(1);
  }
}

generateInputProfiles();
