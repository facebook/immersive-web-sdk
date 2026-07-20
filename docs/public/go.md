# IWSDK Agent Quickstart

Read the full IWSDK development skill before building an application:

- https://iwsdk.dev/skill.md

Use this file as a compact start-here index. The full skill is authoritative when a detail differs.

## Default Operating Model

- Prefer `npx iwsdk ...` CLI commands in cloud-based harnesses.
- Use MCP tools only when the harness exposes them and they are already working.
- Build from the official scaffold instead of hand-rolling project setup.
- Verify visually with managed-browser screenshots and runtime inspection.

## Scaffold

```bash
# VR game
npx @iwsdk/create@0.4.2 my-iwsdk-app --yes --mode vr --physics --grabbing

# AR app
npx @iwsdk/create@0.4.2 my-ar-app --yes --mode ar --physics --scene-understanding

# Browser-first 3D app
npx @iwsdk/create@0.4.2 my-browser-app --yes --no-xr --physics
```

Choose flags based on the requested experience. For browser-first apps, add browser locomotion and camera controls in application code when needed.

## Run

```bash
cd my-iwsdk-app
npm install
npm run dev
```

The starter `npm run dev` uses the IWSDK CLI-managed runtime. Treat the reported runtime URL and `npx iwsdk dev status` as the source of truth.

```bash
npx iwsdk dev status
npx iwsdk browser screenshot
npx iwsdk xr status
```

## Inspect And Debug

```bash
npx iwsdk scene hierarchy --maxDepth 3
npx iwsdk ecs components
npx iwsdk ecs systems
npx iwsdk ecs snapshot --label before
npx iwsdk ecs step --count 1
npx iwsdk ecs snapshot --label after
npx iwsdk ecs diff --from before --to after
```

For declarative scene composition, prefer the native editor tools when the MCP
runtime exposes them: `scene_list_assets`, `scene_add_node`,
`scene_set_transform`, `scene_place_on`, `scene_look_at`, `scene_set_camera`,
`scene_screenshot`, `scene_compare_screenshots`, `scene_validate`, and
`scene_save`. Use current/top/front/side or quarter screenshots before saving
when alignment or on-surface placement matters; use `scene_screenshot` with
`{"view":"orbit","orbitStep":N}` for deterministic orbit angles.

For XR interactions:

```bash
npx iwsdk xr enter
npx iwsdk xr get-transform --device controller-right
npx iwsdk xr set-transform --device controller-right --position '{"x":0.3,"y":1.2,"z":-0.5}'
npx iwsdk xr select --device controller-right
```

## Key Docs

- AI overview: https://iwsdk.dev/ai/
- Runtime-first workflows: https://iwsdk.dev/ai/workflows.html
- MCP tools reference: https://iwsdk.dev/ai/mcp-tools.html
- Project setup: https://iwsdk.dev/guides/01-project-setup.html
- Browser-first systems: https://iwsdk.dev/guides/16-browser-first-systems.html
- Examples: https://iwsdk.dev/examples/
- API reference: https://iwsdk.dev/api/
- LLM discovery index: https://iwsdk.dev/llms.txt
