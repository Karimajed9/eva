import { useEffect } from "react";
import { SYSTEM_AUDIO_DEVICE } from "../../../shared/audio-device-preferences";
import type { VoiceView } from "./useVoice";
import { deviceOptionLabel, type AudioDeviceView } from "./useAudioDevices";

export function meterPercent(level: number): number {
  if (!Number.isFinite(level) || level <= 0) {
    return 0;
  }
  return Math.round(Math.min(1, Math.sqrt(level)) * 100);
}

export function MicLevelMeter({ level }: { level: number }) {
  const percent = meterPercent(level);
  return (
    <label>
      Microphone level
      <div className="level-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </label>
  );
}

export function AudioDeviceSettings({ devices, voice, microphoneLevel = 0 }: { devices: AudioDeviceView; voice: VoiceView; microphoneLevel?: number }) {
  useEffect(() => () => {
    devices.stopProbe();
  }, [devices.stopProbe]);

  return (
    <div className="speech-tools">
      <label>
        Input device
        <select
          aria-label="Input device"
          value={devices.inputDeviceId}
          disabled={!devices.ready}
          onChange={(event) => devices.setInput(event.target.value)}
        >
          <option value={SYSTEM_AUDIO_DEVICE}>System default</option>
          {devices.inputMissing ? <option value={devices.inputDeviceId}>Saved microphone (unavailable)</option> : null}
          {devices.inputs.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>{deviceOptionLabel(device, index, "Microphone")}</option>
          ))}
        </select>
      </label>
      {devices.ready ? null : <p className="device-note">{devices.notice || "Checking audio devices."}</p>}
      <p className="device-note">Changing the microphone discards a recording that is already in progress.</p>
      {devices.inputMissing ? (
        <p className="device-note">The selected microphone is disconnected. New recordings use the system default until it returns.</p>
      ) : null}
      <MicLevelMeter level={devices.probing ? devices.probeLevel : microphoneLevel} />
      <div className="device-actions">
        {devices.probing ? (
          <button type="button" onClick={devices.stopProbe}>Stop test</button>
        ) : (
          <button type="button" onClick={devices.startProbe} disabled={!devices.ready}>Test microphone</button>
        )}
        <button type="button" onClick={devices.refresh}>Refresh devices</button>
      </div>
      {devices.labelsReady ? null : (
        <p className="device-note">
          Device names stay hidden until microphone access is allowed.
          <button type="button" onClick={devices.allowAccess}>Allow audio access</button>
        </p>
      )}
      <label>
        Output device
        <select
          aria-label="Output device"
          value={devices.outputDeviceId}
          disabled={!devices.ready}
          onChange={(event) => devices.setOutput(event.target.value)}
        >
          <option value={SYSTEM_AUDIO_DEVICE}>System default</option>
          {devices.outputMissing ? <option value={devices.outputDeviceId}>Saved speaker (unavailable)</option> : null}
          {devices.outputs.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>{deviceOptionLabel(device, index, "Speaker")}</option>
          ))}
        </select>
      </label>
      {devices.outputMissing ? (
        <p className="device-note">The selected speaker is disconnected. EVA will not play through another device until you pick one.</p>
      ) : null}
      <label>
        Volume
        <input
          aria-label="Playback volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={voice.volume}
          onChange={(event) => voice.setVolume(Number(event.target.value))}
        />
      </label>
      <button type="button" onClick={() => {
        devices.stopProbe();
        voice.preview();
      }}
      >
        Test output
      </button>
      {devices.ready && devices.notice ? <p className="device-note">{devices.notice}</p> : null}
    </div>
  );
}
