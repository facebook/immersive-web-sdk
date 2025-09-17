# @iwsdk/vite-plugin-metaspatial

A comprehensive Vite plugin suite for WebXR framework integration with Meta Spatial SDK. Provides two specialized plugins: component discovery with XML generation and automated GLXF/GLTF asset processing.

## Features

### Component Discovery (`discoverComponents`)

- 🔍 **Automatic Component Discovery** - Finds `createComponent()` calls in your codebase
- 📄 **XML Generation** - Generates Meta Spatial SDK compatible component definitions
- 🎯 **Enum Support** - Discovers and includes TypeScript enum definitions
- ⚡ **Fast & TypeSafe** - Built with TypeScript for optimal performance and safety
- 🔧 **Configurable** - Flexible options for different project structures

### GLXF Generation (`generateGLXF`)

- 🏗️ **Meta Spatial CLI Integration** - Automated export from Meta Spatial Editor projects
- 📦 **Asset Processing** - Intelligent GLTF/GLB dependency extraction and separation
- 👁️ **File Watching** - Real-time regeneration on Meta Spatial project changes
- 🚫 **Ignore Patterns** - Configurable regex-based file filtering
- 🔄 **Development & Build Support** - Works in both dev server and build modes

## Installation

```bash
pnpm add -D @iwsdk/vite-plugin-metaspatial
```

## Usage

### Both Plugins (Recommended)

Add both plugins to your `vite.config.js` for complete Meta Spatial integration:

```javascript
import { defineConfig } from 'vite';
import {
  discoverComponents,
  generateGLXF,
} from '@iwsdk/vite-plugin-metaspatial';

export default defineConfig({
  plugins: [
    // Component discovery for XML generation (runs during build)
    discoverComponents({
      outputDir: 'generated/components',
      packageName: 'com.your-project.components',
      verbose: true,
    }),

    // GLXF generation from Meta Spatial projects (runs in dev and build)
    generateGLXF({
      metaSpatialDir: 'metaspatial',
      outputDir: 'public/glxf',
      verbose: true,
      enableWatcher: true,
      ignorePattern: /components\//,
    }),
  ],
});
```

### Component Discovery Only

```javascript
import { defineConfig } from 'vite';
import { discoverComponents } from '@iwsdk/vite-plugin-metaspatial';

export default defineConfig({
  plugins: [
    discoverComponents({
      outputDir: 'generated/components',
      packageName: 'com.your-project.components',
      verbose: true,
    }),
  ],
});
```

### GLXF Generation Only

```javascript
import { defineConfig } from 'vite';
import { generateGLXF } from '@iwsdk/vite-plugin-metaspatial';

export default defineConfig({
  plugins: [
    generateGLXF({
      metaSpatialDir: 'metaspatial',
      outputDir: 'public/glxf',
      verbose: true,
      enableWatcher: true,
    }),
  ],
});
```

### Backward Compatibility

The legacy API is still supported for existing projects:

```javascript
import { componentDiscoveryXMLPlugin } from '@iwsdk/vite-plugin-metaspatial';
// This is equivalent to discoverComponents()
```

## Options

### Component Discovery Options (`discoverComponents`)

| Option          | Type       | Default                   | Description                                   |
| --------------- | ---------- | ------------------------- | --------------------------------------------- |
| `outputDir`     | `string`   | `'generated/components'`  | Directory to output XML files                 |
| `packageName`   | `string`   | `'com.elics.components'`  | Package name for XML schema                   |
| `include`       | `RegExp`   | `/\.(js\|ts\|jsx\|tsx)$/` | File patterns to include                      |
| `exclude`       | `RegExp`   | `/node_modules/`          | File patterns to exclude                      |
| `verbose`       | `boolean`  | `false`                   | Enable verbose logging                        |
| `enumScanPaths` | `string[]` | `[]`                      | Additional paths to scan for enum definitions |

### GLXF Generation Options (`generateGLXF`)

| Option               | Type      | Default                                                      | Description                                     |
| -------------------- | --------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `metaSpatialDir`     | `string`  | `'metaspatial'`                                              | Directory containing Meta Spatial project files |
| `outputDir`          | `string`  | `'public/glxf'`                                              | Directory to output generated GLXF files        |
| `watchDebounceMs`    | `number`  | `500`                                                        | Debounce time for file watcher (milliseconds)   |
| `formats`            | `array`   | `['glxf']`                                                   | Export formats to generate                      |
| `metaSpatialCliPath` | `string`  | `'/Applications/Meta Spatial Editor.app/Contents/MacOS/CLI'` | Path to Meta Spatial CLI executable             |
| `verbose`            | `boolean` | `false`                                                      | Enable verbose logging                          |
| `enableWatcher`      | `boolean` | `true`                                                       | Enable file watcher in development mode         |
| `ignorePattern`      | `RegExp`  | `/components\//`                                             | Regex pattern to ignore files/directories       |

## Component Discovery

The plugin automatically discovers components defined with `createComponent()`:

```javascript
export const MyComponent = createComponent(
  'MyComponent',
  {
    position: { type: Types.Vec3, default: [0, 0, 0] },
    enabled: { type: Types.Boolean, default: true },
  },
  'My custom component description',
);
```

Generates:

```xml
<ComponentSchema packageName="com.elics.components">
  <Component
    name="MyComponent"
    description="My custom component description"
  >
    <Vector3Attribute name="position" defaultValue="0f, 0f, 0f" />
    <BooleanAttribute name="enabled" defaultValue="true" />
  </Component>
</ComponentSchema>
```

## GLXF Generation

The `generateGLXF` plugin integrates with Meta Spatial Editor to automatically generate GLXF and GLTF assets from your Meta Spatial projects.

### How It Works

1. **Project Detection**: Scans the `metaSpatialDir` for `.metaspatial` project files
2. **CLI Integration**: Executes Meta Spatial CLI to export projects to GLXF format
3. **Asset Processing**: Extracts and processes GLTF/GLB dependencies
4. **File Separation**: Separates GLXF files from GLTF assets into different directories
5. **URI Updating**: Updates asset references to point to the new locations

### Directory Structure

```
your-project/
├── metaspatial/              # Meta Spatial project files
│   ├── Main.metaspatial     # Your scene file
│   ├── components/          # Generated component XMLs (ignored by default)
│   └── config.json          # Meta Spatial configuration
├── public/
│   ├── glxf/                # Generated GLXF files
│   │   └── Composition.glxf
│   └── gltf/
│       └── generated/       # Generated GLTF assets and dependencies
│           ├── model.gltf
│           ├── model.bin
│           └── texture.jpg
```

### Development Workflow

**Development Mode (`npm run dev`)**:

- ✅ Generates GLXF files immediately on server start
- ✅ Sets up file watcher for real-time regeneration
- ✅ Ignores files matching `ignorePattern` (e.g., `components/` folder)
- ✅ Provides verbose logging of all operations

**Build Mode (`npm run build`)**:

- ✅ Generates GLXF files during build process
- ✅ Ensures assets are ready for production deployment

### File Watching

The plugin watches for changes in your Meta Spatial directory and automatically regenerates assets:

```bash
📝 Meta Spatial file change: metaspatial/Main.metaspatial
🔄 Regenerating GLXF for 1 project(s) due to change
🚀 Executing Meta Spatial CLI export...
✅ GLXF regeneration completed (triggered by change)
```

Files matching the `ignorePattern` are ignored:

```bash
📝 Meta Spatial file change: metaspatial/components/MyComponent.xml
⏭️  Ignoring change for: metaspatial/components/MyComponent.xml (matches ignore pattern)
```

## Enum Support

The plugin automatically discovers TypeScript enums from multiple sources and includes them in component schemas:

### Auto-Discovery

The plugin automatically scans for enum definitions in:

- **`node_modules/@iwsdk/*`** - Framework packages
- **`node_modules/@elics/*`** - Framework packages
- **`../packages/*`** - Monorepo structures
- **`packages/*`** - Local packages
- **`src/*`** - Source directories

It looks for TypeScript files containing patterns like: `*enum*.ts`, `*type*.ts`, `*constant*.ts`, `*definition*.ts`

### Manual Configuration

You can also specify additional paths:

```typescript
enum EnvironmentType {
  STATIC = 'STATIC',
  KINEMATIC = 'KINEMATIC',
}

export const Environment = createComponent('Environment', {
  type: {
    type: Types.Enum,
    enum: EnvironmentType,
    default: EnvironmentType.STATIC,
  },
});
```

Generates:

```xml
<ComponentSchema packageName="com.elics.components">
  <Enum name="EnvironmentType">
    <EnumValue value="STATIC" />
    <EnumValue value="KINEMATIC" />
  </Enum>
  <Component name="Environment">
    <EnumAttribute name="type" defaultValue="STATIC" />
  </Component>
</ComponentSchema>
```

## Generated Files

XML files are generated during the build process and should be committed to version control. This ensures:

- ✅ Immediate compatibility with Meta Spatial SDK
- ✅ No build step required for designers/artists
- ✅ Consistent component definitions across teams

## TypeScript Support

The plugin is built with TypeScript and provides full type safety:

```typescript
import {
  discoverComponents,
  generateGLXF,
  type ComponentDiscoveryOptions,
  type GLXFGenerationOptions,
} from '@iwsdk/vite-plugin-metaspatial';

const componentOptions: ComponentDiscoveryOptions = {
  outputDir: 'generated/components',
  verbose: true,
};

const glxfOptions: GLXFGenerationOptions = {
  metaSpatialDir: 'metaspatial',
  outputDir: 'public/glxf',
  verbose: true,
  enableWatcher: true,
  ignorePattern: /components\//,
};
```

## Architecture

The plugin follows a modular architecture with clear separation of concerns:

### Component Discovery Module

```
src/discover-components/
├── index.ts          # Main plugin entry
├── types.ts          # Type definitions
├── ast-analyzer.ts   # AST parsing and analysis
├── enum-extractor.ts # Enum definition extraction
└── xml-generator.ts  # XML file generation
```

### GLXF Generation Module

```
src/generate-glxf/
├── index.ts          # Main plugin entry
├── types.ts          # Type definitions
├── cli-wrapper.ts    # Meta Spatial CLI integration
├── asset-processor.ts # GLTF/GLB asset processing
└── file-watcher.ts   # File watching and change handling
```

**Key Design Principles:**

- **Single Responsibility**: Each plugin handles one specific concern
- **Modular Structure**: Functionality is broken into logical modules
- **Clean Separation**: No shared dependencies between the two plugins
- **Testable Components**: Each module can be tested independently

## License

MIT
