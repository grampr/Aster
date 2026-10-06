import type { Guild, GuildMember, Role } from "../auth/types";

/** Permission bits from the PermissionBits schema of Aster Protocol. */
export const Permission = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  MANAGE_MESSAGES: 1 << 2,
  MANAGE_CHANNELS: 1 << 3,
  MANAGE_GUILD: 1 << 4,
  MANAGE_ROLES: 1 << 5,
  MANAGE_MEMBERS: 1 << 6,
  CREATE_INVITE: 1 << 7,
  CONNECT: 1 << 8,
  SPEAK: 1 << 9,
  STREAM: 1 << 10,
} as const;

const allPermissions = (1 << 11) - 1;

/**
 * The permissions a member holds in a guild, as Aster Server computes them: the owner has
 * everything, everyone else has the union of the default role and their assigned roles.
 * The server stays the authority; this only decides which controls to offer.
 */
export function effectivePermissions(guild: Guild | undefined, member: GuildMember | undefined, roles: Role[]): number {
  if (!guild || !member) return 0;
  if (guild.owner_id === member.user.id) return allPermissions;
  let bits = 0;
  for (const role of roles) {
    if (role.managed && role.position === 0) bits |= role.permissions;
    else if (member.role_ids.includes(role.id)) bits |= role.permissions;
  }
  return bits;
}

export function hasPermission(bits: number, permission: number): boolean {
  return (bits & permission) === permission;
}

export const permissionOptions: Array<{ bit: number; label: string; hint: string }> = [
  { bit: Permission.VIEW_CHANNEL, label: "チャンネルを見る", hint: "チャンネルとメッセージを表示" },
  { bit: Permission.SEND_MESSAGES, label: "メッセージを送信", hint: "メッセージの投稿、スレッドの作成" },
  { bit: Permission.MANAGE_MESSAGES, label: "メッセージを管理", hint: "他の人のメッセージを削除" },
  { bit: Permission.MANAGE_CHANNELS, label: "チャンネルを管理", hint: "作成・変更・削除" },
  { bit: Permission.MANAGE_GUILD, label: "コミュニティを管理", hint: "設定の変更、招待の一覧と無効化" },
  { bit: Permission.MANAGE_ROLES, label: "ロールを管理", hint: "ロールの作成・変更・割り当て" },
  { bit: Permission.MANAGE_MEMBERS, label: "メンバーを管理", hint: "メンバーの削除、他の人のニックネーム変更" },
  { bit: Permission.CREATE_INVITE, label: "招待を作成", hint: "招待コードの発行" },
  { bit: Permission.CONNECT, label: "ボイスに接続", hint: "ボイスチャンネルへの参加" },
  { bit: Permission.SPEAK, label: "発言", hint: "ボイスで音声を送信" },
  { bit: Permission.STREAM, label: "映像・画面共有", hint: "カメラと画面共有" },
];

/**
 * The position of the member's highest role. The owner outranks every role; the server lets
 * a member manage only roles below their own, so this decides which roles to offer for editing.
 */
export function highestRolePosition(guild: Guild | undefined, member: GuildMember | undefined, roles: Role[]): number {
  if (!guild || !member) return 0;
  if (guild.owner_id === member.user.id) return Number.POSITIVE_INFINITY;
  return roles.reduce((top, role) => (role.managed && role.position === 0) || member.role_ids.includes(role.id) ? Math.max(top, role.position) : top, 0);
}

/** Whether the viewer may edit a role's name, colour and position (the default role only has its permissions edited). */
export function canEditRole(role: Role, topPosition: number): boolean {
  return !role.managed && role.position < topPosition;
}

export type RoleDraft = { name: string; color: string | null; permissions: number };

/** The smallest update request that turns a role into the draft, or null when nothing changed. */
export function buildRolePatch(role: Role, draft: RoleDraft): { name?: string; color?: string | null; permissions?: number } | null {
  const patch: { name?: string; color?: string | null; permissions?: number } = {};
  if (!role.managed) {
    if (draft.name.trim() !== role.name) patch.name = draft.name.trim();
    if (draft.color !== role.color) patch.color = draft.color;
  }
  if (draft.permissions !== role.permissions) patch.permissions = draft.permissions;
  return Object.keys(patch).length === 0 ? null : patch;
}
