---
outline: [2, 4]
---

# Chapter 8: Build & Deploy

You've built an amazing WebXR experience! Now it's time to optimize and deploy it so others can experience your creation. This chapter shows you how to build for production and deploy to GitHub Pages.

## Production Build Process

Your starter app is already configured with Vite plugins that automatically optimize assets during build. When you run `npm run build`, it:

- Bundles and minifies your JavaScript/TypeScript code
- Compresses GLTF models with Draco and optimizes textures
- Generates a deployable static site in the `dist/` folder

## Building Your Project

Navigate to your project directory and run:

```bash
npm run build
```

This creates a `dist/` folder with your optimized application. The build automatically:

- Compresses your GLTF models using Draco compression
- Optimizes textures with KTX2 compression (when available)
- Bundles and minifies JavaScript
- Copies public assets

## Asset Optimization

Your starter app includes the `@iwsdk/vite-plugin-gltf-optimizer` plugin that automatically compresses GLTF models and textures during build.

### Current Configuration

In your `vite.config.ts`, you can see the optimizer is already configured:

```typescript
import { optimizeGLTF } from '@iwsdk/vite-plugin-gltf-optimizer';

export default defineConfig({
  plugins: [
    // ... other plugins
    optimizeGLTF({
      level: 'medium',
    }),
  ],
});
```

### Optimization Levels

The plugin offers three preset levels:

- **`light`**: Fast build, moderate compression
- **`medium`**: Balanced build time and compression
- **`aggressive`**: Slower build, maximum compression

### KTX2 Compression Requirements

The optimizer uses KTX2 compression by default for better texture compression. If you don't have KTX-Software installed, you'll see this warning:

```
⚠️  KTX-Software not found (missing "ktx" CLI). Skipping KTX2 compression.
   Install from: https://github.com/KhronosGroup/KTX-Software/releases
```

The build won't crash - it will fall back to standard texture optimization, but installing KTX-Software gives you better compression results. Download and install it from the [KTX-Software releases page](https://github.com/KhronosGroup/KTX-Software/releases) for optimal texture compression.

### Advanced Configuration

For more control, you can customize specific options:

```typescript
optimizeGLTF({
  level: 'medium',
  verbose: true, // Show optimization details
  geometry: {
    compress: 'draco', // Draco compression
    quality: 0.8, // Higher = better quality, larger size
  },
  textures: {
    mode: 'auto', // Automatic texture compression
    quality: 0.75, // Texture compression quality
    maxSize: 1024, // Maximum texture resolution
  },
});
```

During build, you'll see optimization results showing significant file size reductions for your GLTF models and textures.

## Deploying to GitHub Pages

GitHub Pages provides free hosting perfect for WebXR applications.

### Step 1: Configure Base Path

Update your `vite.config.ts` to set the correct base path:

```typescript
export default defineConfig({
  base: '/your-repository-name/', // Must match your GitHub repo name
  // ... rest of your existing config
});
```

### Step 2: Manual Deployment

Install the gh-pages tool and deploy:

```bash
# Install deployment tool
npm install -D gh-pages

# Build and deploy
npm run build
npx gh-pages -d dist
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. **Settings** → **Pages**
3. Source: "Deploy from a branch"
4. Select `gh-pages` branch
5. **Save**

Your app will be live at: `https://yourusername.github.io/your-repository-name/`

### Automated Deployment with GitHub Actions

For automatic deployment on every push, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v4
        if: github.ref == 'refs/heads/main'
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

## What's Next?

Congratulations! You've completed the IWSDK getting-started tutorial and successfully built and deployed your first WebXR application. You've now experienced the complete end-to-end workflow of IWSDK development - from creating basic 3D scenes to implementing custom systems and deploying optimized applications.

Throughout this tutorial, you've learned how to:

- Set up IWSDK projects and load external assets
- Create professional environments with lighting and backgrounds
- Build interactive experiences with grabbing and locomotion
- Develop custom systems and components using ECS architecture
- Build and deploy optimized WebXR applications

For developers ready to dive deeper into advanced IWSDK development, continue with:

- **Chapter 9**: Advanced Topics - Explore physics simulation, scene understanding, and performance optimization
- **Chapter 10**: Production Patterns - Learn enterprise-level development practices, testing strategies, and deployment pipelines

You now have the foundation to create professional WebXR experiences with IWSDK!
