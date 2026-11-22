# EVA

EVA (Electronic Virtual Assistant) is a privacy-first AI desktop assistant. Milestone 1, the desktop foundation, is on `main`. This branch adds Milestone 2: a conversation engine with a local provider and an optional cloud provider.

The app opens a local window and starts a Java core on `127.0.0.1`. Conversation stays on this machine through Ollama unless you select OpenAI and explicitly opt in. There is no voice capture, mailbox, permanent memory, or computer automation.

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

`npm run smoke` opens the built app, waits until the status pill reads `CORE ONLINE`, checks that the conversation panel shows a provider control and that the activity panel still says it is not connected to AI, saves a screenshot under the OS temp directory as `eva-milestone1.png`, and exits. On this machine that file is `%TEMP%\eva-milestone1.png`. The smoke test does not require Ollama or an OpenAI key. CI does not call either provider.

`npm run typecheck` checks the TypeScript projects without launching Java.

## What you should see

- A dark HUD with the same orb. Its conversation phase is `idle`, `processing`, `responding`, or `error`. That is not a voice animation.
- A connection pill driven by `GET /api/health`. `CORE ONLINE` means the Java process answered with the expected payload. `CONNECTING`, `CORE OFFLINE`, and `CORE ERROR` are the other real states.
- A conversation panel with user and assistant bubbles, a provider selector, a model selector, a local or cloud stamp, and a new-conversation control. The activity panel still says **Not connected to AI** because computer automation is not enabled.
- If Ollama is not running, the local provider is marked disconnected and EVA does not send the message. It also does not download a model.
- If you open the Vite URL in a normal browser, the pill reports that the desktop bridge is unavailable. The session token and any API key never enter the page, so the browser cannot call the core.

## Ollama

Ollama is the default provider. Install it from [ollama.com](https://ollama.com) and start it so it listens on `http://127.0.0.1:11434`. Pull any model you want with Ollama's own tools before you talk to EVA. EVA lists installed models from `GET /api/tags` and sends chat to `POST /api/chat`. It never calls `/api/pull` and never downloads a model for you.

The base URL defaults to `http://127.0.0.1:11434`. Override it with `EVA_OLLAMA_BASE_URL` only when Ollama is on another loopback port. The value must be an `http` URL for `127.0.0.1`, `localhost`, or `[::1]`, with no user info and no path. A non-loopback URL is rejected at startup.

If the server is down or the selected model is not installed, the reply fails and the rest of the app stays up. A missing model is not replaced with another one.

## Optional OpenAI

Cloud mode is off until you do both of these:

1. Select OpenAI in the conversation panel.
2. Check **Send messages to OpenAI**.

Set the key in the shell that launches EVA. Do not put it in source, `application.yml`, or the React app.

```powershell
$env:EVA_OPENAI_API_KEY = "your key"
npm run dev
```

The key is optional. Without it, OpenAI is listed as not configured and a cloud send fails before any network call. Java removes the key from Spring's configuration and redacts it from logs. React never receives it.

The cloud model list is fixed: GPT-4o mini (`gpt-4o-mini`), GPT-4o (`gpt-4o`), GPT-4.1 mini (`gpt-4.1-mini`), and GPT-6 Luna (`gpt-6-luna`). EVA does not ask OpenAI for a model list. GPT-6 Luna requests use reasoning effort `none`. The other cloud models are unchanged. When the API returns token counts, the panel shows those counts and an estimated USD cost from published standard-processing rates per million tokens (mini 0.15/0.60, GPT-4o 2.50/10.00, GPT-4.1 mini 0.40/1.60, GPT-6 Luna 0.10/0.50). Reasoning tokens are included in that estimate when the API reports them separately from the completion count. If usage is missing, no cost is shown. Ollama token counts, when Ollama returns them, have no dollar estimate.

There is no automatic fallback. A local failure stays local. A cloud failure stays an error.

## Privacy and limits

- Local is the default. Nothing in a conversation is sent to OpenAI unless that send has cloud mode enabled.
- The system prompt lives in `backend/src/main/resources/personality/eva-system-prompt.txt`. It is the only extra instruction added to a request. EVA does not attach files, mail, calendar data, or a user profile.
- Transcript context is in memory in the Java process. New conversation clears it. Restarting EVA clears it. There is no database.
- A message is limited to 4,000 characters. The remembered context is at most 16 messages and 8,000 characters.
- Replies are complete responses, not a token stream. One reply at a time; a second send while one is running is rejected. Cancel asks the in-flight call to stop, and a late reply is discarded.
- Model and provider errors are returned as error codes. They do not crash the window.

## Security boundaries

- React cannot use Node.js or the operating system. Electron context isolation and the sandbox stay on.
- The preload bridge validates messages before they reach the page. It exposes status, application info, and four conversation calls: read, send, reset, and cancel. It does not expose a general IPC method.
- Java listens on `127.0.0.1` only. Code forces that address even if configuration says otherwise.
- Electron generates a session token in memory and sends it to Java as `EVA_SESSION_TOKEN`. It is not stored in source. Java removes that token, and `EVA_OPENAI_API_KEY` when it is set, from Spring's configuration before the context starts. A log filter drops any record that still contains either value.
- Requests must come from loopback, carry that bearer token, and use a loopback `Host`. Browser `POST`s that include an `Origin` are rejected.

## Secret scanning

Pull requests into `main`, pushes to `main`, and manual runs execute `.github/workflows/gitleaks.yml`. The job checks out the full git history and scans it with Gitleaks 8.30.1. A finding fails the check. Secret values are redacted in the log. The workflow does not comment on pull requests and does not upload a report.

The default Gitleaks rules stay enabled. `.gitleaksignore` lists one fingerprint from the redaction unit test, which uses a fake fixture rather than a credential. Do not add a real secret to that file.

### Install Gitleaks on Windows

CI uses 8.30.1. Install that same release and check the checksum before using it. From PowerShell:

```powershell
$version = "8.30.1"
$dir = Join-Path $env:LOCALAPPDATA "gitleaks"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$zip = "gitleaks_${version}_windows_x64.zip"
$base = "https://github.com/gitleaks/gitleaks/releases/download/v$version"
Invoke-WebRequest "$base/$zip" -OutFile (Join-Path $dir $zip)
Invoke-WebRequest "$base/gitleaks_${version}_checksums.txt" -OutFile (Join-Path $dir "checksums.txt")
$expected = ((Select-String -Path (Join-Path $dir "checksums.txt") -Pattern $zip -SimpleMatch).Line -split "\s+")[0].ToLower()
$actual = (Get-FileHash (Join-Path $dir $zip) -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) { throw "Gitleaks checksum did not match." }
Expand-Archive -Path (Join-Path $dir $zip) -DestinationPath $dir -Force
```

Add the folder that contains `gitleaks.exe` to your user `PATH`, then open a new terminal. `gitleaks version` should print `8.30.1`.

### Scan locally

From the repository root:

```powershell
gitleaks detect --source . --redact=100 --verbose
```

Exit code 0 means the history scan found nothing new. Exit code 1 means Gitleaks reported a possible secret or the command failed. The finding names the file, commit, and rule. The secret value is redacted.

### Optional pre-commit check

Git for Windows runs `.githooks/pre-commit` with its shell. The hook scans staged changes and blocks the commit when Gitleaks reports a finding. Enable it in this clone only:

```powershell
git config core.hooksPath .githooks
```

Gitleaks must be on `PATH`. To stop using the hook:

```powershell
git config --unset core.hooksPath
```

### When a secret is detected

Treat the value as compromised even though the log hides it. Revoke or rotate it at the service that issued it, then remove it from the working tree. Do not commit the value, and do not silence the finding by ignoring the file. If the value already reached a remote, rotation is what protects it. The old commit remains in git history until that history is rewritten, which is a separate decision and is not required to rotate the credential.

## Out of scope

Voice, computer automation, tool execution, Gmail, calendar, permanent memory, SQLite, background tasks, and cloud hosting are not in this milestone. A later capability needs its own IPC channel and backend route, and both should keep the checks above.

## License

[MIT](LICENSE)
