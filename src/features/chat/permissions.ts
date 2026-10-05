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
