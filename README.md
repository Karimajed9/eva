# EVA

Privacy-first AI desktop assistant. This repository is Milestone 1: the desktop foundation.

The app opens a local window, starts a Java core on `127.0.0.1`, and shows whether that core is actually reachable. The conversation and activity panels are on screen and are explicitly **not connected to AI**. There is no model call, API key, voice capture, mailbox, memory store, or computer automation in this milestone.

```text
frontend/   React, TypeScript, Vite, Tailwind CSS, Motion
desktop/    Electron main process and sandboxed preload
backend/    Java 21 and Spring Boot
shared/     IPC and health contract used by the shell and the interface
```

The design of those boundaries is written up in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 22 or newer
- JDK 21 or newer
- Windows, macOS, or Linux

A Maven wrapper is included, so a separate Maven install is optional. The first backend build downloads Maven 3.8.6 if it is not already cached.

These instructions were run on Windows 11 with Node.js 24.22.1 and Java 21.0.13.

## Run it

From the repository root:

```powershell
npm install
npm run dev
```

`npm run dev` packages the backend, bundles the Electron shell, starts the interface on `http://127.0.0.1:5173`, and opens the window. The first run is the slow one because Maven and Electron fetch their tooling.

To open the built interface instead of the Vite server:

```powershell
npm start
```

Closing the window stops the Java process. A second launch focuses the existing window.

## Tests

```powershell
npm test
```

That command:

- builds the backend jar and runs the JUnit suite
- runs the React tests
- runs the Electron unit tests, including a live check that health requires the session token and that shutdown closes the port

Pull requests run `.github/workflows/ci.yml`. The backend job builds and tests the Java project. The frontend job typechecks, builds, and tests the React app. The Electron job typechecks, bundles, and tests the shell, including its live backend check.

`npm run smoke` opens the built app, waits until the status pill reads `CORE ONLINE`, checks that both panels say they are not connected to AI, saves a screenshot under the OS temp directory as `eva-milestone1.png`, and exits. On this machine that file is `%TEMP%\eva-milestone1.png`.

`npm run typecheck` checks the TypeScript projects without launching Java.

## What you should see

- A dark HUD with an animated orb.
- A connection pill driven by `GET /api/health`. `CORE ONLINE` means the Java process answered with the expected payload. `CONNECTING`, `CORE OFFLINE`, and `CORE ERROR` are the other real states.
- Conversation and activity panels marked **Not connected to AI**. The message box is disabled.
- If you open the Vite URL in a normal browser, the pill reports that the desktop bridge is unavailable. The token never enters the page, so the browser cannot call the core.

## Security boundaries

- React cannot use Node.js or the operating system. Electron context isolation and the sandbox stay on.
- The preload bridge has three calls. It validates messages before they reach the page.
- Java listens on `127.0.0.1` only. Code forces that address even if configuration says otherwise.
- Electron generates a session token in memory and sends it to Java as `EVA_SESSION_TOKEN`. It is not stored in source. Java removes it from Spring's configuration before the context starts, and a log filter drops any record that still contains the value.
- Requests must come from loopback, carry that bearer token, and use a loopback `Host`. Browser `POST`s that include an `Origin` are rejected.

## Out of scope

Later milestones can add a model, voice, mail, memory, and local actions. Those are not started here. A new capability needs its own IPC channel and backend route; both should keep the checks above.

## License

[MIT](LICENSE)
