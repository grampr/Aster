import { afterEach, describe, expect, it, vi } from "vitest";
import type RealtimeKitClient from "@cloudflare/realtimekit";
import { createVoiceMediaSession, LocalVoiceMediaSession, RealtimeKitVoiceMediaSession } from "./mediaSession";
import type { VoiceSession } from "../auth/types";

type FakeTrack = MediaStreamTrack & { enabled: boolean; stopped: boolean; onended: (() => void) | null };

function fakeTrack(): FakeTrack {
  return { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } } as FakeTrack;
}

function fakeStream(audio: FakeTrack[] = [], video: FakeTrack[] = []): MediaStream {
  return {
    getTracks: () => [...audio, ...video],
    getAudioTracks: () => audio,
    getVideoTracks: () => video,
  } as unknown as MediaStream;
}

class FakeEmitter {
  private readonly listeners = new Map<string, Set<() => void>>();

  on(event: string, listener: () => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("LocalVoiceMediaSession", () => {
  it("controls microphone, camera, screen share, and releases every track", async () => {
    const microphone = fakeTrack();
    const camera = fakeTrack();
    const screen = fakeTrack();
    const audioStream = fakeStream([microphone]);
    const videoStream = fakeStream([], [camera]);
    const screenStream = fakeStream([], [screen]);
    const devices = {
      getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => constraints.audio ? audioStream : videoStream),
      getDisplayMedia: vi.fn(async () => screenStream),
    } as unknown as MediaDevices;
    const session = new LocalVoiceMediaSession(devices);

    await session.connect(false, false);
    expect(devices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    await session.setMuted(true);
    expect(microphone.enabled).toBe(false);
    await session.setVideo(true);
    await session.setScreenShare(true);
    expect(session.snapshot()).toMatchObject({ muted: true, video: true, screenShare: true });
    expect(session.snapshot().surfaces.map((surface) => surface.kind)).toEqual(["screen", "camera"]);

    screen.onended?.();
    expect(session.snapshot().screenShare).toBe(false);
    await session.disconnect();
    expect(camera.stopped).toBe(true);
    expect(screen.stopped).toBe(true);
    expect(session.snapshot().surfaces).toEqual([]);
  });
});

describe("createVoiceMediaSession", () => {
  const baseSession = {
    id: "session-1",
    credential: "credential",
    endpoint: "aster-local://media",
    expires_at: "2026-09-04T10:00:00Z",
    state: {
      user_id: "user-1",
      channel_id: "channel-1",
      session_id: "session-1",
      self_mute: false,
      self_deaf: false,
      self_video: false,
      self_stream: false,
      updated_at: "2026-09-04T09:00:00Z",
    },
  } as Omit<VoiceSession, "provider">;

  it("selects the local media adapter", () => {
    expect(createVoiceMediaSession({ ...baseSession, provider: "aster-local" })).toBeInstanceOf(LocalVoiceMediaSession);
  });

  it("rejects an unknown provider", () => {
    expect(() => createVoiceMediaSession({ ...baseSession, provider: "unknown" })).toThrow("未対応のVoice Provider");
  });
});

describe("RealtimeKitVoiceMediaSession", () => {
  it("connects with a participant token and reflects remote camera and screen tracks", async () => {
    const camera = fakeTrack();
    const screen = fakeTrack();
    const remote = Object.assign(new FakeEmitter(), {
      id: "peer-2",
      name: "みさき",
      audioTrack: null,
      videoTrack: camera,
      screenShareTracks: { video: screen, audio: null },
      audioEnabled: false,
      videoEnabled: true,
      screenShareEnabled: true,
    });
    const participants: typeof remote[] = [];
    const joined = Object.assign(new FakeEmitter(), {
      values: () => participants.values(),
    });
    const self = Object.assign(new FakeEmitter(), {
      audioEnabled: false,
      videoEnabled: false,
      screenShareEnabled: false,
      videoTrack: null,
      screenShareTracks: { video: null, audio: null },
      enableAudio: vi.fn(async () => { self.audioEnabled = true; }),
      disableAudio: vi.fn(async () => { self.audioEnabled = false; }),
      enableVideo: vi.fn(async () => { self.videoEnabled = true; }),
      disableVideo: vi.fn(async () => { self.videoEnabled = false; }),
      enableScreenShare: vi.fn(async () => { self.screenShareEnabled = true; }),
      disableScreenShare: vi.fn(async () => { self.screenShareEnabled = false; }),
      playAudio: vi.fn(async () => undefined),
    });
    const client = {
      self,
      participants: { joined },
      join: vi.fn(async () => undefined),
      leave: vi.fn(async () => undefined),
    } as unknown as RealtimeKitClient;
    const createClient = vi.fn(async () => client);
    vi.stubGlobal("MediaStream", class {
      constructor(readonly tracks: MediaStreamTrack[]) {}
    });

    const session = new RealtimeKitVoiceMediaSession("participant-token", createClient);
    await session.connect(true, false);

    expect(createClient).toHaveBeenCalledWith("participant-token");
    expect(client.join).toHaveBeenCalledOnce();
    expect(self.playAudio).toHaveBeenCalledOnce();
    expect(session.snapshot().surfaces).toEqual([]);

    participants.push(remote);
    joined.emit("participantJoined");
    expect(session.snapshot().surfaces.map((surface) => [surface.id, surface.kind])).toEqual([
      ["peer-2:screen", "screen"],
      ["peer-2:camera", "camera"],
    ]);

    await session.setMuted(false);
    expect(self.enableAudio).toHaveBeenCalledOnce();
    await session.disconnect();
    expect(client.leave).toHaveBeenCalledOnce();
    expect(session.snapshot().surfaces).toEqual([]);
  });
});
