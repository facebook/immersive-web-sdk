# Troubleshooting

- No “Enter XR” button: ensure HTTPS; check sessionMode and browser support.
- Hand tracking not available: add `requiredFeatures: ['hand-tracking']`.
- Scene JSON 404: verify the file exists under `/public/scenes` and the `level` URL matches it.
- UI config 404: confirm UIKitML compiled JSON under `/public/ui`.
- Optimizer asset duplication: rely on plugin’s dependency blocking.
- Cryptic errors from `node_modules/.vite/deps/chunk-*.js` after an IWSDK
  update: stop the dev server, run `rm -rf node_modules/.vite/deps`, then start
  the dev server again so Vite rebuilds its dependency pre-bundle.
