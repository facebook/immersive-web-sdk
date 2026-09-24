---
'@iwsdk/create': patch
---

Run the starter `npm run dev` script through `iwsdk dev restart`, so starting it
again stops the runtime already running for the project and takes over the
terminal instead of attaching to the existing runtime and exiting.
