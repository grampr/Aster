import type { VoiceSession } from "../auth/types";
import type RealtimeKitClient from "@cloudflare/realtimekit";
import type { RTKParticipant } from "@cloudflare/realtimekit";

export type VoiceMediaSurface = {
  id: string;
  name: string;
  kind: "camera" | "screen";
  stream: MediaStream;
  local: boolean;
};

export type VoiceMediaSnapshot = {
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screenShare: boolean;
  surfaces: VoiceMediaSurface[];
};

export interface VoiceMediaSession {
  connect(initialMute: boolean, initialDeaf: boolean): Promise<void>;
  setMuted(value: boolean): Promise<void>;
  setDeafened(value: boolean): Promise<void>;
  setVideo(value: boolean): Promise<void>;
  setScreenShare(value: boolean): Promise<void>;
  disconnect(): Promise<void>;
  snapshot(): VoiceMediaSnapshot;
  subscribe(listener: (snapshot: VoiceMediaSnapshot) => void): () => void;
}

type RealtimeKitClientFactory = (credential: string) => Promise<RealtimeKitClient>;

type MutableSnapshot = VoiceMediaSnapshot;

abstract class ObservableVoiceSession implements VoiceMediaSession {
  protected state: MutableSnapshot = { muted: false, deafened: false, video: false, screenShare: false, surfaces: [] };
  private readonly listeners = new Set<(snapshot: VoiceMediaSnapshot) => void>();

  abstract connect(initialMute: boolean, initialDeaf: boolean): Promise<void>;
  abstract setMuted(value: boolean): Promise<void>;
  abstract setDeafened(value: boolean): Promise<void>;
  abstract setVideo(value: boolean): Promise<void>;
  abstract setScreenShare(value: boolean): Promise<void>;
  abstract disconnect(): Promise<void>;

  snapshot(): VoiceMediaSnapshot {
    return { ...this.state, surfaces: [...this.state.surfaces] };
  }

  subscribe(listener: (snapshot: VoiceMediaSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  protected emit(next: Partial<MutableSnapshot> = {}): void {
    this.state = { ...this.state, ...next };
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export class LocalVoiceMediaSession extends ObservableVoiceSession {
  private audioStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  constructor(
    private readonly devices: MediaDevices | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
  ) {
    super();
  }

  async connect(initialMute: boolean, initialDeaf: boolean): Promise<void> {
    this.emit({ muted: initialMute, deafened: initialDeaf });
    if (!initialMute) await this.ensureAudio();
  }

  async setMuted(value: boolean): Promise<void> {
    if (!value) await this.ensureAudio();
    for (const track of this.audioStream?.getAudioTracks() ?? []) track.enabled = !value;
    this.emit({ muted: value });
  }

  async setDeafened(value: boolean): Promise<void> {
    this.emit({ deafened: value });
  }

  async setVideo(value: boolean): Promise<void> {
    if (value && !this.videoStream) this.videoStream = await this.requireDevices().getUserMedia({ video: true });
    if (!value) {
      stopStream(this.videoStream);
      this.videoStream = null;
    }
    this.emit({ video: value, surfaces: this.buildSurfaces() });
  }

  async setScreenShare(value: boolean): Promise<void> {
    if (value && !this.screenStream) {
      const devices = this.requireDevices();
      if (typeof devices.getDisplayMedia !== "function") throw new Error("この環境は画面共有に対応していません。");
      this.screenStream = await devices.getDisplayMedia({ video: true, audio: true });
      const [track] = this.screenStream.getVideoTracks();
      if (track) track.onended = () => {
        stopStream(this.screenStream);
        this.screenStream = null;
        this.emit({ screenShare: false, surfaces: this.buildSurfaces() });
      };
    }
    if (!value) {
      stopStream(this.screenStream);
      this.screenStream = null;
    }
    this.emit({ screenShare: value, surfaces: this.buildSurfaces() });
  }

  async disconnect(): Promise<void> {
    stopStream(this.audioStream);
    stopStream(this.videoStream);
    stopStream(this.screenStream);
    this.audioStream = null;
    this.videoStream = null;
    this.screenStream = null;
    this.emit({ muted: true, deafened: false, video: false, screenShare: false, surfaces: [] });
  }

  private async ensureAudio(): Promise<void> {
    if (!this.audioStream) this.audioStream = await this.requireDevices().getUserMedia({ audio: true });
  }

  private requireDevices(): MediaDevices {
    if (!this.devices) throw new Error("この環境はメディアデバイスに対応していません。");
    return this.devices;
  }

  private buildSurfaces(): VoiceMediaSurface[] {
    const surfaces: VoiceMediaSurface[] = [];
    if (this.screenStream) surfaces.push({ id: "local-screen", name: "あなたの画面", kind: "screen", stream: this.screenStream, local: true });
    if (this.videoStream) surfaces.push({ id: "local-camera", name: "あなた", kind: "camera", stream: this.videoStream, local: true });
    return surfaces;
  }
}

export class RealtimeKitVoiceMediaSession extends ObservableVoiceSession {
  private client: RealtimeKitClient | null = null;
  private readonly cleanups: Array<() => void> = [];
  private readonly observedParticipantIds = new Set<string>();

  constructor(
    private readonly credential: string,
    private readonly createClient: RealtimeKitClientFactory = initializeRealtimeKitClient,
  ) {
    super();
  }

  async connect(initialMute: boolean, initialDeaf: boolean): Promise<void> {
    this.client = await this.createClient(this.credential);
    await this.client.join();
    this.observeParticipantMap();
    this.observeSelf();
    if (!initialMute) await this.client.self.enableAudio();
    try {
      await this.client.self.playAudio();
    } catch {
      // Browser autoplay policy can require a later user gesture; joining itself remains valid.
    }
    await this.setDeafened(initialDeaf);
    this.refresh();
  }

  async setMuted(value: boolean): Promise<void> {
    const client = this.requireClient();
    if (value) await client.self.disableAudio();
    else await client.self.enableAudio();
    this.refresh();
  }

  async setDeafened(value: boolean): Promise<void> {
    const client = this.requireClient();
    for (const participant of client.participants.joined.values()) {
      if (participant.audioTrack) participant.audioTrack.enabled = !value;
    }
    this.emit({ deafened: value });
  }

  async setVideo(value: boolean): Promise<void> {
    const client = this.requireClient();
    if (value) await client.self.enableVideo();
    else await client.self.disableVideo();
    this.refresh();
  }

  async setScreenShare(value: boolean): Promise<void> {
    const client = this.requireClient();
    if (value) await client.self.enableScreenShare();
    else await client.self.disableScreenShare();
    this.refresh();
  }

  async disconnect(): Promise<void> {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.observedParticipantIds.clear();
    if (this.client) await this.client.leave();
    this.client = null;
    this.emit({ muted: true, deafened: false, video: false, screenShare: false, surfaces: [] });
  }

  private observeSelf(): void {
    const self = this.requireClient().self;
    const refresh = () => this.refresh();
    self.on("audioUpdate", refresh);
    self.on("videoUpdate", refresh);
    self.on("screenShareUpdate", refresh);
    this.cleanups.push(() => {
      self.off("audioUpdate", refresh);
      self.off("videoUpdate", refresh);
      self.off("screenShareUpdate", refresh);
    });
  }

  private observeParticipantMap(): void {
    const joined = this.requireClient().participants.joined;
    const refresh = () => {
      this.observeRemoteParticipants();
      this.refresh();
    };
    joined.on("participantJoined", refresh);
    joined.on("participantLeft", refresh);
    this.cleanups.push(() => {
      joined.off("participantJoined", refresh);
      joined.off("participantLeft", refresh);
    });
    this.observeRemoteParticipants();
  }

  private observeRemoteParticipants(): void {
    const client = this.requireClient();
    for (const participant of client.participants.joined.values()) {
      if (this.observedParticipantIds.has(participant.id)) continue;
      this.observedParticipantIds.add(participant.id);
      if (this.state.deafened && participant.audioTrack) participant.audioTrack.enabled = false;
      const refresh = () => this.refresh();
      participant.on("videoUpdate", refresh);
      participant.on("screenShareUpdate", refresh);
      const cleanup = () => {
        participant.off("videoUpdate", refresh);
        participant.off("screenShareUpdate", refresh);
        this.observedParticipantIds.delete(participant.id);
      };
      this.cleanups.push(cleanup);
    }
  }

  private refresh(): void {
    const client = this.client;
    if (!client) return;
    const surfaces: VoiceMediaSurface[] = [];
    if (client.self.screenShareEnabled && client.self.screenShareTracks.video) {
      surfaces.push({ id: "local-screen", name: "あなたの画面", kind: "screen", stream: new MediaStream([client.self.screenShareTracks.video]), local: true });
    }
    if (client.self.videoEnabled && client.self.videoTrack) {
      surfaces.push({ id: "local-camera", name: "あなた", kind: "camera", stream: new MediaStream([client.self.videoTrack]), local: true });
    }
    for (const participant of client.participants.joined.values()) this.addParticipantSurfaces(surfaces, participant);
    this.emit({
      muted: !client.self.audioEnabled,
      video: client.self.videoEnabled,
      screenShare: client.self.screenShareEnabled,
      surfaces,
    });
  }

  private addParticipantSurfaces(surfaces: VoiceMediaSurface[], participant: RTKParticipant): void {
    if (participant.screenShareEnabled && participant.screenShareTracks.video) {
      surfaces.push({ id: `${participant.id}:screen`, name: `${participant.name}の画面`, kind: "screen", stream: new MediaStream([participant.screenShareTracks.video]), local: false });
    }
    if (participant.videoEnabled && participant.videoTrack) {
      surfaces.push({ id: `${participant.id}:camera`, name: participant.name, kind: "camera", stream: new MediaStream([participant.videoTrack]), local: false });
    }
  }

  private requireClient(): RealtimeKitClient {
    if (!this.client) throw new Error("Voice Sessionへ接続していません。");
    return this.client;
  }
}

async function initializeRealtimeKitClient(credential: string): Promise<RealtimeKitClient> {
  const { default: Client } = await import("@cloudflare/realtimekit");
  return Client.init({ authToken: credential, defaults: { audio: false, video: false } });
}

export function createVoiceMediaSession(session: VoiceSession): VoiceMediaSession {
  if (session.provider === "aster-local") return new LocalVoiceMediaSession();
  if (session.provider === "cloudflare-realtimekit") return new RealtimeKitVoiceMediaSession(session.credential);
  throw new Error(`未対応のVoice Providerです: ${session.provider}`);
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
