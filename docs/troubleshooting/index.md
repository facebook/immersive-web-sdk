# Troubleshooting

- No “Enter XR” button: ensure HTTPS; check sessionMode and browser support.
- Hand tracking not available: add `requiredFeatures: ['hand-tracking']`.
- GLXF not found: verify generateGLXF outputs to `/public/glxf`.
- UI config 404: confirm UIKitML compiled JSON under `/public/ui`.
- Optimizer asset duplication: rely on plugin’s dependency blocking.
