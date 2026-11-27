import {
  defaultAudioDevicePreferences,
  SYSTEM_AUDIO_DEVICE,
  type AudioDevicePreferences,
} from "../../../shared/audio-device-preferences";
import {
  isLatestTicket,
  labelsAvailable,
  listedDevices,
  microphoneConstraints,
  routeInput,
  routeOutput,
  sinkIdFor,
  type ListedDevice,
  type MicrophoneAudioConstraints,
} from "../../../shared/audio-devices";
import { audioDeviceActions, type AudioDeviceActions } from "./audio-device-actions";
import { failAudioRoute, markAudioRouteSettled, setCaptureDevice, setPlaybackRoute } from "./audio-route";

export interface OpenInput {
  level(): number;
  stop(): void;
  onEnded(listener: () => void): void;
}

export interface AudioDevicePorts {
  enumerate(): Promise<ListedDevice[]>;
  openInput(constraints: MicrophoneAudioConstraints): Promise<OpenInput>;
  readPreferences(): Promise<AudioDevicePreferences>;
  writePreferences(preferences: AudioDevicePreferences): Promise<AudioDevicePreferences>;
}

export interface AudioDeviceSnapshot {
  inputs: ListedDevice[];
  outputs: ListedDevice[];
  inputDeviceId: string;
  outputDeviceId: string;
  inputMissing: boolean;
  outputMissing: boolean;
  labelsReady: boolean;
  ready: boolean;
  probing: boolean;
  probeLevel: number;
  notice: string;
}

type RefreshOrigin = "load" | "user" | "devicechange";

let activeModel: AudioDeviceModel | null = null;

export function attachAudioDeviceModel(model: AudioDeviceModel | null): void {
  activeModel = model;
}

export function stopActiveProbe(): void {
  activeModel?.stopProbe();
}

export class AudioDeviceModel {
  private preferences: AudioDevicePreferences = { ...defaultAudioDevicePreferences };
  private inputs: ListedDevice[] = [];
  private outputs: ListedDevice[] = [];
  private inputMissing = false;
  private outputMissing = false;
  private outputHeld = false;
  private settled = false;
  private probing = false;
  private probeLevel = 0;
  private notice = "";
  private listTicket = 0;
  private saveTicket = 0;
  private sinkTicket = 0;
  private probeTicket = 0;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probeHandle: OpenInput | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly ports: AudioDevicePorts,
    private readonly actions: AudioDeviceActions = audioDeviceActions(),
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): AudioDeviceSnapshot {
    return {
      inputs: this.inputs,
      outputs: this.outputs,
      inputDeviceId: this.preferences.inputDeviceId,
      outputDeviceId: this.preferences.outputDeviceId,
      inputMissing: this.inputMissing,
      outputMissing: this.outputMissing,
      labelsReady: labelsAvailable([...this.inputs, ...this.outputs]),
      ready: this.settled,
      probing: this.probing,
      probeLevel: this.probeLevel,
      notice: this.notice,
    };
  }

  captureId(): string {
    return routeInput(this.preferences.inputDeviceId, this.inputs).captureDeviceId;
  }

  playbackAllowed(): boolean {
    return this.settled && !this.outputHeld;
  }

  async load(): Promise<void> {
    try {
      this.preferences = await this.ports.readPreferences();
    } catch {
      this.preferences = { ...defaultAudioDevicePreferences };
      this.notice = "Audio device settings could not be read.";
    }
    await this.refresh("load");
  }

  async refresh(origin: RefreshOrigin): Promise<void> {
    const ticket = ++this.listTicket;
    let devices: ListedDevice[] = [];
    try {
      devices = await this.ports.enumerate();
    } catch {
      if (!isLatestTicket(ticket, this.listTicket)) {
        return;
      }
      this.notice = "Audio devices could not be listed.";
      if (!this.settled) {
        failAudioRoute();
      }
      this.emit();
      return;
    }
    if (!isLatestTicket(ticket, this.listTicket)) {
      return;
    }
    this.applyCatalog(devices, origin);
  }

  async selectInput(deviceId: string): Promise<void> {
    if (!this.settled || !this.known(deviceId, this.inputs)) {
      return;
    }
    if (this.actions.captureBusy()) {
      this.actions.discardRecording("The microphone changed, so this recording was discarded. Start again to use the new one.");
    }
    await this.save({ ...this.preferences, inputDeviceId: deviceId });
  }

  async selectOutput(deviceId: string): Promise<void> {
    if (!this.settled || !this.known(deviceId, this.outputs)) {
      return;
    }
    const changed = deviceId !== this.preferences.outputDeviceId;
    if (changed && this.actions.speaking()) {
      this.actions.stopPlayback("Playback stopped so the next sound uses the selected speaker.");
    }
    await this.save({ ...this.preferences, outputDeviceId: deviceId });
    if (this.outputHeld) {
      this.notice = "The selected speaker is disconnected. Choose a device or system default to speak again.";
      this.emit();
      return;
    }
    const ticket = ++this.sinkTicket;
    const result = await this.actions.applySink(sinkIdFor(deviceId));
    if (!isLatestTicket(ticket, this.sinkTicket)) {
      return;
    }
    if (result === "failed") {
      this.notice = "EVA could not use the selected speaker.";
    } else if (result === "unsupported" && deviceId !== SYSTEM_AUDIO_DEVICE) {
      this.notice = "This EVA build cannot route audio to a chosen speaker. Sound stays on the system default.";
    } else if (changed) {
      this.notice = "";
    }
    this.emit();
  }

  async allowAccess(): Promise<void> {
    if (!this.settled) {
      this.notice = "Checking audio devices.";
      this.emit();
      return;
    }
    this.stopProbe();
    try {
      const handle = await this.ports.openInput(microphoneConstraints(SYSTEM_AUDIO_DEVICE));
      handle.stop();
      this.notice = "";
    } catch {
      this.notice = "Microphone permission was denied. Device names stay hidden.";
      this.emit();
      return;
    }
    await this.refresh("user");
  }

  async startProbe(): Promise<void> {
    if (!this.settled) {
      this.notice = "Checking audio devices.";
      this.emit();
      return;
    }
    if (this.actions.captureBusy()) {
      this.notice = "Stop the conversation recording before testing the microphone.";
      this.emit();
      return;
    }
    if (this.actions.speaking()) {
      this.actions.stopPlayback("Speech stopped so the microphone test does not pick it up.");
    }
    this.stopProbe();
    const ticket = ++this.probeTicket;
    let handle: OpenInput;
    try {
      handle = await this.ports.openInput(microphoneConstraints(this.captureId()));
    } catch {
      if (isLatestTicket(ticket, this.probeTicket)) {
        this.notice = "The microphone could not be opened for a test.";
        this.emit();
      }
      return;
    }
    if (!isLatestTicket(ticket, this.probeTicket)) {
      handle.stop();
      return;
    }
    this.probeHandle = handle;
    this.probing = true;
    this.notice = "Microphone test. Nothing is saved or sent.";
    handle.onEnded(() => {
      if (!isLatestTicket(ticket, this.probeTicket)) {
        return;
      }
      this.stopProbe();
      this.notice = "The microphone was disconnected.";
      this.emit();
    });
    this.probeTimer = setInterval(() => {
      if (!this.probeHandle) {
        return;
      }
      this.probeLevel = this.probeHandle.level();
      this.emit();
    }, 100);
    this.emit();
  }

  stopProbe(): void {
    this.probeTicket += 1;
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    this.probeHandle?.stop();
    this.probeHandle = null;
    if (this.probing) {
      this.probing = false;
      this.probeLevel = 0;
      this.emit();
    }
  }

  dispose(): void {
    this.listTicket += 1;
    this.sinkTicket += 1;
    this.stopProbe();
  }

  private known(deviceId: string, devices: readonly ListedDevice[]): boolean {
    return deviceId === SYSTEM_AUDIO_DEVICE || devices.some((device) => device.deviceId === deviceId);
  }

  private async save(next: AudioDevicePreferences): Promise<void> {
    const ticket = ++this.saveTicket;
    this.preferences = next;
    this.publishRoute();
    this.emit();
    try {
      const stored = await this.ports.writePreferences(next);
      if (!isLatestTicket(ticket, this.saveTicket)) {
        return;
      }
      this.preferences = stored;
      this.publishRoute();
    } catch {
      if (isLatestTicket(ticket, this.saveTicket)) {
        this.notice = "Audio device settings could not be saved.";
      }
    }
    this.emit();
  }

  private applyCatalog(devices: readonly ListedDevice[], origin: RefreshOrigin): void {
    const beforeInputMissing = this.inputMissing;
    const beforeHeld = this.outputHeld;
    this.inputs = listedDevices(devices, "audioinput");
    this.outputs = listedDevices(devices, "audiooutput");
    this.publishRoute();
    if (!this.settled) {
      this.settled = true;
      if (this.notice === "Audio devices could not be listed.") {
        this.notice = "";
      }
      markAudioRouteSettled();
      this.emit();
      return;
    }
    if (this.inputMissing && !beforeInputMissing && this.actions.captureBusy()) {
      this.actions.discardRecording("The microphone was disconnected. This recording was discarded.");
    }
    if (!this.inputMissing && beforeInputMissing && origin === "devicechange") {
      this.notice = "The selected microphone is available again.";
    }
    if (this.outputHeld && !beforeHeld) {
      this.actions.stopPlayback("The selected speaker was disconnected. EVA will not continue through another device.");
      this.notice = "The selected speaker is disconnected. Choose a device or system default to speak again.";
    } else if (!this.outputHeld && beforeHeld && origin === "devicechange") {
      this.notice = "The selected speaker is available again.";
      const ticket = ++this.sinkTicket;
      void this.actions.applySink(sinkIdFor(this.preferences.outputDeviceId)).then(() => {
        if (!isLatestTicket(ticket, this.sinkTicket)) {
          return;
        }
        this.emit();
      });
    }
    this.emit();
  }

  private publishRoute(): void {
    const input = routeInput(this.preferences.inputDeviceId, this.inputs);
    const output = routeOutput(this.preferences.outputDeviceId, this.outputs);
    this.inputMissing = input.missing;
    this.outputMissing = output.missing;
    this.outputHeld = output.hold;
    setCaptureDevice(input.captureDeviceId);
    setPlaybackRoute(output.hold ? "" : output.sinkId, !output.hold);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
