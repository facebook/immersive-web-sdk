---
outline: [2, 4]
---

# Chapter 8: Build & Deploy

You've built an amazing WebXR experience! Now it's time to optimize and deploy it so others can experience your creation. This chapter shows you how to build for production and deploy to GitHub Pages.

## Production Build Process

Your starter app uses Vite to create a production build. When you run `npm run build`, it:

- Bundles and minifies your JavaScript/TypeScript code
- Generates a deployable static site in the `dist/` folder

## Building Your Project

Navigate to your project directory and run:

```bash
npm run build
```

This creates a `dist/` folder with your application. The build automatically:

- Bundles and minifies JavaScript
- Copies public assets

## Asset Optimization

Vite copies files from `public/` without rewriting them. Optimize large models and
textures in your asset-production pipeline before adding them to the project, then
verify their visual quality and download size in a production build.

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
    branches: ['main']

  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

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

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## What's Next?

Congratulations! You've completed the IWSDK getting-started tutorial and successfully built and deployed your first WebXR application. You've now experienced the complete end-to-end workflow of IWSDK development - from creating basic 3D scenes to implementing custom systems and deploying optimized applications.

Throughout this tutorial, you've learned how to:

- Set up IWSDK projects and load external assets
- Create professional environments with lighting and backgrounds
- Build interactive experiences with grabbing and locomotion
- Develop custom systems and components using ECS architecture
- Build and deploy IWSDK applications

You now have the foundation to create professional WebXR experiences with IWSDK!
