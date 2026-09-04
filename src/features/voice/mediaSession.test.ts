import { describe, expect, it, vi } from "vitest";
import { createVoiceMediaSession, LocalVoiceMediaSession } from "./mediaSession";
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
