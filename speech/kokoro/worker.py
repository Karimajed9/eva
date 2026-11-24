"""Resident Kokoro worker. One model load, then stdin requests and stdout audio.

Diagnostics go to stderr only. This process never downloads a model and never
reads EVA's session token or OpenAI key.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["PYTHONUTF8"] = "1"

VOICES = {
    "af_heart": "en-us",
    "af_bella": "en-us",
    "af_nova": "en-us",
    "af_sarah": "en-us",
    "bf_emma": "en-gb",
    "ff_siwis": "fr-fr",
}
MAX_TEXT = 500
SAMPLE_RATE = 24000
cancel = threading.Event()
write_lock = threading.Lock()


def emit(payload: dict) -> None:
    line = json.dumps(payload, separators=(",", ":")).encode("utf-8") + b"\n"
    with write_lock:
        sys.stdout.buffer.write(line)
        sys.stdout.buffer.flush()


def fail(request_id: str, code: str) -> None:
    emit({"type": "result", "id": request_id, "ok": False, "code": code})


def main() -> int:
    model = os.environ.get("EVA_KOKORO_MODEL", "")
    voices = os.environ.get("EVA_KOKORO_VOICES", "")
    if not model or not voices or not os.path.isfile(model) or not os.path.isfile(voices):
        emit({"type": "ready", "ok": False, "code": "missing-model"})
        return 0
    started = time.perf_counter()
    try:
        from kokoro_onnx import Kokoro
        engine = Kokoro(model, voices)
    except Exception:
        print("kokoro_import_failed", file=sys.stderr)
        emit({"type": "ready", "ok": False, "code": "missing-runtime"})
        return 0
    load_ms = int((time.perf_counter() - started) * 1000)
    print(f"load_ms={load_ms}", file=sys.stderr)
    emit({"type": "ready", "ok": True, "loadMs": load_ms})
    busy = threading.Lock()
    for raw in sys.stdin:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            continue
        op = message.get("op")
        if op == "shutdown":
            cancel.set()
            return 0
        if op == "cancel":
            cancel.set()
            continue
        if op != "synthesize":
            continue
        request_id = message.get("id")
        if not isinstance(request_id, str) or len(request_id) > 80:
            continue
        if not busy.acquire(blocking=False):
            fail(request_id, "busy")
            continue

        def run(current=message, ident=request_id) -> None:
            try:
                synthesize(engine, current, ident, load_ms)
            finally:
                busy.release()

        threading.Thread(target=run, name="eva-kokoro-synth", daemon=True).start()
    return 0


def synthesize(engine, message: dict, request_id: str, load_ms: int) -> None:
    cancel.clear()
    voice = message.get("voice")
    speed = message.get("speed")
    text = message.get("text")
    lang = VOICES.get(voice)
    if lang is None or not isinstance(text, str) or len(text) == 0 or len(text) > MAX_TEXT:
        fail(request_id, "invalid-speech")
        return
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or speed < 0.5 or speed > 1.5:
        fail(request_id, "invalid-speech")
        return
    if message.get("lang") not in (None, lang):
        fail(request_id, "invalid-speech")
        return
    if cancel.is_set():
        fail(request_id, "cancelled")
        return
    started = time.perf_counter()
    try:
        samples, rate = engine.create(text, voice=voice, speed=float(speed), lang=lang)
    except Exception:
        print("kokoro_synth_failed", file=sys.stderr)
        fail(request_id, "engine-error")
        return
    if cancel.is_set():
        fail(request_id, "cancelled")
        return
    if rate != SAMPLE_RATE:
        fail(request_id, "engine-error")
        return
    import numpy as np
    audio = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    pcm = (audio * 32767.0).astype(np.int16).tobytes()
    samples_count = len(pcm) // 2
    if samples_count < SAMPLE_RATE // 20 or samples_count > SAMPLE_RATE * 180:
        fail(request_id, "engine-error")
        return
    elapsed = int((time.perf_counter() - started) * 1000)
    print(f"synth_ms={elapsed}", file=sys.stderr)
    with write_lock:
        header = json.dumps({
            "type": "result",
            "id": request_id,
            "ok": True,
            "sampleRate": SAMPLE_RATE,
            "samples": samples_count,
            "elapsedMs": elapsed,
            "loadMs": 0,
        }, separators=(",", ":")).encode("utf-8") + b"\n"
        sys.stdout.buffer.write(header)
        sys.stdout.buffer.write(pcm)
        sys.stdout.buffer.flush()
    del load_ms


if __name__ == "__main__":
    sys.exit(main())
