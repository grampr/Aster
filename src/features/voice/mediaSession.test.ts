import { describe, expect, it, vi } from "vitest";
import { createVoiceMediaSession, LiveKitVoiceMediaSession, LocalVoiceMediaSession } from "./mediaSession";
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

describe("LiveKitVoiceMediaSession", () => {
  type Handler = (...args: unknown[]) => void;

  function fakeLiveKit() {
    const handlers = new Map<string, Set<Handler>>();
    const localCamera = { kind: "video", source: "camera", isMuted: false, track: { mediaStreamTrack: { id: "local-cam" } } };
    const remoteScreen = { kind: "video", source: "screen_share", isMuted: false, track: { mediaStreamTrack: { id: "remote-screen" } } };
    const remoteMutedCamera = { kind: "video", source: "camera", isMuted: true, track: { mediaStreamTrack: { id: "muted" } } };
    const local = {
      identity: "me", name: "Me", isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false,
      trackPublications: new Map<string, unknown>(),
      setMicrophoneEnabled: vi.fn(async (value: boolean) => { local.isMicrophoneEnabled = value; }),
      setCameraEnabled: vi.fn(async (value: boolean) => {
        local.isCameraEnabled = value;
        local.trackPublications.clear();
        if (value) local.trackPublications.set("cam", localCamera);
      }),
      setScreenShareEnabled: vi.fn(async (value: boolean) => { local.isScreenShareEnabled = value; }),
    };
    const remote = {
      identity: "bob", name: "Bob",
      trackPublications: new Map<string, unknown>([["screen", remoteScreen], ["cam", remoteMutedCamera]]),
    };
    const room = {
      localParticipant: local,
      remoteParticipants: new Map([["bob", remote]]),
      connect: vi.fn(async () => undefined),
      startAudio: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      on: (name: string, handler: Handler) => { handlers.set(name, (handlers.get(name) ?? new Set()).add(handler)); },
      off: (name: string, handler: Handler) => { handlers.get(name)?.delete(handler); },
    };
    const module = {
      Room: vi.fn(function () { return room; }),
      RoomEvent: {
        ParticipantConnected: "participantConnected", ParticipantDisconnected: "participantDisconnected",
        TrackSubscribed: "trackSubscribed", TrackUnsubscribed: "trackUnsubscribed",
        LocalTrackPublished: "localTrackPublished", LocalTrackUnpublished: "localTrackUnpublished",
        TrackMuted: "trackMuted", TrackUnmuted: "trackUnmuted", Disconnected: "disconnected",
      },
      Track: { Kind: { Audio: "audio", Video: "video" }, Source: { Camera: "camera", ScreenShare: "screen_share" } },
    };
    return { handlers, local, room, module: module as never };
  }

  function stubBrowser() {
    class FakeMediaStream { constructor(readonly tracks: unknown[]) {} }
    const body = { appendChild: vi.fn() };
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("document", { body });
    return body;
  }

  it("joins with the issued token, then controls microphone, camera and screen share", async () => {
    stubBrowser();
    const { local, room, module } = fakeLiveKit();
    const session = createVoiceMediaSession({
      id: "s", provider: "livekit", endpoint: "wss://voice.example.com", credential: "token", expires_at: "2026-10-05T00:00:00Z",
      state: { user_id: "u", channel_id: "c", session_id: "s", self_mute: false, self_deaf: false, self_video: false, self_stream: false, updated_at: "2026-10-05T00:00:00Z" },
    });
    expect(session).toBeInstanceOf(LiveKitVoiceMediaSession);
    const livekit = new LiveKitVoiceMediaSession("wss://voice.example.com", "token", async () => module);

    await livekit.connect(false, false);
    expect(room.connect).toHaveBeenCalledWith("wss://voice.example.com", "token");
    expect(local.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(livekit.snapshot().muted).toBe(false);

    await livekit.setMuted(true);
    expect(local.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(livekit.snapshot().muted).toBe(true);

    await livekit.setVideo(true);
    await livekit.setScreenShare(true);
    expect(local.setScreenShareEnabled).toHaveBeenCalledWith(true, { audio: true });
    const surfaces = livekit.snapshot().surfaces;
    expect(surfaces.map((surface) => [surface.id, surface.kind, surface.local])).toEqual([
      ["me:camera", "camera", true],
      ["bob:screen", "screen", false],
    ]);
    expect(livekit.snapshot()).toMatchObject({ video: true, screenShare: true });
    vi.unstubAllGlobals();
  });

  it("plays remote audio through hidden elements that deafening mutes", async () => {
    const body = stubBrowser();
    const { handlers, module } = fakeLiveKit();
    const livekit = new LiveKitVoiceMediaSession("wss://voice.example.com", "token", async () => module);
    await livekit.connect(true, false);

    const element = { muted: false, style: { display: "" }, remove: vi.fn() };
    const track = { kind: "audio", sid: "TR_1", mediaStreamTrack: { id: "a" }, attach: () => element, detach: () => [element] };
    for (const handler of handlers.get("trackSubscribed") ?? []) handler(track);
    expect(body.appendChild).toHaveBeenCalledWith(element);
    expect(element.style.display).toBe("none");

    await livekit.setDeafened(true);
    expect(element.muted).toBe(true);
    expect(livekit.snapshot().deafened).toBe(true);
    for (const handler of handlers.get("trackUnsubscribed") ?? []) handler(track);
    expect(element.remove).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("removes its listeners and playback elements when it disconnects", async () => {
    stubBrowser();
    const { handlers, room, module } = fakeLiveKit();
    const livekit = new LiveKitVoiceMediaSession("wss://voice.example.com", "token", async () => module);
    await livekit.connect(true, false);
    expect([...handlers.values()].some((set) => set.size > 0)).toBe(true);

    await livekit.disconnect();
    expect(room.disconnect).toHaveBeenCalled();
    expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
    expect(livekit.snapshot()).toMatchObject({ muted: true, video: false, surfaces: [] });
    await expect(livekit.setMuted(false)).rejects.toThrow("接続していません");
    vi.unstubAllGlobals();
  });
});
