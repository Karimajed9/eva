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
- A conversation panel with user and assistant bubbles, a provider selector, a model selector, a local or cloud stamp, a microphone control, and a new-conversation control. Enter sends the message. Shift+Enter inserts a newline and does not send. Speak records from the microphone, Stop puts the local transcript in the message box, and Send is still your action. The activity panel still says **Not connected to AI** because computer automation is not enabled.
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

The cloud model list is fixed: GPT-4o mini (`gpt-4o-mini`), GPT-4o (`gpt-4o`), GPT-4.1 mini (`gpt-4.1-mini`), and GPT-6 Luna (`gpt-6-luna`). Selecting OpenAI chooses GPT-6 Luna. Ollama stays the provider selected when EVA opens, and the other cloud models stay in the list. EVA does not ask OpenAI for a model list. GPT-6 Luna requests use reasoning effort `none`. The other cloud models are unchanged. GPT-6 Luna was live-tested once through EVA with a real OpenAI key, and that send succeeded. No other OpenAI model has been live-tested. When the API returns token counts, the panel shows those counts and an estimated USD cost from published standard-processing rates per million tokens (mini 0.15/0.60, GPT-4o 2.50/10.00, GPT-4.1 mini 0.40/1.60, GPT-6 Luna 0.10/0.50). Reasoning tokens are included in that estimate when the API reports them separately from the completion count. If usage is missing, no cost is shown. Ollama token counts, when Ollama returns them, have no dollar estimate.

There is no automatic fallback. A local failure stays local. A cloud failure stays an error.

## Local speech

Speech-to-text stays on this machine. EVA records from the microphone, converts the audio to 16 kHz mono PCM WAV, and sends those bytes to the local core. The core runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) once per recording. The transcript is placed in the message box, which scrolls when the text is longer than the box. EVA does not send it until you do. Recordings are temporary files and are deleted after transcription, cancellation, or a failed run. Audio, vocabulary, and transcript text are not written to the log.

The language control defaults to automatic detection (`-l auto`). English, French, and Arabic can be selected instead. An optional vocabulary is empty until you add terms. Those terms are joined and passed as one `--prompt` argument, which is a hint to whisper.cpp rather than a guarantee. A name such as "Muay Thai" can still be missed. The vocabulary is stored in the Electron user-data file `speech-preferences.json` and is not sent anywhere else.

EVA does not download whisper.cpp or a model. Copy `.env.example` to `.env` in the repository root and set the paths there. The Electron main process reads that file before it starts Java. A variable already set in the operating system wins. Relative paths are resolved from the repository root, then checked with the same absolute-path rules as before. `.env` is not read by Vite or the window, and keys other than the listed EVA settings are ignored.

```text
EVA_WHISPER_EXECUTABLE=C:\Tools\whisper\whisper-cli.exe
EVA_WHISPER_MODEL=C:\Tools\whisper\ggml-base.bin
```

An operating-system variable still overrides the file:

```powershell
$env:EVA_WHISPER_EXECUTABLE = "C:\Tools\whisper\whisper-cli.exe"
$env:EVA_WHISPER_MODEL = "C:\Tools\whisper\ggml-base.bin"
npm run dev
```

The executable must be an absolute path named `whisper-cli.exe`, `whisper-cli`, `main.exe`, `main`, `whisper.exe`, or `whisper`. The model must be an absolute path to a multilingual `ggml-*.bin` file. English-only files such as `ggml-base.en.bin` are rejected because this milestone needs French and Arabic as well as English. `ggml-base.bin` is the practical CPU default. The multilingual Small model was much slower on CPU because each utterance starts a new process, reloads the model, and then spends most of the remaining time in inference. Larger multilingual models also work, at that same cost.

After a transcription, the status line shows how long the recording was and how long transcription took. When whisper.cpp prints its load and total times, hovering that line shows model load separately from recognition. Those numbers are not logged.

CPU is the default. The core passes `-ng`, so a GPU build still runs on the CPU. For an AMD GPU, build whisper.cpp with Vulkan (`-DGGML_VULKAN=ON` in CMake) and set `EVA_WHISPER_GPU=vulkan` in `.env`, or in the shell:

```powershell
$env:EVA_WHISPER_GPU = "vulkan"
```

`on` and `amd` mean the same thing. EVA then omits `-ng` and lets that whisper.cpp build select its GPU. A CPU-only binary should keep the variable unset.

If either path is missing, the conversation panel says so and a transcription request fails before a process starts. The rest of EVA keeps working.

## Local speech playback

Playback uses [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx). The Java core keeps one Python worker for the session. The worker loads the model once and reads requests on stdin. Audio comes back as 24 kHz mono PCM and is wrapped as WAV. The page plays it with the Web Audio API. One gain node sits on the only path to the speakers. The slider is stored from 0 to 1 and mapped in even loudness steps across 30 dB: 0 is silent, full is normal loudness with no extra boost, and the lower half stays usable instead of dropping away. Moving it updates the sound that is already playing, with a short ramp so the change does not click. Kokoro never sees the volume. Synthesis stays local whether the chat provider is Ollama or OpenAI. EVA does not call a cloud voice API.

The default voice is Heart (`af_heart`, American English). Bella, Nova, and Sarah are the other American voices. Emma (`bf_emma`) is British English. French is Siwis (`ff_siwis`). Kokoro-82M v1.0 has that one French voice, trained on less than 11 hours, and its own card grades it B−. There is no Arabic voice in this model, so EVA does not offer one.

Speak completed replies is off until you turn it on. While it is on, EVA speaks a reply only after that reply finishes successfully. A stopped, failed, or partial reply stays silent. Listen on a finished reply plays it again. Preview speaks one fixed sentence and does not add a chat message. Stop speaking cuts the sound immediately and drops anything still queued. Starting the microphone does the same. Stopping speech does not stop the model from writing the reply. Closing EVA stops the worker with the Java process.

A reply is split into sentences after it is complete, so the next sentence can be synthesized while the current one plays. Speaking in the middle of token streaming is not implemented. Fenced code is replaced with "code block omitted". Long links become "a link". The transcript on screen is unchanged.

EVA does not download Python, the packages, or the weights. Install them yourself and leave them out of git:

```powershell
py -3.12 -m venv C:\Tools\kokoro\venv
C:\Tools\kokoro\venv\Scripts\python.exe -m pip install -r speech\kokoro\requirements.txt
```

Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx `model-files-v1.1` release. Put the four paths in `.env`. The worker can be the repository-relative path `speech/kokoro/worker.py`.

```text
EVA_KOKORO_PYTHON=C:\Tools\kokoro\venv\Scripts\python.exe
EVA_KOKORO_WORKER=speech/kokoro/worker.py
EVA_KOKORO_MODEL=C:\Tools\kokoro\kokoro-v1.0.onnx
EVA_KOKORO_VOICES=C:\Tools\kokoro\voices-v1.0.bin
```

The same names still work as operating-system variables, and those win over `.env`. The OpenAI key, when you use one, can live in `.env` as `EVA_OPENAI_API_KEY`. It is passed only to the Java process. Speech workers do not receive it, and it is not sent to the window. Do not commit `.env`.

Use the absolute path of this checkout for the worker when you set it from the shell. The Python path must be `python.exe` or `python3.exe`. The worker file must be named `worker.py`. The weights must use those two file names. Do not install `onnxruntime-gpu`; the CPU runtime leaves the AMD GPU free for Ollama.

Kokoro-82M is Apache-2.0. kokoro-onnx and onnxruntime are MIT. phonemizer and espeak-ng, which the worker uses for pronunciation, are GPL-3. They stay in the virtual environment you install. EVA does not ship them.

If the paths are missing, Listen says so and chat continues.

## Audio devices

Open **Audio** in the conversation panel to choose the microphone and the speaker independently. **System default** follows the Windows default device. It is not a saved physical id, so a later change in Windows Sound settings is picked up the next time EVA records or speaks.

Choosing a named microphone uses that device for Speak. Changing it while a recording is in progress discards that recording; EVA does not switch devices halfway through. **Test microphone** shows a live level and then stops. The test is not sent to Whisper, Ollama, OpenAI, or Kokoro, and it is not stored. Closing Audio, stopping the test, or starting Speak releases the microphone. EVA does not open the microphone when it launches or when the panel is opened. If device names are blank, **Allow audio access** opens the microphone once so the browser can reveal them, then closes it. **Refresh devices** asks the operating system again.

Listen, automatic replies, voice preview, and **Test output** share one playback path and the existing volume slider. There is not a second volume control. Changing the speaker stops the sound that is playing and applies the new device to the next sound. The written reply keeps going. If the selected speaker is unplugged, playback stops and EVA does not continue through another device until you choose one, including System default. When that same device id comes back, EVA arms it again and does not start recording or playback by itself. A matching display name is not treated as the same device.

The choice is stored in `audio-device-preferences.json` in Electron's user-data directory. Missing or invalid files fall back to System default. Existing speech and voice preference files are left as they are. Device ids are not sent to the AI provider and are not written to the log.

EVA runs on Electron 45.4.1. That Chromium build provides `navigator.mediaDevices.enumerateDevices()`, `getUserMedia()` with a `deviceId` constraint, `devicechange`, and `AudioContext.setSinkId()`. Playback stays on the existing Web Audio graph, so EVA routes that context instead of an `<audio>` element. The trusted window may receive microphone audio and `speaker-selection`. Camera, screen capture, and other device permissions stay denied. If `setSinkId` is missing, a chosen speaker is refused and System default can still play.

On Windows, USB microphones, USB headsets, Bluetooth headphones, and HDMI outputs appear when the OS exposes them. A headset often shows up as one input and one output. If a device is missing, check Settings, System, Sound, then Refresh devices in EVA. Bluetooth stacks sometimes issue a new device id; pick the device again if the saved one stays unavailable.

## Privacy and limits

- Local is the default. Nothing in a conversation is sent to OpenAI unless that send has cloud mode enabled. Microphone audio is never sent to OpenAI.
- The system prompt lives in `backend/src/main/resources/personality/eva-system-prompt.txt`. It is the only extra instruction added to a request. EVA does not attach files, mail, calendar data, or a user profile.
- Transcript context is in memory in the Java process. New conversation clears it. Restarting EVA clears it. There is no database.
- A message is limited to 4,000 characters. The remembered context is at most 16 messages and 8,000 characters.
- Replies stream as they are generated. The transcript appends each new piece once, and the orb stays `processing` until the first piece, then `responding` until the reply finishes. One reply at a time; a second send while one is running is rejected. Stop ends the stream immediately. The question stays in the transcript, any partial reply stays and is marked Stopped, and the input is cleared so the next question can be sent. A stopped partial is not sent to the model as a completed answer. The question is. If stop happens before any text, the question stays and there is no empty assistant bubble.
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

Voice replies, wake-word activation, always-on listening, computer automation, tool execution, Gmail, calendar, permanent memory, SQLite, background tasks, and cloud hosting are not in this milestone. A later capability needs its own IPC channel and backend route, and both should keep the checks above.

## License

[MIT](LICENSE)
