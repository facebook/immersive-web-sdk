/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const EDITOR_SHELL_CSS = String.raw`      html,
      body {
        height: 100%;
        margin: 0;
        min-height: 100%;
        background: #101013;
        color: #ededed;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        overflow: hidden;
      }

      #root {
        box-sizing: border-box;
        height: 100vh;
        min-height: 100vh;
      }

      .editor-loading {
        align-items: center;
        background:
          radial-gradient(circle at 50% 42%, rgba(76, 104, 126, 0.14), transparent 30%),
          #101013;
        box-sizing: border-box;
        display: flex;
        height: 100%;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
        width: 100%;
      }

      .editor-loading-overlay {
        inset: 0;
        min-height: 0;
        position: absolute;
        z-index: 25;
      }

      .editor-loading-content {
        align-items: center;
        display: flex;
        flex-direction: column;
        width: min(280px, calc(100vw - 48px));
      }

      .editor-loading-spinner {
        animation: editor-loading-spin 900ms linear infinite;
        border: 2px solid rgba(255, 255, 255, 0.14);
        border-radius: 50%;
        border-top-color: #8cb7d6;
        box-sizing: border-box;
        height: 28px;
        margin-bottom: 16px;
        width: 28px;
      }

      .editor-loading h1 {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0;
      }

      .editor-loading p {
        color: #a8a8ad;
        font-size: 11px;
        line-height: 1.4;
        margin: 6px 0 14px;
      }

      .editor-loading-track {
        background: rgba(255, 255, 255, 0.09);
        border-radius: 2px;
        height: 2px;
        overflow: hidden;
        width: 100%;
      }

      .editor-loading-progress {
        background: #8cb7d6;
        border-radius: inherit;
        display: block;
        height: 100%;
        min-width: 8px;
        transition: width 180ms ease-out;
      }

      .editor-loading-progress-indeterminate {
        animation: editor-loading-indeterminate 1.1s ease-in-out infinite;
        min-width: 0;
        width: 35%;
      }

      @keyframes editor-loading-spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes editor-loading-indeterminate {
        0% {
          transform: translateX(-110%);
        }
        100% {
          transform: translateX(300%);
        }
      }

      .workspace-shell {
        background: #101013;
        height: 100vh;
        overflow: hidden;
        position: relative;
        width: 100vw;
      }

      .workspace-runtime-frame,
      .workspace-editor-pane {
        border: 0;
        bottom: 0;
        box-sizing: border-box;
        height: 100%;
        position: absolute;
        top: 0;
        width: 100%;
      }

      .workspace-runtime-frame {
        background: #101013;
        left: 0;
        z-index: 1;
      }

      .workspace-editor-pane {
        left: 0;
        min-width: 0;
        overflow: hidden;
        z-index: 2;
      }

      .workspace-view-switcher {
        align-items: center;
        background: rgba(32, 32, 36, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        display: flex;
        gap: 1px;
        padding: 2px;
        position: absolute;
        right: 8px;
        top: 6px;
        z-index: 30;
      }

      .workspace-view-switcher button {
        background: transparent;
        border: 0;
        border-radius: 3px;
        color: #cfcfd4;
        cursor: pointer;
        font: 11px/1.2 inherit;
        height: 22px;
        padding: 0 8px;
      }

      .workspace-view-switcher button:hover,
      .workspace-view-switcher button[data-active] {
        background: #4a4a50;
        color: #ffffff;
      }

      .workspace-view-switcher .workspace-reload-button {
        align-items: center;
        display: flex;
        justify-content: center;
        margin-left: 2px;
        padding: 0;
        width: 24px;
      }

      .workspace-view-switcher .workspace-reload-button .lucide-icon {
        height: 13px;
        stroke-width: 1.8;
        width: 13px;
      }

      html[data-iwsdk-workspace-view="editor"] .workspace-runtime-frame {
        display: none;
      }

      html[data-iwsdk-workspace-view="runtime"] .workspace-editor-pane {
        display: none;
      }

      .scene-picker-dialog {
        align-items: center;
        background: rgba(16, 16, 19, 0.92);
        bottom: 0;
        display: flex;
        justify-content: center;
        left: 0;
        padding: 24px;
        position: absolute;
        right: 0;
        top: 0;
        z-index: 25;
      }

      .scene-picker-card {
        background: #2e2e32;
        border: 1px solid #46464c;
        border-radius: 4px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        color: #ededed;
        max-height: min(560px, calc(100vh - 80px));
        overflow: auto;
        padding: 14px;
        width: min(520px, calc(100vw - 48px));
      }

      .scene-picker-header {
        border-bottom: 1px solid #3c3c42;
        margin-bottom: 10px;
        padding-bottom: 10px;
      }

      .scene-picker-header p {
        color: #b8b8bd;
        font-size: 12px;
        margin: 4px 0 0;
      }

      .scene-picker-list {
        display: grid;
        gap: 4px;
        margin-bottom: 12px;
      }

      .scene-picker-list button,
      .scene-picker-create button {
        background: #3d3d43;
        border: 1px solid #515159;
        border-radius: 3px;
        color: #f5f5f7;
        cursor: pointer;
        font: 12px/1.2 inherit;
      }

      .scene-picker-list button {
        min-height: 28px;
        padding: 0 8px;
        text-align: left;
      }

      .scene-picker-list button:hover,
      .scene-picker-create button:hover {
        background: #4a4a52;
      }

      .scene-picker-empty {
        color: #a8a8ad;
        font-size: 12px;
        padding: 8px 0;
      }

      .scene-picker-create {
        display: grid;
        gap: 6px;
        grid-template-columns: 1fr auto;
      }

      .scene-picker-create input {
        background: #202024;
        border: 1px solid #4a4a50;
        border-radius: 3px;
        box-sizing: border-box;
        color: #ededed;
        font: 12px/1.2 inherit;
        height: 30px;
        min-width: 0;
        padding: 0 8px;
      }

      .scene-picker-create button {
        height: 30px;
        padding: 0 10px;
      }

      .editor-shell {
        --bottom-panel-h: 210px;
        --left-panel-w: 250px;
        --right-panel-w: 300px;
        --titlebar-h: 0px;
        --toolbar-h: 30px;
        background: #19191c;
        height: 100vh;
        min-height: 0;
        overflow: hidden;
        position: relative;
        width: 100%;
      }

      .editor-state-readouts {
        clip: rect(0, 0, 0, 0);
        height: 1px;
        overflow: hidden;
        position: absolute;
        width: 1px;
      }

      h1 {
        color: #ededed;
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 6px;
      }

      h2 {
        color: #b8b8bd;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0;
        margin: 0;
        text-transform: uppercase;
      }

      .editor-panel {
        background: #2e2e32;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        box-sizing: border-box;
        bottom: 0;
        color: #dedee3;
        display: flex;
        flex-direction: column;
        min-width: 220px;
        overflow: auto;
        padding: 0;
        position: absolute;
        scrollbar-color: #3d3d3f transparent;
        scrollbar-width: thin;
        top: var(--titlebar-h);
        z-index: 5;
      }

      .editor-panel-left {
        border-right: 1px solid #19191c;
        bottom: var(--bottom-panel-h);
        left: 0;
        overflow: hidden;
        width: var(--left-panel-w);
      }

      .editor-panel-right {
        border-left: 1px solid #19191c;
        right: 0;
        width: var(--right-panel-w);
      }

      .panel-section {
        border-bottom: 1px solid #232327;
        min-height: 0;
      }

      .scene-graph-section {
        display: flex;
        flex-direction: column;
        flex: 1 1 180px;
        min-height: 100px;
        overflow: hidden;
      }

      #outliner {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        scrollbar-color: #3d3d3f transparent;
        scrollbar-width: thin;
      }

      .scene-graph-footer {
        border-top: 1px solid #303035;
        flex: 0 0 auto;
        padding: 6px 0 5px;
      }

      .scene-add-entity-button {
        margin-bottom: 0;
      }

      .panel-section-header {
        align-items: center;
        background: #3a383c;
        border-bottom: 1px solid #242428;
        display: flex;
        min-height: 22px;
        padding: 0 6px;
      }

      .panel-control-row {
        padding: 6px 8px;
      }

      #dirty-status {
        color: #a6a6ac;
        font-size: 11px;
        margin: 0;
      }

      #dirty-status[data-state="dirty"] {
        color: #2d7ff9;
      }

      .editor-viewport {
        height: 100%;
        inset: 0;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
        position: absolute;
        width: 100%;
      }

      .editor-toolbar {
        align-items: center;
        background: #2a2a2e;
        border: 0;
        border-bottom: 1px solid #1d1d20;
        border-radius: 0;
        box-shadow: none;
        box-sizing: border-box;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        left: var(--left-panel-w);
        min-height: var(--toolbar-h);
        padding: 3px 6px;
        position: absolute;
        right: var(--right-panel-w);
        top: var(--titlebar-h);
        z-index: 4;
      }

      .toolbar-group {
        align-items: center;
        border-left: 1px solid #414146;
        display: flex;
        gap: 2px;
        margin-left: 2px;
        padding-left: 6px;
      }

      .toolbar-group:first-child {
        border-left: 0;
        margin-left: 0;
        padding-left: 0;
      }

      #transform-toolbar {
        border-left: 0;
        margin-left: 0;
        padding-left: 0;
      }

      .viewport-distance-control {
        align-items: center;
        display: flex;
        gap: 4px;
        white-space: nowrap;
      }

      .viewport-distance-control > span {
        color: #8d8d94;
        font-size: 10px;
      }

      .viewport-distance-control input {
        height: 24px;
        min-height: 24px;
        text-align: right;
        width: 68px;
      }

      .editor-slot:empty {
        display: none !important;
      }

      .toolbar-slot {
        align-items: center;
        display: flex;
        gap: 2px;
      }

      .editor-contribution-button {
        gap: 4px;
        min-width: 24px;
        padding: 0 7px;
      }

      .editor-contribution-button span {
        max-width: 96px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      button {
        background: #3b3b40;
        border: 1px solid #4a4a50;
        border-radius: 4px;
        color: #ededed;
        cursor: pointer;
        font: 500 12px Inter, ui-sans-serif, system-ui, sans-serif;
        min-height: 22px;
        padding: 0 8px;
      }

      .icon-button {
        align-items: center;
        display: inline-flex;
        justify-content: center;
        min-width: 24px;
        padding: 0;
      }

      .lucide-icon {
        height: 15px;
        pointer-events: none;
        width: 15px;
      }

      .sr-only {
        clip: rect(0, 0, 0, 0);
        border: 0;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        padding: 0;
        position: absolute;
        white-space: nowrap;
        width: 1px;
      }

      button:hover {
        background: #2a2a2d;
      }

      button[data-active] {
        background: rgba(45, 127, 249, 0.18);
        border-color: #2d7ff9;
        color: #ffffff;
      }

      #scene-viewport {
        inset: 0;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
        position: absolute;
      }

      #scene-viewport canvas {
        display: block;
        height: 100%;
        width: 100%;
      }

      .viewport-overlay-slot {
        display: grid;
        gap: 6px;
        left: calc(var(--left-panel-w) + 8px);
        max-width: 240px;
        pointer-events: none;
        position: absolute;
        top: calc(var(--titlebar-h) + var(--toolbar-h) + 8px);
        z-index: 3;
      }

      #orientation-gizmo {
        height: 112px;
        pointer-events: none;
        position: absolute;
        right: calc(var(--right-panel-w) + 10px);
        top: calc(var(--titlebar-h) + var(--toolbar-h) + 8px);
        width: 112px;
        z-index: 6;
      }

      #orientation-gizmo .orientation-gizmo-widget {
        cursor: grab;
        pointer-events: auto;
      }

      #orientation-gizmo .orientation-gizmo-visual {
        display: block;
        height: 100%;
        overflow: visible;
        pointer-events: none;
        width: 100%;
      }

      #orientation-gizmo .orientation-gizmo-widget:active {
        cursor: grabbing;
      }

      .editor-contribution-card,
      .editor-contribution-bottom {
        background: rgba(31, 31, 34, 0.9);
        border: 1px solid rgba(72, 72, 78, 0.72);
        border-radius: 4px;
        box-sizing: border-box;
        color: #dedee3;
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 6px 8px;
      }

      .sidebar-slot {
        display: grid;
        gap: 4px;
        padding: 6px;
      }

      .inspector-slot {
        display: grid;
        gap: 0;
      }

      .editor-contribution-title {
        align-items: center;
        color: #eeeeef;
        display: flex;
        font-size: 12px;
        font-weight: 600;
        gap: 5px;
        min-width: 0;
      }

      .editor-contribution-title span,
      .editor-contribution-body {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .editor-contribution-body {
        color: #a8a8ae;
        font-size: 11px;
        line-height: 15px;
      }

      .editor-contribution-section .editor-contribution-body {
        padding: 0 8px 8px;
      }

      .editor-contribution-bottom {
        grid-template-columns: minmax(90px, 0.5fr) minmax(0, 1fr);
        min-height: 30px;
      }

      .editor-contribution-bottom strong,
      .editor-contribution-bottom span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .editor-bottom-panel {
        background: #252529;
        border: 0;
        border-radius: 0;
        border-top: 1px solid #19191c;
        bottom: 0;
        box-shadow: none;
        box-sizing: border-box;
        color: #ededed;
        display: grid;
        grid-template-rows: 26px minmax(0, 1fr);
        height: var(--bottom-panel-h);
        left: 0;
        overflow: hidden;
        position: absolute;
        right: var(--right-panel-w);
        z-index: 4;
      }

      .bottom-panel-tabs {
        align-items: center;
        border-bottom: 1px solid #36363b;
        display: flex;
        gap: 2px;
        padding: 3px 4px;
      }

      .bottom-panel-tabs button {
        background: transparent;
        border: 0;
        color: #9c9c9c;
        min-height: 21px;
        padding: 0 8px;
      }

      .bottom-panel-tabs button[data-active] {
        background: rgba(45, 127, 249, 0.18);
        color: #ffffff;
      }

      .bottom-panel-content {
        min-height: 0;
        overflow: auto;
        padding: 6px;
        scrollbar-color: #3d3d3f transparent;
        scrollbar-width: thin;
      }

      .editor-bottom-panel[data-active-tab="assets"] .bottom-panel-content {
        display: none;
      }

      .diagnostics-list {
        display: grid;
        gap: 6px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .diagnostics-list li {
        align-items: center;
        background: rgba(22, 22, 24, 0.74);
        border: 1px solid rgba(61, 61, 63, 0.55);
        border-radius: 8px;
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(52px, 0.45fr) minmax(0, 1.4fr) minmax(72px, 0.7fr);
        min-height: 28px;
        padding: 4px 8px;
      }

      .diagnostics-list li[data-state="error"],
      .diagnostics-list li[data-state="failed"] {
        border-color: rgba(243, 151, 143, 0.55);
      }

      .diagnostics-list li[data-state="loaded"],
      .diagnostics-list li[data-state="info"] {
        border-color: rgba(79, 224, 176, 0.28);
      }

      .diagnostics-list li[data-validation-node-id] {
        cursor: pointer;
      }

      .diagnostics-list li[data-validation-node-id]:hover {
        background: rgba(45, 45, 50, 0.9);
      }

      .diagnostics-list strong,
      .diagnostics-list span,
      .diagnostics-list em {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .diagnostics-list strong {
        color: #ededed;
        font-size: 12px;
      }

      .diagnostics-list span,
      .diagnostics-list em {
        color: #9c9c9c;
        font:
          11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        font-style: normal;
      }

      .diagnostics-list li[data-diagnostic-validation] span {
        white-space: normal;
      }

      .diagnostic-fix {
        color: #c5c5cb;
        display: block;
        font-size: 10px;
        line-height: 14px;
        margin-top: 2px;
      }

      #editor-status-strip {
        align-items: center;
        background: #202024;
        border: 0;
        border-top: 1px solid #303035;
        bottom: var(--bottom-panel-h);
        border-radius: 0;
        box-shadow: none;
        box-sizing: border-box;
        color: #ededed;
        display: block;
        font:
          11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        gap: 10px;
        line-height: 18px;
        left: var(--left-panel-w);
        min-height: 26px;
        overflow: hidden;
        padding: 4px 12px;
        position: absolute;
        right: var(--right-panel-w);
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        z-index: 4;
      }

      #editor-status-strip[data-state="dirty"] {
        color: #2d7ff9;
      }

      .asset-row,
      .node-row {
        background: transparent;
        border: 0;
        border-radius: 0;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 4px;
        justify-content: flex-start;
        min-height: 20px;
        margin: 0;
        overflow-wrap: anywhere;
        padding: 0 6px 0 calc(6px + var(--depth, 0) * 14px);
        text-align: left;
        width: 100%;
      }

      .asset-library-section {
        display: none;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .editor-bottom-panel[data-active-tab="assets"] .asset-library-section {
        display: flex;
      }

      .asset-library-project {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .asset-library-project {
        flex: 1 1 auto;
      }

      .asset-browser-controls {
        align-items: center;
        display: grid;
        gap: 5px;
        grid-template-columns: minmax(0, 1fr) 24px;
      }

      .asset-browser-controls .icon-button {
        height: 24px;
        min-height: 24px;
        min-width: 24px;
        padding: 4px;
        width: 24px;
      }

      #asset-catalog {
        display: grid;
        gap: 6px;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        min-height: 0;
        overflow: auto;
        padding: 0 6px 6px;
        scrollbar-color: #3d3d3f transparent;
        scrollbar-width: thin;
      }

      .asset-catalog-row {
        align-items: center;
        background: transparent;
        border: 0;
        box-sizing: border-box;
        color: #d8d8de;
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) 24px;
        grid-template-rows: 78px auto;
        min-height: 110px;
        padding: 5px;
        position: relative;
        width: 100%;
      }

      .asset-catalog-row:hover {
        background: #35353a;
      }

      .asset-catalog-thumb {
        align-items: center;
        background:
          linear-gradient(135deg, rgba(45, 127, 249, 0.22), transparent 58%),
          #252529;
        border: 1px solid #4a4a50;
        border-radius: 4px;
        display: inline-flex;
        grid-column: 1 / -1;
        height: 78px;
        justify-content: center;
        overflow: hidden;
        width: 100%;
      }

      .asset-catalog-thumb img {
        display: block;
        height: 100%;
        object-fit: cover;
        width: 100%;
      }

      [data-asset-kind="uikitml"] .asset-catalog-thumb img {
        object-fit: contain;
      }

      [data-asset-kind="uikitml"] .asset-catalog-thumb {
        background: transparent;
      }

      .asset-catalog-thumb .lucide-icon {
        color: #b9cfff;
        height: 14px;
        width: 14px;
      }

      .asset-catalog-main {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      .asset-catalog-name,
      .asset-catalog-meta {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .asset-catalog-name {
        color: #ededed;
        font-size: 11px;
        font-weight: 600;
        line-height: 14px;
      }

      .asset-catalog-meta {
        color: #8f8f96;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        line-height: 12px;
      }

      .asset-add-button {
        align-self: center;
        background: transparent;
        border-color: transparent;
      }

      .asset-catalog-row:hover .asset-add-button {
        background: #3f3f44;
        border-color: #53535a;
      }

      #scene-graph-filter {
        margin: 0;
      }

      .scene-root-drop-target {
        color: #c4c4ca;
        cursor: default;
        font-size: 11px;
      }

      .builtin-node-row {
        cursor: pointer;
      }

      .node-row-built-in {
        border: 1px solid #4b4b52;
        border-radius: 3px;
        color: #92929a;
        flex: 0 0 auto;
        font-size: 9px;
        line-height: 13px;
        padding: 0 4px;
      }

      .builtin-node-row[data-active] .node-row-built-in {
        border-color: #806f3d;
        color: #ded4b8;
      }

      .scene-root-drop-target[data-drop-active="true"],
      .node-row[data-drop-active="true"] {
        background: rgba(245, 180, 64, 0.16);
        outline: 1px solid rgba(245, 180, 64, 0.65);
        outline-offset: -1px;
      }

      .node-row:hover {
        background: #3a3a3f;
      }

      .node-row[data-active] {
        background: #5a4d2a;
        box-shadow: inset 2px 0 #d6a21f;
        color: #ffffff;
      }

      .node-row[data-preview-hidden] .node-row-main {
        opacity: 0.48;
      }

      .node-row[data-preview-locked] .node-row-id {
        color: #b8b8be;
      }

      .node-row-caret,
      .node-row-icon {
        align-items: center;
        color: #96969d;
        display: inline-flex;
        flex: 0 0 14px;
        justify-content: center;
        width: 14px;
      }

      .node-row-caret[data-outliner-disclosure],
      .node-row-caret[data-scene-root-disclosure] {
        border-radius: 3px;
        cursor: pointer;
        height: 18px;
      }

      .node-row-caret[data-outliner-disclosure]:hover,
      .node-row-caret[data-scene-root-disclosure]:hover {
        background: #4a4a50;
        color: #ededed;
      }

      .node-row-caret[data-scene-root-disclosure]:focus-visible {
        outline: 1px solid #7aa7ef;
        outline-offset: 1px;
      }

      .node-row-main {
        align-items: baseline;
        display: flex;
        flex: 1 1 auto;
        gap: 5px;
        min-width: 0;
      }

      .node-row-id {
        color: inherit;
        font-size: 12px;
        line-height: 14px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-row-subtitle {
        color: #8d8d94;
        font-size: 10px;
        line-height: 12px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .node-row-meta {
        background: #3d3d42;
        border: 1px solid #515158;
        border-radius: 3px;
        color: #cacad0;
        flex: 0 0 auto;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        line-height: 14px;
        min-width: 14px;
        padding: 0 4px;
        text-align: center;
      }

      .node-row-preview-state {
        align-items: center;
        color: #aaaab1;
        display: inline-flex;
        flex: 0 0 auto;
        gap: 2px;
      }

      .node-row-visibility {
        align-items: center;
        border-radius: 3px;
        color: #8f8f96;
        display: inline-flex;
        flex: 0 0 18px;
        height: 18px;
        justify-content: center;
        opacity: 0;
        width: 18px;
      }

      .node-row:hover .node-row-visibility,
      .node-row[data-preview-hidden] .node-row-visibility {
        opacity: 1;
      }

      .node-row-visibility:hover {
        background: #4a4a50;
        color: #ededed;
      }

      .node-row-visibility .lucide-icon {
        height: 13px;
        width: 13px;
      }

      .node-row-preview-state .lucide-icon {
        height: 12px;
        width: 12px;
      }

      .scene-graph-context-menu {
        background: #2e2e32;
        border: 1px solid #505057;
        border-radius: 6px;
        box-shadow:
          0 18px 48px rgba(0, 0, 0, 0.44),
          0 1px 0 rgba(255, 255, 255, 0.04) inset;
        box-sizing: border-box;
        display: grid;
        min-width: 208px;
        padding: 5px;
        position: fixed;
        z-index: 40;
      }

      .scene-graph-context-menu[hidden] {
        display: none;
      }

      .context-menu-label {
        color: #d8d8dc;
        font-size: 11px;
        font-weight: 600;
        overflow: hidden;
        padding: 5px 7px 7px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .context-menu-group {
        border-top: 1px solid #44444a;
        display: grid;
        gap: 1px;
        padding-top: 4px;
      }

      .scene-graph-context-menu button {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 3px;
        color: #d4d4d8;
        display: flex;
        font-weight: 400;
        justify-content: flex-start;
        min-height: 26px;
        padding: 0 7px;
        text-align: left;
        width: 100%;
      }

      .scene-graph-context-menu button:hover {
        background: #414147;
        color: #ffffff;
      }

      .scene-graph-context-menu button:focus-visible {
        outline: 1px solid #7aa7ef;
        outline-offset: -1px;
      }

      .scene-graph-context-menu button:disabled {
        background: transparent;
        color: #707077;
        cursor: default;
      }

      .scene-graph-context-menu button[data-destructive] {
        color: #f3978f;
      }

      .scene-graph-context-menu button[data-destructive]:hover {
        background: rgba(243, 151, 143, 0.14);
        color: #ffaaa3;
      }

      .inspector-title {
        color: #ededed;
        font-size: 12px;
        font-weight: 600;
        margin: 7px 8px 5px;
        overflow-wrap: anywhere;
      }

      .inspector-title-edit {
        appearance: none;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        box-sizing: border-box;
        cursor: text;
        display: block;
        font:
          12px system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
        font-weight: 600;
        line-height: 18px;
        min-height: 22px;
        overflow: hidden;
        padding: 1px 4px;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: calc(100% - 16px);
      }

      .inspector-title-edit:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: #3b3b41;
      }

      .inspector-title-edit:focus {
        background: #222226;
        border-color: #89b4fa;
        outline: none;
      }

      .inspector-built-in-note {
        color: #8f8f96;
        font-size: 10px;
        margin: -3px 8px 7px;
      }

      .inspector-section {
        border-top: 1px solid #232327;
        margin: 0;
        padding: 0;
      }

      .inspector-section:first-of-type {
        border-top: 0;
      }

      .inspector-section summary {
        align-items: center;
        color: #b8b8bd;
        cursor: pointer;
        display: grid;
        font-size: 10px;
        font-weight: 700;
        grid-template-columns: minmax(0, 1fr) minmax(0, 50%);
        letter-spacing: 0;
        list-style: none;
        margin: 0;
        min-height: 24px;
        padding: 0 8px;
        text-transform: uppercase;
      }

      .inspector-section summary::-webkit-details-marker {
        display: none;
      }

      .inspector-section-title {
        align-items: center;
        display: inline-flex;
        gap: 5px;
        min-width: 0;
      }

      .inspector-section-chevron {
        align-items: center;
        color: #8f8f96;
        display: inline-flex;
        flex: 0 0 auto;
        height: 14px;
        justify-content: center;
        transition: transform 120ms ease;
        width: 14px;
      }

      .inspector-section-chevron .lucide-icon {
        height: 13px;
        width: 13px;
      }

      .inspector-section:not([open]) .inspector-section-chevron {
        transform: rotate(-90deg);
      }

      .inspector-section-title span:last-child {
        color: #b8b8bd;
        font-weight: 700;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .inspector-section-meta {
        color: #8f8f96;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        font-weight: 400;
        text-align: right;
      }

      .transform-editor {
        display: grid;
        gap: 4px;
        padding: 0 8px 6px;
      }

      .visibility-editor {
        display: grid;
        padding: 0 8px 8px;
      }

      .transform-row {
        align-items: center;
        background: #27272b;
        border: 1px solid #3b3b41;
        border-radius: 4px;
        display: grid;
        gap: 4px;
        grid-template-columns: 56px repeat(3, minmax(0, 1fr)) 24px;
        min-height: 30px;
        padding: 4px;
      }

      .transform-row-label {
        color: #a6a6ac;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .transform-reset-button {
        align-self: end;
        background: transparent;
        border: 0;
        color: #9c9c9c;
        min-height: 22px;
        min-width: 22px;
        width: 22px;
      }

      .transform-reset-button:hover {
        background: rgba(137, 180, 250, 0.16);
        color: #89b4fa;
      }

      .transform-reset-button .lucide-icon {
        height: 13px;
        width: 13px;
      }

      label {
        color: #aaaab0;
        display: grid;
        font-size: 11px;
        gap: 2px;
      }

      input,
      select {
        background: #222226;
        border: 1px solid #494950;
        border-radius: 4px;
        box-sizing: border-box;
        color: #ededed;
        font:
          11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        min-height: 22px;
        min-width: 0;
        padding: 0 6px;
        width: 100%;
      }

      input[type="number"] {
        appearance: textfield;
        -moz-appearance: textfield;
      }

      input[type="number"]::-webkit-inner-spin-button,
      input[type="number"]::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
        -webkit-appearance: none;
      }

      #transform-editor-message {
        color: #4fe0b0;
        font-size: 11px;
        min-height: 14px;
        padding: 0 8px;
      }

      #transform-editor-message:empty {
        display: none;
      }

      #transform-editor-message.transform-editor-error {
        color: #f3978f;
      }

      .identity-editor {
        padding-top: 0;
      }

      .inspector-title + .identity-editor {
        border-top: 0;
        padding-top: 0;
      }

      .multi-selection-list {
        background: #27272b;
        border: 1px solid #3e3e44;
        border-radius: 4px;
        display: grid;
        gap: 4px;
        margin: 0 8px 7px;
        max-height: 112px;
        overflow: auto;
        padding: 5px;
      }

      .multi-selection-list code {
        color: #dedee3;
        font:
          11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .asset-inspector-card {
        background: #27272b;
        border: 1px solid #3e3e44;
        border-radius: 4px;
        display: grid;
        gap: 6px;
        margin: 0 8px 7px;
        padding: 5px;
      }

      .asset-reference-row {
        align-items: center;
        display: grid;
        gap: 6px;
        grid-template-columns: 58px minmax(0, 1fr);
      }

      .asset-reference-row span {
        color: #a6a6ac;
        font-size: 11px;
      }

      .asset-inspector-warning {
        color: #f3978f;
        font-size: 11px;
      }

      .component-editor[open] {
        padding-bottom: 6px;
      }

      .component-row {
        background: #27272b;
        border: 1px solid #3e3e44;
        border-radius: 4px;
        display: grid;
        gap: 5px;
        margin: 0 8px 6px;
        padding: 5px;
      }

      .component-row-header {
        align-items: start;
        display: grid;
        gap: 6px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-width: 0;
      }

      .component-row-title {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      .component-row-header strong {
        color: #eeeeef;
        font-size: 12px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .component-row-title > span {
        color: #8f8f96;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .component-remove-button {
        align-self: start;
        background: transparent;
        border: 0;
        color: #9c9c9c;
        min-height: 20px;
        min-width: 20px;
        width: 20px;
      }

      .component-remove-button:hover {
        background: rgba(243, 151, 143, 0.16);
        color: #f3978f;
      }

      .component-remove-button .lucide-icon {
        height: 13px;
        width: 13px;
      }

      .component-field-row {
        align-items: center;
        display: grid;
        gap: 4px;
        grid-template-columns: minmax(100px, 0.8fr) minmax(110px, 1.2fr);
        min-width: 0;
      }

      .component-field-label {
        color: #a6a6ac;
        font-size: 11px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .component-color-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .component-color-row input[type="color"] {
        cursor: pointer;
        height: 26px;
        min-height: 26px;
        padding: 2px;
        width: 44px;
      }

      .component-vector-field {
        display: grid;
        gap: 4px;
        grid-template-columns: repeat(
          var(--component-vector-count, 3),
          minmax(0, 1fr)
        );
        min-width: 0;
      }

      .component-vector-field[data-component-vector-count="4"] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .component-axis-field {
        align-items: center;
        display: grid;
        gap: 3px;
        grid-template-columns: 10px minmax(0, 1fr);
        min-width: 0;
      }

      .component-axis-field span {
        color: #8f8f96;
        font:
          9px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        text-align: center;
      }

      .component-boolean-row {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .component-boolean-row input {
        justify-self: end;
        width: auto;
      }

      .component-object-row {
        align-items: stretch;
        grid-template-columns: minmax(0, 1fr);
      }

      .component-file-control {
        display: grid;
        gap: 4px;
        grid-template-columns: minmax(0, 1fr) 26px;
        min-width: 0;
      }

      .component-field-row[data-field-invalid="true"] input,
      .component-entity-control[data-field-invalid="true"] {
        background: rgba(125, 40, 40, 0.2);
        border-color: #b65f59;
        box-shadow: inset 0 0 0 1px rgba(182, 95, 89, 0.18);
      }

      .component-field-warning {
        color: #e28b84;
        font-size: 10px;
        grid-column: 2;
        line-height: 13px;
      }

      .component-entity-control {
        align-items: center;
        background: #222226;
        border: 1px solid #494950;
        border-radius: 4px;
        box-sizing: border-box;
        color: #ededed;
        display: grid;
        font:
          11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        gap: 5px;
        grid-template-columns: 16px minmax(0, 1fr) auto;
        min-height: 26px;
        min-width: 0;
        padding: 2px 3px 2px 6px;
      }

      .component-entity-control[data-drop-active="true"] {
        background: rgba(245, 180, 64, 0.16);
        border-color: rgba(245, 180, 64, 0.8);
        box-shadow: inset 0 0 0 1px rgba(245, 180, 64, 0.24);
      }

      .component-entity-icon {
        color: #9c9ca3;
        display: inline-flex;
      }

      .component-entity-icon .lucide-icon {
        height: 13px;
        width: 13px;
      }

      .component-entity-value {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .component-entity-clear-button {
        background: transparent;
        border: 0;
        min-height: 20px;
        min-width: 20px;
        width: 20px;
      }

      .component-entity-clear-button .lucide-icon {
        height: 12px;
        width: 12px;
      }

      .component-file-browse-button {
        min-height: 26px;
        min-width: 26px;
        padding: 0;
        width: 26px;
      }

      .component-file-browse-button .lucide-icon {
        height: 14px;
        width: 14px;
      }

      .component-row textarea {
        background: #222226;
        border: 1px solid #494950;
        border-radius: 4px;
        box-sizing: border-box;
        color: #ededed;
        font:
          12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", monospace;
        min-width: 0;
        resize: vertical;
        width: 100%;
      }

      .component-add-button {
        align-items: center;
        display: inline-flex;
        gap: 5px;
        justify-content: center;
        margin: 0 8px 1px;
        width: calc(100% - 16px);
      }

      .component-picker-dialog {
        background: transparent;
        border: 0;
        color: #ededed;
        max-height: calc(100vh - 64px);
        max-width: calc(100vw - 64px);
        padding: 0;
        width: min(480px, calc(100vw - 64px));
      }

      .component-picker-dialog::backdrop {
        background: rgba(12, 12, 14, 0.7);
      }

      .component-picker-card {
        background: #2e2e32;
        border: 1px solid #505057;
        border-radius: 4px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
        box-sizing: border-box;
        display: grid;
        gap: 10px;
        max-height: calc(100vh - 64px);
        padding: 12px;
      }

      .component-picker-header {
        align-items: center;
        display: flex;
        justify-content: space-between;
      }

      .component-picker-header h3 {
        font-size: 14px;
        margin: 0;
      }

      #component-picker-search,
      .component-file-picker-search {
        box-sizing: border-box;
        margin: 0;
        width: 100%;
      }

      .component-picker-card > span {
        color: #8f8f96;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
      }

      .component-picker-list {
        display: grid;
        gap: 3px;
        max-height: min(420px, calc(100vh - 180px));
        overflow-y: auto;
      }

      .component-picker-option {
        align-items: start;
        background: #35353a;
        border: 1px solid transparent;
        border-radius: 3px;
        display: grid;
        gap: 2px;
        justify-items: start;
        min-height: 44px;
        padding: 6px 8px;
        text-align: left;
        width: 100%;
      }

      .component-picker-option:hover,
      .component-picker-option:focus-visible {
        background: #414147;
        border-color: #62626a;
      }

      .component-picker-option[data-selected="true"] {
        border-color: #74747d;
      }

      .component-picker-option strong {
        color: #f1f1f3;
        font-size: 12px;
      }

      .component-picker-option span {
        color: #a7a7ad;
        font:
          10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
          Consolas, monospace;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
      }

      .component-picker-empty {
        color: #a7a7ad;
        font-size: 12px;
        padding: 12px 4px;
        text-align: center;
      }

      .component-picker-empty[hidden],
      .component-picker-option[hidden] {
        display: none;
      }

      #component-editor-message {
        color: #4fe0b0;
        font-size: 12px;
        min-height: 16px;
        padding: 0 8px;
      }

      #component-editor-message:empty {
        display: none;
      }

      #component-editor-message.component-editor-error {
        color: #f3978f;
      }

      .empty-state {
        color: #9c9c9c;
        font-size: 12px;
        margin: 8px;
      }

      .scene-conflict-dialog {
        align-items: center;
        background: rgba(12, 12, 14, 0.54);
        bottom: 0;
        display: flex;
        justify-content: center;
        left: 0;
        padding: 24px;
        pointer-events: auto;
        position: fixed;
        right: 0;
        top: 0;
        z-index: 100;
      }

      .scene-conflict-card {
        background: #242428;
        border: 1px solid #60524a;
        border-radius: 6px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
        color: #ededed;
        max-width: 440px;
        padding: 16px;
      }

      .scene-conflict-card h2 {
        color: #f0c36b;
        font-size: 13px;
        letter-spacing: 0;
        margin: 0 0 8px;
      }

      .scene-conflict-card p {
        color: #c9c9cc;
        font-size: 12px;
        line-height: 1.4;
        margin: 0 0 12px;
      }

      .scene-conflict-card dl {
        display: grid;
        gap: 5px 10px;
        grid-template-columns: max-content minmax(0, 1fr);
        margin: 0 0 14px;
      }

      .scene-conflict-card dt {
        color: #9f9fa5;
        font-size: 11px;
      }

      .scene-conflict-card dd {
        color: #dedee3;
        font:
          11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", monospace;
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .scene-conflict-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      pre {
        background: #202024;
        border-top: 1px solid #303035;
        color: #aaaab0;
        font-size: 11px;
        margin: 8px 0 0;
        max-height: 220px;
        overflow: auto;
        padding: 8px;
        white-space: pre-wrap;
      }

      @media (max-width: 720px) {
        .workspace-view-switcher {
          right: 4px;
          top: 4px;
        }

        .workspace-view-switcher button {
          padding: 0 5px;
        }

        .editor-shell {
          --bottom-panel-h: 0px;
          --left-panel-w: 0px;
          --right-panel-w: 0px;
          --toolbar-h: 34px;
        }

        .editor-toolbar {
          flex-wrap: nowrap;
          left: 0;
          overflow-x: auto;
          right: 0;
        }

        .editor-panel {
          bottom: 0;
          min-width: 0;
          top: 58%;
          width: 50%;
        }

        .editor-panel-left {
          left: 0;
        }

        .editor-panel-right {
          right: 0;
        }

        .editor-bottom-panel {
          display: none;
        }

        #editor-status-strip {
          bottom: 42%;
          left: 0;
          right: 0;
        }

        .viewport-overlay-slot {
          left: 8px;
          max-width: min(220px, calc(100vw - 104px));
        }

        #orientation-gizmo {
          height: 80px;
          right: 8px;
          width: 80px;
        }

      }
`;
