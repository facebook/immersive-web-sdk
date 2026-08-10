---
outline: [2, 4]
---

# Chapter 10: Spatial UI with UIKitML

This chapter teaches you how to create immersive spatial user interfaces using [pmndrs/uikit](https://pmndrs.github.io/uikit/docs/), specifically uikitml – IWSDK's spatial UI system.

## What You'll Learn

By the end of this chapter, you'll be able to:

- Understand spatial UI design principles
- Create UI layouts using UIKitML markup
- Position and scale interfaces in 3D space
- Handle user interactions with spatial UI elements
- Implement common UI patterns for WebXR

## Spatial UI Principles

Great spatial interfaces follow these principles:

1. **World-scale**: UI elements have a physical presence in 3D space
2. **Natural interaction**: Use pointing, grabbing, and gestures
3. **Readable at distance**: Text and icons scale appropriately
4. **Contextual placement**: UI appears near relevant objects
5. **Comfortable viewing**: Positioned to avoid neck strain

## Introduction to Building Spatial User Interfaces in IWSDK

The unavailability of HTML in WebXR has been a big challenge for developers, since manually placing user interface elements is very cumbersome. IWSDK uses [pmndrs/uikit](https://pmndrs.github.io/uikit/docs/), a GPU-accelerated UI rendering system with familiar HTML and CSS concepts, together with [`@drawcall/uikitml`](https://www.npmjs.com/package/@drawcall/uikitml) for strict declarative authoring. IWSDK fetches and parses `.uikitml` source directly at runtime, so the file you edit is the file the application loads.

### Key Features

- **Declarative markup**: Describe UI structure, not implementation
- **3D layout system**: Flexbox-like layouts in 3D space
- **Component Kits**: Pre-built buttons, panels, sliders, etc.
- **Event system**: Handle clicks, hovers, and other interactions
- **Theming support**: Consistent styling across your application

### Basic Syntax

UIKitML uses HTML-style markup with CSS properties for styling and layouting:

```html
<!-- Basic panel with text -->
<div class="panel" style="width: 400; height: 300; background-color: #2a2a2a">
  <h1 style="font-size: 24px; color: white">Hello WebXR!</h1>
  <button>Click Me</button>
</div>
```

## Setting Up UIKitML with IWSDK

### Direct Runtime Assets

Put UIKitML files under `public/ui`. Vite serves and ships these files like
other public assets; no UIKitML Vite plugin or generated JSON is required.

### Creating Your First UIKitML File

Create `public/ui/main-menu.uikitml` and insert the following content, which uses Horizon and Lucide components included by IWSDK:

```html
<style>
  .panel-root {
    padding: 16px;
    flex-direction: column;
    width: 344px;
  }
</style>
<Panel class="panel-root">
  <button id="xr-button">
    <ButtonIcon>
      <LogIn />
    </ButtonIcon>
    Enter XR
  </button>
</Panel>
```

### Loading UI in Your Application

We can add our `panelWithButton` uikitml user interface to our IWSDK scene using the `PanelUI` and `PanelDocument` components:

```typescript
export class PanelSystem extends createSystem({
  panelWithButton: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/main-menu.uikitml')],
  },
}) {}
```

### Loading a TTF Font

Declare runtime fonts inside the UIKitML file. Relative URLs are resolved from
that file's location:

```html
<style>
  @font-face {
    font-family: 'Brand Sans';
    src: url('./fonts/BrandSans-Regular.ttf');
    font-weight: 400;
  }

  .title {
    font-family: 'Brand Sans';
    font-weight: 400;
  }
</style>

<h1 class="title">Spatial UI</h1>
```

For `public/ui/main-menu.uikitml`, this example loads
`public/ui/fonts/BrandSans-Regular.ttf`.

IWSDK's bundled font atlases cover their packaged character set, not every
Unicode script or emoji. Production builds warn once per UIKitML file when
literal text contains uncovered glyphs, including each glyph's code point and
first source element. UIKitML does not fall back to an operating-system font:
include a licensed TTF with the required glyphs, declare it with `@font-face`,
and apply that family to the affected element. For mixed scripts, use separate
elements and assign an appropriate custom family to each script. A declared
TTF's internal glyph coverage is checked by the font loader at runtime, so
confirm the warning's listed code points are present in that file.

### Component Kits

Component sets provide pre-built UI components like buttons, panels, inputs, and icons. IWSDK's default `horizon` kit includes Horizon components and Lucide icons; applications do not import those packages individually.

#### Available Component Kits

- **`horizon`** - HTML-like elements, Lucide icons, and Horizon components such as `Panel` and `Button` (default)
- **`default`** - HTML-like elements and Lucide icons

#### Basic Kit Configuration

Enable spatial UI with the default Horizon collection:

```typescript
World.create(document.getElementById('scene-container'), {
  features: {
    spatialUI: true,
  },
});
```

#### Custom Component Sets

Pass typed custom component definitions when an application needs its own tags:

```typescript
World.create(document.getElementById('scene-container'), {
  features: {
    spatialUI: {
      kit: 'horizon',
      componentSets: [applicationComponents],
    },
  },
});
```

## Color Scheme & Theming

UIKitML supports automatic light and dark mode theming that can follow system preferences or be explicitly set.

### Configuring Color Scheme

Set the preferred color scheme when creating your world:

```typescript
import { ColorSchemeType } from '@iwsdk/core';

World.create(document.getElementById('scene-container'), {
  features: {
    spatialUI: {
      preferredColorScheme: ColorSchemeType.Dark, // Force dark mode
    },
  },
});
```

**Available color schemes:**

- `ColorSchemeType.System` - Automatically follows browser/OS preference (default)
- `ColorSchemeType.Light` - Force light mode
- `ColorSchemeType.Dark` - Force dark mode

### Changing Color Scheme at Runtime

You can dynamically change the color scheme after initialization:

```typescript
const world = await World.create(container, {
  /* ... */
});
const panelSystem = world.getSystem(PanelUISystem);

// Switch to light mode
panelSystem.config.preferredColorScheme.value = ColorSchemeType.Light;

// Switch to dark mode
panelSystem.config.preferredColorScheme.value = ColorSchemeType.Dark;

// Follow system preference
panelSystem.config.preferredColorScheme.value = ColorSchemeType.System;
```

### Dark Mode Styling

Use the `:dark` pseudo-selector to define styles that apply only in dark mode:

```html
<style>
  .heading {
    color: #272727; /* Light mode color */
    font-size: 24px;
    font-weight: 700;
  }

  .heading:dark {
    color: rgba(255, 255, 255, 0.9); /* Dark mode color */
  }

  .panel {
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
  }

  .panel:dark {
    background-color: #1a1a1a;
    border: 1px solid #333333;
  }
</style>

<Panel class="panel">
  <span class="heading">Hello, Immersive Web!</span>
</Panel>
```

The UI automatically updates when the color scheme changes, with no additional code needed.

## Overview of Properties and Features Available for Building Spatial User Interfaces

When authoring a User Interface with IWSDK, developers can use almost all the features they know and love from HTML.
The following section shows all the available element types and styling methods for designing Spatial User Interfaces.

### Element Types

#### Container Elements

Most HTML elements become containers that can hold children and text.

```html
<div>Layout container</div>
<p>Paragraph text</p>
<h1>Main heading</h1>
<button>Click me</button>
<ul>
  <li>List item</li>
</ul>
```

#### Image Elements

Display bitmap images in your 3D UI.

```html
<img src="photo.jpg" alt="Description" />
<img src="icon.png" class="avatar" />
<img src="icon.svg" />
```

**Required:** `src` attribute

#### Inline SVG Elements

Embed SVG markup directly in your UI.

```html
<svg viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="blue" />
  <rect x="10" y="10" width="30" height="30" fill="red" />
</svg>
```

**Content:** Raw SVG markup is preserved and rendered

#### Video Elements

Display video content with standard HTML5 video attributes.

```html
<video src="movie.mp4" controls autoplay /> <video src="demo.webm" loop muted />
```

**Required:** `src` attribute
**Supports:** All standard HTML5 video attributes

#### Input Elements

Create interactive input fields for user data.

```html
<input type="text" placeholder="Enter your name" />
<input type="email" value="user@example.com" />
<textarea placeholder="Multi-line text input">Default content</textarea>
```

#### Component Kits

In addition to these elements, developers can also use the installed kits.

```html
<button id="xr-button">
  <ButtonIcon>
    <LogIn />
  </ButtonIcon>
  Enter XR
</button>
```

## Styling System

### Inline Styles

Use familiar CSS properties with kebab-casing directly on elements:

```html
<div style="background-color: blue; padding: 20px; border-radius: 8px;">
  Styled container
</div>
```

### CSS Classes

Define reusable styles with full pseudo-selector support using the `<style>` tag:

```html
<style>
  .button {
    background-color: #3b82f6;
    color: white;
    padding-top: 12px;
    padding-right: 24px;
    padding-bottom: 12px;
    padding-left: 24px;
    border-radius: 6px;
    cursor: pointer;
  }

  .button:hover {
    background-color: #2563eb;
    transform: scale(1.05);
  }

  .button:active {
    background-color: #1d4ed8;
    transform: scale(0.95);
  }

  /* Responsive styles */
  .button:sm {
    padding-top: 8px;
    padding-right: 16px;
    padding-bottom: 8px;
    padding-left: 16px;
    font-size: 14px;
  }

  .button:lg {
    padding-top: 16px;
    padding-right: 32px;
    padding-bottom: 16px;
    padding-left: 32px;
    font-size: 18px;
  }
</style>

<button class="button">Interactive Button</button>
```

**Supported selectors:**

- **States:** `:hover`, `:active`, `:focus`
- **Theme:** `:dark` - Applies styles in dark mode
- **Responsive:** `:sm`, `:md`, `:lg`, `:xl`, `:2xl`

### ID-Based Styling

Style specific elements using ID selectors:

```html
<style>
  #header {
    background-color: #ff6b6b;
    padding: 20px;
    justify-content: center;
  }

  #header:hover {
    opacity: 0.9;
  }
</style>

<div id="header">
  <h1>Welcome to uikitml</h1>
</div>
```

## Handling User Interactions

UIKitML provides an event system for handling user interactions:

```typescript
export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', '/ui/main-menu.uikitml')],
  },
}) {
  init() {
    this.queries.welcomePanel.subscribe('qualify', (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      const xrButton = document.getElementById('xr-button') as UIKit.Text;
      xrButton.addEventListener('click', () => {
        // TODO: add your interactivity here
      });
    });
  }
}
```

## Troubleshooting

### UI Not Appearing

**UI document loads but nothing shows?**

- Check that the position is in front of the player
- Verify the scale is appropriate (try 0.001 for pixel-based layouts)
- Ensure UISystem is registered with the world
- Ensure your elements have a color different then their background

### Interaction Issues

**Clicks not working?**

- Verify event listeners are attached to the UI element
- Check if anything is blocking the UI

### Layout Issues

**Elements not positioning correctly?**

- Check `flexDirection` and alignment properties
- Verify the parent container has appropriate dimensions
- Use the UIKitML VSCode extension to understand the size and position of individual elements by hovering over them
