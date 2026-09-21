---
name: iwsdk-native-xr-test
description: Test an IWSDK app in a real Quest immersive session while controlling headset and controller poses through the IWSDK CLI. Use when the user asks to run, automate, or debug an app on a connected Quest rather than in desktop IWER emulation.
argument-hint: '[test scenario]'
---

# Test on a physical Quest

Run the app through an ADB-reversed localhost connection, enter the browser's
real immersive session, and use the ordinary IWSDK XR, ECS, scene, and browser
commands to observe and control it. The native browser continues to own
`XRSession`, frame scheduling, rendering, and tracking; IWSDK/IWER selectively
override poses and input for the test.

The requested scenario is in `$ARGUMENTS`.

## Safety and scope

- Use only public Android platform tools and IWSDK commands. Do not depend on a
  device-rental service, XRPilot, or internal Meta tooling.
- Require exactly one authorized device from `adb devices`, or require the
  user to choose a serial. Pass `-s <serial>` to every ADB command.
- Support Quest Browser only. Do not broaden the browser user-agent check.
- Keep the command bridge on loopback. Use `adb reverse`; never expose or
  forward the bridge over a LAN.
- Native control replaces the headset's native controller input sources with
  synthetic controllers for the duration of the test. Physical controller and
  hand-action playback are unavailable while the override is installed.
- `xr set-transform` applies absolute test poses, not offsets from live
  tracking.
- A first run may show an immersive-WebXR permission prompt in the headset.
  Ask the user to approve it physically, then relaunch. Do not automate that
  permission dialog.
- Always remove the ADB reverse and stop the dev session during cleanup,
  including after a failed test.

## 1. Verify the app and device

Run `npm run --if-present typecheck` and fix type errors before device testing.

Run `adb devices`. Continue only with one device in the `device` state. A
`pending`, `offline`, or `unauthorized` device is not ready.

This workflow expects a manifest-first app that imports
`virtual:iwsdk-project` and passes it to `World.create()`. For a hand-built
`WorldOptions` object, opt in explicitly with:

```ts
xr: {
  // existing XR options
  launchOnSessionGranted: true,
}
```

## 2. Start the native-control dev session

From the application root, run:

```bash
npx @iwsdk/cli dev up --native-xr-control --no-open
```

Inspect `npx @iwsdk/cli dev status` and record the numeric port from the
active runtime. Native-control sessions default to HTTP when the application
does not explicitly configure Vite HTTPS. The app is loaded from
headset-localhost through ADB reverse, so the default remains a trustworthy
WebXR origin.

## 3. Install the reversible ADB route

Replace `<serial>` and `<port>` with the values verified above:

```bash
adb -s <serial> reverse tcp:<port> tcp:<port>
```

Open `http://127.0.0.1:<port>/` in Quest Browser once and verify the app loads.
Do not continue if it redirects to a network hostname or if the page is not the
expected local app. Record the physical app clients from
`npx @iwsdk/cli dev status`; this lets you distinguish the immersive tab
created next from any retained verification tab.

## 4. Enter the real immersive session

URL-encode `http://127.0.0.1:<port>/`, then launch:

```bash
adb -s <serial> shell am broadcast \
  -n com.oculus.vrshell/.ShellControlBroadcastReceiver \
  -a com.oculus.vrshell.intent.action.LAUNCH \
  -d apk://com.oculus.browser \
  -e uri "ovrweb://vr?uri=<encoded-localhost-url>"
```

Keep the nested URL encoded so `?`, `&`, and fragment characters cannot be
interpreted as parameters of the outer deep link.

Poll the dev status again. If exactly one new command-ready `physical` app
client appeared, record its `pageId` and `tabGeneration` as the active tab.
If multiple new physical clients appeared, ask the user to close the extras
and retry. Never send an untargeted command while multiple physical clients
are connected.

Use the active tab as `expectedTab` on each command:

```bash
npx @iwsdk/cli xr status --input-json \
  '{"expectedTab":{"id":"<pageId>","generation":<tabGeneration>}}' --raw
```

The dev status must show a command-ready `physical` app client. XR status must
show an active `immersive-vr` or `immersive-ar` session. If the session stays
inactive, ask the user to accept the one-time browser permission in the
headset, relaunch the deep link, and poll again.

Do not use `iwsdk xr enter` for this step: that command accepts an emulated
offer, while this workflow must preserve the browser's native session.

## 5. Run the scenario

Discover the available command shapes before improvising:

```bash
npx @iwsdk/cli xr --help
npx @iwsdk/cli ecs --help
npx @iwsdk/cli scene --help
```

Include the recorded `expectedTab` object in each command's `--input-json`.
This both selects the intended physical tab and rejects stale commands after a
page reload.

Use the same commands as desktop automation. Typical controls are:

- `xr set-transform` for headset or controller position/orientation.
- `xr look-at` to aim a controller ray at a world position.
- `xr set-select-value` or `xr select` for trigger/pinch interaction.
- `xr set-gamepad-state` for squeeze and controller buttons.
- `ecs query`, `ecs snapshot`, and `ecs diff` for authoritative state.
- `scene runtime-hierarchy` and `scene transform` to locate and measure
  rendered objects.

Prove behavior with state, not only screenshots. For an interaction test,
record the target transform or component state before the action, perform the
pose/input sequence, and show the corresponding state change afterward.

## 6. Exit and clean up

Run these cleanup actions individually even if an earlier assertion failed:

```bash
npx @iwsdk/cli xr exit --input-json \
  '{"expectedTab":{"id":"<pageId>","generation":<tabGeneration>}}' --raw
adb -s <serial> reverse --remove tcp:<port>
npx @iwsdk/cli dev down
```

Report:

- device serial and app URL used;
- native session mode and enabled features;
- the physical client's command-ready state;
- pose/input actions performed;
- before/after evidence for the requested behavior;
- console errors or capability notes;
- confirmation that the reverse route and dev session were removed.
