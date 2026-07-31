# IWSDK Locomotion Example

This is the official locomotion example project for the WebXR Framework, designed for optimal developer, designer, and tech artist workflow.

## 📁 Project Structure

```
locomotion/
├── src/                    # Source code
│   ├── index.js           # Main application entry point
│   ├── settings.js        # Settings configuration
│   ├── test-component.js  # Example component
├── public/                # Static assets served at root
│   ├── textures/          # Images and texture files
│   ├── audio/             # Audio files
│   └── ui/                # Runtime-loaded UIKitML files
├── dist/                 # Build output (generated)
├── index.html           # Main HTML file
├── vite.config.js       # Vite configuration
└── package.json         # Project dependencies
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20.19.0+ and pnpm
- HTTPS support for WebXR development

### Installation

```bash
cd locomotion
pnpm install
```

### Development

```bash
# Start development server with HTTPS
pnpm dev

# Build for production
pnpm build

# Preview production build locally
pnpm preview
```

The development server will start on the HTTPS local URL reported by Vite or `npx iwsdk dev status` (typically `https://localhost:5173/` when that port is free).

## 📦 Asset Organization

### WebXR-Optimized Asset Handling

This example uses Vite's `public/` directory for local texture/audio assets and
the shared `@iwsdk/example-assets` catalog for reusable GLTF assets since they
are:

- Loaded at runtime via URLs (not imported as modules)
- Large files that shouldn't be bundled or processed
- Need direct URL access for asset loaders

### Assets Directory Structure

- **`/iwsdk-assets/environment-desk/`** - shared environment GLTF served by the catalog plugin
- **`public/textures/`** - Images, textures, and visual assets (.png, .jpg, etc.)
- **`public/audio/`** - Sound effects and music files

### Asset Usage

```javascript
// Reference public assets and shared catalog assets using root-relative paths.
const assets = {
  model: {
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    type: AssetType.GLTF,
  },
  texture: { url: '/textures/my-texture.png', type: AssetType.Texture },
};
```

## 🌐 WebXR Development

### HTTPS Requirements

WebXR requires HTTPS for all features to work properly. This example includes:

- Automatic HTTPS certificate generation via `vite-plugin-mkcert`
- Self-signed certificates for local development
- Proper CORS configuration for asset loading

### Testing on Devices

```bash
# Find your local IP
ipconfig getifaddr en0  # macOS
# or
hostname -I             # Linux

# Access from VR headset
https://YOUR_LOCAL_IP:<PORT>
```

## 🛠 Customization

### Vite Configuration

The `vite.config.js` file includes:

- HTTPS development server setup
- Static asset copying configuration
- Build optimization settings
- Asset handling rules

### Adding New Assets

1. Add reusable GLTF assets to `@iwsdk/example-assets` when they are shared across examples, or place one-off assets in the appropriate `public/` subdirectory.
2. Reference them in your code using root-relative paths such as `/iwsdk-assets/<asset-id>/<file>` or `/textures/model.png`.
3. Assets are automatically served by Vite during development and copied to build output

## 📋 Scripts

- **`pnpm dev`** - Start development server with HMR and HTTPS
- **`pnpm build`** - Build for production
- **`pnpm preview`** - Preview production build locally

## 🔗 Integration

This example is designed to work seamlessly with:

- **Native scene JSON** for declarative environment setup
- **WebXR browsers** for VR/AR development
- **Framework tools** for component generation
- **Asset pipelines** for 3D content creation

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.
