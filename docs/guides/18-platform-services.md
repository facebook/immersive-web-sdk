---
outline: [2, 3]
---

# Platform Services and Backends

IWSDK provides the browser runtime for 3D and WebXR applications. It does not
provide an account or game-platform services layer.

## Scope

IWSDK includes rendering, ECS, XR and browser input, spatial UI, locomotion,
physics integration, asset loading, and development tooling. It does not ship
APIs for:

- identity, profiles, or platform friends;
- achievements, leaderboards, or matchmaking;
- cloud saves or cross-device persistence;
- commerce, entitlements, or payments; or
- hosted application databases and server functions.

The absence of these APIs is intentional. Authentication, data residency,
moderation, commerce, and platform policy differ by application and deployment
target and should not be hidden behind the WebXR runtime.

## Supported Web Architecture

Use the same architecture as a conventional web application:

1. The IWSDK client authenticates with your web identity flow.
2. The client calls your backend over HTTPS or a secured WebSocket.
3. The backend owns secrets and calls database, leaderboard, commerce, or
   platform-provider APIs.
4. The client translates returned data into ECS components and systems.

Browser-compatible provider SDKs can also be used directly when their security
model permits it. Do not put service credentials or privileged platform tokens
in the IWSDK bundle.

Keep provider code behind an app-owned interface so the scene and gameplay
systems remain portable:

```ts
export interface PlayerProgressService {
  load(): Promise<PlayerProgress>;
  save(progress: PlayerProgress): Promise<void>;
}
```

## Native and Platform-Specific APIs

Documentation for a native engine or device SDK does not automatically apply
to an IWSDK web application. In particular, native Horizon, Unity, or Unreal
APIs are not IWSDK APIs and should not be imported as if they run in the
browser.

If a native host embeds the web application, integration is app-owned: expose a
small, allowlisted host bridge or route the operation through your backend.
Validate message origins and payloads, version the bridge contract, and keep
privileged credentials in the host or server. IWSDK does not currently ship a
native-host bridge.

For a browser deployment, use provider features that explicitly support the
web, or use the provider's server API from your backend. Confirm availability
and policy with that provider before making it a product dependency.

## Choosing an Integration

| Requirement                  | Recommended route                                          |
| ---------------------------- | ---------------------------------------------------------- |
| App login and profiles       | Web identity provider plus an application backend          |
| Saves and leaderboards       | Backend API backed by your database or game service        |
| Realtime multiplayer         | Authenticated WebSocket/WebRTC service owned by the app    |
| Payments or entitlements     | Web-supported provider flow plus server verification       |
| Native-only platform feature | Explicit native host bridge, or omit it from the web build |

Treat these integrations as application architecture. They can drive IWSDK ECS
state, but they are not prerequisites for using the runtime.
