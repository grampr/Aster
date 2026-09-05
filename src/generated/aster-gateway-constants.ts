// This file was generated from the Gateway JSON Schemas.
// Do not edit it directly.

export const GatewayOpcode = Object.freeze({
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const);

export type GatewayOpcodeValue = (typeof GatewayOpcode)[keyof typeof GatewayOpcode];

export const GatewayIntent = Object.freeze({
  GUILDS: 1,
  GUILD_MEMBERS: 2,
  GUILD_MESSAGES: 4,
  DIRECT_MESSAGES: 8,
  MESSAGE_CONTENT: 16,
  GUILD_VOICE_STATES: 32,
  GUILD_PRESENCES: 64,
  REACTIONS: 128,
  APPLICATION_INTERACTIONS: 256,
  TYPING: 512,
} as const);

export type GatewayIntentValue = (typeof GatewayIntent)[keyof typeof GatewayIntent];

export const GatewayEvent = Object.freeze({
  READY: "READY",
  RESUMED: "RESUMED",
  MESSAGE_CREATE: "MESSAGE_CREATE",
  MESSAGE_UPDATE: "MESSAGE_UPDATE",
  MESSAGE_DELETE: "MESSAGE_DELETE",
  MESSAGE_REACTION_ADD: "MESSAGE_REACTION_ADD",
  MESSAGE_REACTION_REMOVE: "MESSAGE_REACTION_REMOVE",
  TYPING_START: "TYPING_START",
  MEMBER_JOIN: "MEMBER_JOIN",
  MEMBER_UPDATE: "MEMBER_UPDATE",
  MEMBER_LEAVE: "MEMBER_LEAVE",
  PRESENCE_UPDATE: "PRESENCE_UPDATE",
  CHANNEL_CREATE: "CHANNEL_CREATE",
  CHANNEL_UPDATE: "CHANNEL_UPDATE",
  CHANNEL_DELETE: "CHANNEL_DELETE",
  READ_STATE_UPDATE: "READ_STATE_UPDATE",
  VOICE_STATE_UPDATE: "VOICE_STATE_UPDATE",
} as const);

export type GatewayEventValue = (typeof GatewayEvent)[keyof typeof GatewayEvent];
