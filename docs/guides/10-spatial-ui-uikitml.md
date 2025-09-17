# Chapter 10: Spatial UI with UIKitML (Bonus)

Traditional 2D interfaces don't work well in 3D space. Users expect spatial interfaces that feel natural in VR and AR environments. This bonus chapter teaches you how to create immersive spatial user interfaces using UIKitML - IWSDK's spatial UI system.

## What You'll Learn

By the end of this chapter, you'll be able to:

- Understand spatial UI design principles
- Create UI layouts using UIKitML markup
- Position and scale interfaces in 3D space
- Handle user interactions with spatial UI elements
- Implement common UI patterns for WebXR

## Understanding Spatial UI

### Why Traditional UI Doesn't Work

In WebXR, traditional flat UI interfaces have problems:

- **Fixed positioning**: Doesn't adapt to 3D movement
- **Poor readability**: Text can be too small or far away
- **Awkward interaction**: Mouse/touch paradigms don't translate
- **Breaks immersion**: Flat panels feel artificial in 3D space

### Spatial UI Principles

Great spatial interfaces follow these principles:

1. **World-scale**: UI elements have physical presence in 3D space
2. **Natural interaction**: Use pointing, grabbing, and gestures
3. **Readable at distance**: Text and icons scale appropriately
4. **Contextual placement**: UI appears near relevant objects
5. **Comfortable viewing**: Positioned to avoid neck strain

## Introduction to UIKitML

UIKitML is IWSDK's spatial UI markup language, similar to HTML but designed for 3D interfaces.

### Key Features

- **Declarative markup**: Describe UI structure, not implementation
- **3D layout system**: Flexbox-like layouts in 3D space
- **Component library**: Pre-built buttons, panels, sliders, etc.
- **Event system**: Handle clicks, hovers, and other interactions
- **Theming support**: Consistent styling across your application

### Basic Syntax

UIKitML uses XML-style markup with 3D-specific properties:

```xml
<!-- Basic panel with text -->
<panel width="400" height="300" backgroundColor="#2a2a2a">
  <text fontSize="24" color="white">Hello WebXR!</text>
  <button onClick="handleClick">Click Me</button>
</panel>
```

## Setting Up UIKitML

### Vite Plugin Configuration

IWSDK includes a Vite plugin that compiles UIKitML files:

```typescript
// vite.config.js
import { defineConfig } from 'vite';
import { uikitml } from '@iwsdk/vite-plugin-uikitml';

export default defineConfig({
  plugins: [
    uikitml({
      // File extensions to process
      include: ['**/*.uikitml'],

      // Hot reload during development
      hotReload: true,
    }),
  ],
});
```

### Creating Your First UIKitML File

Create `src/ui/main-menu.uikitml`:

```xml
<panel
  id="mainMenu"
  width="500"
  height="600"
  backgroundColor="#1a1a1a"
  borderRadius="16"
  padding="32"
>
  <!-- Title -->
  <text
    fontSize="32"
    color="white"
    textAlign="center"
    marginBottom="24"
  >
    WebXR Experience
  </text>

  <!-- Menu buttons -->
  <container flexDirection="column" gap="16">
    <button
      id="startBtn"
      width="400"
      height="60"
      backgroundColor="#007aff"
      color="white"
      fontSize="18"
    >
      Start Experience
    </button>

    <button
      id="settingsBtn"
      width="400"
      height="60"
      backgroundColor="#34c759"
      color="white"
      fontSize="18"
    >
      Settings
    </button>

    <button
      id="exitBtn"
      width="400"
      height="60"
      backgroundColor="#ff3b30"
      color="white"
      fontSize="18"
    >
      Exit
    </button>
  </container>
</panel>
```

### Loading UI in Your Application

```typescript
import { createWorld } from '@iwsdk/core/runtime';
import { UIDocument, UISystem } from '@iwsdk/core/ui';
import mainMenuUI from './ui/main-menu.uikitml';

const world = createWorld();

// Register the UI system
world.registerSystem(UISystem);

// Create a UI document and load the menu
const uiDoc = world.spawn(UIDocument, {
  content: mainMenuUI,
  position: [0, 1.5, -2], // 2 meters in front, at eye level
  scale: 0.001, // Convert pixels to meters (1px = 1mm)
});
```

## Layout System

UIKitML uses a 3D-aware layout system based on CSS Flexbox principles.

### Container Types

#### Panel

Basic container with background and borders:

```xml
<panel
  width="400"
  height="300"
  backgroundColor="#2a2a2a"
  borderColor="#007aff"
  borderWidth="2"
  borderRadius="8"
>
  <!-- Content here -->
</panel>
```

#### Container

Layout container without visual styling:

```xml
<container flexDirection="row" gap="16">
  <button>Button 1</button>
  <button>Button 2</button>
  <button>Button 3</button>
</container>
```

### Layout Properties

#### Flex Direction

Controls the main axis of layout:

```xml
<!-- Horizontal layout -->
<container flexDirection="row">
  <item>A</item>
  <item>B</item>
  <item>C</item>
</container>

<!-- Vertical layout -->
<container flexDirection="column">
  <item>A</item>
  <item>B</item>
  <item>C</item>
</container>
```

#### Alignment and Justification

```xml
<container
  flexDirection="row"
  justifyContent="center"     <!-- space-between, space-around, flex-start, flex-end -->
  alignItems="center"         <!-- flex-start, flex-end, stretch -->
  gap="16"
>
  <button>Centered Button 1</button>
  <button>Centered Button 2</button>
</container>
```

#### Sizing and Spacing

```xml
<panel padding="24" margin="16">
  <!-- Fixed size -->
  <button width="200" height="60">Fixed Size</button>

  <!-- Flexible size -->
  <button flex="1" height="60">Flexible Width</button>

  <!-- With margins -->
  <button
    width="150"
    height="60"
    marginTop="16"
    marginBottom="16"
  >
    With Margins
  </button>
</panel>
```

## UI Components

### Text Elements

```xml
<!-- Basic text -->
<text color="white" fontSize="18">Hello World</text>

<!-- Styled text -->
<text
  color="#007aff"
  fontSize="24"
  fontWeight="bold"
  textAlign="center"
  maxWidth="300"
  wordWrap="true"
>
  This text will wrap and center align
</text>
```

### Interactive Elements

#### Buttons

```xml
<!-- Basic button -->
<button
  id="myButton"
  width="200"
  height="60"
  backgroundColor="#007aff"
  color="white"
  fontSize="18"
  borderRadius="8"
  onClick="handleButtonClick"
>
  Click Me
</button>

<!-- Button with hover effects -->
<button
  backgroundColor="#007aff"
  hoverBackgroundColor="#0056cc"
  pressedBackgroundColor="#003d99"
  transition="all 0.2s ease"
>
  Hover Button
</button>
```

#### Sliders

```xml
<slider
  id="volumeSlider"
  width="300"
  height="40"
  min="0"
  max="100"
  value="75"
  trackColor="#444444"
  thumbColor="#007aff"
  onChange="handleVolumeChange"
/>
```

#### Toggle Switches

```xml
<toggle
  id="soundToggle"
  width="60"
  height="30"
  value="true"
  onColor="#34c759"
  offColor="#8e8e93"
  onChange="handleSoundToggle"
/>
```

### Images and Icons

```xml
<!-- Image from URL -->
<image
  width="100"
  height="100"
  src="/icons/settings.png"
  borderRadius="8"
/>

<!-- Icon font -->
<icon
  name="play"
  size="24"
  color="#007aff"
/>
```

## Handling User Interactions

### Event System

UIKitML provides an event system for handling user interactions:

```typescript
import { UIDocument, UIEvent } from '@iwsdk/core/ui';

// Create UI document
const uiDoc = world.spawn(UIDocument, {
  content: mainMenuUI,
  position: [0, 1.5, -2],
  scale: 0.001,
});

// Handle button clicks
uiDoc.addEventListener('click', (event: UIEvent) => {
  switch (event.target.id) {
    case 'startBtn':
      console.log('Start button clicked!');
      startExperience();
      break;

    case 'settingsBtn':
      console.log('Settings button clicked!');
      openSettings();
      break;

    case 'exitBtn':
      console.log('Exit button clicked!');
      exitApplication();
      break;
  }
});

// Handle slider changes
uiDoc.addEventListener('change', (event: UIEvent) => {
  if (event.target.id === 'volumeSlider') {
    const volume = event.target.value;
    setGlobalVolume(volume / 100);
  }
});
```

### Common Interaction Patterns

#### Form Handling

```xml
<panel id="settingsForm" width="400" height="500">
  <text fontSize="24" marginBottom="24">Settings</text>

  <container flexDirection="column" gap="16">
    <!-- Volume setting -->
    <container flexDirection="row" alignItems="center" gap="16">
      <text width="100">Volume:</text>
      <slider
        id="volume"
        flex="1"
        min="0"
        max="100"
        value="75"
      />
      <text id="volumeValue" width="40">75%</text>
    </container>

    <!-- Graphics quality -->
    <container flexDirection="row" alignItems="center" gap="16">
      <text width="100">Quality:</text>
      <select id="quality" flex="1">
        <option value="low">Low</option>
        <option value="medium" selected="true">Medium</option>
        <option value="high">High</option>
      </select>
    </container>

    <!-- Sound toggle -->
    <container flexDirection="row" alignItems="center" gap="16">
      <text width="100">Sound:</text>
      <toggle id="sound" value="true"/>
    </container>
  </container>

  <container flexDirection="row" gap="16" marginTop="32">
    <button id="saveSettings" flex="1">Save</button>
    <button id="cancelSettings" flex="1" backgroundColor="#8e8e93">Cancel</button>
  </container>
</panel>
```

#### Dynamic Content Updates

```typescript
// Update UI content dynamically
const scoreText = uiDoc.querySelector('#score');
if (scoreText) {
  scoreText.textContent = `Score: ${currentScore}`;
}

// Show/hide elements
const loadingPanel = uiDoc.querySelector('#loadingPanel');
if (loadingPanel) {
  loadingPanel.style.display = isLoading ? 'flex' : 'none';
}

// Update progress bars
const progressBar = uiDoc.querySelector('#progressBar');
if (progressBar) {
  progressBar.value = (loadedAssets / totalAssets) * 100;
}
```

## Positioning and Follow Behaviors

### World-Space Positioning

```typescript
// Fixed position in world space
const fixedUI = world.spawn(UIDocument, {
  content: settingsUI,
  position: [2, 1.5, -1], // Fixed location
  rotation: [0, -30, 0], // Angled toward user
  scale: 0.001,
});
```

### Follow Behaviors

Make UI elements follow the player or look at them:

```typescript
import { UIFollowBehavior } from '@iwsdk/core/ui';

// UI that follows the player's head
const followUI = world.spawn(UIDocument, {
  content: hudUI,
  scale: 0.001,
});

followUI.add(UIFollowBehavior, {
  target: 'head', // Follow the player's head
  offset: [0, 0.2, 0.5], // Offset from head position
  maxDistance: 2.0, // Maximum distance before snapping
  smoothing: 0.1, // How smoothly to follow (0-1)
});
```

### Look-At Behavior

```typescript
import { UILookAtBehavior } from '@iwsdk/core/ui';

// UI that always faces the player
const facingUI = world.spawn(UIDocument, {
  content: infoPanel,
  position: [0, 1.5, -3],
  scale: 0.001,
});

facingUI.add(UILookAtBehavior, {
  target: 'head', // Always look at player's head
  axis: 'y', // Only rotate around Y axis (no tilting)
});
```

## Theming and Styling

### Global Themes

Create consistent styling across your UI:

```xml
<!-- Define theme at document root -->
<document theme="darkTheme">
  <panel>
    <!-- All elements inherit theme properties -->
    <button>Themed Button</button>
  </panel>
</document>
```

```typescript
// Define theme in your application
const darkTheme = {
  primaryColor: '#007aff',
  secondaryColor: '#34c759',
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff',
  borderColor: '#444444',

  button: {
    backgroundColor: 'var(--primaryColor)',
    color: 'var(--textColor)',
    borderRadius: 8,
  },

  panel: {
    backgroundColor: 'var(--backgroundColor)',
    borderColor: 'var(--borderColor)',
  },
};

// Apply theme to UI document
uiDoc.applyTheme(darkTheme);
```

### CSS-like Styling

```xml
<style>
  .primaryButton {
    background-color: #007aff;
    color: white;
    border-radius: 8px;
    font-size: 18px;
  }

  .primaryButton:hover {
    background-color: #0056cc;
  }

  .dangerButton {
    background-color: #ff3b30;
    color: white;
  }
</style>

<panel>
  <button class="primaryButton">Primary Action</button>
  <button class="dangerButton">Delete</button>
</panel>
```

## Advanced UI Patterns

### Contextual Menus

Create UI that appears near objects when interacted with:

```typescript
import { ContextualUI } from '@iwsdk/core/ui';

// Add contextual menu to grabbable objects
const interactiveObject = world.spawn(Transform, {
  position: [1, 1, -2],
});

interactiveObject.add(Grabbable);
interactiveObject.add(ContextualUI, {
  template: objectMenuUI,
  triggerEvents: ['grab', 'point'],
  positioning: 'above', // above, below, left, right
  distance: 0.3, // Distance from object
});
```

### Progressive Disclosure

Show detailed information on demand:

```xml
<panel id="inventoryItem" width="100" height="100">
  <!-- Compact view -->
  <image src="/items/sword.png" width="60" height="60"/>
  <text fontSize="12">Iron Sword</text>

  <!-- Detailed view (initially hidden) -->
  <panel id="detailView" display="none" width="300" height="200">
    <text fontSize="16">Iron Sword</text>
    <text fontSize="12" color="#888">
      A sturdy blade forged from iron. +10 Attack Power.
    </text>
    <button id="equipBtn">Equip</button>
    <button id="dropBtn">Drop</button>
  </panel>
</panel>
```

### Spatial Keyboards

For text input in VR:

```xml
<spatialKeyboard
  id="textInput"
  width="600"
  height="300"
  layout="qwerty"
  target="#usernameField"
  onClose="handleKeyboardClose"
/>
```

## Performance Considerations

### Optimize UI Updates

```typescript
// Batch UI updates for better performance
uiDoc.batchUpdate(() => {
  scoreText.textContent = `Score: ${score}`;
  livesText.textContent = `Lives: ${lives}`;
  timeText.textContent = `Time: ${timeLeft}`;
});
```

### Lazy Loading

```typescript
// Load UI content only when needed
const loadSettingsUI = async () => {
  if (!settingsUILoaded) {
    const settingsContent = await import('./ui/settings.uikitml');
    settingsUI = world.spawn(UIDocument, {
      content: settingsContent.default,
      position: [0, 1.5, -2],
    });
    settingsUILoaded = true;
  }

  settingsUI.show();
};
```

### Efficient Positioning

```typescript
// Use object pooling for frequently created UI
const uiPool = new UIPool(tooltipTemplate, 10);

// Reuse UI elements instead of creating new ones
const tooltip = uiPool.get();
tooltip.position.copy(targetPosition);
tooltip.querySelector('text').textContent = tooltipText;
tooltip.show();
```


## Troubleshooting

### UI Not Appearing

**UI document loads but nothing shows?**

- Check the position is in front of the player
- Verify scale is appropriate (try 0.001 for pixel-based layouts)
- Ensure UISystem is registered with the world

### Interaction Issues

**Clicks not working?**

- Check that ray pointers are set up correctly
- Verify event listeners are attached to the UIDocument
- Ensure UI elements have proper hit testing enabled

### Performance Problems

**UI causing frame rate drops?**

- Reduce the number of UI elements updated per frame
- Use batch updates for multiple changes
- Consider using lower resolution for text elements

### Layout Issues

**Elements not positioning correctly?**

- Check flexDirection and alignment properties
- Verify parent container has appropriate dimensions
- Use browser dev tools to inspect the rendered UI structure
