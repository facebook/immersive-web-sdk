/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitepress';

function loadTypedocSidebar() {
  try {
    const p = path.resolve(__dirname, '../api/typedoc-sidebar.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (_) {}
  return [];
}

export default defineConfig({
  // Build static site even if some cross-package API links are unresolved in early builds
  ignoreDeadLinks: true,
  lang: 'en-US',
  title: 'Immersive Web SDK',
  description:
    'WebXR framework with ECS, input, locomotion, spatial UI, and tools.',

  head: [
    [
      'script',
      {
        async: '',
        src: 'https://www.googletagmanager.com/gtag/js?id=G-V03QDNGKY3',
      },
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-V03QDNGKY3');`,
    ],
  ],

  themeConfig: {
    logo: {
      light: '/logo-light.svg',
      dark: '/logo-dark.svg',
    },

    nav: [
      { text: 'Guides', link: '/guides/01-project-setup' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'API', link: '/api/' },
      {
        text: `v0.1.0`,
        items: [
          { text: 'NPM', link: 'https://www.npmjs.com/package/@iwsdk/core' },
          {
            text: 'License',
            link: 'https://github.com/facebook/immersive-web-sdk/blob/main/LICENSE',
          },
        ],
      },
    ],

    sidebar: {
      '/guides/': [
        {
          text: 'Getting Started',
          items: [
            {
              text: 'Overview',
              link: '/guides/overview',
            },
            {
              text: '01 · Project Setup',
              link: '/guides/01-project-setup',
            },
            {
              text: '02 · Testing Experience',
              link: '/guides/02-testing-experience',
            },
            {
              text: '03 · Working in 3D',
              link: '/guides/03-working-in-3d',
            },
            {
              text: '04 · External Assets',
              link: '/guides/04-external-assets',
            },
            {
              text: '05 · Environment & Lighting',
              link: '/guides/05-environment-lighting',
            },
            {
              text: '06 · Built-in Interactions',
              link: '/guides/06-built-in-interactions',
            },
            {
              text: '07 · Custom Systems',
              link: '/guides/07-custom-systems',
            },
            {
              text: '08 · Build & Deploy',
              link: '/guides/08-build-deploy',
            },
          ],
        },
        {
          text: 'Advanced Guides',
          items: [
            {
              text: '09 · Meta Spatial Editor',
              link: '/guides/09-meta-spatial-editor',
            },
            {
              text: '10 · Spatial UI with UIKitML',
              link: '/guides/10-spatial-ui-uikitml',
            },
            {
              text: '11 · Scene Understanding',
              link: '/guides/11-scene-understanding',
            },
            {
              text: '12 · Physics',
              link: '/guides/12-physics',
            },
          ],
        },
      ],
      '/concepts/': [
        {
          text: 'ECS',
          link: '/concepts/ecs/',
          items: [
            { text: 'World', link: '/concepts/ecs/world' },
            { text: 'Entity', link: '/concepts/ecs/entity' },
            { text: 'Component', link: '/concepts/ecs/components' },
            { text: 'System', link: '/concepts/ecs/systems' },
            { text: 'Queries', link: '/concepts/ecs/queries' },
            { text: 'Lifecycle', link: '/concepts/ecs/lifecycle' },
            { text: 'Patterns & Tips', link: '/concepts/ecs/patterns' },
            { text: 'Architecture', link: '/concepts/ecs/architecture' },
          ],
        },
        {
          text: 'Three.js Basics',
          link: '/concepts/three-basics/',
          items: [
            {
              text: 'Interop: ECS ↔ Three.js',
              link: '/concepts/three-basics/interop-ecs-three',
            },
            {
              text: 'Transforms & 3D Math',
              link: '/concepts/three-basics/transforms-math',
            },
            {
              text: 'Meshes, Geometry & Materials',
              link: '/concepts/three-basics/meshes-geometry-materials',
            },
          ],
        },
        {
          text: 'XR Input',
          link: '/concepts/xr-input/',
          items: [
            { text: 'Input Visuals', link: '/concepts/xr-input/input-visuals' },
            { text: 'Pointers', link: '/concepts/xr-input/pointers' },
            {
              text: 'Stateful Gamepad',
              link: '/concepts/xr-input/stateful-gamepad',
            },
            { text: 'XR Origin', link: '/concepts/xr-input/xr-origin' },
          ],
        },
        {
          text: 'Spatial UI',
          link: '/concepts/spatial-ui/',
          items: [
            { text: 'UIKit', link: '/concepts/spatial-ui/uikit' },
            { text: 'UIKitML', link: '/concepts/spatial-ui/uikitml' },
            {
              text: 'UIKitDocument',
              link: '/concepts/spatial-ui/uikit-document',
            },
            { text: 'Flow', link: '/concepts/spatial-ui/flow' },
          ],
        },
        {
          text: 'Locomotion',
          link: '/concepts/locomotion/',
          items: [
            { text: 'Slide', link: '/concepts/locomotion/slide' },
            { text: 'Teleport', link: '/concepts/locomotion/teleport' },
            { text: 'Turn', link: '/concepts/locomotion/turn' },
            { text: 'Performance', link: '/concepts/locomotion/performance' },
          ],
        },
        {
          text: 'Grabbing',
          link: '/concepts/grabbing/',
          items: [
            {
              text: 'Interaction Types',
              link: '/concepts/grabbing/interaction-types',
            },
            {
              text: 'Distance Grabbing',
              link: '/concepts/grabbing/distance-grabbing',
            },
          ],
        },
      ],
      '/api/': loadTypedocSidebar(),
    },

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/facebook/immersive-web-sdk' },
    ],

    footer: {
      copyright: 'MIT License | Copyright © Meta Platforms, Inc',
    },
  },
});
