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

  ➜  Local:   https://localhost:8081/
  ➜  Network: https://192.168.1.100:8081/
  ➜  press h + enter to show help
```

::: warning HTTPS Required
Notice that the URL uses **HTTPS** (not HTTP). This is required for WebXR to work - browsers only allow WebXR on secure origins. Vite automatically generates a self-signed certificate for local development.
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
   - Example output: `➜  Network: https://192.168.1.100:8081/`
3. **Enter the development URL** in your headset's browser: `https://192.168.1.100:8081`
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
   - Add a rule to forward port `8081` from your computer to your headset
4. **Access the local server** on your headset by entering `https://localhost:8081` in the browser
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

IWER is automatically injected into your project through the `injectIWER` Vite plugin in your `vite.config.ts`:

```typescript
injectIWER({
  device: 'metaQuest3',
  activation: 'localhost',
  verbose: true,
});
```

**Configuration options:**

- **`device`**: Which headset to emulate (`metaQuest2`, `metaQuest3`, `metaQuestPro`, or `oculusQuest1`). More headset presets and custom headset configuration support coming soon.
- **`activation`**: Controls when IWER activates. The default `'localhost'` is smart - it activates IWER when you access the site from localhost (typically your computer, which needs emulation), but not when accessing via IP address (typically from a headset with native WebXR support).
- **`userAgentException`**: Adds an extra layer of protection by skipping IWER activation if the browser's user agent matches a pattern (like `OculusBrowser`). This ensures IWER won't activate on headsets even when using ADB port forwarding with localhost.
- **`sem`**: Synthetic Environment Module for AR scene understanding (AR projects only)

To test with IWER, simply open `https://localhost:8081` in your desktop browser and click "Enter XR". Here's what the emulated experience looks like:

<video autoplay loop muted playsinline>
  <source src="/testing-experience/starter-iwer.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

## What's Next

Excellent! You now have a running WebXR application and understand how to test it both in the browser with IWER emulation and on a physical headset.

In Chapter 3, we'll dive into creating and manipulating 3D objects using Three.js fundamentals within the IWSDK framework.
