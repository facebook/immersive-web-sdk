---
layout: doc
title: Examples
---

<!--
  Copyright (c) Meta Platforms, Inc. and affiliates.

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const examples = [
  { id: 'audio', name: 'Audio' },
  { id: 'environment-raycast', name: 'Environment Raycast' },
  { id: 'grab', name: 'Grab Interactions' },
  { id: 'locomotion', name: 'Locomotion' },
  { id: 'physics', name: 'Physics' },
  { id: 'scene-understanding', name: 'Scene Understanding' },
  { id: 'depth-occlusion', name: 'Depth Occlusion' }
];

const selectedExample = ref('');

function getHashId() {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash;
  if (hash) {
    const id = hash.slice(1);
    if (examples.find(e => e.id === id)) {
      return id;
    }
  }
  return '';
}

function handleHashChange() {
  const id = getHashId();
  selectedExample.value = id;
}

function getExampleName(id) {
  const example = examples.find(e => e.id === id);
  return example ? example.name : id;
}

onMounted(() => {
  // Add class to body for CSS targeting
  document.body.classList.add('examples-page');

  // Set initial value from hash
  selectedExample.value = getHashId();

  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);

  // Also listen for clicks on sidebar links (VitePress may prevent hashchange)
  const handleClick = (e) => {
    const target = e.target.closest('a[href*="#"]');
    if (target) {
      const href = target.getAttribute('href');
      if (href && href.startsWith('/examples/#')) {
        // Small delay to let URL update
        setTimeout(() => {
          const id = getHashId();
          if (id && id !== selectedExample.value) {
            selectedExample.value = id;
          }
        }, 10);
      }
    }
  };
  document.addEventListener('click', handleClick);
  window._examplesClickHandler = handleClick;

  // Hide the doc footer
  const footer = document.querySelector('.vp-doc-footer');
  if (footer) footer.style.display = 'none';

  // Adjust content area to take full height
  const content = document.querySelector('.vp-doc');
  if (content) {
    content.style.height = 'calc(100vh - var(--vp-nav-height))';
    content.style.overflow = 'hidden';
    content.style.padding = '0';
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    // Remove class from body
    document.body.classList.remove('examples-page');

    window.removeEventListener('hashchange', handleHashChange);
    if (window._examplesClickHandler) {
      document.removeEventListener('click', window._examplesClickHandler);
    }
  }
});
</script>

<div class="examples-container">
  <div v-if="!selectedExample" class="example-placeholder">
    <h2>Welcome to IWSDK Examples</h2>
    <p>Select an example from the sidebar to view it in action.</p>
    <p><a href="/guides/01b-minimal-scene">Start with the minimal commented scene walkthrough.</a></p>
    <p class="note">Note: WebXR features require HTTPS and may need user interaction to start.</p>
  </div>
  <iframe
    v-else
    :key="selectedExample"
    :src="`/examples/${selectedExample}/`"
    :title="`${getExampleName(selectedExample)} Example`"
    class="example-iframe"
    allow="xr; xr-spatial-tracking; accelerometer; gyroscope; camera; microphone;"
  />
</div>

<style>
.examples-container {
  width: 100%;
  height: calc(100vh - var(--vp-nav-height));
  background: var(--vp-c-bg);
  overflow: hidden;
}

.example-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px;
  text-align: center;
  color: var(--vp-c-text-2);
}

.example-placeholder h2 {
  margin: 0 0 16px 0;
  color: var(--vp-c-text-1);
}

.example-placeholder .note {
  margin-top: 24px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  font-size: 0.9rem;
}

.example-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
