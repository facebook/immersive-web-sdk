---
outline: [2, 4]
---

# Chapter 2: Testing Experience

Now that you have a working IWSDK project, it's time to launch it and see it in action! This chapter covers how to run your development server and test your WebXR experience using both browser emulation and a physical VR headset.

## Getting Your Project Running

First, let's navigate to your project and get the development server started.

### Navigate to Your Project

Open your terminal and navigate to the project folder you created in Chapter 1:

```bash
cd my-iwsdk-app  # Replace with your actual project name
```

### Install Dependencies (If Needed)

If you chose "No" when asked to install dependencies during project creation, install them now:

```bash
npm install
```

This will install all the necessary packages. If you already installed dependencies during project creation, you can skip this step.

### Launch the Development Server

Start your development server:

```bash
npm run dev
```

You should see output similar to:

```
  VITE v7.1.4  ready in 1234 ms

  ➜  Local:   https://localhost:5173/
  ➜  Network: https://192.168.1.100:5173/
  ➜  press h + enter to show help
```

Or, if you prefer a CLI summary after startup:

```bash
npx iwsdk dev status
```

::: warning HTTPS Required
Notice that the URL uses **HTTPS** (not HTTP). This is required for WebXR to work - browsers only allow WebXR on secure origins. IWSDK generates and caches an untrusted development certificate without installing a certificate authority or changing your operating-system trust store. The managed browser accepts it automatically; a physical headset shows its normal certificate warning, which you should accept to continue.
:::

Your development server is now running and ready for testing!

## Testing Your Project

Now that your development server is running, you can test your WebXR experience in two ways: with a physical headset for the full immersive experience, or on your desktop using IWER emulation.

### Option 1: Testing with a Physical Headset

If you have access to a VR headset, this provides the best testing experience for your WebXR application.

#### Recommended Headset

We recommend using a **[Meta Quest 3](https://www.meta.com/quest/quest-3/) or [Quest 3S](https://www.meta.com/quest/quest-3s/)** for development, as this tutorial is designed with these devices in mind. Other devices like the **Meta Quest 2** or **Pico 4** should also work well.

#### Testing on Meta Quest

The Meta Quest series has excellent WebXR support built into the headset's browser:

You can access the local development server from your XR headset using one of two methods: via your computer's IP address or by using ADB with port forwarding.

#### Method 1: Access via IP Address (Recommended)

On most home networks, you can access the local server directly. **Your headset must be connected to the same Wi-Fi network as your computer.**

1. **Put on your headset** and navigate to the browser app
2. **Find your computer's IP address** in the Vite dev server output (look for the "Network" URL)
   - Example output: `➜  Network: https://192.168.1.100:5173/`
   - `npx iwsdk dev status` also reports the current runtime URL
3. **Enter the development URL** in your headset's browser using the reported network host and port, for example `https://192.168.1.100:5173`
4. **Accept the certificate warning** (this is normal for local development with self-signed certificates)
5. **Click "Enter XR"** when the page loads

#### Method 2: Access via ADB Port Forwarding (Fallback)

If accessing via IP address doesn't work due to network restrictions or firewall settings (common on corporate networks), use ADB (Android Debug Bridge) with port forwarding:

1. **Connect your headset to your computer** via USB cable
2. **Enable developer mode** on your headset (check your device's documentation for instructions)
3. **Set up port forwarding**:
   - Open Chrome on your computer and navigate to `chrome://inspect/#devices`
   - Your headset should appear under "Remote Target"
   - Click "Port forwarding..." in Chrome DevTools
   - Add a rule to forward the port shown in the Local URL from your computer to your headset
4. **Access the local server** on your headset by entering the forwarded URL, for example `https://localhost:5173`
5. **Accept the certificate warning** and **click "Enter XR"** when the page loads

Here's what your WebXR experience looks like when running on a Meta Quest 3 device:

<video autoplay loop muted playsinline>
  <source src="/testing-experience/starter-vr.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### Option 2: Testing with IWER (Browser Emulation)

IWER (Immersive Web Emulator Runtime) is a WebXR emulator that runs entirely in your browser, allowing you to develop and test WebXR applications without a headset. IWER automatically activates when no real WebXR device is detected and provides mouse/keyboard controls to simulate VR interactions.

Learn more about IWER at [meta-quest.github.io/immersive-web-emulation-runtime/](https://meta-quest.github.io/immersive-web-emulation-runtime/).

### How IWER Integration Works

IWER is automatically injected into your project through the `iwsdkDev` Vite plugin in your `vite.config.ts`:

```typescript
iwsdkDev({
  emulator: {
    device: 'metaQuest3',
  },
  verbose: true,
});
```

**Configuration options:**

- **`device`**: Which headset to emulate (`metaQuest2`, `metaQuest3`, `metaQuestPro`, or `oculusQuest1`). More headset presets and custom headset configuration support coming soon.
- **`activation`**: Controls when IWER activates. The default `'localhost'` is smart - it activates IWER when you access the site from localhost (typically your computer, which needs emulation), but not when accessing via IP address (typically from a headset with native WebXR support).
- **`userAgentException`**: Adds an extra layer of protection by skipping IWER activation if the browser's user agent matches a pattern (like `OculusBrowser`). This ensures IWER won't activate on headsets even when using ADB port forwarding with localhost.
- **`sem`**: Synthetic Environment Module for AR scene understanding (AR projects only)

To test with IWER, open the Local URL reported by Vite or `npx iwsdk dev status` in your desktop browser and click "Enter XR". Here's what the emulated experience looks like:

<video autoplay loop muted playsinline poster="/testing-experience/starter-iwer-poster.jpg">
  <source src="/testing-experience/starter-iwer.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

### IWER Controls

After entering XR, use the IWER toolbar and controller panels overlaid on the
page:

1. Click the **Play mode** button (the circle-play icon) to lock the pointer.
   Move the mouse to look around. Press <kbd>Esc</kbd> to leave play mode.
2. Hold <kbd>Left Shift</kbd> while using <kbd>W</kbd>, <kbd>A</kbd>,
   <kbd>S</kbd>, and <kbd>D</kbd> to move the emulated headset through the
   scene. Use <kbd>Left Shift</kbd> +
   <kbd>ArrowUp</kbd>/<kbd>ArrowDown</kbd> to adjust height.
   These keys continue to drive their controller thumbsticks while Left Shift
   is held, so the default XR starter moves both the emulated headset and the
   player. If you need isolated headset free-flight, use the controller gear
   buttons to remap the thumbstick keys first.
3. Without <kbd>Left Shift</kbd>,
   <kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> drive the left
   thumbstick. The arrow keys drive the right thumbstick.
4. In play mode, left mouse is the right-controller **trigger/select** and
   right mouse is the right-controller **grip/squeeze**. The starter plant's
   `DistanceGrabbable` uses trigger/select; near-field `OneHandGrabbable` and
   `TwoHandsGrabbable` interactions use grip/squeeze.
5. Outside play mode, click a controller's **Trig** or **Grip** value for a
   momentary press. Use the adjacent pin button to latch that value until you
   release it. Open the gear button to inspect or remap keyboard bindings.
6. To move the starter plant, leave play mode, latch **Trig**, and drag the
   controller's transform handle in the scene. Use **Grip** instead when testing
   a near-field grabbable. Click the handle to switch between translation and
   rotation, then release the latch to drop the object.
7. Use **Toggle input mode** in the toolbar to switch between controllers and
   hands. Use **Reset device transforms** to return the headset and inputs to
   their default pose.

The default left-controller trigger and squeeze bindings are <kbd>Q</kbd> and
<kbd>E</kbd>. The visible binding chips in each controller panel are the source
of truth if you have remapped a control.

For automated interaction, use the CLI sequence in
[AI workflows: XR Interaction](/ai/workflows#xr-interaction).

## What's Next

Excellent! You now have a running WebXR application and understand how to test it both in the browser with IWER emulation and on a physical headset.

In Chapter 3, we'll dive into creating and manipulating 3D objects using Three.js fundamentals within the IWSDK framework.
