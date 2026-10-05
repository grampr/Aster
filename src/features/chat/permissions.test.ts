import { describe, expect, it } from "vitest";
import { effectivePermissions, hasPermission, Permission } from "./permissions";
import type { Guild, GuildMember, Role } from "../auth/types";

const guild = { id: "g", owner_id: "owner" } as Guild;
const member = (id: string, roleIds: string[] = []) => ({ user: { id }, role_ids: roleIds }) as GuildMember;
const role = (id: string, permissions: number, position: number, managed = false) => ({ id, permissions, position, managed }) as Role;
const everyone = role("everyone", Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES, 0, true);
const moderator = role("mod", Permission.MANAGE_MESSAGES | Permission.CREATE_INVITE, 2);

describe("effectivePermissions", () => {
  it("gives the owner every permission", () => {
    const bits = effectivePermissions(guild, member("owner"), [everyone]);
    for (const permission of Object.values(Permission)) expect(hasPermission(bits, permission)).toBe(true);
  });

  it("combines the default role with the assigned roles only", () => {
    const bits = effectivePermissions(guild, member("bob", ["mod"]), [everyone, moderator, role("other", Permission.MANAGE_GUILD, 3)]);
    expect(hasPermission(bits, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(bits, Permission.CREATE_INVITE)).toBe(true);
    expect(hasPermission(bits, Permission.MANAGE_GUILD)).toBe(false);
  });

  it("grants nothing without a guild or member", () => {
    expect(effectivePermissions(undefined, member("bob"), [everyone])).toBe(0);
    expect(effectivePermissions(guild, undefined, [everyone])).toBe(0);
  });

  it("requires every requested bit", () => {
    expect(hasPermission(Permission.VIEW_CHANNEL, Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES)).toBe(false);
  });
});
